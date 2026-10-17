import { addBoundsBox, addSphere, create3DPhysicsRuntime, type NativeWorld, type PhysicsModule } from '@lerpit/libs/physics/js';

const factory = async () => {
  const mod = (await import('../build/dynamics.js')).default;
  return (await mod()) as PhysicsModule;
};

export default create3DPhysicsRuntime({
  caption: 'The sphere moves according to its initial velocity. It simply flips its velocity when it hits the walls.',
  factory,
  construct: (m) => new (m.ParticleWorld as new () => NativeWorld)(),
  setup({ world, scene, camera }) {
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    addBoundsBox(scene);
    addSphere(world, scene, { position: [0, 0, 0], velocity: [1, 0, 0], radius: 0.5, color: '#D17041' });
  }
});
