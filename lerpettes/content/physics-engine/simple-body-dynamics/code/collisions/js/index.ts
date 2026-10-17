import { addBoundsBox, addSphere, create3DPhysicsRuntime, totalEnergy, type NativeWorld, type PhysicsModule } from '@lerpit/libs/physics/js';

const factory = async () => {
  const mod = (await import('../build/collisions.js')).default;
  return (await mod()) as PhysicsModule;
};

type CollisionsWorld = NativeWorld & { setballRestitution: (v: number) => void };

export default create3DPhysicsRuntime<CollisionsWorld>({
  caption: 'Balls colliding and bouncing off each other.',
  factory,
  construct: (m) => new (m.ParticleWorld as new () => CollisionsWorld)(),
  setup({ world, scene, camera, controls, monitors }) {
    camera.position.set(0, 6, 0);
    camera.lookAt(0, 0, 0);

    addBoundsBox(scene);

    for (let i = 0; i < 10; i++) {
      addSphere(world, scene, {
        position: [(Math.random() - 0.5) * 2, -0.9, (Math.random() - 0.5) * 2],
        velocity: [(Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10],
        radius: 0.1,
        color: `hsl(${Math.random() * 360}, 80%, 70%)`
      });
    }

    const params = { restitution: 1 };
    world.native.setballRestitution(params.restitution);
    controls()
      .addBinding(params, 'restitution', { label: 'ball restitution', min: 0, max: 1, step: 0.01 })
      .on('change', (e) => world.native.setballRestitution(e.value));

    monitors().graph('PE + KE', () => totalEnergy(world), { min: 0, max: 250 });
  }
});
