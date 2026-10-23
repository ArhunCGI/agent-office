import { SCENE_COOL, SCENE_WARM, type ScenePalette } from "./art/palette";
import { createRegistry } from "./characters";
import { variantFor } from "./characters/registry";
import { ANIM_NAMES, DIRECTIONS, type CharacterDefinition, type CharacterVariant, type SizeClass } from "./characters/types";
import { pixelCanvas, toCanvas } from "./engine/canvas";
import { frameAt, type SpriteSet } from "./engine/sprite";
import { WorldView, type Actor } from "./scene/compose";
import { ALL_FURNITURE } from "./world/furniture";
import { OFFICE } from "./world/layout";
import { furnitureSprite, VIEW_H, VIEW_W } from "./world/roomRender";

const app = document.getElementById("app")!;
const registry = createRegistry();
const tickers: ((t: number) => void)[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function section(title: string, note?: string): HTMLElement {
  app.append(el("h2", undefined, title));
  if (note) app.append(el("p", "note", note));
  const div = el("div");
  app.append(div);
  return div;
}

function palette(title: string, pal: ScenePalette): HTMLElement {
  const wrap = el("div");
  wrap.append(el("h3", undefined, title));
  const row = el("div", "row");
  for (const [k, v] of Object.entries(pal)) {
    const c = el("div", "cell");
    const s = el("div", "swatch");
    s.style.background = v;
    c.append(s, el("span", undefined, k));
    row.append(c);
  }
  wrap.append(row);
  return wrap;
}

function spriteCell(set: SpriteSet, anim: (typeof ANIM_NAMES)[number], dir: (typeof DIRECTIONS)[number], scale: number): HTMLElement {
  const { w, h } = set.size.frame;
  const { canvas, ctx } = pixelCanvas(w, h, scale);
  const a = set.anims[anim];
  let start = 0;
  tickers.push((t) => {
    // Non-looping animations replay every 2 seconds.
    const dur = a.spec.frames / a.spec.fps;
    if (!a.spec.loop && t - start > dur + 0.8) start = t;
    const f = a.frames[dir][frameAt(a.spec, a.spec.loop ? t : t - start)]!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(toCanvas(f), 0, 0);
  });
  return canvas;
}

function characterTable(def: CharacterDefinition, size: SizeClass, scale: number): HTMLElement {
  const variant: CharacterVariant = { size, hue: 0, accessory: "none" };
  const set = registry.sprites(def, variant);
  const grid = el("div", "grid");
  grid.style.gridTemplateColumns = `110px repeat(${ANIM_NAMES.length}, auto)`;
  grid.append(el("span", "h", size === "full" ? "taille normale" : "sous-agent (mini)"));
  for (const a of ANIM_NAMES) grid.append(el("span", "h", a));
  for (const d of DIRECTIONS) {
    grid.append(el("span", "h", d));
    for (const a of ANIM_NAMES) grid.append(spriteCell(set, a, d, scale));
  }
  return grid;
}

function variantsRow(def: CharacterDefinition): HTMLElement {
  const row = el("div", "row");
  for (let i = 0; i < 8; i++) {
    const v = variantFor(i, i > 0);
    const c = el("div", "cell");
    c.append(spriteCell(registry.sprites(def, v), "idle", "SE", 4), el("span", undefined, `${v.size} ${v.hue}° ${v.accessory}`));
    row.append(c);
  }
  return row;
}

function scenePreview(pal: ScenePalette, label: string, def: CharacterDefinition): HTMLElement {
  const wrap = el("div", "cell scene");
  const { canvas, ctx } = pixelCanvas(VIEW_W, VIEW_H, 2);
  const view = new WorldView(OFFICE, pal);
  const full = registry.sprites(def, variantFor(0, false));
  const minis = [1, 2, 3].map((i) => registry.sprites(def, variantFor(i, true)));
  const robot = registry.sprites(registry.forKind("robot"), variantFor(0, false));
  const actors: Actor[] = [
    { x: 1.5, y: 1.5, sprites: full, anim: "work_type", dir: "NE", elapsed: 0 },
    { x: 8.5, y: 1.5, sprites: minis[0]!, anim: "work_read", dir: "NE", elapsed: 0 },
    { x: 1.5, y: 5.5, sprites: minis[1]!, anim: "work_terminal", dir: "NW", elapsed: 0 },
    { x: 1.5, y: 3.5, sprites: minis[2]!, anim: "waiting", dir: "SE", elapsed: 0 },
    { x: 8.5, y: 6.5, sprites: robot, anim: "idle", dir: "SW", elapsed: 0 },
    { x: 5.5, y: 5.5, sprites: full, anim: "walk", dir: "SW", elapsed: 0 },
    { x: 4.5, y: 7.5, sprites: full, anim: "done", dir: "SE", elapsed: 0 },
  ];
  tickers.push((t) => {
    for (const a of actors) a.elapsed = a.anim === "done" ? t % 1.6 : t;
    view.draw(ctx, t, actors);
  });
  wrap.append(canvas, el("span", undefined, label));
  return wrap;
}

// ── Page ────────────────────────────────────────────────────────────────────

const claudeA = registry.get("claude")!;
const claudeB = registry.get("claude-b")!;

const scenes = section("Scène composée", "Aperçu statique (positions figées, animations jouées) — palette A chaude vs B froide, avec Claude A puis B.");
const sRow = el("div", "row");
sRow.append(
  scenePreview(SCENE_WARM, "Palette A « chaude » + Claude A", claudeA),
  scenePreview(SCENE_COOL, "Palette B « froide » + Claude B", claudeB),
);
scenes.append(sRow);

const pals = section("Palette de scène (24 couleurs)");
pals.append(palette("A — chaude (défaut)", SCENE_WARM), palette("B — froide", SCENE_COOL));

for (const def of registry.all()) {
  const s = section(def.name, def.description);
  s.append(el("h3", undefined, "Animations × directions"), characterTable(def, "full", 4));
  s.append(el("h3", undefined, "Sous-agent (~60 %)"), characterTable(def, "mini", 4));
  s.append(el("h3", undefined, "Variantes par instance (teinte, accessoire)"), variantsRow(def));
}

const furn = section("Meubles", "Chaque meuble est dessiné en primitives iso (boîtes, plans) ; les frames animées sont jouées.");
const fRow = el("div", "row");
for (const def of ALL_FURNITURE) {
  const first = furnitureSprite(def, SCENE_WARM, 0);
  let w = 0;
  let h = 0;
  for (let f = 0; f < def.frames; f++) {
    const s = furnitureSprite(def, SCENE_WARM, f);
    w = Math.max(w, s.bmp.w);
    h = Math.max(h, s.bmp.h);
  }
  const { canvas, ctx } = pixelCanvas(w, h, 3);
  tickers.push((t) => {
    const s = furnitureSprite(def, SCENE_WARM, Math.floor(t * def.fps));
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(toCanvas(s.bmp), first.origin.x - s.origin.x, first.origin.y - s.origin.y);
  });
  const c = el("div", "cell");
  c.append(canvas, el("span", undefined, `${def.name} (${def.footprint.w}×${def.footprint.d})`));
  fRow.append(c);
}
furn.append(fRow);

// 30 fps loop, paused when hidden.
let last = 0;
function loop(now: number): void {
  requestAnimationFrame(loop);
  if (now - last < 1000 / 30) return;
  last = now;
  const t = now / 1000;
  for (const tick of tickers) tick(t);
}
requestAnimationFrame(loop);
(window as unknown as { __galleryReady: boolean }).__galleryReady = true;
