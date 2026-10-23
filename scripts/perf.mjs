// Performance soak: N minutes of the mock scenario at 1920×1080, then 30 s with the tab hidden.
// Usage: node scripts/perf.mjs [url] [minutes] [out.json]
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:4317/?mock=1";
const minutes = Number(process.argv[3] ?? 5);
const out = process.argv[4] ?? "docs/qa/perf.json";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const stats = () => page.evaluate(() => ({ ...window.__agentOffice.stats, agents: window.__agentOffice.office.agents.size }));

await page.goto(url);
await page.waitForFunction(() => !!window.__agentOffice);
await page.waitForTimeout(3000);

const samples = [];
let prev = await metric();
let prevT = Date.now();
const sample = async (phase) => {
  const m = await metric();
  const now = Date.now();
  const wall = (now - prevT) / 1000;
  const s = await stats();
  samples.push({
    t: samples.length ? samples[samples.length - 1].t + wall : wall,
    phase,
    fps: s.fps,
    frameMs: +s.frameMs.toFixed(2),
    agents: s.agents,
    cpuMainThreadPct: +(((m.TaskDuration - prev.TaskDuration) / wall) * 100).toFixed(1),
    scriptPct: +(((m.ScriptDuration - prev.ScriptDuration) / wall) * 100).toFixed(1),
    heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1),
  });
  prev = m;
  prevT = now;
  const x = samples[samples.length - 1];
  console.log(`${x.t.toFixed(0).padStart(4)}s ${phase.padEnd(7)} fps=${x.fps} frame=${x.frameMs}ms cpu=${x.cpuMainThreadPct}% heap=${x.heapMB}MB agents=${x.agents}`);
};

for (let i = 0; i < (minutes * 60) / 10; i++) {
  await page.waitForTimeout(10_000);
  await sample("visible");
}
await page.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
});
prev = await metric();
prevT = Date.now();
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(10_000);
  await sample("hidden");
}
await browser.close();

const vis = samples.filter((s) => s.phase === "visible");
const avg = (k, xs = vis) => +(xs.reduce((a, s) => a + s[k], 0) / xs.length).toFixed(2);
const summary = {
  url,
  minutes,
  fps: { avg: avg("fps"), min: Math.min(...vis.map((s) => s.fps)), max: Math.max(...vis.map((s) => s.fps)) },
  frameMs: { avg: avg("frameMs"), max: Math.max(...vis.map((s) => s.frameMs)) },
  cpuMainThreadPct: { avg: avg("cpuMainThreadPct"), max: Math.max(...vis.map((s) => s.cpuMainThreadPct)), hiddenAvg: avg("cpuMainThreadPct", samples.filter((s) => s.phase === "hidden")) },
  heapMB: { start: vis[0].heapMB, end: vis[vis.length - 1].heapMB, max: Math.max(...vis.map((s) => s.heapMB)) },
  maxAgents: Math.max(...vis.map((s) => s.agents)),
};
writeFileSync(out, JSON.stringify({ summary, samples }, null, 2));
console.log(JSON.stringify(summary, null, 2));
