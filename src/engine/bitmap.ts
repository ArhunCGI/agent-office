import { pack, type Hex } from "./color";

/**
 * Pure in-memory RGBA pixel buffer. All sprites are painted here first (testable in Node),
 * then converted once to a canvas for blitting.
 */
export class Bitmap {
  readonly data: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint32Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: Hex): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.inside(x, y)) this.data[y * this.w + x] = pack(c);
  }

  setRaw(x: number, y: number, v: number): void {
    if (this.inside(x, y)) this.data[y * this.w + x] = v;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? (this.data[y * this.w + x] ?? 0) : 0;
  }

  opaque(x: number, y: number): boolean {
    return this.get(x, y) >>> 24 !== 0;
  }

  rect(x: number, y: number, w: number, h: number, c: Hex): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Copies opaque pixels of src at (dx, dy). */
  blit(src: Bitmap, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const v = src.data[y * src.w + (flipX ? src.w - 1 - x : x)] ?? 0;
        if (v >>> 24) this.setRaw(dx + x, dy + y, v);
      }
    }
  }

  clone(): Bitmap {
    const b = new Bitmap(this.w, this.h);
    b.data.set(this.data);
    return b;
  }

  flipped(): Bitmap {
    const b = new Bitmap(this.w, this.h);
    b.blit(this, 0, 0, true);
    return b;
  }

  /** Adds a 1px outline outside the silhouette (4-neighbourhood). */
  outline(c: Hex): void {
    const v = pack(c);
    const src = this.clone();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src.opaque(x, y)) continue;
        if (src.opaque(x - 1, y) || src.opaque(x + 1, y) || src.opaque(x, y - 1) || src.opaque(x, y + 1)) {
          this.setRaw(x, y, v);
        }
      }
    }
  }

  /** Smallest rectangle containing all opaque pixels, or null when empty. */
  bounds(): { x: number; y: number; w: number; h: number } | null {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.opaque(x, y)) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  crop(x: number, y: number, w: number, h: number): Bitmap {
    const b = new Bitmap(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.setRaw(i, j, this.get(x + i, y + j));
    return b;
  }
}

/** 4×4 ordered (Bayer) dither threshold in [0, 1). */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) / 16;
}

/** Keeps a `level` (0..1) fraction of pixels with an ordered pattern — pixel-art friendly fade. */
export function dithered(src: Bitmap, level: number): Bitmap {
  const b = new Bitmap(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (bayer(x, y) < level) b.setRaw(x, y, src.get(x, y));
    }
  }
  return b;
}
