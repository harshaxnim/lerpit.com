/**
 * Region markers: what a `lerpit` fence points at inside a source file.
 *
 * ```cpp
 * // lerpit:force:edit:start
 * //   return 0.0f;
 * // lerpit:force:edit:hint
 * //   Hooke says the force opposes the displacement.
 * // lerpit:force:edit:solution
 *   return -K * x - D * v;
 * // lerpit:force:edit:end
 * ```
 *
 * One file carries every version. The starter and the hint are written as comments,
 * so the file on disk is the working answer: it compiles, it runs from a shell, and
 * there is no second copy to drift out of step with it. The reader opens the starter
 * with the slashes taken off and the rest not there at all.
 *
 * The whole file is editable. A region is not a fence around the reader; it says
 * which part the chapter is about.
 *
 * Three kinds:
 *  - `edit`      an exercise. Starter, optional hint, and an answer behind a chip.
 *  - `highlight` the part worth looking at. No answer to reveal.
 *  - `hide`      boilerplate, folded behind a band the reader can open.
 *
 * The middle markers are what make the split unambiguous. Answer code has comments
 * in it too, so "the commented lines are the starter" cannot be decided by looking
 * at a line; something has to say where one section ends.
 *
 * One parser, two callers. content.ts runs it in Node to check every fence against
 * the files before the page is built, which turns a typo into a line in the problem
 * panel rather than an empty box. The editor runs it in the browser to build the
 * document the reader gets. That is why it is pure and touches no DOM: the
 * build-time caller could not use it otherwise.
 */

/** Something wrong with the markers in a file, found while scanning it. */
export type RegionProblem = {
  /** What is wrong, in the author's terms. */
  message: string;
  /** What to write instead. */
  fix: string;
  /** Where it is, counting from 1 the way an editor does. */
  line: number;
};

export type RegionKind = 'edit' | 'highlight' | 'hide';

export const REGION_KINDS: readonly RegionKind[] = ['edit', 'highlight', 'hide'];

export type LineSpan = { first: number; last: number };

export type Region = {
  id: string;
  kind: RegionKind;
  /** Commented lines the reader starts from. `edit` only. */
  starter: LineSpan | null;
  /** Commented lines behind the hint chip. `edit` only, and optional there. */
  hint: LineSpan | null;
  /** The live code. For `edit` it is the answer; for the others it is the region. */
  body: LineSpan | null;
  /** Every line the region owns, markers included, so a transform can drop them. */
  span: LineSpan;
};

export type RegionScan = {
  regions: Region[];
  problems: RegionProblem[];
};

/**
 * `// lerpit:<id>:<kind>:<position>`, with any indentation.
 *
 * The kind may be left off every marker but `:start`, since the open region already
 * fixes it. Written out, it has to agree, which is what catches a copied marker.
 */
const MARKER = /^\s*\/\/\s*lerpit:([A-Za-z0-9_-]+)(?::([A-Za-z0-9_-]+))?:(start|hint|solution|end)\s*$/;

/** A line that is nothing but a comment, which every starter and hint line has to be. */
const COMMENT_ONLY = /^\s*\/\//;

type Position = 'start' | 'hint' | 'solution' | 'end';

type OpenRegion = {
  id: string;
  kind: RegionKind;
  startMarker: number;
  hintMarker: number | null;
  solutionMarker: number | null;
};

function isKind(value: string): value is RegionKind {
  return (REGION_KINDS as readonly string[]).includes(value);
}

function span(first: number, last: number): LineSpan | null {
  return last < first ? null : { first, last };
}

/**
 * Find every marked region in a file.
 *
 * Nesting is rejected rather than supported. Two regions cannot both own a line, so
 * the reader would have to be told which one the chapter is about, and there is no
 * honest answer. An author wanting an inner region should narrow the outer one.
 */
