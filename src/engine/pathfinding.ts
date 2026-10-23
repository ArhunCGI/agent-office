export interface Tile {
  x: number;
  y: number;
}

export interface Grid {
  w: number;
  d: number;
  blocked(x: number, y: number): boolean;
}

export function walkable(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.w && y < grid.d && !grid.blocked(x, y);
}

const DIRS: readonly Tile[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * A* on a 4-connected grid (moves along the iso axes = the four sprite directions).
 * Returns the tiles to walk through, excluding `from` and including `to`; [] if already there; null if unreachable.
 * A tiny turn penalty prefers straight corridors over zig-zags.
 */
export function findPath(grid: Grid, from: Tile, to: Tile): Tile[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  if (!walkable(grid, to.x, to.y)) return null;
  const key = (x: number, y: number) => y * grid.w + x;
  const n = grid.w * grid.d;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = key(from.x, from.y);
  g[start] = 0;
  const open: number[] = [start];
  const h = (k: number) => Math.abs((k % grid.w) - to.x) + Math.abs(Math.floor(k / grid.w) - to.y);
  const goal = key(to.x, to.y);

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i]!;
      const b = open[best]!;
      if (g[a]! + h(a) < g[b]! + h(b)) best = i;
    }
    const cur = open.splice(best, 1)[0]!;
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % grid.w;
    const cy = Math.floor(cur / grid.w);
    const prev = came[cur]!;
    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      // Allow stepping off a blocked start tile (e.g. an agent spawned inside a footprint).
      if (!walkable(grid, nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed[nk]) continue;
      const turn = prev >= 0 && (prev % grid.w) - cx !== -d.x ? 0.001 : prev >= 0 && Math.floor(prev / grid.w) - cy !== -d.y ? 0.001 : 0;
      const cost = g[cur]! + 1 + turn;
      if (cost < g[nk]!) {
        g[nk] = cost;
        came[nk] = cur;
        open.push(nk);
      }
    }
  }
  if (came[goal] === -1) return null;
  const path: Tile[] = [];
  for (let k = goal; k !== start; k = came[k]!) path.push({ x: k % grid.w, y: Math.floor(k / grid.w) });
  return path.reverse();
}
