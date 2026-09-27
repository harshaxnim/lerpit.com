---
name: mockup
description: Build a throwaway HTML mock of a UI change and verify it visually in Chrome before showing the user. Use for any visible change to lerpit.com - layout, spacing, sticky behaviour, transitions, new controls - and again on the real dev server before presenting. Also use when proposing design options.
---

# Mockup and visual check

Never present a visual change you have not looked at. Reasoning about CSS is not looking at it.

Two modes:
- **Proposal mock** — a standalone scratchpad page showing options, for the user to pick from.
- **Verification pass** — the same loop pointed at the real dev server, before saying anything is done.

## Where things go

- Mock files: the session scratchpad directory, never the repo.
- Never add a mock to `src/` or commit one.

## Build the mock

1. Copy the `:root` token block and the fonts `<link>` from `website/src/styles/global.css` and `website/src/layouts/BaseLayout.astro` so the mock looks like the site, not like a wireframe.
2. Reuse real content: real chapter titles from a `mixtape.md`, the real byline shape (`Collection / slug / date / author`), the real column proportions.
3. **Render at true size.** Either lay the mock out at the real width (the prose column is 736px at a 1400px window) or lay it out at a fixed logical page (1400x820) and scale it with `transform: scale(z)` where `z = container / 1400`. Scaled mocks are the only faithful way to show a three-column page inside a narrow window.
4. When the mock is scaled, measure with `offsetWidth` (layout px, unscaled), not `getBoundingClientRect()` (visual px).
5. Put a small mono readout under each mock showing the numbers that matter: measured widths, scroll position, transition progress. It turns a judgement call into a number.
6. When showing options, give each one: what it is in one line, the live demo, why / costs / how it would be built.

## Look at it

Serve and drive it, don't just open it:

```bash
cd <scratchpad> && nohup python3 -m http.server 8777 >/dev/null 2>&1 &
```

Then `tabs_create_mcp` / `navigate` to `http://localhost:8777/<file>.html`, and use `computer` `screenshot` for the page, `zoom` with a region for detail (a 6px strip needs zooming to judge).

### Automation gotchas found the hard way

- **Scroll events do not fire in a background tab.** Setting `scrollTop` works, but no `scroll` event is dispatched, so scroll-driven UI never updates. Expose the update function on the element (`demo.__apply = apply`) and call it directly, or `dispatchEvent(new Event('scroll'))`.
- **Programmatic scrolling needs `behavior: 'instant'`.** `scroll-behavior: smooth` in CSS captures plain assignments and `behavior: 'auto'`, and its animation never advances in a throttled tab.
- **Synthetic hover does not trigger CSS `:hover`.** Verify hover-revealed UI through `:focus-within`, or by toggling the class, and say so rather than claiming the hover was tested.
- **Check `window.innerWidth`** before trusting a screenshot's proportions; the automation window is often much narrower than the screenshot's pixel size suggests.
- Kill the server and close the tab when done.

## State matrix

Screenshot every state the change can reach, not just the happy one:

- scroll: 0, mid-transition, past the transition, at the bottom
- chapter: first, middle, last
- interactive: default, hover, focus, open, closed
- entry: fresh load at top, deep link to `#step-id` (lands mid-state)
- width: 1440, 1180, 900, 640
- motion: normal and `prefers-reduced-motion`

## Before showing the user

- [ ] Looked at every state in the matrix that applies
- [ ] Sticky/fixed elements: checked what scrolls under them, and that any fade tail stops before the next element's border
- [ ] No text clipped, no border half-covered, no element touching another's edge
- [ ] Nothing in flow resizes between states (no layout shift)
- [ ] Spacing follows the 1rem rhythm and is optically even around dividers
- [ ] Hit areas at least 24x24px; hover, `:focus-visible` and cursor present
- [ ] Type sizes and colours come from the site's ramp and tokens
- [ ] Contrast checked on tinted panels
- [ ] Numbers in the write-up came from a measurement, not an estimate
- [ ] Every claim about behaviour was actually exercised; anything not exercised is called out
- [ ] Servers killed, tabs closed

## Verification pass on the real thing

Same loop, `npm run dev`, real URL, real content, at least one lesson page and one collection page. A mock passing is not the feature working.
