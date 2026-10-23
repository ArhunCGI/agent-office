import { describe, expect, it } from "vitest";
import { SCENE_WARM } from "../../src/art/palette";
import { createRegistry } from "../../src/characters";
import { ANIM_NAMES, DIRECTIONS } from "../../src/characters/types";
import { unpack } from "../../src/engine/color";
import { viewportFor } from "../../src/scene/camera";
import { ALL_FURNITURE } from "../../src/world/furniture";
import { furnitureSprite } from "../../src/world/roomRender";

describe("characters", () => {
  const reg = createRegistry();
  it.each(reg.all().map((d) => [d.id, d] as const))("%s renders every animation × direction × size", (_id, def) => {
    for (const size of ["full", "mini"] as const) {
      const set = reg.sprites(def, { size, hue: 0, accessory: "none" });
      for (const a of ANIM_NAMES) {
        for (const d of DIRECTIONS) {
          const frames = set.anims[a].frames[d];
          expect(frames.length).toBe(set.anims[a].spec.frames);
          for (const f of frames) expect(f.bounds(), `${a} ${d} ${size}`).not.toBeNull();
        }
      }
    }
  });

  it("mirrors SW from SE", () => {
    const set = reg.sprites(reg.forKind("claude"), { size: "full", hue: 0, accessory: "none" });
    const se = set.anims.idle.frames.SE[0]!;
    const sw = set.anims.idle.frames.SW[0]!;
    for (let y = 0; y < se.h; y++) for (let x = 0; x < se.w; x++) expect(sw.get(se.w - 1 - x, y)).toBe(se.get(x, y));
  });

  it("maps kinds through kinds.json with a fallback", () => {
    expect(reg.forKind("robot").id).toBe("robot");
    expect(reg.forKind("codex").id).toBe("claude");
  });
});

describe("furniture uses only the scene palette", () => {
  const allowed = new Set(Object.values(SCENE_WARM));
  it.each(ALL_FURNITURE.map((d) => [d.id, d] as const))("%s", (_id, def) => {
    for (let f = 0; f < def.frames; f++) {
      const { bmp } = furnitureSprite(def, SCENE_WARM, f);
      for (const v of bmp.data) if (v >>> 24) expect(allowed.has(unpack(v))).toBe(true);
    }
  });
});

describe("viewport", () => {
  it.each([
    [1280, 720, 1],
    [1920, 1080, 1],
    [2560, 1440, 1],
    [1512, 982, 2],
  ])("%i×%i @%i uses an integer scale ≥ 2 and covers the window", (w, h, dpr) => {
    const vp = viewportFor(672, 400, w, h, dpr, 480, 270);
    expect(Number.isInteger(vp.scale)).toBe(true);
    expect(vp.scale).toBeGreaterThanOrEqual(2);
    expect(vp.w * vp.scale).toBeGreaterThanOrEqual(w * dpr);
    expect(vp.h * vp.scale).toBeGreaterThanOrEqual(h * dpr);
  });
});
