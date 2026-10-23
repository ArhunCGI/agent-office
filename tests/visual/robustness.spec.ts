import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";
import { ready, type Office } from "./helpers";

type W = Window & { __agentOffice: Office };

test.use({ viewport: { width: 1920, height: 1080 } });

for (const n of [1, 10, 30]) {
  test(`${n} busy agent(s) keep 30 fps without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/?mock=stress&n=${n}`);
    await ready(page);
    await page.waitForTimeout(7000);
    const { fps, agents } = await page.evaluate(() => {
      const o = (window as unknown as W).__agentOffice;
      return { fps: o.stats.fps, agents: o.office.agents.size };
    });
    expect(agents).toBe(n + 1);
    expect(fps).toBeGreaterThanOrEqual(28);
    expect(fps).toBeLessThanOrEqual(31);
    expect(errors).toEqual([]);
  });
}

test("unknown agents, double done, junk events don't break the scene", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?ws=ws://localhost:1/none");
  await ready(page);
  await page.evaluate(() => {
    const o = (window as unknown as W).__agentOffice;
    o.apply({ type: "agent_tool", agentId: "ghost", tool: "Read" });
    o.apply({ type: "agent_done", agentId: "nobody" });
    o.apply({ type: "agent_despawn", agentId: "nobody" });
    o.apply({ type: "agent_spawn", agentId: "x", kind: "martian" });
    o.apply({ type: "agent_done", agentId: "x" });
    o.apply({ type: "agent_done", agentId: "x" });
    o.apply({ type: "agent_spawn", agentId: "c", parentId: "missing-parent", kind: "claude" });
  });
  await page.waitForTimeout(3000);
  const ids = await page.evaluate(() => [...(window as unknown as W).__agentOffice.office.agents.keys()].sort());
  expect(ids).toEqual(["c", "ghost", "x"]);
  expect(errors).toEqual([]);
});

test("render loop stops while hidden and resumes", async ({ page }) => {
  await page.goto("/?mock=1");
  await ready(page);
  await page.waitForTimeout(1000);
  const frames = () => page.evaluate(() => (window as unknown as W).__agentOffice.stats.frames);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const f0 = await frames();
  await page.waitForTimeout(1500);
  expect(await frames()).toBe(f0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(1000);
  expect(await frames()).toBeGreaterThan(f0 + 20);
});

test("WebSocket disconnect / reconnect with snapshot catch-up", async ({ page, request }) => {
  const PORT = 4319;
  const base = `http://localhost:${PORT}`;
  let server: ChildProcess | null = null;
  const start = async () => {
    server = spawn("node", ["--import", "tsx", "server/index.ts"], { env: { ...process.env, PORT: String(PORT), DEMO: "0" }, stdio: "ignore" });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await request.get(`${base}/health`)).ok()) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("server did not start");
  };
  const stop = () => new Promise<void>((r) => (server ? (server.once("exit", () => r()), server.kill()) : r()));
  const post = (e: unknown) => request.post(`${base}/events`, { data: e });
  const ids = () => page.evaluate(() => [...(window as unknown as W).__agentOffice.office.agents.entries()].filter(([, a]) => a.state !== "despawning").map(([id]) => id).sort());

  await start();
  try {
    await page.goto(`/?ws=ws://localhost:${PORT}/events`);
    await ready(page);
    await expect.poll(async () => (await request.get(`${base}/health`)).json().then((h) => h.clients)).toBe(1);
    await post({ type: "agent_spawn", agentId: "before", kind: "claude" });
    await expect.poll(ids).toEqual(["before"]);

    await stop();
    await page.waitForTimeout(1500);
    // Still rendering the last known state while offline.
    expect(await ids()).toEqual(["before"]);

    await start();
    await post({ type: "agent_spawn", agentId: "after", kind: "claude" });
    // Reconnects by itself (back-off ≤ 10 s); the fresh server's snapshot no longer has "before".
    await expect.poll(ids, { timeout: 20_000 }).toEqual(["after"]);
  } finally {
    await stop();
  }
});

test("hook endpoint feeds the screen", async ({ page, request }) => {
  await page.goto("/");
  await ready(page);
  const r = await request.post("/hook", { data: { hook_event_name: "PreToolUse", session_id: "pw-session", cwd: "/tmp/p", tool_name: "Bash", tool_input: { command: "ls" } } });
  expect(r.status()).toBe(202);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__agentOffice.office.agents.has("pw-session")))
    .toBe(true);
  expect((await request.post("/events", { data: { type: "bogus" } })).status()).toBe(400);
  expect((await request.post("/hook", { data: "not json", headers: { "content-type": "application/json" } })).status()).toBeLessThan(500);
});
