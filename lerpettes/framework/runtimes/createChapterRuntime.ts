import type { MountedPanel, PanelStack } from '../panels/panelStack';
import type { PanelScope } from '../panels/panel';
import {
  MODEL_NAMES,
  type ChapterDefinition,
  type LerpetteCtx,
  type PointerState,
  type SceneState,
  type ViewExports,
  type WasmExports
} from '../panels/contract';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '../types';
import { loadModule } from '../wasm/loadModule';
import { clampDelta } from './frameLoop';
import { byBuild } from '@lerpit/libs/live-code/js/languages';
import type { EditorFile, FileEditor } from '@lerpit/libs/live-code/js';

/**
 * A chapter: one model, a view per panel, and an editor wherever the prose left a fence.
 *
 * This is the only runtime most chapters ever run under. A chapter's code reaches it
 * one of two ways, and both are the same shape (see panels/contract.ts):
 *
 *   module source  `createStage({...})` in code/<id>/js/index.ts, bundled with the site
 *   editor source  the files a `lerpit` fence names, built in the reader's tab
 *
 * When a chapter has both, a build replaces the module's names one by one, so a lesson
 * can ship a working chapter and still hand the reader one function to rewrite.
 *
 * What this owns is the clock and the wiring: one requestAnimationFrame loop, `dt` in
 * seconds and already clamped, the model advanced once per frame and the same state
 * handed to whichever panel is on screen. The panels arrive built; the stage chrome
 * (controls, readings, caption, restart) arrives as ctx.stage. Nothing here decides
 * what fills the column.
 */

type Model<S extends SceneState = SceneState> = Pick<ChapterDefinition<S>, 'setup' | 'step' | 'dispose'>;

/** The names of a definition that are code rather than configuration. */
function codeOf(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(source)) {
    if (name === 'state' || name === 'setup' || name === 'step' || name === 'dispose' || name === 'wasm') out[name] = value;
    else if (!(MODEL_NAMES as readonly string[]).includes(name) && value && typeof value === 'object') out[name] = value;
  }
  return out;
}

/** A fresh copy of the starting state, so one run never sees what the last one left. */
function freshState(source: unknown): SceneState {
  if (typeof source === 'function') return (source as () => SceneState)() ?? {};
  if (!source || typeof source !== 'object') return {};
  try {
    return structuredClone(source as SceneState);
  } catch {
    // Something uncloneable in it (a class instance, a function): a shallow copy, as before.
    return { ...(source as SceneState) };
  }
}

