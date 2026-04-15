# Physics Framework — Design

Status: draft. Iterate before writing code.

## Goal

A small, reusable physics framework for lerpettes, shared across the site (starting with the physics collection). Three.js renders. A single shared wasm module (C++ via Emscripten) owns simulation state and advances it with a fixed timestep. Particle/body classes are declared once and exposed to both sides so lerpettes author simulations, not plumbing.

## Non-goals

- Not a general-purpose physics engine. Scope is what lerpettes need.
- Not a renderer abstraction. Three.js stays visible to lerpette authors.
- No multi-threading, no SIMD, no SharedArrayBuffer in v1.

## Prior art (why build our own)

Real WASM + three.js physics options already exist: **Rapier** (Rust, best TS story), **Jolt** (C++, AAA-grade), and **Ammo** (legacy Bullet port). three.js ships helpers for Ammo and Jolt (`three/addons/physics/AmmoPhysics.js`, `JoltPhysics.js`). If we wanted a production engine, we'd use Rapier.

We're building our own because the lerpettes teach *how* physics works — the framework itself is the subject matter. A third-party engine hides the thing we're trying to show. If a lerpette ever needs production-grade physics, nothing stops it from importing Rapier directly; this framework is orthogonal.

## Layout

```
src/lib/physics/
  DESIGN.md                 ← this file
  js/
    index.ts                ← public API re-exports
    world.ts                ← World wrapper (owns wasm module, step loop)
    sphere.ts               ← JS-side Sphere handle (wraps embind object)
    renderer.ts             ← Three.js helpers (syncMesh(sphere, mesh))
    loader.ts               ← loads /physics.wasm, caches factory
  wasm/
    wasm-src/
      particle.h            ← Particle base (pos, vel)
      sphere.h / sphere.cpp ← Sphere : Particle (radius)
      world.h   / world.cpp ← World (owns bodies, advances sim)
      bindings.cpp          ← embind glue
    build.sh                ← builds physics.wasm + physics.js
    physics.wasm (artifact, gitignored)
    physics.js   (artifact, gitignored)
```

Lerpettes import from `src/lib/physics` only. They do not touch wasm directly.

## Data model

One source of truth for body state: the C++ `World`. JS holds handles (embind objects) that call into the same C++ memory. No duplication, no JS-side shadow copy.

```cpp
// particle.h
struct Particle {
  Vec3 pos;
  Vec3 vel;
};

// sphere.h
struct Sphere : Particle {
  float radius;
};
```

embind exposes `Particle` getters (`position()`, `velocity()`) and `Sphere` (adds `radius()`). Construction happens via `World::addSphere(pos, vel, radius)` so the world owns lifetime.

**Why world-owned, not JS-owned:** avoids dangling C++ pointers if JS drops a handle, and lets the world lay bodies out contiguously later (SoA migration) without changing the JS surface.

**Hot-path reads (important):** per-frame renderer sync should not call `sphere.position()` via embind per body — each call marshals a `std::array<float,3>` through V8. Instead, the world exposes a **single `Float32Array` view** over contiguous body position memory (obtained from `Module.HEAPF32.subarray(offset, offset + count*3)`), and the renderer iterates the view directly. embind getters stay for ergonomic one-off reads; the renderer takes the fast path. This is the SoA migration — cheap to do from day one for the positions array even if the rest of the body layout is AoS, because it only requires the world to allocate positions contiguously. Verdict: do the contiguous-positions layout in v1; keep everything else AoS until needed.

**Memory-growth gotcha (critical):** with `ALLOW_MEMORY_GROWTH=1`, any allocation that grows the wasm linear memory **detaches all existing typed-array views** (`HEAPF32`, subarray views, everything). Subsequent access throws `TypeError: attempting to access detached ArrayBuffer`. Two viable strategies:

1. **Refresh the view every frame** inside `renderer.sync` — re-derive the `Float32Array` via `Module.HEAPF32.subarray(...)` each call. The subarray creation is a few-nanosecond op, so effectively free, and it's always correct.
2. **Disable memory growth** (`-sALLOW_MEMORY_GROWTH=0`) and pre-allocate a ceiling (e.g., 32 MB). Simpler, but caps total bodies across all lerpettes on a page.

Decision: **refresh views per frame, keep `ALLOW_MEMORY_GROWTH=1`.** The perf cost is nil, and it's the one pattern that stays correct under all growth scenarios (also applies if a lerpette spawns bodies mid-animation). Encode it once in the `World` wrapper so lerpette authors can't hold a stale view.

