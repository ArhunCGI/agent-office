import { CLAUDE, CLAUDE_B } from "./claude";
import kinds from "./kinds.json";
import { CharacterRegistry } from "./registry";
import { ROBOT } from "./robot";

/** Single place where characters are registered. Add a character: one file + one line here. */
export function createRegistry(): CharacterRegistry {
  return new CharacterRegistry("claude").register(CLAUDE).register(CLAUDE_B).register(ROBOT).mapKinds(kinds);
}
