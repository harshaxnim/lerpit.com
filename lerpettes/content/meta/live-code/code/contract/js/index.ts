import { createCanvasSketchRuntime } from '@lerpit/framework/runtimes';

/**
 * The contract chapter has nothing to edit; it is the reference. The panel shows the
 * two phases in the order the frame runs them.
 */
export default createCanvasSketchRuntime({
  status: 'step advances the state, draw paints it, the page owns the clock.',
  draw(g, frame, width, height) {
    const midY = height / 2;
    const t = frame * 0.02;
    const boxW = Math.min(width * 0.34, 190);
    const gap = Math.min(width * 0.08, 56);
    const left = (width - boxW * 2 - gap) / 2;

    g.font = '600 12px "IBM Plex Mono", monospace';
    g.textBaseline = 'middle';

    const phase = (x: number, label: string, lit: boolean) => {
      g.fillStyle = lit ? 'rgba(46,109,164,0.1)' : 'transparent';
      g.fillRect(x, midY - 34, boxW, 68);
      g.strokeStyle = lit ? '#2e6da4' : 'rgba(81,131,173,0.42)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, midY - 33.5, boxW - 1, 67);
      g.fillStyle = lit ? '#2e6da4' : '#506270';
      g.textAlign = 'center';
      g.fillText(label, x + boxW / 2, midY);
    };

    // Which phase is lit walks with the clock, so the order reads without a caption.
    const lit = Math.floor(t) % 2;
    phase(left, 'step(s, dt)', lit === 0);
    phase(left + boxW + gap, 'draw(g, s)', lit === 1);

    g.strokeStyle = '#506270';
    g.beginPath();
    g.moveTo(left + boxW + 6, midY);
    g.lineTo(left + boxW + gap - 6, midY);
    g.stroke();
    g.fillStyle = '#506270';
    g.beginPath();
    g.moveTo(left + boxW + gap - 6, midY);
    g.lineTo(left + boxW + gap - 12, midY - 4);
    g.lineTo(left + boxW + gap - 12, midY + 4);
    g.fill();

    g.fillStyle = '#8898a4';
    g.font = '11px "IBM Plex Mono", monospace';
    g.fillText('every frame, clock owned by the page', width / 2, midY + 58);
  }
});
