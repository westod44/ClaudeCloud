# Lantern Isles: Art Style Guide

**Goal:** the look of a late-90s/2000s pre-rendered isometric strategy game, in the *Age of Empires II* tradition (1999 original, 2013 HD, 2019 Definitive Edition). This means realistic, painterly-but-crisp sprites on blended terrain, seen from a fixed dimetric camera.

**Rule:** we copy *conventions*, never assets. Every model, texture and colour here is original and generated from code.

The machine-readable version of this guide is [`dataset/style.json`](../dataset/style.json), exported from [`src/style.js`](../src/style.js), the single source of truth. Change a value there, run `node tools/bake.js`, and every asset re-renders consistently.

---

## 1. Research findings

### 1.1 How the reference games make their art

| Finding | Source | What we adopted |
|---|---|---|
| AoE2 units were modelled in 3D Studio / 3D Studio Max (a few thousand to ~100k polygons). An in-house 2D artist turned the renders into sprites and retouched them in Photoshop. | PC Games, *25 Jahre Age of Empires* retrospective | A **pre-rendered pipeline**: every asset is a 3D model ray-marched once to a 2D sprite (`src/render3d.js`). |
| The Definitive Edition is still a **2D sprite engine**, not 3D. | ageofempires.com, *Is Age of Empires Definitive Edition a 3D or 2D game?* | The game draws only sprites and pre-baked terrain. Nothing is 3D at runtime. |
| The HD team used Blender (2.72) for modelling, rigging and animation. | BlenderNation, 2015 | Same idea: the model is the source of truth and sprites are a build artifact. |
| Original terrain tiles are 97×49 px rhombi (odd size, so each has a centre pixel). There are 27 terrain SLPs, each with a **priority** used for blending. | openage, `doc/media/terrain.md` | A 2:1 diamond tile (128×64 at 1x) and a per-terrain blend priority table. |
| Neighbouring terrains are blended with **alpha masks**. The higher-priority terrain "floods" into the lower one. There are several mask shapes: rough, smooth, short, spray, sharp. | openage, `doc/media/blendomatic.md` | Domain-warped terrain borders (rough), a soft half-mix seam, and a continuous depth field for water and shore (smooth). |
| Slopes are made by texture-mapping flat tiles and **lighting them**. AoE2 has 7 elevation levels. | openage `terrain.md`; gamedev.net elevation thread | 7 levels × 24 px. Slope lighting uses the same sun as the sprites. |
| Moving units have **5 rendered directions**. The other 3 are made by mirroring. Classic animations have 10 keyframes. | openage, `doc/media/slp-files.md` | We tried this first, then render **all 8 directions** instead. Mirroring flips the baked shadow to the wrong side, so the shadow jumped when a unit turned. Idle + 8 walk frames. |
| Each sprite carries a **separate shadow layer** (alpha mask) and **player-colour** pixels. DE adds damage and player-colour mask layers (SLD format). | openage `slp-files.md`, `smx-files.md`, `sld-files.md` | Every asset is baked as `body` and `shadow` PNGs. One material (`TEAM`) takes the player colour. |
| Old releases use a single **256-colour palette** (`50500`), plus an inverse colour map (32×32×32 lookup) for snapping RGB values to it. | openage `slp-files.md`, `terrain.md` | `src/palette.js` builds a 256-colour palette from material ramps and snaps sprites and terrain to it through a 32³ lookup table. It is exported as JASC-PAL, the same text format. |
| The DE UHD pack is **double resolution** sprites. Sprites are shown at native size at only one zoom level and are mip-mapped otherwise. | AoE forums (player reports; not official) | A resolution tier switch in the standard (`projection.resolutionTiers`): re-bake at 2x from the same models. |
| A fan Town Center rebuild for openage lights the scene with **one shadow-only sun in front of the building, angled ~22° downward**, plus a few soft fill lights, for strong light/shadow contrast. | openage-modding PR #2 (community tutorial) | One key sun plus a sky fill and a ground bounce light. We raise the sun to 41° so shadows stay inside a compact sprite canvas. |
| Community Blender isometric templates use an orthographic camera with simple lighting, modelled on AoE2. | OpenGameArt, *Isometric rendering setup for Blender* (CC0) | An orthographic camera at 30° elevation and 45° azimuth (an exact 2:1 diamond). |

**Network note:** www.ageofempires.com and deepwiki.com were not reachable from the build environment. Findings from those sites come from search-result summaries, and the openage docs were read directly from GitHub.

