import { SCENE_PALETTES, type ScenePaletteId } from "./art/palette";
import { createRegistry } from "./characters";
import { startLoop, fitInteger } from "./engine/loop";
import { connectWs, startMock, type EventSink } from "./net/source";
import { Ambient } from "./scene/ambient";
import { WorldView } from "./scene/compose";
import { Office } from "./scene/office";
import { OFFICE } from "./world/layout";
import { VIEW_H, VIEW_W } from "./world/roomRender";

/**
 * Screensaver entry point: full-window, no cursor, no interaction.
 * Query params: ?mock=1|random|stress[&n=30][&speed=2]  ?palette=warm|cool  ?ws=ws://host/events
 */
const params = new URLSearchParams(location.search);
const pal = SCENE_PALETTES[(params.get("palette") as ScenePaletteId) ?? "warm"] ?? SCENE_PALETTES.warm;

const canvas = document.createElement("canvas");
canvas.width = VIEW_W;
canvas.height = VIEW_H;
document.body.append(canvas);
const ctx = canvas.getContext("2d", { alpha: false })!;
ctx.imageSmoothingEnabled = false;

function fit(): void {
  const { cssW, cssH } = fitInteger(VIEW_W, VIEW_H, innerWidth, innerHeight, devicePixelRatio);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.left = `${Math.round((innerWidth - cssW) / 2)}px`;
  canvas.style.top = `${Math.round((innerHeight - cssH) / 2)}px`;
}
addEventListener("resize", fit);
fit();

const registry = createRegistry();
const office = new Office(OFFICE, registry);
const view = new WorldView(OFFICE, pal);
const ambient = new Ambient(OFFICE, view.origin, pal);

const sink: EventSink = {
  event: (e) => office.apply(e),
  snapshot: (s) => office.applySnapshot(s),
};
const mock = params.get("mock");
if (mock) startMock(mock === "1" ? "scripted" : mock, sink, params);
else connectWs(params.get("ws") ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/events`, sink);

const loop = startLoop((dt, t) => {
  office.update(dt);
  view.draw(ctx, t, office.actors(), (c) => {
    ambient.draw(c, t);
    ambient.drawLinks(c, office.links(), t);
    ambient.drawSleepy(c, office.agents.values(), t);
  });
});

// Hook for QA tooling (Playwright): live stats and the simulation.
(window as unknown as { __agentOffice: unknown }).__agentOffice = { office, stats: loop.stats, apply: sink.event };
