# Visual checks

Two halves. `scripts/check-site.mjs` does what a script can: it visits every route at every
size, activates every chapter, records what the stage shows and diffs masked screenshots
against a baseline. These checklists are what it cannot judge: whether a thing looks right.

## Running

```sh
npm run dev                                                     # in one terminal
node scripts/check-site.mjs --name baseline                     # before a change
node scripts/check-site.mjs --name after --against baseline     # after it
```

Add `--sizes 1400x900,390x844,768x1024,844x390` for the full set, `--only /meta/` to walk one
collection. Results land in `test-results/visual/<name>/`:

- `report.md`: invariants that failed, facts that changed, screenshots that changed
- `facts.json`: everything recorded, per route, size and chapter
- `shots/`: masked screenshots (canvases and live numbers hidden), the ones that are diffed
- `live/`: the page as a reader sees it, for walking these lists
- `diffs/`: changed pixels in red over a faded copy of the new screenshot

## Walking a checklist

Open the `live/` screenshots for the route and size, or the page itself, and tick each line.
A line that fails gets a note with the screenshot name. Sizes are written as W×H.

| List | Covers |
| --- | --- |
| [lesson-page.md](lesson-page.md) | byline, chapters, prose, figures, maths, footnotes, problems |
| [stage-and-tabs.md](stage-and-tabs.md) | the stage column, tabs, panels, caption |
| [stage-chrome.md](stage-chrome.md) | readings, controls, restart |
| [live-code.md](live-code.md) | code boxes, run, hint, solution, build errors |
| [library-and-cards.md](library-and-cards.md) | library, collection pages, shelves, cassette cards |
| [mobile-drawer.md](mobile-drawer.md) | the drawer at 390×844, 768×1024, 844×390 |
| [brand.md](brand.md) | header, footer, brand spine |
| [dev-view-toggle.md](dev-view-toggle.md) | the L/P switch |
| [problems-panel.md](problems-panel.md) | authoring problems on the page |
| [expected-changes.md](expected-changes.md) | differences from the baseline that are intended |
