import { describe, expect, it } from 'vitest';
import { byBuild, isModuleFile, KNOWN_EXTENSIONS, languageOf } from '../../js/languages';

describe('the language table', () => {
  it('sends C and C++ sources to the wasm build and headers nowhere', () => {
    for (const name of ['a.cpp', 'b.cc', 'c.cxx', 'd.c', 'src/E.CPP']) expect(languageOf(name)?.build).toBe('wasm');
    for (const name of ['a.h', 'b.hpp']) expect(languageOf(name)?.build).toBe('none');
  });

  it('evaluates JavaScript and TypeScript as modules', () => {
    for (const name of ['a.js', 'b.mjs', 'c.cjs', 'd.ts']) expect(isModuleFile(name)).toBe(true);
    expect(languageOf('d.ts')?.editor).toBe('typescript');
  });

  it('claims nothing it does not know', () => {
    expect(languageOf('notes.txt')).toBeNull();
    expect(languageOf('Makefile')).toBeNull();
  });

  it('splits a box by what its build does with each file', () => {
    const files = [{ name: 'spring.cpp' }, { name: 'decls.h' }, { name: 'step.js' }, { name: 'README' }];
    const split = byBuild(files);
    expect(split.wasm.map((f) => f.name)).toEqual(['spring.cpp']);
    expect(split.module.map((f) => f.name)).toEqual(['step.js']);
  });

  it('lists every extension once', () => {
    expect(new Set(KNOWN_EXTENSIONS).size).toBe(KNOWN_EXTENSIONS.length);
  });
});
