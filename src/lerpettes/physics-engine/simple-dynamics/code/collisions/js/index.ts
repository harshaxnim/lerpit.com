import * as THREE from 'three';
import { bindMesh, create3DPhysicsRuntime, type Setup3DPhysicsContext, type World } from '@/lib/physics/js';

const factory = async () => {
  const mod = (await import('../build/collisions.js')).default;
  return await mod();
};

const GRAVITY = 9.81;
const FLOOR_Y = -1;

function totalEnergy(world: World): number {
  let sum = 0;
  for (const p of world.handles()) {
    const pos = p.position();
    const vel = p.velocity();
    sum += GRAVITY * (pos[1] - FLOOR_Y);
    sum += 0.5 * (vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2]);
  }
  return sum;
}

function setup({ world, module, scene, camera, controls, onFrame }: Setup3DPhysicsContext) {

  camera.position.set(0, 6, 0);
  camera.lookAt(0, 0, 0);

  const boxGeo = new THREE.BoxGeometry(2, 2, 2);
  const box = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.15, side: THREE.DoubleSide })
  );
  scene.add(box);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeo),
    new THREE.LineBasicMaterial({ color: '#000000', transparent: false})
  );
  scene.add(edges);

  for (let i = 0; i < 10; i++) {
    const ranPos: [number, number, number] = [(Math.random()-.5)*2, -0.9, (Math.random()-.5)*2];
    const ranVel: [number, number, number] = [(Math.random()-.5)*10, 0., (Math.random()-.5)*10];
    const radius = 0.1;
    const sphere = new module.Sphere(ranPos, ranVel, radius);

    world.addParticle(sphere);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 32),
      new THREE.MeshStandardMaterial({ color: `hsl(${Math.random() * 360}, 80%, 70%)` })
    );
    scene.add(mesh);
    bindMesh(sphere, mesh);
  }

  const native = world.native as unknown as { setballRestitution: (v: number) => void };
  const params = { restitution: 1. };
  native.setballRestitution(params.restitution);
  const pane = controls();
  pane
    .addBinding(params, 'restitution', { label: 'ball restitution', min: 0, max: 1, step: 0.01 })
    .on('change', (e) => native.setballRestitution(e.value));

  const energy = { total: totalEnergy(world) };
  pane.addBinding(energy, 'total', {
    readonly: true,
    view: 'graph',
    label: 'PE + KE',
    min: 0,
    max: 250,
    interval: 30
  });

  onFrame(() => { energy.total = totalEnergy(world); });
}

export default create3DPhysicsRuntime({
  caption: 'Balls colliding and bouncing off each other.',
  factory,
  construct: (m) => new (m as any).ParticleWorld(),
  setup
});
