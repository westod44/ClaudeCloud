/*
 * STYLE STANDARD — single source of truth for every asset in the game.
 *
 * The art direction follows the late-90s "pre-rendered isometric RTS" look of the
 * Age of Empires II lineage. We copy no assets. We reproduce the *method*:
 *  - models are rendered in 3D with one fixed camera and one fixed sun,
 *  - then reduced to 2D sprites that use a shared 256-colour palette,
 *  - each sprite has its own translucent shadow layer,
 *  - units are rendered in 5 directions and the other 3 are mirrored,
 *  - terrain is a set of tileable textures, blended across tile borders.
 * Sources for each convention are listed in docs/ART_STYLE_GUIDE.md.
 *
 * Loaded as a plain <script> in the browser (global STYLE) and by Node via require().
 */
(function (root) {
  const STYLE = {
    meta: {
      name: 'Lantern Isles — Pre-rendered Isometric Art Standard',
      version: '1.0.0',
      lineage: 'Age of Empires II (1999) / HD (2013) / Definitive Edition (2019) visual conventions',
      principle: 'Every pixel comes from one camera, one sun, one palette.',
    },

    // ------------------------------------------------------------------ camera
    projection: {
      type: 'dimetric 2:1 (the usual "isometric" of PC strategy games)',
      cameraElevationDeg: 30,          // sin(30°)=0.5 -> diamond is exactly twice as wide as tall
      cameraAzimuthDeg: 45,            // grid axes run diagonally on screen
      orthographic: true,
      tile: { w: 128, h: 64 },         // 1x art pixels. AoE2's original SLP tile is 97x49 (odd -> centre pixel)
      worldUnit: '1 unit = 1 tile edge',
      pxPerUnit: 128 / Math.SQRT2,     // 90.51 px per world unit along screen-x
      pxPerUnitZ: (128 / Math.SQRT2) * Math.cos(Math.PI / 6), // 78.38 px per unit of height
      elevation: { levels: 7, pxPerLevel: 24, slope: 'terraced: flat plateaus joined by lit slopes' },
      axes: { i: 'screen down-right', j: 'screen down-left', z: 'up' },
      resolutionTiers: {
        standard: '1x (this standard: tile 128x64)',
        uhd: '2x (re-bake with supersample 4 and scale 2 — same models, same lighting)',
        note: 'AoE2 DE ships a separate double-resolution UHD pack; sprites are drawn at native size only at one zoom and mip-mapped otherwise.',
      },
    },

    // ---------------------------------------------------------------- rendering
    render: {
      supersample: 2,                  // 2x2 rays per pixel, then reduced -> clean pre-rendered edges
      bodyAlpha: 'binary (coverage >= 50%) — crisp sprite silhouettes, no outlines',
      outlines: false,
      shadowLayer: 'separate translucent layer, drawn under all bodies',
      quantize: 'all sprites and terrain snapped to the 256-colour palette, no dithering on sprites',
      maxSteps: 160,
    },

    // ----------------------------------------------------------------- lighting
    lighting: {
      // world direction TOWARDS the sun (x=i, y=j, z=up). Sun sits front-left of the
      // camera so lit faces are the ones facing the viewer and the left; shadows fall
      // back and to the right (up-right on screen).
      sunDir: normalize([-0.071, 0.707, 0.62]),
      sunElevationDeg: 41,
      sunColor: '#ffeccc', sunIntensity: 1.0,
      skyColor: '#a9bedf', skyIntensity: 0.64,     // cool fill from above
      bounceColor: '#7d6a48', bounceIntensity: 0.22, // warm earth bounce from below
      ambientOcclusion: 0.9,
      specular: { metal: 0.6, gold: 0.9, water: 0.5, default: 0.0 },
      shadow: { color: '#10141c', maxAlpha: 0.5, softness: 10, levels: 4 },
      terrainSlope: { flatBrightness: 1.0, litSlopeGain: 1.15, ambient: 0.42 },
    },

    // ---------------------------------------------------------------- materials
    // Earthy, slightly desaturated albedos. Each becomes a 7-step palette ramp.
    materials: {
      grass: '#6b8a3a', grassLush: '#4f7a2e', dryGrass: '#a39352', dirt: '#8a6a45',
      forestFloor: '#4b5a2a', sand: '#d2bb84', rock: '#8a857a', snow: '#e8eef2',
      shallow: '#3f8ea0', deep: '#1f4f78', leaf: '#557a2c', pine: '#2f5a35',
      bark: '#5a4330', plaster: '#d8cdb0', timber: '#4a3324', thatch: '#b8944f',
      shingle: '#6e4a38', stone: '#9a9384', wood: '#8a6440', cloth: '#8a7a60',
      skin: '#c99272', hair: '#3b2a1e', leather: '#6a4a2c', metal: '#8d939a',
      gold: '#d8ad3c', fur: '#8b5e36', wool: '#ddd6c4', fire: '#ffb040',
      berry: '#a8243a', flower: '#e0c040', spirit: '#8fe8ff',
    },
    rampSteps: [0.35, 0.52, 0.68, 0.84, 1.0, 1.16, 1.34],
    rampCool: '#202a48', rampWarm: '#fff4dc',

    // Player colours: like AoE2, one region of a unit (cloak/tunic) is tinted per player.
    playerColors: {
      blue: '#2d62d6', red: '#d0302b', green: '#3e9a2c', yellow: '#e2c22c',
      teal: '#2fb3b3', purple: '#8a3fc4', grey: '#8c8c8c', orange: '#e07a26',
    },
    playerShadeSteps: [0.6, 1.0, 1.3],

    // ------------------------------------------------------------------ terrain
    terrain: {
      texelsPerTile: 96, textureSize: 384, // each texture tiles every 4x4 tiles
      blend: 'domain-warped borders (rough) with a soft half-mix seam; water uses a continuous depth field',
      // priority like AoE2's terrain table: higher priority floods over lower at borders
      types: [
        { id: 'deep',        name: 'Deep water',   priority: 140, blend: 'smooth', walkable: false },
        { id: 'shallow',     name: 'Shallows',     priority: 139, blend: 'smooth', walkable: true },
        { id: 'sand',        name: 'Beach',        priority: 110, blend: 'smooth', walkable: true },
        { id: 'grass',       name: 'Grass',        priority: 100, blend: 'rough',  walkable: true },
        { id: 'grassLush',   name: 'Lush grass',   priority: 90,  blend: 'rough',  walkable: true },
        { id: 'dryGrass',    name: 'Dry grass',    priority: 106, blend: 'rough',  walkable: true },
        { id: 'dirt',        name: 'Dirt',         priority: 70,  blend: 'rough',  walkable: true },
        { id: 'road',        name: 'Road',         priority: 125, blend: 'spray',  walkable: true },
        { id: 'forestFloor', name: 'Forest floor', priority: 95,  blend: 'rough',  walkable: false },
        { id: 'rock',        name: 'Rocky ground', priority: 120, blend: 'rough',  walkable: true },
        { id: 'snow',        name: 'Snow',         priority: 130, blend: 'rough',  walkable: true },
      ],
    },

    // ------------------------------------------------------------------ sprites
    sprites: {
      directions: ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'],
      rendered: ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'],
      mirrored: {}, // all 8 directions are rendered so lighting and shadows stay correct (no mirroring)
      // world facing angle (radians, atan2(j,i)) for each rendered screen direction
      facing: { S: Math.PI / 4, SW: Math.PI / 2, W: 3 * Math.PI / 4, NW: Math.PI, N: 5 * Math.PI / 4, NE: 3 * Math.PI / 2, E: 7 * Math.PI / 4, SE: 0 },
      animation: {
        walk: { frames: 8, fps: 12 }, idle: { frames: 1 }, attack: { frames: 4, seconds: 0.5 }, dead: { frames: 1 }, fire: { frames: 6, fps: 10 },
        unitLayout: 'rows = 8 directions; columns: 0 idle, 1-8 walk, 9-12 attack, 13 dead',
        note: 'AoE2 originals use 10 keyframes x 5 directions per animation at 10-20 fps',
      },
      scale: { // heights in world units (tiles)
        human: 0.62, deer: 0.62, sheep: 0.38, oak: 1.55, pine: 1.75, palm: 1.6,
        cottage: 1.35, tower: 2.5, windmill: 2.3, column: 0.6, wolf: 0.5, boar: 0.42, hollow: 0.72, hollowBrute: 1.0,
        icons: 'items rendered at 3x scale, body layer only',
      },
      anchor: 'world origin (ground contact / footprint centre) — stored per asset in pixels',
      layers: ['body', 'shadow'],
    },

    fog: { unexplored: '#000000', exploredColor: '#05070a', exploredAlpha: 0.48, visionRadiusTiles: 7 },

    ui: {
      font: 'Cinzel', fontBody: 'Alegreya Sans',
      panel: '#2b2219', panelDark: '#17120d', border: '#b08a3e', borderDark: '#5b4524',
      text: '#f1e3c0', accent: '#ffd36a',
    },
  };

  function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]); return v.map(x => x / l); }

  if (typeof module !== 'undefined' && module.exports) module.exports = STYLE;
  else root.STYLE = STYLE;
})(typeof window !== 'undefined' ? window : globalThis);
