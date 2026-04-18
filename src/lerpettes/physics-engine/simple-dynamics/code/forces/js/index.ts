import * as THREE from 'three';
import { createSimpleDynamicsRuntime, type SetupContext } from '../../shared/createSimpleDynamicsRuntime';
import { bindMesh } from '@/lib/physics/js';

const factory = async () => {
  const mod = (await import('../build/forces.js')).default;
  return await mod();
};

function setup({ world, module, scene }: SetupContext) {
  
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
    const ranPos: [number, number, number] = [Math.random() * 2 - 1, 0.8, Math.random() * 2 - 1];
    const ranVel: [number, number, number] = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
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

}

export default createSimpleDynamicsRuntime({
  caption: 'A bunch of spheres bouncing around under gravity.',
  factory,
  construct: (m) => new (m as any).ParticleWorld(),
  setup
});