export function createChapterRuntime<S extends SceneState = SceneState>(
  definition: ChapterDefinition<S> = {} as ChapterDefinition<S>
): LerpetteStepRuntime<any> {
  const def = definition as ChapterDefinition;
  const moduleCode = codeOf(def as Record<string, unknown>);
  const hasModuleCode = Object.keys(moduleCode).some((name) => name !== 'wasm') || Boolean(def.wasm);

  let ctx: LerpetteRuntimeContext<any> | null = null;
  let stack: PanelStack | null = null;
  /** What each panel's view is handed: the panel's own target, or this chapter's scope of it. */
  const targets = new Map<string, unknown>();
  const scopes = new Map<string, PanelScope<unknown>>();

  let state: SceneState = {};
  let model: Model = {};
  let views = new Map<string, ViewExports>();
  let wasm: WasmExports | null = null;
  let running = false;
  let entered = false;
  let raf = 0;
  let lastMs = 0;
  let time = 0;
  /** Set whenever the model moved, so a `change` panel knows it has work to do. */
  let dirty = true;
  /** Bumped by every run, so an older run still awaiting its setup knows to give up. */
  let runToken = 0;
  /** Whether a run has started, i.e. whether there is anything to end. */
  let live = false;
  /** What restart repeats: the last build, or the module again. */
  let rerun: (() => void) | null = null;

  let reporter: FileEditor | null = null;
  let faulted = false;
  let listeners: AbortController | null = null;
  const pointers = new Map<string, PointerState>();
  const idlePointer: PointerState = { x: 0, y: 0, down: false, inside: false };

  const fault = (where: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    faulted = true;
    if (reporter) {
      reporter.status(`Your ${where} threw: ${message}`, 'bad');
      reporter.log(`${where}: ${message}`);
    } else {
      // A module chapter has no editor to report in, so it says so where the reader looks.
      console.error(`[lerpit] ${ctx?.currentStepId ?? 'chapter'}: ${where} threw`, error);
      ctx?.stage.caption(`This chapter's ${where} threw: ${message}`);
    }
  };

  const ctxFor = (mounted: MountedPanel | null): LerpetteCtx => {
    const stage = ctx!.stage;
    const size = mounted && stack ? stack.sizeOf(mounted) : stack?.active() ? stack.sizeOf(stack.active()!) : { width: 0, height: 0, dpr: 1 };
    return {
      wasm,
      view: { ...size, halfWidth: 1, halfHeight: size.width && size.height ? size.height / size.width : 1 },
      input: mounted ? pointers.get(mounted.panel.name) ?? idlePointer : idlePointer,
      time,
      controls: (options) => stage.controls(options),
      monitors: () => stage.monitors(),
      caption: (value) => stage.caption(value)
    };
  };

  const drawPanel = (mounted: MountedPanel) => {
    if (!stack || !live) return;
    const size = stack.sizeOf(mounted);
    if (size.width === 0 || size.height === 0) return;

    const target = targets.get(mounted.panel.name) as never;
    const view = views.get(mounted.panel.name);
    mounted.panel.resize?.(target, size);
    mounted.panel.begin?.(target, size);
    if (view?.draw) {
      try {
        view.draw(target, state, ctxFor(mounted));
      } catch (error) {
        // Unwrapped, this throw takes the loop with it and the panel freezes silently.
        views.set(mounted.panel.name, { ...view, draw: undefined });
        fault(`${mounted.panel.name}.draw`, error);
      }
    }
    mounted.panel.end?.(target, size);
  };

  /** One frame: advance the model, show it on the panel on screen, sample the readings. */
  const tick = (dt: number) => {
    if (dt > 0 && live) {
      time += dt;
      if (model.step) {
        try {
          model.step(state, dt, ctxFor(stack?.active() ?? null));
          dirty = true;
        } catch (error) {
          model.step = undefined;
          fault('step', error);
        }
      }
    }

    const active = stack?.active();
    if (active && (active.panel.cadence === 'frame' || dirty)) drawPanel(active);
    dirty = false;
    if (live) ctx?.stage.tick(performance.now());
  };

  const frame = (nowMs: number) => {
    if (!running) return;
    if (document.hidden) {
      // Hidden tabs throttle rather than stop, which burns battery drawing what nobody
      // is looking at. The clock is reset so returning is not one enormous step.
      lastMs = 0;
      raf = window.requestAnimationFrame(frame);
      return;
    }
    const dt = lastMs ? clampDelta(nowMs - lastMs) : 0;
    lastMs = nowMs;
    tick(dt);
    raf = window.requestAnimationFrame(frame);
  };

  function start() {
    stop();
    running = true;
    lastMs = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const watchPointers = (panels: MountedPanel[], signal: AbortSignal) => {
    for (const mounted of panels) {
      const name = mounted.panel.name;
      const pointer: PointerState = { x: 0, y: 0, down: false, inside: false };
      pointers.set(name, pointer);
      const read = (event: PointerEvent) => {
        const at = mounted.panel.locate?.(mounted.target as never, event.clientX, event.clientY);
        const box = mounted.box.getBoundingClientRect();
        pointer.x = at ? at.x : event.clientX - box.left;
        pointer.y = at ? at.y : event.clientY - box.top;
        // A `change` panel would otherwise not notice a drag at all.
        dirty = true;
      };
      const options = { signal };
      mounted.box.addEventListener('pointermove', read, options);
      mounted.box.addEventListener('pointerdown', (event) => ((pointer.down = true), read(event)), options);
      mounted.box.addEventListener('pointerup', () => ((pointer.down = false), (dirty = true)), options);
      mounted.box.addEventListener('pointerenter', () => (pointer.inside = true), options);
      mounted.box.addEventListener('pointerleave', () => ((pointer.inside = false), (pointer.down = false), (dirty = true)), options);
    }
  };

  /** End the run on screen: its own dispose, its scenes, its cards (choices kept). */
  const endRun = () => {
    if (!live) return;
    live = false;
    if (model.dispose) {
      try {
        model.dispose(state, ctxFor(null));
      } catch (error) {
        fault('dispose', error);
      }
    }
    scopes.forEach((scope) => scope.clear());
    ctx?.stage.reset(true);
  };

  /**
   * Start a run from a set of exports: the model, the views, a fresh state, setup, then
   * each view's build. `builtWasm` is the editor's module; undefined means load the
   * definition's prebuilt one, if it has one.
   */
  const run = async (code: Record<string, unknown>, builtWasm?: WasmExports | null) => {
    const token = ++runToken;
    endRun();

    let nextWasm: WasmExports | null = builtWasm ?? null;
    if (builtWasm === undefined && typeof code.wasm === 'function') {
      try {
        nextWasm = await loadModule(code.wasm as () => Promise<unknown>);
      } catch (error) {
        fault('wasm', error);
        return;
      }
      if (token !== runToken) return;
    }

    wasm = nextWasm;
    model = {
      setup: typeof code.setup === 'function' ? (code.setup as Model['setup']) : undefined,
      step: typeof code.step === 'function' ? (code.step as Model['step']) : undefined,
      dispose: typeof code.dispose === 'function' ? (code.dispose as Model['dispose']) : undefined
    };
    views = new Map();
    for (const mounted of stack?.panels ?? []) {
      const view = code[mounted.panel.name];
      if (view && typeof view === 'object') views.set(mounted.panel.name, view as ViewExports);
    }

    state = freshState(code.state);
    time = 0;
    live = true;

    if (model.setup) {
      try {
        await model.setup(state, ctxFor(null));
      } catch (error) {
        fault('setup', error);
      }
      if (token !== runToken) return;
    }

    for (const mounted of stack?.panels ?? []) {
      const view = views.get(mounted.panel.name);
      if (!view?.build) continue;
      try {
        await view.build(targets.get(mounted.panel.name), state, ctxFor(mounted));
      } catch (error) {
        fault(`${mounted.panel.name}.build`, error);
      }
      if (token !== runToken) return;
    }

    ctx?.stage.settle();
    const restartable = def.restart ?? Boolean(model.step);
    ctx?.stage.restartable(restartable ? () => rerun?.() : null);
    dirty = true;
    tick(0);
  };

  const runModule = async () => {
    reporter = null;
    faulted = false;
    rerun = () => void runModule();
    await run(moduleCode);
  };

  const compileAndRun = async (editor: FileEditor, files: EditorFile[]) => {
    editor.log(null);
    editor.status('Compiling…', 'busy');
    const started = performance.now();
    reporter = editor;
    faulted = false;

    // The compilers load on the first build, not with the page: a reader who never
    // presses run never downloads a TypeScript compiler or the C++ toolchain's glue.
    const split = byBuild(files);
    const builtWasm =
      split.wasm.length > 0
        ? await (await import('@lerpit/libs/live-code/js/compileCpp')).compileCpp(split.wasm, (line) => editor.log(line))
        : null;
    const exports =
      split.module.length > 0
        ? ((await import('@lerpit/libs/live-code/js/compileJs')).compileJsFiles(split.module) as Record<string, unknown>)
        : {};

    // Restart rebuilds rather than rerunning the old instance: a C++ module keeps its
    // statics, so the only clean start for compiled code is a fresh one.
    rerun = () => void editor.run();
    await run({ ...moduleCode, ...exports }, builtWasm);
    if (entered && !running) start();

    if (faulted) {
      // The first frame already ran, so announcing success now would paint over it.
      return;
    }
    const seconds = (performance.now() - started) / 1000;
    editor.status(
      seconds < 1 ? `Running. Built in ${Math.round(seconds * 1000)}ms.` : `Running. Built in ${seconds.toFixed(1)}s.`,
      'ok'
    );
  };

  return {
    panels: def.panels,

    async mount(next) {
      ctx = next;
      stack = next.panels;
      for (const mounted of stack.panels) {
        const scope = mounted.panel.scope?.(mounted.target as never) as PanelScope<unknown> | undefined;
        if (scope) scopes.set(mounted.panel.name, scope);
        targets.set(mounted.panel.name, scope ? scope.target : mounted.target);
      }

      listeners = new AbortController();
      watchPointers(stack.panels, listeners.signal);

      // Always written, never only when there is something to say: a chapter that says
      // nothing must not inherit the last one's sentence. An unknown panel name wins
      // over the chapter's own caption, because the author needs telling more.
      next.stage.caption(
        stack.unknown.length > 0
          ? `This chapter asks for a panel called "${stack.unknown[0]}", which does not exist.`
          : def.caption ?? ''
      );

      // The boxes are already on the page. This only says where run builds to.
      next.editors?.claim(next.currentStepId, (editor, files) => compileAndRun(editor, files));

      if (hasModuleCode) await runModule();

      // The first box builds on arrival, so a chapter is never dead on one the reader
      // has only scrolled into. Not awaited: run activates the chapter first, and this
      // is that activation.
      void next.editors?.editorsFor(next.currentStepId)[0]?.run();
    },

    enter(next) {
      ctx = next;
      entered = true;
      scopes.forEach((scope) => scope.focus());
      dirty = true;
      tick(0);
      start();
    },

    exit() {
      entered = false;
      stop();
      scopes.forEach((scope) => scope.blur());
    },

    resume() {
      // The loop pauses itself while the tab is hidden; this only makes sure it is
      // running again if it should be. Nothing is rebuilt.
      if (entered && !running) start();
    },

    resize() {
      dirty = true;
      const active = stack?.active();
      if (active) drawPanel(active);
    },

    dispose(next) {
      stop();
      runToken += 1;
      endRun();
      // The editors themselves stay: they are the page's, not this runtime's.
      next.editors?.release(next.currentStepId);
      listeners?.abort();
      listeners = null;
      scopes.forEach((scope) => scope.release());
      scopes.clear();
      targets.clear();
      pointers.clear();
      stack = null;
      ctx = null;
      entered = false;
      reporter = null;
      rerun = null;
      views = new Map();
      model = {};
      wasm = null;
    }
  };
}