export function scanRegions(source: string): RegionScan {
  const lines = source.split('\n');
  const regions: Region[] = [];
  const problems: RegionProblem[] = [];
  const seen = new Set<string>();

  let open: OpenRegion | null = null;

  const fail = (line: number, message: string, fix: string) => {
    problems.push({ message, fix, line: line + 1 });
  };

  lines.forEach((text, index) => {
    const marker = MARKER.exec(text);
    if (!marker) {
      return;
    }

    const id = marker[1];
    const kindWord = marker[2] as string | undefined;
    const position = marker[3] as Position;

    if (position === 'start') {
      openRegion(index, id, kindWord);
      return;
    }

    if (!open) {
      fail(
        index,
        `There is a \`:${position}\` marker here with no \`lerpit:${id}:…:start\` above it.`,
        `Open the region first, or delete this line.`
      );
      return;
    }

    const current: OpenRegion = open;

    if (id !== current.id) {
      fail(
        index,
        `This marker names \`${id}\`, but the open region is \`${current.id}\`.`,
        `Write \`// lerpit:${current.id}:${current.kind}:${position}\`.`
      );
      return;
    }

    if (kindWord && kindWord !== current.kind) {
      fail(
        index,
        `This marker says \`${kindWord}\`, but \`${current.id}\` was opened as \`${current.kind}\`.`,
        `Write \`// lerpit:${current.id}:${current.kind}:${position}\`.`
      );
      return;
    }

    if (position === 'end') {
      const closed = closeRegion(current, index, lines, fail);
      if (closed) {
        regions.push(closed);
      }
      open = null;
      return;
    }

    sectionMarker(current, index, position);
  });

  if (open) {
    // Narrowed away by the assignment inside the callback, which TypeScript cannot see.
    const stranded = open as OpenRegion;
    fail(
      stranded.startMarker,
      `Region \`${stranded.id}\` is never closed, so nothing in this file is marked.`,
      `Add \`// lerpit:${stranded.id}:${stranded.kind}:end\` after its last line.`
    );
  }

  return { regions, problems };

  function openRegion(index: number, id: string, kindWord: string | undefined) {
    if (open) {
      fail(
        index,
        `Region \`${open.id}\` is still open here, and regions cannot nest.`,
        `Close \`${open.id}\` before opening another.`
      );
      return;
    }

    if (!kindWord) {
      fail(
        index,
        `This region does not say what kind it is.`,
        `Write \`// lerpit:${id}:edit:start\`, or \`highlight\`, or \`hide\`.`
      );
      return;
    }

    if (!isKind(kindWord)) {
      fail(
        index,
        `\`${kindWord}\` is not a kind of region.`,
        `Use one of ${REGION_KINDS.map((kind) => `\`${kind}\``).join(', ')}.`
      );
      return;
    }

    if (seen.has(id)) {
      fail(
        index,
        `This file marks \`${id}\` twice, so a fence asking for it would only get the first.`,
        'Give each region in a file its own name.'
      );
      return;
    }

    seen.add(id);
    open = { id, kind: kindWord, startMarker: index, hintMarker: null, solutionMarker: null };
  }

  function sectionMarker(current: OpenRegion, index: number, position: 'hint' | 'solution') {
    if (current.kind !== 'edit') {
      fail(
        index,
        `A \`${current.kind}\` region has no \`:${position}\`, because there is nothing to reveal.`,
        `Open \`${current.id}\` as \`edit\` if the reader is meant to write something.`
      );
      return;
    }

    const already = position === 'hint' ? current.hintMarker : current.solutionMarker;
    if (already !== null) {
      fail(
        index,
        `Region \`${current.id}\` already has a \`:${position}\` marker, so this one is ignored.`,
        'Keep one of each per region.'
      );
      return;
    }

    if (position === 'hint' && current.solutionMarker !== null) {
      fail(
        index,
        `The hint for \`${current.id}\` comes after its answer, so the reader would never reach it.`,
        'Put `:hint` between `:start` and `:solution`.'
      );
      return;
    }

    if (position === 'hint') {
      current.hintMarker = index;
    } else {
      current.solutionMarker = index;
    }
  }
}

