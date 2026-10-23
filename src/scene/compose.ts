import type { ScenePalette } from "../art/palette";
import type { AnimName, Direction } from "../characters/types";
import { bayer, Bitmap } from "../engine/bitmap";
import { toCanvas } from "../engine/canvas";
import { depthSort, gridToScreen, type DepthBox } from "../engine/iso";
import { frameAt, type SpriteSet } from "../engine/sprite";
import type { RoomLayout } from "../world/layout";
import { furnitureSprite, renderStaticLayer, roomOrigin } from "../world/roomRender";

/** Anything with a footprint that must be depth-sorted with the furniture. */
export interface Actor {
  /** Continuous grid position of the feet. */
  x: number;
  y: number;
  sprites: SpriteSet;
  anim: AnimName;
  dir: Direction;
  /** Seconds since the current animation started. */
  elapsed: number;
  /** Extra pixels above the floor (none for now, reserved for hops). */
  z?: number;
}

type Drawable = { box: DepthBox; draw: (ctx: CanvasRenderingContext2D) => void };

const shadowCache = new Map<string, HTMLCanvasElement>();
function shadow(rx: number, ry: number, color: string): HTMLCanvasElement {
  const key = `${rx}|${ry}|${color}`;
  let c = shadowCache.get(key);
  if (!c) {
    const b = new Bitmap(rx * 2 + 1, ry * 2 + 1);
    for (let y = 0; y <= ry * 2; y++) {
      for (let x = 0; x <= rx * 2; x++) {
        const dx = (x - rx) / (rx + 0.5);
        const dy = (y - ry) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1 && bayer(x, y) < 0.6) b.set(x, y, color);
      }
    }
    c = toCanvas(b);
    shadowCache.set(key, c);
  }
  return c;
}

/** Renders the room: cached static layer, then furniture and actors in painter's order. */
export class WorldView {
  readonly origin;
  private staticLayer: HTMLCanvasElement;

  constructor(
    readonly layout: RoomLayout,
    readonly pal: ScenePalette,
  ) {
    this.origin = roomOrigin(layout);
    this.staticLayer = toCanvas(renderStaticLayer(layout, pal));
  }

  draw(ctx: CanvasRenderingContext2D, time: number, actors: readonly Actor[], overlay?: (ctx: CanvasRenderingContext2D) => void): void {
    ctx.drawImage(this.staticLayer, 0, 0);
    const items: Drawable[] = [];
    for (const pl of this.layout.furniture) {
      const frame = Math.floor(time * pl.def.fps + pl.x * 3 + pl.y);
      const spr = furnitureSprite(pl.def, this.pal, frame);
      const at = gridToScreen(pl.x, pl.y, this.origin);
      const canvas = toCanvas(spr.bmp);
      items.push({
        box: { x0: pl.x, x1: pl.x + pl.def.footprint.w, y0: pl.y, y1: pl.y + pl.def.footprint.d },
        draw: (c) => c.drawImage(canvas, Math.round(at.x - spr.origin.x), Math.round(at.y - spr.origin.y)),
      });
    }
    // Shadows go under everything that stands on the floor.
    for (const a of actors) {
      const s = gridToScreen(a.x, a.y, this.origin);
      const { rx, ry } = a.sprites.size.shadow;
      ctx.drawImage(shadow(rx, ry, this.pal.ink), Math.round(s.x - rx), Math.round(s.y - ry));
    }
    for (const a of actors) {
      const anim = a.sprites.anims[a.anim];
      const frame = anim.frames[a.dir][frameAt(anim.spec, a.elapsed)]!;
      const canvas = toCanvas(frame);
      const s = gridToScreen(a.x, a.y, this.origin);
      const { anchor } = a.sprites.size;
      const r = 0.3;
      items.push({
        box: { x0: a.x - r, x1: a.x + r, y0: a.y - r, y1: a.y + r },
        draw: (c) => c.drawImage(canvas, Math.round(s.x - anchor.x), Math.round(s.y - anchor.y - (a.z ?? 0))),
      });
    }
    for (const it of depthSort(items)) it.draw(ctx);
    overlay?.(ctx);
  }
}
