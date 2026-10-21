# Stage readings and controls: developer notes

The stage is the column beside a lesson that shows a step's simulation. This change
gave it two corner cards, a reading API for step authors, and a new frame.

- **Top right: Controls.** The restart button, and the step's tweakpane once it asks for
  one. The word "Controls" is the fold toggle. It starts folded.
- **Top left: Readings.** Live values the step reports, in two modes: full (every
  reading, under the word "Readings") and mini (one reading alone, without its label).
  It starts mini, on the first reading. Clicking the mini reading opens the full card;
  clicking a reading in the full card, or the word "Readings", shrinks it again.
- **Frame.** Folder tabs stand on the stage's top edge, right-aligned. On a wide screen
  they sit in the pinned byline's row. The panel is 75% paper, and the page's graph paper
  shows through it.

There is no admin or privileged surface, so there is no admin guide. Reader-facing
behaviour is in `user-guide.html`.

## Adding readings to a step

`readings()` sits beside `controls()` in a 3D step's setup context. Every method takes a
label and a function returning the current value, and returns that one reading, the
way the controls card's `addBinding` returns its binding, so the two cards read alike:

```ts
function setup({ world, controls, readings }: Setup3DPhysicsContext) {
  readings().number('t', () => world.time, { unit: 's' });
  readings().graph('PE + KE', () => totalEnergy(world), { unit: 'J', min: 0 });
  readings().meter('energy kept', () => totalEnergy(world) / startEnergy, { percent: true });
  readings().vector('v', () => ball.velocity(), { unit: 'm/s' });
  readings().number('floor hits', () => hits, { digits: 0 });
  readings().text('state', () => (resting ? 'settling' : 'bouncing'), { tone: (v) => (v === 'settling' ? 'ok' : 'info') });
  readings().fps();
}
```

| Kind | For | Options |
| --- | --- | --- |
| `number` | a time, a count, a total | `unit`, `digits` (2; use 0 for counts) |
| `vector` | position, velocity, force; accepts `[x, y, z]`, a typed array or `{x, y, z}` | `unit`, `digits` |
| `graph` | a value over the last few seconds, plus its current value | `unit`, `digits` (1), `min`, `max` (auto when left out), `seconds` (6) |
| `meter` | a value inside known bounds, as a bar | `min` (0), `max` (1), `percent`, `unit`, `digits`, `mark` (a reference tick) |
| `text` | a word or two of state | `tone(value)` returning `'ok'`, `'info'` or `'warn'` for a coloured dot |
| `fps` | frames per second, measured by the framework; turns warm below 30 | optional label |

### Start states

A step starts with Controls folded and Readings showing only the first reading. A step
that wants otherwise says so:

```ts
const pane = controls({ expanded: true }); // controls showing from the start

readings().graph('PE + KE', () => totalEnergy(world));
readings().number('t', () => world.time, { unit: 's' });
readings().expand();       // every reading showing
// or readings().mini('t') // shrunk to a reading other than the first
```

The view calls go anywhere in the chain, and the last one wins. `mini()` with a label the
step never adds falls back to the first reading and warns in the console.

The reader's changes outlast a restart of the same step. A new chapter starts as its own
code asks, not as the reader left the previous one.

### Sampling

The framework calls the value functions. Graphs and fps are read every frame. Everything
else is read about ten times a second, so a value holds still long enough to be read.
The card is torn down with the step, so a step keeps no state just to feed a reading and
never needs `onFrame` for one.

## Files

| File | What it holds |
| --- | --- |
| `lerpettes/framework/readings/readings.ts` | The Readings card: the `KINDS` table, the builder, sampling, folding and keeping one reading. |
| `lerpettes/framework/readings/format.ts` | Number formatting, vector coercion, graph range and bar fraction, with no DOM. |
| `lerpettes/framework/readings/view.ts` | `resolveReadingsView`: the start-state rule (restored, then authored, then default) and the fallback for an unknown mini label. |
| `lerpettes/framework/tests/js/readingsFormat.test.ts`, `readingsView.test.ts` | Tests for `format.ts` and `view.ts`. |
| `website/src/components/LerpettePlayer.astro` | Wraps the byline's crumbs in `.lerpette-brow__crumbs`, so they can take the lesson's track. |
| `lerpettes/framework/stage/chrome.ts` | The stage chrome, one set of cards per chapter: the Controls card (title toggle, Lucide `rotate-ccw` restart, `controls({ expanded })`) and the Readings card. Settles the readings view after setup, keeps the reader's choices across a restart, hides a chapter's cards when another is shown. (Moved here from `create3DRuntime.ts` by the authoring-platform work, so every chapter has them.) |
| `website/src/lib/player/stagePlayer.ts` | Owns the two corners, `.lerpette-panel__tray` (top right) and `.lerpette-panel__readings` (top left), and puts them back into the panel box after every stack swap. |
| `lerpettes/libs/physics/js/create3DPhysicsRuntime.ts` | Passes `readings` through to physics steps. |
| `website/src/styles/global.css` | `--stage-face`, `--chrome-face`, the `--graph-paper` layers and the fixed `body::before`, the folder tabs, the cards and the readings. |

