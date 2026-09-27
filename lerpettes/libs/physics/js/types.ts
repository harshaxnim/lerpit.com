export type Vec3 = [number, number, number];

export type NativeParticle = {
  position: () => Vec3;
  velocity: () => Vec3;
  delete: () => void;
};

export type NativeSphere = NativeParticle & {
  getRadius: () => number;
};

export type NativeWorld = {
  addParticle: (p: NativeParticle) => NativeParticle;
  remove: (p: NativeParticle) => void;
  step: (dt: number) => void;
  destroy: () => void;
  bodyCount: () => number;
  delete: () => void;
};

export type PhysicsModule = {
  World: new () => NativeWorld;
  Particle: new () => NativeParticle;
  Sphere: new (
    pos: [number, number, number],
    vel: [number, number, number],
    radius: number
  ) => NativeSphere;
  [extra: string]: unknown;
};

export type ModuleFactory = () => Promise<PhysicsModule>;
