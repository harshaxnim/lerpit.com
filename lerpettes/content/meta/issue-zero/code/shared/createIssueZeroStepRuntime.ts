import * as THREE from 'three';
import { defineChapter, type LerpetteCtx } from '@lerpit/framework/chapter';
import type { Viewport3dTarget } from '@lerpit/framework/panels/viewport3d/viewport3dPanel';
import { hex } from '@lerpit/framework/theme';

/**
 * Issue zero's one picture: a segment from A to B and a point that moves along it to
 * wherever the chapter's `t` says, using the lerp compiled from C++.
 *
 * Each chapter is the same scene with a different target. Where the point is, is kept
 * here rather than per chapter, so scrolling from one chapter to the next glides the
 * point from the last chapter's t to this one's instead of jumping back to A.
 */

type IssueZeroConfig = {
  target: number;
  status: string;
};

type LerpModule = { lerp_f32: (a: number, b: number, t: number) => number };

type State = {
  mover: THREE.Object3D | null;
  glow: THREE.Object3D | null;
};

/** Where the point is along the segment, shared by every chapter of the lesson. */
let current = 0;

const A = new THREE.Vector3(-3.5, -1.25, 0);
const B = new THREE.Vector3(3.75, 1.9, 0);

function buildScene(target: Viewport3dTarget, state: State) {
  // A diagram, looked at straight on, that keeps the whole segment in view on a wide
  // desk or a tall phone drawer.
  target.orthographic(6, 4.5);

  target.lights.clear();
  target.lights.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(4, 8, 6);
  target.lights.add(key);

  const scene = target.scene;
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), new THREE.LineBasicMaterial({ color: hex.accent })));

  const dot = new THREE.SphereGeometry(0.2, 32, 32);
  const anchor = new THREE.MeshStandardMaterial({ color: hex.ink, roughness: 0.32 });
  for (const at of [A, B]) {
    const mesh = new THREE.Mesh(dot, anchor);
    mesh.position.copy(at);
    scene.add(mesh);
  }

  const mover = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 32), new THREE.MeshStandardMaterial({ color: hex.accentWarm, roughness: 0.24 }));
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.42, 48),
    new THREE.MeshBasicMaterial({ color: hex.accentWarm, transparent: true, opacity: 0.28 })
  );
  scene.add(mover, glow);
  state.mover = mover;
  state.glow = glow;
}

export function createIssueZeroStepRuntime(config: IssueZeroConfig) {
  const goal = Math.min(Math.max(config.target, 0), 1);

  return defineChapter<State>({
    panels: ['viewport3d'],
    caption: config.status,
    // Restarting a lerp to where it already is would do nothing a reader could see.
    restart: false,
    wasm: () => import('./build/lerp_demo.js'),
    state: () => ({ mover: null, glow: null }),

    step(_s, dt) {
      // Ease toward the target at the rate the hand-written loop used (8% a frame at
      // 60 fps), scaled by dt so a 120 Hz display does not run it twice as fast.
      const k = 1 - Math.pow(1 - 0.08, dt * 60);
      current += (goal - current) * k;
      if (Math.abs(goal - current) < 0.0001) current = goal;
    },

    viewport3d: {
      build: buildScene,
      draw(_target: Viewport3dTarget, s: State, ctx: LerpetteCtx) {
        const lerp = (ctx.wasm as LerpModule | null)?.lerp_f32;
        if (!lerp || !s.mover || !s.glow) return;
        const x = lerp(A.x, B.x, current);
        const y = lerp(A.y, B.y, current);
        s.mover.position.set(x, y, 0);
        s.glow.position.set(x, y, 0);
        s.glow.rotation.z += 0.01;
      }
    }
  });
}
