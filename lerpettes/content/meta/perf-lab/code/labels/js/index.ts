import { createStage } from '@lerpit/framework/chapter';

// Twenty readouts whose text changes every frame, over a band and under a bar, so the
// order text and shapes are drawn in can be seen.
export default createStage({
  state: { t: 0 },
  step(s, dt) {
    s.t += dt;
  },
  viewport2d: {
    draw(sketch, s) {
      sketch.pixels.rect(10, 60, 270, 100, { color: 0xf2d3bf });
      for (let i = 0; i < 20; i += 1) {
        sketch.pixels.text(`x${i} = ${Math.sin(s.t + i).toFixed(3)}`, 20, 30 + i * 22, { color: 0x20313f, size: 14 });
      }
      sketch.pixels.rect(150, 0, 156, 480, { color: 0x2e6da4 });
      sketch.pixels.text('Large, 28px: Ågjy ✓', 20, 520, { color: 0xd17041, size: 28 });
    }
  }
});
