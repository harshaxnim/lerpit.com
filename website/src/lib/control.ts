/*
 * control.toml: the knobs an author turns without touching the prose.
 *
 * One optional file per lerpette folder, beside mixtape.md. Absent means every
 * default, which is the shipped-and-listed behaviour, so adding controls never
 * changes what an existing lerpette does.
 *
 *   status = "draft"          # published | unlisted | draft
 *   landing = true            # serve this one at '/'
 *   order = 2                 # place in its collection, before the undated newest-first rest
 *
 *   [caption]                 # the band under the panel, per chapter id
 *   dynamics = "The sphere moves at constant speed."
 *
 *   [idle_status]             # what a chapter's code box says before its first build
 *   cpp = "Press run to fetch the toolchain and build."
 *
 * Adding a control is one entry in FIELDS below plus one line in LerpetteControl.
 * Everything else — defaults, validation, the unknown-key check, the problem
 * messages — reads off that table, so a new knob cannot arrive half-wired.
 */

import { parse as parseToml } from 'smol-toml';
import { STYLE_IDS } from './cardArt/styles';

/** Listed and routed. */
export const PUBLISHED = 'published';
/** Routed, so a shared link works, but absent from every listing. */
export const UNLISTED = 'unlisted';
/** Not routed at all in a production build. Visible in dev so it can be written. */
export const DRAFT = 'draft';

export const STATUSES = [PUBLISHED, UNLISTED, DRAFT] as const;
export type LerpetteStatus = (typeof STATUSES)[number];

export type LerpetteControl = {
  status: LerpetteStatus;
  /** Serve this lerpette at '/'. Only a published one can be the landing page. */
  landing: boolean;
  /** Its place in its collection; ordered ones come first, lowest first. */
  order: number | null;
  /** Per chapter id: the caption under the panel, overriding the chapter's code. */
  caption: Record<string, string>;
  /** Per chapter id: the code box's status line before its first build. */
  idleStatus: Record<string, string>;
};

/** What went wrong and what to do about it, in the shape content.ts reports. */
export type ControlIssue = { id: 'control-syntax' | 'control-unknown-key' | 'control-bad-value'; what: string; fix: string };

type FieldSpec<T> = {
  fallback: T;
  /** Returns the value, or the issue to report while the fallback stands. */
  read(raw: unknown, key: string): { value: T } | { issue: ControlIssue };
};

function oneOf<T extends string>(allowed: readonly T[]) {
  return (raw: unknown, key: string): { value: T } | { issue: ControlIssue } => {
    if (typeof raw !== 'string') {
      return {
        issue: {
          id: 'control-bad-value',
          what: `control.toml sets ${key} to something that is not text.`,
          fix: `Write ${key} = "${allowed[0]}". One of: ${allowed.join(', ')}.`
        }
      };
    }

    const match = allowed.find((option) => option === raw);
    if (!match) {
      return {
        issue: {
          id: 'control-bad-value',
          what: `control.toml sets ${key} = "${raw}", which is not a ${key} this site knows.`,
          fix: `Use one of: ${allowed.join(', ')}.`
        }
      };
    }

    return { value: match };
  };
}

function bool(raw: unknown, key: string): { value: boolean } | { issue: ControlIssue } {
  if (typeof raw === 'boolean') return { value: raw };
  return { issue: { id: 'control-bad-value', what: `control.toml sets ${key} to something that is not true or false.`, fix: `Write ${key} = true, without quotes.` } };
}

function position(raw: unknown, key: string): { value: number | null } | { issue: ControlIssue } {
  if (typeof raw === 'number' && Number.isInteger(raw)) return { value: raw };
  return { issue: { id: 'control-bad-value', what: `control.toml sets ${key} to something that is not a whole number.`, fix: `Write ${key} = 1, without quotes.` } };
}

function styleId(raw: unknown, key: string): { value: string | null } | { issue: ControlIssue } {
  const read = oneOf(STYLE_IDS)(raw, key);
  return 'issue' in read ? read : { value: read.value };
}

/** A table of chapter id to text, like [caption]. Which ids exist is content.ts's to check. */
function textTable(raw: unknown, key: string): { value: Record<string, string> } | { issue: ControlIssue } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { issue: { id: 'control-bad-value', what: `control.toml's ${key} is not a table.`, fix: `Write it as a [${key}] section with one line per chapter: step-id = "text".` } };
  }
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value !== 'string') {
      return { issue: { id: 'control-bad-value', what: `control.toml's [${key}] gives ${id} something that is not text.`, fix: `Quote it: ${id} = "…".` } };
    }
    out[id] = value;
  }
  return { value: out };
}

/** File keys as authors write them, mapped to the fields they fill. */
const FIELDS: { [K in keyof LerpetteControl]: FieldSpec<LerpetteControl[K]> & { key: string } } = {
  status: { key: 'status', fallback: PUBLISHED, read: oneOf(STATUSES) },
  landing: { key: 'landing', fallback: false, read: bool },
  order: { key: 'order', fallback: null, read: position },
  caption: { key: 'caption', fallback: {}, read: textTable },
  idleStatus: { key: 'idle_status', fallback: {}, read: textTable }
};

