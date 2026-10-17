import { loadPhysicsModule } from './loader';
import type { ModuleFactory, NativeParticle, NativeWorld, PhysicsModule } from './types';

const STEP = 1 / 120;
const MAX_FRAME = 0.25;

export class World<Native extends NativeWorld = NativeWorld> {
  private readonly _handles: NativeParticle[] = [];
  private _accumulator = 0;
  private _lastNowMs: number | null = null;
  private _destroyed = false;

  private constructor(
    private readonly _module: PhysicsModule,
    private readonly _native: Native
  ) {}

  static async create<N extends NativeWorld = NativeWorld>(
    factory: ModuleFactory,
    construct: (module: PhysicsModule) => N = (m) => new m.World() as N
  ): Promise<World<N>> {
    const module = await loadPhysicsModule(factory);
    const native = construct(module);
    return new World<N>(module, native);
  }

  get module(): PhysicsModule {
    return this._module;
  }

  get native(): Native {
    return this._native;
  }

  addParticle<P extends NativeParticle>(p: P): P {
    this._assertAlive();
    this._native.addParticle(p);
    this._handles.push(p);
    return p;
  }

  /**
   * Take a body out of the world. The world owns its bodies (world.cpp deletes what it
   * removes), so the handle is not deleted here as well: doing both freed the same C++
   * object twice.
   */
  remove(p: NativeParticle): void {
    if (this._destroyed) return;
    const idx = this._handles.indexOf(p);
    if (idx === -1) return;
    this._handles.splice(idx, 1);
    this._native.remove(p);
  }

  step(dt: number): void {
    this._assertAlive();
    this._native.step(dt);
  }

  /**
   * Advance by a frame's `dt` in seconds, in fixed steps of 1/120 s. What is left
   * over waits for the next frame, so the simulation runs at the same rate whatever
   * the display's refresh. The player's clock already clamps `dt`; this clamps again
   * so a caller that does not cannot spiral.
   */
  advanceBy(dt: number): void {
    this._assertAlive();
    if (!Number.isFinite(dt) || dt <= 0) return;
    this._accumulator += Math.min(dt, MAX_FRAME);
    while (this._accumulator >= STEP) {
      this._native.step(STEP);
      this._accumulator -= STEP;
    }
  }

  /**
   * Advance to an absolute timestamp in milliseconds. Kept for code written against a
   * clock of its own; a chapter is handed `dt` and should call advanceBy.
   */
  advance(nowMs: number): void {
    this._assertAlive();
    if (this._lastNowMs === null) {
      this._lastNowMs = nowMs;
      return;
    }
    const dt = (nowMs - this._lastNowMs) / 1000;
    this._lastNowMs = nowMs;
    this.advanceBy(dt);
  }

  bodyCount(): number {
    return this._native.bodyCount();
  }

  handles(): readonly NativeParticle[] {
    return this._handles;
  }

  /** Free the world and every body in it. Handles held in JS are dead afterwards. */
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
