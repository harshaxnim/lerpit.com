import createLerpModuleFactory from './build/lerp_demo.js';

export type LerpModule = {
  lerp: (a: number, b: number, t: number) => number;
};

type LerpEmscriptenModule = {
  lerp_f32?: (a: number, b: number, t: number) => number;
};

type LerpModuleFactoryOptions = {
  locateFile?: (path: string, prefix?: string) => string;
};

type LerpModuleFactory = (options?: LerpModuleFactoryOptions) => Promise<LerpEmscriptenModule>;

const cache = new Map<string, Promise<LerpModule>>();
const createLerpModule = createLerpModuleFactory as unknown as LerpModuleFactory;

export async function loadLerpModule(wasmUrl: string): Promise<LerpModule> {
  if (cache.has(wasmUrl)) {
    return cache.get(wasmUrl)!;
  }

  const pending = (async () => {
    const module = await createLerpModule({
      locateFile(path) {
        if (path.endsWith('.wasm')) {
          return wasmUrl;
        }

        return path;
      }
    });

    if (typeof module.lerp_f32 !== 'function') {
      throw new Error('Wasm export lerp_f32 was not found.');
    }

    return {
      lerp: module.lerp_f32
    };
  })();

  cache.set(wasmUrl, pending);
  return pending;
}
