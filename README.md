# Lerpit

Lerpit is a document-first lesson site for simulation, rendering, and animation topics. The root page is `issue zero`, and every other lesson is a `lerpette`: a long-form mixtape with chaptered text on the left and a live runtime on the right.

## Framework status

The framework is in a good state now:

- one content root: `src/lerpettes/`
- one canonical content model in code
- one player component for root and all lesson pages
- one route for collections and mixtapes
- one asset pipeline for lesson-local files
- no frontmatter, no sidecar metadata, no separate post registry

The only remaining square-bracket filenames are Astro's dynamic route files in `src/pages/`. Those are framework internals, not part of the authoring model.

## Authoring model

Every authored unit lives under `src/lerpettes/`.

You can use either `.md` or `.mdx` filenames, but keep only one document per slot:

- `collection.md` or `collection.mdx`
- `mixtape.md` or `mixtape.mdx`

These are document files, not metadata modules. Do not use frontmatter or exported config objects.

Example:

```text
src/lerpettes/
  issue-zero/
    mixtape.md
    code/
      shared/
        wasm-src/lerp_demo.cpp
        wasm/lerp_demo.js
        wasm/lerp_demo.wasm
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

1. Start with one `#` heading for the lesson title.
2. Put the summary in the first paragraph after that heading.
3. Add metadata in the next paragraph with `Author: <name> | Date: YYYY-MM-DD`.
4. Use `## Heading {#step-id}` for each player chapter.
5. Put the runtime for that chapter at `code/<step-id>/js/index.ts`.
6. If the step needs Wasm, put C++ sources in `code/<step-id>/wasm-src/` and the generated Embind module artifacts will land in `code/<step-id>/wasm/`.
7. If code or Wasm is shared across chapters in one lerpette, put it in that lerpette's `code/shared/` directory.
8. Framework-level shared helpers should live under `src/lib/`, not inside `src/lerpettes/`.

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
  wasm-src/
    my_module.cpp
  wasm/
    my_module.js
    my_module.wasm
```

`js/index.ts` must default-export a runtime object with `mount`, and can optionally implement `enter`, `exit`, `resize`, and `dispose`.

The intended reuse path is to import one of the shared helpers from `@/lib/lerpettes/runtimes`.

Minimal canvas runtime:

```ts
import { createCanvasSketchRuntime } from '@/lib/lerpettes/runtimes';

export default createCanvasSketchRuntime({
  runtimeLabel: 'Runtime / intro',
  status: 'A simple 2D sketch is running.',
  draw(ctx, frame, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillRect(40 + Math.sin(frame * 0.03) * 20, height / 2 - 20, 40, 40);
  }
});
```

If multiple steps in one lerpette share one Wasm module, keep it in that lerpette's `code/shared/wasm/` and initialize it once from shared runtime code. The loader can still pass a resolved path like `ctx.resolveAssetUrl('../shared/wasm/lerp_demo.wasm')` via `locateFile`.

## What is inferred

- collection title = first `#` in `collection.md` or `collection.mdx`
- collection summary = first paragraph after that heading
- mixtape title = first `#` in `mixtape.md` or `mixtape.mdx`
- mixtape summary = first paragraph after that heading
- player steps = each `## Heading {#step-id}`
- runtime id = the H2 id
- runtime file = `code/<step-id>/js/index.ts`

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

`npm run dev` compiles any `code/**/wasm-src/*.cpp` files with `emcc --bind` before starting Astro.
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
