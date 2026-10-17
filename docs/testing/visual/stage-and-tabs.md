# Stage and tabs

Size: 1400×900 (the drawer is in [mobile-drawer.md](mobile-drawer.md)).

## Column
- [ ] Sticky under the byline, as tall as the window below it, never shorter than 520px.
- [ ] Panel face shows the page grid through it, lined up with the page's own grid.
- [ ] Border on three sides; the tab row draws the top edge.

## Tabs
- [ ] One tab for a one-panel chapter, reading as the panel's name, not pressable.
- [ ] One tab per panel for a multi-panel chapter (`/meta/live-code/#js`: Viewport, Readout), in heading order.
- [ ] The open tab joins the panel (no line under it); the others sit behind.
- [ ] Clicking a tab shows its panel at once, already up to date.
- [ ] The chosen tab is kept when scrolling to another chapter that has the same panel.
- [ ] Moving between chapters swaps the tab strip in one step, never blank in between.

## Panels
- [ ] Viewport (2D sketch, canvas, 3D) fills the panel, crisp at the device pixel ratio.
- [ ] Readout: monospace lines, scrolls inside its box, caption hidden over it.
- [ ] Table: header row sticky, numbers right-aligned with fixed decimals, caption hidden.
- [ ] 3D: drag orbits, wheel zooms, the motion coasts to a stop.
- [ ] A chapter switch shows the next chapter's scene only; nothing left over from the last one.

## Caption
- [ ] One centred band at the foot, 80% wide, wraps rather than overflowing.
- [ ] Says what this chapter's code or config says; empty means no band at all.
- [ ] Hidden on text panels.
