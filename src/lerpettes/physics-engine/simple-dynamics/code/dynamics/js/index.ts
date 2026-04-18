import * as THREE from 'three';
import { createSimpleDynamicsRuntime, type SetupContext } from '../../shared/createSimpleDynamicsRuntime';
import { bindMesh } from '@/lib/physics/js';

const factory = async () => {
  const mod = (await import('../build/dynamics.js')).default;
  return await mod();
};

function addBox(scene: THREE.Scene) {
  const geo = new THREE.BoxGeometry(2, 2, 2);
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.15, side: THREE.DoubleSide })));
  scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#000000' })));
}

function setup({ world, module, scene }: SetupContext) {
  addBox(scene);

  const sphere = new module.Sphere([0, 0, 0], [1, 0, 0], 0.5);
  world.addParticle(sphere);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color: '#D17041' })
  );
  scene.add(mesh);
  bindMesh(sphere, mesh);
}

export default createSimpleDynamicsRuntime({
  caption: 'The sphere moves according to its initial velocity.',
  factory,
  construct: (m) => new (m as any).ParticleWorld(),
  setup
});