**Explicit `.delete()` is non-optional.** Embind objects use C++ heap allocations and are *not* GC'd by the JS engine. `FinalizationRegistry` exists but embind docs explicitly call it "unsuitable for general RAII" (no timing guarantees, not guaranteed to run). Our wrapper and `World.remove()` must call `.delete()` explicitly. Dispose hooks in the player (`dispose(ctx)`) should tear down the whole world via `world.destroy()` which walks bodies and `.delete()`s each one.

**Avoid embind `property()` for read-often data.** Embind's default `property()` binding uses `return_value_policy::copy` — every JS access allocates a new C++ object that must be `.delete()`d, a trivial leak source. Use **method getters** (`position()` returning `std::array<float,3>` by value — cheap, no allocation, marshals as a JS array) or, for hot paths, the `Float32Array` view approach above.

## Step loop

Fixed timestep, accumulator pattern, driven from JS `requestAnimationFrame`:

```ts
const STEP = 1 / 120;           // physics dt
const MAX_FRAME = 0.25;         // clamp to avoid spiral of death on tab resume
let acc = 0;

function frame(nowMs: number) {
  acc += Math.min(dtFromRaf(nowMs), MAX_FRAME);
  while (acc >= STEP) {
    world.step(STEP);           // single wasm call, advances all bodies
    acc -= STEP;
  }
  const alpha = acc / STEP;     // [0, 1) for interpolated rendering (v2)
  renderer.sync(world, alpha);  // copy positions → mesh.position
  three.render(scene, camera);
}
```

`world.step(dt)` is one wasm call per substep — marshaling cost is paid once per step, not per body.

**Why fixed dt:** deterministic, decouples physics rate from framerate, makes lerpette content reproducible across devices. Standard accumulator pattern (Fix Your Timestep, Gaffer on Games).

**Spiral of death guard:** clamping `dtFromRaf` to 250 ms prevents runaway substep counts after tab suspension or long GC pauses.

**Interpolation (v2):** when physics dt (1/120) and display refresh (60/120/144 Hz) don't align, leftover accumulator shows as micro-jitter. `alpha = acc / STEP` blends the previous and current physics state in the renderer for smooth visuals. Deferred until we see jitter in practice — requires the renderer to track two poses per body.

## Three.js binding

`renderer.sync(world, mapping)` walks bodies and writes positions to their paired `THREE.Object3D`. Mapping is explicit, set up by the lerpette:

```ts
const sphere = world.addSphere({ pos: [0, 0, 0], vel: [0, 0.1, 0], radius: 0.5 });
const mesh = new THREE.Mesh(sphereGeo, mat);
scene.add(mesh);
bind(sphere, mesh);             // renderer.sync will keep mesh.position in sync
```

No automatic mesh creation — lerpettes choose geometry, material, and scene graph. The framework only moves existing meshes.

## Build

New `scripts/build-physics-wasm.sh` (or extend `build-wasm.sh` to also scan `src/lib/physics/wasm/wasm-src/`). Output goes to `src/lib/physics/wasm/` and is gitignored.

Astro serves the `.wasm` as a static asset; `loader.ts` resolves the URL via `import.meta.env.BASE_URL`.

**Why separate from `lerp_demo.wasm`:** keeps the framework module cohesive and avoids pulling framework code into every issue-zero-style one-off demo. Less tech debt as the framework grows.

## Lerpette-facing API (target)

```ts
import { createWorld, bindMesh } from '@/lib/physics';

const world = await createWorld();
const sphere = world.addSphere({ pos: [0, 0, 0], vel: [0, 0.1, 0], radius: 0.5 });
const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5), mat);
scene.add(mesh);
bindMesh(sphere, mesh);

function loop(t) {
  world.advance(t);             // handles accumulator + substeps
  world.syncMeshes();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
```

First lerpette: one sphere at origin, constant velocity `(0, 0.1, 0)`, moves up over time. Validates the full pipeline.

## Open questions

