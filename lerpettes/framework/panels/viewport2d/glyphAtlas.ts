import * as THREE from 'three';

/**
 * Every character the sketch has written, rasterised once, white, into one texture.
 *
 * Text used to be a canvas and a texture per label, redrawn and uploaded whenever its
 * words changed. A readout changes every frame, so twenty readouts were twenty texture
 * uploads a frame, and on meta/perf-lab that held the GPU process at 45% of a core.
 * Here a label is quads over glyphs that are already on the GPU; a new value costs
 * nothing unless it uses a character this size has never shown.
 *
 * Glyphs are white so the vertex colour tints them, which is what lets text share one
 * buffer, one material and one draw call with the shapes. Shapes sample `solid`, a
 * patch of plain white, and come out exactly their vertex colour.
 *
 * Characters are placed one advance apart, without kerning between pairs. For the
 * labels and readouts a sketch writes, in Syne, that is not visible.
 */

/** Rasterised at twice the size asked for, so text stays sharp on a 2x screen. */
export const TEXT_SCALE = 2;

/** Line box over font size, the same proportion the label canvases used. */
const LINE_HEIGHT = 1.4;

/** Clear pixels around each glyph, so linear filtering never reads a neighbour. */
const PAD = 2;

const START_SIZE = 1024;
const MAX_SIZE = 4096;

export type Glyph = {
  /** Texture coordinates of the glyph's cell, 0 to 1, v up. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** The cell in sketch pixels, and where the pen goes after it. */
  width: number;
  height: number;
  advance: number;
  /** The cell starts this far left of the pen: the padding, in sketch pixels. */
  left: number;
};

export type GlyphAtlas = {
  texture: THREE.CanvasTexture;
  /** Texture coordinates of the plain white patch shapes sample. */
  solid: { u: number; v: number };
  /** The glyph for one character at a size, rasterising it the first time. */
  glyph(char: string, size: number): Glyph;
  /**
   * Called after the atlas doubled: every texture coordinate handed out before is now
   * half what it should be, and whoever wrote them this frame has to scale them.
   */
  onGrow: ((factor: number) => void) | null;
  /** Upload whatever was rasterised since the last call. */
  flush(): void;
  dispose(): void;
};

export function createGlyphAtlas(): GlyphAtlas {
  let canvas = document.createElement('canvas');
  let context = canvas.getContext('2d')!;
  let size = START_SIZE;
  const glyphs = new Map<string, Glyph>();
  // Shelf packing: glyphs fill a row left to right; a row is as tall as its tallest.
  let penX = 0;
  let penY = 0;
  let rowHeight = 0;
  let dirty = true;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Mipmaps would blur small text into its neighbours and cost an upload each time.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const SOLID = 4;
  const solid = { u: 0, v: 0 };

  const reset = (nextSize: number) => {
    size = nextSize;
    canvas.width = size;
    canvas.height = size;
    context.clearRect(0, 0, size, size);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, SOLID, SOLID);
    penX = SOLID + PAD;
    penY = 0;
    rowHeight = SOLID;
    solid.u = SOLID / 2 / size;
    solid.v = 1 - SOLID / 2 / size;
    glyphs.clear();
    texture.dispose();
    dirty = true;
  };
  reset(START_SIZE);

  /** Double the canvas, keeping what is drawn where it is. */
  const grow = () => {
    const old = canvas;
    canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    context = canvas.getContext('2d')!;
    context.drawImage(old, 0, 0);
    const factor = size / (size * 2);
    size *= 2;
    for (const g of glyphs.values()) {
      g.u0 *= factor;
      g.u1 *= factor;
      // v counts up from the bottom, and the old canvas sits at the top of the new one.
      g.v0 = 1 - (1 - g.v0) * factor;
      g.v1 = 1 - (1 - g.v1) * factor;
    }
    solid.u = SOLID / 2 / size;
    solid.v = 1 - SOLID / 2 / size;
    texture.image = canvas;
    texture.dispose();
    dirty = true;
    atlas.onGrow?.(factor);
  };

  /** Find room for a cell, growing the atlas, or as a last resort starting it again. */
  const place = (w: number, h: number): { x: number; y: number } => {
    if (penX + w > size) {
      penX = 0;
      penY += rowHeight + PAD;
      rowHeight = 0;
    }
    if (penY + h > size) {
      if (size < MAX_SIZE) {
        grow();
        return place(w, h);
      }
      // Thousands of distinct glyphs: start over. Text drawn earlier this frame shows
      // the wrong glyphs for one frame, and the next frame rasterises what it needs.
      reset(size);
    }
    const at = { x: penX, y: penY };
    penX += w + PAD;
    rowHeight = Math.max(rowHeight, h);
    return at;
  };

  const atlas: GlyphAtlas = {
    texture,
    solid,
    onGrow: null,

    glyph(char, fontSize) {
      const key = `${fontSize}|${char}`;
      const known = glyphs.get(key);
      if (known) return known;

      const font = `${fontSize * TEXT_SCALE}px "Syne", system-ui, sans-serif`;
      context.font = font;
      const advancePx = context.measureText(char).width;
      const w = Math.ceil(advancePx) + PAD * 2;
      const h = Math.ceil(fontSize * TEXT_SCALE * LINE_HEIGHT);
      const at = place(w, h);

      context.font = font;
      context.textBaseline = 'middle';
      context.fillStyle = '#ffffff';
      context.fillText(char, at.x + PAD, at.y + h / 2);
      dirty = true;

      const glyph: Glyph = {
        u0: at.x / size,
        u1: (at.x + w) / size,
        v0: 1 - (at.y + h) / size,
        v1: 1 - at.y / size,
        width: w / TEXT_SCALE,
        height: h / TEXT_SCALE,
        advance: advancePx / TEXT_SCALE,
        left: PAD / TEXT_SCALE
      };
      glyphs.set(key, glyph);
      return glyph;
    },

    flush() {
      if (!dirty) return;
      dirty = false;
      texture.needsUpdate = true;
    },

    dispose() {
      texture.dispose();
      glyphs.clear();
      document.fonts?.removeEventListener('loadingdone', onFonts);
    }
  };

  // A glyph rasterised before Syne arrived is in the fallback face for good, so a font
  // finishing loading clears the atlas and the next frame draws it again.
  const onFonts = () => reset(size);
  document.fonts?.addEventListener('loadingdone', onFonts);

  return atlas;
}
