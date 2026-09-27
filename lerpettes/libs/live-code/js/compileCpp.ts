/**
 * Compiling C++ to WebAssembly inside the tab, with clang and lld themselves compiled
 * to WebAssembly. Nothing is fetched until the reader presses run, and the toolchain is
 * cached afterwards.
 *
 * This drives clang and wasm-ld directly rather than going through emcc. The Emscripten
 * driver is present and starts (`em++ --version` answers in five seconds), but every
 * build it attempts dies inside emcc.py, which hands off to clang with `os.execvp` and
 * gets `OSError: [Errno 45] Exec format error` because this sandbox has no exec.
 * Patching that out moves the failure down into the package's subprocess shim, where
 * builds become non-deterministic. Calling the compiler and linker ourselves skips the
 * driver, and with it the whole problem.
 *
 * The price of skipping the driver is Embind: these modules export plain C functions and
 * are instantiated with WebAssembly.instantiate, with no generated glue.
 *
 * Two details cost hours and are load bearing:
 *  - argv must include argv[0]. `run('clang', ['-x'])` makes clang read `-x` as its own
 *    name and report "no input files".
 *  - the compile flags have to be the package's own preset, which puts clang in -cc1
 *    mode. That is what stops it trying to spawn a subprocess for the real frontend.
 */

/** Whatever the linked module exported. The lesson decides what it wants from it. */
export type WasmModule = Record<string, unknown>;

type ToolResult = { exitCode: number; stdout?: string; stderr?: string };

type Emception = {
  workspace: {
    writeFile(path: string, data: string | Uint8Array): Promise<void>;
    readFile(path: string): Promise<Uint8Array | null>;
  };
  run(
    cmd: string,
    argv: string[],
    opts?: { cwd?: string; onStdout?: (t: string) => void; onStderr?: (t: string) => void }
  ): Promise<ToolResult>;
  dispose(): void;
};

type CompileArgv = (paths: { sourcePath: string; objectPath: string }) => string[];

import type { EditorFile } from './fileEditor';

export type CompileLog = (line: string) => void;

const WORK_DIR = '/home/user';
const WASM_PATH = `${WORK_DIR}/live.wasm`;

/**
 * A build that has gone quiet for this long is not coming back. A panel stuck on
 * "building" forever is worse than one that admits it gave up.
 */
const PHASE_TIMEOUT_MS = 180_000;

/** Phase timings go in the log, so a slow build says which part was slow. */
function secondsSince(started: number): string {
  return `${((performance.now() - started) / 1000).toFixed(1)}s`;
}

function withTimeout<T>(label: string, work: Promise<T>, ms: number): Promise<T> {
  let timer = 0;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error(`${label} gave up after ${Math.round(ms / 1000)}s. See the log.`)),
        ms
      );
    })
  ]).finally(() => window.clearTimeout(timer));
}

let booting: Promise<{ em: Emception; compileArgv: CompileArgv }> | null = null;
let ready = false;

/** Whether the toolchain is already in this tab, so callers can say so honestly. */
export function isToolchainReady(): boolean {
  return ready;
}

/** One toolchain per tab, booted on first use and kept for every later build. */
async function getToolchain(log: CompileLog) {
  if (!booting) {
    booting = (async () => {
      if (!window.crossOriginIsolated) {
        // Isolation comes from a service worker on a static host, and it can only add
        // headers to responses it serves, so the visit that installs it is never
        // isolated. Say which of the two cases this is, since one of them the reader
        // can fix and the other they cannot.
        const installing = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
        throw new Error(
          installing
            ? 'The compiler needs one reload before it can start. Reload the page and press run again.'
            : 'The compiler cannot start in this browser. It needs a service worker to run, which private windows and blocked site data both prevent.'
        );
      }

      const bootStarted = performance.now();
      log('Starting the toolchain. Cached in this browser after the first visit.');
      const mod = await import('@gameguild/emception-browser');
      const em = (await mod.createEmception({
        tty: 'none',
        onStdout: (t: string) => log(t.trimEnd()),
        onStderr: (t: string) => log(t.trimEnd())
      })) as unknown as Emception;

      // The preset is the source of truth for the -cc1 flags and the sysroot layout.
      const presets = mod.TOOLCHAIN_PRESETS as unknown as Record<string, { compileArgv?: CompileArgv }>;
      const compileArgv = presets.cpp?.compileArgv;
      if (!compileArgv) {
        throw new Error('The toolchain package no longer exposes a cpp preset.');
      }

      ready = true;
      log(`toolchain ready  ${secondsSince(bootStarted)}`);
      return { em, compileArgv };
    })().catch((error) => {
      ready = false;
      // A failed boot must not poison every later attempt.
      booting = null;
      throw error;
    });
  }

  return booting;
}

