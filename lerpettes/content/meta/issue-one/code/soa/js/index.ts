import { createStage, type LerpetteCtx } from '@lerpit/framework/chapter';
import type { TableTarget } from '@lerpit/framework/panels/table/tablePanel';

class Vec3View {
  constructor(private arr: Float64Array, private offset: number) {}
  get x() { return this.arr[this.offset]; }
  get y() { return this.arr[this.offset + 1]; }
  get z() { return this.arr[this.offset + 2]; }
  set x(v: number) { this.arr[this.offset] = v; }
  set y(v: number) { this.arr[this.offset + 1] = v; }
  set z(v: number) { this.arr[this.offset + 2] = v; }
}

class SphereView {
  pos: Vec3View;
  vel: Vec3View;

  constructor(
    private indices: Int32Array,
    private radii: Float64Array,
    positions: Float64Array,
    velocities: Float64Array,
    private i: number
  ) {
    this.pos = new Vec3View(positions, i * 3);
    this.vel = new Vec3View(velocities, i * 3);
  }

  get index() { return this.indices[this.i]; }
  get r()     { return this.radii[this.i]; }
  set r(v: number) { this.radii[this.i] = v; }
}

type Spheres = {
  count(): number;
  getIndices(): Int32Array;
  getRadii(): Float64Array;
  getPositions(): Float64Array;
  getVelocities(): Float64Array;
};

/**
 * A struct of arrays: one array per field, and a sphere is an index into all of them.
 * The views above read straight from those arrays, so a row here is assembled, not stored.
 */
export default createStage({
  panels: ['table'],
  wasm: () => import('../build/soa.js'),
  table: {
    draw(out: TableTarget, _s: unknown, ctx: LerpetteCtx) {
      const spheres = (ctx.wasm?.getSpheres as (() => Spheres) | undefined)?.();
      if (!spheres) return;
      const indices = spheres.getIndices();
      const radii = spheres.getRadii();
      const positions = spheres.getPositions();
      const velocities = spheres.getVelocities();
      for (let i = 0; i < spheres.count(); i++) {
        const s = new SphereView(indices, radii, positions, velocities, i);
        out.row({
          index: s.index,
          r: s.r,
          pos: `(${s.pos.x}, ${s.pos.y}, ${s.pos.z})`,
          vel: `(${s.vel.x}, ${s.vel.y}, ${s.vel.z})`
        });
      }
    }
  }
});
