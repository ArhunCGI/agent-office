import type { Bitmap } from "./bitmap";
import type { Hex } from "./color";

/** Colour ramp of one material, darkest to lightest. */
export interface Ramp {
  outline: Hex;
  shade: Hex;
  base: Hex;
  light: Hex;
}

/** Boolean silhouette used to build organic shapes, then auto-shaded with a Ramp. */
export class Mask {
  private bits: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.bits = new Uint8Array(w * h);
  }

  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.bits[y * this.w + x] === 1;
  }

  set(x: number, y: number, on = true): this {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.bits[y * this.w + x] = on ? 1 : 0;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, on = true): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, on);
    return this;
  }

  /** Rectangle with `r` pixels cut diagonally from each corner. */
  roundRect(x: number, y: number, w: number, h: number, r = 1): this {
    this.rect(x, y, w, h);
    for (let k = 0; k < r; k++) {
      for (let i = 0; i < r - k; i++) {
        this.set(x + i, y + k, false);
        this.set(x + w - 1 - i, y + k, false);
        this.set(x + i, y + h - 1 - k, false);
        this.set(x + w - 1 - i, y + h - 1 - k, false);
      }
    }
    return this;
  }

  /** Ellipse sampled at pixel centres; cx/cy may be fractional (x.0 = even width). */
  ellipse(cx: number, cy: number, rx: number, ry: number, on = true): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, on);
      }
    }
    return this;
  }

  count(): number {
    let n = 0;
    for (const b of this.bits) n += b;
    return n;
  }
}

/**
 * Paints a mask with consistent lighting (warm key light from the top-left):
 * 1px inner outline, a light rim top/left, a shade rim bottom/right, base elsewhere.
 */
export function paintShape(bmp: Bitmap, m: Mask, ramp: Ramp, dx = 0, dy = 0): void {
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.has(x, y)) continue;
      let c: Hex;
      if (!m.has(x - 1, y) || !m.has(x + 1, y) || !m.has(x, y - 1) || !m.has(x, y + 1)) c = ramp.outline;
      else if ((!m.has(x, y - 2) || !m.has(x - 2, y)) && m.has(x + 2, y)) c = ramp.light;
      else if (!m.has(x, y + 2) || !m.has(x + 2, y)) c = ramp.shade;
      else c = ramp.base;
      bmp.set(x + dx, y + dy, c);
    }
  }
}

/** Paints a small hand-made sprite: rows of chars, each char mapped to a colour ('.' / ' ' = transparent). */
export function paintMatrix(bmp: Bitmap, rows: readonly string[], colors: Record<string, Hex>, x: number, y: number, flipX = false): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[flipX ? row.length - 1 - i : i];
      if (!ch || ch === "." || ch === " ") continue;
      const c = colors[ch];
      if (c) bmp.set(x + i, y + j, c);
    }
  });
}
