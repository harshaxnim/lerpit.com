import * as THREE from 'three';
import { bindMesh, create3DPhysicsRuntime, type Setup3DPhysicsContext } from '@/lib/physics/js';

const factory = async () => {
  const mod = (await import('../build/particle_world.js')).default;
  return await mod();
};

function addBox(scene: THREE.Scene) {
  const geo = new THREE.BoxGeometry(2, 2, 2);
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.15, side: THREE.DoubleSide })));
  scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#000000' })));
}

function setup({ world, module, scene, camera }: Setup3DPhysicsContext) {
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  addBox(scene);

  const sphere = new module.Sphere([0, 0, 0], [0, 0, 0], 0.5);
  world.addParticle(sphere);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color: '#D17041' })
  );
  scene.add(mesh);
  bindMesh(sphere, mesh);
}

export default create3DPhysicsRuntime({
  caption: 'A sphere positioned at the origin.',
  factory,
  construct: (m) => new (m as any).ParticleWorld(),
  setup
});
