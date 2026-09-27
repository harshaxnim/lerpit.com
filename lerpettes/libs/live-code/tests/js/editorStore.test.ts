import { beforeEach, describe, expect, it } from 'vitest';
import { createEditorStore, fingerprint } from '../../js/editorStore';

/** A localStorage good enough to reason about, since vitest runs in node. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get size() { return map.size; },
    map
  };
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = { localStorage: fakeStorage() };
});

const storage = () => (globalThis as unknown as { window: { localStorage: ReturnType<typeof fakeStorage> } }).window.localStorage;

describe('fingerprint', () => {
  it('is stable for the same text', () => {
    expect(fingerprint('const k = 8;')).toBe(fingerprint('const k = 8;'));
  });

  it('changes when the author edits the file', () => {
    expect(fingerprint('const k = 8;')).not.toBe(fingerprint('const k = 9;'));
  });

  it('survives an empty file', () => {
    expect(typeof fingerprint('')).toBe('string');
  });
});

describe('createEditorStore', () => {
  it('gives back nothing for a file the reader has never touched', () => {
    expect(createEditorStore('a/b').read('src/x.js', 'start')).toBeNull();
  });

  it('returns the reader edit when the starter has not changed', () => {
    const store = createEditorStore('a/b');
    store.write('src/x.js', 'start', 'mine');
    expect(store.read('src/x.js', 'start')).toBe('mine');
  });

  it('drops the edit once the author changes the file underneath it', () => {
    const store = createEditorStore('a/b');
    store.write('src/x.js', 'start', 'mine');
    expect(store.read('src/x.js', 'a different starter')).toBeNull();
  });

  it('forgets a stale entry rather than reading it again next time', () => {
    const store = createEditorStore('a/b');
    store.write('src/x.js', 'start', 'mine');
    store.read('src/x.js', 'changed');
    expect(storage().size).toBe(0);
  });

  it('stores nothing when the text still matches the lesson', () => {
    const store = createEditorStore('a/b');
    store.write('src/x.js', 'start', 'start');
    expect(storage().size).toBe(0);
  });

  it('clears an entry when the reader edits back to the starter', () => {
    const store = createEditorStore('a/b');
    store.write('src/x.js', 'start', 'mine');
    store.write('src/x.js', 'start', 'start');
    expect(store.read('src/x.js', 'start')).toBeNull();
  });

  it('keeps two lessons with the same filename apart', () => {
    createEditorStore('lesson/one').write('src/x.js', 'start', 'first');
    createEditorStore('lesson/two').write('src/x.js', 'start', 'second');
    expect(createEditorStore('lesson/one').read('src/x.js', 'start')).toBe('first');
    expect(createEditorStore('lesson/two').read('src/x.js', 'start')).toBe('second');
  });

  it('forgets one file on reset without touching its neighbour', () => {
    const store = createEditorStore('a/b');
    store.write('src/x.js', 'start', 'mine');
    store.write('src/y.js', 'start', 'also mine');
    store.clear('src/x.js');
    expect(store.read('src/x.js', 'start')).toBeNull();
    expect(store.read('src/y.js', 'start')).toBe('also mine');
  });

  it('survives corrupt stored data rather than throwing into the editor', () => {
    const store = createEditorStore('a/b');
    storage().setItem('lerpit:code:a/b/src/x.js', 'not json');
    expect(store.read('src/x.js', 'start')).toBeNull();
  });

  it('degrades to forgetting when the browser refuses storage', () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
        removeItem: () => { throw new Error('blocked'); } }
    };
    const store = createEditorStore('a/b');
    expect(() => store.write('src/x.js', 'start', 'mine')).not.toThrow();
    expect(store.read('src/x.js', 'start')).toBeNull();
  });
});
