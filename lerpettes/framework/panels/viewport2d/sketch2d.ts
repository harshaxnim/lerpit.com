import * as THREE from 'three';

/**
 * An immediate-mode face on a retained-mode engine.
 *
 * three.js holds a scene of objects between frames, which means the honest way to draw
 * a changing picture with it is to create meshes once, find them again next frame, set
 * their properties, and dispose of them when they are no longer wanted. That is fine
 * for a 3D scene, where the objects are the subject. It is miserable for a 2D sketch,
 * where the subject is a line whose length is a number in the state, and where a
 * reader's exercise is four lines of physics rather than scene bookkeeping.
 *
 * So the panel does the bookkeeping and the reader does not. Every call here takes the
 * next object out of a pool, configures it, and marks it used; at the end of the frame
 * whatever went unused is hidden rather than destroyed. The pool settles at the high
 * water mark of a scene and stops allocating, so a loop over a list of any length costs
 * nothing after its first frame and there is no `dispose` anyone can forget.
 *
 * Coordinates are the ones a reader expects: pixels, origin at the top left, y down.
 * The camera underneath is an ordinary y-up orthographic one and this maps into it,
 * because a y-flipped frustum reverses winding order and silently culls every face.
 */

/** Pooled objects of one shape, and how many of them this frame has claimed. */
type Pool<T extends THREE.Object3D> = {
  items: T[];
  used: number;
  make: () => T;
};

const UNIT_QUAD = new THREE.PlaneGeometry(1, 1);
const UNIT_CIRCLE = new THREE.CircleGeometry(1, 32);

/** Colours arrive as 0xrrggbb from a reader, or as a CSS string when that is easier. */
export type Paint = number | string;

export type Sketch2D = {
  /** A filled rectangle. `x, y` is its top-left corner. */
  rect(x: number, y: number, width: number, height: number, color?: Paint): void;
  /** A filled circle centred on `x, y`. */
  circle(x: number, y: number, radius: number, color?: Paint): void;
  /** A straight line of real width, unlike WebGL's own, which ignores it. */
  line(x1: number, y1: number, x2: number, y2: number, color?: Paint, width?: number): void;
  /** A run of connected segments. Takes `[[x, y], ...]` or a flat `[x, y, x, y, ...]`. */
  path(points: ReadonlyArray<readonly [number, number]> | readonly number[], color?: Paint, width?: number): void;
  /** A line of text. `x, y` is its left baseline-ish anchor. */
  text(value: string, x: number, y: number, color?: Paint, size?: number): void;
  /**
   * The band under the tabs, for a sentence about what the panel is showing.
   *
   * Unlike everything else here it is not redrawn each frame: the last value set is
   * the one that stands, so setting it once in `build` is enough and setting it every
   * frame is also fine. Text, not pixels, so it is selectable and readable aloud.
   */
  caption(value: string): void;
  /** The scene itself, for a chapter that wants three.js rather than this. */
  scene: THREE.Scene;
  /** The panel box, in the same pixels every call above uses. */
  width: number;
  height: number;
};

/** Text is rasterised to a texture, which is slow enough to be worth not repeating. */
const LABEL_CACHE_LIMIT = 64;

