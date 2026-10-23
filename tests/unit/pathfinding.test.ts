import { describe, expect, it } from "vitest";
import { distanceMap, findPath, type Grid } from "../../src/engine/pathfinding";
import { OFFICE, isFloor, obstacles, wallBetween } from "../../src/world/layout";

const open = (w: number, d: number, blocked: string[] = []): Grid => ({ w, d, blocked: (x, y) => blocked.includes(`${x},${y}`) });

describe("A*", () => {
  it("finds a shortest 4-connected path", () => {
    const p = findPath(open(5, 5), { x: 0, y: 0 }, { x: 3, y: 2 })!;
    expect(p).toHaveLength(5);
    expect(p.at(-1)).toEqual({ x: 3, y: 2 });
    for (let i = 1; i < p.length; i++) expect(Math.abs(p[i]!.x - p[i - 1]!.x) + Math.abs(p[i]!.y - p[i - 1]!.y)).toBe(1);
  });

  it("returns [] when already there and null when unreachable", () => {
    expect(findPath(open(3, 3), { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
    expect(findPath(open(3, 3, ["2,2"]), { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
    expect(findPath(open(3, 3, ["1,0", "1,1", "1,2"]), { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it("walks around obstacles", () => {
    const p = findPath(open(5, 3, ["2,0", "2,1"]), { x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(p.some((t) => t.x === 2 && t.y === 2)).toBe(true);
    expect(p.some((t) => t.x === 2 && t.y < 2)).toBe(false);
  });

  it("prefers straight runs (no zig-zag)", () => {
    const p = findPath(open(6, 6), { x: 0, y: 0 }, { x: 5, y: 5 })!;
    let turns = 0;
    for (let i = 2; i < p.length; i++) {
      const a = { x: p[i - 1]!.x - p[i - 2]!.x, y: p[i - 1]!.y - p[i - 2]!.y };
      const b = { x: p[i]!.x - p[i - 1]!.x, y: p[i]!.y - p[i - 1]!.y };
      if (a.x !== b.x || a.y !== b.y) turns++;
    }
    expect(turns).toBeLessThanOrEqual(2);
  });

  it("never crosses an office partition outside a door", () => {
    const blocked = obstacles(OFFICE);
    const grid: Grid = {
      w: OFFICE.w,
      d: OFFICE.d,
      blocked: (x, y) => !isFloor(OFFICE, x, y) || blocked.has(`${x},${y}`),
      wall: (ax, ay, bx, by) => wallBetween(OFFICE, ax, ay, bx, by),
    };
    // Open space → cafeteria, and open space → lab.
    for (const [from, to] of [
      [OFFICE.spawn, OFFICE.lounge],
      [{ x: 2, y: 1 }, { x: 20, y: 1 }],
      [{ x: 16, y: 6 }, { x: 8, y: 14 }],
    ] as const) {
      const p = findPath(grid, from, to);
      expect(p).not.toBeNull();
      let prev = from;
      for (const t of p!) {
        expect(wallBetween(OFFICE, prev.x, prev.y, t.x, t.y)).toBe(false);
        expect(isFloor(OFFICE, t.x, t.y)).toBe(true);
        prev = t;
      }
    }
    // Every station slot is reachable from the spawn point.
    const dist = distanceMap(grid, OFFICE.spawn);
    for (const st of OFFICE.stations) for (const s of st.slots) expect(dist[s.y * grid.w + s.x], `${st.id} ${s.x},${s.y}`).toBeGreaterThanOrEqual(0);
  });
});
