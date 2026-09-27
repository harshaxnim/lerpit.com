import { describe, expect, it } from 'vitest';
import { parseFence, tabLabel } from '../../js/fence';

describe('parseFence', () => {
  it('reads a file and the region in it', () => {
    expect(parseFence('forces.cpp:force')).toEqual({
      entries: [{ path: 'forces.cpp', regionId: 'force' }],
      flags: [],
      problems: []
    });
  });

  it('keeps the order written, because that is the tab order', () => {
    const { entries } = parseFence('spring.cpp:step forces.cpp:force draw.js:paint');
    expect(entries.map((entry) => entry.path)).toEqual(['spring.cpp', 'forces.cpp', 'draw.js']);
  });

  it('treats a file with no colon as editable throughout', () => {
    expect(parseFence('forces.cpp').entries).toEqual([{ path: 'forces.cpp', regionId: null }]);
  });

  it('accepts a path into a subdirectory the lesson already ships', () => {
    expect(parseFence('wasm/spring.cpp:step').entries[0]).toEqual({
      path: 'wasm/spring.cpp',
      regionId: 'step'
    });
  });

  it('ignores the whitespace an author used to line the fence up', () => {
    expect(parseFence('   a.cpp:x    b.js:y  ').entries).toHaveLength(2);
  });

  it('mixes languages in one box', () => {
    const { entries, problems } = parseFence('forces.cpp:force draw.js:paint');
    expect(problems).toEqual([]);
    expect(entries.map((entry) => entry.path)).toEqual(['forces.cpp', 'draw.js']);
  });
});

describe('parseFence problems', () => {
  it('reports a fence that names nothing', () => {
    const { entries, problems } = parseFence('   ');
    expect(entries).toEqual([]);
    expect(problems[0].message).toContain('names no files');
  });

  it('reports a trailing colon with no region', () => {
    const { entries, problems } = parseFence('forces.cpp:');
    expect(entries).toEqual([]);
    expect(problems[0].message).toContain('ends in a colon');
    expect(problems[0].fix).toContain('forces.cpp:<region>');
  });

  it('reports a region with no file', () => {
    expect(parseFence(':force').problems[0].message).toContain('no file');
  });

  it('reports a path that climbs out of the chapter', () => {
    expect(parseFence('../other/forces.cpp:force').problems[0].message).toContain('outside');
    expect(parseFence('/etc/passwd').problems[0].message).toContain('outside');
  });

  it('reports the same file named twice', () => {
    const { entries, problems } = parseFence('forces.cpp:a forces.cpp:b');
    expect(entries).toHaveLength(1);
    expect(problems[0].message).toContain('named twice');
  });

  it('reports a region name that could not match a marker', () => {
    expect(parseFence('forces.cpp:a.b').problems[0].message).toContain('not a usable region name');
    expect(parseFence('forces.cpp:a/b').problems[0].message).toContain('not a usable region name');
  });

  it('keeps the good entries when one word is wrong', () => {
    const { entries, problems } = parseFence('forces.cpp:force /etc/passwd spring.cpp:step');
    expect(entries.map((entry) => entry.path)).toEqual(['forces.cpp', 'spring.cpp']);
    expect(problems).toHaveLength(1);
  });
});

describe('reserved options', () => {
  it('treats a dashed word as an option rather than a file', () => {
    const { entries, problems } = parseFence('forces.cpp:force --no-run');

    expect(entries.map((entry) => entry.path)).toEqual(['forces.cpp']);
    expect(problems[0].message).toContain('not an option this fence understands');
    expect(problems[0].fix).toContain('reserved');
  });

  it('reports a fence that is nothing but options', () => {
    const { entries, problems } = parseFence('--no-run');
    expect(entries).toEqual([]);
    expect(problems.some((problem) => problem.message.includes('not an option'))).toBe(true);
  });

  it('recognises a single dash too, so neither spelling becomes a filename', () => {
    expect(parseFence('a.cpp -x').problems[0].message).toContain('not an option');
  });
});

describe('tabLabel', () => {
  it('shows the filename, not the path the author typed', () => {
    expect(tabLabel('wasm/spring.cpp')).toBe('spring.cpp');
    expect(tabLabel('forces.cpp')).toBe('forces.cpp');
  });
});
