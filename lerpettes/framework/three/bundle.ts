import * as THREE from 'three';

/*
 * One way to stand up three.js on a canvas.
 *
 * Every WebGL surface on the site needs the same few decisions, and they used to be
 * made four times with small disagreements: the 3D runtime's scene kind, both viewport
 * panels, and issue zero's hand-written scene. The renderer settings, the pixel ratio,
 * the resize that must not touch CSS size, and handing the GL context back are here
 * once. What differs between them is only the camera, so that is a parameter.
 */

export type ViewSize = { width: number; height: number; dpr: number };

export type ThreeBundle = {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  resize(size: ViewSize): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /** Release the GL context now rather than when the canvas is collected. */
  dispose(): void;
};

export function createThreeBundle(canvas: HTMLCanvasElement, size: ViewSize): ThreeBundle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  // The ratio the panel measured, so setSize writes the backing store the panel expects.
  // Told 1, three quietly resizes the canvas back down to layout pixels and renders soft.
  renderer.setPixelRatio(size.dpr);
  let last = '';

  return {
    canvas,
    renderer,
    resize(next) {
      // Called every frame by panels that cannot tell a resize from a draw. setSize
      // reassigns the canvas's width, which clears it, so it only runs on a change.
      const key = `${next.width}x${next.height}@${next.dpr}`;
      if (key === last) return;
      last = key;
      renderer.setPixelRatio(next.dpr);
      // `false`: the canvas's CSS size is the panel's business; three writing it too is
      // how the two end up disagreeing about what a pixel is.
      renderer.setSize(next.width, next.height, false);
    },
    render(scene, camera) {
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.dispose();
      // Browsers cap live WebGL contexts, and moving between chapters builds panels.
      renderer.forceContextLoss();
    }
  };
}

/** A perspective camera looking at the origin. */
export function perspectiveCamera(
  size: ViewSize,
  options: { fov?: number; near?: number; far?: number; position?: [number, number, number] } = {}
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    options.fov ?? 45,
    Math.max(size.width, 1) / Math.max(size.height, 1),
    options.near ?? 0.1,
    options.far ?? 200
  );
  camera.position.set(...(options.position ?? [0, 2, 7]));
  camera.lookAt(0, 0, 0);
  return camera;
}

export function fitPerspective(camera: THREE.PerspectiveCamera, size: ViewSize): void {
  camera.aspect = Math.max(size.width, 1) / Math.max(size.height, 1);
  camera.updateProjectionMatrix();
}

/**
 * An orthographic camera that keeps a world rectangle in view whatever the panel's
 * shape: at least `halfWidth` either side of the origin and `halfHeight` above and
 * below, with the spare room going to whichever axis the panel has more of. A diagram
 * drawn in world units then never crops, on a tall phone drawer or a wide desk.
 */
export function orthoFitCamera(halfWidth: number, halfHeight: number): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 50);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.userData.fit = { halfWidth, halfHeight };
  return camera;
}

export function fitOrtho(camera: THREE.OrthographicCamera, size: ViewSize): void {
  const fit = camera.userData.fit as { halfWidth: number; halfHeight: number } | undefined;
  if (!fit) return;
  const aspect = Math.max(size.width, 1) / Math.max(size.height, 1);
  const base = fit.halfWidth / fit.halfHeight;
  const wider = aspect >= base;
  const halfWidth = wider ? fit.halfHeight * aspect : fit.halfWidth;
  const halfHeight = wider ? fit.halfHeight : fit.halfWidth / Math.max(aspect, 0.0001);
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

/** Fit whichever camera this is to the panel. */
export function fitCamera(camera: THREE.Camera, size: ViewSize): void {
  if (camera instanceof THREE.PerspectiveCamera) fitPerspective(camera, size);
  else if (camera instanceof THREE.OrthographicCamera) fitOrtho(camera, size);
}

/**
 * Free everything under a root that three will not free by being forgotten: geometry,
 * materials and their textures. A chapter's scene is torn down with this, so lights,
 * lines, points and groups go too, not only meshes.
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const withGeometry = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    withGeometry.geometry?.dispose();
    const materials = Array.isArray(withGeometry.material) ? withGeometry.material : withGeometry.material ? [withGeometry.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** The two lighting set-ups lessons use: a lit studio, and flat even light. */
export function addLights(target: THREE.Object3D, kind: 'studio' | 'flat'): void {
  if (kind === 'flat') {
    target.add(new THREE.AmbientLight(0xffffff, 2));
    return;
  }
  // Enough light that a plain mesh is seen, with a key from above-right for shape.
  target.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 6, 5);
  target.add(key);
}
