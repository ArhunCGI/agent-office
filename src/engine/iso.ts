/**
 * 2:1 dimetric projection.
 * Grid axes: +x goes down-right (SE) on screen, +y goes down-left (SW).
 * World units: 1 tile = UNIT units on x/y; z is height in screen pixels.
 */
export const TILE_W = 32;
export const TILE_H = 16;
export const UNIT = 16;

export interface Vec2 {
  x: number;
  y: number;
}

export function gridToScreen(gx: number, gy: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  return { x: origin.x + ((gx - gy) * TILE_W) / 2, y: origin.y + ((gx + gy) * TILE_H) / 2 };
}

export function screenToGrid(sx: number, sy: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const a = (sx - origin.x) / (TILE_W / 2);
  const b = (sy - origin.y) / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** World units (x, y, z) → screen offset relative to the world origin. */
export function worldToScreen(x: number, y: number, z = 0): Vec2 {
  return { x: x - y, y: (x + y) / 2 - z };
}

/** Axis-aligned grid footprint used for depth ordering, in tile coordinates. */
export interface DepthBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** True when `a` must be drawn before `b` (a is strictly behind b on one axis and not in front on the other). */
export function isBehind(a: DepthBox, b: DepthBox): boolean {
  const xBehind = a.x1 <= b.x0;
  const yBehind = a.y1 <= b.y0;
  const xFront = b.x1 <= a.x0;
  const yFront = b.y1 <= a.y0;
  return (xBehind && !yFront) || (yBehind && !xFront);
}

function centerSum(b: DepthBox): number {
  return (b.x0 + b.x1 + b.y0 + b.y1) / 2;
}

/**
 * Painter's order for non-overlapping footprints: topological sort on `isBehind`,
 * ties (and the rare cycle) broken by footprint centre depth then insertion order.
 */
export function depthSort<T extends { box: DepthBox }>(items: readonly T[]): T[] {
  const n = items.length;
  const indeg = new Array<number>(n).fill(0);
  const after: number[][] = items.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && isBehind(items[i]!.box, items[j]!.box)) {
        after[i]!.push(j);
        indeg[j]!++;
      }
    }
  }
  const key = (i: number) => centerSum(items[i]!.box) * 1e4 + i;
  const done = new Array<boolean>(n).fill(false);
  const out: T[] = [];
  for (let k = 0; k < n; k++) {
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || indeg[i] !== 0) continue;
      if (pick < 0 || key(i) < key(pick)) pick = i;
    }
    if (pick < 0) {
      // Cycle: fall back to the shallowest remaining item.
      for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || key(i) < key(pick))) pick = i;
    }
    done[pick] = true;
    out.push(items[pick]!);
    for (const j of after[pick]!) indeg[j]!--;
  }
  return out;
}
