// Captures the scene at given times. Usage: node scripts/timeline.mjs <url> <outPrefix> <t1,t2,...> [w] [h]
import { chromium } from "@playwright/test";
const [url, prefix, times, w = "1920", h = "1080"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on("pageerror", (e) => console.error("pageerror", e.message));
await p.goto(url);
const t0 = Date.now();
for (const t of times.split(",").map(Number)) {
  await p.waitForTimeout(Math.max(0, t * 1000 - (Date.now() - t0)));
  await p.screenshot({ path: `${prefix}-${String(t).padStart(3, "0")}s.png` });
  const info = await p.evaluate(() => {
    const o = window.__agentOffice;
    return { fps: o.stats.fps, agents: [...o.office.agents.values()].map((a) => `${a.id}:${a.state}:${a.anim}:${a.dir}@${a.x.toFixed(1)},${a.y.toFixed(1)}`) };
  });
  console.log(t, JSON.stringify(info));
}
await b.close();
