/*
 * Surgical edits to a control.toml, keeping everything the author wrote around them.
 *
 * A TOML library would read the file and write a new one, which drops every comment;
 * the control files in this repo are mostly comments explaining why a knob is set. So
 * this edits lines: a key's line is rewritten in place (its trailing comment kept),
 * removed, or added at the end of its table. After every edit the result is parsed and
 * checked to hold exactly the value asked for; a file shaped in a way this cannot edit
 * (a dotted key, an inline table) throws instead of guessing, and the editor offers the
 * raw text.
 *
 * Pure: no fs, no DOM.
 */

import { parse as parseToml } from 'smol-toml';

export type TomlValue = string | number | boolean;

export class TomlEditError extends Error {}

const HEADER = /^\s*\[([^\[\]]+)\]\s*(?:#.*)?$/;
// A value: a basic string, a literal string, or a bare token (number, boolean).
const VALUE = String.raw`"(?:[^"\\]|\\.)*"|'[^']*'|[^\s#]+`;
const ANY_KEY = /^\s*[A-Za-z0-9_\-"']+\s*=/;

function format(value: TomlValue): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TomlEditError(`${value} is not a number TOML can hold.`);
  return String(value);
}

function escapeKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The [start, end) line range of a table's body, or of the top level when `table` is null. */
function region(lines: string[], table: string | null): { start: number; end: number } | null {
  if (table === null) {
    const first = lines.findIndex((line) => HEADER.test(line));
    return { start: 0, end: first < 0 ? lines.length : first };
  }
  const at = lines.findIndex((line) => line.match(HEADER)?.[1].trim() === table);
  if (at < 0) return null;
  const next = lines.findIndex((line, index) => index > at && HEADER.test(line));
  return { start: at + 1, end: next < 0 ? lines.length : next };
}

function edit(source: string, table: string | null, key: string, value: TomlValue | null): string {
  const lines = source.split('\n');
  const keyLine = new RegExp(`^(\\s*${escapeKey(key)}\\s*=\\s*)(${VALUE})(\\s*#.*)?\\s*$`);
  const range = region(lines, table);

  if (range) {
    for (let index = range.start; index < range.end; index += 1) {
      const match = lines[index].match(keyLine);
      if (!match) continue;
      if (value === null) {
        lines.splice(index, 1);
        // A key that opened the file leaves no blank line behind it.
        if (index === 0 && lines.length > 1 && lines[0].trim() === '') lines.splice(0, 1);
        if (table !== null) dropEmptyTable(lines, table);
      } else {
        lines[index] = `${match[1]}${format(value)}${match[3] ?? ''}`;
      }
      return lines.join('\n');
    }
  }

  if (value === null) return source;
  const line = `${key} = ${format(value)}`;

  if (!range) {
    // A new table goes at the end, a blank line after whatever was there.
    const body = source.replace(/\s+$/, '');
    return `${body}${body ? '\n\n' : ''}[${table}]\n${line}\n`;
  }

  // After the last key in the region, so a new key sits with its neighbours.
  let lastKey = -1;
  for (let index = range.start; index < range.end; index += 1) {
    if (ANY_KEY.test(lines[index])) lastKey = index;
  }
  if (lastKey >= 0) {
    lines.splice(lastKey + 1, 0, line);
  } else if (table === null && range.end < lines.length) {
    // No top-level keys yet, only comments and then a table. The comments above a
    // table are about that table, so the key goes first, clear of them.
    lines.splice(0, 0, line, ...(lines[0]?.trim() === '' ? [] : ['']));
  } else {
    let at = range.end;
    while (at > range.start && lines[at - 1].trim() === '') at -= 1;
    lines.splice(at, 0, line);
  }
  let out = lines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

/** A table left with no keys and no comments goes, header and all. */
function dropEmptyTable(lines: string[], table: string) {
  const range = region(lines, table);
  if (!range) return;
  const body = lines.slice(range.start, range.end);
  if (body.some((line) => line.trim() !== '')) return;
  let from = range.start - 1;
  // Take the blank line above the header with it.
  if (from > 0 && lines[from - 1].trim() === '') from -= 1;
  // At the end of the file, keep the empty string after the last newline.
  const end = range.end === lines.length && lines[lines.length - 1] === '' ? range.end - 1 : range.end;
  lines.splice(from, end - from);
}

function check(out: string, table: string | null, key: string, value: TomlValue | null) {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(out) as Record<string, unknown>;
  } catch (error) {
    throw new TomlEditError(`The edit would leave control.toml unreadable: ${(error as Error).message}`);
  }
  const holder = table === null ? parsed : (parsed[table] as Record<string, unknown> | undefined);
  const actual = holder?.[key];
  if (value === null ? actual !== undefined : actual !== value) {
    throw new TomlEditError(`control.toml is written in a shape this editor cannot change safely (${table ? `${table}.` : ''}${key}). Edit it as text.`);
  }
}

/** Sets a top-level key, or removes it when `value` is null. Throws TomlEditError rather than guess. */
export function setKey(source: string, key: string, value: TomlValue | null): string {
  const out = edit(source, null, key, value);
  check(out, null, key, value);
  return out;
}

/** Sets `key` inside `[table]`, creating the table if needed; null removes it (and an emptied table). */
export function setTableKey(source: string, table: string, key: string, value: TomlValue | null): string {
  const out = edit(source, table, key, value);
  check(out, table, key, value);
  return out;
}

/** Renames a key inside `[table]`, keeping its value and comment. A chapter id rename moves its caption with it. */
export function renameTableKey(source: string, table: string, from: string, to: string): string {
  const lines = source.split('\n');
  const range = region(lines, table);
  if (!range) return source;
  const keyLine = new RegExp(`^(\\s*)${escapeKey(from)}(\\s*=.*)$`);
  for (let index = range.start; index < range.end; index += 1) {
    const match = lines[index].match(keyLine);
    if (match) {
      lines[index] = `${match[1]}${to}${match[2]}`;
      break;
    }
  }
  const out = lines.join('\n');
  try {
    parseToml(out);
  } catch {
    throw new TomlEditError(`Renaming ${from} to ${to} in [${table}] would leave control.toml unreadable.`);
  }
  return out;
}