const KEYS = Object.keys(FIELDS) as (keyof LerpetteControl)[];
const FILE_KEYS = KEYS.map((field) => FIELDS[field].key);

/** Every default, which is what a lerpette with no control.toml gets. */
export function defaultControl(): LerpetteControl {
  const control = {} as LerpetteControl;
  for (const key of KEYS) {
    const fallback = FIELDS[key].fallback;
    (control as Record<string, unknown>)[key] = fallback && typeof fallback === 'object' ? { ...fallback } : fallback;
  }
  return control;
}

export type ControlResult = { control: LerpetteControl; problems: ControlIssue[] };

/**
 * Reads a control file. Never throws and never returns a partial control: a file
 * that cannot be parsed, a key that is not known, a value that is not allowed —
 * each is reported, and the default stands in. A broken knob must not be able to
 * unpublish a lerpette by accident, so every failure falls back to shipped.
 */
export function parseControl(source: string): ControlResult {
  const control = defaultControl();
  const problems: ControlIssue[] = [];

  let table: Record<string, unknown>;
  try {
    table = parseToml(source) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    problems.push({
      id: 'control-syntax',
      what: `control.toml is not valid TOML, so all of it was ignored. ${detail}`,
      fix: `Each line is one setting, like status = "${DRAFT}". Quote the value.`
    });
    return { control, problems };
  }

  for (const key of Object.keys(table)) {
    if (!FILE_KEYS.includes(key)) {
      if (key === 'card_style') {
        // It used to live here; it is the collection's now.
        problems.push({
          id: 'control-unknown-key',
          what: 'card_style is set in a lerpette\'s control.toml, but the card style belongs to the whole collection, so it is ignored here.',
          fix: 'Move the line to the collection\'s control.toml, beside collection.md.'
        });
        continue;
      }
      problems.push({
        id: 'control-unknown-key',
        what: `control.toml sets ${key}, which is not a control this site has.`,
        fix: `Known controls: ${FILE_KEYS.join(', ')}. Remove the line or fix the spelling.`
      });
    }
  }

  for (const field of KEYS) {
    const { key, read } = FIELDS[field];
    if (!(key in table)) continue;
    const result = read(table[key], key);
    if ('issue' in result) {
      problems.push(result.issue);
    } else {
      (control as Record<string, unknown>)[field] = result.value;
    }
  }

  return { control, problems };
}

/**
 * A collection's control.toml, beside its collection.md. Optional, like a lerpette's:
 *
 *   card_style = "orb"   # every card in the collection draws this style
 *
 * Without it the style is assigned across the library, so no two collections share
 * one. Ids are in cardArt/styles.ts. A bad value is reported and the assignment stands.
 */
export type CollectionControl = { cardStyle: string | null };

export function parseCollectionControl(source: string): { control: CollectionControl; problems: ControlIssue[] } {
  const control: CollectionControl = { cardStyle: null };
  const problems: ControlIssue[] = [];
  let table: Record<string, unknown>;
  try {
    table = parseToml(source) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    problems.push({
      id: 'control-syntax',
      what: `control.toml is not valid TOML, so all of it was ignored. ${detail}`,
      fix: 'Write card_style = "orb", with the value quoted.'
    });
    return { control, problems };
  }
  for (const key of Object.keys(table)) {
    if (key === 'card_style') continue;
    problems.push({
      id: 'control-unknown-key',
      what: `A collection's control.toml sets ${key}, which is not a control collections have.`,
      fix: 'Known controls: card_style. Lerpette settings go in the lerpette folder\'s own control.toml.'
    });
  }
  if ('card_style' in table) {
    const result = styleId(table.card_style, 'card_style');
    if ('issue' in result) problems.push(result.issue);
    else control.cardStyle = result.value;
  }
  return { control, problems };
}

/** Whether this status gets a page built for it. Drafts get one only in dev. */
export function isRoutable(status: LerpetteStatus, isProduction: boolean): boolean {
  return status !== DRAFT || !isProduction;
}

/**
 * Whether this status appears in shelves and collection listings.
 *
 * A local build lists everything, so an author can see what they are working on
 * without remembering what they hid; the card wears a tag saying which. Only a
 * production build actually hides anything.
 */
export function isListed(status: LerpetteStatus, isProduction: boolean): boolean {
  return status === PUBLISHED || !isProduction;
}

/** Whether the landing page may choose this lerpette. Published only, everywhere,
 *  so '/' reads the same locally as it does in production. */
export function isLandingCandidate(status: LerpetteStatus): boolean {
  return status === PUBLISHED;
}

/** The corner tag a card wears, or null when there is nothing to say. */
export function statusTag(status: LerpetteStatus): string | null {
  return status === PUBLISHED ? null : status.toUpperCase();
}
