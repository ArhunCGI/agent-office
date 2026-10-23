import { Bitmap } from "./bitmap";
import type { Hex } from "./color";
import { worldToScreen, type Vec2 } from "./iso";

export interface BoxColors {
  top: Hex;
  /** Face looking +y (screen bottom-left), lit by the key light. */
  left: Hex;
  /** Face looking +x (screen bottom-right), in shade. */
  right: Hex;
  /** Optional highlight on the front edges of the top face and the front vertical edge. */
  edge?: Hex;
}

type Pt = readonly [number, number];

/** Fills pixels whose centre lies inside the polygon (exact 2:1 staircases for iso edges). */
export function fillPolygon(pts: readonly Pt[], plot: (x: number, y: number) => void): void {
  const ys = pts.map((p) => p[1]);
  const xs = pts.map((p) => p[0]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  const x0 = Math.floor(Math.min(...xs));
  const x1 = Math.ceil(Math.max(...xs));
  for (let y = y0; y < y1; y++) {
    const cy = y + 0.5;
    for (let x = x0; x < x1; x++) {
      const cx = x + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > cy !== yj > cy && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) plot(x, y);
    }
  }
}

/** Draws world-space primitives (boxes, quads on planes) into a bitmap at a given screen origin. */
export class IsoPainter {
  constructor(
    readonly bmp: Bitmap,
    readonly origin: Vec2,
  ) {}

  proj(x: number, y: number, z: number): Pt {
    const s = worldToScreen(x, y, z);
    return [this.origin.x + s.x, this.origin.y + s.y];
  }

  poly3(pts: readonly (readonly [number, number, number])[], c: Hex | ((x: number, y: number) => Hex | null)): void {
    fillPolygon(
      pts.map(([x, y, z]) => this.proj(x, y, z)),
      (px, py) => {
        const col = typeof c === "string" ? c : c(px, py);
        if (col) this.bmp.set(px, py, col);
      },
    );
  }

  /** Solid box from (x,y,z) with size (w,d,h) in world units. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, col: BoxColors): void {
    const face = new Map<number, 0 | 1 | 2>();
    const k = (px: number, py: number) => py * 4096 + px;
    const t = z + h;
    const quads: [0 | 1 | 2, Pt[]][] = [
      [1, [this.proj(x, y + d, t), this.proj(x + w, y + d, t), this.proj(x + w, y + d, z), this.proj(x, y + d, z)]],
      [2, [this.proj(x + w, y + d, t), this.proj(x + w, y, t), this.proj(x + w, y, z), this.proj(x + w, y + d, z)]],
      [0, [this.proj(x, y, t), this.proj(x + w, y, t), this.proj(x + w, y + d, t), this.proj(x, y + d, t)]],
    ];
    for (const [id, pts] of quads) fillPolygon(pts, (px, py) => face.set(k(px, py), id));
    for (const [key, id] of face) {
      const px = key % 4096;
      const py = Math.floor(key / 4096);
      let c = id === 0 ? col.top : id === 1 ? col.left : col.right;
      if (col.edge) {
        const below = face.get(k(px, py + 1));
        if (id === 0 && below !== undefined && below !== 0) c = col.edge;
        if (id === 1 && face.get(k(px + 1, py)) === 2 && h > 2) c = col.edge;
      }
      this.bmp.set(px, py, c);
    }
  }

  /** Quad on the vertical plane y = const (the NE wall plane), spanning x0..x1, z0..z1. */
  quadY(y: number, x0: number, x1: number, z0: number, z1: number, c: Hex | ((x: number, y: number) => Hex | null)): void {
    this.poly3(
      [
        [x0, y, z1],
        [x1, y, z1],
        [x1, y, z0],
        [x0, y, z0],
      ],
      c,
    );
  }

  /** Quad on the vertical plane x = const (the NW wall plane), spanning y0..y1, z0..z1. */
  quadX(x: number, y0: number, y1: number, z0: number, z1: number, c: Hex | ((x: number, y: number) => Hex | null)): void {
    this.poly3(
      [
        [x, y0, z1],
        [x, y1, z1],
        [x, y1, z0],
        [x, y0, z0],
      ],
      c,
    );
  }

  /** Quad on the horizontal plane z = const. */
  quadZ(z: number, x0: number, x1: number, y0: number, y1: number, c: Hex | ((x: number, y: number) => Hex | null)): void {
    this.poly3(
      [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ],
      c,
    );
  }

  /** Paints the plane y = Y with a function of plane coordinates (x, z), sampled at pixel centres. */
  planeY(Y: number, x0: number, x1: number, z0: number, z1: number, fn: (x: number, z: number) => Hex | null): void {
    this.quadY(Y, x0, x1, z0, z1, (px, py) => {
      const sx = px + 0.5 - this.origin.x;
      const sy = py + 0.5 - this.origin.y;
      const x = sx + Y;
      return fn(x, (x + Y) / 2 - sy);
    });
  }

  /** Paints the plane x = X with a function of plane coordinates (y, z). */
  planeX(X: number, y0: number, y1: number, z0: number, z1: number, fn: (y: number, z: number) => Hex | null): void {
    this.quadX(X, y0, y1, z0, z1, (px, py) => {
      const sx = px + 0.5 - this.origin.x;
      const sy = py + 0.5 - this.origin.y;
      const y = X - sx;
      return fn(y, (X + y) / 2 - sy);
    });
  }

  /** Paints the plane z = Z with a function of plane coordinates (x, y). */
  planeZ(Z: number, x0: number, x1: number, y0: number, y1: number, fn: (x: number, y: number) => Hex | null): void {
    this.quadZ(Z, x0, x1, y0, y1, (px, py) => {
      const sx = px + 0.5 - this.origin.x;
      const sy = py + 0.5 - this.origin.y + Z;
      return fn(sy + sx / 2, sy - sx / 2);
    });
  }

  /** Single pixel at a world point. */
  dot(x: number, y: number, z: number, c: Hex): void {
    const [px, py] = this.proj(x, y, z);
    this.bmp.set(Math.floor(px), Math.floor(py), c);
  }
}

/** Renders world-space drawing into a tightly cropped bitmap; returns it with the origin's position inside it. */
export function renderCropped(
  draw: (p: IsoPainter) => void,
  outline?: Hex,
  size = 192,
): { bmp: Bitmap; origin: Vec2 } {
  const big = new Bitmap(size, size);
  const o = { x: size / 2, y: size * 0.7 };
  draw(new IsoPainter(big, o));
  if (outline) big.outline(outline);
  const b = big.bounds();
  if (!b) return { bmp: new Bitmap(1, 1), origin: { x: 0, y: 0 } };
  return { bmp: big.crop(b.x, b.y, b.w, b.h), origin: { x: o.x - b.x, y: o.y - b.y } };
}
