import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The chapter runtime without a browser: a fake panel stack, a fake stage, and a frame
 * clock the test advances by hand. What is checked is the contract an author relies on
 * (fresh state per run, setup before build before the first draw, dt in seconds, only
 * the panel on screen drawn, faults reported once) and the lifecycle the player relies
 * on (enter/exit/resume/dispose, restart, scopes).
 */

// The runtime imports each compiler on its first build, from its own module.
vi.mock('@lerpit/libs/live-code/js/compileCpp', () => ({
  compileCpp: vi.fn(async () => ({ fromCpp: true }))
}));
vi.mock('@lerpit/libs/live-code/js/compileJs', () => ({
  compileJsFiles: vi.fn((files: Array<{ name: string; text: string }>) => {
    // A "build" in these tests is a module object smuggled in through the file text.
    return (globalThis as Record<string, unknown>).__nextBuild ?? {};
  })
}));

const { createChapterRuntime } = await import('../../runtimes/createChapterRuntime');

type Frame = (now: number) => void;
let frames: Frame[] = [];
let now = 0;

function runFrame(ms = 16) {
  now += ms;
  const pending = frames;
  frames = [];
  pending.forEach((fn) => fn(now));
}

beforeEach(() => {
  frames = [];
  now = 1000;
  vi.stubGlobal('window', {
    requestAnimationFrame: (fn: Frame) => (frames.push(fn), frames.length),
    cancelAnimationFrame: () => {
      frames = [];
    }
  });
  vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal('performance', { now: () => now });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).__nextBuild;
});

type Drawn = { panel: string; target: unknown; state: Record<string, unknown> };

