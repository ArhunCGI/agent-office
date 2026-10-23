import type { ScenePalette } from "../art/palette";
import { Bitmap, bayer } from "../engine/bitmap";
import type { Hex } from "../engine/color";
import { UNIT, type Vec2 } from "../engine/iso";
import { IsoPainter, renderCropped } from "../engine/isoPaint";
import type { FurnitureDef } from "./furniture";
import type { RoomLayout } from "./layout";

/** Internal render resolution (scaled up by an integer factor on screen). */
export const VIEW_W = 480;
export const VIEW_H = 270;
export const WALL_H = 58;
const SLAB = 6;

/** Screen position of grid point (0, 0) so the room sits centred in the view. */
export function roomOrigin(layout: RoomLayout): Vec2 {
  const top = -WALL_H - 4;
  const bottom = ((layout.w + layout.d) * UNIT) / 2 + SLAB;
  return {
    x: Math.round(VIEW_W / 2 - ((layout.w - layout.d) * UNIT) / 2),
    y: Math.round(VIEW_H / 2 - (top + bottom) / 2 + 4),
  };
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function background(bmp: Bitmap, pal: ScenePalette): void {
  for (let y = 0; y < bmp.h; y++) {
    for (let x = 0; x < bmp.w; x++) {
      const dx = (x - bmp.w / 2) / (bmp.w * 0.55);
      const dy = (y - bmp.h / 2) / (bmp.h * 0.6);
      const glow = 1 - Math.sqrt(dx * dx + dy * dy);
      bmp.set(x, y, bayer(x, y) < glow * 0.55 ? pal.night1 : pal.night0);
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i) * bmp.w);
    const y = Math.floor(hash(i + 99) * bmp.h);
    bmp.set(x, y, i % 9 === 0 ? pal.cream : pal.wall0);
  }
}

/** Lighter / darker steps used for dithered lighting on wood. */
function lighten(pal: ScenePalette, c: Hex): Hex {
  return c === pal.wood1 ? pal.wood2 : c === pal.wood2 ? pal.wood3 : c === pal.sky1 ? pal.sky2 : c === pal.wall1 ? pal.wall2 : c;
}
function darken(pal: ScenePalette, c: Hex): Hex {
  return c === pal.wood3 ? pal.wood2 : c === pal.wood2 ? pal.wood1 : c === pal.wood1 ? pal.wood0 : c === pal.sky1 ? pal.sky0 : c === pal.cream ? pal.wall2 : c;
}

function floorColor(layout: RoomLayout, pal: ScenePalette, x: number, y: number, px: number, py: number): Hex {
  // Planks run along x, 4 units wide, with staggered end joints.
  const row = Math.floor(y / 4);
  const offset = Math.floor(hash(row + 7) * 48);
  let c: Hex = pal.wood2;
  if (y - row * 4 < 0.9 || (x + offset) % 48 < 1) c = pal.wood1;
  else if (hash(row * 31 + Math.floor((x + offset) / 48)) > 0.82) c = pal.wood3;

  // Rug in the middle of the room.
  const rx0 = 3 * UNIT + 4;
  const rx1 = 7 * UNIT - 4;
  const ry0 = 3 * UNIT + 4;
  const ry1 = 7 * UNIT - 4;
  if (x > rx0 && x < rx1 && y > ry0 && y < ry1) {
    const e = Math.min(x - rx0, rx1 - x, y - ry0, ry1 - y);
    if (e < 2) c = pal.sky0;
    else if (e < 4.5) c = (Math.floor((x + y) / 3) % 2 === 0) ? pal.cream : pal.sky1;
    else {
      const cx = (rx0 + rx1) / 2;
      const cy = (ry0 + ry1) / 2;
      const diamond = Math.abs(x - cx) + Math.abs(y - cy);
      c = diamond < 10 ? (diamond < 5 ? pal.butter : pal.coral1) : Math.floor(diamond / 4) % 3 === 0 ? pal.sky0 : pal.sky1;
    }
  }

  // Contact shadows: light comes from the top-left, shadows fall to +x / +y.
  for (const { def, x: fx, y: fy } of layout.furniture) {
    const x0 = fx * UNIT + 1;
    const y0 = fy * UNIT + 1;
    const x1 = (fx + def.footprint.w) * UNIT + 3;
    const y1 = (fy + def.footprint.d) * UNIT + 3;
    if (x > x0 && x < x1 && y > y0 && y < y1) {
      const edge = Math.min(x1 - x, y1 - y);
      if (edge > 2 || bayer(px, py) < 0.5) c = darken(pal, c);
    }
  }
  // Under the back walls.
  if ((y < 5 && bayer(px, py) < (5 - y) / 5) || (x < 5 && bayer(px, py) < (5 - x) / 5)) c = darken(pal, c);

  // Warm lamp pool.
  const lx = layout.lamp.x * UNIT + 10;
  const ly = layout.lamp.y * UNIT + 8;
  const d = Math.hypot(x - lx, y - ly) / 46;
  if (d < 1 && bayer(px, py) < (1 - d) * 0.9) c = lighten(pal, c);

  // Moonlight patch below the window.
  const wx0 = layout.window.x0 * UNIT + 2;
  const wx1 = layout.window.x1 * UNIT - 2;
  if (y > 2 && y < 44) {
    const shift = y * 0.35;
    if (x > wx0 + shift && x < wx1 + shift && bayer(px, py) < 0.5 - y / 100) c = lighten(pal, c);
  }
  return c;
}

