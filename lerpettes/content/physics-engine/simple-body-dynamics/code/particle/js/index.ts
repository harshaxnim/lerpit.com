import { addBoundsBox, addSphere, create3DPhysicsRuntime, type NativeWorld, type PhysicsModule } from '@lerpit/libs/physics/js';

const factory = async () => {
  const mod = (await import('../build/particle_world.js')).default;
  return (await mod()) as PhysicsModule;
};

export default create3DPhysicsRuntime({
  caption: 'A sphere positioned at the origin.',
  factory,
  construct: (m) => new (m.ParticleWorld as new () => NativeWorld)(),
  setup({ world, scene, camera }) {
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    addBoundsBox(scene);
    addSphere(world, scene, { position: [0, 0, 0], velocity: [0, 0, 0], radius: 0.5, color: '#D17041' });
  }
});
