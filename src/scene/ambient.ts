import type { ScenePalette } from "../art/palette";
import { bayer } from "../engine/bitmap";
import { gridToScreen, worldToScreen, UNIT, type Vec2 } from "../engine/iso";
import type { Agent } from "../engine/agent";
import { toCanvas } from "../engine/canvas";
import { speechBubble } from "../engine/emotes";
import type { Speech } from "./office";
import type { WorldLayout } from "../world/layout";
import { fairySag } from "../world/roomRender";

function hash(n: number): number {
  const s = Math.sin(n * 91.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Cheap living details drawn over the scene: twinkling stars, fairy lights, dust in the moonlight. */
export class Ambient {
  private bulbs: Vec2[] = [];

  constructor(
    private layout: WorldLayout,
    private origin: Vec2,
    private pal: ScenePalette,
  ) {
    for (const span of layout.fairyLights) {
      for (let a = Math.ceil((span.from * UNIT - 5.5) / 12) * 12 + 5.5; a < span.to * UNIT; a += 12) {
        const z = fairySag(a) - 1.5;
        const s = span.wall === "NE" ? worldToScreen(a, 0, z) : worldToScreen(0, a, z);
        this.bulbs.push({ x: Math.floor(origin.x + s.x), y: Math.floor(origin.y + s.y) });
      }
    }
  }

  /** Twinkling stars in screen space (drawn before the camera transform). */
  drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const n = Math.max(10, Math.floor((w * h) / 9000));
    for (let i = 0; i < n; i++) {
      const x = Math.floor(hash(i) * w);
      const y = Math.floor(hash(i + 50) * h);
      const k = Math.sin(t * (0.6 + hash(i) * 0.8) + i * 2.3);
      if (k <= 0.55) continue;
      ctx.fillStyle = this.pal.cream;
      ctx.fillRect(x, y, 1, 1);
      if (k > 0.93) {
        ctx.fillStyle = this.pal.wall2;
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
        ctx.fillStyle = this.pal.cream;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** World-space details (drawn with the camera transform). */
  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const px = (x: number, y: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    };
    this.bulbs.forEach((b, i) => {
      if (Math.sin(t * 1.7 + i * 1.9) > 0.8) px(b.x, b.y, this.pal.white);
    });
    // Dust motes drifting down through each moonbeam.
    this.layout.windows.forEach((w, wi) => {
      const a0 = w.from * UNIT + 4;
      const a1 = w.to * UNIT - 4;
      for (let i = 0; i < 8; i++) {
        const seed = i + wi * 31;
        const depth = 3 + hash(seed + 7) * 36;
        const z = 40 - ((t * (1.5 + hash(seed) * 1.5) + hash(seed + 3) * 40) % 40);
        const along = a0 + hash(seed + 11) * (a1 - a0) + depth * 0.35 * (1 - z / 40) + Math.sin(t * 0.7 + i) * 1.5;
        const s = w.wall === "NE" ? worldToScreen(along, depth, z) : worldToScreen(depth, along, z);
        if (bayer(i, Math.floor(t * 4)) < 0.7) px(Math.floor(this.origin.x + s.x), Math.floor(this.origin.y + s.y), i % 3 ? this.pal.cream : this.pal.butter);
      }
    });
  }

  private bubbleCache = new Map<string, HTMLCanvasElement>();

  /** Speech bubbles with fake text above talking agents. */
  drawSpeech(ctx: CanvasRenderingContext2D, speeches: readonly Speech[], agents: ReadonlyMap<string, Agent>): void {
    for (const sp of speeches) {
      const a = agents.get(sp.agentId);
      if (!a) continue;
      const key = `${sp.seed}|${sp.question}`;
      let c = this.bubbleCache.get(key);
      if (!c) {
        c = toCanvas(speechBubble(sp.seed, sp.question));
        this.bubbleCache.set(key, c);
      }
      const s = gridToScreen(a.x, a.y, this.origin);
      const h = a.sprites.size.head;
      ctx.drawImage(c, Math.round(s.x + h.x + 3), Math.round(s.y + h.y - c.height - 1));
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
