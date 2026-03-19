export type LerpModule = {
  lerp: (a: number, b: number, t: number) => number;
};

const cache = new Map<string, Promise<LerpModule>>();

const jsLerp = (a: number, b: number, t: number) => a + (b - a) * t;

export async function loadLerpModule(wasmUrl: string): Promise<LerpModule> {
  if (cache.has(wasmUrl)) {
    return cache.get(wasmUrl)!;
  }

  const pending = (async () => {
    try {
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch Wasm module: ${response.status}`);
      }

      let instance: WebAssembly.Instance;

      if ('instantiateStreaming' in WebAssembly) {
        try {
          const result = await WebAssembly.instantiateStreaming(response.clone(), {});
          instance = result.instance;
        } catch {
          const bytes = await response.arrayBuffer();
          const result = await WebAssembly.instantiate(bytes, {});
          instance = result.instance;
        }
      } else {
        const bytes = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(bytes, {});
        instance = result.instance;
      }

      const exports = instance.exports as WebAssembly.Exports & {
        lerp_f32?: (a: number, b: number, t: number) => number;
      };

      if (typeof exports.lerp_f32 !== 'function') {
        throw new Error('Wasm export lerp_f32 was not found.');
      }

      return {
        lerp: exports.lerp_f32
      };
    } catch (error) {
      console.warn('Falling back to a JavaScript lerp implementation.', error);
      return {
        lerp: jsLerp
      };
    }
  })();

  cache.set(wasmUrl, pending);
  return pending;
}
