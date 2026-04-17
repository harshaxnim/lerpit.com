import { drawBlankViewport } from '../../shared/blankViewport';
import type { LerpetteStepRuntime } from '@/lib/lerpettes/types';
import factory from '../build/struct.js';

let structModule: Awaited<ReturnType<typeof factory>> | null = null;

const stepRuntime: LerpetteStepRuntime = {
  async mount(ctx) {
    structModule = await factory();
  },

  async enter(ctx) {
    drawBlankViewport(ctx);
    const sphere = structModule!.getDefaultSphere();
    ctx.setCaption(
      `Sphere #${sphere.index}\n` +
      `  radius: ${sphere.radius}\n` +
      `  pos: (${sphere.pos.x}, ${sphere.pos.y}, ${sphere.pos.z})\n` +
      `  vel: (${sphere.vel.x}, ${sphere.vel.y}, ${sphere.vel.z})`
    );
  }
};

export default stepRuntime;
