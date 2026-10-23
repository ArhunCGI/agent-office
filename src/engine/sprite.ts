import { Bitmap, dithered } from "./bitmap";
import { shiftHue, type Hex } from "./color";
import { drawAccessory, poofFrame } from "./emotes";
import {
  DIRECTIONS,
  type AnimName,
  type AnimSpec,
  type CharacterDefinition,
  type CharacterVariant,
  type Direction,
  type SizeSpec,
  type View,
} from "../characters/types";

export interface Animation {
  spec: AnimSpec;
  frames: Record<Direction, Bitmap[]>;
}

/** Pre-rendered frames of one character instance (definition + variant). */
export interface SpriteSet {
  def: CharacterDefinition;
  variant: CharacterVariant;
  size: SizeSpec;
  anims: Record<AnimName, Animation>;
}

const GENERIC_SPAWN: AnimSpec = { frames: 7, fps: 12, loop: false };

export function tintPalette(def: CharacterDefinition, hue: number): Record<string, Hex> {
  const out: Record<string, Hex> = {};
  for (const [k, v] of Object.entries(def.palette)) out[k] = def.fixedColors.includes(k) ? v : shiftHue(v, hue);
  return out;
}

export function viewOf(dir: Direction): View {
  return dir === "SE" || dir === "SW" ? "front" : "back";
}

export function isMirrored(dir: Direction): boolean {
  return dir === "SW" || dir === "NW";
}

export function buildSpriteSet(def: CharacterDefinition, variant: CharacterVariant): SpriteSet {
  const size = def.sizes[variant.size];
  const pal = tintPalette(def, variant.hue);
  const drawOne = (anim: AnimName, frame: number, view: View): Bitmap => {
    const bmp = new Bitmap(size.frame.w, size.frame.h);
    def.draw(bmp, {
      anim,
      frame,
      view,
      size: variant.size,
      pal,
      accessory: (b, x, y) => drawAccessory(b, variant.accessory, x, y, variant.size),
    });
    return bmp;
  };
  const build = (anim: AnimName, spec: AnimSpec, frameFn: (i: number, view: View) => Bitmap): Animation => {
    const front = Array.from({ length: spec.frames }, (_, i) => frameFn(i, "front"));
    const back = Array.from({ length: spec.frames }, (_, i) => frameFn(i, "back"));
    const byView = { front, back };
    const frames = {} as Record<Direction, Bitmap[]>;
    for (const d of DIRECTIONS) {
      const src = byView[viewOf(d)];
      frames[d] = isMirrored(d) ? src.map((b) => b.flipped()) : src;
    }
    return { spec, frames };
  };

  const anims = {} as Record<AnimName, Animation>;
  for (const [name, spec] of Object.entries(def.animations) as [AnimName, AnimSpec][]) {
    anims[name] = build(name, spec, (i, v) => drawOne(name, i, v));
  }
  // Generic poof for characters that don't draw their own spawn/despawn.
  const scale = variant.size === "full" ? 1 : 0.6;
  const poof = (i: number, view: View, reverse: boolean): Bitmap => {
    const n = GENERIC_SPAWN.frames;
    const t = reverse ? 1 - (i + 1) / n : i / (n - 1);
    const out = new Bitmap(size.frame.w, size.frame.h);
    out.blit(dithered(drawOne("idle", 0, view), Math.min(1, Math.max(0, (t - 0.25) / 0.6))), 0, 0);
    const cloudT = reverse ? 1 - t : t;
    out.blit(poofFrame(size.frame.w, size.frame.h, size.anchor.x, size.anchor.y, cloudT, scale), 0, 0);
    return out;
  };
  anims.spawn ??= build("spawn", GENERIC_SPAWN, (i, v) => poof(i, v, false));
  anims.despawn ??= build("despawn", GENERIC_SPAWN, (i, v) => poof(i, v, true));
  return { def, variant, size, anims };
}

/** Frame index for an animation after `elapsed` seconds. */
export function frameAt(spec: AnimSpec, elapsed: number): number {
  const i = Math.floor(elapsed * spec.fps);
  return spec.loop ? i % spec.frames : Math.min(i, spec.frames - 1);
}

export function animDuration(spec: AnimSpec): number {
  return spec.frames / spec.fps;
}
