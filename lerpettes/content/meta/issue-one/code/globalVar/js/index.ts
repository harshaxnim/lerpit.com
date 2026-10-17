import { defineChapter, type LerpetteCtx } from '@lerpit/framework/chapter';
import type { TableTarget } from '@lerpit/framework/panels/table/tablePanel';

/** A global is an address in linear memory; reading it is indexing the heap. */
export default defineChapter({
  panels: ['table'],
  wasm: () => import('../build/otherFavouriteNumber.js'),
  table: {
    draw(out: TableTarget, _s: unknown, ctx: LerpetteCtx) {
      const wasm = ctx.wasm;
      if (!wasm) return;
      const address = wasm.otherFavouriteNumberAddress as number;
      out.row({
        name: 'otherFavouriteNumber',
        address,
        'HEAP32 index': address / 4,
        value: (wasm.HEAP32 as Int32Array)[address / 4]
      });
    }
  }
});
