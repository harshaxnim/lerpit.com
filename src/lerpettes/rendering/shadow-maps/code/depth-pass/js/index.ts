import { createCanvasSketchRuntime } from '@/lib/lerpettes/runtimes';

export default createCanvasSketchRuntime({
  status: 'The light view stores depth as an intermediate surface.',
  draw(ctx, frame, width, height) {
    ctx.fillStyle = '#F8FBFF';
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#DDECF7');
    gradient.addColorStop(1, '#89AECB');
    ctx.fillStyle = gradient;
    ctx.fillRect(70, 70, width - 140, height - 140);

    ctx.fillStyle = '#20313F';
    ctx.fillRect(width / 2 - 90, height / 2 - 28, 180, 56);

    ctx.strokeStyle = '#D17041';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(120, 70);
    ctx.lineTo(width / 2, height / 2 - 40 + Math.sin(frame * 0.04) * 8);
    ctx.stroke();
  }
});
