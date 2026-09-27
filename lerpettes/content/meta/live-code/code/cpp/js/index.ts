import { createLiveCodeRuntime } from '@lerpit/framework/runtimes';

/**
 * The same contract as the JavaScript chapter, with the physics compiled from C++.
 * The module is handed to the reader's own `step`, so the bridge between wasm and
 * canvas is a file in the box rather than wiring in here.
 */
export default createLiveCodeRuntime({
  caption: 'A spring, integrated by your compiled wasm and drawn by your JavaScript.',
  idleStatus: 'Press run to fetch the toolchain and build.'
});
