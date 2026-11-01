# Lantern Isles

Lantern Isles is a survival game in the pre-rendered isometric style of classic strategy games, and it runs in the browser. You wash ashore on an island whose ancient lanterns went dark. By day you gather, hunt, craft and build a base. By night you keep your fires burning, because the **Hollows** walk wherever the light doesn't reach.

- **Play:** open `index.html`
- **Asset dataset browser:** open `gallery.html`
- **Art standard and research:** [`docs/ART_STYLE_GUIDE.md`](docs/ART_STYLE_GUIDE.md), plus [`dataset/style.json`](dataset/style.json)

## The game
- **Survival stats:** health, food, water, stamina and warmth, shown with icons and numbers beside the status portrait. Stamina powers sprinting, dodging and swings, and refills when you rest, eat and sleep. Warmth falls at night, in rain, snow and wind, on high ground and when you are wet. Fires, shelters, hide armor, a hot stew, a comfortable home and moving fast raise it. There are also hidden conditions: **bleeding** (stop it with a bandage), **sickness** (cure it with herbs or salve), **wet** clothes, **fear** in the dark and **comfort** at home.
- **Status portrait:** a live, animated pixel-art face of your survivor (same hat, hair, stubble and blue shirt as in the world).
  - A rig moves the brows, eyelids, pupils, mouth, teeth, tongue, cheeks, nostrils and wrinkles, and the head, so moods blend into each other.
  - Each mood has its own motion. Content smiles and sways. Hungry frowns, looks down, licks its lips and winces at a growling stomach. Thirsty pants and swallows. Tired nods off and yawns. Exertion pants. Angry scowls with bared teeth and flared nostrils. Scared stares wide-eyed, eyes darting, trembling. Hurt screws up its face and recoils on every hit. Cold shivers with chattering teeth and puffs of breath. Sick goes green and fights nausea. Weak droops with heavy eyelids. Dead goes grey and still. It blinks and glances around.
  - Blood (it drips while you bleed), bruises, dirt, sweat, tears, rain, frost and pale, sickly, cold or flushed skin are painted on as they happen.
- **Biomes:** each island has a climate. One side is cold and holds a mountain massif, and temperature and moisture split the land into large regions. The top-left panel names the region you're in, and you get a message as you cross into a new one.
  - **Meadows:** open grass with flower patches, scattered oaks, bushes and berry bushes. Deer graze here, and it is where you start.
  - **Woodland:** dense oak woods with birch and aspen stands and an autumn maple wood, ferns and berry bushes underneath.
  - **Pine forest:** pine stands on a needle-and-grass floor, snow-dusted near the cold. Wolves and bears roam.
  - **Snowfields:** snow with rocky outcrops, snow-laden pines, dead trees and boulders. Bitterly cold and dangerous.
  - **Mountains:** rock and scree with snow on the high ridges, gold veins and boulders. Watchtowers stand here.
  - **Dry plains:** dry grass and bare earth, dead trees and boulders; slightly warmer.
  - **Coast:** sandy beaches with reeds, and palms only on the warm side.
  - Each biome has its own ground, plants and animals, and one relic is placed in each where possible. Ground textures fade into each other over several tiles in natural drifts and patches.
  - Add `?seed=123` to the page address to replay a particular island.
- **Day, night and weather:** a day lasts 8 minutes. The top-left panel shows the day, the time (AM/PM) and the weather. The weather moves between clear, fair, cloudy, overcast, rain, storm, fog, snow and windy:
  - Dark cloud shadows roll across the land, more and larger in worse weather.
  - Gusts sweep through the trees and grass. Strong wind bends them further and changes how they move, rather than speeding the animation up.
  - Grass and flowers part around you and the animals as you walk through them, then spring back.
  - Lightning can strike trees.
  - Fog shrinks your vision.
  - Snow settles on the ground.
