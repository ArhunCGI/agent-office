# Art direction — Agent Office

## Intent
A small desk diorama at night, seen in 2:1 isometric. Cozy mood: honey wood, plum walls, the warm light of a lamp, moonlight through the window, string lights. Readable at a glance like Mini Motorways: few details, crisp silhouettes, accent colors reserved for what matters (characters, screens, alerts).

## Rendering
- Internal resolution **480×270**, scaled up by an **integer factor** (×2 at 1080p, ×4 at 4K…), `image-rendering: pixelated`, `imageSmoothingEnabled = false`. Never any interpolation, rotation, or non-integer scaling of a sprite.
- **2:1 dimetric** projection: 32×16 px tile. Grid axis `+x` → bottom-right (SE), `+y` → bottom-left (SW). 1 tile = 16 world units; `z` = screen pixels.
- Iso edges are rasterized using "pixel center inside the polygon" → perfect 2:1 staircases, with no orphan pixels.

## Scene palette (24 colors)
Defined in `src/art/palette.ts`: **warm palette A** (plum + honey), chosen in design review.

| Role | Keys |
|---|---|
| Night background | `night0`, `night1` |
| Outline / eyes | `ink` |
| Walls | `wall0` (NW wall, in shadow), `wall1` (NE wall, lit), `wall2` (moldings) |
| Wood | `wood0` → `wood3` (darkest to lightest) |
| Light | `cream`, `white`, `butter` |
| Accents | `coral0/1`, `blush`, `red`, `mint0/1`, `leaf0/1`, `sky0/1/2` |

Characters have **their own palette** (defined in their file), to stay extensible; the shared emotes ("!" bubble, sparkles, poof, accessories) use only the scene palette.

## Light and shadows
- **Warm key light at the top left.** Box faces: top = light, left face (+y) = medium, right face (+x) = dark. The front edge of the top is underlined with a light fringe (`edge`).
- Organic shapes (characters, foliage, smoke): automatic `paintShape` shading — 1 px inner outline, light fringe top/left, shadow fringe bottom/right.
- No gradients: light is built with **ordered dithering (Bayer 4×4)** between two neighboring palette tones (lamp pool, moonlight, background vignette, cast shadows).
- Furniture cast shadows are offset toward +x/+y; character ground shadow = dithered `ink` ellipse at 60%.

## Outlines
- Furniture: 1 px **outer** outline in `ink`.
- Characters: 1 px **inner** outline in the darkest tone of their material (never pure black) → silhouette readable on a dark background without hardening the style.
- Floor, walls, rugs: no outline.

## Characters
- **Proportions**: big head / big body, tiny limbs. Normal size ≈ 18×20 usable px (32×44 frame with margin for the bubble and the jump). **Sub-agents** use a dedicated silhouette at ~60% (22×30 frame), not a resize (which would blur the pixels).
- **Expressiveness with few pixels**: 2×3 eyes (1×2 in mini), `blush` cheeks, mouth only when the emotion calls for it. States: open eyes, blink, focused (squinting eyes), looking up (waiting), "^ ^" (done).
- **Directions**: SE/SW show the face, NE/NW the back. Only SE and NE are drawn; SW/NW are mirrors.
- **Animations** (shared timings in `src/characters/pose.ts`): `idle` (breathing + blink), `walk` (bounce + alternating legs), `work_type`, `work_read` (book), `work_terminal` (fast typing + glow), `waiting` (raised hand + "!" bubble), `done` (jump + sparkles), `spawn`/`despawn` (generic poof provided by the engine).
- **Per-instance variants**: hue rotation (colors marked `fixedColors` are spared) + accessory (sprout, bow, hat, flower).

## Design review decisions
- **Mascot: Clawd** (rectangular body on four legs, a nod to the terminal mascot).
- **Palette: warm A** (plum + honey).
The chibi variant and the cool palette proposed at milestone 2 were removed from the code.

## Set
L-shaped world of 24×17 tiles, three rooms separated by low partitions (cream door posts):
- **Open space** (parquet): 9 double desks = 18 seats, screens with scrolling code, window, mailbox.
- **Lab** (mauve tile, rug): bookshelves, server racks + terminal (LED), whiteboard, window.
- **Cafeteria** (wood checkerboard): steaming espresso machines, tables (mug, cake), sofa, window, string lights.
NE and NW back walls (polka-dot wallpaper, star poster, string lights), open front edges diorama-style with a floor slice, dithered light pools from the lamps and moonlight.

## Activity readability
- Working: at their station, tool-specific animation.
- Waiting for permission: "!" bubble and raised hand.
- Idle: goes to the cafeteria; "zzz" after 12 s without work.
- Dialogue: bubbles with fake text (gray lines, one coral word, "?" for a question) at a sub-agent's briefing, at its report, and during coffee breaks.

## Adding an asset
- Procedural sprites: masks (`Mask`) + `paintShape`, small character matrices (`paintMatrix`), iso primitives (`IsoPainter.box/planeX/planeY/planeZ`).
- A future PNG spritesheet could replace `CharacterDefinition.draw` by copying the pixels of an image into the provided `Bitmap`: the rest of the engine only sees `Bitmap`s.
