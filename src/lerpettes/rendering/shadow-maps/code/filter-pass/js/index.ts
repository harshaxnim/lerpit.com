import { createCanvasSketchRuntime } from '@/lib/lerpettes/runtimes';

export default createCanvasSketchRuntime({
  status: 'The shaded result samples the stored depth and softens the edge.',
  draw(ctx, frame, width, height) {
    ctx.fillStyle = '#F8FBFF';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#20313F';
    ctx.fillRect(width / 2 - 90, height / 2 - 28, 180, 56);

    const radius = 90 + Math.sin(frame * 0.03) * 6;
    const gradient = ctx.createRadialGradient(width / 2, height / 2 + 24, 20, width / 2, height / 2 + 24, radius);
    gradient.addColorStop(0, 'rgba(46, 109, 164, 0.14)');
    gradient.addColorStop(1, 'rgba(46, 109, 164, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2 + 24, radius, 0, Math.PI * 2);
    ctx.fill();
  }
});
