import type { AgentEvent, Snapshot } from "../../shared/events";
import { animationForStation, DEFAULT_TOOL_CONFIG, stationForTool, type ToolStationConfig } from "../../shared/toolMapping";
import type { CharacterRegistry } from "../characters/registry";
import { variantFor } from "../characters/registry";
import { ANIM_NAMES, type AnimName, type Direction } from "../characters/types";
import { Agent, directionOf, towardViewer } from "../engine/agent";
import { findPath, walkable, type Grid, type Tile } from "../engine/pathfinding";
import { obstacles, type RoomLayout, type Slot } from "../world/layout";
import type { Actor } from "./compose";

interface Meta {
  isChild: boolean;
  children: number;
  /** Events received while spawning, replayed afterwards. */
  pending: AgentEvent[];
  /** True after agent_done until the next tool/waiting event (makes double "done" harmless). */
  finished: boolean;
  returnThenDespawn: boolean;
}

export interface OfficeOptions {
  rng?: () => number;
  toolConfig?: ToolStationConfig;
}

const tkey = (t: Tile) => `${t.x},${t.y}`;
const FRONT: Direction[] = ["SE", "SW"];

/**
 * The simulation: turns AgentEvents into agent behaviour (stations, wandering, sub-agent life cycle).
 * Pure logic — no rendering — so it can be unit-tested with a fake clock.
 */
export class Office {
  readonly agents = new Map<string, Agent>();
  private meta = new Map<string, Meta>();
  /** Tile → agent that claimed it as a destination (station slot or idle spot). */
  private reserved = new Map<string, string>();
  private mainCount = new Map<string, number>();
  readonly grid: Grid;
  private rng: () => number;
  private tools: ToolStationConfig;

