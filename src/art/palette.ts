import type { Hex } from "../engine/color";

/**
 * Scene palette (24 colours). Every pixel of the room, furniture and shared emotes
 * comes from one of these keys — see docs/art-direction.md.
 */
export interface ScenePalette {
  night0: Hex; // background
  night1: Hex; // background haze, dim stars
  ink: Hex; // darkest outline / eyes
  wall0: Hex; // NW wall (in shade), baseboards
  wall1: Hex; // NE wall (lit)
  wall2: Hex; // wall trim, highlights
  wood0: Hex; // slab sides, darkest wood
  wood1: Hex; // plank seams, furniture shade
  wood2: Hex; // floor planks
  wood3: Hex; // lit wood, desk tops
  cream: Hex; // paper, highlights, wall top
  butter: Hex; // warm lamp light, sparkles
  coral0: Hex;
  coral1: Hex;
  blush: Hex;
  mint0: Hex; // screen dark, plant pot
  mint1: Hex; // screen glow, LEDs
  leaf0: Hex;
  leaf1: Hex;
  sky0: Hex; // night window, blue books, couch shade
  sky1: Hex; // couch, rug
  red: Hex; // alert "!", mailbox flag
  sky2: Hex; // couch highlight
  white: Hex; // speculars, glints
}

/** Warm plum walls & honey wood (palette A, chosen in the design review). */
export const SCENE_WARM: ScenePalette = {
  night0: "#110d1a",
  night1: "#1f1830",
  ink: "#2b1e2e",
  wall0: "#3e2c41",
  wall1: "#5b4160",
  wall2: "#7d5a7c",
  wood0: "#4a2f2c",
  wood1: "#6e4434",
  wood2: "#8c5a3c",
  wood3: "#b07a4f",
  cream: "#f3e3c3",
  butter: "#ffd37a",
  coral0: "#a24a35",
  coral1: "#d97757",
  blush: "#f28b8b",
  mint0: "#2f6f6e",
  mint1: "#6fd0b8",
  leaf0: "#3f6b45",
  leaf1: "#6fa05a",
  sky0: "#24305a",
  sky1: "#3e5a8c",
  red: "#e0525f",
  sky2: "#5f7fb5",
  white: "#fff8ea",
};
