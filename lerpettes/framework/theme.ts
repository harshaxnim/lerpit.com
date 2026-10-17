/*
 * The site's colours, for code that draws.
 *
 * CSS reads these as custom properties on :root in website/src/styles/global.css; a
 * canvas, a three.js material or a lesson's sketch reads them here. The two are the
 * same values written twice, because a stylesheet cannot import a module, and a test
 * (framework/tests/js/theme.test.ts) fails the moment they disagree. Lessons import
 * from here rather than copying a hex, so a palette change reaches every route.
 */

export const palette = {
  /** The sheet every page is printed on. */
  paper: '#fdfbf4',
  paperDeep: '#f7f3e7',
  /** Body text and the darkest marks. */
  ink: '#20313f',
  /** Secondary text, axes, quiet strokes. */
  muted: '#506270',
  /** The blue of links, the active tab and a primary line. */
  accent: '#2e6da4',
  /** The warm counterpoint: the moving thing, the highlighted thing. */
  accentWarm: '#d17041',
  /** Rules and grid lines, as a solid colour (the CSS token adds alpha). */
  line: '#5183ad',
  warn: '#8a5a00'
} as const;

export type PaletteName = keyof typeof palette;

/** The same colours as numbers, for three.js, which wants 0xRRGGBB. */
export const hex = Object.fromEntries(
  Object.entries(palette).map(([name, value]) => [name, parseInt(value.slice(1), 16)])
) as { readonly [K in PaletteName]: number };

/** Which CSS custom property each colour mirrors, for the test that keeps them equal. */
export const CSS_TOKENS: { readonly [K in PaletteName]: string } = {
  paper: '--paper',
  paperDeep: '--paper-deep',
  ink: '--ink',
  muted: '--muted',
  accent: '--accent',
  accentWarm: '--accent-warm',
  // --line is rgba(81, 131, 173, 0.42): this is its colour without the alpha.
  line: '--line',
  warn: '--warn'
};