/** Background, floor slab, floor, back walls and wall decorations: everything that never moves. */
export function renderStaticLayer(layout: RoomLayout, pal: ScenePalette): Bitmap {
  const bmp = new Bitmap(VIEW_W, VIEW_H);
  background(bmp, pal);
  const p = new IsoPainter(bmp, roomOrigin(layout));
  const W = layout.w * UNIT;
  const D = layout.d * UNIT;

  // Slab sides, then the floor.
  p.box(0, 0, -SLAB, W, D, SLAB, { top: pal.wood2, left: pal.wood0, right: pal.ink });
  p.planeY(D, 0, W, -SLAB, 0, (x, z) => (z > -1.5 ? pal.wood1 : Math.floor(x) % 16 === 0 ? pal.ink : pal.wood0));
  p.planeX(W, 0, D, -SLAB, 0, (y, z) => (z > -1.5 ? pal.wood0 : pal.ink));
  p.quadZ(0, 0, W, 0, D, (px, py) => {
    const sx = px + 0.5 - p.origin.x;
    const sy = py + 0.5 - p.origin.y;
    return floorColor(layout, pal, sy + sx / 2, sy - sx / 2, px, py);
  });

  // NE wall (y = 0, lit) and NW wall (x = 0, in shade).
  const wallTop = { top: pal.wall2, left: pal.wall2, right: pal.wall1, edge: pal.cream };
  p.box(-4, -4, 0, W + 4, 4, WALL_H, { ...wallTop, left: pal.wall1 });
  p.box(-4, 0, 0, 4, D, WALL_H, { ...wallTop, right: pal.wall0, left: pal.wall1 });

  const wx0 = layout.window.x0 * UNIT;
  const wx1 = layout.window.x1 * UNIT;
  p.planeY(0.01, 0, W, 0, WALL_H, (x, z) => {
    if (z < 3) return pal.wall0; // baseboard
    if (z > WALL_H - 2) return pal.wall2; // crown trim
    // Window with frame, night sky, stars and a crescent moon.
    if (x > wx0 + 2 && x < wx1 - 2 && z > 18 && z < 48) {
      const fx = x - wx0 - 2;
      const fz = z - 18;
      const fw = wx1 - wx0 - 4;
      if (fx < 2 || fx > fw - 2 || fz < 2 || fz > 28) return pal.cream;
      if (Math.abs(fx - fw / 2) < 1 || Math.abs(fz - 15) < 0.8) return pal.wall2; // mullions
      const mx = fx - 8;
      const mz = fz - 22;
      if (mx * mx + mz * mz < 14 && (mx - 1.5) ** 2 + (mz + 1) ** 2 > 9) return pal.butter;
      if (hash(Math.floor(fx) * 17 + Math.floor(fz) * 3) > 0.94) return pal.cream;
      return fz < 9 ? pal.sky1 : pal.sky0;
    }
    if (x > wx0 && x < wx1 && z > 16 && z < 19) return pal.cream; // sill
    // Wallpaper: tiny dots in a half-drop grid.
    const col = Math.floor(x / 8);
    if (Math.floor(x) % 8 === 4 && (Math.floor(z) + (col % 2) * 4) % 8 === 4) return pal.wall2;
    // Fairy lights wire along the top.
    const sag = 50 - Math.abs(Math.sin((x / 40) * Math.PI)) * 5;
    if (Math.abs(z - sag) < 0.6) return pal.ink;
    const bulb = Math.floor(x) % 12;
    if ((bulb === 5 || bulb === 6) && z < sag && z > sag - 3) return [pal.butter, pal.blush, pal.mint1][Math.floor(x / 12) % 3] ?? pal.butter;
    if ((bulb === 4 || bulb === 7) && z < sag - 0.5 && z > sag - 2.5 && bayer(Math.floor(x), Math.floor(z)) < 0.5) return pal.wall2;
    return pal.wall1;
  });
  p.planeX(0.01, 0, D, 0, WALL_H, (y, z) => {
    if (z < 3) return pal.ink;
    if (z > WALL_H - 2) return pal.wall1;
    // Framed starburst poster.
    if (y > 8 && y < 28 && z > 26 && z < 48) {
      const ly = y - 8;
      const lz = z - 26;
      if (ly < 1.5 || ly > 18.5 || lz < 1.5 || lz > 20.5) return pal.wood1;
      const cy = 10;
      const cz = 11;
      const a = Math.atan2(lz - cz, ly - cy);
      const r = Math.hypot(ly - cy, lz - cz);
      const ray = Math.abs(Math.cos(a * 4)) ** 6;
      if (r < 1.5 || (r < 7 && ray > 0.45)) return pal.coral1;
      return pal.cream;
    }
    const col = Math.floor(y / 8);
    if (Math.floor(y) % 8 === 4 && (Math.floor(z) + (col % 2) * 4) % 8 === 4) return pal.wall1;
    return pal.wall0;
  });
  return bmp;
}

export interface FurnitureSprite {
  bmp: Bitmap;
  /** Position of the footprint's north corner inside bmp. */
  origin: Vec2;
}

const furnitureCache = new Map<string, FurnitureSprite>();

export function furnitureSprite(def: FurnitureDef, pal: ScenePalette, frame: number): FurnitureSprite {
  const key = `${def.id}|${pal.night0}|${frame % def.frames}`;
  let s = furnitureCache.get(key);
  if (!s) {
    s = renderCropped((p) => def.draw(p, pal, frame % def.frames), def.outline ? pal.ink : undefined);
    furnitureCache.set(key, s);
  }
  return s;
}