function closeRegion(
  open: OpenRegion,
  endMarker: number,
  lines: string[],
  fail: (line: number, message: string, fix: string) => void
): Region | null {
  const { kind, id, startMarker, hintMarker, solutionMarker } = open;

  if (kind === 'edit' && solutionMarker === null) {
    fail(
      startMarker,
      `Region \`${id}\` is an \`edit\` with no \`:solution\`, so there is no answer and no starter to tell apart.`,
      `Add \`// lerpit:${id}:edit:solution\`, or open it as \`highlight\` to point at the code without setting an exercise.`
    );
    return null;
  }

  const starter = solutionMarker === null ? null : span(startMarker + 1, (hintMarker ?? solutionMarker) - 1);
  const hint = hintMarker === null || solutionMarker === null ? null : span(hintMarker + 1, solutionMarker - 1);
  const body = span((solutionMarker ?? startMarker) + 1, endMarker - 1);

  // A starter or hint line that is live code would compile alongside the answer, so
  // the file on disk would stop being the working solution. That is the whole reason
  // to write them as comments, and it is worth saying out loud when it is broken.
  for (const section of [starter, hint]) {
    if (!section) {
      continue;
    }

    for (let line = section.first; line <= section.last; line += 1) {
      if (lines[line].trim() !== '' && !COMMENT_ONLY.test(lines[line])) {
        fail(
          line,
          'This line is not a comment, so it is compiled along with the answer.',
          'Comment out every line before `:solution`.'
        );
        break;
      }
    }
  }

  return { id, kind, starter, hint, body, span: { first: startMarker, last: endMarker } };
}

/** The names a fence may ask this file for. */
export function regionIds(source: string): string[] {
  return scanRegions(source).regions.map((region) => region.id);
}

export function findRegion(source: string, id: string): Region | null {
  return scanRegions(source).regions.find((region) => region.id === id) ?? null;
}

/**
 * Take the comment slashes off a starter or hint line.
 *
 * Everything up to and including the first `//` goes, plus one space if there is one,
 * so what the author writes after the slashes is exactly what the reader sees. The
 * alternative, keeping the indentation before the slashes, doubles the indent of a
 * marker the author lined up with its own block.
 */
export function uncomment(line: string): string {
  const at = line.indexOf('//');
  if (at < 0) {
    return line;
  }

  const rest = line.slice(at + 2);
  return rest.startsWith(' ') ? rest.slice(1) : rest;
}

/** Which version of each `edit` region a derived document is built from. */
export type SourceView = 'starter' | 'solution';

/** Where a region ended up in a derived document, and how to draw it. */
export type DerivedRegion = {
  id: string;
  kind: RegionKind;
  /** Null when the region kept no lines, which an empty starter does. */
  span: LineSpan | null;
  /** Whether this region has a hint the reader has not seen yet. */
  hasHint: boolean;
};

export type DerivedSource = {
  /** The file as the reader sees it, with markers and the unused sections gone. */
  text: string;
  regions: DerivedRegion[];
};

/**
 * Build the document the editor holds.
 *
 * Everything outside a region is the file unchanged. Inside an `edit` one, `starter`
 * keeps the commented starter with its slashes off and drops the answer; `solution`
 * keeps the answer. `highlight` and `hide` regions are the same in both views. The
 * marker lines are never in either, because they are addressed to the author.
 *
 * The result is a real compilable file, so a compiler error's line number points at
 * the line the reader is looking at. That is the reason to derive a whole document
 * rather than edit a slice of one.
 */
export function deriveSource(source: string, view: SourceView): DerivedSource {
  const lines = source.split('\n');
  const { regions } = scanRegions(source);
  const out: string[] = [];
  const derived: DerivedRegion[] = [];

  let line = 0;

  for (const region of regions) {
    while (line < region.span.first) {
      out.push(lines[line]);
      line += 1;
    }

    const asStarter = region.kind === 'edit' && view === 'starter';
    const keep = asStarter ? region.starter : region.body;
    const first = out.length;

    if (keep) {
      for (let i = keep.first; i <= keep.last; i += 1) {
        out.push(asStarter ? uncomment(lines[i]) : lines[i]);
      }
    }

    derived.push({
      id: region.id,
      kind: region.kind,
      span: span(first, out.length - 1),
      hasHint: region.hint !== null
    });

    line = region.span.last + 1;
  }

  while (line < lines.length) {
    out.push(lines[line]);
    line += 1;
  }

  return { text: out.join('\n'), regions: derived };
}

/**
 * The hint an `edit` region carries, uncommented, or null when it has none. The chip
 * shows it as prose rather than putting it in the document, because a hint the reader
 * then has to delete is a worse hint.
 */
export function hintText(source: string, id: string): string | null {
  const region = findRegion(source, id);
  if (!region?.hint) {
    return null;
  }

  const lines = source.split('\n');
  const out: string[] = [];
  for (let line = region.hint.first; line <= region.hint.last; line += 1) {
    out.push(uncomment(lines[line]));
  }

  return out.join('\n').trim() || null;
}