1. **Vector type across the boundary.** Decided: `std::array<float, 3>` ↔ JS `number[]` for v1. No custom cross-language `Vec3` class — that's tech debt. When we migrate to SoA in the WASM heap, adopt the layout-compatible pair `glm` (C++) + `gl-matrix` (JS), both of which store a vec3 as 3 contiguous `float32`s with no padding. At that point JS reads the same bytes as a `Float32Array` view and hands it to gl-matrix or `THREE.Vector3.fromArray`. Rationale: no single math lib spans both languages; the standard move is to share *bytes, not types*.
2. **World lifetime.** Decided: no singletons. Each lerpette owns its world (or worlds). Multiple lerpettes on one page each have their own `ctx.shared` Map, so worlds never collide.

   Two supported patterns:

   - **Per-step world** — `mount` does `this.world = createWorld()`, `dispose` tears it down. Use when steps have genuinely different scenes.
   - **Per-lerpette world** (shared across steps) — use an idempotent ensure-helper keyed on `ctx.shared`:

     ```ts
     // provided by the framework
     export async function ensureWorld(ctx, key = 'physics:world') {
       let world = ctx.shared.get(key) as World | undefined;
       if (!world) {
         world = await createWorld();
         ctx.shared.set(key, world);
       }
       return world;
     }
     ```

     Every step's `mount` (or `enter`) calls `ensureWorld(ctx)`. Whichever step the user lands on first builds it; the rest reuse it. There is no "once-per-lerpette" hook in the player — navigation can land on any step via URL hash, so the guard-on-shared pattern is the right abstraction.
3. **Deletion semantics.** `world.remove(sphere)` invalidates the JS handle. Do we throw on use-after-remove or silently no-op? do no-op.
4. **Where does `bindMesh` live** — method on the JS wrapper (`sphere.bind(mesh)`) or free function (`bindMesh(sphere, mesh)`)? Both are JS-only; C++ never sees meshes (it only knows position/velocity/radius). Leaning free function — keeps the JS wrapper's surface minimal and makes it obvious that binding is a renderer concern, not a physics concern.
5. **Typescript types for embind objects.** Decided: let Emscripten generate them. `emcc` supports `--emit-tsd physics.d.ts` (the older `--embind-emit-tsd` flag is deprecated), which emits a TypeScript declaration file directly from the `EMSCRIPTEN_BINDINGS()` block at build time by instrumenting the module and running it in Node. No hand-written `.d.ts`, no custom codegen tool, no drift — the types come from the C++ source of truth. Add the flag to `build.sh` so `physics.d.ts` is produced alongside `physics.js` / `physics.wasm`.

   Known limitations (acceptable for us):
   - `emscripten::val` params/returns type as `any` unless you register a custom val type via `EMSCRIPTEN_DECLARE_VAL_TYPE` — avoid `val` in hot-path signatures.
   - `--emit-tsd` does not work with dynamic linkage / side modules. We link statically, so this doesn't affect us.
   - The generated `.d.ts` sometimes misses auxiliary `EmscriptenModule` members (known issue); we can augment via a tiny hand-written supplement if we hit it.

   A thin wrapper layer in `js/` is still useful for ergonomics (hiding `.delete()`, converting arrays to a `Vec3` type, etc.), but it's no longer load-bearing for types — it becomes an optional API-polish layer on top of fully-typed embind bindings.

## Implementation plan

### C++ framework (`src/lib/physics/wasm/wasm-src/`)

**`particle.h`** — Data-only struct. `std::array<float,3> pos`, `std::array<float,3> vel`. No behavior; Sphere inherits from it. The data contract shared with JS.

**`sphere.h` + `sphere.cpp`** — `Sphere : Particle { float radius; }`. Getters by value: `std::array<float,3> position() const`, `velocity() const`, `float getRadius() const`. No public constructor meant for JS — construction routes through `World::addSphere` so the world owns lifetime.

**`world.h` + `world.cpp`** — Owns all bodies.
- Fields: `std::vector<Sphere> spheres;` (AoS for body state) + `std::vector<std::array<float,3>> positionsSoA;` (contiguous buffer for the renderer fast path).
- API: `Sphere* addSphere(Vec3 pos, Vec3 vel, float r)`, `void remove(Sphere*)` (no-op on unknown pointer per open question 3), `void step(float dt)`, `void destroy()`, `uintptr_t positionsPtr() const`, `size_t bodyCount() const`.
- `step(dt)` does explicit Euler then copies each sphere's pos into `positionsSoA` so JS has one contiguous buffer to view.

**`bindings.cpp`** — The only file with embind code. `EMSCRIPTEN_BINDINGS(physics)` block exposing:
- `value_object<Vec3>` mapping `std::array<float,3>` ↔ JS array.
- `class_<Particle>("Particle")` with `.function("position", ...)`, `.function("velocity", ...)`.
- `class_<Sphere, base<Particle>>("Sphere")` adding `.function("getRadius", ...)`.
- `class_<World>("World")` exposing `addSphere`, `remove`, `step`, `destroy`, `positionsPtr`, `bodyCount`.

