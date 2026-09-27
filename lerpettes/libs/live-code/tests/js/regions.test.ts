import { describe, expect, it } from 'vitest';
import { deriveSource, findRegion, hintText, regionIds, scanRegions, uncomment } from '../../js/regions';

/** An exercise as an author writes it: the file on disk is the working answer. */
const EXERCISE = [
  '// forces.cpp',
  'static const float K = 8.0f;',
  '',
  '// lerpit:force:edit:start',
  '//   return 0.0f;   // your turn',
  '// lerpit:force:edit:hint',
  '//   Hooke: the force opposes the displacement.',
  '// lerpit:force:edit:solution',
  '  // Hooke, with a little damping.',
  '  return -K * x - D * v;',
  '// lerpit:force:edit:end',
  '',
  'float stiffness() { return K; }'
].join('\n');

describe('scanRegions', () => {
  it('splits an edit region into starter, hint and answer', () => {
    const { regions, problems } = scanRegions(EXERCISE);

    expect(problems).toEqual([]);
    expect(regions).toEqual([
      {
        id: 'force',
        kind: 'edit',
        starter: { first: 4, last: 4 },
        hint: { first: 6, last: 6 },
        body: { first: 8, last: 9 },
        span: { first: 3, last: 10 }
      }
    ]);
  });

  it('takes an edit region with no hint', () => {
    const source = [
      '// lerpit:a:edit:start',
      '// x',
      '// lerpit:a:edit:solution',
      'y',
      '// lerpit:a:edit:end'
    ].join('\n');

    expect(findRegion(source, 'a')).toMatchObject({ starter: { first: 1, last: 1 }, hint: null });
  });

  it('reads highlight and hide regions, which have no sections', () => {
    const source = [
      '// lerpit:look:highlight:start',
      'interesting();',
      '// lerpit:look:highlight:end',
      '// lerpit:decls:hide:start',
      'extern "C" void step(float);',
      '// lerpit:decls:hide:end'
    ].join('\n');
    const { regions, problems } = scanRegions(source);

    expect(problems).toEqual([]);
    expect(regions.map((region) => [region.id, region.kind])).toEqual([
      ['look', 'highlight'],
      ['decls', 'hide']
    ]);
    expect(regions[0]).toMatchObject({ starter: null, hint: null, body: { first: 1, last: 1 } });
  });

  it('lets the kind be left off every marker but the start', () => {
    const source = ['// lerpit:a:edit:start', '// x', '// lerpit:a:solution', 'y', '// lerpit:a:end'].join('\n');
    expect(scanRegions(source).problems).toEqual([]);
    expect(findRegion(source, 'a')?.kind).toBe('edit');
  });

  it('reads the marker with or without a space after the slashes, and indented', () => {
    expect(regionIds('//lerpit:a:highlight:start\nx\n//lerpit:a:highlight:end')).toEqual(['a']);
    expect(regionIds('    //  lerpit:a:hide:start\n    x\n    //  lerpit:a:hide:end')).toEqual(['a']);
  });

  it('treats a file with no markers as having no regions, not as an error', () => {
    expect(scanRegions('int main() { return 0; }')).toEqual({ regions: [], problems: [] });
  });
});

