import { expect, test } from "@playwright/test";
import { SCENE_WARM } from "../../src/art/palette";
import { blurryBlocks, colors, decode, ready, SIZES, type Office } from "./helpers";

const OUT = "docs/screenshots/qa";

for (const size of SIZES) {
  test.describe(`@${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });

    test("empty office: integer scale, crisp pixels, scene palette only", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/?ws=ws://localhost:1/none&freeze=0");
      await ready(page);
      await page.waitForTimeout(500);
      const vp = await page.evaluate(() => (window as unknown as { __agentOffice: Office }).__agentOffice.viewport());
      expect(Number.isInteger(vp.scale)).toBe(true);
      expect(vp.scale).toBeGreaterThanOrEqual(2);
      const rendering = await page.locator("canvas").evaluate((c) => getComputedStyle(c).imageRendering);
      expect(rendering).toBe("pixelated");
      const shot = await page.screenshot({ path: `${OUT}/empty-${size.name}.png` });
      const png = decode(shot);
      expect(png.width).toBe(size.width * size.dpr);
      expect(blurryBlocks(png, vp.scale)).toBe(0);
      const allowed = new Set(Object.values(SCENE_WARM));
      const stray = [...colors(png)].filter((c) => !allowed.has(c));
      expect(stray, "colours outside the 24-colour scene palette").toEqual([]);
      expect(errors).toEqual([]);
    });

    test("scripted scene: agents, sub-agents, crisp", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/?mock=1&speed=2");
      await ready(page);
      await page.waitForFunction(() => (window as unknown as { __agentOffice: Office }).__agentOffice.office.agents.size >= 4, null, { timeout: 30_000 });
      await page.waitForTimeout(1500);
      const vp = await page.evaluate(() => (window as unknown as { __agentOffice: Office }).__agentOffice.viewport());
      const png = decode(await page.screenshot({ path: `${OUT}/scene-${size.name}.png` }));
      expect(blurryBlocks(png, vp.scale)).toBe(0);
      expect(errors).toEqual([]);
    });

    test("gallery renders", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/gallery");
      await page.waitForFunction(() => (window as unknown as { __galleryReady?: boolean }).__galleryReady === true);
      await page.waitForTimeout(800);
      expect(await page.locator("canvas").count()).toBeGreaterThan(150);
      if (size.name === "1920x1080") await page.screenshot({ path: `${OUT}/gallery-${size.name}.png`, fullPage: true });
      expect(errors).toEqual([]);
    });
  });
}

test.describe("depth sorting stability", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });
  test("frozen frames with 30 agents are pixel-identical (no sort flicker)", async ({ page }) => {
    await page.goto("/?mock=stress&n=30&freeze=12");
    await ready(page);
    await page.waitForTimeout(13_000);
    const a = await page.screenshot();
    await page.waitForTimeout(400);
    const b = await page.screenshot();
    expect(Buffer.compare(a, b)).toBe(0);
  });
});
