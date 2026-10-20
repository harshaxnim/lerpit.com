Author: Harsha | Date: 2026-09-23

# Editing code in the article

A test bed for compiling the reader's own code in the browser and drawing the result next to the prose. Each chapter carries its own files, with tabs to move between them. Edit, press run, and the panel on the right redraws. Nothing is sent anywhere; both languages are built inside the tab.

This lerpette exists to prove the machinery, not to teach anything. It is the first slice of the in-article editor: a working edit, build and draw loop with no server involved.

## The contract {#contract}

Every chapter on this site runs the same two-phase frame. The page owns the clock, the panels and the pixel ratio; you own what happens inside them. The names it looks for are exports of the files the fence lists:

```js
export const state = { x: 1, v: 0 };                 // where it starts. optional
export function step(s, dt, ctx) { }                 // advance it. dt is seconds
export const viewport2d = { draw(sketch, s, ctx) { } };   // paint it, in the panel of that name
```

A chapter needs at least one of `step` and a view. Nothing else is required, and nothing else is looked for except `setup(s, ctx)`, which runs once before the first frame.

`dt` arrives already clamped, so a tab left in the background comes back without integrating one enormous step. A view lives under the name of the panel it draws, the same word the chapter's heading uses to ask for that panel, so a chapter with two panels has two views and each one is called `draw`. For `viewport2d`, `sketch` is a drawing surface, cleared for you: its calls take positions in units with the origin in the middle, and `sketch.pixels` takes layout pixels. The state is rebuilt on every run, which is what makes pressing run a clean start rather than a continuation.

`ctx` is the last argument to everything. It carries the size of the panel (`ctx.view`), the pointer over it (`ctx.input`), the seconds since the run began (`ctx.time`), and the module you compiled from C++ (`ctx.wasm`): the physics can be C++, but a wasm module cannot reach a panel, so copying its numbers out is a file you can open rather than wiring hidden in the lesson. It also reaches the stage: `ctx.controls()` for sliders, `ctx.monitors()` for readings, `ctx.caption()` for the line under the panel.

Everything else is the page's. There is no loop to write, no resize to handle, no context to acquire, and no teardown to remember.

## JavaScript, no compiler {#js +viewport2d +readout}

Three files, and between them the whole contract. `index.js` holds the state and the step, `forces.js` the force law it calls, `draw.js` the picture. Sucrase rewrites the imports and the files resolve against each other, so there is nothing to download and no import map to keep in step.

An export is found wherever you wrote it, so `viewport2d` living in `draw.js` needs no re-export through `index.js`. Two files claiming the same name is an error rather than a coin toss.

Write the marked function and press run. Cmd+Enter works too.

```lerpit src/index.js:step src/forces.js:force src/draw.js:paint src/readout.js
```

## C++ compiled to WebAssembly {#cpp +viewport2d}

The same loop with a real toolchain. Clang and lld are fetched as WebAssembly on the first run and cached afterwards, so the first build is slow and every later one is not. Press run, wait, and the panel is then driven by your compiled code rather than by JavaScript.

The module exports four plain C functions and is instantiated with no generated glue. Emscripten's own driver is in the image and starts, but it hands off to clang with `os.execvp`, which this sandbox has no implementation for, so every build through it fails. Calling clang and wasm-ld directly avoids the driver. The cost is Embind: no C++ classes across the boundary, just functions and numbers.

```lerpit src/spring.cpp:integrate src/forces.cpp:force src/step.js:bridge src/draw.js:paint
```

Four files here rather than three: `step.js` is the bridge, where the module's numbers come out into a plain object the drawing can read. The contract is otherwise identical, and `draw.js` is the same file as in the chapter above.

The log under the editor is the compiler talking. Break the code on purpose and the errors show up there, and so do faults that only happen once it is running: a `step` that throws says so instead of quietly freezing.
