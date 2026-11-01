# Lantern Isles

Lantern Isles is a survival game in the pre-rendered isometric style of classic strategy games, and it runs in the browser. You wash ashore on an island whose ancient lanterns went dark. By day you gather, hunt, craft and build. By night you keep your fire burning, because the **Hollows** walk wherever the light doesn't reach.

- **Play:** open `index.html`
- **Asset dataset browser:** open `gallery.html`
- **Art standard and research:** [`docs/ART_STYLE_GUIDE.md`](docs/ART_STYLE_GUIDE.md), plus [`dataset/style.json`](dataset/style.json)

## The game
- **Survival stats:** health, food, water, stamina and energy. Eat berries or *cooked* meat, drink at lakes, wells, waterskins or rain collectors, and sleep in a shelter.
- **Day and night:** a full day lasts 8 minutes. At night darkness closes in, your vision shrinks, and Hollows rise out of the ground. They fear fire. They circle the edge of your light, but brave ones charge in or try to smother your campfire. Brutes appear from day 4, and each night is harder than the last.
- **Gathering:** chop trees with a stone axe (logs and sticks), take stone from rocks, sticks and fiber from bushes, berries, and herbs. Search abandoned villages and open chests for cloth, rope, arrows and medicine.
- **Hunting and wildlife:** deer and sheep flee, boars charge when provoked, and wolf packs hunt (more boldly at night). Harvest carcasses for meat and hide.
- **Crafting:** rope, stone axe, spear, bow and arrows, torches, bandages, herbal salve, waterskin, hide armor.
- **Building:** campfire (needs fuel, cooks meat), standing torch, lean-to and log cabin (sleep and save), palisade walls, spike traps, storage crate, rain collector.
- **Combat:** melee with fists, axe or spear, or ranged with a bow. Creatures that are blocked by your walls break through them.
- **Goal:** recover the **8 relics** from shrines across the island, build the **Signal Beacon**, light it at dusk, and survive the final night to be rescued.
- **Saving:** the game saves when you sleep, at every dawn, and from the menu, using your browser's local storage.

## Controls
| | Desktop | Touch |
|---|---|---|
| Move | Click the ground, or WASD | Tap the ground |
| Use or gather something | Click it, or E near it | Tap it, or the Use button |
| Attack | F / Space, or click a creature | Attack button, or tap a creature |
| Switch weapon / torch | Q / T | Weapon / Torch buttons |
| Pack & crafting / build | I or Tab / B | Pack / Build buttons |
| Camera | Drag, wheel to zoom, C to re-centre | Drag, pinch to zoom, ◎ button |

## How the art is made
Every asset is a 3D signed-distance-field model (`src/models.js`). One fixed camera and one sun ray-march it into 2D sprites (`src/render3d.js`). Each sprite has a body layer and a separate shadow layer, and is snapped to a shared 256-colour palette (`src/palette.js`). This is how the reference games pre-rendered 3D models into sprites. All models are original.

```bash
node tools/bake.js
```

This re-renders all 94 sprite sets and the 11 terrain textures, then writes `assets/` and `dataset/`. It needs Playwright with Chromium and takes about 3 minutes.

```bash
node tools/bake.js wolf,beacon_lit
```

This previews a subset in `/tmp/bake-preview` without writing anything to the repo.

## Layout
| Path | Purpose |
|---|---|
| `src/style.js` | The art standard, the single source of truth |
| `src/palette.js` | 256-colour palette and quantiser |
| `src/noise.js` | Deterministic noise |
| `src/render3d.js` | Pre-render ray-marcher (camera, sun, shadows, supersampling) |
| `src/models.js` | Asset models: nature, buildings, ruins, survival structures, units with attack and death poses, item icons |
| `src/terrainTex.js` | Tileable terrain textures |
| `src/game.js` | The survival game: world generation, terrain rendering, survival systems, AI, building, crafting, saving, audio, UI |
| `tools/bake.html`, `tools/bake.js` | Asset bake pipeline and exporter |
| `assets/` | Baked sprites, terrain, manifest and inlined atlas |
| `dataset/` | style.json, palette.json, palette.pal |
