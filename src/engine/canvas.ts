import type { Bitmap } from "./bitmap";

const cache = new WeakMap<Bitmap, HTMLCanvasElement>();

/** Converts a Bitmap to a canvas once (cached), ready for fast drawImage blits. */
export function toCanvas(bmp: Bitmap): HTMLCanvasElement {
  let c = cache.get(bmp);
  if (!c) {
    c = document.createElement("canvas");
    c.width = bmp.w;
    c.height = bmp.h;
    const ctx = c.getContext("2d")!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(bmp.data.buffer.slice(0) as ArrayBuffer), bmp.w, bmp.h), 0, 0);
    cache.set(bmp, c);
  }
  return c;
}

/** Creates a canvas at the internal resolution, displayed at an integer scale with no smoothing. */
export function pixelCanvas(w: number, h: number, scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}
