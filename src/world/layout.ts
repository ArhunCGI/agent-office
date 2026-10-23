import type { Direction } from "../characters/types";
import { BOOKSHELF, COFFEE_BAR, COUCH, DESK, FLOOR_LAMP, MAILBOX, PLANT_BIG, PLANT_SMALL, SERVER_RACK, WHITEBOARD, type FurnitureDef } from "./furniture";

/** Station types an agent can go to. Tools are mapped to these in shared/tool-stations.json. */
export type StationType = "desk" | "library" | "terminal" | "whiteboard" | "window" | "cafe" | "mailbox";

export interface Placement {
  def: FurnitureDef;
  x: number;
  y: number;
}

export interface Slot {
  /** Tile the agent stands on. */
  x: number;
  y: number;
  /** Facing while working there. */
  dir: Direction;
}

export interface Station {
  id: string;
  type: StationType;
  slots: Slot[];
}

export interface RoomLayout {
  /** Floor size in tiles. */
  w: number;
  d: number;
  furniture: Placement[];
  stations: Station[];
  /** Window opening on the NE wall, in tiles along x. */
  window: { x0: number; x1: number };
  lamp: { x: number; y: number };
}

/**
 * The office. Back walls run along y = 0 (NE wall) and x = 0 (NW wall);
 * the front edges are open, diorama style.
 */
export const OFFICE: RoomLayout = {
  w: 10,
  d: 9,
  window: { x0: 5, x1: 7 },
  lamp: { x: 0, y: 4 },
  furniture: [
    { def: PLANT_BIG, x: 0, y: 0 },
    { def: DESK, x: 1, y: 0 },
    { def: DESK, x: 3, y: 0 },
    { def: PLANT_SMALL, x: 7, y: 0 },
    { def: BOOKSHELF, x: 8, y: 0 },
    { def: WHITEBOARD, x: 0, y: 2 },
    { def: FLOOR_LAMP, x: 0, y: 4 },
    { def: SERVER_RACK, x: 0, y: 5 },
    { def: MAILBOX, x: 0, y: 8 },
    { def: COUCH, x: 9, y: 5 },
    { def: COFFEE_BAR, x: 9, y: 3 },
    { def: PLANT_SMALL, x: 9, y: 8 },
  ],
  stations: [
    { id: "desk-1", type: "desk", slots: [{ x: 1, y: 1, dir: "NE" }, { x: 2, y: 1, dir: "NE" }] },
    { id: "desk-2", type: "desk", slots: [{ x: 3, y: 1, dir: "NE" }, { x: 4, y: 1, dir: "NE" }] },
    { id: "window", type: "window", slots: [{ x: 5, y: 1, dir: "NE" }, { x: 6, y: 1, dir: "NE" }] },
    { id: "library", type: "library", slots: [{ x: 8, y: 1, dir: "NE" }, { x: 9, y: 1, dir: "NE" }, { x: 7, y: 2, dir: "NE" }] },
    { id: "whiteboard", type: "whiteboard", slots: [{ x: 1, y: 2, dir: "NW" }, { x: 1, y: 3, dir: "NW" }, { x: 2, y: 3, dir: "NW" }] },
    { id: "terminal", type: "terminal", slots: [{ x: 1, y: 5, dir: "NW" }, { x: 1, y: 6, dir: "NW" }] },
    { id: "mailbox", type: "mailbox", slots: [{ x: 1, y: 8, dir: "NW" }] },
    {
      id: "cafe",
      type: "cafe",
      slots: [
        { x: 8, y: 5, dir: "SW" },
        { x: 8, y: 6, dir: "SW" },
        { x: 8, y: 3, dir: "SE" },
        { x: 7, y: 6, dir: "SE" },
      ],
    },
  ],
};

/** Blocked tiles (furniture footprints). */
export function obstacles(layout: RoomLayout): Set<string> {
  const s = new Set<string>();
  for (const { def, x, y } of layout.furniture) {
    for (let i = 0; i < def.footprint.w; i++) for (let j = 0; j < def.footprint.d; j++) s.add(`${x + i},${y + j}`);
  }
  return s;
}
