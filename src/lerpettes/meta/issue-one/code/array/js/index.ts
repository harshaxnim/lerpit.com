import { drawBlankViewport } from '../../shared/blankViewport';
import type { LerpetteStepRuntime } from '@/lib/lerpettes/types';
import factory from '../build/fibArray.js';

let fibList: Awaited<ReturnType<typeof factory>> | null = null;                                                                                                                                                

const stepRuntime: LerpetteStepRuntime = {
  async mount(ctx) {
    fibList = await factory();
  },

  async enter(ctx) {
    drawBlankViewport(ctx);
    let fibArray = fibList!.getFibArray();
    let log: string = '';
    for (let i = 0; i < 8; i++) {
      log += `${fibArray[i]}\n`;
    }
    ctx.setCaption(`fibby numbers:\n${log}`);
  }
};

export default stepRuntime;
