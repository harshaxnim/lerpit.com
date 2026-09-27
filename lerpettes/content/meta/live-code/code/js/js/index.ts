import { createLiveCodeRuntime } from '@lerpit/framework/runtimes';

/**
 * Nothing to wire. The state, the step and the drawing are all exports of the files
 * the fence names, which is what makes every one of them the reader's to change.
 */
export default createLiveCodeRuntime({
  caption: 'A spring, integrated and drawn by your own code.',
  idleStatus: 'Compiling…'
});
