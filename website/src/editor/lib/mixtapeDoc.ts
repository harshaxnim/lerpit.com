/*
 * A mixtape.md (or collection.md) cut into the pieces the editor shows, and put back.
 *
 * The document is cut at its top-level `#` and `##` headings, which are exactly the
 * places content.ts starts the title and each chapter. Every byte of the source lands in
 * one piece, so joining the pieces gives back the file unchanged. That is the whole
 * promise the editor makes to the author: a chapter you did not touch is not rewritten,
 * so the git diff of a save shows only what you changed, comments and spacing included.
 *
 * Headings are found by parsing, not by matching lines, so a `## ` inside a code fence,
 * a `$$` block or an HTML comment is never mistaken for a chapter.
 *
 * Pure: no fs, no DOM. The editor page and the tests both import it.
 */

import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { NO_PANEL, parseHeading, type PanelOp } from '../../lib/headingSpec';

export type SectionKind = 'title' | 'chapter';

export type Section = {
  kind: SectionKind;
  /** The heading as written, through the end of its line (newline included when there is one). */
  heading: string;
  /** Everything after the heading line up to the next section, untouched. */
  body: string;
};

export type DocParts = {
  /** What comes before the first section: the byline and any blank lines. */
  head: string;
  sections: Section[];
};

type Positioned = { type: string; depth?: number; position?: { start: { offset?: number }; end: { offset?: number } } };

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/** Cuts a document at its top-level `#` and `##` headings. `joinDocument` undoes it exactly. */
export function splitDocument(source: string): DocParts {
  const root = parser.parse(source) as unknown as { children: Positioned[] };
  const starts: Array<{ at: number; headingEnd: number; kind: SectionKind }> = [];

  for (const node of root.children) {
    if (node.type !== 'heading' || (node.depth !== 1 && node.depth !== 2)) continue;
    const at = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (at === undefined || end === undefined) continue;
    // Through the end of the heading's line, so the heading owns its newline.
    const newline = source.indexOf('\n', end);
    starts.push({ at, headingEnd: newline < 0 ? source.length : newline + 1, kind: node.depth === 1 ? 'title' : 'chapter' });
  }

  const head = source.slice(0, starts[0]?.at ?? source.length);
  const sections = starts.map((start, index) => ({
    kind: start.kind,
    heading: source.slice(start.at, start.headingEnd),
    body: source.slice(start.headingEnd, starts[index + 1]?.at ?? source.length)
  }));

  return { head, sections };
}

export function joinDocument(parts: DocParts): string {
  return parts.head + parts.sections.map((section) => section.heading + section.body).join('');
}

/**
 * A body the author edited, made safe to sit before the next heading: it ends in a
 * blank line, so the next `##` never runs on from its last paragraph. The last section
 * keeps a single trailing newline. Only applied to what was edited, never to the rest.
 */
export function tidyBody(body: string, isLast: boolean): string {
  const trimmed = body.replace(/\s+$/, '');
  if (!trimmed) return isLast ? '\n' : '\n\n';
  const lead = body.startsWith('\n') ? '' : '\n';
  return `${lead}${trimmed}\n${isLast ? '' : '\n'}`;
}

/** What a heading line says, in the editor's terms. */
export type HeadingFields = {
  depth: 1 | 2;
  title: string;
  id: string;
  /** Whether `{#id}` is written. A heading without one gets an id guessed from its title. */
  explicit: boolean;
  ops: PanelOp[];
};

export function readHeading(line: string): HeadingFields {
  const depth = line.startsWith('##') ? 2 : 1;
  // ATX only: the editor writes ATX, and a setext title (underlined) is read by its first line.
  const text = line.replace(/^#{1,2}\s*/, '').replace(/\s*#*\s*$/, '').split('\n')[0];
  const spec = parseHeading(text);
  return { depth, title: spec.title, id: spec.id, explicit: spec.explicit, ops: spec.ops };
}

/** Writes a heading line back. Ends in a newline, as `Section.heading` does. */
export function writeHeading(fields: HeadingFields): string {
  const tokens = fields.ops.map((entry) => `${entry.op}${entry.name}`);
  const marks = fields.explicit || tokens.length ? ` {#${[fields.id, ...tokens].join(' ')}}` : '';
  return `${'#'.repeat(fields.depth)} ${fields.title.trim()}${marks}\n`;
}

/**
 * Turns a set of panel names a chapter should show into the ops its heading writes,
 * given what it inherits from the title. Prefers the shortest honest form: nothing when
 * it matches, `+`/`-` for small differences, `=` when nothing inherited survives.
 */
export function panelOps(inherited: readonly string[], wanted: readonly string[]): PanelOp[] {
  if (wanted.length === 0) return inherited.length ? [{ op: '=', name: NO_PANEL }] : [];
  const kept = inherited.filter((name) => wanted.includes(name));
  const inOrder = kept.every((name, index) => wanted[index] === name);
  if (kept.length === 0 || !inOrder) return wanted.map((name, index) => ({ op: index === 0 ? '=' : '+', name }));
  return [
    ...inherited.filter((name) => !wanted.includes(name)).map((name) => ({ op: '-' as const, name })),
    ...wanted.filter((name) => !inherited.includes(name)).map((name) => ({ op: '+' as const, name }))
  ];
}

export type Byline = { author: string; date: string };

const BYLINE = /^Author:[ \t]*(.+?)[ \t]*\|[ \t]*Date:[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*$/m;

/** The `Author: … | Date: …` line from a document's head, or null when it is missing. */
export function readByline(head: string): Byline | null {
  const match = head.match(BYLINE);
  return match ? { author: match[1], date: match[2] } : null;
}

/** Rewrites the byline in place, or puts one at the top when there is none. */
export function writeByline(head: string, byline: Byline): string {
  const line = `Author: ${byline.author.trim()} | Date: ${byline.date}`;
  if (BYLINE.test(head)) return head.replace(BYLINE, line);
  return `${line}\n\n${head.replace(/^\s+/, '')}`;
}

/** A chapter id that is not taken, from a title. */
export function freshId(title: string, taken: readonly string[]): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chapter';
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
  return id;
}
