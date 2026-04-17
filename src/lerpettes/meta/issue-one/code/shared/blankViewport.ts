import type { LerpetteRuntimeContext } from '@/lib/lerpettes/types';

export function drawBlankViewport(ctx: LerpetteRuntimeContext) {
  const canvas = ctx.canvas;
  const c = canvas.getContext('2d');
  if (!c) return;

  canvas.width = ctx.host.clientWidth;
  canvas.height = ctx.host.clientHeight;

  c.clearRect(0, 0, canvas.width, canvas.height);

  c.textAlign = 'center';
  c.textBaseline = 'middle';

  c.font = '500 1.1rem "IBM Plex Mono", monospace';
  c.fillText('Intentionally left blank.', canvas.width / 2, canvas.height / 2 - 14);

  c.font = '400 0.9rem "IBM Plex Mono", monospace';
  c.fillText('Look at the captions.', canvas.width / 2, canvas.height / 2 + 14);
}
