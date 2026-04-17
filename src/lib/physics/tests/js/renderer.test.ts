import { describe, it, expect } from 'vitest';
import { World } from '../../js/world';
import { bindMesh, unbindMesh, syncMeshes } from '../../js/renderer';
import { createFakeModule } from './fakeModule';

type FakeMesh = { position: { set: (x: number, y: number, z: number) => void; _v: [number, number, number] } };

function makeMesh(): FakeMesh {
  const v: [number, number, number] = [0, 0, 0];
  return {
    position: { _v: v, set: (x, y, z) => { v[0] = x; v[1] = y; v[2] = z; } }
  };
}

describe('renderer', () => {
  it('syncMeshes writes positions for bound particles', async () => {
    const fake = createFakeModule();
    const world = await World.create(async () => fake);
    const a = world.addParticle(new fake.TestBody([1, 2, 3], [0, 0, 0]));
    const b = world.addParticle(new fake.TestBody([4, 5, 6], [0, 0, 0]));
    const meshA = makeMesh();
    const meshB = makeMesh();
    bindMesh(a, meshA as unknown as import('three').Object3D);
    bindMesh(b, meshB as unknown as import('three').Object3D);
    syncMeshes(world);
    expect(meshA.position._v).toEqual([1, 2, 3]);
    expect(meshB.position._v).toEqual([4, 5, 6]);
  });

  it('unbound particles are skipped', async () => {
    const fake = createFakeModule();
    const world = await World.create(async () => fake);
    const a = world.addParticle(new fake.TestBody([1, 2, 3], [0, 0, 0]));
    const mesh = makeMesh();
    bindMesh(a, mesh as unknown as import('three').Object3D);
    world.addParticle(new fake.TestBody([9, 9, 9], [0, 0, 0]));
    expect(() => syncMeshes(world)).not.toThrow();
    expect(mesh.position._v).toEqual([1, 2, 3]);
  });

  it('unbindMesh stops further updates', async () => {
    const fake = createFakeModule();
    const world = await World.create(async () => fake);
    const a = world.addParticle(new fake.TestBody([1, 2, 3], [0, 0, 0]));
    const mesh = makeMesh();
    bindMesh(a, mesh as unknown as import('three').Object3D);
    unbindMesh(a);
    syncMeshes(world);
    expect(mesh.position._v).toEqual([0, 0, 0]);
  });
});
