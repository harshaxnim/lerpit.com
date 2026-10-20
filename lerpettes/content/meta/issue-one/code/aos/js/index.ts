import { createStage, type LerpetteCtx } from '@lerpit/framework/chapter';
import type { TableTarget } from '@lerpit/framework/panels/table/tablePanel';

type Vec3 = { x: number; y: number; z: number };
type Sphere = { index: number; radius: number; pos: Vec3; vel: Vec3 };
type SphereVector = { size(): number; get(i: number): Sphere; delete(): void };

const vec = (v: Vec3) => `(${v.x}, ${v.y}, ${v.z})`;

/** An array of structs: each row is one whole sphere, laid out together in memory. */
export default createStage({
  panels: ['table'],
  wasm: () => import('../build/aos.js'),
  table: {
    draw(out: TableTarget, _s: unknown, ctx: LerpetteCtx) {
      const spheres = (ctx.wasm?.getSpheres as (() => SphereVector) | undefined)?.();
      if (!spheres) return;
      for (let i = 0; i < spheres.size(); i++) {
        const s = spheres.get(i);
        out.row({ index: s.index, radius: s.radius, pos: vec(s.pos), vel: vec(s.vel) });
      }
      // The vector is a copy Embind made for us, and it is ours to free.
      spheres.delete();
    }
  }
});