export function createSketch2D(scene: THREE.Scene, setCaption: (value: string) => void) {
  const labels = new Map<string, THREE.CanvasTexture>();
  let caption = '';
  let width = 0;
  let height = 0;
  let order = 0;

  const flat = <T extends THREE.Object3D>(pool: Pool<T>): T => {
    if (pool.used === pool.items.length) {
      const made = pool.make();
      made.frustumCulled = false;
      scene.add(made);
      pool.items.push(made);
    }

    const item = pool.items[pool.used];
    pool.used += 1;
    item.visible = true;
    // Painter's order, so a later call covers an earlier one the way a 2D context does.
    item.renderOrder = order;
    order += 1;
    return item;
  };

  const material = () =>
    new THREE.MeshBasicMaterial({
      // Depth is meaningless in a flat sketch, and leaving it on makes what is in front
      // depend on creation order rather than on the order the reader drew things.
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide
    });

  const quads: Pool<THREE.Mesh> = { items: [], used: 0, make: () => new THREE.Mesh(UNIT_QUAD, material()) };
  const discs: Pool<THREE.Mesh> = { items: [], used: 0, make: () => new THREE.Mesh(UNIT_CIRCLE, material()) };
  const sprites: Pool<THREE.Sprite> = {
    items: [],
    used: 0,
    make: () => new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }))
  };

  const paint = (mesh: THREE.Mesh, color: Paint) => {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color as never);
    return mat;
  };

  /** Reader y counts down from the top; the camera counts up from the bottom. */
  const worldY = (y: number) => height - y;

  const textureFor = (value: string, size: number, color: Paint): THREE.CanvasTexture => {
    const key = `${size}|${String(color)}|${value}`;
    const cached = labels.get(key);
    if (cached) {
      return cached;
    }

    const scale = 2;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser would not give the panel a 2D context to rasterise text with.');
    }

    const font = `${size * scale}px "IBM Plex Mono", monospace`;
    context.font = font;
    const measured = context.measureText(value);
    canvas.width = Math.max(1, Math.ceil(measured.width));
    canvas.height = Math.ceil(size * scale * 1.4);

    // Setting the canvas size resets the context, so the font is set again after it.
    context.font = font;
    context.textBaseline = 'middle';
    context.fillStyle = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
    context.fillText(value, 0, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    if (labels.size >= LABEL_CACHE_LIMIT) {
      // A readout whose text changes every frame would otherwise grow without bound.
      const oldest = labels.keys().next().value as string;
      labels.get(oldest)?.dispose();
      labels.delete(oldest);
    }

    labels.set(key, texture);
    return texture;
  };

  const api: Sketch2D = {
    scene,
    get width() {
      return width;
    },
    get height() {
      return height;
    },

    rect(x, y, w, h, color = 0x2e6da4) {
      const mesh = flat(quads);
      mesh.geometry = UNIT_QUAD;
      paint(mesh, color);
      mesh.scale.set(w || 0.0001, h || 0.0001, 1);
      mesh.position.set(x + w / 2, worldY(y + h / 2), 0);
      mesh.rotation.z = 0;
    },

    circle(x, y, radius, color = 0x2e6da4) {
      const mesh = flat(discs);
      paint(mesh, color);
      mesh.scale.set(radius || 0.0001, radius || 0.0001, 1);
      mesh.position.set(x, worldY(y), 0);
      mesh.rotation.z = 0;
    },

    line(x1, y1, x2, y2, color = 0x2e6da4, lineWidth = 1.5) {
      const ax = x1;
      const ay = worldY(y1);
      const bx = x2;
      const by = worldY(y2);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length === 0) {
        return;
      }

      const mesh = flat(quads);
      mesh.geometry = UNIT_QUAD;
      paint(mesh, color);
      mesh.scale.set(length, lineWidth, 1);
      mesh.position.set((ax + bx) / 2, (ay + by) / 2, 0);
      mesh.rotation.z = Math.atan2(dy, dx);
    },

    path(points, color = 0x2e6da4, lineWidth = 1.5) {
      const pairs: Array<[number, number]> = [];
      if (points.length > 0 && typeof points[0] === 'number') {
        const flatPoints = points as readonly number[];
        for (let i = 0; i + 1 < flatPoints.length; i += 2) {
          pairs.push([flatPoints[i], flatPoints[i + 1]]);
        }
      } else {
        pairs.push(...(points as ReadonlyArray<readonly [number, number]>).map((p) => [p[0], p[1]] as [number, number]));
      }

      for (let i = 0; i + 1 < pairs.length; i += 1) {
        api.line(pairs[i][0], pairs[i][1], pairs[i + 1][0], pairs[i + 1][1], color, lineWidth);
      }
    },

    caption(value) {
      // Written through only when it changed. This is called from inside a frame, and
      // writing the same string sixty times a second would drop the reader's selection
      // on every one of them.
      if (value === caption) {
        return;
      }

      caption = value;
      setCaption(value);
    },

    text(value, x, y, color = 0x506270, size = 12) {
      if (!value) {
        return;
      }

      const sprite = flat(sprites);
      const texture = textureFor(value, size, color);
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.map = texture;
      mat.needsUpdate = true;

      const w = texture.image.width / 2;
      const h = texture.image.height / 2;
      sprite.scale.set(w, h, 1);
      // Sprites are centred; shift so the reader's x, y is the left of the line.
      sprite.position.set(x + w / 2, worldY(y), 0);
    }
  };

  return {
    api,

    /** Start a frame: nothing is claimed, and nothing has been drawn over anything. */
    begin(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
      quads.used = 0;
      discs.used = 0;
      sprites.used = 0;
      order = 0;
    },

    /** End a frame: whatever this frame did not claim is hidden, never destroyed. */
    end() {
      for (const pool of [quads, discs, sprites] as Array<Pool<THREE.Object3D>>) {
        for (let i = pool.used; i < pool.items.length; i += 1) {
          pool.items[i].visible = false;
        }
      }
    },

    dispose() {
      for (const pool of [quads, discs, sprites] as Array<Pool<THREE.Object3D>>) {
        for (const item of pool.items) {
          scene.remove(item);
          const mat = (item as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((entry) => entry.dispose());
          } else {
            mat?.dispose();
          }
        }
        pool.items.length = 0;
        pool.used = 0;
      }

      labels.forEach((texture) => texture.dispose());
      labels.clear();
    }
  };
}
