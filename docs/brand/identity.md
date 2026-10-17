# Lerpit brand identity

The site looks like a printed object: graph paper, a sheet of cream stock laid on it, and
one strip of 1970s colour taken from the lerpette covers. This document covers the
pieces that make up that look, and the rules for using them. Every value lives as a
token in `website/src/styles/global.css`, so use the tokens rather than copying these
values.

## The wordmark

**Lerp*It*** is set in Cardo, roman for "Lerp" and italic for "It", in ink (`--ink`,
`#20313f`). The italic's 14° lean is the angle the spine borrows. The wordmark always sits
at the left of the header (`SiteHeader.astro`), on the sheet, never over colour.

## The cassette spine

The spine is the site's mark. It is five bands of the **90min videocassette label**, the
same palette the lerpette covers use (`website/src/lib/cardArt/palette.ts`). They are
mirrored so the widest, lightest band is on the outside, and leaned at the wordmark's 14°.
It is printed the way the covers are: the bands get the same half-pixel blur as the card
art, and the cards' paper grain (`--paper-grain`, at 19% in overlay) lies over them. The
blur softens only the slanted sides; where a panel cuts the spine, the edge stays sharp.

| Band | Colour | Share of the width |
| --- | --- | --- |
| mustard | `#f2b021` | 32.4% |
| orange | `#e7752c` | 25.0% |
| red | `#e7212c` | 19.1% |
| wine | `#a51e4d` | 14.0% |
| plum | `#63164d` | 9.5% |

### Where it stands

The spine has the same place on every screen, so it keeps its proportions from a phone
to a wide monitor:

- **Position:** its left edge, measured halfway up (the lean pivots on its centre),
  stands at **66%** of its panel's width (`--spine-at: 0.66`).
- **Width:** it is **14%** of the panel's width (`--spine-share: 0.14`).
- **Panel:** the panel is the bordered sheet or card it belongs to. The page's sheet and
  the footer card are the same width at every size, so the header's spine and the
  footer's stand exactly over each other.
- **Height:** it runs the full height of its band, and the band's edges cut it level, the
  way a cover crops its art. In the header that is the sheet's top edge down to the rule.
  In the footer it is the card's own top and bottom, so it is shorter there.

It appears in three places:

1. **The header**, on every page (`SiteHeader.astro`).
2. **The footer**, on every page (`BaseLayout.astro`).
3. **The favicon** (`website/public/favicon.svg`), as a fixed 136:140 crop of it. An icon
   has no panel to take a width from.

### Using it

The spine is a component:

```astro
---
import BrandSpine from '../components/BrandSpine.astro';
---
<div class="my-panel" style="position: relative; overflow: hidden">
  <BrandSpine />
</div>
```

It places itself absolutely in its nearest positioned ancestor, using these tokens:

| Token | Meaning | Default |
| --- | --- | --- |
| `--spine-at` | where it stands, as a fraction of the panel's width | `0.66` (`:root`) |
| `--spine-share` | its width, as a fraction of the panel's width | `0.14` (`:root`) |
| `--spine-top`, `--spine-bottom` | where it is cut | `0` |
| `--spine-box` | the panel's width as the host sees it | `100%` |
| `--spine-inset` | how far the host sits inside the panel | `0px` |

A host that *is* the panel, such as the footer card, sets nothing. A host inside the panel
says how much bigger the panel is. The header bar sits inside the sheet's 1.1rem padding,
so it sets:

```css
--spine-box: (100% + 2.2rem);
--spine-inset: 1.1rem;
--spine-top: -1.1rem;
```

### Rules

- **One per panel, at 66%.** Never two side by side, and never at another offset.
  Repetition at the same place is what makes it a mark rather than decoration.
- **Never recoloured, never reordered.** The 90min order, widest outside, is the identity.
  The covers can use any palette; the spine cannot.
- **Always the 14° lean.** It is the wordmark's angle; a straight spine is a different mark.
- **Printed, never flat.** The blur and grain are part of the mark. Don't draw the bands
  without them, except in the favicon, which is too small to show them.
- **Cut, never scaled to fit.** It keeps its width and is cropped by the panel's edges.
- **Content goes over it, never under.** Links and text that meet it sit above it on a
  solid paper face (see `.lerpette-player__action` on a phone). It is decoration, hidden
  from screen readers (`aria-hidden`), and must never carry meaning.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#fdfbf4` | the stock: page, sheet, cards |
| `--ink` | `#20313f` | wordmark, headings, body text |
| `--muted` | `#506270` | prose, labels |
| `--accent` | `#2e6da4` | links, the active chapter's rule, focus |
| `--line`, `--line-strong` | grid blue at 42% and 72% | the graph paper, borders, rules |
| `--accent-warm` | `#d17041` | rare warm accents |

The spine's five colours are the only saturated colour in the chrome. Anything else that
wants a highlight uses `--accent`.

## Type

| Token | Face | Use |
| --- | --- | --- |
| `--font-serif` | Cardo | the wordmark, headings and prose |
| `--font-sans` | Syne | labels, bylines, tabs, buttons, captions, readings |
| `--font-mono` | IBM Plex Mono | code and program output only |

## Paper

The page is blue graph paper (`--graph-paper` layers) fixed to the window, so it stays
put while the page scrolls. Content sits on cream sheets (`--panel`) with a ruled border
(`--line-strong`). The stage viewport is a window in the sheet that shows the same grid,
lined up with the page's.
