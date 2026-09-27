import { createPanelStack, type MountedPanel, type PanelStack } from '@lerpit/framework/panels/panelStack';
import type { LerpetteCtx, ModelExports, PointerState, SceneState, ViewExports } from '@lerpit/framework/panels/contract';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@lerpit/framework/types';
import { compileCpp, compileJsFiles, type EditorFile, type FileEditor, type WasmModule } from '@lerpit/libs/live-code/js';

/**
 * A chapter: one model, any number of panels, and an editor wherever the prose left a
 * fence.
 *
 * The three are independent, which is the whole point of this file. A chapter may have
 * panels and no editor, an editor and no panels, both, or neither. Nothing here decides
 * what fills the right column; the document does, and the panels arrive already built.
 *
 * What this owns is the clock and the wiring between them: advance the model once per
 * frame, then hand the same state to every panel that wants drawing.
 */

const CPP_FILE = /\.(cpp|cc|cxx|c)$/;
const JS_FILE = /\.(js|ts|mjs|cjs)$/;

/** A frame longer than this is a gap, not a slow frame. Integrating it throws a scene. */
const MAX_FRAME_SECONDS = 1 / 30;

export type ChapterConfig = {
  /** What the band under the panel says once a build is running. */
  caption?: string;
  /** What the editor's status line says before the first build. */
  idleStatus?: string;
};

function clampDelta(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }

  return Math.min(elapsedMs / 1000, MAX_FRAME_SECONDS);
}