All embind noise is isolated here; core headers stay clean and portable (→ C++ unit tests compile natively without emcc).

**`build.sh`** — `emcc -lembind -O3 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,node --emit-tsd physics.d.ts …`. Output: `../physics.js`, `../physics.wasm`, `../physics.d.ts`. Same incremental-rebuild guard pattern as `scripts/build-wasm.sh`. `node` in the environment list lets Vitest load the same artifact for integration tests.

### TS wrapper (`src/lib/physics/js/`)

**`loader.ts`** — `loadPhysicsModule(): Promise<PhysicsModule>`. Imports generated `../physics.js` factory, passes `locateFile` to resolve the `.wasm` URL, caches the resulting promise so multiple lerpettes on one page share one instantiation. Only file that knows about the Emscripten factory dance.

**`types.ts`** — `Vec3 = [number, number, number]`, `SphereInit = { pos: Vec3; vel: Vec3; radius: number }`. The shared type surface.

**`sphere.ts`** — `class Sphere` wrapping an embind `Sphere` handle. Getters `position`, `velocity`, `radius` delegate to the generated typed class. Holds its index into the SoA positions buffer. Only file where `_native` is touched.

**`world.ts`** — `class World`, the main user-facing handle.
- `addSphere(init): Sphere`, `remove(sphere)`, `destroy()`.
- `advance(nowMs)` — accumulator loop with `STEP = 1/120`, `MAX_FRAME = 0.25` clamp; calls `_native.step(STEP)` N times per frame.
- `positionsView(): Float32Array` — **re-derives per call** via `Module.HEAPF32.subarray(ptr>>2, (ptr>>2) + count*3)`. No caching, no detached-buffer risk.
- `destroy()` walks `spheres`, calls `.delete()` on each handle, then on the native world. Explicit because `FinalizationRegistry` is unreliable.

**`renderer.ts`** — `bindMesh(sphere, mesh)` stores mapping in a WeakMap keyed by sphere. `syncMeshes(world)` grabs `world.positionsView()`, iterates bodies, writes `mesh.position.set(view[i*3], view[i*3+1], view[i*3+2])`. Pure JS; C++ never sees meshes.

**`ensureWorld.ts`** — `ensureWorld(ctx, key?)` (idempotent guard over `ctx.shared`) and `disposeWorld(ctx, key?)` (pops + destroys). Same pattern as issue-zero's `ensureIssueZeroScene`.

**`index.ts`** — Barrel file and the *only* import path for lerpettes. Re-exports `createWorld`, `bindMesh`, `syncMeshes`, `ensureWorld`, `disposeWorld`, types.

### First lerpette using it

**`src/lerpettes/physics-engine/simple-dynamics/code/particle/js/index.ts`** — `LerpetteStepRuntime` implementation:
- `mount(ctx)`: `ensureWorld(ctx)`, build THREE scene/camera/renderer (also idempotent via `ctx.shared`), `world.addSphere({ pos:[0,0,0], vel:[0,0.1,0], radius:0.5 })`, create matching mesh, `bindMesh`, add to scene, start RAF loop.
- `enter(ctx)`: reset sphere state so re-entering starts from origin.
- `dispose(ctx)`: cancel RAF, `disposeWorld(ctx)`, dispose three resources.

### Repo-level changes

- **`scripts/build-wasm.sh`** — extend to also invoke `src/lib/physics/wasm/build.sh`.
- **`.gitignore`** — add `src/lib/physics/wasm/physics.{js,wasm,d.ts}`.
- **`package.json`** — add `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:cpp": "bash src/lib/physics/wasm/tests/run.sh"`. Add `vitest` as devDependency.
- **Asset serving** — verify the library-level `.wasm` is reachable via `import.meta.env.BASE_URL`. Current pipeline is lerpette-scoped; may need a small addition in `src/lib/lerpettes/content.ts` or a `public/` drop for the physics module.

## Testing plan

Testing is split by boundary — C++ logic tests run natively (fast, no wasm), JS wrappers are unit-tested with a fake module, and the full stack is integration-tested by actually loading the compiled wasm.

### C++ unit tests — `src/lib/physics/wasm/tests/`

Framework: **doctest** (single-header, zero-install, MIT). Dropped into `tests/doctest.h`.

- `test_sphere.cpp` — constructs Sphere, verifies getters return the right values by reference-free copy.
- `test_world.cpp`:
  - `addSphere` returns a valid pointer; `bodyCount()` increments.
  - `remove` decrements; `remove` on an unknown pointer is a no-op (never crashes).
  - `step(dt)` with zero velocity leaves pos unchanged.
  - `step(dt)` with constant velocity moves pos linearly: after 10 steps of `dt=0.1` with `vel=(0,1,0)`, pos is approximately `(0,1,0)`.
  - `destroy` clears all bodies; subsequent `bodyCount` is 0.
  - `positionsSoA` stays in sync with sphere positions after `step`.
