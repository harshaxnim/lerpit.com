import { drawBlankViewport } from '../../shared/blankViewport';
import type { LerpetteStepRuntime } from '@/lib/lerpettes/types';
import factory from '../build/soa.js';

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

let mod: Awaited<ReturnType<typeof factory>> | null = null;

const stepRuntime: LerpetteStepRuntime = {
  async mount(ctx) {
    mod = await factory();
  },

  async enter(ctx) {
    drawBlankViewport(ctx);
    const spheres = mod!.getSpheres();
    const count      = spheres.count();
    const indices    = spheres.getIndices() as Int32Array;
    const radii      = spheres.getRadii() as Float64Array;
    const positions  = spheres.getPositions() as Float64Array;
    const velocities = spheres.getVelocities() as Float64Array;

    console.log(count, indices, radii, positions, velocities);
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const s = new SphereView(indices, radii, positions, velocities, i);
      lines.push(
        `[${s.index}] r=${s.r}  pos=(${s.pos.x}, ${s.pos.y}, ${s.pos.z})  vel=(${s.vel.x}, ${s.vel.y}, ${s.vel.z})`
      );
    }
    ctx.setCaption(lines.join('\n'));
  }
};

export default stepRuntime;
