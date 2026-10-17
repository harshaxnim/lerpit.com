# Stage chrome: readings, controls, restart

Routes: `/` (simple-body-dynamics: forces and collisions have controls and readings),
`/meta/live-code/#js`. Size: 1400×900, then the drawer at 390×844.

## Controls (top right)
- [ ] Card with a "Controls" title and a restart icon on the right.
- [ ] Starts folded unless the chapter asked for `expanded`; the title folds and unfolds it.
- [ ] Sliders change the scene immediately.
- [ ] Restart rebuilds the chapter, keeps the slider values and the fold state.
- [ ] A chapter with restart but no controls shows a card with the icon alone.
- [ ] At narrow widths the label sits above the slider and the card takes half the top edge.

## Readings (top left)
- [ ] Starts shrunk to its first reading (mini) unless the chapter asked otherwise.
- [ ] Clicking the mini reading expands the card; clicking a reading in the full card shrinks to it.
- [ ] Two modes only: the title of the full card shrinks it back to the reading last shown alone; there is no folded state.
- [ ] Graph line follows the value, dot round, range fixed when min/max are given.
- [ ] Restart keeps the reader's choice; a new chapter starts from its own.
- [ ] A reading that throws shows `!` in place of its value, once in the console.

## Returning to the tab
- [ ] Switch to another browser tab for a few seconds and come back: the scene carries on
      from where it was, not from the start.
