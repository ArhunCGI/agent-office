export interface LoopStats {
  /** Frames rendered during the last full second. */
  fps: number;
  frames: number;
  /** Average ms spent inside the frame callback over the last second. */
  frameMs: number;
}

/**
 * Set by the macOS screensaver host before this module runs: WKWebView there is never the
 * key/active window, so requestAnimationFrame is throttled to a near-stop by WebKit's own
 * (JS-invisible) page-visibility machinery, regardless of what `document.hidden` reports —
 * and so is `setInterval`, just less severely (choppy rather than fully stopped). In that
 * case the host drives frames itself by calling `window.__agentOfficeManualTick(now)`
 * through `evaluateJavaScript`, which runs regardless of the page's own throttled timers
 * since it isn't scheduled through them.
 */
declare global {
  interface Window {
    __forceManualFrames?: boolean;
    __agentOfficeManualTick?: (now: number) => void;
  }
}

/**
 * requestAnimationFrame loop capped at `fps`, fully stopped while the document is hidden
 * (no rAF scheduled at all), with a clamped dt so a resumed tab doesn't fast-forward.
 */
export function startLoop(frame: (dt: number, t: number) => void, fps = 30): { stop: () => void; stats: LoopStats } {
  const stats: LoopStats = { fps: 0, frames: 0, frameMs: 0 };
  const interval = 1000 / fps;
  const manual = window.__forceManualFrames === true;
  let raf = 0;
  let last = -1;
  let acc = 0;
  let windowStart = 0;
  let windowFrames = 0;
  let windowMs = 0;
  let t = 0;

  const advance = (now: number) => {
    if (last < 0) {
      last = now;
      windowStart = now;
    }
    acc += now - last;
    last = now;
    // Small tolerance so 60 Hz displays reliably land on every other vsync.
    if (acc < interval - 2) return;
    const dt = Math.min(acc, 100) / 1000;
    acc = Math.max(0, acc - interval);
    if (acc > interval) acc = 0;
    t += dt;
    const s = performance.now();
    frame(dt, t);
    windowMs += performance.now() - s;
    stats.frames++;
    windowFrames++;
    if (now - windowStart >= 1000) {
      stats.fps = Math.round((windowFrames * 1000) / (now - windowStart));
      stats.frameMs = windowMs / windowFrames;
      windowStart = now;
      windowFrames = 0;
      windowMs = 0;
    }
  };
  const rafTick = (now: number) => {
    raf = requestAnimationFrame(rafTick);
    advance(now);
  };
  const start = () => {
    if (manual) return;
    if (!raf) {
      last = -1;
      acc = 0;
      raf = requestAnimationFrame(rafTick);
    }
  };
  const pause = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  if (manual) {
    window.__agentOfficeManualTick = advance;
  }
  const onVisibility = () => (document.hidden ? pause() : start());
  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) start();
  return {
    stats,
    stop: () => {
      pause();
      document.removeEventListener("visibilitychange", onVisibility);
      if (manual) delete window.__agentOfficeManualTick;
    },
  };
}

/** Largest integer device-pixel scale that fits the window; returns CSS size and scale. */
export function fitInteger(w: number, h: number, winW: number, winH: number, dpr: number): { scale: number; cssW: number; cssH: number } {
  const scale = Math.max(1, Math.floor(Math.min((winW * dpr) / w, (winH * dpr) / h)));
  return { scale, cssW: (w * scale) / dpr, cssH: (h * scale) / dpr };
}
