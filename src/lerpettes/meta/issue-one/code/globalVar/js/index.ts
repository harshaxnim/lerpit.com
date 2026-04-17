import { drawBlankViewport } from '../../shared/blankViewport';
import type { LerpetteStepRuntime } from '@/lib/lerpettes/types';
import factory from '../build/otherFavouriteNumber.js';

let favModule: Awaited<ReturnType<typeof factory>> | null = null;                                                                                                                                                

const stepRuntime: LerpetteStepRuntime = {
  async mount(ctx) {
    favModule = await factory();
  },

  async enter(ctx) {
    drawBlankViewport(ctx);
    let otherFavouriteNumber = favModule!.HEAP32[favModule!.otherFavouriteNumberAddress / 4];
    ctx.setCaption(`otherFavouriteNumber is ${otherFavouriteNumber}`);
  }
};

export default stepRuntime;
