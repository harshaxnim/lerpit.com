# Lerpit

Lerpit is a document-first lesson site for simulation, rendering, and animation topics. The root page is `issue zero`, and every other lesson is a `lerpette`: a long-form mixtape with chaptered text on the left and a live runtime on the right.

## Repository layout

The repo has two roots. `website/` renders the site; `lerpettes/` holds the lessons and everything a lesson imports. The dependency runs one way: the website reads the lerpettes, never the reverse.

```text
website/
  public/               static files served at the site root
  src/pages/            routes
  src/layouts/          page shell
  src/components/       site UI
  src/styles/           global.css, the only stylesheet
  src/lib/
    content.ts          parses the lerpettes tree into the content model
    runtimeLoader.ts    resolves a step id to its runtime module
    playerClient.ts     the in-browser player

lerpettes/
  content/              the lessons, one directory per collection
  framework/            what step code imports: types.ts, runtimes/
  libs/                 engines shared across lessons, e.g. physics/
```

Step code reaches into `lerpettes/` through one alias, `@lerpit/*`, which mirrors the tree:

```ts
import type { LerpetteStepRuntime } from '@lerpit/framework/types';
import { createCanvasSketchRuntime } from '@lerpit/framework/runtimes';
import { bindMesh, create3DPhysicsRuntime } from '@lerpit/libs/physics/js';
```

Inside `website/` imports stay relative. Nothing under `lerpettes/` imports from `website/`.

## Framework status

The framework is in a good state now:

- one content root: `lerpettes/content/`
- one canonical content model in code
- one player component for root and all lesson pages
- one route for collections and mixtapes
- one asset pipeline for lesson-local files
- no frontmatter, no sidecar metadata, no separate post registry

The only remaining square-bracket filenames are Astro's dynamic route files in `website/src/pages/`. Those are framework internals, not part of the authoring model.

## Authoring model

Every authored unit lives under `lerpettes/content/`.

You can use either `.md` or `.mdx` filenames, but keep only one document per slot:

- `collection.md` or `collection.mdx`
- `mixtape.md` or `mixtape.mdx`

These are document files, not metadata modules. Do not use frontmatter or exported config objects.

Example:

```text
lerpettes/content/
  issue-zero/
    mixtape.md
    code/
      shared/
        wasm/lerp_demo.cpp
        build/lerp_demo.js
        build/lerp_demo.wasm
      start/
        js/index.ts
  physics-engine/
    collection.mdx
    simple-dynamics/
      mixtape.mdx
      code/
        intro/
          js/index.ts
        impulse/
          js/index.ts
```

## Authoring a lerpette

Author a lesson as a normal markdown document in `mixtape.md` or `mixtape.mdx`.

Rules:

1. Start with the metadata line, `Author: <name> | Date: YYYY-MM-DD`, as the very first line.
2. Put one `#` heading under it for the lesson title.
3. Put the summary in the first paragraph after that heading.
4. Use `## Heading {#step-id}` for each player chapter.
5. Put the runtime for that chapter at `code/<step-id>/js/index.ts`.
6. If the step needs Wasm, put C++ sources in `code/<step-id>/wasm/` and the generated Embind module artifacts will land in `code/<step-id>/build/`.
7. If code or Wasm is shared across chapters in one lerpette, put it in that lerpette's `code/shared/` directory.
8. Helpers shared across lerpettes belong in `lerpettes/framework/` (runtime helpers) or `lerpettes/libs/` (engines), not inside `lerpettes/content/`.

Inside a chapter you can write:

- paragraphs
- images
- math
- code fences
- lists
- footnotes

The supported authoring surface is document syntax: markdown, links, images, math, and code. The framework does not depend on custom MDX component exports.

The left pane renders the lesson document. The right pane loads the runtime that matches the active chapter id.

## Expected step code structure

The smallest useful step is just:

```text
code/<step-id>/
  js/index.ts
```

If the step needs Wasm:

```text
code/<step-id>/
  js/index.ts
  wasm/
    my_module.cpp
  build/
    my_module.js
    my_module.wasm
```

`js/index.ts` must default-export a runtime object with `mount`, and can optionally implement `enter`, `exit`, `resize`, and `dispose`.

The intended reuse path is to import one of the shared helpers from `@lerpit/framework/runtimes`.

## Editable code in a chapter

A chapter can hand the reader its own source. They edit it in the reading column, press run, and the panel redraws from what they wrote. Both languages build in the tab; nothing is sent anywhere.

### The three places it is written

```text
mixtape.md                 where the box goes, and which files it shows
code/<step-id>/src/*       the source, with regions marked in comments
code/<step-id>/js/index.ts what the built result drives
```

