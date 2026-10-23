// Usage: node scripts/screenshot.mjs <url> <out.png> [width] [height] [css-selector]
import { chromium } from "@playwright/test";
const [url, out, w = "1920", h = "1080", sel] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url);
await p.waitForTimeout(1500);
if (sel) await p.locator(sel).first().screenshot({ path: out });
else await p.screenshot({ path: out, fullPage: true });
await b.close();
