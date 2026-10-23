export type Hex = string;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: Hex): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): Hex {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Packs a hex color into the little-endian ABGR layout used by ImageData's Uint32 view. */
const packCache = new Map<Hex, number>();
export function pack(hex: Hex): number {
  let v = packCache.get(hex);
  if (v === undefined) {
    const { r, g, b } = hexToRgb(hex);
    v = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    packCache.set(hex, v);
  }
  return v;
}

export function unpack(v: number): Hex {
  return rgbToHex({ r: v & 255, g: (v >> 8) & 255, b: (v >> 16) & 255 });
}

function rgbToHsl({ r, g, b }: Rgb): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/** Rotates the hue of a color, keeping saturation and lightness (used for per-instance variants). */
export function shiftHue(hex: Hex, degrees: number): Hex {
  if (degrees === 0) return hex;
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb(h + degrees, s, l));
}