describe('scanRegions problems', () => {
  it('reports a start with no kind', () => {
    const { problems } = scanRegions('// lerpit:a:start\nx\n// lerpit:a:end');
    expect(problems[0].message).toContain('does not say what kind');
    expect(problems[0].fix).toContain('lerpit:a:edit:start');
  });

  it('reports a kind it does not know', () => {
    const { problems } = scanRegions('// lerpit:a:wobble:start\nx\n// lerpit:a:end');
    expect(problems[0].message).toContain('not a kind of region');
  });

  it('reports an edit region with no solution and points at highlight', () => {
    const { regions, problems } = scanRegions('// lerpit:a:edit:start\nx\n// lerpit:a:edit:end');

    expect(regions).toEqual([]);
    expect(problems[0].message).toContain('no `:solution`');
    expect(problems[0].fix).toContain('highlight');
  });

  it('reports a solution marker in a highlight region', () => {
    const source = [
      '// lerpit:a:highlight:start',
      '// x',
      '// lerpit:a:solution',
      'y',
      '// lerpit:a:end'
    ].join('\n');
    expect(scanRegions(source).problems[0].message).toContain('has no `:solution`');
  });

  it('reports a hint that comes after the answer', () => {
    const source = [
      '// lerpit:a:edit:start',
      '// x',
      '// lerpit:a:solution',
      'y',
      '// lerpit:a:hint',
      '// too late',
      '// lerpit:a:end'
    ].join('\n');
    expect(scanRegions(source).problems[0].message).toContain('never reach it');
  });

  it('reports a marker whose kind disagrees with the open region', () => {
    const source = ['// lerpit:a:edit:start', '// x', '// lerpit:a:highlight:solution', 'y', '// lerpit:a:end'].join('\n');
    expect(scanRegions(source).problems[0].message).toContain('was opened as `edit`');
  });

  it('reports a region that is never closed', () => {
    const { regions, problems } = scanRegions('// lerpit:force:edit:start\nx\n');

    expect(regions).toEqual([]);
    expect(problems.at(-1)?.line).toBe(1);
    expect(problems.at(-1)?.message).toContain('never closed');
  });

  it('reports a marker with no start above it', () => {
    const { problems } = scanRegions('x\n// lerpit:a:end');
    expect(problems[0].line).toBe(2);
    expect(problems[0].message).toContain('no `lerpit:a:…:start` above it');
  });

  it('reports nesting rather than guessing which region owns a line', () => {
    const source = [
      '// lerpit:outer:highlight:start',
      '// lerpit:inner:highlight:start',
      'x',
      '// lerpit:outer:highlight:end'
    ].join('\n');
    const { problems, regions } = scanRegions(source);

    expect(problems[0].message).toContain('cannot nest');
    // The outer region still closes, so one bad marker does not lose the whole file.
    expect(regions.map((region) => region.id)).toEqual(['outer']);
  });

  it('reports a duplicate name and keeps the first', () => {
    const source = [
      '// lerpit:a:highlight:start',
      '1',
      '// lerpit:a:end',
      '// lerpit:a:highlight:start',
      '2',
      '// lerpit:a:end'
    ].join('\n');
    const { problems, regions } = scanRegions(source);

    expect(problems[0].message).toContain('twice');
    expect(regions).toHaveLength(1);
    expect(regions[0].body).toEqual({ first: 1, last: 1 });
  });

  it('reports a second solution marker', () => {
    const source = [
      '// lerpit:a:edit:start',
      '// x',
      '// lerpit:a:solution',
      '1',
      '// lerpit:a:solution',
      '2',
      '// lerpit:a:end'
    ].join('\n');
    expect(scanRegions(source).problems[0].message).toContain('already has a `:solution`');
  });

  it('reports a starter line that is live code, since it would compile too', () => {
    const source = [
      '// lerpit:a:edit:start',
      'return 0;',
      '// lerpit:a:solution',
      'return 1;',
      '// lerpit:a:end'
    ].join('\n');
    const { problems } = scanRegions(source);

    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(2);
    expect(problems[0].message).toContain('not a comment');
  });

  it('allows a blank line among the starter lines', () => {
    const source = [
      '// lerpit:a:edit:start',
      '// one',
      '',
      '// two',
      '// lerpit:a:solution',
      'x',
      '// lerpit:a:end'
    ].join('\n');
    expect(scanRegions(source).problems).toEqual([]);
  });
});

describe('uncomment', () => {
  it('drops everything up to the slashes and one space', () => {
    expect(uncomment('//   return 0.0f;')).toBe('  return 0.0f;');
    expect(uncomment('    //  x')).toBe(' x');
    expect(uncomment('//x')).toBe('x');
  });

  it('leaves a line with no slashes alone', () => {
    expect(uncomment('  return 1;')).toBe('  return 1;');
  });

  it('keeps a trailing comment inside the starter line', () => {
    expect(uncomment('// return 0.0f;   // your turn')).toBe('return 0.0f;   // your turn');
  });
});

