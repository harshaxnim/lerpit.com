/*
 * What the site says about itself. Components read these instead of carrying a name,
 * a year or a lesson's slug in their markup, so the site can be re-badged, or a second
 * author added, without editing a component.
 */

export type HeaderLink =
  /** A lesson, by `<collection>/<lerpette>`. Shown only while that lesson is listed. */
  | { label: string; lesson: string }
  /** Anywhere else. */
  | { label: string; href: string };

export const site = {
  /** The wordmark: `name` with `nameEmphasis` set in italics after it. */
  name: 'Lerp',
  nameEmphasis: 'It',
  /** The page title suffix, `Shadow maps · Lerpit`. */
  titleSuffix: 'Lerpit',
  author: 'Harsha',
  /** The footer line before the author's name. */
  footer: 'Meticulously lerped by',
  year: 2026,
  /** The collection whose newest published lerpette is served at '/'. */
  landingCollection: 'physics-engine',
  /** The crumb shown for a lerpette that belongs to no collection. */
  looseCollectionLabel: 'Issue Zero',
  headerLinks: [
    { label: 'why', lesson: 'meta/issue-zero' },
    { label: 'lè me', href: 'https://life.inspirho.com/me' }
  ] as HeaderLink[]
} as const;
