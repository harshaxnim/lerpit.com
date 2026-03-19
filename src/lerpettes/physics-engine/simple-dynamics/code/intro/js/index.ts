import { createCanvasSketchRuntime } from '@/lib/lerpettes/runtimes';

export default createCanvasSketchRuntime({
  runtimeLabel: 'Runtime / accumulated force',
  status: 'A force arrow keeps nudging the body over time.',
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

    const bodyX = 120 + Math.sin(frame * 0.03) * 18;
    ctx.fillStyle = '#20313F';
    ctx.fillRect(bodyX, height / 2 - 24, 48, 48);

    ctx.strokeStyle = '#D17041';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bodyX - 70, height / 2);
    ctx.lineTo(bodyX - 10, height / 2);
    ctx.stroke();

    ctx.fillStyle = '#D17041';
    ctx.beginPath();
    ctx.moveTo(bodyX - 10, height / 2);
    ctx.lineTo(bodyX - 24, height / 2 - 10);
    ctx.lineTo(bodyX - 24, height / 2 + 10);
    ctx.closePath();
    ctx.fill();
  }
});
