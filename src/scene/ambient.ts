import type { ScenePalette } from "../art/palette";
import { bayer } from "../engine/bitmap";
import { gridToScreen, worldToScreen, UNIT, type Vec2 } from "../engine/iso";
import type { Agent } from "../engine/agent";
import type { RoomLayout } from "../world/layout";
import { VIEW_H, VIEW_W } from "../world/roomRender";

function hash(n: number): number {
  const s = Math.sin(n * 91.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Cheap living details drawn over the scene: twinkling stars, fairy lights, dust in the moonlight. */
export class Ambient {
  private stars: Vec2[] = [];
  private bulbs: Vec2[] = [];

  constructor(
    private layout: RoomLayout,
    private origin: Vec2,
    private pal: ScenePalette,
  ) {
    for (let i = 0; this.stars.length < 14 && i < 500; i++) {
      const p = { x: Math.floor(hash(i) * VIEW_W), y: Math.floor(hash(i + 50) * VIEW_H) };
      if (p.y < 34 || p.x < 70 || p.x > VIEW_W - 70) this.stars.push(p);
    }
    const W = layout.w * UNIT;
    for (let x = 5.5; x < W; x += 12) {
      const sag = 50 - Math.abs(Math.sin((x / 40) * Math.PI)) * 5;
      const s = worldToScreen(x, 0, sag - 1.5);
      this.bulbs.push({ x: Math.floor(origin.x + s.x), y: Math.floor(origin.y + s.y) });
    }
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const px = (x: number, y: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    };
    this.stars.forEach((s, i) => {
      const k = Math.sin(t * (0.6 + hash(i) * 0.8) + i * 2.3);
      if (k > 0.55) px(s.x, s.y, this.pal.cream);
      if (k > 0.93) {
        px(s.x - 1, s.y, this.pal.wall2);
        px(s.x + 1, s.y, this.pal.wall2);
        px(s.x, s.y - 1, this.pal.wall2);
        px(s.x, s.y + 1, this.pal.wall2);
      }
    });
    this.bulbs.forEach((b, i) => {
      if (Math.sin(t * 1.7 + i * 1.9) > 0.8) px(b.x, b.y, this.pal.white);
    });
    // Dust motes drifting down through the moonbeam.
    const wx0 = this.layout.window.x0 * UNIT + 4;
    const wx1 = this.layout.window.x1 * UNIT - 4;
    for (let i = 0; i < 12; i++) {
      const y = 3 + hash(i + 7) * 36;
      const z = 40 - ((t * (1.5 + hash(i) * 1.5) + hash(i + 3) * 40) % 40);
      const x = wx0 + hash(i + 11) * (wx1 - wx0) + y * 0.35 * (1 - z / 40) + Math.sin(t * 0.7 + i) * 1.5;
      const s = worldToScreen(x, y, z);
      const sx = Math.floor(this.origin.x + s.x);
      const sy = Math.floor(this.origin.y + s.y);
      if (bayer(i, Math.floor(t * 4)) < 0.7) px(sx, sy, i % 3 ? this.pal.cream : this.pal.butter);
    }
  }

  /** Floating "z" above agents idle for a while — at a glance, sleepy = free, animated = busy. */
  drawSleepy(ctx: CanvasRenderingContext2D, agents: Iterable<Agent>, t: number): void {
    const Z = ["ccc", "..c", ".c.", "ccc"];
    for (const a of agents) {
      if (a.state !== "idle" || a.isMoving() || a.restTime < 12) continue;
      const s = gridToScreen(a.x, a.y, this.origin);
      const h = a.sprites.size.head;
      for (let k = 0; k < 2; k++) {
        const phase = (t * 0.5 + k * 0.5 + (a.id.length % 7) * 0.13) % 1;
        const x = Math.round(s.x + h.x + 5 + phase * 4 + k);
        const y = Math.round(s.y + h.y - 3 - phase * 10);
        if (phase > 0.85) continue;
        ctx.fillStyle = phase > 0.6 ? this.pal.wall2 : this.pal.cream;
        Z.forEach((row, j) => {
          for (let i = 0; i < row.length; i++) if (row[i] === "c") ctx.fillRect(x + i, y + j, 1, 1);
        });
      }
    }
  }

  /** Dotted thread between a parent agent and each of its sub-agents. */
  drawLinks(ctx: CanvasRenderingContext2D, pairs: readonly [Agent, Agent][], t: number): void {
    ctx.fillStyle = this.pal.butter;
    for (const [p, c] of pairs) {
      const a = gridToScreen(p.x, p.y, this.origin);
      const b = gridToScreen(c.x, c.y, this.origin);
      const ha = p.sprites.size.head;
      const hb = c.sprites.size.head;
      const x0 = a.x + ha.x;
      const y0 = a.y + ha.y;
      const x1 = b.x + hb.x;
      const y1 = b.y + hb.y;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.floor(len / 4);
      const phase = (t * 6) % 4;
      for (let i = 1; i < n; i++) {
        const k = (i * 4 + phase) / len;
        if (k >= 1) break;
        // Slight sag like a thread.
        const sag = Math.sin(k * Math.PI) * Math.min(10, len * 0.12);
        ctx.fillRect(Math.round(x0 + (x1 - x0) * k), Math.round(y0 + (y1 - y0) * k + sag), 1, 1);
      }
    }
  }
}
