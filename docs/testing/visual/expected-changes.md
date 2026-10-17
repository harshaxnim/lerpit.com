# Expected differences from the baseline

Each intended change to what the site shows or records, written when it is made, so the final
comparison is read against this list rather than memory. Anything check-site reports that is
not here is a regression until explained.

| Phase | Where | Change | Why |
| --- | --- | --- | --- |
| P0 | every stage | The panel host is `lerpette-stage__panel lerpette-panel--stack` everywhere (was `--canvas` for single-canvas chapters); the canvas sits in a `.lerpette-panel__box`. Same geometry. | One panel system: every chapter gets a stack. |
| P0 | `/`, simple-body-dynamics | Tab reads "Viewport 3D" (was "Viewport"). | The 3D preset draws on the `viewport3d` panel. |
| P0 | simple-body-dynamics | Coming back to the browser tab keeps the running simulation (`survivesTabReturn` false → true). | Bug fix: the player called `enter()` on visibilitychange, which rebuilt the scene. |
| P0 | simple-body-dynamics | Scrolling back to a chapter resumes its scene where it was, instead of a fresh random one. | Runtimes are kept per chapter. |
| P0 | `/meta/live-code/#js` | A Controls card with a restart icon appears top right. | Restart is stage chrome, offered to every chapter with a `step`. |
| P0 | `/meta/live-code/#cpp` | Panel is `viewport2d` (sketch) with the same picture as the JS chapter; the caption is the chapter's. | `createLiveCodeRuntime` retired; one contract. |
| P0 | `/meta/live-code/` prose | The contract chapter describes `step(s, dt, ctx)` and `viewport2d.draw(g, s, ctx)`. | The prose documented the retired contract. |
| P1 | problems panel | Each problem shows its id after the path (`where · id`). | Problem catalogue. |
| P1 | footer, header | Same text, now read from `site.config.ts`. | Site config. |
| P0 | `/meta/issue-zero/` | The point moves to each chapter's t (the baseline left it stuck at A after the first chapter). | Bug fix: the hand-written loop never restarted once stopped; it is a chapter on the shared clock now. |
| Migration | `/meta/issue-one/` | Each chapter's data is a table in a "Table" panel instead of text in the caption; the "Intentionally left blank" canvas is gone. | issue-one → table panel. Prose line about captions updated to match. |
| Migration | `/meta/issue-zero/` | Tab reads "Viewport 3D". | issue-zero runs on `viewport3d` with an orthographic fit camera. |
| Bug | simple-body-dynamics `#collisions` | Floor bounces lose 5% (floor restitution 0.95) instead of using the ball restitution. | `collisions.cpp` read `ballsRestitution` for the floor; `floorRestitution` was never used. |
| Brand | header, every page | The header's spine bands are sharp (no 0.5px blur). The footer keeps it. | Asked for. |
| Brand | header and footer, below 1180px | The spine keeps its wide-screen shape (height 0.733 × width) and hangs from the top edge, instead of running full height as a tall sliver. | Asked for. |
| Brand | every page `<head>` | apple-touch-icon, web manifest, Open Graph and Twitter card tags, canonical link. | The spine as the home-screen icon and the link-preview image. |
| Readings | readings card | Two modes only, full and mini; the title of the full card shrinks it to one reading; no folded state. `.collapse()` is gone from the API. | Asked for. |
| Harness | `meta@844x390-end`, issue-zero `quarter`, shadow-maps `depth-pass`, live-code at 390 | Whole page offset by 6–20px. | check-site's scroll landed on a different retry; layout identical (footer height checked against the old stylesheet). |
| Harness | simple-body-dynamics @844x390 | Fonts differ. | That baseline entry was re-recorded during a Google Fonts timeout. |