- `test_soa_layout.cpp` — allocates a World with N=1000 bodies, asserts `positionsPtr()` memory is contiguous and tightly packed (no padding between triples), since that's what the JS-side `Float32Array` view depends on.

Build via `src/lib/physics/wasm/tests/run.sh` — compiles each `test_*.cpp` with the native C++ compiler (not emcc), links the world/sphere sources, runs the binary. Fast feedback loop: a failing physics test is under a second from edit to red.

### JS unit tests — `src/lib/physics/js/__tests__/`

Framework: **Vitest** (TS-native, Vite-native, fast). Uses a fake `PhysicsModule` (hand-written mock conforming to the generated `physics.d.ts` shape) so these tests run without compiling wasm.

- `world.accumulator.test.ts`:
  - `advance` calls `_native.step` exactly once when dt = STEP.
  - `advance` calls it twice when dt = 2·STEP.
  - `advance` clamps to `MAX_FRAME`: after a 10s dt, substep count is bounded (no spiral of death).
  - Leftover accumulator carries across frames.
- `world.lifetime.test.ts`:
  - `destroy` calls `.delete()` on every sphere handle and on the world handle (verify via spy).
  - `remove` on an unknown sphere handle is a no-op, does not throw (matches C++ side).
  - Double-destroy is idempotent.
- `world.positionsView.test.ts`:
  - `positionsView()` returns a `Float32Array` of length `3 * bodyCount`.
  - Calling it twice returns different view instances (confirms re-derivation, no stale caching). Critical regression test for the memory-growth gotcha.
- `renderer.test.ts`:
  - `bindMesh` followed by `syncMeshes` writes the expected `mesh.position` coordinates.
  - Unbound spheres are skipped.
  - `bindMesh` on the same sphere twice replaces the old mapping, doesn't leak.
- `ensureWorld.test.ts`:
  - First call builds a world, second call returns the same instance (idempotence).
  - Different `key` values yield different worlds.
  - `disposeWorld` removes from `ctx.shared` and calls `destroy`.

### Integration tests — `src/lib/physics/js/__tests__/integration/`

These actually load the compiled `physics.js` / `physics.wasm` in the Vitest Node environment (that's what `-sENVIRONMENT=web,node` buys us). Slower than unit tests (~hundreds of ms to instantiate) but catches the whole stack.

- `bindings.integration.test.ts` — sanity check that every TS-exposed method actually exists on the loaded module. Pure smoke test: "wrapper says method exists, wasm agrees." Guards against the drift described in design q5.
- `step.integration.test.ts` — add a sphere, step the real wasm, assert the JS-side `Sphere` getters and `positionsView()` agree on the new position (within float tolerance).
- `memoryGrowth.integration.test.ts` — add enough spheres to force `memory.grow` (easier than it sounds — allocate a few MB via large vectors), then call `positionsView()` and assert no `TypeError`. The one-and-only test for the detached-buffer gotcha.
- `lifetime.integration.test.ts` — add 100 spheres, destroy the world, verify no exceptions and the module can be reused to build a fresh world.

### What we do NOT test

- **Three.js rendering** — out of scope; tested visually via the lerpette itself.
- **Visual correctness** — deferred to a Playwright smoke test once the framework has more than one lerpette consuming it.
- **Performance** — no benchmarks in v1. Add only when a specific concern surfaces.
- **Numerical stability of Euler** — we'll document the limitation; replacement integrators are deferred work.

### Verification ladder (what proves the framework works)

1. C++ tests green — physics math is correct in isolation.
2. JS unit tests green — wrapper semantics are correct against a fake module.
3. Integration tests green — the real wasm matches wrapper expectations; no drift.
4. First lerpette renders a sphere drifting upward at `vel=(0, 0.1, 0) m/s` — end-to-end proof.

Each layer is independently runnable and fast enough to keep in the dev loop.

## What's intentionally deferred

- Collisions, constraints, integrators beyond explicit Euler.
- Full SoA migration (velocities, radii, etc.) — only positions are SoA in v1 for the renderer fast path; other fields stay AoS until needed.
- Serialization / replay.
- Web worker offload.
- Render interpolation (alpha blend between previous/current physics poses) — add if jitter is visible.
