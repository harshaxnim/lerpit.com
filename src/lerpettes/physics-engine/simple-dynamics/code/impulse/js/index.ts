import { createCanvasSketchRuntime } from '@/lib/lerpettes/runtimes';

export default createCanvasSketchRuntime({
  runtimeLabel: 'Runtime / impulse',
  status: 'An impulse changes velocity immediately instead of accumulating over time.',
  draw(ctx, frame, width, height) {
    ctx.fillStyle = '#F8FBFF';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#8FB4D4';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const bodyX = 120 + Math.min(frame, 45) * 5;
    ctx.fillStyle = '#20313F';
    ctx.fillRect(Math.min(bodyX, width - 80), height / 2 - 24, 48, 48);

    ctx.strokeStyle = '#2E6DA4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(100, height / 2 + 70);
    ctx.lineTo(width - 100, height / 2 + 70);
    ctx.stroke();
  }
});
