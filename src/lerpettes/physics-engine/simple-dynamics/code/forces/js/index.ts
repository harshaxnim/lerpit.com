import { createCanvasSketchRuntime } from '@/lib/lerpettes/runtimes';

export default createCanvasSketchRuntime({
  runtimeLabel: 'Runtime / accumulated force',
  status: 'A force arrow keeps nudging the body over time.',
  draw(ctx, frame, width, height) {
    // const bodyX = 120 + Math.sin(frame * 0.03) * 18;
    // ctx.fillStyle = '#20313F';
    // ctx.fillRect(bodyX, height / 2 - 24, 48, 48);

    // ctx.strokeStyle = '#D17041';
    // ctx.lineWidth = 5;
    // ctx.beginPath();
    // ctx.moveTo(bodyX - 70, height / 2);
    // ctx.lineTo(bodyX - 10, height / 2);
    // ctx.stroke();

    // ctx.fillStyle = '#D17041';
    // ctx.beginPath();
    // ctx.moveTo(bodyX - 10, height / 2);
    // ctx.lineTo(bodyX - 24, height / 2 - 10);
    // ctx.lineTo(bodyX - 24, height / 2 + 10);
    // ctx.closePath();
    // ctx.fill();
  }
});
