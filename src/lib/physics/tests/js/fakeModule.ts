import type { NativeParticle, NativeWorld, PhysicsModule } from '../../js/types';

type TestBodyHandle = NativeParticle & {
  _pos: [number, number, number];
  _vel: [number, number, number];
  updateCallCount: number;
  deleted: boolean;
};

export function createFakeModule(): PhysicsModule & {
  _worlds: Array<NativeWorld & { destroyed: boolean; deleted: boolean }>;
  TestBody: new (pos: [number, number, number], vel: [number, number, number]) => TestBodyHandle;
} {
  const makeTestBody = (pos: [number, number, number], vel: [number, number, number]): TestBodyHandle => {
    const h: TestBodyHandle = {
      _pos: [...pos] as [number, number, number],
      _vel: [...vel] as [number, number, number],
      updateCallCount: 0,
      deleted: false,
      position: () => [...h._pos] as [number, number, number],
      velocity: () => [...h._vel] as [number, number, number],
      delete: () => { h.deleted = true; }
    };
    return h;
  };

  class TestBodyCtor {
    constructor(pos: [number, number, number], vel: [number, number, number]) {
      return makeTestBody(pos, vel) as unknown as TestBodyCtor;
    }
  }

  const worlds: Array<NativeWorld & { destroyed: boolean; deleted: boolean }> = [];

  class FakeWorld implements NativeWorld {
    bodies: TestBodyHandle[] = [];
    destroyed = false;
    deleted = false;

    constructor() { worlds.push(this); }

    addParticle(p: NativeParticle) {
      this.bodies.push(p as TestBodyHandle);
      return p;
    }

    remove(p: NativeParticle) {
      const idx = this.bodies.indexOf(p as TestBodyHandle);
      if (idx === -1) return;
      this.bodies.splice(idx, 1);
    }

    step(dt: number) {
      for (const b of this.bodies) {
        b.updateCallCount++;
        b._pos[0] += b._vel[0] * dt;
        b._pos[1] += b._vel[1] * dt;
        b._pos[2] += b._vel[2] * dt;
      }
    }

    destroy() {
      this.bodies = [];
      this.destroyed = true;
    }

    bodyCount() { return this.bodies.length; }
    delete() { this.deleted = true; }
  }

  return {
    World: FakeWorld as unknown as new () => NativeWorld,
    Particle: TestBodyCtor as unknown as new () => NativeParticle,
    Sphere: TestBodyCtor as unknown as PhysicsModule['Sphere'],
    TestBody: TestBodyCtor as unknown as new (pos: [number, number, number], vel: [number, number, number]) => TestBodyHandle,
    _worlds: worlds
  };
}
