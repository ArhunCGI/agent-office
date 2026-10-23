export interface Tile {
  x: number;
  y: number;
}

export interface Grid {
  w: number;
  d: number;
  blocked(x: number, y: number): boolean;
  /** Optional thin walls between adjacent tiles (room partitions). */
  wall?(ax: number, ay: number, bx: number, by: number): boolean;
}

/** True when an agent can step from one tile to an adjacent one. */
export function canStep(grid: Grid, ax: number, ay: number, bx: number, by: number): boolean {
  return walkable(grid, bx, by) && !grid.wall?.(ax, ay, bx, by);
}

/** Path length (in steps) from `from` to every reachable tile; -1 when unreachable. */
export function distanceMap(grid: Grid, from: Tile): Int32Array {
  const dist = new Int32Array(grid.w * grid.d).fill(-1);
  if (from.x < 0 || from.y < 0 || from.x >= grid.w || from.y >= grid.d) return dist;
  dist[from.y * grid.w + from.x] = 0;
  const queue: Tile[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]!;
    const d = dist[t.y * grid.w + t.x]!;
    for (const n of DIRS) {
      const nx = t.x + n.x;
      const ny = t.y + n.y;
      if (!canStep(grid, t.x, t.y, nx, ny) || dist[ny * grid.w + nx] !== -1) continue;
      dist[ny * grid.w + nx] = d + 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
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
      // The start tile itself may be blocked (agent standing in a footprint): only targets are checked.
      if (!canStep(grid, cx, cy, nx, ny)) continue;
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
