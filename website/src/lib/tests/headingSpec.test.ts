import { describe, expect, it } from 'vitest';
import { NO_PANEL, parseHeading, resolvePanels } from '../headingSpec';

describe('parseHeading', () => {
  it('reads a bare heading and guesses an id', () => {
    const spec = parseHeading('Exponential decay');
    expect(spec).toMatchObject({ title: 'Exponential decay', id: 'exponential-decay', explicit: false, ops: [] });
  });

  it('reads an explicit id with no settings', () => {
    expect(parseHeading('In memory {#soa}')).toMatchObject({ title: 'In memory', id: 'soa', explicit: true, ops: [] });
  });

  it('reads one panel added', () => {
    const spec = parseHeading('Decay {#decay +viewport2d}');
    expect(spec.id).toBe('decay');
    expect(spec.ops).toEqual([{ op: '+', name: 'viewport2d' }]);
  });

  it('reads several settings in the order written', () => {
    const spec = parseHeading('Compare {#cmp +viewport2d +table -readout}');
    expect(spec.ops).toEqual([
      { op: '+', name: 'viewport2d' },
      { op: '+', name: 'table' },
      { op: '-', name: 'readout' }
    ]);
  });

  it('reads a replacement', () => {
    expect(parseHeading('Why {#why =none}').ops).toEqual([{ op: '=', name: 'none' }]);
  });

  it('keeps braces that belong to the title', () => {
    const spec = parseHeading('The {x} problem {#x-problem +table}');
    expect(spec.title).toBe('The {x} problem');
    expect(spec.id).toBe('x-problem');
  });

  it('reports a token that is not a panel change, and keeps the rest', () => {
    const spec = parseHeading('Decay {#decay viewport2d +table}');
    expect(spec.ops).toEqual([{ op: '+', name: 'table' }]);
    expect(spec.problems).toHaveLength(1);
    expect(spec.problems[0].message).toContain('viewport2d');
    expect(spec.problems[0].fix).toContain('+name');
  });

  it('reports an operator with no name', () => {
    expect(parseHeading('Decay {#decay +}').problems).toHaveLength(1);
  });

  it('does not treat a heading without an id as having settings', () => {
    expect(parseHeading('Decay +viewport2d').explicit).toBe(false);
  });
});

describe('resolvePanels', () => {
  it('inherits when the section says nothing', () => {
    expect(resolvePanels(['viewport2d'], [])).toEqual(['viewport2d']);
  });

  it('adds to what it inherited', () => {
    expect(resolvePanels(['viewport2d'], [{ op: '+', name: 'table' }])).toEqual(['viewport2d', 'table']);
  });

  it('keeps the written order, which is the tab order', () => {
    expect(resolvePanels([], [{ op: '+', name: 'table' }, { op: '+', name: 'viewport2d' }])).toEqual([
      'table',
      'viewport2d'
    ]);
  });

  it('never adds the same panel twice', () => {
    expect(resolvePanels(['table'], [{ op: '+', name: 'table' }])).toEqual(['table']);
  });

  it('removes one it inherited', () => {
    expect(resolvePanels(['viewport2d', 'table'], [{ op: '-', name: 'table' }])).toEqual(['viewport2d']);
  });

  it('ignores removing something it never had', () => {
    expect(resolvePanels(['viewport2d'], [{ op: '-', name: 'table' }])).toEqual(['viewport2d']);
  });

  it('throws the inherited list away on a replacement', () => {
    expect(resolvePanels(['viewport2d'], [{ op: '=', name: 'table' }])).toEqual(['table']);
  });

  it('empties the list for =none', () => {
    expect(resolvePanels(['viewport2d', 'table'], [{ op: '=', name: NO_PANEL }])).toEqual([]);
  });

  it('applies additions after a replacement, in order', () => {
    expect(
      resolvePanels(['readout'], [
        { op: '=', name: 'viewport2d' },
        { op: '+', name: 'table' }
      ])
    ).toEqual(['viewport2d', 'table']);
  });

  it('treats none as a panel name nowhere except on =', () => {
    expect(resolvePanels(['viewport2d'], [{ op: '+', name: NO_PANEL }])).toEqual(['viewport2d']);
    expect(resolvePanels(['viewport2d'], [{ op: '-', name: NO_PANEL }])).toEqual(['viewport2d']);
  });
});
