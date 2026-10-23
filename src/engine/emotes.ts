import { SCENE_WARM as P } from "../art/palette";
import { Bitmap } from "./bitmap";
import { Mask, paintMatrix, paintShape } from "./shape";
import type { AccessoryId, SizeClass } from "../characters/types";

/** Character-agnostic emotes and accessories, shared by every CharacterDefinition. */

const EMOTE_COLORS = { k: P.ink, c: P.cream, r: P.red, b: P.butter, w: P.white, l: P.leaf1, L: P.leaf0, p: P.blush, m: P.mint1 };

const BUBBLE_ALERT = [
  ".kkkkk.",
  "kcccccK",
  "kccrcck",
  "kccrcck",
  "kccrcck",
  "kcccccK",
  "kccrcck",
  "kcccccK",
  ".kkckk.",
  "...kk..",
  "...k...",
];
const BUBBLE_ALERT_MINI = [".kkkk.", "kcrcck", "kcrcck", "kcccck", "kcrcck", ".kkck.", "..kk..", "..k..."];

/** "!" speech bubble, bottom tail at (x, y). */
export function drawAlertBubble(bmp: Bitmap, x: number, y: number, size: SizeClass): void {
  const rows = size === "full" ? BUBBLE_ALERT : BUBBLE_ALERT_MINI;
  paintMatrix(bmp, rows, { ...EMOTE_COLORS, K: P.ink }, x - 3, y - rows.length + 1);
}

const SPARKLE_BIG = ["..b..", "..c..", "bcwcb", "..c..", "..b.."];
const SPARKLE_SMALL = [".b.", "bwb", ".b."];

export function drawSparkle(bmp: Bitmap, cx: number, cy: number, big: boolean): void {
  const rows = big ? SPARKLE_BIG : SPARKLE_SMALL;
  const r = Math.floor(rows.length / 2);
  paintMatrix(bmp, rows, EMOTE_COLORS, cx - r, cy - r);
}

const ACCESSORIES: Record<Exclude<AccessoryId, "none">, { full: string[]; mini: string[] }> = {
  sprout: { full: ["ll.LL", ".lLL.", "..L.."], mini: ["l.L", ".L."] },
  cap: { full: ["..b..", "..r..", ".rcr.", "rcrcr"], mini: [".b.", ".r.", "rcr"] },
  bow: { full: ["rr.rr", "rrkrr", "rr.rr"], mini: ["r.r", "rkr"] },
  flower: { full: [".p.", "pbp", ".p.", ".L."], mini: ["pbp", ".L."] },
};

/** Draws an accessory whose bottom-centre sits at (x, y). */
export function drawAccessory(bmp: Bitmap, id: AccessoryId, x: number, y: number, size: SizeClass): void {
  if (id === "none") return;
  const rows = ACCESSORIES[id][size];
  const w = rows[0]?.length ?? 0;
  paintMatrix(bmp, rows, { ...EMOTE_COLORS, r: id === "bow" ? P.red : EMOTE_COLORS.r }, x - Math.floor(w / 2), y - rows.length + 1);
}

const POOF_RAMP = { outline: P.wall2, shade: P.cream, base: P.cream, light: P.white };

/** Generic smoke puff, t in [0, 1): grows, then breaks up. */
export function poofFrame(w: number, h: number, ax: number, ay: number, t: number, scale: number): Bitmap {
  const bmp = new Bitmap(w, h);
  const m = new Mask(w, h);
  // Puffs burst outward from the body centre and shrink away.
  const spread = (3 + 9 * t) * scale;
  const r = Math.max(0, (4.5 - 3.5 * t) * scale);
  const cy = ay - 8 * scale;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const k = i % 2 === 0 ? 1 : 0.75;
    m.ellipse(ax + Math.cos(a) * spread, cy + Math.sin(a) * spread * 0.7, r * k, r * k * 0.85);
  }
  if (t < 0.35) m.ellipse(ax, cy, (6 - t * 10) * scale, (5 - t * 8) * scale);
  paintShape(bmp, m, POOF_RAMP);
  // A couple of twinkles on the outer ring.
  if (t > 0.3 && t < 0.9) {
    drawSparkle(bmp, Math.round(ax + spread + 2), Math.round(cy - spread * 0.6), false);
    drawSparkle(bmp, Math.round(ax - spread - 1), Math.round(cy + spread * 0.3), false);
  }
  return bmp;
}

const QUESTION = [".kk.", "k..k", "...k", "..k.", "....", "..k."];

/**
 * Speech bubble with fake text ("lorem" dashes), deterministic per seed. `question` ends the
 * text with a "?" glyph. The tail is at the bottom-left corner: (2, h - 1).
 */
export function speechBubble(seed: number, question: boolean): Bitmap {
  const rnd = (k: number) => {
    const s = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const lines = 1 + (rnd(1) > 0.45 ? 1 : 0);
  const textW = 10 + Math.floor(rnd(2) * 9) + (question ? 5 : 0);
  const w = textW + 6;
  const boxH = lines === 1 ? 9 : 12;
  const h = boxH + 3;
  const bmp = new Bitmap(w, h);
  const m = new Mask(w, h).roundRect(0, 0, w, boxH, 2);
  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < w; x++) {
      if (!m.has(x, y)) continue;
      const edge = !m.has(x - 1, y) || !m.has(x + 1, y) || !m.has(x, y - 1) || !m.has(x, y + 1);
      bmp.set(x, y, edge ? P.ink : P.cream);
    }
  }
  // Tail.
  bmp.set(2, boxH - 1, P.cream);
  bmp.set(3, boxH - 1, P.cream);
  bmp.set(1, boxH, P.ink);
  bmp.set(2, boxH, P.cream);
  bmp.set(3, boxH, P.ink);
  bmp.set(1, boxH + 1, P.ink);
  bmp.set(2, boxH + 1, P.ink);
  bmp.set(1, boxH + 2, P.ink);
  // Fake words: short dashes separated by 1px gaps.
  const textLimit = question ? textW - 5 : textW;
  for (let l = 0; l < lines; l++) {
    const y = 3 + l * 3 + (lines === 1 ? 1 : 0);
    const lineW = l === lines - 1 && lines > 1 ? Math.floor(textLimit * (0.4 + rnd(10 + l) * 0.5)) : textLimit;
    let x = 3;
    let k = 0;
    while (x < 3 + lineW) {
      const word = 2 + Math.floor(rnd(20 + l * 9 + k++) * 4);
      for (let i = 0; i < word && x + i < 3 + lineW; i++) bmp.set(x + i, y, k % 5 === 3 ? P.coral1 : P.wall1);
      x += word + 1;
    }
  }
  if (question) paintMatrix(bmp, QUESTION, { k: P.sky1 }, w - 7, Math.floor((boxH - QUESTION.length) / 2) + 0);
  return bmp;
}
