import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FrameSize, LerpetteSceneKind } from './frameLoop';

/**
 * The WebGL scene kind: a three.js renderer, scene, camera and orbit controls.
 *
 * This is the whole difference between a 2D chapter and a 3D one. Everything else —
 * the loop, the pixel ratio, the frame delta, pausing while hidden, noticing the
 * canvas was replaced — is the driver's, and neither kind repeats any of it.
 *
 * The bundle is cached in the panel's `shared` map rather than in a closure, because
 * a browser caps how many live WebGL contexts it will hand out and a panel swap makes
 * that reachable. `shared` is documented as living exactly as long as the panel, which
 * is exactly as long as one context should.
 */
export type ThreeSceneTarget = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
};

const BUNDLE_KEY = 'scene:three';

export const threeScene: LerpetteSceneKind<ThreeSceneTarget> = {
  acquire(canvas: HTMLCanvasElement, size: FrameSize, shared: Map<string, unknown>) {
    const cached = shared.get(BUNDLE_KEY) as ThreeSceneTarget | undefined;
    if (cached && cached.renderer.domElement === canvas) {
      return cached;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, size.width / Math.max(size.height, 1), 0.1, 100);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    // Three is given the same ratio the driver used, so setSize writes the backing
    // store the driver already wrote rather than a different one. Told a ratio of 1 it
    // quietly resizes the canvas back down to layout pixels and the scene renders soft.
    renderer.setPixelRatio(size.dpr);
    renderer.setSize(size.width, size.height, false);

    scene.add(new THREE.AmbientLight(0xffffff, 2));

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;

    const bundle: ThreeSceneTarget = { scene, camera, renderer, controls };
    shared.set(BUNDLE_KEY, bundle);
    return bundle;
  },

  resize(target: ThreeSceneTarget, size: FrameSize) {
    target.renderer.setPixelRatio(size.dpr);
    target.renderer.setSize(size.width, size.height, false);
    target.camera.aspect = size.width / Math.max(size.height, 1);
    target.camera.updateProjectionMatrix();
  },

  // Nothing to clear: three clears its own buffers, and a 3D scene persists between
  // frames where a 2D one is redrawn from scratch.
  end(target: ThreeSceneTarget) {
    target.controls.update();
    target.renderer.render(target.scene, target.camera);
  },

  release(target: ThreeSceneTarget, shared: Map<string, unknown>) {
    target.controls.dispose();
    target.renderer.dispose();
    // dispose() frees three's own objects but leaves the GL context live until it is
    // collected. Browsers cap concurrent contexts, and panel swaps make that reachable.
    target.renderer.forceContextLoss();
    shared.delete(BUNDLE_KEY);
  }
};
