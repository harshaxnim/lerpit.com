import { transform } from 'esbuild';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceLocation } from '../../runtimes/errorLocation';

// Types and blank lines that stripping removes, so the served lines no longer match.
const SOURCE = [
  "type Particle = {",
  "  x: number;",
  "  y: number;",
  "};",
  "",
  "",
  "export function step(s: { particles: Particle[] }, dt: number) {",
  "  for (const p of s.particles) {",
  "    p.x += dt * ctx.speed;",
  "  }",
  "}",
  ""
].join('\n');

const URL_ = 'http://localhost:4321/lerpettes/content/physics-engine/particles/code/physical/js/index.ts?t=1';

async function served() {
  const out = await transform(SOURCE, { loader: 'ts', sourcemap: 'inline', sourcefile: 'index.ts' });
  return out.code;
}

/** An error whose stack points at a line and column of the served module. */
function thrownAt(code: string, needle: string) {
  const lines = code.split('\n');
  const line = lines.findIndex((l) => l.includes(needle));
  const column = lines[line].indexOf(needle) + 1;
  const error = new ReferenceError('ctx is not defined');
  error.stack = `ReferenceError: ctx is not defined\n    at step (${URL_}:${line + 1}:${column})\n    at tick (http://localhost:4321/lerpettes/framework/runtimes/createChapterRuntime.ts:160:17)`;
  return error;
}

describe('sourceLocation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps the first lesson frame back to the line in the author\'s file', async () => {
    const code = await served();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(code)));
    expect(await sourceLocation(thrownAt(code, 'ctx.speed'))).toBe('index.ts:9');
  });

  it('is null in public view, where the page reads like the built site', async () => {
    const code = await served();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(code)));
    vi.stubGlobal('document', { cookie: 'lerpit-view=public' });
    expect(await sourceLocation(thrownAt(code, 'ctx.speed'))).toBeNull();
  });

  it('is null for an error with no frame in lesson code', async () => {
    const error = new Error('x');
    error.stack = 'Error: x\n    at tick (http://localhost:4321/lerpettes/framework/runtimes/createChapterRuntime.ts:160:17)';
    expect(await sourceLocation(error)).toBeNull();
    expect(await sourceLocation('not an error')).toBeNull();
  });

  it('is null when the module has no source map', async () => {
    const url = URL_.replace('t=1', 't=2');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('export const a = 1;\n')));
    const error = new Error('x');
    error.stack = `Error: x\n    at step (${url}:1:1)`;
    expect(await sourceLocation(error)).toBeNull();
  });
});
