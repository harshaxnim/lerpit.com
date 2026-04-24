import { loadPhysicsModule } from './loader';
import type { ModuleFactory, NativeParticle, NativeWorld, PhysicsModule } from './types';

const STEP = 1 / 120;
const MAX_FRAME = 0.25;

export class World {
  private readonly _handles: NativeParticle[] = [];
  private _accumulator = 0;
  private _lastNowMs: number | null = null;
  private _destroyed = false;

  private constructor(
    private readonly _module: PhysicsModule,
    private readonly _native: NativeWorld
  ) {}

  static async create(
    factory: ModuleFactory,
    construct: (module: PhysicsModule) => NativeWorld = (m) => new m.World()
  ): Promise<World> {
    const module = await loadPhysicsModule(factory);
    const native = construct(module);
    return new World(module, native);
  }

  get module(): PhysicsModule {
    return this._module;
  }

  get native(): NativeWorld {
    return this._native;
  }

  addParticle<P extends NativeParticle>(p: P): P {
    this._assertAlive();
    this._native.addParticle(p);
    this._handles.push(p);
    return p;
  }

  remove(p: NativeParticle): void {
    if (this._destroyed) return;
    const idx = this._handles.indexOf(p);
    if (idx === -1) return;
    this._handles.splice(idx, 1);
    this._native.remove(p);
    p.delete();
  }

  step(dt: number): void {
    this._assertAlive();
    this._native.step(dt);
  }

  advance(nowMs: number): void {
    this._assertAlive();
    if (this._lastNowMs === null) {
      this._lastNowMs = nowMs;
      return;
    }
    const dt = Math.min((nowMs - this._lastNowMs) / 1000, MAX_FRAME);
    this._lastNowMs = nowMs;
    this._accumulator += dt;
    while (this._accumulator >= STEP) {
      this._native.step(STEP);
      this._accumulator -= STEP;
    }
  }

  bodyCount(): number {
    return this._native.bodyCount();
  }

  handles(): readonly NativeParticle[] {
    return this._handles;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._native.destroy();
    this._handles.length = 0;
    this._native.delete();
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error('World has been destroyed');
  }
}
