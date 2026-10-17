import * as THREE from 'three';
import { palette } from '@lerpit/framework/theme';
import { bindMesh } from './renderer';
import type { NativeSphere, PhysicsModule, Vec3 } from './types';
import type { World } from './world';

/*
 * The handful of things every physics chapter so far wrote out by hand: a sphere that
 * is both a body and a mesh, the box the bodies live in, and the energy that tells a
 * reader whether the integrator is honest. Each of the four simple-body-dynamics
 * chapters had its own copy of at least two of these.
 */

export type SphereOptions = {
  position?: Vec3;
  velocity?: Vec3;
  radius?: number;
  /** Any CSS colour. Defaults to the site's warm accent. */
  color?: THREE.ColorRepresentation;
  /** Sphere segments; 32 is smooth at the sizes lessons draw. */
  detail?: number;
};

/** A sphere in the world and in the scene, kept in step by the physics preset. */
export function addSphere(
  world: World,
  scene: THREE.Object3D,
  options: SphereOptions = {}
): { body: NativeSphere; mesh: THREE.Mesh } {
  const radius = options.radius ?? 0.5;
  const module = world.module as PhysicsModule;
  const body = new module.Sphere(options.position ?? [0, 0, 0], options.velocity ?? [0, 0, 0], radius);
  world.addParticle(body);

  const detail = options.detail ?? 32;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, detail, detail),
    new THREE.MeshStandardMaterial({ color: options.color ?? palette.accentWarm })
  );
  mesh.position.set(...(options.position ?? [0, 0, 0]));
  scene.add(mesh);
  bindMesh(body, mesh);
  return { body, mesh };
}

export type BoundsBoxOptions = {
  /** Edge length; the box is centred on the origin. */
  size?: number;
  /** Opacity of the faces. 0 draws edges only. */
  faceOpacity?: number;
};

/** The box bodies bounce around in: faint faces, ink edges. */
export function addBoundsBox(scene: THREE.Object3D, options: BoundsBoxOptions = {}): THREE.Group {
  const size = options.size ?? 2;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const group = new THREE.Group();
  group.name = 'bounds';
  const opacity = options.faceOpacity ?? 0.15;
  if (opacity > 0) {
    group.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity, side: THREE.DoubleSide })
      )
    );
  }
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#000000' })));
  scene.add(group);
  return group;
}

export type EnergyOptions = {
  /** Downward acceleration, m/s². */
  gravity?: number;
  /** Height where potential energy is zero. */
  floorY?: number;
  /** Mass of every body. The framework's bodies carry none yet. */
  mass?: number;
};

/** Kinetic plus gravitational potential energy of every body, in joules. */
export function totalEnergy(world: World, options: EnergyOptions = {}): number {
  const g = options.gravity ?? 9.81;
  const floor = options.floorY ?? -1;
  const m = options.mass ?? 1;
  let sum = 0;
  for (const body of world.handles()) {
    const [, y] = body.position();
    const [vx, vy, vz] = body.velocity();
    sum += m * g * (y - floor);
    sum += 0.5 * m * (vx * vx + vy * vy + vz * vz);
  }
  return sum;
}

/** A random vector with each component in [-scale, scale). */
export function randomVec3(scale = 1, rand: () => number = Math.random): Vec3 {
  return [(rand() * 2 - 1) * scale, (rand() * 2 - 1) * scale, (rand() * 2 - 1) * scale];
}
