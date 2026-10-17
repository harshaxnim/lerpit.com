# Authoring platform: plan

The architecture review (`lerpit-architecture.html`, 2026-10-17) found that most of what a
lerpette can do is reachable only one way, often from one lesson. Panels exist twice, there
are four signatures for "draw the state", controls and readings live inside the 3D runtime,
and several lifecycle bugs come from every runtime keeping its own clock. This plan turns
those findings into one platform an author can learn once, and gives it a safety net so the
change can be shown not to break the lessons that already exist.

Everything here is local work in the current checkout. Nothing is committed or pushed until
the owner has looked at it.

## Goal

An author writes a chapter in one shape, names the panels it shows in its heading, and gets
the stage's controls, readings, caption and restart whichever panel it draws into. Mistakes
show up on the page as problems with fixes, not as a blank panel. Nothing an author needs is
hard-coded in a component.

## Personas

| Persona | Needs |
| --- | --- |
| Reader | Lessons look and behave as before: chapters activate on scroll, panels draw, the drawer works, nothing restarts when they come back to the tab. |
| Lesson author (writes prose and chapter code) | One contract; any panel from a heading; stage chrome from any chapter; problems that name the fix; one doc to read. |
| Framework author (adds a panel, a reading kind, a language) | One registry entry and one folder, with CSS beside it. |
| Site owner | Landing, order, card style and site identity in config rather than in components. |

## Target architecture

```
heading {#id +viewport2d +table}          code/<id>/js/index.ts            lerpit fence
        │ panel names                            │ module source              │ editor source
        ▼                                        ▼                            ▼
   panel registry ──► panel stack (owned by the player, kept while the list is the same)
   canvas · viewport2d · viewport3d · table · readout
        │ targets (scoped per chapter where the panel holds a scene)
        ▼
   chapter runtime: one clock (dt, seconds), model {state, setup, step, dispose},
   views {<panel>: {build, draw}}, merged from module and editor builds
        │ ctx: wasm, view, input, time, controls(), monitors(), caption()
        ▼
   stage chrome (player slot): controls + restart (right), readings (left), caption (foot)
   kept under `stage:` keys; cleared on chapter change, kept across restart
```

Presets are chapter definitions, not runtimes of their own:

- `createCanvasSketchRuntime({status, draw})` is a chapter on `canvas` with a frame counter.
- `create3DRuntime({caption, setup})` is a chapter on `viewport3d` with the old flat lighting
  and camera, its own scene per chapter, and restart.
- `create3DPhysicsRuntime` is the 3D preset plus a `World` advanced by the runtime's `dt`.
- `createLiveCodeRuntime` is retired. Its chapter (`meta/live-code#cpp`) moves to `+viewport2d`.

## Phases

Each phase ends with the unit suite, `astro check`-level type safety (via `tsc --noEmit` on
touched files where practical), and `check-site` against the baseline. A phase is done
when every invariant holds and every reported difference is one the phase meant to make.

### 0. Safety net (before any change)

- `scripts/check-site.mjs` (no new dependencies): every route at 1400×900, 390×844,
  768×1024 and 844×390; every chapter activated by scrolling; facts recorded (tabs, caption,
  corner cards, readings, canvas drawn and moving, editors and build status, drawer state,
  overflow, problems, console errors); masked screenshots diffed inside Chrome; live
  screenshots kept for looking at. Output in `test-results/visual/<name>/` (gitignored).
- Baseline recorded on the unchanged code: `test-results/visual/baseline/`.
- Visual checklists in `docs/testing/visual/*.md`, walked by hand at the end.

### 1. P0: foundations

1. One panel registry. `canvas` registered beside viewport2d, viewport3d, table and readout.
   The legacy `LerpettePanelKind` and the `__key` bridge go. Every chapter gets a panel stack.
2. Stage chrome in the player slot: `ctx.controls()`, `ctx.monitors()`, `ctx.caption()` and
   restart for every runtime, state kept under `stage:` keys.
3. One chapter contract: module source (`code/<id>/js/index.ts` default-exporting
   `defineChapter({...})`) and editor source (a `lerpit` fence) are the same shape and merge.
4. Presets on the chapter runtime, live-code runtime retired, `live-code#cpp` on `+viewport2d`.
5. Lifecycle: runtimes cached per step; `resume()` on returning to the tab instead of
   `enter()`; per-chapter 3D scenes torn down whole; `dt` in seconds from one clock;
   the chosen tab remembered by name across chapters.

### 2. P1: authoring safety and docs

