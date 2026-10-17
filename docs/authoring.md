# Writing a lerpette

A lerpette is an article with a stage beside it. The article is Markdown; the stage shows
whatever each chapter's code draws, in the panels its heading names. This is everything an
author needs, in the order you meet it. The framework's own design is in
`docs/features/authoring-platform/`; the list of mistakes the site catches is
[authoring/problems.md](authoring/problems.md).

## Where things live

```
lerpettes/content/
  <collection>/
    collection.md                 # # Title, a summary paragraph, any prose
    <lerpette>/
      mixtape.md                  # the article
      control.toml                # optional: status, landing, order, card style, captions
      figure.svg                  # images and other assets, linked relatively
      code/
        <chapter-id>/
          js/index.ts             # optional: the chapter as a module
          src/*.js, src/*.cpp     # optional: files a code box shows
          wasm/*.cpp              # optional: C++ prebuilt by scripts/build-wasm.sh
        shared/                   # code more than one chapter imports
```

The URL is `/<collection>/<lerpette>/`. `npm run dev` serves everything, drafts included,
with a round **L** button bottom right; press it for **P**, the public view, which hides
exactly what a deployed build hides.

## mixtape.md

```md
Author: Harsha | Date: 2026-09-22

# Particle dynamics {#intro +viewport2d}

One paragraph: the summary, which is also what the library card says.

More intro prose.

## The loop {#loop}

Prose for the first chapter.

## Two views {#views +table}

Prose for the second.
```

- The first line is the byline, exactly in that form. An undated lerpette sorts last.
- The `#` title is chapter 00, the intro. The first paragraph after it is the summary.
- Each `##` is a chapter. `{#id}` names it: its anchor, and its folder under `code/`.
- Maths (`$x$`, `$$…$$`), tables, footnotes and images all work. A lone image with alt
  text becomes a figure with a caption. Raw HTML is switched off (comments are fine).
- No front matter: settings live in `control.toml`.

### Panels in headings

The braces after the id say which panels a section shows, in tab order:

| write | means |
| --- | --- |
| `+name` | add a panel |
| `-name` | drop an inherited one |
| `=name` | replace the list; `=none` empties it |

What the `#` title names, every chapter inherits. So `# Title {#intro +viewport2d}` puts a
2D viewport on every chapter, and `## Data {#data +table}` adds a table tab to one.

| panel | what a view draws with | redraws |
| --- | --- | --- |
| `canvas` | `{ canvas, context2d() }`: a bare canvas; the 2D context is cleared and in layout pixels each frame | every frame |
| `viewport2d` | a sketch: `g.line`, `g.path`, `g.circle`, `g.rect`, `g.text`, `g.caption`, in layout pixels, y down | every frame |
| `viewport3d` | `{ scene, camera, controls, lights, flatLight(), orthographic(w, h), caption() }`, a scene of the chapter's own | every frame |
| `table` | `out.row({ column: value })`, once per row | when the state changes |
| `readout` | `out.line('text')`, once per line | when the state changes |

A chapter that names no panel, and whose code names none, gets `canvas`. A name the
registry does not know is reported as `panel-unknown` and left out.

## A chapter's code

Every chapter is the same shape, whoever writes it and wherever it comes from:

```js
export const state = { x: 1, v: 0 };                 // where a run starts
export function setup(s, ctx) { }                    // once per run, may be async
export function step(s, dt, ctx) { }                 // every frame; dt in seconds, clamped
export function dispose(s, ctx) { }                  // the run is ending
export const viewport2d = {                          // a view: one per panel, by name
  build(g, s, ctx) { },                              //   once per run, after setup
  draw(g, s, ctx) { }                                //   every frame the panel is on screen
};
export const table = { draw(out, s, ctx) { out.row({ x: s.x }) } };
```

Everything is optional. The model (`state`, `setup`, `step`, `dispose`) owns the state;
a view shows it and should not change it. Each run starts from a fresh copy of `state`.

`ctx`, the last argument to everything:

| | |
| --- | --- |
| `ctx.view` | `{ width, height, dpr }` of the panel being drawn (the one on screen during `step`) |
| `ctx.input` | `{ x, y, down, inside }`, the pointer over that panel |
| `ctx.time` | seconds this run has been running; stops while the chapter is off screen |
| `ctx.wasm` | the chapter's C++ module, or null |
| `ctx.controls(opts?)` | the stage's controls card: a [tweakpane](https://tweakpane.github.io/docs/). Folded unless `{ expanded: true }` |
| `ctx.monitors()` | the stage's readings card: `.number`, `.vector`, `.graph`, `.meter`, `.text`, `.fps`, then `.expand()` (every reading) or `.mini(label)` (one reading alone, the default) |
| `ctx.caption(text)` | the line under the panel |

Controls, readings and restart are the stage's, so every chapter has them whatever panel
it draws into. Restart is offered to any chapter with a `step` (set `restart: false` to
hide it); it starts a fresh run and keeps the reader's slider values and folds.

