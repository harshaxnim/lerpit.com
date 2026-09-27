import { describe, expect, it } from 'vitest';
import { compileJsFiles } from '../../js/compileJs';

const file = (name: string, source: string) => ({ name, source });

describe('compileJsFiles', () => {
  it('needs no entry file, so names describe contents rather than satisfy the loader', () => {
    const out = compileJsFiles([
      file('src/step.js', 'export function step() { return "stepped"; }'),
      file('src/draw.js', 'export function draw() { return "drew"; }')
    ]);

    expect(typeof out.step).toBe('function');
    expect(typeof out.draw).toBe('function');
    expect((out.draw as () => string)()).toBe('drew');
  });

  it('resolves an import against the importing file rather than by bare name', () => {
    const out = compileJsFiles([
      file('src/index.js', 'import { k } from "./forces.js";\nexport const doubled = k * 2;'),
      file('src/forces.js', 'export const k = 8;')
    ]);

    expect(out.doubled).toBe(16);
  });

  it('refuses two files claiming the same export, rather than picking one', () => {
    expect(() =>
      compileJsFiles([
        file('src/index.js', 'export function draw() {}'),
        file('src/draw.js', 'export function draw() {}')
      ])
    ).toThrow(/both export draw/);
  });

  it('runs a shared dependency once', () => {
    const out = compileJsFiles([
      file('src/index.js', 'import { n } from "./counter.js";\nimport "./other.js";\nexport const seen = n;'),
      file('src/other.js', 'import { n } from "./counter.js";\nexport const also = n;'),
      file('src/counter.js', 'globalThis.__runs = (globalThis.__runs ?? 0) + 1;\nexport const n = globalThis.__runs;')
    ]);

    expect(out.seen).toBe(out.also);
  });

  it('reports the file that failed, not just the message', () => {
    expect(() => compileJsFiles([file('src/index.js', 'export const x = (;')])).toThrow(/src\/index\.js/);
  });

  it('says so when nothing is exported at all', () => {
    expect(() => compileJsFiles([file('src/a.js', 'const unused = 1;')])).toThrow(/export anything/);
  });

  it('ignores C++ files sitting in the same box', () => {
    const out = compileJsFiles([
      file('src/index.js', 'export const ok = true;'),
      file('src/forces.cpp', 'int main() { return 0; }')
    ]);

    expect(out.ok).toBe(true);
  });
});