export function createChapterRuntime(panelNames: readonly string[], config: ChapterConfig = {}): LerpetteStepRuntime {
  let stack: PanelStack | null = null;
  let state: SceneState = {};
  let model: ModelExports = {};
  let views = new Map<string, ViewExports<unknown>>();
  let wasm: WasmModule | null = null;

  let raf = 0;
  let running = false;
  let lastMs = 0;
  let startedMs = 0;
  /** Set whenever the model moved, so a `change` panel knows it has work to do. */
  let dirty = true;

  let reporter: FileEditor | null = null;
  let faulted = false;

  /** Pointer state per panel, kept by the listeners the stack's boxes carry. */
  const pointers = new Map<string, PointerState>();
  const idlePointer: PointerState = { x: 0, y: 0, down: false, inside: false };

  const fault = (where: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    faulted = true;
    reporter?.status(`Your ${where} threw: ${message}`, 'bad');
    reporter?.log(`${where}: ${message}`);
  };

  const ctxFor = (mounted: MountedPanel | null): LerpetteCtx => ({
    wasm,
    view: mounted && stack ? stack.sizeOf(mounted) : { width: 0, height: 0, dpr: 1 },
    input: mounted ? pointers.get(mounted.panel.name) ?? idlePointer : idlePointer,
    time: startedMs ? (performance.now() - startedMs) / 1000 : 0
  });

  const drawPanel = (mounted: MountedPanel) => {
    const view = views.get(mounted.panel.name);
    if (!view?.draw || !stack) {
      return;
    }

    const size = stack.sizeOf(mounted);
    if (size.width === 0 || size.height === 0) {
      return;
    }

    mounted.panel.resize?.(mounted.target as never, size);
    mounted.panel.begin?.(mounted.target as never, size);
    try {
      view.draw(mounted.target, state, ctxFor(mounted));
    } catch (error) {
      // Unwrapped, this throw takes the loop with it and every later chapter dies too.
      views.set(mounted.panel.name, { ...view, draw: undefined });
      fault(`${mounted.panel.name}.draw`, error);
    }
    mounted.panel.end?.(mounted.target as never, size);
  };

  /** One pass: advance the model, then show it wherever it is being shown. */
  const tick = (dt: number) => {
    if (model.step && dt > 0) {
      try {
        model.step(state, dt, ctxFor(stack?.active() ?? null));
        dirty = true;
      } catch (error) {
        model.step = undefined;
        fault('step', error);
      }
    }

    const active = stack?.active();
    if (!active) {
      return;
    }

    // Only the panel on screen is drawn. A tab nobody is looking at costs nothing, and
    // is brought up to date the moment it is chosen.
    if (active.panel.cadence === 'frame' || dirty) {
      drawPanel(active);
    }

    dirty = false;
  };

  const frame = (nowMs: number) => {
    if (!running) {
      return;
    }

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

  const start = () => {
    stop();
    running = true;
    lastMs = 0;
    raf = window.requestAnimationFrame(frame);
  };

  function stop() {
    running = false;
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const watchPointer = (mounted: MountedPanel) => {
    const name = mounted.panel.name;
    pointers.set(name, { x: 0, y: 0, down: false, inside: false });

    const read = (event: PointerEvent) => {
      const at = mounted.panel.locate?.(mounted.target as never, event.clientX, event.clientY);
      const box = mounted.box.getBoundingClientRect();
      const current = pointers.get(name)!;
      current.x = at ? at.x : event.clientX - box.left;
      current.y = at ? at.y : event.clientY - box.top;
      // A `change` panel would otherwise not notice a drag at all.
      dirty = true;
    };

    mounted.box.addEventListener('pointermove', read);
    mounted.box.addEventListener('pointerdown', (event) => {
      pointers.get(name)!.down = true;
      read(event);
    });
    mounted.box.addEventListener('pointerup', () => {
      pointers.get(name)!.down = false;
      dirty = true;
    });
    mounted.box.addEventListener('pointerenter', () => {
      pointers.get(name)!.inside = true;
    });
    mounted.box.addEventListener('pointerleave', () => {
      const current = pointers.get(name)!;
      current.inside = false;
      current.down = false;
      dirty = true;
    });
  };

  /** Split a build's exports into the one model and the per-panel views. */
  const adopt = (exports: Record<string, unknown>) => {
    model = {
      state: exports.state as SceneState | undefined,
      setup: exports.setup as ModelExports['setup'],
      step: exports.step as ModelExports['step']
    };

    views = new Map();
    for (const mounted of stack?.panels ?? []) {
      const view = exports[mounted.panel.name];
      if (view && typeof view === 'object') {
        views.set(mounted.panel.name, view as ViewExports<unknown>);
      }
    }

    // A fresh state each build, so pressing run is a clean start rather than a
    // continuation of whatever the last attempt left behind.
    state = { ...(model.state ?? {}) };
    startedMs = performance.now();

    if (model.setup) {
      try {
        model.setup(state, ctxFor(stack?.active() ?? null));
      } catch (error) {
        fault('setup', error);
      }
    }

    for (const mounted of stack?.panels ?? []) {
      const view = views.get(mounted.panel.name);
      if (!view?.build) {
        continue;
      }

      try {
        view.build(mounted.target, ctxFor(mounted));
      } catch (error) {
        fault(`${mounted.panel.name}.build`, error);
      }
    }

    dirty = true;
  };

  const compileAndRun = async (editor: FileEditor, files: EditorFile[]) => {
    editor.log(null);
    editor.status('Compiling…', 'busy');

    const started = performance.now();
    reporter = editor;
    faulted = false;

    const cpp = files.filter((file) => CPP_FILE.test(file.name));
    const js = files.filter((file) => JS_FILE.test(file.name));

    wasm = cpp.length > 0 ? await compileCpp(cpp, (line) => editor.log(line)) : null;
    adopt(js.length > 0 ? (compileJsFiles(js) as Record<string, unknown>) : {});

    tick(0);
    start();

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
    async mount(ctx: LerpetteRuntimeContext) {
      stack = await createPanelStack({ ...ctx }, panelNames, (shown) => {
        // A tab that was not being drawn while hidden is stale the moment it appears.
        drawPanel(shown);
      });

      stack.panels.forEach(watchPointer);

      // Always written, never only when there is something to say: the caption band
      // belongs to the slot and survives a chapter change, so a chapter that says
      // nothing would otherwise leave the previous one's sentence on screen. A name
      // the registry does not know wins over the chapter's own caption, because an
      // author who mistyped a panel needs telling more than a reader needs the blurb.
      ctx.setCaption(
        stack.unknown.length > 0
          ? `This chapter asks for a panel called "${stack.unknown[0]}", which does not exist.`
          : config.caption ?? ''
      );

      // The boxes are already on the page. This only says where run builds to.
      ctx.editors?.claim(ctx.currentStepId, (editor, files) => compileAndRun(editor, files));

      // The first box builds on arrival, so a chapter is never dead on one the reader
      // has only scrolled into. A chapter with no editor has nothing to build.
      ctx.editors?.editorsFor(ctx.currentStepId)[0]?.run();
    },

    enter() {
      start();
    },

    exit() {
      stop();
    },

    resize() {
      dirty = true;
      const active = stack?.active();
      if (active) {
        drawPanel(active);
      }
    },

    dispose(ctx) {
      stop();
      // The editors themselves stay: they are the page's, not this runtime's.
      ctx.editors?.release(ctx.currentStepId);
      stack?.destroy();
      stack = null;
      reporter = null;
      views = new Map();
      model = {};
    }
  };
}