function fakePanel(name: string, options: { cadence?: 'frame' | 'change'; scoped?: boolean } = {}) {
  const log: string[] = [];
  const target = { name, shared: true };
  const panel = {
    name,
    label: name,
    hostClass: '',
    cadence: options.cadence ?? 'frame',
    members: { required: ['draw'], optional: ['build'] },
    create: () => target,
    begin: () => log.push(`${name}.begin`),
    end: () => log.push(`${name}.end`),
    resize: () => undefined,
    ...(options.scoped
      ? {
          scope: () => ({
            target: { name, scoped: true },
            focus: () => log.push(`${name}.focus`),
            blur: () => log.push(`${name}.blur`),
            clear: () => log.push(`${name}.clear`),
            release: () => log.push(`${name}.release`)
          })
        }
      : {})
  };
  const box = { addEventListener: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  return { mounted: { panel, target, box }, log };
}

function fakeStack(panels: ReturnType<typeof fakePanel>[], unknown: string[] = []) {
  let active = panels[0]?.mounted ?? null;
  return {
    names: panels.map((p) => p.mounted.panel.name),
    panels: panels.map((p) => p.mounted),
    unknown,
    active: () => active,
    show: (name: string) => {
      active = panels.find((p) => p.mounted.panel.name === name)?.mounted ?? active;
    },
    sizeOf: () => ({ width: 300, height: 200, dpr: 2 }),
    destroy: vi.fn()
  };
}

function fakeStage() {
  return {
    captions: [] as string[],
    restart: null as null | (() => void),
    pause: null as null | ((paused: boolean) => void),
    resets: [] as boolean[],
    settled: 0,
    ticks: 0,
    controls: vi.fn(() => ({ pane: true })),
    monitors: vi.fn(() => ({ readings: true })),
    caption(value: string) {
      this.captions.push(value);
    },
    pin: vi.fn(),
    restartable(run: (() => void) | null) {
      this.restart = run;
    },
    pausable(run: ((paused: boolean) => void) | null) {
      this.pause = run;
    },
    settle() {
      this.settled += 1;
    },
    tick() {
      this.ticks += 1;
    },
    show: vi.fn(),
    hide: vi.fn(),
    reset(keep: boolean) {
      this.resets.push(keep);
    }
  };
}

function fakeEditors() {
  const runs = new Map<string, (editor: unknown, files: unknown[]) => Promise<void>>();
  const editor = {
    statuses: [] as Array<[string, string]>,
    logs: [] as Array<string | null>,
    status(text: string, kind: string) {
      this.statuses.push([text, kind]);
    },
    log(line: string | null) {
      this.logs.push(line);
    },
    run: vi.fn(async () => {
      await runs.get('step')?.(editor, [{ name: 'src/index.js', text: '' }]);
    })
  };
  return {
    editor,
    layer: {
      editorsFor: (id: string) => (id === 'step' ? [editor] : []),
      claim: (id: string, run: (editor: unknown, files: unknown[]) => Promise<void>) => runs.set(id, run),
      release: (id: string) => runs.delete(id),
      destroy: vi.fn()
    }
  };
}

function context(stack: ReturnType<typeof fakeStack>, stage = fakeStage(), editors?: ReturnType<typeof fakeEditors>['layer']) {
  return {
    host: {} as HTMLElement,
    tabs: {} as HTMLElement,
    lessonTitle: 'Test',
    shared: new Map(),
    setCaption: (v: string) => stage.caption(v),
    currentStepId: 'step',
    resolveAssetUrl: (p: string) => p,
    surface: stack.panels[0]?.target,
    panels: stack as never,
    stage: stage as never,
    codeHosts: [],
    codePath: 'c/m/code/step',
    editors: editors as never
  };
}

describe('a module chapter', () => {
  it('runs setup, then build, then draws the panel on screen', async () => {
    const order: string[] = [];
    const a = fakePanel('viewport2d');
    const stack = fakeStack([a]);
    const runtime = createChapterRuntime({
      state: { x: 1 },
      setup: (s) => {
        order.push(`setup x=${s.x}`);
      },
      viewport2d: {
        build: () => {
          order.push('build');
        },
        draw: (_g: unknown, s: { x: number }) => order.push(`draw x=${s.x}`)
      }
    });

    await runtime.mount(context(stack));
    expect(order).toEqual(['setup x=1', 'build', 'draw x=1']);
  });

  it('hands step dt in seconds, clamped, and advances ctx.time', async () => {
    const seen: Array<[number, number]> = [];
    const stack = fakeStack([fakePanel('canvas')]);
    const runtime = createChapterRuntime({
      step: (_s, dt, ctx) => seen.push([dt, ctx.time]),
      canvas: { draw: () => undefined }
    });
    const ctx = context(stack);
    await runtime.mount(ctx);
    runtime.enter?.(ctx);

    runFrame(16); // the first frame primes the clock
    runFrame(16);
    runFrame(500); // a gap, not a slow frame

    expect(seen).toHaveLength(2);
    expect(seen[0][0]).toBeCloseTo(0.016);
    expect(seen[1][0]).toBeCloseTo(1 / 30);
    expect(seen[1][1]).toBeCloseTo(0.016 + 1 / 30);
  });

  it('starts every run from a fresh copy of state', async () => {
    const stack = fakeStack([fakePanel('canvas')]);
    const stage = fakeStage();
    const starts: number[] = [];
    const runtime = createChapterRuntime({
      state: { hits: [] as number[] },
      setup: (s) => {
        starts.push(s.hits.length);
        s.hits.push(1);
      },
      step: () => undefined
    });
    await runtime.mount(context(stack, stage));
    expect(stage.restart).toBeTypeOf('function');
    stage.restart!();
    await Promise.resolve();
    await Promise.resolve();
    expect(starts).toEqual([0, 0]);
  });

  it('keeps the reader’s choices across a restart', async () => {
    const stack = fakeStack([fakePanel('canvas')]);
    const stage = fakeStage();
    const runtime = createChapterRuntime({ step: () => undefined });
    await runtime.mount(context(stack, stage));
    stage.restart!();
    await Promise.resolve();
    expect(stage.resets).toEqual([true]);
    expect(stage.settled).toBe(2);
  });

  it('offers restart only to a chapter that moves, unless told', async () => {
    const still = fakeStage();
    await createChapterRuntime({ canvas: { draw: () => undefined } }).mount(context(fakeStack([fakePanel('canvas')]), still));
    expect(still.restart).toBeNull();

    const refused = fakeStage();
    await createChapterRuntime({ restart: false, step: () => undefined }).mount(context(fakeStack([fakePanel('canvas')]), refused));
    expect(refused.restart).toBeNull();
  });

  it('offers pause to any chapter that moves, even with restart turned off', async () => {
    const still = fakeStage();
    await createChapterRuntime({ canvas: { draw: () => undefined } }).mount(context(fakeStack([fakePanel('canvas')]), still));
    expect(still.pause).toBeNull();

    const steppingNoRestart = fakeStage();
    await createChapterRuntime({ restart: false, step: () => undefined }).mount(context(fakeStack([fakePanel('canvas')]), steppingNoRestart));
    expect(steppingNoRestart.pause).toBeTypeOf('function');
    expect(steppingNoRestart.restart).toBeNull();
  });

  it('pausing stops step from being called, and resuming continues it', async () => {
    const seen: number[] = [];
    const stack = fakeStack([fakePanel('canvas')]);
    const stage = fakeStage();
    const runtime = createChapterRuntime({ step: () => seen.push(1), canvas: { draw: () => undefined } });
    const ctx = context(stack, stage);
    await runtime.mount(ctx);
    runtime.enter?.(ctx);

    runFrame(16); // primes the clock
    runFrame(16); // a real step, so the loop is warmed up
    expect(seen).toHaveLength(1);

    stage.pause!(true);
    runFrame(16);
    runFrame(16);
    expect(seen).toHaveLength(1); // frozen: still just the one step from before

    stage.pause!(false);
    runFrame(16); // primes again, since the clock was reset while paused
    runFrame(16);
    expect(seen).toHaveLength(2);
  });

  it('a restart always resumes, even if the chapter was paused', async () => {
    const seen: number[] = [];
    const stack = fakeStack([fakePanel('canvas')]);
    const stage = fakeStage();
    const runtime = createChapterRuntime({ step: () => seen.push(1), canvas: { draw: () => undefined } });
    const ctx = context(stack, stage);
    await runtime.mount(ctx);
    runtime.enter?.(ctx);

    runFrame(16);
    runFrame(16);
    expect(seen).toHaveLength(1);

    stage.pause!(true);
    runFrame(16);
    expect(seen).toHaveLength(1);

    stage.restart!();
    await Promise.resolve();
    await Promise.resolve();

    runFrame(16); // primes again, picking up where the ongoing loop's clock left off
    runFrame(16);
    expect(seen).toHaveLength(2);
  });

  it('draws only the panel on screen, and a change panel only when the state moved', async () => {
    const draws: string[] = [];
    const view = fakePanel('viewport2d');
    const table = fakePanel('table', { cadence: 'change' });
    const stack = fakeStack([view, table]);
    const runtime = createChapterRuntime({
      viewport2d: { draw: () => draws.push('viewport2d') },
      table: { draw: () => draws.push('table') }
    });
    const ctx = context(stack);
    await runtime.mount(ctx);
    runtime.enter?.(ctx);
    draws.length = 0;

    runFrame();
    runFrame();
    expect(draws).toEqual(['viewport2d', 'viewport2d']);

    stack.show('table');
    draws.length = 0;
    runFrame();
    runFrame();
    // No step, so nothing moved after the first frame on the table.
    expect(draws.length).toBeLessThanOrEqual(1);
  });

  it('reports a throwing step once, in the caption, and stops calling it', async () => {
    const stage = fakeStage();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const runtime = createChapterRuntime({
      step: () => {
        calls += 1;
        throw new Error('boom');
      }
    });
    const ctx = context(fakeStack([fakePanel('canvas')]), stage);
    await runtime.mount(ctx);
    runtime.enter?.(ctx);
    runFrame();
    runFrame();
    runFrame();
    expect(calls).toBe(1);
    expect(stage.captions.at(-1)).toContain('boom');
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('loads prebuilt wasm once and hands it over as ctx.wasm', async () => {
    const instance = { answer: () => 42 };
    const importer = vi.fn(async () => ({ default: async () => instance }));
    let seen: unknown = null;
    const runtime = createChapterRuntime({
      wasm: importer,
      setup: (_s, ctx) => {
        seen = ctx.wasm;
      }
    });
    await runtime.mount(context(fakeStack([fakePanel('table', { cadence: 'change' })])));
    expect(seen).toBe(instance);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('says so when a heading named a panel that does not exist', async () => {
    const stage = fakeStage();
    await createChapterRuntime({ caption: 'mine' }).mount(context(fakeStack([fakePanel('canvas')], ['viewpoint2d']), stage));
    expect(stage.captions[0]).toContain('viewpoint2d');
  });

  it('writes its own caption, or an empty one, on mount', async () => {
    const stage = fakeStage();
    await createChapterRuntime({}).mount(context(fakeStack([fakePanel('canvas')]), stage));
    expect(stage.captions).toEqual(['']);
  });
});

describe('the lifecycle the player drives', () => {
  it('pauses on exit, resumes without rebuilding, and focuses its scopes', async () => {
    const panel = fakePanel('viewport3d', { scoped: true });
    let setups = 0;
    const runtime = createChapterRuntime({ setup: () => void (setups += 1), step: () => undefined });
    const ctx = context(fakeStack([panel]));
    await runtime.mount(ctx);
    runtime.enter?.(ctx);
    expect(frames.length).toBe(1);

    runtime.exit?.(ctx);
    expect(frames.length).toBe(0);
    expect(panel.log).toContain('viewport3d.blur');

    runtime.enter?.(ctx);
    runtime.resume?.(ctx);
    expect(setups).toBe(1);
    expect(panel.log.filter((line) => line === 'viewport3d.focus')).toHaveLength(2);
  });

  it('views get the chapter’s scope of a panel, not the shared target', async () => {
    const panel = fakePanel('viewport3d', { scoped: true });
    let built: unknown = null;
    const runtime = createChapterRuntime({ viewport3d: { build: (t: unknown) => void (built = t) } });
    await runtime.mount(context(fakeStack([panel])));
    expect(built).toEqual({ name: 'viewport3d', scoped: true });
  });

  it('dispose ends the run, releases scopes and editors, and can mount again', async () => {
    const panel = fakePanel('viewport3d', { scoped: true });
    const disposed: string[] = [];
    const { layer } = fakeEditors();
    // A chapter with no boxes of its own, so the module's run is the only one.
    const quiet = { ...layer, editorsFor: () => [] };
    const runtime = createChapterRuntime({ step: () => undefined, dispose: () => void disposed.push('model') });
    const ctx = context(fakeStack([panel]), fakeStage(), quiet as never);
    await runtime.mount(ctx);
    runtime.enter?.(ctx);
    runtime.dispose?.(ctx);
    expect(disposed).toEqual(['model']);
    expect(panel.log).toContain('viewport3d.release');
    expect(frames.length).toBe(0);

    await runtime.mount(context(fakeStack([fakePanel('viewport3d', { scoped: true })])));
  });
});

describe('an editor chapter', () => {
  it('builds on arrival, merging the build over the module', async () => {
    const drawn: string[] = [];
    (globalThis as Record<string, unknown>).__nextBuild = {
      step: (s: { x: number }) => void (s.x += 1),
      viewport2d: { draw: (_g: unknown, s: { x: number }) => drawn.push(`built x=${s.x}`) }
    };
    const { editor, layer } = fakeEditors();
    const runtime = createChapterRuntime({
      state: { x: 10 },
      viewport2d: { draw: () => drawn.push('module') }
    });
    await runtime.mount(context(fakeStack([fakePanel('viewport2d')]), fakeStage(), layer));
    await vi.waitFor(() => expect(editor.statuses.at(-1)?.[1]).toBe('ok'));
    expect(drawn.at(-1)).toBe('built x=10');
    expect(editor.statuses.at(-1)?.[0]).toMatch(/^Running\. Built in/);
  });

  it('reports a throwing draw in the editor, not the caption', async () => {
    (globalThis as Record<string, unknown>).__nextBuild = {
      viewport2d: {
        draw: () => {
          throw new Error('bad paint');
        }
      }
    };
    const stage = fakeStage();
    const { editor, layer } = fakeEditors();
    const runtime = createChapterRuntime({});
    await runtime.mount(context(fakeStack([fakePanel('viewport2d')]), stage, layer));
    await vi.waitFor(() => expect(editor.statuses.some(([, kind]) => kind === 'bad')).toBe(true));
    expect(editor.statuses.at(-1)?.[0]).toContain('bad paint');
    expect(stage.captions.some((c) => c.includes('bad paint'))).toBe(false);
  });

  it('restart rebuilds rather than rerunning the old instance', async () => {
    (globalThis as Record<string, unknown>).__nextBuild = { step: () => undefined };
    const stage = fakeStage();
    const { editor, layer } = fakeEditors();
    const runtime = createChapterRuntime({});
    await runtime.mount(context(fakeStack([fakePanel('canvas')]), stage, layer));
    await vi.waitFor(() => expect(stage.restart).toBeTypeOf('function'));
    const before = editor.run.mock.calls.length;
    stage.restart!();
    expect(editor.run.mock.calls.length).toBe(before + 1);
  });
});