1. Build validation: unknown panel names, an `index.ts` a declared panel list would ignore,
   front matter, raw HTML other than comments; panel chapters count as having a runtime and
   keep their own `codePath`.
2. Problem ids and a catalogue (`docs/authoring/problems.md`), shown on the page.
3. Authorable caption and idle status: chapter module, or `[caption]` in `control.toml`.
4. `control.toml` fields: `landing`, `order`, `card_style`, `caption`.
5. `site.config.ts`: name, author, year, links, landing collection.
6. `docs/authoring.md`; README corrected.

### 3. P2: shared libraries

1. Language registry: one table for extension, compiler, editor mode and comment marker,
   read by the editor, regions, compilers and the build-time fence checks.
2. `loadModule()`: one cached, asset-aware loader for prebuilt wasm.
3. One three bundle (`createThreeBundle`, perspective or ortho-fit) used by every WebGL
   panel, and a theme palette read by panels and lessons.
4. Physics helpers: `addSphere`, `addBoundsBox`, `totalEnergy`, and C++ `bounce_in_box`,
   `integrate_euler`; a typed `create3DPhysicsRuntime<Native>`.

### 4. P3: site and design system

1. CSS beside its module (live code, readings, tweakpane, panels), imported by the module.
2. Breakpoint, status and accent tokens.
3. `LerpettePlayer.astro` split into Byline, ChapterBox and Stage; `playerClient.ts` split
   into page chrome and the stage player.
4. One `Shelf` component; a `.sheet` for non-lesson pages.
5. Asset hygiene: dotfiles, tooling files and non-routable lessons never ship.
6. Favicon and every root link honour `BASE_URL`.

### 5. Migrations and bugs

- `meta/issue-one`: hand-written runtimes that wrote data into the caption become chapters
  on `+table`, reading the prebuilt modules through `loadModule()`.
- `meta/issue-zero`: the hand-written three.js scene becomes a chapter on `viewport3d` with
  an ortho-fit camera, driven by the runtime's clock (fixes the freeze after the tab is hidden).
- `physics-engine/simple-body-dynamics`: the four chapters use the physics helpers.
- Collisions: the floor bounce reads `floorRestitution`.
- issue-one embind double registration: checked in the browser.
- Prose that disagrees with code in the owner's uncommitted writing is reported, not edited.

### 5b. Brand spine follow-ups (asked for 2026-10-17, after the architecture work)

- Remove the blur on the brand stripes in the header (the top spine).
- On mobile the stripes render thinner than on desktop. Keep the width at 14% of the panel, and shrink the height in proportion so the spine keeps its shape.

### 5c. The stripes as the site's icon everywhere (asked for 2026-10-17)

- Home-screen icon (apple-touch-icon, web manifest with 192/512 and maskable icons) and the
  share image for WhatsApp and other link previews (og:image, twitter card), all drawn from
  the brand spine at a resolution that stays sharp.

### 6. Final

Unit suite, production build, `check-site` against the baseline at every size, every live
screenshot looked at, every checklist walked, report written with what was verified and how.

## Test plan

| Layer | What | Where |
| --- | --- | --- |
| Unit (node) | heading ops, control fields, content loader problems and ids, panel registry, chapter merge rules, clock and restart, stage chrome keys, language registry, physics helpers, world `advanceBy` | `*/tests/*.test.ts` |
| Unit (fake DOM) | panel stack and chapter runtime against a minimal DOM shim | `lerpettes/framework/tests/js/` |
| Site walk | every route and chapter, every size, invariants + facts + masked pixels | `scripts/check-site.mjs` |
| Visual by hand | checklists | `docs/testing/visual/*.md` |

Expected differences from the baseline are listed in `docs/testing/visual/expected-changes.md`
as they are made, so the final comparison reads against a written list rather than memory.

## Risks and how they are contained

| Risk | Containment |
| --- | --- |
| 3D lessons look different on `viewport3d` | The 3D preset reproduces the old camera, lighting and pan setting; live screenshots compared by eye. |
| Chapter caching changes when code runs | Facts compare caption, cards and editors per chapter; tab-return probe. |
| In-browser C++ build is slow and network-bound | check-site waits up to 120 s and reports a build still running as a failure, not a hang. |
| Owner's uncommitted lesson edits | Untracked folder snapshotted to the scratchpad before any edit; changes listed in the report. |
| Moving CSS changes the cascade | Masked screenshots diffed at four sizes after the move. |

## Rollback

Nothing is committed. `git stash` or `git checkout -- <path>` restores any file; the
untracked `simple-body-dynamics/` snapshot is in the session scratchpad.
