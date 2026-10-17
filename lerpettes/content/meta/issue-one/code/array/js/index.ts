import { defineChapter, type LerpetteCtx } from '@lerpit/framework/chapter';
import type { TableTarget } from '@lerpit/framework/panels/table/tablePanel';

/** A typed view straight onto the vector's memory: no copy, one row per element. */
export default defineChapter({
  panels: ['table'],
  wasm: () => import('../build/fibArray.js'),
  table: {
    draw(out: TableTarget, _s: unknown, ctx: LerpetteCtx) {
      const fib = (ctx.wasm?.getFibArray as (() => Int32Array) | undefined)?.();
      if (!fib) return;
      for (let i = 0; i < fib.length; i++) out.row({ i, 'fibArray[i]': fib[i] });
    }
  }
});
