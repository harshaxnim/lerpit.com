import * as THREE from 'three';
import type { LerpetteRuntimeContext, LerpetteStepRuntime } from '@/lib/lerpettes/types';
import { loadLerpModule } from './lerpLoader';

type IssueZeroConfig = {
  target: number;
  runtimeLabel: string;
  status: string;
};

type IssueZeroSharedScene = {
  setTarget: (target: number) => void;
  renderNow: () => void;
  resize: () => void;
  dispose: () => void;
};

export function createIssueZeroStepRuntime(config: IssueZeroConfig): LerpetteStepRuntime {
  const sharedWasmPath = '../shared/build/lerp_demo.wasm';

  return {
    async mount(ctx) {
      await ensureIssueZeroScene(ctx, ctx.resolveAssetUrl(sharedWasmPath));
    },
    async enter(ctx) {
      const scene = await ensureIssueZeroScene(ctx, ctx.resolveAssetUrl(sharedWasmPath));
      ctx.setCaption(config.status);
      scene.setTarget(config.target);
      scene.renderNow();
    },
    resize(ctx) {
      const scene = ctx.shared.get('issue-zero-scene') as IssueZeroSharedScene | undefined;
      scene?.resize();
    },
    dispose(ctx) {
      const scene = ctx.shared.get('issue-zero-scene') as IssueZeroSharedScene | undefined;
      scene?.dispose();
      ctx.shared.delete('issue-zero-scene');
    }
  };
}

async function ensureIssueZeroScene(ctx: LerpetteRuntimeContext, wasmUrl: string): Promise<IssueZeroSharedScene> {
  const existing = ctx.shared.get('issue-zero-scene') as IssueZeroSharedScene | undefined;
  if (existing) {
    return existing;
  }

  const module = await loadLerpModule(wasmUrl);
  const renderer = new THREE.WebGLRenderer({
    canvas: ctx.canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const baseHalfWidth = 6;
  const baseHalfHeight = 4.5;
  const baseAspect = baseHalfWidth / baseHalfHeight;
  const camera = new THREE.OrthographicCamera(-baseHalfWidth, baseHalfWidth, baseHalfHeight, -baseHalfHeight, 0.1, 50);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  const pointA = new THREE.Vector3(-3.5, -1.25, 0);
  const pointB = new THREE.Vector3(3.75, 1.9, 0);

  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x2e6da4 });
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
  scene.add(new THREE.Line(lineGeometry, lineMaterial));

  const dotGeometry = new THREE.SphereGeometry(0.2, 32, 32);
  const pointMaterial = new THREE.MeshStandardMaterial({ color: 0x20313f, roughness: 0.32 });
  const moverMaterial = new THREE.MeshStandardMaterial({ color: 0xd17041, roughness: 0.24 });

  const anchorA = new THREE.Mesh(dotGeometry, pointMaterial);
  anchorA.position.copy(pointA);
  scene.add(anchorA);

  const anchorB = new THREE.Mesh(dotGeometry, pointMaterial);
  anchorB.position.copy(pointB);
  scene.add(anchorB);

  const mover = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 32), moverMaterial);
  mover.position.copy(pointA);
  scene.add(mover);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.42, 48),
    new THREE.MeshBasicMaterial({ color: 0xd17041, transparent: true, opacity: 0.28 })
  );
  glow.position.copy(pointA);
  scene.add(glow);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
  keyLight.position.set(4, 8, 6);
  scene.add(keyLight);

  let target = 0;
  let current = 0;
  let rafId = 0;
  let disposed = false;

  const resize = () => {
    const width = ctx.host.clientWidth;
    const height = Math.max(ctx.host.clientHeight, 320);
    renderer.setSize(width, height, false);

    const safeHeight = Math.max(height, 1);
    const aspect = width / safeHeight;
    const isWiderThanBase = aspect >= baseAspect;
    const halfWidth = isWiderThanBase ? baseHalfHeight * aspect : baseHalfWidth;
    const halfHeight = isWiderThanBase ? baseHalfHeight : baseHalfWidth / Math.max(aspect, 0.0001);

    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  };

  const renderFrame = () => {
    if (disposed) {
      return;
    }

    current += (target - current) * 0.08;
    if (Math.abs(target - current) < 0.0001) {
      current = target;
    }

    const x = module.lerp(pointA.x, pointB.x, current);
    const y = module.lerp(pointA.y, pointB.y, current);
    mover.position.set(x, y, 0);
    glow.position.set(x, y, 0);
    glow.rotation.z += 0.01;

    renderer.render(scene, camera);

    if (!document.hidden) {
      rafId = window.requestAnimationFrame(renderFrame);
    }
  };

  resize();
  renderFrame();

  const shared: IssueZeroSharedScene = {
    setTarget(nextTarget) {
      target = Math.min(Math.max(nextTarget, 0), 1);
      if (!rafId) {
        renderFrame();
      }
    },
    renderNow() {
      resize();
      renderer.render(scene, camera);
    },
    resize,
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      renderer.dispose();
    }
  };

  ctx.shared.set('issue-zero-scene', shared);
  return shared;
}
