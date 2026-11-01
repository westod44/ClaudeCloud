# Lantern Isles

Lantern Isles is a survival game in the pre-rendered isometric style of classic strategy games, and it runs in the browser. You wash ashore on an island whose ancient lanterns went dark. By day you gather, hunt, craft and build a base. By night you keep your fires burning, because the **Hollows** walk wherever the light doesn't reach.

- **Play:** open `index.html`
- **Asset dataset browser:** open `gallery.html`
- **Art standard and research:** [`docs/ART_STYLE_GUIDE.md`](docs/ART_STYLE_GUIDE.md), plus [`dataset/style.json`](dataset/style.json)

## The game
- **Survival stats:** health, food, water, stamina and warmth, shown with icons and numbers beside the status portrait. Stamina powers sprinting, dodging and swings, and refills when you rest, eat and sleep. Warmth falls at night, in rain, snow and wind, on high ground and when you are wet. Fires, shelters, hide armor, a hot stew, a comfortable home and moving fast raise it. There are also hidden conditions: **bleeding** (stop it with a bandage), **sickness** (cure it with herbs or salve), **wet** clothes, **fear** in the dark and **comfort** at home.
- **Status portrait:** a pixel-art face rendered from the same 3D survivor you play. Its expression follows your state (content, hungry, thirsty, hurt, scared, tired, cold, weak, sick, angry, dead, and it blinks). Blood, bruises, dirt, sweat, rain, frost, pallor and a sickly tint are painted on as they happen.
- **Day, night and weather:** a day lasts 8 minutes. The top-left panel shows the day, the time and the weather. The weather moves between clear, fair, cloudy, overcast, rain, storm, fog, snow and windy:
  - Clouds roll across the land and their shadows drift over it, with more and larger clouds in worse weather.
  - Gusts sweep through the trees and grass.
  - Lightning can strike trees.
  - Fog shrinks your vision.
  - Snow settles on the ground.
- **Interacting:** click or tap anything to walk there and use it. A tooltip says what clicking will do. If an object has several actions (a campfire: cook meat, add a log, add a stick, warm up, demolish), a menu lets you choose.
- **Combat:** aim with the mouse and right-click or press F to strike toward the cursor. Space dodges with brief invulnerability, and Shift sprints. Weapons: fists, stone axe, knife, club, spear, great axe, bow (arrows and fire arrows) and sling. Melee weapons differ in damage, reach, speed, stamina cost and swing arc.
- **Base building:**
  - Log or stone walls that join up automatically, gates that open for you but not for enemies, palisades, spike walls, spike traps and a lookout.
  - Floors, rug, bed, table, bench, shelf, crate, campfire, standing torch, brazier and spirit lantern.
  - Drying rack (jerky), stew pot, garden plot, rain collector, workbench (unlocks advanced recipes and buildings), weapon rack, lean-to and log cabin.
  - You can repair or demolish anything you build. Furniture and light near your bed raise comfort, which helps you rest and recover.
- **Danger grows outward and over time:** the start area is calm. Bears, spiders, wolf packs and stronger night creatures live toward the edges of the island. New Hollow kinds join the night as the days pass: crawlers, stalkers (leap), wisps (ranged) and brutes. Hollows fear fire but will try to smother an unattended one.
- **Goal:** recover the **8 relics** from shrines across the island, build the **Signal Beacon**, light it at dusk, and survive the final night to be rescued.
- **Sound:** all sound is synthesised live. It includes footsteps that change with the surface (grass, dirt, sand, rock, snow, water, wood), a call for each animal, birdsong by day, crickets, owls and frogs by night, wind, rain, surf, crackling fires, thunder and combat sounds.
- **Saving:** the game saves when you sleep, at every dawn, and from the menu, using your browser's local storage.

## Controls
| | Desktop | Touch |
|---|---|---|
| Move | Click the ground, or WASD / arrows | Joystick, or tap the ground |
| Sprint / dodge | Shift / Space | Sprint (toggle) / Dodge buttons |
| Use or gather something | Click it (menu if there are several actions), or E near it | Tap it, or the Use button |
| Attack | Right-click toward the cursor, or F | Attack button (drag it to aim) |
| Weapon / hotbar / torch | Q / 1–6 / T | Hotbar / Torch button |
| Pack & crafting / build | I or Tab / B | Pack / Build buttons |
| Camera | Drag, wheel to zoom, C to re-centre | Drag, pinch to zoom, ◎ button |

## How the art is made
Every asset is a 3D model rendered by a fixed camera and one sun into 2D sprites, the way the reference games pre-rendered their art. All models are original.
- **Units, buildings, props and structures** are signed-distance-field models (`src/models.js`), ray-marched by `src/render3d.js`.
- **Trees, bushes and grass** come from a separate foliage renderer (`src/foliage.js`). It grows a branch skeleton, covers it in thousands of shaded leaf clusters, and paints them in order, so trees read as hand-painted sprites rather than meshes.
- **Every sprite** has a body layer and a separate shadow layer, and is snapped to a shared 256-colour palette (`src/palette.js`).
- **Units** are rendered in all 8 directions, so shadows always fall the right way.
- **Wind:** trees get 3 leaf-flutter frames and bend at runtime with the wind. Grass and flowers get 6 breeze and 6 gale sway frames.

```bash
node tools/bake.js
```

This re-renders all 162 sprite sets and the 11 terrain textures, then writes `assets/` and `dataset/`. It needs Playwright with Chromium and takes about 8 minutes. The browser atlas is split into `assets/atlas.js` (manifest) and `assets/atlas-N.js` (images, about 5 MB each).

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
| `src/models.js` | SDF models: units with 8 weapons, creatures, buildings, ruins, structures, walls, furniture, the portrait bust, item icons |
| `src/foliage.js` | Leaf-particle tree, bush, fern and grass renderer with wind frames |
| `src/terrainTex.js` | Tileable terrain textures |
| `src/data.js` | Items, weapons, recipes, buildable structures, creature stats, night spawn table |
| `src/weather.js` | Weather state machine, wind field, clouds, rain, snow, fog, lightning |
| `src/audio.js` | Synthesised sound effects and ambience (WebAudio) |
| `src/portrait.js` | Status portrait overlays (blood, frost, pallor, sweat…) |
| `src/game.js` | The game: world generation, terrain rendering, survival, combat, AI, building, saving, UI |
| `tools/bake.html`, `tools/bake.js` | Asset bake pipeline and exporter |
| `assets/` | Baked sprites, terrain, manifest and the chunked browser atlas |
| `dataset/` | style.json, palette.json, palette.pal |
