import { describe, expect, it, vi } from 'vitest';
import { loadModule } from '../../wasm/loadModule';

describe('loadModule', () => {
  it('calls an Emscripten factory from a module namespace, once', async () => {
    const instance = { lerp: () => 0 };
    const factory = vi.fn(async () => instance);
    const source = vi.fn(async () => ({ default: factory }));
    expect(await loadModule(source)).toBe(instance);
    expect(await loadModule(source)).toBe(instance);
    expect(source).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('takes an already instantiated module as it is', async () => {
    const instance = { World: class {} };
    expect(await loadModule(async () => instance)).toBe(instance);
  });

  it('points the factory at a served .wasm when asked', async () => {
    let located = '';
    const source = async () => async (options: { locateFile?: (p: string) => string }) => {
      located = options.locateFile?.('lerp.wasm') ?? '';
      return {};
    };
    await loadModule(source, { wasmUrl: '/assets/lerp.wasm' });
    expect(located).toBe('/assets/lerp.wasm');
  });

  it('does not remember a failure, so a retry after a rebuild can work', async () => {
    let attempt = 0;
    const source = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('not built');
      return { ok: true };
    };
    await expect(loadModule(source)).rejects.toThrow('not built');
    await expect(loadModule(source)).resolves.toEqual({ ok: true });
  });

  it('says how to fix a module that loaded as nothing', async () => {
    await expect(loadModule(async () => null)).rejects.toThrow(/build:wasm/);
  });
});
