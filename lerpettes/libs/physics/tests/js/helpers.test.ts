import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addBoundsBox, addSphere, randomVec3, totalEnergy } from '../../js/helpers';
import { syncMeshes } from '../../js/renderer';
import { World } from '../../js/world';
import { createFakeModule } from './fakeModule';

async function makeWorld() {
  const fake = createFakeModule();
  // The fake has no Sphere; helpers only need the constructor's shape.
  (fake as Record<string, unknown>).Sphere = fake.TestBody;
  return World.create(async () => fake);
}

describe('physics helpers', () => {
  it('addSphere puts one body in the world and one mesh in the scene, bound together', async () => {
    const world = await makeWorld();
    const scene = new THREE.Scene();
    const { body, mesh } = addSphere(world, scene, { position: [1, 2, 3], radius: 0.25 });
    expect(world.handles()).toEqual([body]);
    expect(scene.children).toContain(mesh);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    world.step(0);
    syncMeshes(world);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
  });

  it('addBoundsBox draws faces and edges, or edges alone', () => {
    const scene = new THREE.Scene();
    expect(addBoundsBox(scene).children).toHaveLength(2);
    expect(addBoundsBox(scene, { faceOpacity: 0 }).children).toHaveLength(1);
  });

  it('totalEnergy is potential above the floor plus kinetic', async () => {
    const world = await makeWorld();
    addSphere(world, new THREE.Scene(), { position: [0, 0, 0], velocity: [2, 0, 0] });
    // m g h with h = 0 - (-1) = 1, plus ½ m v² = 2.
    expect(totalEnergy(world)).toBeCloseTo(9.81 + 2);
    expect(totalEnergy(world, { gravity: 0 })).toBeCloseTo(2);
  });

  it('randomVec3 stays inside its scale', () => {
    let i = 0;
    const steps = [0, 0.5, 0.999];
    const v = randomVec3(2, () => steps[i++ % 3]);
    expect(v[0]).toBeCloseTo(-2);
    expect(v[1]).toBeCloseTo(0);
    expect(v[2]).toBeLessThan(2);
  });
});