### 1.2 What gives the reference style its character
1. **No outlines.** Shapes are separated by lighting and value, not by black lines (unlike most modern pixel art).
2. **Realistic proportions, small scale.** A person is roughly half a tile tall, and buildings are several tiles.
3. **One consistent sun.** All shadows fall the same way, and all lit faces face the same way.
4. **Earthy, slightly desaturated palette.** Saturated colour is saved for player colours, flags, fruit and water highlights.
5. **Busy, natural terrain.** Mottled grass, dirt patches and irregular borders, with no visible tile grid.
6. **Dense forests made of single trees**, each casting its own shadow. The trees are painted, not modelled. They read as masses of small leaf clusters with a lit top-left, a dark core and individual leaves breaking the silhouette, never as smooth shapes.
7. **Black unexplored areas and darkened explored ones** (fog of war).

---

## 2. The standard (summary of `src/style.js`)

| Area | Value |
|---|---|
| Projection | Orthographic dimetric. Camera elevation 30°, azimuth 45°. Diamond is 2:1. |
| Tile | 128×64 art pixels at 1x. 1 world unit = 1 tile edge = 90.51 px horizontally. 1 unit of height = 78.38 px. |
| Elevation | 7 levels × 24 px. Terraced plateaus joined by smooth (B-spline) lit slopes. |
| Sun | Direction (world i,j,z) `[-0.071, 0.707, 0.62]`: front-left, 41° high. Colour `#ffeccc`. |
| Fill lights | Sky `#a9bedf` × 0.64 (from above), earth bounce `#7d6a48` × 0.22 (from below), ambient occlusion. |
| Shadows | Separate layer, colour `#10141c`, max alpha 0.5, 4 quantised levels, soft penumbra. |
| Sprites | 2×2 supersampled. **Binary alpha** (coverage ≥ 50%). **No outlines.** Snapped to the palette. |
| Palette | 31 material ramps × 7 steps (including `spirit`, the Hollows' pale glow) (shadows shift cool, highlights shift warm) + 8 greys + 8 player colours × 3 = 249 used of 256. |
| Player colours | blue, red, green, yellow, teal, purple, grey, orange. |
| Units | All 8 directions rendered (no mirroring, so shadows always fall the correct way). Columns: 0 idle, 1–8 walk (12 fps), 9–12 attack, 13 death pose (the same model laid on its side). The survivor is baked once per weapon (unarmed, axe, spear, bow, club, knife, great axe, sling). |
| Foliage | `src/foliage.js`, not the SDF ray-marcher. A branch skeleton is grown per species (oak, beech, maple, aspen, birch, pine, snowy pine, palm, dead, bushes, ferns), then covered in thousands of leaf particles. Each particle is lit by the canopy normal, a sun-space shadow map and inner occlusion, then the particles are drawn back-to-front at 3× and snapped to the palette. Trees cast dappled ground shadows. |
| Wind | Trees: 3 leaf-flutter frames, plus a runtime bend of horizontal strips that grows with height, driven by the weather's wind field and gusts. Grass, flowers and reeds: 6 breeze + 6 gale sway frames, chosen by the local wind strength. Each plant integrates its own animation phase and eases toward the local wind. A gust therefore changes how far a plant leans and which frame set it uses, while the tempo rises only gently. Grass and flowers also bend away from anyone walking through them, on a damped spring. |
| Portrait | Drawn live, not baked (`src/portrait.js`): a 96×108 pixel-art bust, shown at 2× (desktop) or 1× (touch). The same hat, hair, stubble, blue shirt and pack strap as the in-game survivor. Skin is lit by a small relief map (nose, brow ridge, cheekbones, chin) from the game's front-left sun, with a shadow under the hat brim. Every material uses a 5–8 step ramp with 4×4 ordered dithering and a dark silhouette outline. A rig (brows, lids, pupils, mouth shapes, teeth, tongue, wrinkles, head motion) is animated per mood at about 20 fps, and moods ease into one another. |
| Item icons | The same models and lights rendered at 3× scale, body layer only, cropped. |
| Walls | Wall and gate pieces are baked as a post plus half-segments in both diagonal directions, so the game joins neighbouring wall tiles automatically. |
| Terrain | 11 tileable top-down textures, 384² px = 4×4 tiles (96 texels per tile), sampled in world space so there are no seams. |
| Fog | Unexplored areas are black. Explored areas out of sight are dimmed to 48%. Vision radius 7 tiles (+2 on high ground). |

### Scale reference (world units, 1 = one tile)
human 0.62 · Hollow 0.72 (brute ×1.4) · wolf 0.5 · boar 0.42 · bear 0.75 · spider 0.3 · deer 0.62 · sheep 0.38 · oak 1.4–1.7 · pine 1.6–2.0 · palm 1.6 · cottage 1.35 (2×2 footprint) · watchtower 2.5–3.0 · windmill 2.3 (2×2).

---

## 3. Making a new asset

1. Add a factory to `src/models.js` that returns `{bounds, sdf, mat}` (for trees and plants, add or tune a species in `src/foliage.js` instead). Build the shape from the SDF kit (`box`, `cap`, `cone`, `prismX`, `ell`, `smin`, …) in world units, with +x as the facing direction for units.
2. Use only materials from `M`. Each one maps to a palette ramp. If you need a new colour, add it to `STYLE.materials` first so it enters the palette.
3. Register the asset in the `LIST` in `tools/bake.html` with a category, footprint and blocking flag.
4. Run `node tools/bake.js`, then check it in `gallery.html`.

**Do:** keep detail readable at 1x, put doors and windows on the +x/+y faces (the faces the camera sees), and vary the value of large surfaces.
**Don't:** add outlines, use pure black or white, add another light, or place a new hue outside the palette.

---

## 4. Dataset contents

| Path | Contents |
|---|---|
| `dataset/style.json` | The full standard (camera, lighting, materials, terrain table, sprite rules, fog, UI). |
| `dataset/palette.json`, `dataset/palette.pal` | The 256 colours with ramp names. JASC-PAL format. |
| `assets/manifest.json` | Every asset: category, description, footprint, blocking flag, canvas size, anchor, frames, directions, fps, file paths, bake time. |
| `assets/sprites/*.png` | Sprite sheets. Body and `_shadow` layers. Units are laid out with rows = 8 directions and columns = idle, walk, attack and death frames. |
| `assets/terrain/*.png` | The 11 tileable terrain textures. |
| `assets/atlas.js`, `assets/atlas-N.js` | Everything above inlined for the browser: the manifest, plus the images split into ~5 MB chunks that load in sequence. |

**Asset count:** 149 sprite assets: 19 units × 112 frames (8 directions × idle, 8 walk, 4 attack, 1 death), 27 survival structures, 14 wall and gate pieces, 7 buildings, 11 ruins, 5 props, 4 resources, 23 nature, 9 decor and 30 item icons. Plus 11 terrain textures.

---

## 5. Sources

- openage (SFTtech): [terrain.md](https://github.com/SFTtech/openage/blob/master/doc/media/terrain.md) · [blendomatic.md](https://github.com/SFTtech/openage/blob/master/doc/media/blendomatic.md) · [slp-files.md](https://github.com/SFTtech/openage/blob/master/doc/media/slp-files.md) · [smx-files.md](https://github.com/SFTtech/openage/blob/master/doc/media/smx-files.md) · [sld-files.md](https://github.com/SFTtech/openage/blob/master/doc/media/sld-files.md)
- openage-modding Town Center lighting tutorial: <https://github.com/SFTtech/openage-modding/pull/2>
- PC Games, history of Age of Empires (3D Studio Max models → sprites): <https://www.pcgames.de/Age-of-Empires-Spiel-17575/Specials/25-Jahre-Entstehung-Geschichte-Rueckblick-AoE-RTS-1403404/3/>
- Age of Empires news, *Is AoE DE a 3D or 2D game?*: <https://www.ageofempires.com/news/age-empires-definitive-edition-3d-2d-game/>
- BlenderNation, *Blender spotted in Age of Empires development*: <https://www.blendernation.com/2015/04/18/blender-spotted-in-age-of-empires-development/>
- AoE forums on UHD double-resolution sprites and zoom: <https://forums.ageofempires.com/t/uhd-graphics-too-zoomed-in/63253> · <https://forums.ageofempires.com/t/enhanced-graphics-option-gives-uncompetitive-zoom/91226>
- OpenGameArt, isometric rendering setup for Blender: <https://opengameart.org/content/isometric-rendering-setup-for-blender>
- gamedev.net, terrain elevation in AoE-style engines: <https://gamedev.net/forums/topic/629231-2d-game-terrain-with-elevation/4967274/>
