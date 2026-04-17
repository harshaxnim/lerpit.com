import type { Object3D } from 'three';
import type { NativeParticle } from './types';
import { World } from './world';

const bindings = new WeakMap<NativeParticle, Object3D>();

export function bindMesh(particle: NativeParticle, mesh: Object3D): void {
  bindings.set(particle, mesh);
}

export function unbindMesh(particle: NativeParticle): void {
  bindings.delete(particle);
}

export function syncMeshes(world: World): void {
  const handles = world.handles();
  for (let i = 0; i < handles.length; i++) {
    const mesh = bindings.get(handles[i]);
    if (!mesh) continue;
    const pos = handles[i].position();
    mesh.position.set(pos[0], pos[1], pos[2]);
  }
}