## How it fits together

- **A kind is one entry in `KINDS`.** It has `build(row, label, options)`, `show(state,
  value, options, now)`, and optionally `sample` (for history) and `everyFrame`. To add a
  kind, add an entry there and a method on `Readings`. Panel kinds and `control.toml`
  fields grow the same way.
- **Memory lasts one chapter.** Each chapter's stage owner keeps `stage:controls-collapsed`,
  `stage:readings` (a `ReadingsView`: `{ mode: 'expanded' | 'mini', mini }`; two modes, full and mini)
  and, across a restart, `stage:pane` (the slider values). A restart reads them back; a
  chapter seen for the first time starts from its own code. Leaving a chapter hides its
  cards and returning shows them as the reader left them.
- **The view settles after setup.** The builder records `expand()` and
  `mini()` as they are called. `settle()` runs once setup resolves and has every label,
  so a step can name its view before or after adding readings. A reading added later
  joins the current view.
- **The frame is drawn by the tab row.** `.lerpette-stage__tabs::after` draws the top
  edge beside the tabs, and each closed tab draws the edge under itself. The open tab has
  a transparent bottom border, which leaves a gap in the edge. The panel's face is
  translucent, so it could not paint over a line to make that gap.
- **The graph paper is shared.** `--graph-paper`, `--graph-paper-size` and
  `--graph-paper-position` on `:root` are used in three places, all fixed to the window
  so their grids line up:
  - `body::before`, the page itself.
  - The stage drawer under 1180px.
  - `.lerpette-stage__panel::before` and the open tab's `::before`, on wide screens.
- **The viewport is a window in the sheet.** The lesson area (`.lerpette-player`) is a
  95% paper sheet on the graph-paper page, so nothing behind the stage has a grid to show
  through. The panel's `::before` draws the page grid at `1 - --stage-face-alpha`
  strength, which is what a face of that alpha over the page would show. It uses
  `background-attachment: fixed` to line up with the page, which iOS Safari ignores. On
  the iPad layout that is wider than 1180px, the viewport's grid can sit a few pixels off
  the page's; the sheet's border lies between them, so it is hard to see. In the drawer,
  the drawer's own grid already shows through, so `::before` is turned off there.
- **Tabs live in the stage and stand in the byline.** On wide screens the tab row is
  positioned at `bottom: 100%` of the stage surface, which puts it in the byline's row.
  The stage gets `z-index: 4`, because sticky makes it its own stacking context and it has
  to rise above the byline (3). The byline uses the same `--player-columns` tracks as the
  lesson grid, so its crumbs end, with an ellipsis, where the lesson column does. Its
  text sits half a step lower so it reads on the same line as the tab labels. In the
  drawer, the tabs fall back into the drawer's own flow.
- **Narrow stages split the corners.** `.lerpette-stage__surface` is a size container.
  Under 34rem, each corner gets half the top edge and tweakpane labels move above their
  sliders.

## Edge cases and how they were checked

| Case | Behaviour | Checked by |
| --- | --- | --- |
| NaN, Infinity, a non-number | shows "—" | unit test |
| A read that throws | shows "!" in warn colour, with the message as tooltip; logged once to the console | approval mock |
| Huge or tiny values | exponent form; the sign slot stays, so columns do not shift | unit test |
| Constant graph | range pads around the value instead of drawing a flat line on the floor | unit test |
| Step with no readings | no Readings card at all | browser, intro chapter |
| Step with no controls | Controls card is the restart button alone | browser, intro chapter |
| Default start | Controls folded, Readings showing only the first reading | browser, forces |
| `controls({ expanded: true })`, `readings().mini('missing'); readings().expand()` | both open; the last view call wins | browser, temporary edit to forces (reverted) |
| Reader's changes, then restart | kept | browser |
| Reader's changes, then next chapter | reset to that chapter's start | browser, forces then collisions |
| Unknown `mini()` label | first reading, with a console warning | unit test and code |
| Long byline beside tabs | crumbs end with an ellipsis at the lesson column; tabs untouched | browser, injected long title |
| Page top, before the byline pins | tabs still in the byline row, on the panel's edge | browser |
| Phone drawer (390px) | corners split, no overlap, tweakpane value not clipped, no horizontal scroll | browser |
| Production build | only `lucide-rotate-ccw` ships; the dev view switch is absent | build output |

## Known limits

- Every chapter reaches the cards through `ctx.readings()` / `ctx.controls()`; the chapter
  runtime ticks readings after each frame. A hand-written runtime must call
  `ctx.stage.tick(now)` itself.
- Designed for later but not built: groups of readings, graphs with several series, and
  histograms.
- A reading is kept by its label. Two readings with the same label in one step would be
  kept together.
