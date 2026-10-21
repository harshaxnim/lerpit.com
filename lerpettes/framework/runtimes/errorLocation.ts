/**
 * Where in a lesson's own code a thrown error came from, as `index.ts:84`.
 *
 * An error's message says what went wrong and its stack says where, but the stack points
 * at the module Vite served: TypeScript with its types stripped, whose lines no longer
 * match the file the author is looking at. Under npm run dev that module carries an
 * inline source map, so the first stack frame inside lerpettes/content is mapped back
 * through it. Anything else (a built site, a frame outside lesson code, no map) is null,
 * and the caller says what it can without a place.
 */

const FRAME = /(https?:\/\/[^\s()]*\/lerpettes\/content\/[^\s()]*?\.(?:ts|js|mjs)(?:\?[^\s():]*)?):(\d+):(\d+)/;
const INLINE_MAP = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,(\S+)/;

type SourceMap = { sources: string[]; mappings: string };

/** The map is the same for every error a module throws, so each is fetched once. */
const maps = new Map<string, Promise<SourceMap | null>>();

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** One segment of a `mappings` string: base64 VLQ fields, each relative to the last. */
function decodeSegment(segment: string): number[] {
  const fields: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return fields;
}

/** The original file and 1-based line for a 1-based generated line and column. */
function lookup(map: SourceMap, line: number, column: number): { source: string; line: number } | null {
  // Source index, line and column run on across the whole string; the generated column
  // starts over on each line.
  let source = 0;
  let sourceLine = 0;
  let found: { source: number; line: number } | null = null;
  const lines = map.mappings.split(';');
  for (let l = 0; l < lines.length && l < line; l++) {
    let generatedColumn = 0;
    for (const segment of lines[l].split(',')) {
      if (!segment) continue;
      const fields = decodeSegment(segment);
      generatedColumn += fields[0];
      if (fields.length < 4) continue;
      source += fields[1];
      sourceLine += fields[2];
      if (l === line - 1 && generatedColumn <= column - 1) found = { source, line: sourceLine };
    }
  }
  if (!found) return null;
  const name = map.sources[found.source];
  return name ? { source: name, line: found.line + 1 } : null;
}

const mapFor = (url: string) => {
  let pending = maps.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => response.text())
      .then((text) => {
        const inline = text.match(INLINE_MAP);
        return inline ? (JSON.parse(atob(inline[1])) as SourceMap) : null;
      })
      .catch(() => null);
    maps.set(url, pending);
  }
  return pending;
};

export async function sourceLocation(error: unknown): Promise<string | null> {
  const frame = error instanceof Error ? error.stack?.match(FRAME) : null;
  if (!frame) return null;
  const [, url, line, column] = frame;
  const map = await mapFor(url);
  const at = map ? lookup(map, Number(line), Number(column)) : null;
  if (!at) return null;
  return `${at.source.split('/').pop()}:${at.line}`;
}
