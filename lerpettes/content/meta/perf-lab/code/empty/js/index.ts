import { createStage } from '@lerpit/framework/chapter';

// Nothing drawn: the framework's own cost per frame.
export default createStage({
  state: {},
  step() {},
  viewport2d: {
    draw() {}
  }
});
