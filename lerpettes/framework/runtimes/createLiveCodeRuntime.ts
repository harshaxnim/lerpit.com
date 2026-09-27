import { canvasViewportPanel, type CanvasViewportSurface } from '@lerpit/framework/panels';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@lerpit/framework/types';
import { canvas2dScene } from './canvas2dScene';
import { createFrameLoop, type FrameSize, type LerpetteSceneKind } from './frameLoop';
import {
  compileCpp,
  compileJsFiles,
  type EditorFile,
  type FileEditor,
  type JsModule,
  type WasmModule
} from '@lerpit/libs/live-code/js';

/**
 * A chapter whose code is edited in the article and whose result draws in the panel.
 *
 * The author writes one `lerpit` fence in the prose naming the files and the regions
 * it shows. Everything else is inferred: the tab order is the order written, the tab
 * that opens is the first, and the compiler is chosen per file by extension. A lesson
 * says what to do with the build and nothing else.
 *
 * The editor is built into the box the fence left in this chapter's prose and stays
 * there. The box is part of the step's markup, so scrolling away just scrolls it off
 * screen and every edit survives without anything being saved or restored. Only the
 * panel is shared between chapters, so entering one re-points it at whatever that
 * chapter last built.
 */

/** What a build handed to a lesson contains. Either half is null if it had no files. */
export type LiveBuild = {
  /** The instantiated C++ exports, or null when no `.cpp` was in the box. */
  wasm: WasmModule | null;
  /** The entry JavaScript module's exports, or null when no `.js` was in the box. */
  module: JsModule | null;
};

/**
 * The contract.
 *
 * Everything the frame needs comes out of the reader's own files, so there is one
 * place to look and one place to change:
 *
 *   state              the starting state. Optional; an empty object otherwise.
 *   step(s, dt, wasm)  advance it. dt is seconds, already clamped.
 *   draw(g, s, view)   paint it. g is whatever the scene kind hands over.
 *
 * A chapter needs at least one of step and draw; everything else has a default. Both
 * are plain JavaScript even when the physics is C++: a wasm module cannot reach a
 * canvas, so `step` is where its numbers are copied out, and the module is handed in
 * as the third argument rather than wired up in the lesson where nobody can edit it.
 */
export type SceneStep<S> = (state: S, dt: number, wasm: WasmModule | null) => void;
export type SceneDraw<S, Target> = (target: Target, state: S, view: FrameSize) => void;

export type LiveCodeConfig<Target = CanvasRenderingContext2D> = {
  /** What the scene draws into. Absent means a 2D canvas context. */
  scene?: LerpetteSceneKind<Target>;
  /**
   * What to draw when the fence names no drawing file. A chapter where the picture
   * is not the point keeps it here and leaves the reader the physics.
   */
  draw?: SceneDraw<Record<string, unknown>, Target>;
  /** What the status band under the panel says once a build is running. */
  caption?: string;
  /** What the editor's status line says before the first build. */
  idleStatus?: string;
};

const CPP_FILE = /\.(cpp|cc|cxx|c)$/;
const JS_FILE = /\.(js|ts|mjs|cjs)$/;

/** Compile whatever the box holds, choosing the toolchain per file by extension. */
async function buildFiles(files: EditorFile[], log: (line: string) => void): Promise<LiveBuild> {
  const cpp = files.filter((file) => CPP_FILE.test(file.name));
  const js = files.filter((file) => JS_FILE.test(file.name));

  return {
    wasm: cpp.length > 0 ? await compileCpp(cpp, log) : null,
    module: js.length > 0 ? compileJsFiles(js) : null
  };
}

