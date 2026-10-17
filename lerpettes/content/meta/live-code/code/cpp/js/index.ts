import { defineChapter } from '@lerpit/framework/chapter';

/**
 * The same contract as the JavaScript chapter, with the physics compiled from C++. The
 * module arrives as `ctx.wasm`, so the bridge between wasm and the drawing is a file in
 * the box rather than wiring in here.
 */
export default defineChapter({
  caption: 'A spring, integrated by your compiled wasm and drawn by your JavaScript.'
});
