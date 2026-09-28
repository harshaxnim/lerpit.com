/*
 * control.toml: the knobs an author turns without touching the prose.
 *
 * One optional file per lerpette folder, beside mixtape.md. Absent means every
 * default, which is the shipped-and-listed behaviour, so adding controls never
 * changes what an existing lerpette does.
 *
 *   status = "draft"
 *
 * Adding a control is one entry in FIELDS below plus one line in LerpetteControl.
 * Everything else — defaults, validation, the unknown-key check, the problem
 * messages — reads off that table, so a new knob cannot arrive half-wired.
 */

import { parse as parseToml } from 'smol-toml';

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
};

/** What went wrong and what to do about it, in the shape content.ts reports. */
export type ControlIssue = { what: string; fix: string };

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
          what: `control.toml sets ${key} to something that is not text.`,
          fix: `Write ${key} = "${allowed[0]}". One of: ${allowed.join(', ')}.`
        }
      };
    }

    const match = allowed.find((option) => option === raw);
    if (!match) {
      return {
        issue: {
          what: `control.toml sets ${key} = "${raw}", which is not a ${key} this site knows.`,
          fix: `Use one of: ${allowed.join(', ')}.`
        }
      };
    }

    return { value: match };
  };
}

const FIELDS: { [K in keyof LerpetteControl]: FieldSpec<LerpetteControl[K]> } = {
  status: { fallback: PUBLISHED, read: oneOf(STATUSES) }
};

const KEYS = Object.keys(FIELDS) as (keyof LerpetteControl)[];

/** Every default, which is what a lerpette with no control.toml gets. */
export function defaultControl(): LerpetteControl {
  const control = {} as LerpetteControl;
  for (const key of KEYS) {
    (control as Record<string, unknown>)[key] = FIELDS[key].fallback;
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
      what: `control.toml is not valid TOML, so all of it was ignored. ${detail}`,
      fix: `Each line is one setting, like status = "${DRAFT}". Quote the value.`
    });
    return { control, problems };
  }

  for (const key of Object.keys(table)) {
    if (!(KEYS as string[]).includes(key)) {
      problems.push({
        what: `control.toml sets ${key}, which is not a control this site has.`,
        fix: `Known controls: ${KEYS.join(', ')}. Remove the line or fix the spelling.`
      });
    }
  }

  for (const key of KEYS) {
    if (!(key in table)) continue;
    const result = FIELDS[key].read(table[key], key);
    if ('issue' in result) {
      problems.push(result.issue);
    } else {
      (control as Record<string, unknown>)[key] = result.value;
    }
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
