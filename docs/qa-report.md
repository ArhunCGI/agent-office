# QA report — Agent Office (prototype)

Date: 2026-10-23 · Machine: MacBook (Apple Silicon), Node 24.21, headless Playwright Chromium.

## Acceptance criteria

| # | Criterion | Verification | Result |
|---|---|---|---|
| 1 | `pnpm install && pnpm dev` opens the animated scene with no manual step | dev server + built-in demo; `GET /` and `/gallery` return 200, the demo populates the office | ✅ |
| 2 | `/gallery` shows characters, animations, furniture | "gallery renders" test × 4 resolutions (> 150 canvases, 0 errors) + capture `screenshots/qa/gallery-1920x1080.png` | ✅ |
| 3 | Pleasant, coherent scene, crisp pixels, correct depth | sharpness tests (uniform scale×scale blocks), strict palette, depth sorting; **visual judgment: up to you** | ✅ (technical) |
| 4 | The scenario sends agents and sub-agents to the right stations with the right animations | state machine unit tests (station + animation + orientation) + captures | ✅ |
| 5 | 2nd character without modifying the engine | `robot.ts` + 1 line in `characters/index.ts` + 1 line in `kinds.json`; tested (render of all animations, `kind: "robot"`) | ✅ |
| 6 | Stable 30 fps, low CPU, pause when tab hidden | 5 min measurement below + pause test | ✅ |
| 7 | Unit and visual tests green, QA report | 66 Vitest + 20 Playwright green | ✅ |
| 8 | Complete README | launch, adding a character / station / room, event format, Claude Code hooks, WebViewScreenSaver | ✅ |

## Unit tests (Vitest) — `pnpm test` → 66/66 ✅

| Area | File | Coverage |
|---|---|---|
| Iso projection | `iso.test.ts` | grid ↔ screen round trip, 2:1 tile of 32×16 |
| Depth sorting | `iso.test.ts` | in front of/behind a wide desk, thin partition between two agents, independence from input order (no flicker), **partitions behind furniture placed against walls** (regression) |
| A* | `pathfinding.test.ts` | shortest path, unreachable, detour, straight lines, **never through a partition**, all stations reachable from the spawn |
| State machine | `office.test.ts` | spawn → idle, tool → station + animation, desk assigned per session, "!" wait, double `done`, despawn, unknown agent, unknown type, events received during spawn, sub-agents (mini, briefing, link, return + report, disappearance with the parent), 30 sub-agents without duplicate slots, idle → cafeteria + chats, no partition crossing over 2 min, snapshot |
| Events (zod) | `events.test.ts` | 5 types accepted, invalid payloads rejected, snapshot, generated scenarios valid and ordered |
| Tool → station mapping | `events.test.ts` | 12 tools including `mcp__` prefix and unknown tool; animation per station |
| Hooks adapter | `events.test.ts` | full session with sub-agent (`agent_id`), Notification, Stop, SessionEnd, direct pass-through of an AgentEvent |
| Sprites / palette | `sprites.test.ts` | each character × 9 animations × 4 directions × 2 sizes non-empty, SW mirror = SE, type fallback, **each piece of furniture uses only the 24 colors** |
| Viewport | `sprites.test.ts` | integer scale ≥ 2 and window coverage at the 4 resolutions |

## Browser tests (Playwright) — `pnpm test:visual` → 20/20 ✅

Captures in `docs/screenshots/qa/`.

| Test | 1280×720 | 1920×1080 | 2560×1440 | 3024×1964 (Retina 2×) |
|---|---|---|---|---|
| Empty office: integer scale, `image-rendering: pixelated`, **0 blurry blocks out of 4,000 samples**, **0 off-palette colors** | ✅ | ✅ | ✅ | ✅ |
| Scripted scene (≥ 4 agents including sub-agents) crisp, 0 errors | ✅ | ✅ | ✅ | ✅ |
| Gallery | ✅ | ✅ | ✅ | ✅ |

| Robustness | Result |
|---|---|
| 1 / 10 / 30 busy sub-agents: 28–31 fps, 0 errors | ✅ (30 fps measured in all three cases) |
| Sorting flicker: 2 captures of a frozen scene (`?freeze=12`) with 30 agents are **pixel-identical** | ✅ |
| Unknown agent, unknown type, double `done`, missing parent | ✅ no crash, consistent state |
| Hidden tab: 0 frames rendered for 1.5 s, then resumes | ✅ |
| WebSocket disconnect (server killed) → the screen keeps its state; restart → auto-reconnect + snapshot (the agent gone on the server side is removed) | ✅ |
| `POST /hook` (Claude Code payload) → agent on screen; invalid `POST /events` → 400; unrecognized hook payload → accepted with 0 events (never a 5xx) | ✅ |

## Performance — `pnpm perf` (5 min, 1920×1080, `?mock=1`)

| Measurement | 5 min scenario (`?mock=1`, 1–4 agents) | 1 min stress (`?mock=stress&n=30`, 31 agents) |
|---|---|---|
| FPS (avg / min / max) | 30 / 30 / 30 | 30 / 30 / 30 |
| Frame time (avg / max) | 0.19 ms / 0.36 ms | 0.35 ms / 0.45 ms |
| Main thread CPU (avg / max) | **2.3%** / 3.6% | **3.3%** / 3.9% |
| Hidden tab CPU (30 s) | **0.03%** | 0.17% |
| JS heap (start → end, max) | 8.6 → 5.8 MB, max 9.9 MB (no leak) | 10 → 9.2 MB, max 13.2 MB |

Raw data: `docs/qa/perf.json`, `docs/qa/perf-stress30.json`, log `docs/qa/perf.log`. (During the hidden phase, the log's "fps" column shows the last known value: the loop no longer runs, as the ~0% CPU confirms.)

Method: `Performance.getMetrics` via CDP (`TaskDuration` = main thread time), sampled every 10 s; FPS and frame time measured in the loop. Limits: headless Chromium (no real GPU compositing); in WebViewScreenSaver (WebKit), the compositing cost adds up but stays low (a single canvas, one `drawImage` per sprite, pre-rendered static layer).

Why it's light: sprites and furniture pre-rendered once in a cache, static set in a single image, 30 fps maximum, no `requestAnimationFrame` while the page is hidden, no per-frame allocation apart from the sorting arrays.

## Bugs found and fixed

| Bug | Cause | Fix | Safeguard |
|---|---|---|---|
| A partition rendered **in front of** the server, the whiteboard and the coffee machines (reported in review) | the partition's depth box overlapped the grid line on which these pieces of furniture start → tie broken by insertion order | partition box entirely on the back side | regression test (failed before the fix) |
| Console error "WebSocket closed without opened" in dev | Vite's HMR client was looking for a separate port in middleware mode | HMR attached to the app's HTTP server | Playwright "0 errors" tests |
| Frozen frames (`?freeze`) differing from one capture to the next | the simulator's events kept modifying the scene | freezing also cuts incoming events | stability test |
| Loop at 60 fps instead of 30 on a 60 Hz screen (dev, milestone 3) | leftover in the time accumulator | subtract the interval, capped | 28–31 fps tests |
| Agent working "between two tiles" (dev, milestone 3) | tool received mid-step, empty path | recentering on the tile before working | exact-station tests |

## Points of attention (non-blocking)

- At 1920×1080 and 2560×1440, the world is zoomed in one notch for readable characters: the camera slightly crops the edges and moves gently toward the activity.
- Without `agent_id` in hook payloads, a sub-agent's tools are displayed on the session's agent.
- CPU measurement was done headless; a measurement in WebViewScreenSaver on the target machine remains to be done during packaging.