  constructor(
    readonly layout: RoomLayout,
    readonly registry: CharacterRegistry,
    opts: OfficeOptions = {},
  ) {
    const blocked = obstacles(layout);
    this.grid = { w: layout.w, d: layout.d, blocked: (x, y) => blocked.has(`${x},${y}`) };
    this.rng = opts.rng ?? Math.random;
    this.tools = opts.toolConfig ?? DEFAULT_TOOL_CONFIG;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  apply(e: AgentEvent): void {
    if (e.type === "agent_spawn") return this.spawn(e.agentId, e.kind, e.parentId, e.label);
    let a = this.agents.get(e.agentId);
    if (!a) {
      // Unknown agent: tools/waiting implicitly create it; done/despawn are ignored.
      if (e.type === "agent_done" || e.type === "agent_despawn") return;
      this.spawn(e.agentId, "claude");
      a = this.agents.get(e.agentId)!;
    }
    const m = this.meta.get(a.id)!;
    if (a.state === "despawning" || a.state === "gone") return;
    if (a.state === "spawning") {
      m.pending.push(e);
      return;
    }
    a.restTime = 0;
    switch (e.type) {
      case "agent_tool": {
        m.finished = false;
        m.returnThenDespawn = false;
        const station = stationForTool(e.tool, this.tools);
        const anim = animationForStation(station, this.tools);
        this.goToStation(a, station, (ANIM_NAMES as readonly string[]).includes(anim) ? (anim as AnimName) : "work_type");
        break;
      }
      case "agent_waiting":
        m.finished = false;
        this.release(a);
        a.state = "waiting";
        a.stopAtNextTile(() => {
          a.dir = towardViewer(a.dir);
          a.setAnim("waiting");
        });
        break;
      case "agent_done":
        if (m.finished) return;
        m.finished = true;
        this.release(a);
        a.state = "done";
        a.timer = Infinity;
        a.stopAtNextTile(() => {
          a.dir = towardViewer(a.dir);
          a.timer = a.play("done") + 0.6;
        });
        break;
      case "agent_despawn":
        this.despawn(a);
        break;
    }
  }

  /** Reconciles with the server's view after a (re)connection. */
  applySnapshot(s: Snapshot): void {
    const alive = new Set(s.agents.map((x) => x.spawn.agentId));
    for (const a of this.agents.values()) if (!alive.has(a.id)) this.apply({ type: "agent_despawn", agentId: a.id });
    for (const { spawn, last } of s.agents) {
      this.apply(spawn);
      if (last) this.apply(last);
    }
  }

  private spawn(id: string, kind: string, parentId?: string, label?: string): void {
    const existing = this.agents.get(id);
    if (existing && existing.state !== "gone") {
      if (label) existing.label = label;
      return;
    }
    const def = this.registry.forKind(kind);
    const parent = parentId ? this.agents.get(parentId) : undefined;
    let variantIndex: number;
    let tile: Tile;
    const isChild = !!parentId;
    if (isChild) {
      const pm = parent ? this.meta.get(parent.id) : undefined;
      variantIndex = pm ? ++pm.children : 1;
      tile = this.freeTileNear(parent ? parent.tile() : { x: 5, y: 4 }) ?? { x: 5, y: 4 };
    } else {
      variantIndex = this.mainCount.get(def.id) ?? 0;
      this.mainCount.set(def.id, variantIndex + 1);
      tile = this.freeTileNear({ x: 5, y: 4 }) ?? { x: 5, y: 4 };
    }
    const sprites = this.registry.sprites(def, variantFor(variantIndex, isChild));
    const a = new Agent(id, kind, sprites, tile, parentId, label);
    a.dir = parent ? towardViewer(parent.dir) : "SE";
    this.agents.set(id, a);
    this.meta.set(id, { isChild, children: 0, pending: [], finished: false, returnThenDespawn: false });
    this.reserved.set(tkey(tile), id);
  }

  private despawn(a: Agent): void {
    const m = this.meta.get(a.id)!;
    const parent = a.parentId ? this.agents.get(a.parentId) : undefined;
    if (m.isChild && parent && parent.state !== "despawning" && Math.hypot(parent.x - a.x, parent.y - a.y) > 1.6) {
      m.returnThenDespawn = true;
      if (a.state !== "returning") this.startReturn(a, parent);
      return;
    }
    this.release(a);
    a.state = "despawning";
    a.timer = Infinity;
    a.stopAtNextTile(() => {
      a.dir = towardViewer(a.dir);
      a.timer = a.play("despawn");
    });
    // Children never outlive their parent.
    for (const c of this.agents.values()) if (c.parentId === a.id && c.state !== "despawning") this.despawn(c);
  }

  // ── Behaviour ─────────────────────────────────────────────────────────────

  update(dt: number): void {
    for (const a of this.agents.values()) {
      a.update(dt);
      const m = this.meta.get(a.id)!;
      switch (a.state) {
        case "spawning":
          if (a.timer === 0) {
            this.enterIdle(a, 0.4 + this.rng());
            const queued = m.pending.splice(0);
            for (const e of queued) this.apply(e);
          }
          break;
        case "done":
          if (a.timer === 0) {
            const parent = a.parentId ? this.agents.get(a.parentId) : undefined;
            if (m.isChild && parent && parent.state !== "despawning") this.startReturn(a, parent);
            else this.enterIdle(a, 1 + this.rng() * 2);
          }
          break;
        case "despawning":
          if (a.timer === 0) {
            a.state = "gone";
            this.release(a);
          }
          break;
        case "idle":
          if (!a.isMoving() && a.timer === 0) this.wander(a);
          break;
      }
    }
    for (const [id, a] of this.agents) {
      if (a.state === "gone") {
        this.agents.delete(id);
        this.meta.delete(id);
      }
    }
  }

  private enterIdle(a: Agent, pause: number): void {
    a.state = "idle";
    a.setAnim("idle");
    a.timer = pause;
  }

  private wander(a: Agent): void {
    const m = this.meta.get(a.id)!;
    const parent = a.parentId ? this.agents.get(a.parentId) : undefined;
    this.release(a);
    let target: Tile | null = null;
    let facing: Direction | null = null;
    let pause = 2 + this.rng() * 4;
    if (m.isChild && parent) {
      target = this.randomFreeTile(parent.tile(), 2);
    } else {
      // Idle agents gravitate to the lounge so they read differently from busy ones at their stations.
      const prefs: Record<string, number> = { wander: 3, cafe: 4, ...(a.sprites.def.idlePreferences ?? {}) };
      const pick = this.weighted(prefs);
      if (pick !== "wander") {
        const slot = this.pickSlot(pick, a);
        if (slot) {
          target = slot;
          facing = slot.dir;
          pause = 6 + this.rng() * 6;
        }
      }
      target ??= this.randomFreeTile(this.layout.lounge, 2) ?? this.randomFreeTile(a.tile(), 3);
    }
    if (!target) {
      a.timer = pause;
      return;
    }
    this.reserved.set(tkey(target), a.id);
    const path = this.pathFor(a, target);
    a.walk(path, () => {
      this.enterIdle(a, pause);
      a.dir = facing ?? FRONT[Math.floor(this.rng() * 2)]!;
    });
  }

  private startReturn(a: Agent, parent: Agent): void {
    this.release(a);
    const target = this.freeTileNear(parent.tile()) ?? parent.tile();
    this.reserved.set(tkey(target), a.id);
    a.state = "returning";
    a.walk(this.pathFor(a, target), () => {
      const m = this.meta.get(a.id);
      a.dir = towardViewer(directionOf(parent.x - a.x, parent.y - a.y));
      if (m?.returnThenDespawn) {
        m.returnThenDespawn = false;
        this.despawn(a);
      } else this.enterIdle(a, 3 + this.rng() * 3);
    });
  }

  private goToStation(a: Agent, station: string, anim: AnimName): void {
    this.release(a);
    // When every slot is taken, queue up on the closest free tile next to the station.
    const anchor = this.layout.stations.find((s) => s.type === station)?.slots[0];
    const slot = this.pickSlot(station, a);
    const target = slot ?? (anchor && this.freeTileNear(anchor)) ?? this.freeTileNear(a.tile()) ?? a.tile();
    const facing = slot?.dir ?? anchor?.dir;
    this.reserved.set(tkey(target), a.id);
    a.state = "walking";
    a.walk(this.pathFor(a, target), () => {
      a.state = "working";
      if (facing) a.dir = facing;
      a.setAnim(anim);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private pathFor(a: Agent, target: Tile): Tile[] {
    const from = a.tile();
    const path = findPath(this.grid, from, target);
    const centred = Math.abs(a.x - (from.x + 0.5)) < 0.01 && Math.abs(a.y - (from.y + 0.5)) < 0.01;
    if (!path) return centred ? [] : [from];
    // Re-centre on the current tile first so agents never cut corners through furniture.
    return centred ? path : [from, ...path];
  }

  private release(a: Agent): void {
    for (const [k, id] of this.reserved) if (id === a.id) this.reserved.delete(k);
  }

  private isFree(t: Tile, self?: string): boolean {
    if (!walkable(this.grid, t.x, t.y)) return false;
    const r = this.reserved.get(tkey(t));
    return r === undefined || r === self;
  }

  /** Nearest free slot of the given station type. */
  pickSlot(type: string, a: Agent): Slot | null {
    let best: Slot | null = null;
    let bestD = Infinity;
    const at = a.tile();
    for (const st of this.layout.stations) {
      if (st.type !== type) continue;
      for (const s of st.slots) {
        if (!this.isFree(s, a.id)) continue;
        const d = Math.abs(s.x - at.x) + Math.abs(s.y - at.y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    }
    return best;
  }

  /** Breadth-first search for the closest walkable tile that is neither reserved nor stood on. */
  freeTileNear(from: Tile): Tile | null {
    const seen = new Set<string>([tkey(from)]);
    const queue: Tile[] = [from];
    while (queue.length) {
      const t = queue.shift()!;
      if (this.isFree(t) && !this.occupiedByAgent(t)) return t;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as const) {
        const n = { x: t.x + dx, y: t.y + dy };
        if (n.x < 0 || n.y < 0 || n.x >= this.grid.w || n.y >= this.grid.d || seen.has(tkey(n))) continue;
        seen.add(tkey(n));
        queue.push(n);
      }
    }
    return null;
  }

  private occupiedByAgent(t: Tile): boolean {
    for (const a of this.agents.values()) {
      const at = a.tile();
      if (at.x === t.x && at.y === t.y) return true;
    }
    return false;
  }

  private randomFreeTile(around: Tile, radius: number): Tile | null {
    const options: Tile[] = [];
    for (let y = around.y - radius; y <= around.y + radius; y++) {
      for (let x = around.x - radius; x <= around.x + radius; x++) {
        const t = { x, y };
        if ((x !== around.x || y !== around.y) && this.isFree(t) && findPath(this.grid, around, t)) options.push(t);
      }
    }
    return options.length ? options[Math.floor(this.rng() * options.length)]! : null;
  }

  private weighted(w: Record<string, number>): string {
    const total = Object.values(w).reduce((s, v) => s + v, 0);
    let r = this.rng() * total;
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) return k;
    }
    return Object.keys(w)[0]!;
  }

  // ── Rendering views ───────────────────────────────────────────────────────

  actors(): Actor[] {
    const out: Actor[] = [];
    for (const a of this.agents.values()) {
      out.push({ x: a.x, y: a.y, sprites: a.sprites, anim: a.anim, dir: a.dir, elapsed: a.animTime });
    }
    return out;
  }

  /** Parent/child pairs currently on screen (for the link overlay). */
  links(): [Agent, Agent][] {
    const out: [Agent, Agent][] = [];
    for (const c of this.agents.values()) {
      const p = c.parentId ? this.agents.get(c.parentId) : undefined;
      if (p && c.state !== "spawning" && c.state !== "despawning") out.push([p, c]);
    }
    return out;
  }
}

