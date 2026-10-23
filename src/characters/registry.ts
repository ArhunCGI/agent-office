import { buildSpriteSet, type SpriteSet } from "../engine/sprite";
import type { AccessoryId, CharacterDefinition, CharacterVariant } from "./types";

/**
 * Maps agent kinds to character definitions. The engine only talks to this registry,
 * never to a concrete character.
 */
export class CharacterRegistry {
  private defs = new Map<string, CharacterDefinition>();
  private kinds = new Map<string, string>();
  private cache = new Map<string, SpriteSet>();

  constructor(private fallbackId: string) {}

  register(def: CharacterDefinition): this {
    this.defs.set(def.id, def);
    return this;
  }

  /** Loads an `AgentKind → character id` mapping (see kinds.json). */
  mapKinds(config: { default?: string; kinds: Record<string, string> }): this {
    if (config.default) this.fallbackId = config.default;
    for (const [kind, id] of Object.entries(config.kinds)) this.kinds.set(kind, id);
    return this;
  }

  all(): CharacterDefinition[] {
    return [...this.defs.values()];
  }

  get(id: string): CharacterDefinition | undefined {
    return this.defs.get(id);
  }

  /** Character for an agent kind, falling back to the default character for unknown kinds. */
  forKind(kind: string): CharacterDefinition {
    const def = this.defs.get(this.kinds.get(kind) ?? kind) ?? this.defs.get(this.fallbackId);
    if (!def) throw new Error(`No character registered for kind "${kind}" and no fallback "${this.fallbackId}"`);
    return def;
  }

  /** Cached pre-rendered frames for a character instance. */
  sprites(def: CharacterDefinition, variant: CharacterVariant): SpriteSet {
    const key = `${def.id}|${variant.size}|${variant.hue}|${variant.accessory}`;
    let set = this.cache.get(key);
    if (!set) {
      set = buildSpriteSet(def, variant);
      this.cache.set(key, set);
    }
    return set;
  }
}

const HUES = [0, 28, -32, 52, -60, 85, 140, -110];
const ACCESSORIES: AccessoryId[] = ["none", "sprout", "bow", "cap", "flower"];

/** Deterministic per-instance variant: the n-th sub-agent of a parent gets its own hue and accessory. */
export function variantFor(index: number, mini: boolean): CharacterVariant {
  if (!mini && index === 0) return { size: "full", hue: 0, accessory: "none" };
  return {
    size: mini ? "mini" : "full",
    hue: HUES[index % HUES.length] ?? 0,
    accessory: ACCESSORIES[Math.floor(index / HUES.length + index) % ACCESSORIES.length] ?? "none",
  };
}
