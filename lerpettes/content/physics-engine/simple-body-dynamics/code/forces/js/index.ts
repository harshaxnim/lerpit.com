import { addBoundsBox, addSphere, create3DPhysicsRuntime, totalEnergy, type NativeWorld, type PhysicsModule } from '@lerpit/libs/physics/js';

const factory = async () => {
  const mod = (await import('../build/forces.js')).default;
  return (await mod()) as PhysicsModule;
};

type ForcesWorld = NativeWorld & { setFloorRestitution: (v: number) => void };

export default create3DPhysicsRuntime<ForcesWorld>({
  caption: 'A bunch of spheres bouncing around under gravity. The bouncing again is done simply by flipping the velocity when the sphere hits the walls.',
  factory,
  construct: (m) => new (m.ParticleWorld as new () => ForcesWorld)(),
  setup({ world, scene, camera, controls, readings }) {
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    addBoundsBox(scene);

    for (let i = 0; i < 10; i++) {
      addSphere(world, scene, {
        position: [Math.random() * 2 - 1, 0.8, Math.random() * 2 - 1],
        velocity: [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1],
        radius: 0.1,
        color: `hsl(${Math.random() * 360}, 80%, 70%)`
      });
    }

    const params = { restitution: 0.95 };
    world.native.setFloorRestitution(params.restitution);
    controls()
      .addBinding(params, 'restitution', { label: 'floor restitution', min: 0, max: 1, step: 0.01 })
      .on('change', (e) => world.native.setFloorRestitution(e.value));

    readings().graph('PE + KE', () => totalEnergy(world), { min: 0, max: 250 });
  }
});
