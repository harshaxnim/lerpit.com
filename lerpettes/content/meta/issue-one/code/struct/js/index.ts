import { createStage, type LerpetteCtx } from '@lerpit/framework/chapter';
import type { TableTarget } from '@lerpit/framework/panels/table/tablePanel';

type Vec3 = { x: number; y: number; z: number };
type Sphere = { index: number; radius: number; pos: Vec3; vel: Vec3 };

/** A struct comes across as a plain object, copied field by field by Embind. */
export default createStage({
  panels: ['table'],
  wasm: () => import('../build/struct.js'),
  table: {
    draw(out: TableTarget, _s: unknown, ctx: LerpetteCtx) {
      const sphere = (ctx.wasm?.getDefaultSphere as (() => Sphere) | undefined)?.();
      if (!sphere) return;
      out.row({ field: 'index', value: sphere.index });
      out.row({ field: 'radius', value: sphere.radius });
      out.row({ field: 'pos', value: `(${sphere.pos.x}, ${sphere.pos.y}, ${sphere.pos.z})` });
      out.row({ field: 'vel', value: `(${sphere.vel.x}, ${sphere.vel.y}, ${sphere.vel.z})` });
    }
  }
});
