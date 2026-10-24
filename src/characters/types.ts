import type { Bitmap } from "../engine/bitmap";
import type { Hex } from "../engine/color";

export type AnimName = "idle" | "walk" | "work_type" | "work_read" | "work_terminal" | "waiting" | "waiting_input" | "sleep" | "done" | "spawn" | "despawn";
export const ANIM_NAMES: readonly AnimName[] = ["idle", "walk", "work_type", "work_read", "work_terminal", "waiting", "waiting_input", "sleep", "done", "spawn", "despawn"];

/** Iso facing. SE/SW show the face, NE/NW the back; SW and NW are mirrors produced by the engine. */
export type Direction = "SE" | "SW" | "NE" | "NW";
export const DIRECTIONS: readonly Direction[] = ["SE", "SW", "NE", "NW"];
export type View = "front" | "back";

export type SizeClass = "full" | "mini";

export interface AnimSpec {
  frames: number;
  fps: number;
  loop: boolean;
}

export interface SizeSpec {
  /** Frame canvas size in pixels (includes headroom for emotes and jumps). */
  frame: { w: number; h: number };
  /** Feet point inside the frame; placed on the agent's floor position. */
  anchor: { x: number; y: number };
  /** Floor shadow ellipse radii, drawn by the engine. */
  shadow: { rx: number; ry: number };
  /** Where an accessory or emote attaches, relative to the anchor, when standing still. */
  head: { x: number; y: number };
}

export type AccessoryId = "none" | "sprout" | "cap" | "bow" | "flower";

export interface DrawContext {
  anim: AnimName;
  frame: number;
  view: View;
  size: SizeClass;
  /** Character palette, already hue-shifted for this instance. */
  pal: Record<string, Hex>;
  /** Draws the instance accessory centred at (x, y) = top of the head. */
  accessory(bmp: Bitmap, x: number, y: number): void;
}

/** Everything the engine needs to render one agent type. Adding a character = one file exporting one of these. */
export interface CharacterDefinition {
  id: string;
  name: string;
  description: string;
  /** Character colours (separate from the scene palette). */
  palette: Record<string, Hex>;
  /** Palette keys excluded from per-instance hue shift (eyes, outlines of fixed materials...). */
  fixedColors: readonly string[];
  sizes: Record<SizeClass, SizeSpec>;
  /** spawn/despawn are optional: the engine provides a generic "poof" when absent. */
  animations: Record<Exclude<AnimName, "spawn" | "despawn">, AnimSpec> & Partial<Record<"spawn" | "despawn", AnimSpec>>;
  /** Paints one frame, facing right (front = SE, back = NE). */
  draw(bmp: Bitmap, ctx: DrawContext): void;
  /** Relative weights for idle wandering destinations (station types). */
  idlePreferences?: Partial<Record<string, number>>;
}

/** Per-instance variation, to tell several agents of the same type apart. */
export interface CharacterVariant {
  size: SizeClass;
  hue: number;
  accessory: AccessoryId;
}
