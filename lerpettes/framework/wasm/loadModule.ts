/*
 * One way to load prebuilt WebAssembly.
 *
 * A chapter's C++ is compiled ahead of time by scripts/build-wasm.sh into
 * `code/<id>/build/<name>.js` (Emscripten's ES module factory) and its `.wasm`. There
 * were three ways of getting from there to a module: a hand-written loader in issue
 * zero, a module-level `let mod` per chapter in issue one, and the physics library's
 * cache. They now all come through here.
 *
 *   wasm: () => import('../build/struct.js')
 *
 * The importer is the cache key, so a chapter written as a module-level definition
 * instantiates its module once per page however often it is mounted.
 */

export type WasmExports = Record<string, any>;

export type LoadOptions = {
  /**
   * Where the `.wasm` file is served, when it is not beside the `.js` (Vite serves it
   * from the asset route instead). Passed to Emscripten as `locateFile`.
   */
  wasmUrl?: string;
};

const cache = new WeakMap<object, Promise<WasmExports>>();

function isModuleNamespace(value: unknown): value is { default?: unknown } {
  return typeof value === 'object' && value !== null && 'default' in value;
}

/**
 * `source` resolves to one of: an ES module whose default export is an Emscripten
 * factory, the factory itself, or an already-instantiated module. Whichever it is, the
 * instance comes back.
 */
export function loadModule(source: () => Promise<unknown>, options: LoadOptions = {}): Promise<WasmExports> {
  const cached = cache.get(source);
  if (cached) return cached;

  const pending = (async () => {
    let value = await source();
    if (isModuleNamespace(value) && typeof value.default === 'function') value = value.default;
    if (typeof value === 'function') {
      const factoryOptions = options.wasmUrl
        ? { locateFile: (path: string) => (path.endsWith('.wasm') ? options.wasmUrl! : path) }
        : {};
      value = await (value as (o: object) => Promise<unknown>)(factoryOptions);
    }
    if (typeof value !== 'object' || value === null) {
      throw new Error('This wasm module loaded as nothing. Was it built? Run `npm run build:wasm`.');
    }
    return value as WasmExports;
  })();

  // A failed load is not remembered, so a rebuild followed by a retry can succeed.
  pending.catch(() => cache.delete(source));
  cache.set(source, pending);
  return pending;
}