describe('deriveSource', () => {
  it('gives the reader the starter, uncommented, with no markers, hint or answer', () => {
    expect(deriveSource(EXERCISE, 'starter').text).toBe(
      [
        '// forces.cpp',
        'static const float K = 8.0f;',
        '',
        '  return 0.0f;   // your turn',
        '',
        'float stiffness() { return K; }'
      ].join('\n')
    );
  });

  it('gives the answer with its own comments kept and no markers', () => {
    expect(deriveSource(EXERCISE, 'solution').text).toBe(
      [
        '// forces.cpp',
        'static const float K = 8.0f;',
        '',
        '  // Hooke, with a little damping.',
        '  return -K * x - D * v;',
        '',
        'float stiffness() { return K; }'
      ].join('\n')
    );
  });

  it('says where each region landed, and whether it has a hint left', () => {
    expect(deriveSource(EXERCISE, 'starter').regions).toEqual([
      { id: 'force', kind: 'edit', span: { first: 3, last: 3 }, hasHint: true }
    ]);
    expect(deriveSource(EXERCISE, 'solution').regions).toEqual([
      { id: 'force', kind: 'edit', span: { first: 3, last: 4 }, hasHint: true }
    ]);
  });

  it('gives both views the same text for highlight and hide', () => {
    const source = [
      'before',
      '// lerpit:a:hide:start',
      'boilerplate();',
      '// lerpit:a:hide:end',
      '// lerpit:b:highlight:start',
      'look();',
      '// lerpit:b:highlight:end',
      'after'
    ].join('\n');

    const starter = deriveSource(source, 'starter');
    expect(starter.text).toBe('before\nboilerplate();\nlook();\nafter');
    expect(deriveSource(source, 'solution').text).toBe(starter.text);
    expect(starter.regions).toEqual([
      { id: 'a', kind: 'hide', span: { first: 1, last: 1 }, hasHint: false },
      { id: 'b', kind: 'highlight', span: { first: 2, last: 2 }, hasHint: false }
    ]);
  });

  it('reports a null span for a region with an empty starter', () => {
    const source = ['a', '// lerpit:x:edit:start', '// lerpit:x:solution', 'answer();', '// lerpit:x:end', 'b'].join('\n');
    const derived = deriveSource(source, 'starter');

    expect(derived.text).toBe('a\nb');
    expect(derived.regions).toEqual([{ id: 'x', kind: 'edit', span: null, hasHint: false }]);
  });

  it('keeps a file with no markers exactly as it is', () => {
    const plain = 'int main() {\n  return 0;\n}\n';
    expect(deriveSource(plain, 'starter').text).toBe(plain);
    expect(deriveSource(plain, 'solution').regions).toEqual([]);
  });

  it('handles two edit regions in one file', () => {
    const source = [
      '// lerpit:a:edit:start',
      '// one',
      '// lerpit:a:solution',
      'ONE',
      '// lerpit:a:end',
      'middle',
      '// lerpit:b:edit:start',
      '// two',
      '// lerpit:b:solution',
      'TWO',
      '// lerpit:b:end'
    ].join('\n');

    expect(deriveSource(source, 'starter').text).toBe('one\nmiddle\ntwo');
    expect(deriveSource(source, 'solution').text).toBe('ONE\nmiddle\nTWO');
    expect(deriveSource(source, 'starter').regions.map((region) => region.span)).toEqual([
      { first: 0, last: 0 },
      { first: 2, last: 2 }
    ]);
  });
});

describe('hintText', () => {
  it('gives the hint uncommented, for the chip rather than the document', () => {
    expect(hintText(EXERCISE, 'force')).toBe('Hooke: the force opposes the displacement.');
  });

  it('is null for a region with no hint', () => {
    const source = ['// lerpit:a:edit:start', '// x', '// lerpit:a:solution', 'y', '// lerpit:a:end'].join('\n');
    expect(hintText(source, 'a')).toBeNull();
  });

  it('is null for a region that is not there', () => {
    expect(hintText(EXERCISE, 'nope')).toBeNull();
  });

  it('joins a hint written across several lines', () => {
    const source = [
      '// lerpit:a:edit:start',
      '// x',
      '// lerpit:a:hint',
      '// first line',
      '// second line',
      '// lerpit:a:solution',
      'y',
      '// lerpit:a:end'
    ].join('\n');
    expect(hintText(source, 'a')).toBe('first line\nsecond line');
  });
});
