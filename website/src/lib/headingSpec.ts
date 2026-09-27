/**
 * What a heading says, beyond its words.
 *
 * Every heading on this site may carry an explicit id, and now also the panels its
 * section shows:
 *
 *   # Exponential decay {#overview +viewport2d}
 *   ## In memory {#soa +table}
 *   ## Why this matters {#why =none}
 *
 * The `#` heading is the article's opening section, numbered 00, so it is parsed by
 * exactly the same rules as a chapter; whatever panels it names become the default
 * every chapter inherits. That is the only place an article-wide setting is written,
 * and it is written in the document rather than beside it, which is the rule the rest
 * of this site already follows.
 *
 * Nothing here knows the name of a single panel. This file parses the shape and the
 * registry decides whether a name exists, so adding a panel never touches the parser.
 */

/** One change to the inherited panel list. */
export type PanelOp = {
  /** `+` adds, `-` removes, `=` replaces the whole list. */
  op: '+' | '-' | '=';
  name: string;
};

export type HeadingSpec = {
  title: string;
  id: string;
  /** Whether the id was written as {#id} or guessed from the title. */
  explicit: boolean;
  ops: PanelOp[];
  /** Tokens that are not a panel change, in the author's terms. */
  problems: Array<{ message: string; fix: string }>;
};

/** The name that means "no panel at all", so `=none` empties the list. */
export const NO_PANEL = 'none';

/**
 * Title, then `{#id}`, then any number of whitespace-separated settings inside the
 * same braces. The title is lazy and the brace group is anchored to the end, so a
 * heading whose words contain braces still parses.
 */
const HEADING = /^(.*?)\s*\{#([A-Za-z0-9][A-Za-z0-9-_]*)((?:\s+[^}\s]+)*)\s*\}$/;
const OP = /^([+\-=])([A-Za-z][A-Za-z0-9-]*)$/;

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseHeading(raw: string): HeadingSpec {
  const text = raw.trim();
  const match = text.match(HEADING);

  if (!match) {
    return { title: text, id: slugify(text), explicit: false, ops: [], problems: [] };
  }

  const [, title, id, tail] = match;
  const ops: PanelOp[] = [];
  const problems: HeadingSpec['problems'] = [];

  for (const token of tail.trim().split(/\s+/).filter(Boolean)) {
    const op = token.match(OP);
    if (!op) {
      problems.push({
        message: `\`${token}\` in the heading “${title.trim()}” is not a panel change, so it is ignored.`,
        fix: 'Write `+name` to add a panel, `-name` to drop one, or `=name` to replace the list.'
      });
      continue;
    }

    ops.push({ op: op[1] as PanelOp['op'], name: op[2] });
  }

  return { title: title.trim(), id, explicit: true, ops, problems };
}

/**
 * The panels a section ends up with.
 *
 * A `=` throws the inherited list away and starts from what it names, so a chapter
 * can opt out of an article-wide default without knowing what that default was.
 * Everything else is applied in the order written, which is also the tab order, so
 * an author reading their own heading left to right sees the result.
 */
export function resolvePanels(inherited: readonly string[], ops: readonly PanelOp[]): string[] {
  const replacing = ops.some((entry) => entry.op === '=');
  const panels: string[] = replacing ? [] : [...inherited];

  for (const { op, name } of ops) {
    if (name === NO_PANEL) {
      // `=none` is the way to say "nothing here"; on any other operator it is noise
      // rather than a panel, and dropping it keeps `-none` from emptying a list.
      if (op === '=') {
        panels.length = 0;
      }
      continue;
    }

    if (op === '-') {
      const at = panels.indexOf(name);
      if (at >= 0) {
        panels.splice(at, 1);
      }
      continue;
    }

    if (!panels.includes(name)) {
      panels.push(name);
    }
  }

  return panels;
}