Nothing else configures it. Each file answers one question, and no question is answered twice.

### The fence

````markdown
```lerpit src/index.js:step src/forces.js:force src/draw.js:paint
```
````

Each word is a file and, after a colon, the region in it the chapter is about. A word with no colon means the whole file. Paths are relative to `code/<step-id>/`. The order written is the tab order, and the first is the tab that opens.

Everything the fence claims is checked at build time against the files on disk. A region name that does not exist is reported on the page, naming the regions that file does have.

### Region markers

```cpp
// lerpit:force:edit:start
//   return 0.0f;   // your turn
// lerpit:force:edit:hint
// Hooke: the force opposes the displacement.
// lerpit:force:edit:solution
  return -K * x - D * v;
// lerpit:force:edit:end
```

One file carries every version. The starter is written as comments, so what is in git is the working answer: it compiles, it runs from a shell, and there is no second copy to drift.

Three kinds:

- `edit` sets an exercise. Marked until the reader changes it, then not.
- `highlight` points at code without setting an exercise. Stays marked.
- `hide` folds boilerplate behind a band the reader can open.

`:hint` is optional and sits between `:start` and `:solution`. The whole file is editable regardless; a region says what the chapter is about, not what the reader may touch.

### The frame contract

A frame is two phases, in this order:

```text
step(state, dt)               advance the state
draw(target, state, view)     put it on screen
```

**The framework owns** the frame loop, the frame delta and its clamp, the pixel ratio, clearing the surface, re-acquiring it when the canvas is replaced, pausing while the document is hidden, compiling, the editor, and reporting what threw.

**The author writes** `code/<step-id>/js/index.ts`:

```ts
import { createLiveCodeRuntime } from '@lerpit/framework/runtimes';

export default createLiveCodeRuntime<{ x: number; v: number }>({
  state: () => ({ x: 1, v: 0 }),
  caption: 'A spring, integrated and drawn by your own code.'
});
```

| | |
| --- | --- |
| `state?` | a fresh state object, rebuilt on every build. Omit for a scene with nothing to carry between frames. |
| `stepper?` | turn a build into the step function. Only needed when the state lives somewhere the framework cannot see, as it does inside a wasm module. |
| `draw?` | what to draw when the fence names no drawing file. |
| `scene?` | which surface to draw into. Omit for a 2D canvas context. |
| `caption?` | what the band under the panel says once a build is running. |

**The reader writes** the files the fence names:

```js
export function step(s, dt) {
  const a = force(s);
  s.v += a * dt;
  s.x += s.v * dt;
}

export function draw(g, s, view) {
  const midY = view.height / 2;
  g.beginPath();
  g.arc(48, midY - s.x * 90, 11, 0, Math.PI * 2);
  g.fill();
}
```

`view` carries `width`, `height`, `dpr`, `t` in seconds since the build started, and `frame`.

Both functions are found wherever the reader wrote them, across every file in the box, so neither has to be re-exported through an entry file. Two files exporting the same name is reported rather than resolved silently.

Every part is optional except that something must draw. A chapter can hand the reader the physics, the picture, both, or neither.

### When either half throws

A build error goes to the status line under the editor. A fault at frame time is reported once, with which half threw, and that half stops being called so the log is not flooded sixty times a second. The panel keeps the last frame that worked.

Note that the reader's JavaScript runs in strict mode, because sucrase emits a `"use strict"` directive when it rewrites their modules. An undeclared assignment throws `ReferenceError` rather than quietly creating a global, exactly as it would in any ES module.

### Scene kinds

A scene kind says what a runtime draws into, the way a panel kind says what fills the right column:

```text
LerpettePanelKind<Surface>   canvasViewportPanel
LerpetteSceneKind<Target>    canvas2dScene, threeScene
```

`canvas2dScene` is the default and hands `draw` a `CanvasRenderingContext2D`, cleared and in layout coordinates. `threeScene` hands it a three.js scene, camera and renderer; it is used by `create3DRuntime` today, and reader-editable 3D is not wired up yet.

Import the 3D helpers by their own path, never from `@lerpit/framework/runtimes`, so a 2D lesson does not ship the WebGL renderer:

```ts
import { create3DRuntime } from '@lerpit/framework/runtimes/create3DRuntime';
```

## Panel kinds

The right-hand column is a **panel**. The player owns the slot around it — the box, the
sticky geometry, the mobile drawer, the caption band — and a panel kind owns everything
inside it. The canvas viewport is one kind, not a permanent fixture.

A step names its panel on the runtime object it already default-exports:

```ts
import { codeListingPanel } from '@lerpit/framework/panels/codeListing/codeListingPanel';

export default {
  panel: codeListingPanel,
  mount(ctx) { ctx.surface.setSource(source); },
  enter(ctx) { ctx.surface.highlight('12-18'); }
};
```