export function createLiveCodeRuntime<Target = CanvasRenderingContext2D>(
  config: LiveCodeConfig<Target> = {}
): LerpetteStepRuntime<CanvasViewportSurface> {
  const kind = (config.scene ?? canvas2dScene) as LerpetteSceneKind<Target>;

  type State = Record<string, unknown>;

  let state: State = {};
  let wasm: WasmModule | null = null;
  let step: SceneStep<State> | null = null;
  let draw: SceneDraw<State, Target> | null = null;

  /**
   * The editor whose build is on screen, so a fault at frame time has somewhere to be
   * reported. A box that has never been run is not it.
   */
  let reporter: FileEditor | null = null;
  /** Whether the build on screen has already thrown at frame time. */
  let faultedThisBuild = false;

  /**
   * Say what threw, once, and stop calling the half that did.
   *
   * A build error surfaces because it happens while the reader is waiting for it. A
   * fault inside step or draw happens sixty times a second afterwards, so it used to
   * be swallowed to avoid flooding the log, which meant the reader watched a frozen
   * panel and was told nothing at all. Reporting the first one and disabling that half
   * gives them the message without the flood.
   */
  const faulted = (half: 'step' | 'draw', error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    faultedThisBuild = true;
    if (half === 'step') {
      step = null;
    } else {
      draw = null;
    }

    reporter?.status(`Your ${half} threw: ${message}`, 'bad');
    reporter?.log(`${half}: ${message}`);
  };

  const loop = createFrameLoop(kind, (target, dt, view) => {
    if (step) {
      try {
        step(state, dt, wasm);
      } catch (error) {
        faulted('step', error);
      }
    }

    if (draw) {
      try {
        draw(target, state, view);
      } catch (error) {
        // Unwrapped, this throw propagates out of the frame callback and takes the
        // whole loop with it, so the panel stops and every later chapter is dead too.
        faulted('draw', error);
      }
    }
  });

  /**
   * Take a finished build apart into the pieces the loop drives.
   *
   * A fresh state each build, and a fresh wasm instance with it, so pressing run is
   * always a clean start rather than a continuation of whatever the last attempt left
   * behind. That is also why nothing resets the module: its statics are new.
   */
  const adopt = (build: LiveBuild) => {
    wasm = build.wasm;

    const readerState = build.module?.state;
    state = typeof readerState === 'function' ? (readerState as () => State)() : { ...((readerState as State) ?? {}) };

    const readerStep = build.module?.step;
    step = typeof readerStep === 'function' ? (readerStep as SceneStep<State>) : null;

    const readerDraw = build.module?.draw;
    draw = typeof readerDraw === 'function' ? (readerDraw as SceneDraw<State, Target>) : (config.draw ?? null);

    if (!step && !draw) {
      throw new Error('Nothing here exports step or draw, so there is nothing to run.');
    }
  };

  const compileAndRun = async (editor: FileEditor, files: EditorFile[], ctx: LerpetteRuntimeContext) => {
    editor.log(null);
    editor.status('Compiling…', 'busy');

    const started = performance.now();
    reporter = editor;
    faultedThisBuild = false;
    adopt(await buildFiles(files, (line) => editor.log(line)));
    // One frame now, before handing over to the animation clock, so the panel is
    // correct the instant a build lands rather than at whatever moment the browser
    // next schedules a frame.
    loop.sync(ctx);
    loop.start(ctx);

    if (config.caption) {
      ctx.setCaption(config.caption);
    }

    // The first frame runs inside loop.sync above, so a fault has already been
    // reported by the time we get here. Announcing success now would paint over it.
    if (faultedThisBuild) {
      return;
    }

    const seconds = (performance.now() - started) / 1000;
    editor.status(
      seconds < 1 ? `Running. Built in ${Math.round(seconds * 1000)}ms.` : `Running. Built in ${seconds.toFixed(1)}s.`,
      'ok'
    );
  };

  return {
    panel: canvasViewportPanel,

    async mount(ctx) {
      // The boxes in this section were built when the page loaded, by the editor
      // layer, and they outlive this runtime. Claiming them is what points their run
      // button at this chapter's panel; building our own here would replace editors a
      // reader may already have typed into.
      ctx.editors?.claim(ctx.currentStepId, (editor, files) => compileAndRun(editor, files, ctx));

      // The first box builds on arrival, so the panel is never dead on a chapter the
      // reader has only scrolled into.
      ctx.editors?.editorsFor(ctx.currentStepId)[0]?.run();
    },

    enter(ctx) {
      // A chapter that has built keeps drawing its own result; one that has not shows
      // an empty panel rather than the previous chapter still running.
      if (step || draw) {
        loop.start(ctx);
      } else {
        loop.sync(ctx);
      }
    },

    exit() {
      loop.stop();
    },

    resize(ctx) {
      loop.sync(ctx);
    },

    dispose(ctx) {
      loop.release(ctx);
      // The editors stay on the page; only this chapter's claim on them goes.
      ctx.editors?.release(ctx.currentStepId);
      reporter = null;
      step = null;
      draw = null;
    }
  };
}
