import { createCanvasSketchRuntime } from '@/lib/lerpettes/runtimes';

export default createCanvasSketchRuntime({
  runtimeLabel: 'Runtime / impulse',
  status: 'An impulse changes velocity immediately instead of accumulating over time.',
  draw(ctx, frame, width, height) {
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
