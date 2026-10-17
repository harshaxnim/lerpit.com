import { defineChapter, type LerpetteCtx } from '@lerpit/framework/chapter';
import type { TableTarget } from '@lerpit/framework/panels/table/tablePanel';

/** One call across the boundary, and what came back. */
export default defineChapter({
  panels: ['table'],
  wasm: () => import('../build/answerToUniverse.js'),
  table: {
    draw(out: TableTarget, _s: unknown, ctx: LerpetteCtx) {
      out.row({ call: 'answerToUniverse()', returned: ctx.wasm?.answerToUniverse() });
    }
  }
});
