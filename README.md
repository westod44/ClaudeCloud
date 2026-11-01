# Lantern Isles

Lantern Isles is an open-world exploration game in the pre-rendered isometric style of classic strategy games (the *Age of Empires II* look). It runs in the browser. Explore an island with fog of war, find villages, ruins and watchtowers, collect treasure chests, and recover the 8 lost relics.

- **Play:** open `index.html`
- **Asset dataset browser:** open `gallery.html`
- **Art standard and research:** [`docs/ART_STYLE_GUIDE.md`](docs/ART_STYLE_GUIDE.md), plus [`dataset/style.json`](dataset/style.json)

## Controls
Tap or click to walk (with pathfinding). WASD or arrow keys steer directly. Drag to look around, and use the scroll wheel, a pinch or the +/− buttons to zoom. Space re-centres the camera. Click the minimap to jump the camera.

## How the art is made
Every asset is a 3D signed-distance-field model (`src/models.js`). One fixed camera and one sun ray-march it into 2D sprites (`src/render3d.js`). Each sprite has a body layer and a separate shadow layer, and is snapped to a shared 256-colour palette (`src/palette.js`). This is how the reference games pre-rendered 3D models into sprites. All models are original.

```bash
node tools/bake.js
```

This re-renders every sprite and terrain texture and writes `assets/` and `dataset/`. It needs Playwright with Chromium and takes about 40 seconds.

```bash
node tools/bake.js oak_1,well
```

This previews a subset in `/tmp/bake-preview` without writing anything to the repo.

## Layout
| Path | Purpose |
|---|---|
| `src/style.js` | The art standard, the single source of truth |
| `src/palette.js` | 256-colour palette and quantiser |
| `src/noise.js` | Deterministic noise |
| `src/render3d.js` | Pre-render ray-marcher (camera, sun, shadows, supersampling) |
| `src/models.js` | Asset models and materials |
| `src/terrainTex.js` | Tileable terrain textures |
| `src/game.js` | World generation, terrain rendering, units, fog, UI |
| `tools/bake.html`, `tools/bake.js` | Asset bake pipeline and exporter |
| `assets/` | Baked sprites, terrain, manifest and inlined atlas |
| `dataset/` | style.json, palette.json, palette.pal |
