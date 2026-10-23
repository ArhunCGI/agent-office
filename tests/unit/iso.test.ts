import { describe, expect, it } from "vitest";
import { depthSort, gridToScreen, isBehind, screenToGrid, worldToScreen, type DepthBox } from "../../src/engine/iso";

describe("iso projection", () => {
  it("round-trips grid ↔ screen", () => {
    const origin = { x: 123, y: 45 };
    for (const [x, y] of [
      [0, 0],
      [3.5, 7.25],
      [23, 16],
      [-2, 5],
    ] as const) {
      const s = gridToScreen(x, y, origin);
      const g = screenToGrid(s.x, s.y, origin);
      expect(g.x).toBeCloseTo(x, 9);
      expect(g.y).toBeCloseTo(y, 9);
    }
  });

  it("uses a 2:1 tile of 32×16", () => {
    expect(gridToScreen(1, 0)).toEqual({ x: 16, y: 8 });
    expect(gridToScreen(0, 1)).toEqual({ x: -16, y: 8 });
    expect(worldToScreen(16, 0, 0)).toEqual(gridToScreen(1, 0));
    expect(worldToScreen(0, 0, 10)).toEqual({ x: 0, y: -10 });
  });
});

describe("depth sorting", () => {
  const box = (x0: number, y0: number, w = 1, d = 1): DepthBox => ({ x0, x1: x0 + w, y0, y1: y0 + d });

  it("orders boxes behind / in front on each axis", () => {
    expect(isBehind(box(0, 0), box(1, 0))).toBe(true);
    expect(isBehind(box(1, 0), box(0, 0))).toBe(false);
    expect(isBehind(box(0, 0), box(0, 1))).toBe(true);
  });

  it("puts an agent in front of a wide desk it stands before, and behind one it stands behind", () => {
    const desk = { id: "desk", box: box(1, 0, 2, 1) };
    const front = { id: "front", box: { x0: 1.2, x1: 1.8, y0: 1.2, y1: 1.8 } };
    const behind = { id: "behind", box: { x0: 0.2, x1: 0.8, y0: 0.2, y1: 0.8 } };
    const order = depthSort([front, desk, behind]).map((i) => i.id);
    expect(order).toEqual(["behind", "desk", "front"]);
  });

  it("is independent of input order (no flicker between frames)", () => {
    const items = [
      { id: "a", box: box(0, 0, 2, 1) },
      { id: "b", box: box(3, 0) },
      { id: "c", box: { x0: 2.2, x1: 2.8, y0: 0.2, y1: 0.8 } },
      { id: "d", box: box(0, 2, 1, 2) },
      { id: "e", box: { x0: 1.2, x1: 1.8, y0: 2.2, y1: 2.8 } },
    ];
    const ref = depthSort(items).map((i) => i.id);
    for (let k = 0; k < 20; k++) {
      const shuffled = [...items].sort(() => Math.sin(k * 99 + items.length) - 0.5);
      // Ties are broken by insertion order, so compare the relative order of overlapping pairs only.
      const order = depthSort(shuffled).map((i) => i.id);
      for (const [p, q] of [
        ["a", "c"],
        ["c", "b"],
        ["d", "e"],
      ]) {
        expect(order.indexOf(p!) < order.indexOf(q!)).toBe(ref.indexOf(p!) < ref.indexOf(q!));
      }
    }
  });

  it("handles a thin partition between two agents", () => {
    const wall = { id: "wall", box: { x0: 4, x1: 5, y0: 8.95, y1: 9.05 } };
    const north = { id: "n", box: { x0: 4.2, x1: 4.8, y0: 8.2, y1: 8.8 } };
    const south = { id: "s", box: { x0: 4.2, x1: 4.8, y0: 9.2, y1: 9.8 } };
    expect(depthSort([south, wall, north]).map((i) => i.id)).toEqual(["n", "wall", "s"]);
  });
});

describe("office partitions", () => {
  it("are drawn behind furniture standing against them (server rack, whiteboard, coffee bars)", async () => {
    const { fixtures } = await import("../../src/scene/compose");
    const { OFFICE } = await import("../../src/world/layout");
    const order = depthSort(fixtures(OFFICE)).map((f) => f);
    const idx = (pred: (f: (typeof order)[number]) => boolean) => order.findIndex(pred);
    for (const p of OFFICE.partitions) {
      const segs = order.filter((f) => f.def.id === `partition-${p.axis}`);
      for (const pl of OFFICE.furniture) {
        const touches = p.axis === "x" ? pl.x === p.at : pl.y === p.at;
        if (!touches) continue;
        const along0 = p.axis === "x" ? pl.y : pl.x;
        const along1 = along0 + (p.axis === "x" ? pl.def.footprint.d : pl.def.footprint.w);
        const fi = idx((f) => f.def === pl.def && f.x === pl.x && f.y === pl.y);
        for (const s of segs) {
          const at = p.axis === "x" ? s.y : s.x;
          if (at + 1 > along0 && at < along1) expect(order.indexOf(s), `${p.axis}=${p.at} seg ${at} vs ${pl.def.id}`).toBeLessThan(fi);
        }
      }
    }
  });
});
