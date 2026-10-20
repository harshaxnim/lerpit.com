# Lerpit

Lerpit is a document-first lesson site for simulation, rendering, and animation topics. Every lesson is a `lerpette`: a long-form article with chapters on the left and a live stage on the right that shows what each chapter's code draws. `/` serves the newest published lerpette of the landing collection (set in `website/src/site.config.ts`, or by `landing = true` in a lerpette's `control.toml`).

**Writing a lesson:** read [docs/authoring.md](docs/authoring.md). It covers the document, panels in headings, the one chapter contract, code boxes, prebuilt C++, presets and `control.toml`. Every problem the site can report is in [docs/authoring/problems.md](docs/authoring/problems.md).

## Repository layout

The repo has two roots. `website/` renders the site; `lerpettes/` holds the lessons and everything a lesson imports. The dependency runs one way: the website reads the lerpettes, never the reverse.

```text
website/
  public/               static files served at the site root
  src/pages/            routes
  src/layouts/          page shell
  src/components/       site UI
  src/styles/           global.css (site layout and tokens)
  src/site.config.ts    name, author, header links, landing collection
  src/lib/
    content.ts          parses the lerpettes tree into the content model, reports problems
    control.ts          reads control.toml
    problems.ts         the catalogue of authoring problems, by id
    runtimeLoader.ts    resolves a chapter to its code/<id>/js/index.ts module
    playerClient.ts     wires the page chrome and the stage player in the browser
    player/             pageChrome.ts (byline, sections, drawer), stagePlayer.ts (panels, runtimes)

lerpettes/
  content/              the lessons, one directory per collection
  framework/
    chapter.ts          createStage: the one chapter contract
    panels/             the panel registry: canvas, viewport2d, viewport3d, table, readout
    runtimes/           the chapter runtime and presets (sketch, 3D)
    stage/              the stage chrome: controls, readings, caption, restart
    monitors/           reading kinds
    three/              the shared three.js bundle
    wasm/               loadModule, for prebuilt C++
    theme.ts            the palette, for code that draws
  libs/                 engines shared across lessons: live-code (editor, compilers), physics
```

Lesson code reaches into `lerpettes/` through one alias, `@lerpit/*`, which mirrors the tree:

```ts
import { createStage } from '@lerpit/framework/chapter';
import { create3DRuntime } from '@lerpit/framework/runtimes/create3DRuntime';
import { addSphere, create3DPhysicsRuntime } from '@lerpit/libs/physics/js';
```

Inside `website/` imports stay relative. Nothing under `lerpettes/` imports from `website/`.

## In one screen

````md
Author: Harsha | Date: 2026-09-22

# Springs {#intro +viewport2d}

The summary paragraph, which the library card shows.

## Hooke's law {#hooke +readout}

Prose, maths, figures.

```lerpit src/step.js:step src/draw.js
```
````

- Each `##` is a chapter; `{#id}` is its anchor and its folder, `code/<id>/`.
- `+name` in a heading adds a panel; the `#` title's panels are inherited by every chapter.
- A chapter's code is `state`, `setup`, `step`, and one view per panel (`viewport2d: { draw(g, s, ctx) }`), written as a module (`code/<id>/js/index.ts` with `createStage`) or in the files a `lerpit` fence shows.
- `ctx.controls()`, `ctx.monitors()` and `ctx.caption()` reach the stage from any chapter.
- Mistakes never break the build: they are listed at the top of the page with a fix.

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
If there is C++ to build and `emcc` is unavailable, the build fails fast; a site with no C++ never asks for it.
A module is linked against a library under `lerpettes/libs/` only when it includes one of that library's headers, and is rebuilt when that library changes.
`npm run setup` installs a repo-local Emscripten toolchain under `.tools/emsdk` if a system `emcc` is not already available.
If you have Emscripten in a non-default location, point the build at it with `EMCC_BIN=/path/to/emcc`.
The Wasm build is incremental: unchanged outputs are skipped, so `npm run dev` does not recompile every step on every restart.

## Build

```bash
npm run build
```

This compiles lesson code Wasm assets and then builds the Astro site.

## Tests

```bash
npm test                                  # C++ physics tests, then every unit test (vitest)
node scripts/check-site.mjs --name base   # walk the running dev server in Chrome; record
node scripts/check-site.mjs --name after --against base   # and compare
```

`check-site` visits every route at several sizes, activates every chapter, records what the stage shows and diffs masked screenshots; see [docs/testing/visual/README.md](docs/testing/visual/README.md) for the checklists that go with it.

## Routes

- `/` the landing lerpette
- `/library/` every listed lerpette, by collection
- `/<collection-slug>/` collection page
- `/<collection-slug>/<lerpette-slug>/` lesson page