- **Interacting:** click or tap anything to walk there and use it. A tooltip says what clicking will do. If an object has several actions (a campfire: cook meat, add a log, add a stick, warm up, demolish), a menu lets you choose. Tree stumps can be dug out with an axe (or slowly with a knife) to clear ground.
- **Combat:** aim with the mouse and right-click or press F to strike toward the cursor. Space dodges with brief invulnerability, and Shift sprints. While you fight, you keep moving at a steady, slower pace instead of stopping for each swing. Weapons: fists, stone axe, knife, club, spear, great axe, bow (arrows and fire arrows) and sling. Melee weapons differ in damage, reach, speed, stamina cost and swing arc.
- **Inventory (slot-based, like Minecraft):** 30 pack slots plus a 6-slot hotbar (keys 1–6). Items stack (logs to 20, sticks to 50, weapons to 1).
  - Click to pick up a stack and click again to place, swap or merge it. Dragging works too.
  - Right-click takes half a stack, or drops one item at a time from the stack you're holding.
  - Shift-click sends a stack across (between the pack and the hotbar, or between your pack and an open container).
  - Hover over a slot and press 1–6 to swap it into that hotbar slot. E uses the item, Q drops it.
  - On touch screens, Split and Quick move toggles do the same.
  - Storage crates hold 24 slots and shelves 18, and a Sort button tidies them.
  - When your pack is full, extra items drop in a sack on the ground that you can pick up or look through.
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
| Move items | Click / drag, right-click to split, Shift-click to quick move, hover + 1–6 to swap into the hotbar, E use, Q drop | Tap to pick up and place; Split / Quick move toggles |
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

This re-renders all 149 sprite sets and the 11 terrain textures, then writes `assets/` and `dataset/`. It needs Playwright with Chromium and takes about 8 minutes. The browser atlas is split into `assets/atlas.js` (manifest) and `assets/atlas-N.js` (images, about 5 MB each).

```bash
node tools/bake.js wolf,beacon_lit
```

This previews a subset in `/tmp/bake-preview` without writing anything to the repo.

### Hand-made art (replacing baked assets)
All 22 trees, bushes and ferns and all 11 terrain textures now use hand-made images. They replace the generated ones under the same names. Your images are kept as supplied in `assets/custom/source/`, and the game-ready versions are generated from them.

To change them, drop new images into `assets/custom/source/` and run both commands. Images go in `trees/<name>.png` plus `trees/<name>_with_shadow.png`, or `terrain/<id>.png`, at the same canvas size as the asset they replace.

```bash
python3 tools/import_custom.py
```

This step:
- Splits the shadow out of each `_with_shadow` image.
- Adds three leaf-flutter frames for wind. Frame 1 is your image unchanged, and the others shift leaf clusters by about a pixel.
- Writes everything to `assets/custom/`. It needs Pillow and NumPy.

```bash
node tools/bake.js --relink
```

This rebuilds the atlas from the files on disk in a few seconds, without re-rendering anything. A full `node tools/bake.js` always applies `assets/custom/` on top of what it renders, so a re-bake never loses your art.

Terrain keeps your textures' exact colours. Add `?snap=1` to the game URL to snap it to the 256-colour palette instead.

## Layout
| Path | Purpose |
|---|---|
| `src/style.js` | The art standard, the single source of truth |
| `src/palette.js` | 256-colour palette and quantiser |
| `src/noise.js` | Deterministic noise |
| `src/render3d.js` | Pre-render ray-marcher (camera, sun, shadows, supersampling) |
| `src/models.js` | SDF models: units with 8 weapons, creatures, buildings, ruins, structures, walls, furniture, item icons |
| `src/foliage.js` | Leaf-particle tree, bush, fern and grass renderer with wind frames |
| `src/terrainTex.js` | Tileable terrain textures |
| `src/data.js` | Items, weapons, recipes, buildable structures, creature stats, night spawn table |
| `src/weather.js` | Weather state machine, wind field, cloud shadows, rain, snow, fog, lightning |
| `src/audio.js` | Synthesised sound effects and ambience (WebAudio) |
| `src/portrait.js` | The live status portrait: a rigged, animated pixel-art face with mood animations and state overlays |
| `src/game.js` | The game: world generation, terrain rendering, survival, combat, AI, building, saving, UI |
| `tools/bake.html`, `tools/bake.js` | Asset bake pipeline and exporter (`--relink` rebuilds the atlas only) |
| `tools/import_custom.py` | Turns hand-made images in `assets/custom/source/` into game-ready sheets |
| `assets/custom/` | Hand-made replacement art (sources, generated sheets, `custom.json`) |
| `assets/` | Baked sprites, terrain, manifest and the chunked browser atlas |
| `dataset/` | style.json, palette.json, palette.pal |