### As a module

`code/<id>/js/index.ts`:

```ts
import { defineChapter } from '@lerpit/framework/chapter';

export default defineChapter({
  caption: 'A spring.',
  state: { x: 1, v: 0 },
  setup(s, ctx) {
    ctx.controls().addBinding(s, 'x', { min: -2, max: 2 });
    ctx.monitors().graph('x', () => s.x);
  },
  step(s, dt) {
    s.v += -8 * s.x * dt;
    s.x += s.v * dt;
  },
  viewport2d: {
    draw(g, s, ctx) {
      g.circle(ctx.view.width / 2, ctx.view.height / 2 - s.x * 80, 10, 0xd17041);
    }
  }
});
```

Configuration a module can carry beside the code: `caption`, `panels` (used only when the
heading names none), `restart`, and `wasm` for prebuilt C++ (below).

### In a code box

A `lerpit` fence in a chapter's prose becomes an editor beside the words:

````md
```lerpit src/index.js:step src/forces.js:force src/draw.js:paint
```
````

Each entry is a file under `code/<id>/`, and optionally the region the reader is asked to
edit. The files export the same names as a module; when a chapter has both, what the reader
builds replaces the module's names one by one. The first box in a chapter builds when the
chapter is first shown; run (or Cmd+Enter) rebuilds.

Regions are comments in the file:

```js
// lerpit:step:edit:start
// export function step(s, dt) {
//   // the starter, commented out
// }
// lerpit:step:edit:hint
// A line of help.
// lerpit:step:edit:solution
export function step(s, dt) { s.x += s.v * dt; }
// lerpit:step:edit:end
```

Kinds are `edit` (an exercise: starter, optional hint, solution), `highlight` and `hide`.
The language of each file comes from its extension: `.js .mjs .cjs .ts` run as modules,
`.cpp .cc .cxx .c` are compiled in the browser into `ctx.wasm` (plain `extern "C"`
functions; no Embind in the browser compiler), `.h .hpp` are shown and included.

### Prebuilt C++

C++ under `code/<id>/wasm/` is built by `npm run build:wasm` (and rebuilt by the dev
server when it changes) into `code/<id>/build/<name>.js` and `.wasm`, with Embind. Hand it
to the chapter:

```ts
export default defineChapter({
  wasm: () => import('../build/struct.js'),
  table: { draw(out, s, ctx) { out.row(ctx.wasm.getDefaultSphere()) } }
});
```

It is loaded once per page. A module that `#include`s a library's header (for example
`world.h` from `lerpettes/libs/physics/wasm/`) is linked against that library; one that
does not is not.

### Presets

For shapes that recur, these build the chapter for you:

| preset | for |
| --- | --- |
| `createCanvasSketchRuntime({ status, draw(g, frame, w, h) })` from `@lerpit/framework/runtimes` | an animation with no state |
| `create3DRuntime({ caption, setup({ scene, camera, controls, monitors, onFrame, onTeardown }) })` from `@lerpit/framework/runtimes/create3DRuntime` | a three.js scene built by one function |
| `create3DPhysicsRuntime({ caption, factory, construct, setup({ world, module, scene, … }) })` from `@lerpit/libs/physics/js` | a physics world advanced in fixed steps, with `addSphere`, `addBoundsBox`, `totalEnergy` |

### By hand

A chapter that needs the whole lifecycle can default-export a runtime: `{ panels?, mount,
enter?, exit?, resume?, resize?, dispose? }`, each handed a context with `panels` (the
stack), `surface` (the first panel's target), `stage` (controls, monitors, caption,
restartable), `editors`, `codePath` and `resolveAssetUrl`. One runtime instance serves
one chapter.

## control.toml

```toml
status = "published"      # published (default) | unlisted (routed, not listed) | draft (local only)
landing = true            # serve this lerpette at '/'
order = 1                 # place in its collection; ordered ones first, then newest first
card_style = "sleeve"     # the library card's style (see website/src/lib/cardArt/styles.ts)

[caption]                 # per chapter id: the line under the panel, overriding the code
loop = "A spring, integrated by hand."

[idle_status]             # per chapter id: what its code box says before the first build
cpp = "Press run to fetch the toolchain and build."
```

Every key is optional and a bad value falls back to the default, so a broken file can
never unpublish anything; it is reported instead.

## Site settings

`website/src/site.config.ts`: the wordmark, the author and year in the footer, the header
links, and the collection whose newest published lerpette is served at `/`.

## Checking your work

- The problems box at the top of the page (local view) lists what the site found, each
  with its id and fix. See [authoring/problems.md](authoring/problems.md).
- `npm test` runs the unit tests; `node scripts/check-site.mjs` walks every page in
  Chrome and diffs it against a baseline (see `docs/testing/visual/README.md`).
