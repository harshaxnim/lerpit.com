import { drawBlankViewport } from '../../shared/blankViewport';
import type { LerpetteStepRuntime } from '@/lib/lerpettes/types';
import factory from '../build/aos.js';

let mod: Awaited<ReturnType<typeof factory>> | null = null;

const stepRuntime: LerpetteStepRuntime = {
  async mount(ctx) {
    mod = await factory();
  },

  async enter(ctx) {
    drawBlankViewport(ctx);
    const spheres = mod!.getSpheres();
    const lines: string[] = [];

    for (let i = 0; i < spheres.size(); i++) {
      const s = spheres.get(i);
      lines.push(
        `[${s.index}] r=${s.radius}  pos=(${s.pos.x}, ${s.pos.y}, ${s.pos.z})  vel=(${s.vel.x}, ${s.vel.y}, ${s.vel.z})`
      );
    }

    ctx.setCaption(lines.join('\n'));
    spheres.delete();
  }
};

export default stepRuntime;