/**
 * Undefined symbols become imports, because the link allows them. Rather than guess what
 * a reader's code might pull in, ask the module what it wants and hand back a stub for
 * each: anything actually called then throws by name instead of the module failing to
 * instantiate at all.
 */
function stubImports(module: WebAssembly.Module, log: CompileLog): WebAssembly.Imports {
  const wanted = WebAssembly.Module.imports(module);
  const imports: WebAssembly.Imports = {};

  for (const entry of wanted) {
    const group = (imports[entry.module] ??= {});
    if (entry.kind === 'function') {
      group[entry.name] = () => {
        throw new Error(`The compiled module called ${entry.name}, which the page does not provide.`);
      };
    } else if (entry.kind === 'memory') {
      group[entry.name] = new WebAssembly.Memory({ initial: 256, maximum: 4096 });
    } else if (entry.kind === 'table') {
      group[entry.name] = new WebAssembly.Table({ initial: 1, element: 'anyfunc' });
    } else {
      group[entry.name] = new WebAssembly.Global({ value: 'i32', mutable: false }, 0);
    }
  }

  if (wanted.length > 0) {
    log(`Stubbed ${wanted.length} import(s): ${wanted.map((e) => e.name).slice(0, 6).join(', ')}`);
  }

  return imports;
}

/** Build the reader's files and hand back the instantiated exports. */
export async function compileCpp(files: EditorFile[], log: CompileLog): Promise<WasmModule> {
  const { em, compileArgv } = await getToolchain(log);

  // Every tab is compiled on its own, then all the objects are linked together. That is
  // what makes the tabs real files rather than one buffer split across a strip.
  const objects: string[] = [];

  for (const file of files) {
    // The fence names paths, but the toolchain's workspace is one flat directory and
    // creating the tree in it buys nothing: a box's files are compiled as a unit and
    // never include each other by path.
    const flat = file.name.slice(file.name.lastIndexOf('/') + 1);
    const sourcePath = `${WORK_DIR}/${flat}`;
    const objectPath = `${WORK_DIR}/${flat.replace(/\.[^.]+$/, '')}.o`;
    await em.workspace.writeFile(sourcePath, file.source);

    const compileStarted = performance.now();
    const compile = await withTimeout(
      `Compiling ${file.name}`,
      em.run('clang', compileArgv({ sourcePath, objectPath }), { cwd: WORK_DIR }),
      PHASE_TIMEOUT_MS
    );
    log(`clang -cc1 ${flat}  ${secondsSince(compileStarted)}`);
    if (compile.stderr?.trim()) log(compile.stderr.trim());
    if (compile.exitCode !== 0) {
      throw new Error(`${flat} did not compile. See the log.`);
    }

    objects.push(objectPath);
  }

  const linkStarted = performance.now();
  const link = await withTimeout(
    'The linker',
    em.run(
      'wasm-ld',
      [
        'wasm-ld',
        ...objects,
        '-o',
        WASM_PATH,
        '-L/usr/lib/emscripten/cache-lib/wasm32-emscripten',
        '--no-entry',
        '--import-undefined',
        '--allow-undefined',
        // Everything is exported rather than a named list. The alternative is the
        // author writing their extern "C" names a second time in index.ts, where
        // the two can disagree silently. The extra libc names on the exports object
        // cost nothing.
        '--export-all',
        '-lc',
        '-ldlmalloc',
        '-lcompiler_rt'
      ],
      { cwd: WORK_DIR }
    ),
    PHASE_TIMEOUT_MS
  );
  log(`wasm-ld ${objects.length} object(s) -o live.wasm  ${secondsSince(linkStarted)}`);
  if (link.stderr?.trim()) log(link.stderr.trim());
  if (link.exitCode !== 0) {
    throw new Error('It compiled but did not link. See the log.');
  }

  // The tools have been seen to report 0 on a build that failed, so the artifact is the
  // real test of whether it worked.
  const bytes = await em.workspace.readFile(WASM_PATH);
  if (!bytes) {
    throw new Error('The toolchain reported success but produced no wasm. See the log.');
  }

  log(`Built ${bytes.byteLength} bytes of wasm.`);

  // Copy off the worker's SharedArrayBuffer before handing the bytes over.
  const module = await WebAssembly.compile(new Uint8Array(bytes).buffer);
  const instance = await WebAssembly.instantiate(module, stubImports(module, log));
  const exports = instance.exports as Record<string, unknown>;

  (exports.__wasm_call_ctors as (() => void) | undefined)?.();

  return exports;
}
