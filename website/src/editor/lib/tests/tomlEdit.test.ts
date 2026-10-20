import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renameTableKey, setKey, setTableKey, TomlEditError } from '../tomlEdit';
import { parseControl } from '../../../lib/control';

const LIVE_CODE = `# What the C++ chapter's code box says before its first build. The first build
# fetches the compiler, which is the slow part, so the reader is told before pressing.
[idle_status]
cpp = "Press run to fetch the toolchain and build."
`;

describe('setKey', () => {
  it('rewrites a value in place, keeping the comment above and beside it', () => {
    const source = '# Off the shelves.\nstatus = "unlisted"  # for now\n';
    expect(setKey(source, 'status', 'draft')).toBe('# Off the shelves.\nstatus = "draft"  # for now\n');
  });

  it('adds a key to an empty file', () => {
    expect(setKey('', 'status', 'draft')).toBe('status = "draft"\n');
  });

  it('adds a key after the last top-level key', () => {
    expect(setKey('status = "draft"\n', 'order', 2)).toBe('status = "draft"\norder = 2\n');
  });

  it('puts a top-level key above a table, clear of the comments that describe it', () => {
    const out = setKey(LIVE_CODE, 'status', 'draft');
    expect(out.startsWith('status = "draft"\n\n# What the C++')).toBe(true);
    expect(parseControl(out).control).toMatchObject({ status: 'draft', idleStatus: { cpp: 'Press run to fetch the toolchain and build.' } });
    expect(parseControl(out).problems).toEqual([]);
  });

  it('removes a key and nothing else', () => {
    expect(setKey('# keep\nstatus = "draft"\nlanding = true\n', 'status', null)).toBe('# keep\nlanding = true\n');
    expect(setKey('# keep\n', 'status', null)).toBe('# keep\n');
  });

  it('writes booleans and numbers bare, text quoted and escaped', () => {
    expect(setKey('', 'landing', true)).toBe('landing = true\n');
    expect(setKey('', 'order', 3)).toBe('order = 3\n');
    expect(setKey('', 'palette', 'Saffron & "indigo" 1973')).toBe('palette = "Saffron & \\"indigo\\" 1973"\n');
  });

  it('does not touch a key of the same name inside a table', () => {
    const source = '[caption]\nstatus = "a caption for a chapter called status"\n';
    const out = setKey(source, 'status', 'draft');
    expect(out).toContain('[caption]\nstatus = "a caption');
    expect(out.startsWith('status = "draft"')).toBe(true);
  });

  it('throws rather than guess at a shape it cannot edit', () => {
    expect(() => setTableKey('caption = { loop = "x" }\n', 'caption', 'loop', 'y')).toThrow(TomlEditError);
  });
});

describe('setTableKey', () => {
  it('changes a key in its table', () => {
    expect(setTableKey(LIVE_CODE, 'idle_status', 'cpp', 'Run it.')).toBe(LIVE_CODE.replace('Press run to fetch the toolchain and build.', 'Run it.'));
  });

  it('adds a key to an existing table', () => {
    const out = setTableKey(LIVE_CODE, 'idle_status', 'js', 'Ready.');
    expect(parseControl(out).control.idleStatus).toEqual({ cpp: 'Press run to fetch the toolchain and build.', js: 'Ready.' });
  });

  it('creates the table at the end when it is missing', () => {
    expect(setTableKey('status = "draft"\n', 'caption', 'loop', 'A spring.')).toBe('status = "draft"\n\n[caption]\nloop = "A spring."\n');
  });

  it('drops a table emptied by a removal, but not one with comments', () => {
    expect(setTableKey('status = "draft"\n\n[caption]\nloop = "A spring."\n', 'caption', 'loop', null)).toBe('status = "draft"\n');
    expect(setTableKey('[caption]\n# why\nloop = "A"\n', 'caption', 'loop', null)).toBe('[caption]\n# why\n');
  });

  it('leaves the other tables alone', () => {
    const source = '[caption]\nloop = "A"\n\n[idle_status]\nloop = "B"\n';
    expect(setTableKey(source, 'idle_status', 'loop', 'C')).toBe('[caption]\nloop = "A"\n\n[idle_status]\nloop = "C"\n');
  });
});

describe('renameTableKey', () => {
  it('moves a caption with its chapter', () => {
    expect(renameTableKey('[caption]\nloop = "A"  # note\n', 'caption', 'loop', 'the-loop')).toBe('[caption]\nthe-loop = "A"  # note\n');
    expect(renameTableKey('status = "draft"\n', 'caption', 'loop', 'x')).toBe('status = "draft"\n');
  });
});

describe('every control.toml in the repo', () => {
  it('survives a set and an unset of status with only that line changing', () => {
    const root = path.resolve('lerpettes/content');
    const files = fs.readdirSync(root, { recursive: true }).map(String).filter((file) => file.endsWith('control.toml'));
    expect(files.length).toBeGreaterThan(2);
    for (const file of files) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      const roundTrip = setKey(setKey(source, 'zz_probe', 'x'), 'zz_probe', null);
      expect(roundTrip, file).toBe(source.endsWith('\n') ? source : `${source}\n`);
    }
  });
});