`ctx.surface` is whatever that panel's `create()` returned, so it is the panel kind that
decides what a runtime can draw on. A step that names no panel gets the canvas viewport,
and `ctx.surface.canvas` is the `<canvas>` to draw into. Both shared helpers
(`create3DRuntime`, `createCanvasSketchRuntime`) name it for you.

Panels swap when the reader scrolls across a step whose panel differs from the current
one. On a swap the player disposes the mounted runtimes, destroys the panel, empties the
host and clears `ctx.shared` — so anything cached in `shared` lives exactly as long as
the panel does, which is what lets one WebGL renderer serve every 3D step in a lesson.
A runtime that caches DOM-derived state in a closure instead must re-derive it when the
node changes; `createCanvasSketchRuntime` shows the shape.

### Adding a kind

Create a module under `lerpettes/framework/panels/<kind>/` exporting a
`LerpettePanelKind`: a `label` (the corner label and the drawer toggle both read it), a
`hostClass`, a `create(slot)` that builds DOM inside `slot.host` and returns the surface,
and optional `resize`/`destroy`. Add its styles to `website/src/styles/global.css` under
that `hostClass`. Nothing else in `website/` changes — the player resolves panels by
module identity and never imports one, which is also why a lesson that uses a listing
panel does not ship three.js.

Minimal canvas runtime:

```ts
import { createCanvasSketchRuntime } from '@lerpit/framework/runtimes';

export default createCanvasSketchRuntime({
  status: 'A simple 2D sketch is running.',
  draw(ctx, frame, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillRect(40 + Math.sin(frame * 0.03) * 20, height / 2 - 20, 40, 40);
  }
});
```

If multiple steps in one lerpette share one Wasm module, keep its sources in that lerpette's `code/shared/wasm/` and initialize it once from shared runtime code. Artifacts land in `code/shared/build/`; the loader passes a resolved path like `ctx.resolveAssetUrl('../shared/build/lerp_demo.wasm')` via `locateFile`.

## What is inferred

- collection title = first `#` in `collection.md` or `collection.mdx`
- collection summary = first paragraph after that heading
- mixtape title = first `#` in `mixtape.md` or `mixtape.mdx`
- mixtape summary = first paragraph after that heading
- player steps = each `## Heading {#step-id}`
- runtime id = the H2 id
- runtime file = `code/<step-id>/js/index.ts`
- mixtape slug = the directory name
- collection slug = the directory name

## When a document does not parse

Nothing written under `lerpettes/content/` fails the build. A document that breaks a rule
above is still published, and what is wrong with it is listed at the top of its own page,
with the line to write to fix it. The lerpette is marked in the library, and a production
build prints the same list to the terminal.

A lerpette with no chapters, or with no runtime under any chapter, renders as prose with
no panel.

### Slug and title name the same thing

A lesson is named twice: the directory name becomes the URL segment, and the `#` heading becomes the title. Neither can be derived from the other. The directory has to exist before anything can read the document inside it, and deriving the title from the directory would force every title into slug shape.

So keep them in sync by hand, and treat the slug as an address, not as a label:

- name the directory a slugified form of the H1 (`Simple body dynamics` -> `simple-dynamics/`)
- never show the slug to a reader; the title is the only reader-facing name
- renaming the H1 does not change the URL, and should not, since links to it already exist

## Local development

Recommended environment:

- Node.js 22
- npm 10 or newer
- Python 3.10 or newer (required by `emsdk`)
- Emscripten (`emcc`) with Embind support

Start the dev server:

```bash
npm install
npm run setup
npm run dev
```

`npm run dev` compiles any `code/**/wasm/*.cpp` files with `emcc --bind` before starting Astro (per-lerpette `wasm/build.sh` scripts are delegated to when present; output goes to the sibling `build/` directory).
If `emcc` is unavailable, the build fails fast.
`npm run setup` installs a repo-local Emscripten toolchain under `.tools/emsdk` if a system `emcc` is not already available.
If you have Emscripten in a non-default location, point the build at it with `EMCC_BIN=/path/to/emcc`.
The Wasm build is incremental: unchanged outputs are skipped, so `npm run dev` does not recompile every step on every restart.

## Build

```bash
npm run build
```

This compiles lesson code Wasm assets and then builds the Astro site.

## Routes

- `/` root lerpette (`issue zero`)
- `/library/` lerpette library
- `/<collection-slug>/` collection page
- `/<collection-slug>/<mixtape-slug>/` lesson page

## Notes

- later lessons do not use issue numbers
- cassette cards are inferred from document titles and summaries, not frontmatter
- the old flat `posts` model is removed
