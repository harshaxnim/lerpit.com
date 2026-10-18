import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  freshId, joinDocument, panelOps, readByline, readHeading, splitDocument, tidyBody, writeByline, writeHeading
} from '../mixtapeDoc';
import { resolvePanels } from '../../../lib/headingSpec';

const CONTENT = path.resolve('lerpettes/content');

function documents(): string[] {
  const out: string[] = [];
  for (const collection of fs.readdirSync(CONTENT, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const dir = path.join(CONTENT, collection.name);
    if (fs.existsSync(path.join(dir, 'collection.md'))) out.push(path.join(dir, 'collection.md'));
    for (const lerpette of fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const file = path.join(dir, lerpette.name, 'mixtape.md');
      if (fs.existsSync(file)) out.push(file);
    }
  }
  return out;
}

describe('splitDocument', () => {
  it('joins every document in the repo back byte for byte', () => {
    const files = documents();
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(joinDocument(splitDocument(source)), file).toBe(source);
    }
  });

  it('cuts at the title and each chapter', () => {
    const source = 'Author: A | Date: 2026-01-02\n\n# T {#intro +viewport2d}\n\nSummary.\n\n## One {#one}\n\nBody one.\n\n## Two\n\nBody two.\n';
    const parts = splitDocument(source);
    expect(parts.head).toBe('Author: A | Date: 2026-01-02\n\n');
    expect(parts.sections.map((section) => section.kind)).toEqual(['title', 'chapter', 'chapter']);
    expect(parts.sections[1].heading).toBe('## One {#one}\n');
    expect(parts.sections[1].body).toBe('\nBody one.\n\n');
    expect(parts.sections[2].body).toBe('\nBody two.\n');
  });

  it('is not fooled by headings inside fences, maths or comments', () => {
    const source = '# T\n\n```js\n## not a chapter\n```\n\n<!--\n## nor this\n-->\n\n$$\n## x\n$$\n\n## Real {#real}\n';
    const parts = splitDocument(source);
    expect(parts.sections.map((section) => section.heading.trim())).toEqual(['# T', '## Real {#real}']);
    expect(joinDocument(parts)).toBe(source);
  });

  it('leaves ### and deeper inside their chapter', () => {
    const parts = splitDocument('# T\n\n## A\n\n### Sub\n\ntext\n');
    expect(parts.sections).toHaveLength(2);
    expect(parts.sections[1].body).toContain('### Sub');
  });

  it('keeps a document with no headings whole, as head', () => {
    const parts = splitDocument('Just prose.\n');
    expect(parts.sections).toEqual([]);
    expect(joinDocument(parts)).toBe('Just prose.\n');
  });

  it('handles a file with no trailing newline and CRLF line ends', () => {
    for (const source of ['# T\n\n## A\n\nend', '# T\r\n\r\n## A {#a}\r\n\r\ntext\r\n']) {
      expect(joinDocument(splitDocument(source))).toBe(source);
    }
  });
});

describe('tidyBody', () => {
  it('leaves a blank line before the next heading', () => {
    expect(tidyBody('\ntext', false)).toBe('\ntext\n\n');
    expect(tidyBody('text\n\n\n\n', false)).toBe('\ntext\n\n');
    expect(tidyBody('\ntext\n\n', true)).toBe('\ntext\n');
    expect(tidyBody('   ', false)).toBe('\n\n');
  });
});

describe('headings', () => {
  it('round-trips a heading through its fields', () => {
    for (const line of ['## The loop {#loop}\n', '# Springs {#intro +viewport2d}\n', '## Data {#data +table -viewport2d}\n', '## Plain title\n']) {
      expect(writeHeading(readHeading(line))).toBe(line);
    }
  });

  it('reads the id, guessed when it is not written', () => {
    expect(readHeading('## Two views\n')).toMatchObject({ depth: 2, title: 'Two views', id: 'two-views', explicit: false });
    expect(readHeading('# T {#intro =none}\n')).toMatchObject({ depth: 1, id: 'intro', ops: [{ op: '=', name: 'none' }] });
  });

  it('writes the panel ops that resolve to what was asked for', () => {
    const cases: Array<[string[], string[]]> = [
      [['viewport2d'], ['viewport2d']],
      [['viewport2d'], ['viewport2d', 'table']],
      [['viewport2d'], ['table']],
      [['viewport2d', 'table'], ['table', 'viewport2d']],
      [['viewport2d'], []],
      [[], []],
      [[], ['readout']],
      [['viewport2d', 'readout'], ['viewport2d']]
    ];
    for (const [inherited, wanted] of cases) {
      expect(resolvePanels(inherited, panelOps(inherited, wanted)), `${inherited} → ${wanted}`).toEqual(wanted);
    }
    expect(panelOps(['viewport2d'], ['viewport2d'])).toEqual([]);
  });
});

describe('byline', () => {
  it('reads and rewrites it in place', () => {
    const head = 'Author: Harsha | Date: 2026-09-22\n\n';
    expect(readByline(head)).toEqual({ author: 'Harsha', date: '2026-09-22' });
    expect(writeByline(head, { author: 'Harsha', date: '2026-10-18' })).toBe('Author: Harsha | Date: 2026-10-18\n\n');
  });

  it('adds one when it is missing', () => {
    expect(readByline('')).toBeNull();
    expect(writeByline('', { author: 'H', date: '2026-01-01' })).toBe('Author: H | Date: 2026-01-01\n\n');
  });
});

describe('freshId', () => {
  it('makes a free id from a title', () => {
    expect(freshId('The Loop!', [])).toBe('the-loop');
    expect(freshId('The Loop', ['the-loop', 'the-loop-2'])).toBe('the-loop-3');
    expect(freshId('???', [])).toBe('chapter');
  });
});
