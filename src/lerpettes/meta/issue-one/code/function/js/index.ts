import { drawBlankViewport } from '../../shared/blankViewport';
import type { LerpetteStepRuntime } from '@/lib/lerpettes/types';
import factory from '../build/answerToUniverse.js';

let answerGen: Awaited<ReturnType<typeof factory>> | null = null;                                                                                                                                                

const stepRuntime: LerpetteStepRuntime = {
  async mount(ctx) {
    answerGen = await factory();
    const answer = answerGen.answerToUniverse();
    ctx.setCaption(`answerToUniverse() returned ${answer}`);
  },
  
  async enter(ctx) {
    drawBlankViewport(ctx);
    ctx.setCaption(`answerToUniverse() returned ${answerGen?.answerToUniverse()}`);
  }
}

export default stepRuntime;
