import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, resolveReadingsView } from '@lerpit/framework/monitors/view';

const labels = ['PE + KE', 't', 'fps'];

describe('resolveReadingsView', () => {
  it('starts on the first reading when the step says nothing', () => {
    expect(resolveReadingsView(null, null, labels)).toEqual({ mode: 'mini', mini: 'PE + KE' });
  });

  it('follows what the step asked for', () => {
    expect(resolveReadingsView(null, { mode: 'expanded', mini: null }, labels)).toEqual({ mode: 'expanded', mini: null });
    expect(resolveReadingsView(null, { mode: 'collapsed', mini: null }, labels)).toEqual({ mode: 'collapsed', mini: null });
    expect(resolveReadingsView(null, { mode: 'mini', mini: 't' }, labels)).toEqual({ mode: 'mini', mini: 't' });
  });

  it('falls back to the first reading for a label the step never added', () => {
    expect(resolveReadingsView(null, { mode: 'mini', mini: 'momentum' }, labels)).toEqual({ mode: 'mini', mini: 'PE + KE' });
  });

  it('puts back what the reader left on a restart, over what the step asked for', () => {
    const authored = { mode: 'expanded' as const, mini: null };
    expect(resolveReadingsView({ mode: 'mini', mini: 'fps' }, authored, labels)).toEqual({ mode: 'mini', mini: 'fps' });
    expect(resolveReadingsView({ mode: 'collapsed', mini: null }, authored, labels)).toEqual({ mode: 'collapsed', mini: null });
  });

  it('has nothing to show mini with no readings, and says so with a null label', () => {
    expect(resolveReadingsView(null, null, [])).toEqual({ mode: 'mini', mini: null });
  });

  it('drops a stray label from a view that is not mini', () => {
    expect(resolveReadingsView({ mode: 'expanded', mini: 't' }, null, labels)).toEqual({ mode: 'expanded', mini: null });
  });

  it('keeps the default as the first reading, alone', () => {
    expect(DEFAULT_VIEW).toEqual({ mode: 'mini', mini: null });
  });
});
