/*
 * Lantern Isles — Survival.
 * An original survival game on the pre-rendered isometric art standard:
 * gather, craft, build, hunt, and survive the nights against the Hollows.
 * Requires: style.js, palette.js, noise.js, assets/atlas.js
 */
(function () {
  'use strict';
  const S = STYLE, A = ATLAS, NZ = NOISE;
  const { fbm2, noise2, hash, rng, clamp } = NZ;
  const HWp = S.projection.tile.w / 2, HHp = S.projection.tile.h / 2, ZPX = S.projection.elevation.pxPerLevel;
  const LV_UNITS = ZPX / S.projection.pxPerUnitZ;
  const N = 96, MAXLV = 7, CH = 128;
  const DAY_SECONDS = 480;
  const SAVE_KEY = 'lantern-isles-survival-v1';
  const $ = id => document.getElementById(id);
  const TYPES = {}; S.terrain.types.forEach((t, k) => { TYPES[t.id] = k; t.k = k; });
  const TT = S.terrain.types;
  const isWater = k => k === TYPES.deep || k === TYPES.shallow;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  // ================================================================== game data
  const ITEMS = {
    log: { name: 'Log', max: 12 }, stick: { name: 'Stick', max: 40 }, stone: { name: 'Stone', max: 30 }, fiber: { name: 'Plant fiber', max: 40 },
    rope: { name: 'Rope', max: 15 }, hide: { name: 'Hide', max: 12 }, cloth: { name: 'Cloth', max: 12 }, relic: { name: 'Relic', max: 8 },
    berries: { name: 'Berries', max: 20, eat: { hunger: 9, thirst: 4 }, verb: 'Eat' },
    meat_raw: { name: 'Raw meat', max: 10, eat: { hunger: 12, hp: -8 }, verb: 'Eat raw', note: 'Cook it at a campfire.' },
    meat_cooked: { name: 'Cooked meat', max: 10, eat: { hunger: 38, hp: 6 }, verb: 'Eat' },
    herb: { name: 'Herb', max: 20, eat: { hp: 4 }, verb: 'Chew' },
    salve: { name: 'Herbal salve', max: 6, eat: { hp: 40 }, verb: 'Apply' },
    bandage: { name: 'Bandage', max: 8, eat: { hp: 18 }, verb: 'Apply' },
    arrow: { name: 'Arrow', max: 40 },
    axe: { name: 'Stone axe', max: 1, weapon: 'axe', verb: 'Equip' }, spear: { name: 'Spear', max: 1, weapon: 'spear', verb: 'Equip' }, bow: { name: 'Bow', max: 1, weapon: 'bow', verb: 'Equip' },
    torch: { name: 'Torch', max: 6, verb: 'Light' }, waterskin: { name: 'Waterskin', max: 3, verb: 'Drink' }, armor: { name: 'Hide armor', max: 1, verb: 'Wear' },
  };
  const WEAPONS = {
    fists: { name: 'Fists', dmg: 7, reach: 1.0, cd: 0.55, stam: 5, asset: 'explorer' },
    axe: { name: 'Stone axe', dmg: 17, reach: 1.15, cd: 0.62, stam: 8, asset: 'explorer_axe' },
    spear: { name: 'Spear', dmg: 27, reach: 1.6, cd: 0.75, stam: 11, asset: 'explorer_spear' },
    bow: { name: 'Bow', dmg: 32, reach: 7.5, cd: 0.95, stam: 5, asset: 'explorer_bow', ranged: true },
  };
  const RECIPES = [
    { out: 'rope', n: 1, cost: { fiber: 3 }, desc: 'Twisted plant fiber.' },
    { out: 'axe', n: 1, cost: { stick: 2, stone: 2, rope: 1 }, desc: 'Fells trees. A decent weapon.' },
    { out: 'spear', n: 1, cost: { stick: 3, stone: 1, rope: 1 }, desc: 'Long reach, heavy damage.' },
    { out: 'bow', n: 1, cost: { stick: 3, rope: 2 }, desc: 'Shoot from a distance. Needs arrows.' },
    { out: 'arrow', n: 5, cost: { stick: 3, stone: 1 }, desc: 'Five arrows.' },
    { out: 'torch', n: 1, cost: { stick: 1, fiber: 2 }, desc: 'Burns ~2.5 minutes. Hollows fear its light.' },
    { out: 'bandage', n: 1, cost: { cloth: 1, herb: 1 }, desc: 'Heals 18.' },
    { out: 'salve', n: 1, cost: { herb: 3 }, desc: 'Heals 40.' },
    { out: 'waterskin', n: 1, cost: { hide: 2, rope: 1 }, desc: 'Carries 3 drinks. Fill at water.' },
    { out: 'armor', n: 1, cost: { hide: 4, rope: 2 }, desc: 'Absorbs 40% of damage until worn out.' },
  ];
  const STRUCTS = {
    campfire: { name: 'Campfire', asset: 'campfire', cost: { stick: 4, stone: 3 }, hp: 80, desc: 'Light, warmth and cooking. Needs fuel.' },
    standing_torch: { name: 'Standing torch', asset: 'standing_torch', cost: { stick: 3, fiber: 2 }, hp: 40, desc: 'A small, lasting light.', repeat: true },
    lean_to: { name: 'Lean-to', asset: 'lean_to', cost: { log: 5, stick: 6, fiber: 4 }, hp: 150, desc: 'Sleep through the night and save.' },
    cabin: { name: 'Log cabin', asset: 'cabin', cost: { log: 16, stone: 8, rope: 2 }, hp: 500, desc: 'A sturdy home. Sleeping here heals you.' },
    palisade: { name: 'Palisade', asset: 'palisade', cost: { log: 2 }, hp: 160, desc: 'Wall block. Hollows must break through.', repeat: true },
    spike_trap: { name: 'Spike trap', asset: 'spike_trap', cost: { stick: 5, log: 1 }, hp: 60, desc: 'Wounds creatures that step on it.', repeat: true },
    crate: { name: 'Storage crate', asset: 'crate', cost: { log: 4 }, hp: 80, desc: 'Store materials.' },
    rain_collector: { name: 'Rain collector', asset: 'rain_collector', cost: { log: 3, hide: 1 }, hp: 60, desc: 'Collects drinking water, faster in rain.' },
    beacon: { name: 'Signal beacon', asset: 'beacon', cost: { log: 12, stone: 8, relic: 8 }, hp: 400, desc: 'Light it and survive until dawn to be rescued.' },
  };
  const KINDS = {
    deer: { asset: 'deer', hp: 30, speed: 3.0, flee: 3.6, loot: { meat_raw: 3, hide: 2 } },
    sheep: { asset: 'sheep', hp: 22, speed: 1.1, flee: 2.0, loot: { meat_raw: 2, cloth: 1 } },
    wolf: { asset: 'wolf', hp: 45, speed: 3.0, dmg: 8, reach: 0.95, cd: 1.0, aggro: 3.5, nightAggro: 7, fear: 1, loot: { meat_raw: 1, hide: 1 }, hostile: true },
    boar: { asset: 'boar', hp: 55, speed: 2.5, dmg: 11, reach: 0.95, cd: 1.25, aggro: 1.3, loot: { meat_raw: 3, hide: 2 }, hostile: true },
    hollow: { asset: 'hollow', hp: 60, speed: 2.35, dmg: 10, reach: 1.0, cd: 1.1, fear: 1, structDmg: 14, hostile: true, night: true },
    brute: { asset: 'hollow_brute', hp: 170, speed: 1.9, dmg: 24, reach: 1.25, cd: 1.6, fear: 0.4, structDmg: 40, hostile: true, night: true },
  };

  // ================================================================== assets
  const SPR = {}, TEX = {}, ICON = {};
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  async function loadAssets(progress) {
    const list = A.manifest.assets; let n = 0; const total = list.length + A.manifest.terrain.length;
    await Promise.all(list.map(async a => {
      SPR[a.name] = Object.assign({}, a, { img: await loadImg(A.images[a.name]), sh: A.images[a.name + '_shadow'] ? await loadImg(A.images[a.name + '_shadow']) : null });
      if (a.name.startsWith('icon_')) ICON[a.name.slice(5)] = A.images[a.name];
      progress(++n / total);
    }));
    for (const t of A.manifest.terrain) {
      const img = await loadImg(A.images['terrain_' + t.id]); const c = document.createElement('canvas'); c.width = c.height = t.size;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); TEX[TYPES[t.id]] = new Uint32Array(x.getImageData(0, 0, t.size, t.size).data.buffer);
      progress(++n / total);
    }
  }
  const TS = S.terrain.textureSize, TPT = S.terrain.texelsPerTile;

  // ================================================================== world state
  const type = new Uint8Array(N * N), lvl = new Float32Array(N * N), Hv = new Float32Array((N + 1) * (N + 1));
  const waterDist = new Float32Array(N * N), landDist = new Float32Array(N * N);
  const blocked = new Uint8Array(N * N), explored = new Uint8Array(N * N), visible = new Uint8Array(N * N);
  const idx = (i, j) => i * N + j, inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  let objects = [], units = [], sites = [], baseObjCount = 0;
  let start = [N / 2, N / 2], seed = 1;
  const G = { day: 1, tod: 0.1, rain: false, rainT: 200, beacon: null, won: false, started: false, paused: false, spawnT: 5, animalT: 30, hollowsKilled: 0, beaconNight: false };

  const bw = new Float32Array(4), cw = new Float32Array(4);
  function bspl(t, o) { const t2 = t * t, t3 = t2 * t; o[0] = (1 - 3 * t + 3 * t2 - t3) / 6; o[1] = (4 - 6 * t2 + 3 * t3) / 6; o[2] = (1 + 3 * t + 3 * t2 - 3 * t3) / 6; o[3] = t3 / 6; }
  function hAt(x, y) {
    x = clamp(x, 0, N - 0.001); y = clamp(y, 0, N - 0.001);
    const xi = x | 0, yi = y | 0; bspl(x - xi, bw); bspl(y - yi, cw);
    let h = 0;
    for (let a = 0; a < 4; a++) { const vx = clamp(xi - 1 + a, 0, N) * (N + 1); let r = 0; for (let b = 0; b < 4; b++) r += cw[b] * Hv[vx + clamp(yi - 1 + b, 0, N)]; h += bw[a] * r; }
    return h;
  }
  function bfsDist(srcFn, out) {
    out.fill(1e9); const q = [];
    for (let k = 0; k < N * N; k++) if (srcFn(k)) { out[k] = 0; q.push(k); }
    for (let h = 0; h < q.length; h++) { const k = q[h], i = k / N | 0, j = k % N;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + a, nj = j + b; if (!inMap(ni, nj)) continue; const nk = idx(ni, nj); if (out[nk] > out[k] + 1) { out[nk] = out[k] + 1; q.push(nk); } } }
  }

  // ================================================================== world generation
  function genWorld(sd) {
    seed = sd; const R = rng(sd);
    objects = []; units = []; sites = []; blocked.fill(0); explored.fill(0); visible.fill(0); type.fill(0); lvl.fill(0);
    const E = new Float32Array(N * N), moist = new Float32Array(N * N), forestN = new Float32Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = i / N - 0.5, y = j / N - 0.5, d = Math.hypot(x, y) * 2;
      E[idx(i, j)] = fbm2(i / 16, j / 16, 1e5, sd, 5) * 0.95 + fbm2(i / 6, j / 6, 1e5, sd + 3, 3) * 0.12 - d * d * 0.95 + 0.32;
      moist[idx(i, j)] = fbm2(i / 12 + 50, j / 12, 1e5, sd + 7, 4);
      forestN[idx(i, j)] = fbm2(i / 7, j / 7, 1e5, sd + 11, 4);
    }
    const WL = 0.36;
    for (let k = 0; k < N * N; k++) {
      if (E[k] < WL) { lvl[k] = 0; type[k] = TYPES.deep; continue; }
      type[k] = TYPES.grass;
      const l = (E[k] - WL) / 0.075, f = Math.floor(l), fr = l - f;
      lvl[k] = clamp(f + NZ.smooth(clamp((fr - 0.3) / 0.4, 0, 1)), 0.25, MAXLV);
    }
    bfsDist(k => !isWater(type[k]), waterDist);
    bfsDist(k => isWater(type[k]), landDist);
    for (let k = 0; k < N * N; k++) {
      if (isWater(type[k])) { type[k] = waterDist[k] <= 2 ? TYPES.shallow : TYPES.deep; continue; }
      const L = lvl[k], m = moist[k], i = k / N | 0, j = k % N;
      let t = m < 0.42 ? TYPES.dryGrass : m > 0.6 ? TYPES.grassLush : TYPES.grass;
      if (fbm2(i / 5, j / 5, 1e5, sd + 21, 3) > 0.66) t = TYPES.dirt;
      if (landDist[k] <= 1 && L < 1.6) t = TYPES.sand;
      else if (landDist[k] <= 2 && L < 1.2 && m < 0.5) t = TYPES.sand;
      const rn = fbm2(i / 4, j / 4, 1e5, sd + 31, 3);
      if (L >= 6.6 + rn * 0.6) t = TYPES.snow; else if (L >= 5.3 + rn * 0.8) t = TYPES.rock; else if (L >= 4.2 && t !== TYPES.dirt) t = TYPES.dryGrass;
      else if (t !== TYPES.sand && forestN[k] > 0.55 && L < 4.4) t = TYPES.forestFloor;
      type[k] = t;
    }
    computeVertices();
    let best = 1e9;
    for (let i = 8; i < N - 8; i++) for (let j = 8; j < N - 8; j++) {
      const k = idx(i, j); if (type[k] !== TYPES.grass && type[k] !== TYPES.grassLush) continue;
      let cold = 0; for (let a = -6; a <= 6; a += 2) for (let b = -6; b <= 6; b += 2) if (inMap(i + a, j + b) && (type[idx(i + a, j + b)] === TYPES.snow || type[idx(i + a, j + b)] === TYPES.rock)) cold++;
      const d = Math.hypot(i - N / 2, j - N / 2) * 0.6 + lvl[k] * 5 + cold * 4 + (landDist[k] < 4 ? 6 : 0); if (d < best) { best = d; start = [i, j]; }
    }
    placeWorld(sd, R);
    computeVertices();
    objects.forEach((o, n) => { o.id = n; }); baseObjCount = objects.length;
  }
  function computeVertices() {
    for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) {
      let s = 0, c = 0, wet = false;
      for (const [di, dj] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) { const i = a + di, j = b + dj; if (!inMap(i, j)) { wet = true; continue; } const k = idx(i, j); if (isWater(type[k])) wet = true; s += lvl[k]; c++; }
      Hv[a * (N + 1) + b] = wet ? 0 : s / c;
    }
  }
  function flatten(ci, cj, r) {
    const L0 = lvl[idx(ci, cj)];
    for (let i = ci - r - 2; i <= ci + r + 2; i++) for (let j = cj - r - 2; j <= cj + r + 2; j++) {
      if (!inMap(i, j)) continue; const k = idx(i, j); if (isWater(type[k])) continue;
      const d = Math.hypot(i - ci, j - cj), t = clamp((d - r) / 2.5, 0, 1); lvl[k] = L0 + (lvl[k] - L0) * t;
    }
  }
  function addObj(asset, x, y, extra = {}) {
    const a = SPR[asset]; const o = Object.assign({ asset, x, y, fp: a.footprint, blocks: a.blocks }, extra);
    objects.push(o);
    if (o.blocks) setBlock(o, 1);
    return o;
  }
  function setBlock(o, v) { for (const [i, j] of fpTiles(o)) blocked[idx(i, j)] = v; }
  function fpTiles(o) {
    const [w, h] = o.fp, i0 = Math.round(o.x - w / 2), j0 = Math.round(o.y - h / 2), out = [];
    for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) if (inMap(i, j)) out.push([i, j]);
    return out;
  }
  function freeFor(x, y, fp, allowForest) {
    const [w, h] = fp, i0 = Math.round(x - w / 2), j0 = Math.round(y - h / 2);
    for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) {
      if (!inMap(i, j)) return false; const k = idx(i, j);
      if (blocked[k] || isWater(type[k]) || (!allowForest && type[k] === TYPES.forestFloor)) return false;
    }
    return true;
  }
  function flatness(ci, cj, r) { let mn = 99, mx = -99; for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { if (!inMap(i, j)) return 99; const k = idx(i, j); if (isWater(type[k])) return 99; mn = Math.min(mn, lvl[k]); mx = Math.max(mx, lvl[k]); } return mx - mn; }
  function clearArea(ci, cj, r, to) { for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) if (inMap(i, j) && Math.hypot(i - ci, j - cj) <= r + 0.5) { const k = idx(i, j); if (type[k] === TYPES.forestFloor || type[k] === TYPES.rock || type[k] === TYPES.snow) type[k] = to; } }
  function pickSites(count, minDist, test, avoid, R) {
    const out = [];
    for (let n = 0; n < count; n++) {
      let best = null, bs = -1;
      for (let t = 0; t < 900; t++) {
        const i = 6 + (R() * (N - 12) | 0), j = 6 + (R() * (N - 12) | 0); if (!test(i, j)) continue;
        let s = 1e9; for (const p of avoid.concat(out)) s = Math.min(s, Math.hypot(i - p[0], j - p[1]));
        if (s > bs) { bs = s; best = [i, j]; }
      }
      if (best && bs >= minDist) out.push(best);
    }
    return out;
  }
  const VILLAGE_NAMES = ['Ashford', 'Brackenmoor', 'Willowmere', 'Thornby', 'Eastwick'];
  const RUIN_NAMES = ['the Old Colonnade', 'Gloamstone Circle', 'the Broken Gate', 'the Pale Steps'];

  function placeWorld(sd, R) {
    const avoid = [start];
    const grassy = k => k === TYPES.grass || k === TYPES.grassLush || k === TYPES.dryGrass;
    clearArea(start[0], start[1], 3, TYPES.grass);
    addObj('campfire_out', start[0] + 1.5, start[1] + 1.5, { struct: 'campfire', fuel: 0, hp: 80, world: true });
    // abandoned villages
    const vs = pickSites(3, 15, (i, j) => grassy(type[idx(i, j)]) && flatness(i, j, 5) < 2.2 && lvl[idx(i, j)] < 3.6 && Math.hypot(i - start[0], j - start[1]) > 13, avoid, R);
    vs.forEach((v, n) => {
      const [ci, cj] = v; clearArea(ci, cj, 7, TYPES.grass); flatten(ci, cj, 6);
      sites.push({ kind: 'village', name: 'the abandoned village of ' + VILLAGE_NAMES[n], i: ci, j: cj, found: false });
      const put = (asset, dx, dy, extra) => { const fp = SPR[asset].footprint; const x = ci + dx + (fp[0] % 2 ? 0.5 : 0), y = cj + dy + (fp[1] % 2 ? 0.5 : 0); if (freeFor(x, y, fp, true)) return addObj(asset, x, y, extra); };
      put('well', 0, 0);
      put('cottage_thatch', -3, -2, { search: true }); put('cottage_timber', 3, -3, { search: true }); put(n % 2 ? 'cottage_timber' : 'cottage_thatch', -2, 4, { search: true }); put('cottage_thatch', 4, 2, { search: true });
      put('market_stall', 2, 0, { search: true }); put('campfire_out', -2, 1, { struct: 'campfire', fuel: 0, hp: 80, world: true }); put('windmill', -5, -5); put('signpost', 1, 3);
      for (let k = 0; k < 3; k++) addUnit('sheep', ci + 6 + R() * 2, cj - 1 + R() * 3, { home: [ci + 7, cj] });
      avoid.push(v);
    });
    const hubs = [start].concat(vs);
    for (let k = 1; k < hubs.length; k++) buildRoad(hubs[k - 1], hubs[k]);
    // ruins with relic shrines
    const rs = pickSites(4, 13, (i, j) => !isWater(type[idx(i, j)]) && flatness(i, j, 3) < 2 && Math.hypot(i - start[0], j - start[1]) > 12, avoid, R);
    const shrinePos = [];
    rs.forEach((r, n) => {
      const [ci, cj] = r; clearArea(ci, cj, 4, TYPES.dirt); flatten(ci, cj, 3);
      for (let i = ci - 4; i <= ci + 4; i++) for (let j = cj - 4; j <= cj + 4; j++) if (inMap(i, j) && !isWater(type[idx(i, j)]) && Math.hypot(i - ci, j - cj) + (noise2(i / 2.5, j / 2.5, 1e5, sd + n) - 0.5) * 4 < 3.2) type[idx(i, j)] = TYPES.road;
      sites.push({ kind: 'ruin', name: RUIN_NAMES[n], i: ci, j: cj, found: false });
      const tryPut = (asset, x, y) => { if (freeFor(x, y, SPR[asset].footprint, true)) return addObj(asset, x, y); };
      if (n === 1) { for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; tryPut('standing_stone_' + (1 + k % 3), ci + 0.5 + Math.round(Math.cos(a) * 3), cj + 0.5 + Math.round(Math.sin(a) * 3)); } }
      else {
        tryPut('ruin_arch', ci, cj - 2.5); tryPut('ruin_wall_' + (1 + n % 2), ci - 3, cj + 0.5); tryPut('ruin_wall_1', ci + 3, cj + 2.5);
        for (let k = 0; k < 4; k++) tryPut('column_' + (1 + k % 3), ci + 0.5 + [-2, 2, -2, 2][k], cj + 0.5 + [-1, -1, 2, 2][k] + 1);
        tryPut('column_fallen_' + (1 + n % 2), ci + 1.5, cj + 3.5);
      }
      shrinePos.push([ci + 0.5, cj + 0.5]);
    });
    const remote = pickSites(8 - shrinePos.length, 10, (i, j) => { const k = idx(i, j); return !isWater(type[k]) && type[k] !== TYPES.forestFloor && !blocked[k] && Math.hypot(i - start[0], j - start[1]) > 12; }, avoid.concat(rs), R);
    remote.forEach(p => shrinePos.push([p[0] + 0.5, p[1] + 0.5]));
    for (const [x, y] of shrinePos) { const k = idx(x | 0, y | 0); if (type[k] === TYPES.forestFloor) type[k] = TYPES.dirt; addObj('shrine_lit', x, y, { relic: true }); }
    const ts = pickSites(3, 14, (i, j) => { const k = idx(i, j); return lvl[k] >= 3.5 && type[k] !== TYPES.forestFloor && !blocked[k]; }, avoid.concat(rs), R);
    ts.forEach(t => { addObj('watchtower', t[0] + 0.5, t[1] + 0.5); sites.push({ kind: 'tower', name: 'a watchtower', i: t[0], j: t[1], found: false }); });
    // forests
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = idx(i, j); if (type[k] !== TYPES.forestFloor || blocked[k]) continue;
      const L = lvl[k], r = hash(i, j, sd + 1);
      const asset = L >= 2.8 ? (r < 0.75 ? 'pine_' + (1 + (r * 4 | 0) % 3) : 'oak_3') : (r < 0.15 ? 'birch_' + (1 + (r * 20 | 0) % 2) : r < 0.25 ? 'pine_1' : 'oak_' + (1 + (r * 37 | 0) % 4));
      addObj(asset, i + 0.5 + (hash(i, j, 3) - 0.5) * 0.3, j + 0.5 + (hash(i, j, 4) - 0.5) * 0.3);
    }
    // scattered nature & resources (denser near the start so the first day is playable)
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = idx(i, j); if (blocked[k] || isWater(type[k])) continue;
      if (Math.abs(i - start[0]) <= 1 && Math.abs(j - start[1]) <= 1) continue;
      const t = type[k], r = hash(i, j, sd + 5), x = i + 0.5 + (hash(i, j, 6) - 0.5) * 0.4, y = j + 0.5 + (hash(i, j, 7) - 0.5) * 0.4;
      const nearForest = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inMap(i + a, j + b) && type[idx(i + a, j + b)] === TYPES.forestFloor);
      const nearStart = Math.hypot(i - start[0], j - start[1]) < 9 ? 1.8 : 1;
      if (t === TYPES.rock || t === TYPES.snow) {
        if (r < 0.07) addObj('boulder_' + (1 + (r * 100 | 0) % 3), x, y); else if (r < 0.09) addObj('stone_pile', x, y); else if (r < 0.105) addObj(r < 0.1 ? 'gold_vein' : 'gold_boulder', x, y); else if (r < 0.16 && t === TYPES.rock) addObj('pine_' + (1 + (r * 300 | 0) % 3), x, y);
      } else if (t === TYPES.sand) {
        if (r < 0.03) addObj('palm_' + (1 + (r * 100 | 0) % 2), x, y); else if (r < 0.045) addObj('boulder_2', x, y); else if (r < 0.07) addObj('grass_tuft_dry', x, y);
        if (landDist[k] <= 1 && r > 0.85) addObj('reeds', x, y);
      } else if (t !== TYPES.road) {
        if (nearForest && r < 0.07) addObj(r < 0.03 ? 'berry_bush' : 'bush_' + (1 + (r * 100 | 0) % 2), x, y);
        else if (r < 0.008 * nearStart) addObj('boulder_' + (1 + (r * 1000 | 0) % 3), x, y);
        else if (r < 0.011 * nearStart && t === TYPES.dryGrass) addObj('dead_tree', x, y);
        else if (r < 0.014 * nearStart) addObj('stone_pile', x, y);
        else if (r < 0.034 * nearStart) addObj('bush_' + (1 + (r * 100 | 0) % 2), x, y);
        else if (r < 0.042 * nearStart) addObj('berry_bush', x, y);
        else if (r < 0.07 * nearStart) addObj(['flowers_yellow', 'flowers_white', 'flowers_purple'][(r * 1000 | 0) % 3], x, y);
        else if (r < 0.14 * nearStart) addObj(t === TYPES.dryGrass ? 'grass_tuft_dry' : 'grass_tuft', x, y);
        else if (r > 0.994 && !nearForest) addObj('oak_' + (1 + (r * 10000 | 0) % 2), x, y);
      }
    }
    const cs = pickSites(14, 6, (i, j) => { const k = idx(i, j); return !isWater(type[k]) && !blocked[k] && type[k] !== TYPES.forestFloor; }, avoid, R);
    cs.forEach(c => addObj('chest', c[0] + 0.5, c[1] + 0.5, { chest: true }));
    ensureReachable();
    spawnWildlife(R, true);
  }
  function spawnWildlife(R, initial) {
    const far = (i, j, d) => Math.hypot(i - start[0], j - start[1]) > d;
    const grassOk = (i, j) => { const k = idx(i, j); return (type[k] === TYPES.grass || type[k] === TYPES.grassLush || type[k] === TYPES.dryGrass) && !blocked[k]; };
    const count = k => units.filter(u => u.kind === k && !u.dead).length;
    const herds = pickSites(initial ? 6 : count('deer') < 16 ? 1 : 0, 8, (i, j) => grassOk(i, j) && far(i, j, 8), [], R);
    herds.forEach(h => { for (let k = 0; k < 3 + (R() * 2 | 0); k++) addUnit('deer', h[0] + 0.5 + (R() - 0.5) * 2, h[1] + 0.5 + (R() - 0.5) * 2, { home: [h[0] + 0.5, h[1] + 0.5] }); });
    const packs = pickSites(initial ? 4 : count('wolf') < 9 ? 1 : 0, 14, (i, j) => grassOk(i, j) && far(i, j, 16) && [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([a, b]) => inMap(i + a, j + b) && type[idx(i + a, j + b)] === TYPES.forestFloor), [], R);
    packs.forEach(h => { for (let k = 0; k < 2 + (R() * 2 | 0); k++) addUnit('wolf', h[0] + 0.5 + (R() - 0.5) * 2, h[1] + 0.5 + (R() - 0.5) * 2, { home: [h[0] + 0.5, h[1] + 0.5] }); });
    const boars = pickSites(initial ? 7 : count('boar') < 8 ? 1 : 0, 8, (i, j) => grassOk(i, j) && far(i, j, 10), [], R);
    boars.forEach(h => addUnit('boar', h[0] + 0.5, h[1] + 0.5, { home: [h[0] + 0.5, h[1] + 0.5] }));
  }
  function ensureReachable() {
    const reach = () => { const seen = new Uint8Array(N * N), q = [idx(start[0], start[1])]; seen[q[0]] = 1; for (let h = 0; h < q.length; h++) { const i = q[h] / N | 0, j = q[h] % N; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + a, nj = j + b; if (!inMap(ni, nj)) continue; const k = idx(ni, nj); if (!seen[k] && walkCost(k)) { seen[k] = 1; q.push(k); } } } return seen; };
    const removable = o => !o.relic && !o.chest && !o.struct && (SPR[o.asset].category === 'nature' || SPR[o.asset].category === 'resource');
    for (const o of objects.filter(o => o.relic || o.chest || o.asset === 'watchtower' || o.search)) {
      const seen = reach(), i0 = Math.floor(o.x), j0 = Math.floor(o.y);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([a, b]) => inMap(i0 + a, j0 + b) && seen[idx(i0 + a, j0 + b)])) continue;
      const cost = k => type[k] === TYPES.deep ? 0 : 1 + (blocked[k] ? 4 : 0);
      const path = astar(start[0], start[1], i0, j0, cost); if (!path) continue;
      for (const [i, j] of path.slice(0, -1)) {
        const k = idx(i, j); if (!blocked[k]) continue;
        for (const ob of objects) if (!ob.gone && removable(ob) && fpTiles(ob).some(([a, b]) => a === i && b === j)) { ob.gone = true; setBlock(ob, 0); }
        if (type[k] === TYPES.forestFloor) type[k] = TYPES.dirt;
      }
    }
    for (let k = objects.length - 1; k >= 0; k--) if (objects[k].gone) objects.splice(k, 1);
  }
  function buildRoad(a, b) {
    const cost = k => { const t = type[k]; if (isWater(t)) return 0; return 1 + (t === TYPES.forestFloor ? 6 : 0) + (blocked[k] ? 30 : 0) + (t === TYPES.road ? -0.6 : 0); };
    const path = astar(a[0], a[1], b[0], b[1], cost); if (!path) return;
    for (const [i, j] of path) for (const [p, q] of [[0, 0], [1, 0], [0, 1]]) { if (!inMap(i + p, j + q)) continue; const k = idx(i + p, j + q); if (!isWater(type[k]) && (p + q === 0 || hash(i + p, j + q, 9) < 0.55)) type[k] = TYPES.road; }
  }

  // ================================================================== pathfinding
  function astar(si, sj, ti, tj, costFn, maxNodes = 1e9) {
    const g = new Float32Array(N * N).fill(1e9), prev = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
    const heap = []; const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const s = idx(si, sj), t = idx(ti, tj); g[s] = 0; push(s, 0); let n = 0;
    const hfn = (i, j) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    while (heap.length) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === t) break; if (++n > maxNodes) return null;
      const i = k / N | 0, j = k % N;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue; const ni = i + a, nj = j + b; if (!inMap(ni, nj)) continue; const nk = idx(ni, nj);
        const c = costFn(nk); if (!c) continue;
        if (a && b && (!costFn(idx(i + a, j)) || !costFn(idx(i, j + b)))) continue;
        const ng = g[k] + c * (a && b ? 1.414 : 1);
        if (ng < g[nk]) { g[nk] = ng; prev[nk] = k; push(nk, ng + hfn(ni, nj)); }
      }
    }
    if (prev[t] < 0 && s !== t) return null;
    const path = []; for (let k = t; k !== s; k = prev[k]) path.push([k / N | 0, k % N]); path.push([si, sj]); return path.reverse();
  }
  const walkCost = k => type[k] === TYPES.deep || blocked[k] ? 0 : 1;
  function walkableAt(x, y) { const i = Math.floor(x), j = Math.floor(y); if (!inMap(i, j)) return false; return walkCost(idx(i, j)) > 0; }
  function los(x0, y0, x1, y1) { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2); for (let s = 1; s <= n; s++) { const t = s / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (!walkableAt(x, y) || !walkableAt(x + 0.18, y) || !walkableAt(x - 0.18, y) || !walkableAt(x, y + 0.18) || !walkableAt(x, y - 0.18)) return false; } return true; }
  function findPath(u, tx, ty, maxNodes) {
    const si = Math.floor(u.x), sj = Math.floor(u.y), ti = Math.floor(tx), tj = Math.floor(ty);
    if (!inMap(ti, tj) || !walkCost(idx(ti, tj)) || !inMap(si, sj)) return null;
    const p = astar(si, sj, ti, tj, walkCost, maxNodes); if (!p) return null;
    const pts = p.map(([i, j]) => [i + 0.5, j + 0.5]); pts[pts.length - 1] = [tx, ty];
    const out = []; let cur = [u.x, u.y], k = 0;
    while (k < pts.length) { let far = k; for (let m = Math.min(pts.length - 1, k + 12); m > k; m--) if (los(cur[0], cur[1], pts[m][0], pts[m][1])) { far = m; break; } out.push(pts[far]); cur = pts[far]; k = far + 1; }
    return out;
  }
  // nearest walkable spot next to an object (for blocking objects like trees and houses)
  function approachPoint(o, from) {
    if (!o.blocks && walkableAt(o.x, o.y)) return [o.x, o.y];
    let best = null, bd = 1e9; const tiles = fpTiles(o);
    for (const [i, j] of tiles) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const x = i + a + 0.5, y = j + b + 0.5; if (!walkableAt(x, y)) continue;
      const d = Math.hypot(x - from.x, y - from.y); if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  }

  // ================================================================== units
  function addUnit(kind, x, y, extra = {}) {
    if (!walkableAt(x, y)) { const i = Math.floor(x), j = Math.floor(y); let ok = false; for (let r = 1; r < 4 && !ok; r++) for (let a = -r; a <= r && !ok; a++) for (let b = -r; b <= r && !ok; b++) if (walkableAt(i + a + 0.5, j + b + 0.5)) { x = i + a + 0.5; y = j + b + 0.5; ok = true; } if (!ok) return null; }
    const K = KINDS[kind] || {};
    const u = Object.assign({ kind, asset: K.asset || kind, x, y, dir: (Math.random() * 8) | 0, moving: false, path: [], walkT: Math.random() * 3, wait: Math.random() * 4, speed: K.speed || 2.6, unit: true,
      hp: K.hp || 100, maxHp: K.hp || 100, cd: 0, repath: 0, hurtT: 0, aggroT: 0, braveT: rand(3, 8), brave: false, fade: 1, home: [x, y] }, extra);
    units.push(u); return u;
  }
  const DIRS = S.sprites.directions;
  function dirFromVec(dx, dy) {
    const sx = (dx - dy) * HWp, sy = (dx + dy) * HHp * 2, a = Math.atan2(sy, sx);
    const sectors = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    return DIRS.indexOf(sectors[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]);
  }
  function face(u, t) { u.dir = dirFromVec(t.x - u.x, t.y - u.y); }
  function stepUnit(u, dt, speedMul = 1) {
    if (u.path.length) {
      const [tx, ty] = u.path[0], dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
      const sp = u.speed * speedMul * dt;
      if (d <= sp) { u.x = tx; u.y = ty; u.path.shift(); }
      else { const nx = u.x + dx / d * sp, ny = u.y + dy / d * sp; if (walkableAt(nx, ny)) { u.x = nx; u.y = ny; } else u.path = []; u.dir = dirFromVec(dx, dy); }
      u.moving = u.path.length > 0; u.walkT += dt * speedMul;
    } else u.moving = false;
  }

  // ================================================================== player & inventory
  let P = null; // player unit
  const inv = {};
  function newPlayerState() {
    for (const k of Object.keys(inv)) delete inv[k];
    Object.assign(inv, { berries: 3, stick: 2 });
    Object.assign(P, { hunger: 100, thirst: 100, stamina: 100, energy: 100, weapon: 'fists', armorHP: 0, torchT: 0, torchOn: false, water: 0, task: null, swing: null, dead: false, warn: {} });
  }
  function have(cost) { return Object.entries(cost).every(([k, n]) => (inv[k] || 0) >= n); }
  function pay(cost) { for (const [k, n] of Object.entries(cost)) { inv[k] -= n; if (inv[k] <= 0) delete inv[k]; } }
  function addItem(k, n, quiet) {
    const cur = inv[k] || 0, room = ITEMS[k].max - cur, add = Math.min(room, n);
    if (add > 0) { inv[k] = cur + add; if (!quiet) floatText(P.x, P.y, `+${add} ${ITEMS[k].name}`, '#ffe9a8'); }
    if (add < n && !quiet) message(`You can't carry more ${ITEMS[k].name.toLowerCase()}.`);
    refreshUI(); return add;
  }
  function useItem(k) {
    const it = ITEMS[k]; if (!it || !inv[k]) return;
    if (it.eat) {
      const e = it.eat; P.hunger = clamp(P.hunger + (e.hunger || 0), 0, 100); P.thirst = clamp(P.thirst + (e.thirst || 0), 0, 100);
      if (e.hp) { if (e.hp > 0) P.hp = Math.min(P.maxHp, P.hp + e.hp); else damagePlayer(-e.hp, true); }
      inv[k]--; if (!inv[k]) delete inv[k];
      if (k === 'meat_raw') message('Raw meat turns your stomach.'); sfx(e.hp > 10 ? 'heal' : 'eat');
    } else if (it.weapon) { setWeapon(P.weapon === it.weapon ? 'fists' : it.weapon); }
    else if (k === 'torch') toggleTorch();
    else if (k === 'waterskin') { if (P.water > 0) { P.water--; P.thirst = Math.min(100, P.thirst + 40); sfx('drink'); } else message('Your waterskins are empty. Fill them at water.'); }
    else if (k === 'armor') { if (P.armorHP > 0) { message('You are already wearing armor.'); return; } inv.armor--; if (!inv.armor) delete inv.armor; P.armorHP = 220; message('You strap on the hide armor.'); sfx('craft'); }
    refreshUI();
  }
  function setWeapon(w) { P.weapon = w; P.asset = WEAPONS[w].asset; refreshUI(); }
  function cycleWeapon() {
    const opts = ['fists'].concat(['axe', 'spear', 'bow'].filter(w => inv[w])); const i = opts.indexOf(P.weapon);
    setWeapon(opts[(i + 1) % opts.length]); message(`Equipped: ${WEAPONS[P.weapon].name}`);
  }
  function toggleTorch() {
    if (P.torchOn) { P.torchOn = false; refreshUI(); return; }
    if (P.torchT <= 0) { if (!inv.torch) { message('You have no torches. Craft one from a stick and fiber.'); return; } inv.torch--; if (!inv.torch) delete inv.torch; P.torchT = 150; }
    P.torchOn = true; sfx('fire'); refreshUI();
  }
  function craft(r) {
    if (!have(r.cost)) return; if ((inv[r.out] || 0) + r.n > ITEMS[r.out].max) { message(`You can't carry more ${ITEMS[r.out].name.toLowerCase()}.`); return; }
    pay(r.cost); addItem(r.out, r.n, true); sfx('craft'); message(`Crafted ${r.n > 1 ? r.n + ' ' : ''}${ITEMS[r.out].name}.`);
    if (ITEMS[r.out].weapon && P.weapon === 'fists') setWeapon(ITEMS[r.out].weapon);
    if (r.out === 'waterskin') message('Crafted a waterskin. Fill it at any water.');
    refreshUI();
  }

  // ================================================================== lights & time
  function nightness(t = G.tod) { // 0 = full day, 1 = deep night
    if (t < 0.04) return 0.45 * (1 - t / 0.04);
    if (t < 0.62) return 0;
    if (t < 0.72) return NZ.smooth((t - 0.62) / 0.1);
    if (t < 0.94) return 1;
    return 1 - 0.55 * NZ.smooth((t - 0.94) / 0.06);
  }
  const isNight = () => G.tod >= 0.68 || G.tod < 0.02;
  function todLabel() { const t = G.tod; return t < 0.08 ? 'Dawn' : t < 0.3 ? 'Morning' : t < 0.45 ? 'Midday' : t < 0.62 ? 'Afternoon' : t < 0.72 ? 'Dusk' : t < 0.94 ? 'Night' : 'Before dawn'; }
  let lights = [];
  function collectLights() {
    lights = [];
    for (const o of objects) {
      if (o.gone || !o.struct) continue;
      if (o.struct === 'campfire' && o.fuel > 0) lights.push({ x: o.x, y: o.y, r: 4.6, o, fire: true });
      else if (o.struct === 'standing_torch') lights.push({ x: o.x, y: o.y, r: 3.2, o, fire: true });
      else if (o.struct === 'beacon' && G.beacon && G.beacon.lit) lights.push({ x: o.x, y: o.y, r: 7.5, o, fire: true });
    }
    if (P && P.torchOn && !P.dead) lights.push({ x: P.x, y: P.y, r: 3.6, torch: true });
  }
  function lightAt(x, y, skipTorch) { let best = 0, src = null; for (const L of lights) { if (skipTorch && L.torch) continue; const d = Math.hypot(x - L.x, y - L.y), v = 1 - d / L.r; if (v > best) { best = v; src = L; } } return [best, src]; }

  // ================================================================== effects
  const floats = [], arrows = [], sparkles = [], dust = [];
  function floatText(x, y, text, color) { floats.push({ x, y, text, color, t: 0 }); }

  // ================================================================== actions on world objects
  const TREE = /^(oak|birch|pine|palm)_/;
  const ROCK = /^(boulder_|gold_boulder|stone_pile|gold_vein)/;
  function treeName(a) { return a.startsWith('oak') ? 'oak' : a.startsWith('birch') ? 'birch' : a.startsWith('pine') ? 'pine' : a.startsWith('palm') ? 'palm' : 'tree'; }
  function actionFor(o) {
    if (!o || o.gone) return null;
    if (o.unit) {
      if (o.dead && !o.harvested && KINDS[o.kind] && KINDS[o.kind].loot) return { label: 'Harvest carcass', kind: 'harvest', range: 1.2 };
      if (!o.dead && o !== P) return { label: 'Attack ' + (o.kind === 'brute' ? 'brute' : o.kind), kind: 'attack', range: WEAPONS[P.weapon].reach };
      return null;
    }
    const a = o.asset;
    if (o.struct) return structAction(o);
    if (TREE.test(a)) return { label: 'Chop ' + treeName(a), kind: 'chop', repeat: true, range: 1.25 };
    if (a === 'dead_tree') return { label: 'Chop dead tree', kind: 'chop', repeat: true, range: 1.25 };
    if ((a === 'bush_1' || a === 'bush_2') && !o.empty) return { label: 'Gather sticks & fiber', kind: 'gather', range: 1.1 };
    if (a === 'berry_bush') return { label: 'Pick berries', kind: 'berries', range: 1.2 };
    if (a.startsWith('grass_tuft') || a === 'reeds') return { label: 'Pull fiber', kind: 'fiber', range: 1.0 };
    if (a.startsWith('flowers_')) return { label: 'Pick herbs', kind: 'herb', range: 1.0 };
    if (ROCK.test(a)) return { label: 'Gather stone', kind: 'mine', repeat: true, range: 1.25 };
    if (o.chest) return { label: 'Open chest', kind: 'chest', range: 1.1 };
    if (o.search && !o.looted) return { label: a === 'market_stall' ? 'Search stall' : 'Search house', kind: 'search', range: 1.7 };
    if (a === 'well') return { label: 'Drink from well', kind: 'drink', range: 1.3 };
    if (o.relic) return { label: 'Take the relic', kind: 'relic', range: 1.35 };
    if (a === 'watchtower') return { label: 'Climb the tower', kind: 'climb', range: 1.3 };
    return null;
  }
  function structAction(o) {
    switch (o.struct) {
      case 'campfire':
        if (o.fuel <= 0) return { label: 'Relight fire (2 sticks)', kind: 'relight', range: 1.3 };
        if (inv.meat_raw) return { label: 'Cook meat', kind: 'cook', range: 1.3 };
        return { label: `Add fuel (${Math.ceil(o.fuel)}s)`, kind: 'fuel', range: 1.3 };
      case 'lean_to': case 'cabin': return { label: 'Sleep', kind: 'sleep', range: 1.7 };
      case 'crate': return { label: 'Open storage', kind: 'storage', range: 1.3 };
      case 'rain_collector': return { label: o.water > 0 ? `Drink (${o.water})` : 'Collector is empty', kind: 'rain', range: 1.3 };
      case 'beacon': return G.beacon && G.beacon.lit ? null : { label: 'Light the beacon', kind: 'beacon', range: 1.9 };
      default: return null;
    }
  }
  const LOOT_CHEST = [['cloth', 1, 3, 0.7], ['rope', 1, 2, 0.5], ['arrow', 3, 6, 0.35], ['herb', 2, 3, 0.4], ['meat_cooked', 1, 2, 0.3], ['bandage', 1, 1, 0.3], ['salve', 1, 1, 0.15], ['hide', 1, 2, 0.25], ['torch', 1, 2, 0.4]];
  const LOOT_HOUSE = [['cloth', 1, 2, 0.6], ['rope', 1, 1, 0.35], ['herb', 1, 2, 0.3], ['berries', 2, 4, 0.3], ['torch', 1, 1, 0.3], ['stick', 2, 4, 0.4], ['hide', 1, 1, 0.15]];
  function rollLoot(table, guaranteed) {
    const got = []; for (const [k, a, b, p] of table) if (Math.random() < p) got.push([k, a + ((Math.random() * (b - a + 1)) | 0)]);
    if (!got.length || guaranteed) got.push(pick(table).slice(0, 2));
    for (const [k, n] of got) addItem(k, n);
    message('You found: ' + got.map(([k, n]) => `${n} ${ITEMS[k].name.toLowerCase()}`).join(', ') + '.');
  }
  function markDirty(o) { o.dirty = true; }
  function needsSwing(kind) { return kind === 'chop' || kind === 'mine' || kind === 'gather' || kind === 'attack'; }
  // returns true if the task should continue (repeat), false when finished
  function perform(o, act) {
    switch (act.kind) {
      case 'chop': {
        if (P.weapon !== 'axe') { if (inv.axe) setWeapon('axe'); else { message('You need a stone axe to chop trees. Craft one in your pack.'); return false; } }
        o.hp = o.hp == null ? (o.asset === 'dead_tree' ? 3 : 5) : o.hp; o.hp--; sfx('chop'); puff(o.x, o.y, '#8a6a45');
        if (o.hp > 0) return true;
        const logs = o.asset === 'dead_tree' ? 1 : o.asset.startsWith('birch') ? 1 : 2, sticks = o.asset === 'dead_tree' ? 3 : 2;
        addItem('log', logs); addItem('stick', sticks);
        setBlock(o, 0); o.asset = 'stump'; o.blocks = false; o.fp = [1, 1]; markDirty(o); sfx('fall'); return false;
      }
      case 'mine': {
        o.res = o.res == null ? (o.asset.startsWith('boulder') || o.asset === 'gold_boulder' ? 6 : 10) : o.res;
        const n = Math.min(o.res, P.weapon === 'axe' ? 2 : 1); o.res -= n; addItem('stone', n); sfx('mine'); puff(o.x, o.y, '#9a9384'); markDirty(o);
        if (o.res <= 0) { o.gone = true; setBlock(o, 0); return false; }
        return true;
      }
      case 'gather': addItem('fiber', 2); addItem('stick', 1); o.empty = true; o.regrow = 300; markDirty(o); sfx('rustle'); return false;
      case 'berries': addItem('berries', 3); o.asset = 'bush_1'; o.wasBerry = true; o.empty = true; o.regrow = 320; markDirty(o); sfx('rustle'); return false;
      case 'fiber': addItem('fiber', o.asset === 'reeds' ? 2 : 1); o.gone = true; markDirty(o); sfx('rustle'); return false;
      case 'herb': addItem('herb', 1 + (Math.random() < 0.4 ? 1 : 0)); o.gone = true; markDirty(o); sfx('rustle'); return false;
      case 'chest': rollLoot(LOOT_CHEST, true); o.gone = true; markDirty(o); sfx('loot'); return false;
      case 'search': rollLoot(LOOT_HOUSE, false); o.looted = true; markDirty(o); sfx('loot'); return false;
      case 'drink': P.thirst = 100; const skins = inv.waterskin || 0; if (skins) P.water = skins * 3; message(skins ? 'You drink deeply and fill your waterskins.' : 'You drink deeply.'); sfx('drink'); refreshUI(); return false;
      case 'relic': o.relic = false; o.asset = 'shrine_empty'; markDirty(o); addItem('relic', 1, true); sfx('relic');
        message(inv.relic >= 8 ? 'All eight relics! Build the Signal Beacon (Build menu) and light it.' : `Relic recovered (${inv.relic}/8). The Hollows grow weaker.`); return false;
      case 'climb': revealAround(o.x, o.y, 15); message('From the watchtower you survey the land.'); sfx('craft'); return false;
      case 'relight': if ((inv.stick || 0) < 2) { message('You need 2 sticks to relight the fire.'); return false; } pay({ stick: 2 }); o.fuel = 150; o.asset = 'campfire'; o.blocks = true; markDirty(o); sfx('fire'); return false;
      case 'fuel': if (inv.log) { pay({ log: 1 }); o.fuel = Math.min(420, o.fuel + 150); } else if (inv.stick) { pay({ stick: 1 }); o.fuel = Math.min(420, o.fuel + 50); } else { message('You need sticks or logs for fuel.'); return false; } sfx('fire'); markDirty(o); refreshUI(); return false;
      case 'cook': { const n = inv.meat_raw; delete inv.meat_raw; addItem('meat_cooked', n); message(`You cook ${n} meat.`); sfx('fire'); return false; }
      case 'sleep': trySleep(o); return false;
      case 'storage': openStorage(o); return false;
      case 'rain': if (o.water > 0) { o.water--; P.thirst = Math.min(100, P.thirst + 45); sfx('drink'); } return false;
      case 'beacon': lightBeacon(o); return false;
      case 'harvest': { const L = KINDS[o.kind].loot; for (const [k, n] of Object.entries(L)) addItem(k, n); o.harvested = true; o.deadT = 1e9; sfx('rustle'); return false; }
    }
    return false;
  }

  // distance from the player to an object: footprint edge for blocking things, centre otherwise
  function reachDist(o, from = P) {
    if (o.unit || !o.blocks) return dist(o, from);
    const [w, h] = o.fp, i0 = Math.round(o.x - w / 2), j0 = Math.round(o.y - h / 2);
    const dx = Math.max(i0 - from.x, 0, from.x - (i0 + w)), dy = Math.max(j0 - from.y, 0, from.y - (j0 + h));
    return Math.hypot(dx, dy);
  }
  const reachOf = (o, act) => act.kind === 'attack' ? WEAPONS[P.weapon].reach : o.blocks && !o.unit ? 0.75 : (act.range || 1.3);
  // ================================================================== combat
  function attackTargetAvailable() {
    const w = WEAPONS[P.weapon]; let best = null, bd = 1e9;
    for (const u of units) { if (u === P || u.dead || u.dissolve || !visible[idx(Math.floor(u.x), Math.floor(u.y))]) continue; const d = dist(u, P); if (d < bd && d <= (w.ranged ? w.reach : Math.max(6, w.reach))) { bd = d; best = u; } }
    return best;
  }
  function startSwing(onHit, dur = 0.5) { P.swing = { t: 0, dur, onHit, hit: false }; P.moving = false; P.path = []; }
  function playerAttack(target) {
    const w = WEAPONS[P.weapon];
    if (P.swing || P.cdT > 0) return;
    if (P.stamina < w.stam) { if (!P.warn.tired) { message('Too exhausted to swing. Catch your breath.'); P.warn.tired = 1; setTimeout(() => P.warn.tired = 0, 3000); } return; }
    if (w.ranged && !inv.arrow) { message('No arrows. Craft some in your pack.'); setWeapon(inv.axe ? 'axe' : inv.spear ? 'spear' : 'fists'); return; }
    P.stamina -= w.stam; P.cdT = w.cd; if (target) face(P, target);
    startSwing(() => {
      if (w.ranged) {
        if (!target || target.dead) return; inv.arrow--; if (!inv.arrow) delete inv.arrow; refreshUI();
        const d = dist(P, target), lead = d / 10; const tx = target.x + (target.path.length ? (target.path[0][0] - target.x) * 0.3 * lead : 0), ty = target.y + (target.path.length ? (target.path[0][1] - target.y) * 0.3 * lead : 0);
        const dl = Math.hypot(tx - P.x, ty - P.y) || 1; arrows.push({ x: P.x, y: P.y, vx: (tx - P.x) / dl * 10, vy: (ty - P.y) / dl * 10, life: 1.1, dmg: w.dmg }); sfx('bow'); return;
      }
      // melee: hit target or anything in a short arc in front
      let hitAny = false;
      const cands = target ? [target] : units.filter(u => u !== P && !u.dead && dist(u, P) <= w.reach + 0.3);
      for (const u of cands) { if (u.dead || dist(u, P) > w.reach + 0.35) continue; hurtUnit(u, w.dmg * (P.stamina < 15 ? 0.6 : 1) * rand(0.85, 1.15), P); hitAny = true; if (target) break; }
      sfx(hitAny ? 'hit' : 'swish');
    }, w.ranged ? 0.55 : 0.45);
  }
  function hurtUnit(u, dmg, src) {
    dmg = Math.round(dmg); u.hp -= dmg; u.hurtT = 0.18; floatText(u.x, u.y, '-' + dmg, '#ff9a8a');
    const K = KINDS[u.kind]; u.aggroT = 14;
    if (src && !u.dead) { const d = dist(u, src) || 1; const kx = (u.x - src.x) / d * 0.18, ky = (u.y - src.y) / d * 0.18; if (walkableAt(u.x + kx, u.y + ky)) { u.x += kx; u.y += ky; } }
    if (u.kind === 'wolf') for (const o of units) if (o.kind === 'wolf' && !o.dead && dist(o, u) < 8) o.aggroT = 14;
    if (u.hp <= 0) killUnit(u);
    else if (K && K.flee) u.fleeT = 0;
  }
  function killUnit(u) {
    u.dead = true; u.deadT = 0; u.path = []; u.attackT = null; u.moving = false;
    if (u.kind === 'hollow' || u.kind === 'brute') { G.hollowsKilled++; sfx('hollowdie'); } else sfx('die');
    if (P.task && P.task.obj === u) P.task = null;
  }
  function damagePlayer(dmg, silent) {
    if (P.dead || G.won && G.wonSafe) return;
    if (P.armorHP > 0 && !silent) { const absorbed = dmg * 0.4; P.armorHP -= absorbed * 2; dmg -= absorbed; if (P.armorHP <= 0) { P.armorHP = 0; message('Your hide armor falls apart.'); } }
    dmg = Math.round(dmg); P.hp -= dmg; G.dmgTaken = (G.dmgTaken || 0) + dmg; floatText(P.x, P.y, '-' + dmg, '#ff5a4a');
    if (!silent) { sfx('hurt'); hurtFlash = 1; }
    if (P.hp <= 0) { P.hp = 0; playerDie(); }
  }
  let hurtFlash = 0;
  function playerDie() {
    P.dead = true; P.path = []; P.task = null; P.swing = null; sfx('die');
    setTimeout(() => { $('deadtxt').textContent = `You survived ${G.day} day${G.day > 1 ? 's' : ''}, recovered ${inv.relic || 0} of 8 relics and banished ${G.hollowsKilled} Hollows.`; show('dead'); }, 2200);
  }

  // ================================================================== AI
  function wander(u, dt, range = 5, speedMul = 0.55) {
    if (u.path.length) return stepUnit(u, dt, speedMul);
    u.wait -= dt; if (u.wait > 0) return;
    u.wait = rand(2, 6); const a = Math.random() * Math.PI * 2, r = Math.random() * range;
    const tx = u.home[0] + Math.cos(a) * r, ty = u.home[1] + Math.sin(a) * r;
    if (Math.hypot(tx - u.x, ty - u.y) < 8 && walkableAt(tx, ty)) { const p = findPath(u, tx, ty, 600); if (p) u.path = p; }
  }
  function fleeFrom(u, from, dt, distTo = 6, mul = 1.5) {
    if (!u.path.length || u.fleeT <= 0) {
      const a = Math.atan2(u.y - from.y, u.x - from.x) + rand(-0.6, 0.6); const tx = u.x + Math.cos(a) * distTo, ty = u.y + Math.sin(a) * distTo;
      const p = findPath(u, tx, ty, 800); if (p) u.path = p; u.fleeT = 1.2;
    }
    u.fleeT -= dt; stepUnit(u, dt, mul);
  }
  function startUnitAttack(u, target) { const K = KINDS[u.kind]; u.attackT = 0; u.hitDone = false; u.atkTarget = target; u.cd = K.cd; face(u, target); u.path = []; u.moving = false; }
  function updateUnit(u, dt) {
    const K = KINDS[u.kind];
    if (u.dead) {
      u.deadT += dt;
      if (u.kind === 'hollow' || u.kind === 'brute') { if (u.deadT > 1.5) u.fade -= dt * 0.7; }
      else if (u.deadT > 240 || u.harvested) u.fade -= dt * 0.8;
      if (u.fade <= 0) u.remove = true; return;
    }
    if (u.dissolve) { u.fade -= dt * 0.6; if (u.fade <= 0) u.remove = true; return; }
    u.cd -= dt; u.hurtT -= dt; u.aggroT -= dt;
    // spike traps
    const tk = idx(Math.floor(u.x), Math.floor(u.y));
    if (K.hostile && trapAt.has(tk) && (u.trapCd || 0) <= 0) { const tr = trapAt.get(tk); if (!tr.gone) { hurtUnit(u, 30, null); u.trapCd = 1.2; tr.uses = (tr.uses == null ? 4 : tr.uses) - 1; markDirty(tr); if (tr.uses <= 0) destroyStruct(tr); sfx('hit'); } }
    u.trapCd = (u.trapCd || 0) - dt;
    if (u.attackT != null) {
      u.attackT += dt;
      if (!u.hitDone && u.attackT >= 0.25) {
        u.hitDone = true; const t = u.atkTarget;
        if (t === P) { if (!P.dead && dist(u, P) <= K.reach + 0.35) damagePlayer(K.dmg * rand(0.85, 1.15)); }
        else if (t && !t.gone) { t.hp -= K.structDmg || K.dmg; sfx('thud'); puff(t.x, t.y, '#6a5040'); markDirty(t); if (t.struct === 'campfire' && !t.warned) { t.warned = 1; message('A Hollow is smothering your fire!'); } if (t.hp <= 0) destroyStruct(t); }
      }
      if (u.attackT >= 0.5) u.attackT = null; return;
    }
    const dp = P.dead ? 99 : dist(u, P);
    switch (u.kind) {
      case 'deer': case 'sheep':
        if (dp < K.flee || u.aggroT > 0) fleeFrom(u, P, dt, 6, u.kind === 'deer' ? 1.4 : 1.2); else wander(u, dt, 5, 0.5); break;
      case 'wolf': {
        const night = nightness() > 0.5, aggro = u.aggroT > 0 || dp < (night ? K.nightAggro : K.aggro);
        if (u.hp < u.maxHp * 0.25) { fleeFrom(u, P, dt, 7, 1.3); break; }
        if (aggro && !P.dead) chase(u, dt, 1.25); else wander(u, dt, 6, 0.6);
        break;
      }
      case 'boar': if ((u.aggroT > 0 || dp < K.aggro) && !P.dead) { if (dp < K.aggro) u.aggroT = Math.max(u.aggroT, 6); chase(u, dt, 1.35); } else wander(u, dt, 4, 0.45); break;
      case 'hollow': case 'brute': if (P.dead) wander(u, dt, 4, 0.6); else chase(u, dt, 1); break;
    }
    if (u.hp < u.maxHp && !K.night && u.aggroT < -20) u.hp = Math.min(u.maxHp, u.hp + dt * 0.5);
  }
  function chase(u, dt, speedMul) {
    const K = KINDS[u.kind], dp = dist(u, P);
    // courage: hollows and wolves fear firelight unless they work up the nerve
    u.braveT -= dt; if (u.braveT <= 0) { u.braveT = rand(5, 9); u.brave = Math.random() < (K.fear < 1 ? 0.45 : 0.08 + G.day * 0.028) + (G.beaconNight ? 0.25 : 0) - (inv.relic || 0) * 0.015;
      // a brave hollow may go for the fire itself and try to smother it
      if (u.brave && K.night && Math.random() < 0.45) { const [pl, ps] = lightAt(P.x, P.y, true); if (pl > 0 && ps && ps.o && ps.o.struct !== 'beacon' && !ps.o.gone) { u.wall = ps.o; u.path = []; u.repath = 0; } }
    }
    const fearful = K.fear && !u.brave && dp > 2.2; // cornered creatures fight even in the light
    if (fearful) {
      const [selfLit, src] = lightAt(u.x, u.y);
      if (selfLit > 0.12) { fleeFrom(u, src, dt, src.r - Math.hypot(u.x - src.x, u.y - src.y) + 1.5, 1.2); return; }
      const [pLit, psrc] = lightAt(P.x, P.y);
      if (pLit > 0) { // circle at the edge of the light
        const a = Math.atan2(u.y - psrc.y, u.x - psrc.x) + dt * 0.4, r = psrc.r + 0.8;
        const tx = psrc.x + Math.cos(a) * r, ty = psrc.y + Math.sin(a) * r;
        if (walkableAt(tx, ty)) { const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy); if (d > 0.1) { const sp = Math.min(d, u.speed * 0.5 * dt); const nx = u.x + dx / d * sp, ny = u.y + dy / d * sp; if (walkableAt(nx, ny)) { u.x = nx; u.y = ny; } u.dir = dirFromVec(P.x - u.x, P.y - u.y); u.moving = true; u.walkT += dt * 0.5; } }
        return;
      }
    }
    if (dp <= K.reach) { if (u.cd <= 0) startUnitAttack(u, P); else { face(u, P); u.moving = false; } return; }
    // structure in the way?
    if (u.wall && !u.wall.gone && u.brave && u.wall.struct === 'campfire' && dist(u, u.wall) >= 1.2) { // raiding the fire
      u.repath -= dt; if (u.repath <= 0) { u.repath = 0.8; const ap = approachPoint(u.wall, u); const pp = ap && findPath(u, ap[0], ap[1], 2500); u.path = pp || []; }
      stepUnit(u, dt, speedMul); return;
    }
    if (u.wall && !u.wall.gone && dist(u, u.wall) < 1.0 + u.wall.fp[0] * 0.5) { if (u.cd <= 0) startUnitAttack(u, u.wall); else face(u, u.wall); return; }
    u.repath -= dt;
    if (u.repath <= 0) {
      u.repath = rand(0.6, 1.0);
      const p = dp < 40 ? findPath(u, P.x, P.y, 2500) : null;
      if (p) { u.path = p; u.wall = null; }
      else if (dp < 14 && objects.some(o => o.struct && !o.world && o.blocks && !o.gone && dist(o, u) < 12)) { // blocked: attack the nearest player structure
        let best = null, bd = 1e9; for (const o of objects) { if (o.gone || !o.struct || o.world || !o.blocks) continue; const d = dist(o, u); if (d < bd && d < 12) { bd = d; best = o; } }
        if (best) { u.wall = best; const ap = approachPoint(best, u); if (ap) { const pp = findPath(u, ap[0], ap[1], 2500); u.path = pp || []; } }
      } else u.path = [[P.x, P.y]];
    }
    stepUnit(u, dt, speedMul);
  }

  // ================================================================== structures
  const trapAt = new Map();
  function addStruct(type_, x, y, extra = {}) {
    const def = STRUCTS[type_];
    const o = addObj(def.asset, x, y, Object.assign({ struct: type_, hp: def.hp }, extra));
    if (type_ === 'campfire' && o.fuel == null) o.fuel = 200;
    if (type_ === 'rain_collector' && o.water == null) { o.water = 1; o.fillT = 0; }
    if (type_ === 'crate' && !o.store) o.store = {};
    if (type_ === 'spike_trap') { trapAt.set(idx(Math.floor(x), Math.floor(y)), o); if (o.uses == null) o.uses = 4; }
    if (type_ === 'beacon') G.beacon = Object.assign(G.beacon || { lit: false, sawNight: false }, { obj: o });
    o.id = o.id == null ? objects.length - 1 + 100000 : o.id;
    return o;
  }
  function destroyStruct(o) {
    o.gone = true; setBlock(o, 0); markDirty(o); trapAt.delete(idx(Math.floor(o.x), Math.floor(o.y)));
    puff(o.x, o.y, '#5a4636', 14); sfx('break');
    if (o.struct !== 'spike_trap') message(`Your ${STRUCTS[o.struct] ? STRUCTS[o.struct].name.toLowerCase() : 'structure'} was destroyed!`);
    if (o.struct === 'crate' && o.store) message('Its contents are lost.');
  }
  let placing = null; // {type}
  let ghost = null;   // {x, y, ok}
  function snapPlace(type_, wx, wy) {
    const fp = SPR[STRUCTS[type_].asset].footprint;
    const x = fp[0] % 2 ? Math.floor(wx) + 0.5 : Math.round(wx), y = fp[1] % 2 ? Math.floor(wy) + 0.5 : Math.round(wy);
    let ok = freeFor(x, y, fp, false) && Math.hypot(x - P.x, y - P.y) < 7;
    const [w, h] = fp, i0 = Math.round(x - w / 2), j0 = Math.round(y - h / 2);
    for (let i = i0; i < i0 + w && ok; i++) for (let j = j0; j < j0 + h; j++) { if (!inMap(i, j) || !explored[idx(i, j)]) ok = false; if (STRUCTS[type_] && SPR[STRUCTS[type_].asset].blocks && Math.floor(P.x) === i && Math.floor(P.y) === j) ok = false; }
    for (const o of objects) if (!o.gone && !o.blocks && o.fp && fpTiles(o).some(([a, b]) => a >= i0 && a < i0 + w && b >= j0 && b < j0 + h) && (TREE.test(o.asset) || o.struct)) ok = false;
    return { x, y, ok };
  }
  function placeAt(wx, wy) {
    const def = STRUCTS[placing.type], g = snapPlace(placing.type, wx, wy);
    if (!g.ok) { message("You can't build there."); return; }
    if (!have(def.cost)) { message('Not enough materials.'); stopPlacing(); return; }
    if (placing.type === 'beacon' && G.beacon && G.beacon.obj && !G.beacon.obj.gone) { message('You have already built the beacon.'); stopPlacing(); return; }
    // clear decorative clutter under the footprint
    const [w, h] = SPR[def.asset].footprint, i0 = Math.round(g.x - w / 2), j0 = Math.round(g.y - h / 2);
    for (const o of objects) if (!o.gone && !o.struct && fpTiles(o).some(([a, b]) => a >= i0 && a < i0 + w && b >= j0 && b < j0 + h)) { o.gone = true; markDirty(o); }
    const payCost = Object.assign({}, def.cost); delete payCost.relic; pay(payCost); addStruct(placing.type, g.x, g.y); sfx('build'); puff(g.x, g.y, '#a08a60', 10);
    message(`Built: ${def.name}.`); refreshUI();
    if (!def.repeat || !have(def.cost)) stopPlacing();
  }
  function startPlacing(t) { closeModals(); placing = { type: t }; $('placebar').classList.remove('hidden'); $('placetxt').textContent = `Placing ${STRUCTS[t].name}: tap the ground near you`; }
  function stopPlacing() { placing = null; ghost = null; $('placebar').classList.add('hidden'); }

  // ================================================================== sleep / beacon / day cycle
  function hostilesNear(r) { return units.some(u => !u.dead && !u.dissolve && KINDS[u.kind] && KINDS[u.kind].hostile && (KINDS[u.kind].night || u.aggroT > 0) && dist(u, P) < r); }
  function trySleep(o) {
    if (hostilesNear(10)) { message("You can't sleep with enemies nearby."); return; }
    if (!isNight() && P.energy > 60 && G.tod < 0.55) { message("You're not tired yet. You can sleep at dusk or when exhausted."); return; }
    const fade = $('sleepfade'); fade.textContent = 'Sleeping…'; fade.style.opacity = 1; G.paused = true;
    setTimeout(() => {
      const wasNight = G.tod > 0.5; if (wasNight) { G.day++; G.tod = 0.05; } else G.tod = Math.min(0.66, G.tod + 0.25);
      P.energy = 100; P.hp = Math.min(P.maxHp, P.hp + (o.struct === 'cabin' ? 60 : 25)); P.hunger = Math.max(0, P.hunger - 18); P.thirst = Math.max(0, P.thirst - 22);
      for (const u of units) if (KINDS[u.kind] && KINDS[u.kind].night) u.remove = true;
      saveGame(); fade.textContent = wasNight ? `Day ${G.day}` : 'Rested';
      setTimeout(() => { fade.style.opacity = 0; G.paused = false; message(wasNight ? `You wake at dawn. Day ${G.day}. Game saved.` : 'You feel rested. Game saved.'); }, 900);
    }, 1100);
  }
  function lightBeacon(o) {
    if (!isNight() && G.tod < 0.55) { message('Light the beacon at dusk. Its fire will burn through the night.'); return; }
    G.beacon.lit = true; G.beacon.sawNight = false; o.asset = 'beacon_lit'; markDirty(o); G.beaconNight = true;
    message('The beacon blazes across the sea. Survive until dawn!'); sfx('relic'); saveGame();
  }
  let lastNight = false;
  function advanceTime(dt) {
    const prev = G.tod; G.tod += dt / DAY_SECONDS;
    if (G.tod >= 1) { G.tod -= 1; G.day++; message(`Day ${G.day} dawns.`); }
    const night = isNight();
    if (night && !lastNight) { message(G.beacon && G.beacon.lit ? 'The final night. Hold out until dawn!' : 'Night falls. Stay near the fire…'); sfx('night'); }
    if (!night && lastNight) {
      for (const u of units) if (KINDS[u.kind] && KINDS[u.kind].night && !u.dead) u.dissolve = true;
      if (G.beacon && G.beacon.lit && G.beacon.sawNight && !G.won) win();
      else if (!P.dead) { saveGame(); message('The Hollows retreat into the earth. Game saved.'); }
      G.beaconNight = false;
    }
    if (night && G.beacon && G.beacon.lit) { G.beacon.sawNight = true; G.beaconNight = true; }
    lastNight = night;
    if (prev < 0.62 && G.tod >= 0.62 && !G.won) message('Dusk is coming. Prepare a fire.');
  }
  function win() {
    G.won = true; sfx('relic');
    $('wintxt').textContent = `At first light a ship answers the beacon. You survived ${G.day} days and banished ${G.hollowsKilled} Hollows on the Lantern Isles.`;
    show('win'); saveGame();
  }
  function spawnHollows(dt) {
    if (!isNight() || P.dead) return;
    G.spawnT -= dt; if (G.spawnT > 0) return;
    G.spawnT = rand(3, 7) / (1 + G.day * 0.08) * (G.beaconNight ? 0.4 : 1);
    const alive = units.filter(u => (u.kind === 'hollow' || u.kind === 'brute') && !u.dead && !u.dissolve).length;
    const cap = G.beaconNight ? 16 : clamp(Math.floor(1 + G.day * 1.1 - (inv.relic || 0) * 0.35), 1, 11);
    if (alive >= cap) return;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, r = rand(10, 15), x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
      if (!inMap(Math.floor(x), Math.floor(y)) || !walkableAt(x, y) || isWater(type[idx(Math.floor(x), Math.floor(y))])) continue;
      if (lightAt(x, y)[0] > 0) continue;
      const bruteP = G.beaconNight ? 0.3 : G.day >= 4 ? 0.1 + 0.03 * (G.day - 4) : 0;
      const kind = Math.random() < bruteP ? 'brute' : 'hollow';
      addUnit(kind, x, y, { home: [x, y], fade: 0.01, rise: true });
      if (Math.random() < 0.5) sfx('growl');
      return;
    }
  }

  // ================================================================== save / load
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
  function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function saveGame() {
    if (!P || P.dead) return false;
    const objs = {}; const structs = [];
    for (const o of objects) {
      if (o.id < baseObjCount && o.dirty) objs[o.id] = { gone: o.gone || 0, asset: o.asset, blocks: o.blocks, res: o.res, hp: o.hp, empty: o.empty, regrow: o.regrow, wasBerry: o.wasBerry, looted: o.looted, relic: o.relic, fuel: o.fuel, fp: o.fp };
      if (o.id >= baseObjCount && o.struct && !o.gone) structs.push({ t: o.struct, x: o.x, y: o.y, hp: o.hp, fuel: o.fuel, water: o.water, store: o.store, uses: o.uses, asset: o.asset });
    }
    const exp = new Uint8Array(Math.ceil(N * N / 8)); for (let k = 0; k < N * N; k++) if (explored[k]) exp[k >> 3] |= 1 << (k & 7);
    const data = { v: 1, seed, day: G.day, tod: G.tod, rain: G.rain, won: G.won, killed: G.hollowsKilled, beacon: G.beacon ? { lit: G.beacon.lit, sawNight: G.beacon.sawNight } : null,
      sites: sites.map(s => s.found ? 1 : 0),
      p: { x: P.x, y: P.y, hp: P.hp, hunger: P.hunger, thirst: P.thirst, stamina: P.stamina, energy: P.energy, weapon: P.weapon, armorHP: P.armorHP, torchT: P.torchT, water: P.water, inv: Object.assign({}, inv) },
      objs, structs, exp: b64(exp) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function applySave(d) {
    genWorld(d.seed);
    G.day = d.day; G.tod = d.tod; G.rain = d.rain; G.won = d.won; G.hollowsKilled = d.killed || 0; G.beacon = null;
    for (const [id, st] of Object.entries(d.objs)) { const o = objects[+id]; if (!o) continue; if (o.blocks) setBlock(o, 0); Object.assign(o, st); o.dirty = true; if (o.gone) continue; if (o.blocks) setBlock(o, 1); }
    for (let k = objects.length - 1; k >= 0; k--) if (objects[k].gone && objects[k].id < baseObjCount) { /* keep for id stability */ }
    for (const s of d.structs) { const o = addStruct(s.t, s.x, s.y, { hp: s.hp, fuel: s.fuel, water: s.water, store: s.store, uses: s.uses }); if (s.asset) o.asset = s.asset; }
    if (d.beacon && G.beacon) Object.assign(G.beacon, d.beacon);
    d.sites.forEach((f, n) => { if (sites[n]) sites[n].found = !!f; });
    const exp = unb64(d.exp); for (let k = 0; k < N * N; k++) explored[k] = (exp[k >> 3] >> (k & 7)) & 1;
    spawnPlayer(d.p.x, d.p.y);
    for (const k of Object.keys(inv)) delete inv[k]; Object.assign(inv, d.p.inv);
    Object.assign(P, { hp: d.p.hp, hunger: d.p.hunger, thirst: d.p.thirst, stamina: d.p.stamina, energy: d.p.energy, armorHP: d.p.armorHP, torchT: d.p.torchT, water: d.p.water || 0 });
    setWeapon(d.p.weapon || 'fists');
  }

  // ================================================================== terrain chunks
  const chunks = new Map(); let chunkQueue = []; const queued = new Set();
  const L = S.lighting.sunDir, TSL = S.lighting.terrainSlope;
  const FLAT = TSL.ambient + TSL.litSlopeGain * L[2];
  const FOAM = PAL.hex('#e3efe9');
  function renderChunk(cx, cy) {
    const X0 = cx * CH, Y0 = cy * CH, sBuf = new Float32Array(CH * CH).fill(NaN);
    const ds = 1 / 64, sLo = Y0 / HHp - 0.25, sHi = (Y0 + CH + MAXLV * ZPX) / HHp + 0.25;
    for (let col = 0; col < CH; col++) {
      const c = (X0 + col + 0.5) / HWp; let prev = null;
      for (let s = sLo; s <= sHi; s += ds) {
        const x = (s + c) / 2, y = (s - c) / 2;
        const inside = x >= 0 && y >= 0 && x < N && y < N;
        const h = inside ? hAt(x, y) : 0;
        const sy = s * HHp - h * ZPX - Y0;
        if (prev !== null && sy > prev) {
          const a = Math.max(0, Math.ceil(prev)), b = Math.min(CH - 1, Math.floor(sy));
          for (let py = a; py <= b; py++) sBuf[py * CH + col] = inside ? s : NaN;
        }
        prev = Math.max(prev === null ? -1e9 : prev, sy);
        if (prev > CH) break;
      }
    }
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = CH; const ctx = cvs.getContext('2d');
    const img = ctx.createImageData(CH, CH), d = img.data;
    for (let py = 0; py < CH; py++) for (let px = 0; px < CH; px++) {
      const s = sBuf[py * CH + px]; if (s !== s) continue;
      const c = (X0 + px + 0.5) / HWp, x = (s + c) / 2, y = (s - c) / 2;
      const wx = (noise2(x * 1.6, y * 1.6, 1e5, 91) - 0.5) * 1.05 + (noise2(x * 5, y * 5, 1e5, 93) - 0.5) * 0.35;
      const wy = (noise2(x * 1.6 + 31, y * 1.6 + 17, 1e5, 92) - 0.5) * 1.05 + (noise2(x * 5 + 5, y * 5 + 9, 1e5, 94) - 0.5) * 0.35;
      const t1 = type[idx(clamp(Math.floor(x + wx), 0, N - 1), clamp(Math.floor(y + wy), 0, N - 1))];
      const t2 = type[idx(clamp(Math.floor(x + wx * 0.55), 0, N - 1), clamp(Math.floor(y + wy * 0.55), 0, N - 1))];
      const u = ((Math.floor(x * TPT) % TS) + TS) % TS, v = ((Math.floor(y * TPT) % TS) + TS) % TS, ti_ = v * TS + u;
      let r, g, b;
      const sample = t => { const p = TEX[t][ti_]; return [p & 255, (p >> 8) & 255, (p >> 16) & 255]; };
      const depth = bil(waterDist, x - 0.5, y - 0.5);
      if (isWater(t1) || isWater(t2)) {
        const wsh = sample(TYPES.shallow), wdp = sample(TYPES.deep), k = NZ.smooth(clamp((depth - 0.8) / 2.2, 0, 1));
        let col = [wsh[0] + (wdp[0] - wsh[0]) * k, wsh[1] + (wdp[1] - wsh[1]) * k, wsh[2] + (wdp[2] - wsh[2]) * k];
        if (!isWater(t1) || !isWater(t2)) { const land = sample(isWater(t1) ? t2 : t1); col = col.map((v, i) => (v + land[i]) / 2); }
        const fn = noise2(x * 5, y * 5, 1e5, 77);
        if (depth < 0.95 && fn > 0.35 + depth * 0.45) col = col.map((v, i) => v + (FOAM[i] - v) * 0.55);
        [r, g, b] = col;
      } else {
        let col = sample(t1);
        if (t2 !== t1) { const c2 = sample(t2); col = [(col[0] + c2[0]) / 2, (col[1] + c2[1]) / 2, (col[2] + c2[2]) / 2]; }
        const ld = bil(landDist, x - 0.5, y - 0.5); if (ld < 1.4 && t1 === TYPES.sand) { const m = 0.82 + 0.18 * clamp(ld - 0.4, 0, 1); col = col.map(v => v * m); }
        const e = 0.08, hx = (hAt(x + e, y) - hAt(x - e, y)) / (2 * e) * LV_UNITS, hy = (hAt(x, y + e) - hAt(x, y - e)) / (2 * e) * LV_UNITS;
        const nl = Math.hypot(hx, hy, 1), ndl = (-hx * L[0] - hy * L[1] + L[2]) / nl;
        const sh = (TSL.ambient + TSL.litSlopeGain * Math.max(0, ndl)) / FLAT;
        [r, g, b] = [col[0] * sh, col[1] * sh, col[2] * sh];
      }
      const q = PAL.quantize(r, g, b), o = (py * CH + px) * 4;
      d[o] = q[0]; d[o + 1] = q[1]; d[o + 2] = q[2]; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cvs;
  }
  function bil(F, x, y) {
    x = clamp(x, 0, N - 1.001); y = clamp(y, 0, N - 1.001); const xi = x | 0, yi = y | 0, u = x - xi, v = y - yi, o = xi * N + yi;
    const a = Math.min(F[o], 9), b = Math.min(F[o + N], 9), c = Math.min(F[o + 1], 9), dd = Math.min(F[o + N + 1], 9);
    return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v;
  }
  function getChunk(cx, cy, now) {
    const key = cx + ',' + cy; let c = chunks.get(key);
    if (c) return c;
    if (now) { c = renderChunk(cx, cy); chunks.set(key, c); return c; }
    if (queued.has(key)) { const at = chunkQueue.indexOf(key); if (at > 0) { chunkQueue.splice(at, 1); chunkQueue.unshift(key); } }
    else { queued.add(key); chunkQueue.unshift(key); }
    return null;
  }

  // ================================================================== view
  const cv = $('game'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
  let zi = 2;
  const cam = { x: 0, y: 0, follow: true };
  const fogC = document.createElement('canvas'), fogX = fogC.getContext('2d'), dimC = document.createElement('canvas'), dimX = dimC.getContext('2d');
  const nightC = document.createElement('canvas'), nightX = nightC.getContext('2d');
  function resize() { dpr = Math.min(3, window.devicePixelRatio || 1); W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr); cv.width = W; cv.height = H; fogC.width = Math.ceil(W / 8); fogC.height = Math.ceil(H / 8); nightC.width = Math.ceil(W / 4); nightC.height = Math.ceil(H / 4); }
  addEventListener('resize', resize);
  const zoom = () => ZOOMS[zi];
  const toScreen = (x, y) => { const h = hAt(x, y); return [(x - y) * HWp, (x + y) * HHp - h * ZPX]; };
  let time = 0, marker = null, hoverObj = null;

  function animCol(a, u) {
    if (!a.anim) return 0;
    if (u.dead) return a.anim.dead[0];
    if (u === P && P.swing) return a.anim.attack[0] + Math.min(a.anim.attack[1] - 1, Math.floor(P.swing.t / P.swing.dur * a.anim.attack[1]));
    if (u.attackT != null) return a.anim.attack[0] + Math.min(a.anim.attack[1] - 1, Math.floor(u.attackT / 0.5 * a.anim.attack[1]));
    if (u.moving) return a.anim.walk[0] + (Math.floor(u.walkT * a.fps) % a.anim.walk[1]);
    return 0;
  }
  function drawSprite(o, sx, sy, isUnit, shadowPass, alpha = 1) {
    const a = SPR[o.asset]; if (!a) return; let row = 0, col = 0, flip = false;
    if (isUnit) { const d = DIRS[o.dir], src = a.mirrored[d] || d; flip = !!a.mirrored[d]; row = a.dirs.indexOf(src); col = animCol(a, o); }
    else if (a.frames > 1) col = Math.floor(time * (a.fps || 8) + o.x * 7) % a.frames;
    const img = shadowPass ? a.sh : a.img; if (!img) return;
    const X = Math.round(sx), Y = Math.round(sy);
    if (alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    if (flip) { ctx.save(); ctx.translate(X, Y); ctx.scale(-1, 1); ctx.drawImage(img, col * a.w, row * a.h, a.w, a.h, -a.ax, -a.ay, a.w, a.h); ctx.restore(); }
    else ctx.drawImage(img, col * a.w, row * a.h, a.w, a.h, X - a.ax, Y - a.ay, a.w, a.h);
    if (!shadowPass && isUnit && o.hurtT > 0) { // hit flash
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
      if (flip) { ctx.save(); ctx.translate(X, Y); ctx.scale(-1, 1); ctx.drawImage(img, col * a.w, row * a.h, a.w, a.h, -a.ax, -a.ay, a.w, a.h); ctx.restore(); }
      else ctx.drawImage(img, col * a.w, row * a.h, a.w, a.h, X - a.ax, Y - a.ay, a.w, a.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
  function draw() {
    const z = zoom();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const ox = Math.round(W / 2 - cam.x * z), oy = Math.round(H / 2 - cam.y * z);
    ctx.setTransform(z, 0, 0, z, ox, oy); ctx.imageSmoothingEnabled = false;
    const vl = -ox / z, vt = -oy / z, vr = vl + W / z, vb = vt + H / z;
    for (let cy = Math.floor(vt / CH); cy <= Math.floor(vb / CH); cy++) for (let cx = Math.floor(vl / CH); cx <= Math.floor(vr / CH); cx++) {
      const c = getChunk(cx, cy, false); if (c) ctx.drawImage(c, cx * CH, cy * CH);
    }
    ctx.fillStyle = 'rgba(235,248,255,0.85)';
    for (const s of sparkles) { const a = Math.sin(s.t / s.life * Math.PI); if (a <= 0) continue; ctx.globalAlpha = a * (1 - nightness() * 0.7); ctx.fillRect(Math.round(s.sx), Math.round(s.sy), 3, 1); }
    ctx.globalAlpha = 1;
    // selection ring under the current task target / hovered object
    const ring = (o, col) => { if (!o || o.gone) return; const [sx, sy] = toScreen(o.x, o.y), r = 14 + (o.fp ? (o.fp[0] - 1) * 30 : 0); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, r, r / 2, 0, 0, Math.PI * 2); ctx.stroke(); };
    if (hoverObj && hoverObj !== P) ring(hoverObj, 'rgba(255,255,255,0.45)');
    if (P.task && P.task.obj) ring(P.task.obj, P.task.obj.unit && !P.task.obj.dead ? 'rgba(255,90,70,0.8)' : 'rgba(255,214,110,0.8)');
    const list = [];
    const consider = (o, isUnit) => {
      const i = Math.floor(o.x), j = Math.floor(o.y); if (!inMap(i, j)) return;
      if (isUnit ? !visible[idx(i, j)] && o !== P : !explored[idx(i, j)]) return;
      const [sx, sy] = toScreen(o.x, o.y), a = SPR[o.asset]; if (!a) return;
      if (sx + a.w < vl || sx - a.w > vr || sy - a.ay > vb || sy + a.h < vt) return;
      list.push([o.x + o.y + (isUnit ? (o.dead ? -0.3 : 0.01) : 0) - (a.footprint[0] > 1 ? 0.3 : 0) + (o.asset === 'spike_trap' || o.asset === 'stump' ? -0.4 : 0), o, sx, sy, isUnit]);
    };
    for (const o of objects) if (!o.gone) consider(o, false);
    for (const u of units) consider(u, true);
    list.sort((a, b) => a[0] - b[0]);
    for (const it of list) drawSprite(it[1], it[2], it[3], it[4], true, it[4] ? it[1].fade : 1);
    for (const it of list) drawSprite(it[1], it[2], it[3], it[4], false, it[4] ? it[1].fade : 1);
    // build ghost
    if (placing && ghost) {
      const def = STRUCTS[placing.type], a = SPR[def.asset];
      ctx.globalAlpha = 0.6; ctx.drawImage(a.img, 0, 0, a.w, a.h, Math.round(ghost.sx - a.ax), Math.round(ghost.sy - a.ay), a.w, a.h); ctx.globalAlpha = 1;
      const [w, h] = a.footprint, i0 = Math.round(ghost.x - w / 2), j0 = Math.round(ghost.y - h / 2);
      ctx.strokeStyle = ghost.ok ? 'rgba(120,255,140,0.9)' : 'rgba(255,80,60,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath();
      const c = (i, j) => [(i - j) * HWp, (i + j) * HHp - hAt(Math.min(i, N - 0.01), Math.min(j, N - 0.01)) * ZPX];
      const p0 = c(i0, j0), p1 = c(i0 + w, j0), p2 = c(i0 + w, j0 + h), p3 = c(i0, j0 + h);
      ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.stroke();
    }
    // health bars
    for (const it of list) {
      const o = it[1]; const maxHp = it[4] ? o.maxHp : (o.struct && STRUCTS[o.struct] ? STRUCTS[o.struct].hp : 0);
      if (!maxHp || o.dead || o === P || o.hp >= maxHp || o.hp == null) continue;
      const a = SPR[o.asset], w = 26, y = it[3] - (it[4] ? 62 * (o.kind === 'brute' ? 1.4 : 1) : Math.min(a.ay, 80));
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(Math.round(it[2] - w / 2) - 1, Math.round(y) - 1, w + 2, 5);
      ctx.fillStyle = it[4] && KINDS[o.kind] && KINDS[o.kind].hostile ? '#d8463a' : '#e0b040'; ctx.fillRect(Math.round(it[2] - w / 2), Math.round(y), Math.round(w * clamp(o.hp / maxHp, 0, 1)), 3);
    }
    // fire glows
    ctx.globalCompositeOperation = 'lighter';
    for (const Lg of lights) {
      const [sx, sy] = toScreen(Lg.x, Lg.y), r = Lg.r * 22, fl = 0.85 + 0.15 * Math.sin(time * 9 + Lg.x * 3), cy0 = sy - (Lg.torch ? 30 : 14);
      const g = ctx.createRadialGradient(sx, cy0, 2, sx, cy0, r); g.addColorStop(0, `rgba(255,190,100,${(0.18 + 0.25 * nightness()) * fl})`); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r, cy0 - r, r * 2, r * 2);
    }
    for (const it of list) if (it[1].asset === 'shrine_lit') { const g = ctx.createRadialGradient(it[2], it[3] - 55, 2, it[2], it[3] - 55, 60); g.addColorStop(0, 'rgba(255,215,120,0.35)'); g.addColorStop(1, 'rgba(255,200,100,0)'); ctx.fillStyle = g; ctx.fillRect(it[2] - 60, it[3] - 115, 120, 120); }
    for (const u of units) if ((u.kind === 'hollow' || u.kind === 'brute') && !u.dead && visible[idx(Math.floor(u.x), Math.floor(u.y))]) { const [sx, sy] = toScreen(u.x, u.y), h = u.kind === 'brute' ? 74 : 52; const g = ctx.createRadialGradient(sx + 3, sy - h, 1, sx + 3, sy - h, 16); g.addColorStop(0, `rgba(140,230,255,${0.5 * u.fade})`); g.addColorStop(1, 'rgba(140,230,255,0)'); ctx.fillStyle = g; ctx.fillRect(sx - 14, sy - h - 16, 34, 32); }
    if (P.torchOn && !P.dead) { const [sx, sy] = toScreen(P.x, P.y); const fx = sx + (DIRS[P.dir] && 'SW W NW'.includes(DIRS[P.dir]) ? -9 : 9), fy = sy - 34 + Math.sin(time * 20) * 0.6; ctx.fillStyle = 'rgba(255,200,90,0.95)'; ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 3, 3, 5); ctx.fillStyle = 'rgba(255,120,40,0.8)'; ctx.fillRect(Math.round(fx) - 2, Math.round(fy), 5, 3); }
    ctx.globalCompositeOperation = 'source-over';
    // arrows, dust, floating text
    for (const a of arrows) { const [sx, sy] = toScreen(a.x, a.y), [bx, by] = toScreen(a.x - a.vx * 0.04, a.y - a.vy * 0.04); ctx.strokeStyle = '#e8d8b0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, by - 26); ctx.lineTo(sx, sy - 26); ctx.stroke(); }
    for (const p of dust) { const [sx, sy] = toScreen(p.x, p.y); ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c; ctx.fillRect(Math.round(sx + p.ox), Math.round(sy + p.oy - p.t * 30), 3, 3); }
    ctx.globalAlpha = 1;
    if (marker && marker.t > 0) { const [sx, sy] = toScreen(marker.x, marker.y); ctx.strokeStyle = `rgba(255,214,110,${marker.t})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, 12 * (1.5 - marker.t * 0.5), 6 * (1.5 - marker.t * 0.5), 0, 0, Math.PI * 2); ctx.stroke(); }
    // night darkness with light holes
    drawNight(ox, oy, z);
    // floating text above the night layer
    ctx.setTransform(z, 0, 0, z, ox, oy); ctx.font = 'bold 10px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center';
    for (const f of floats) { const [sx, sy] = toScreen(f.x, f.y); ctx.globalAlpha = Math.max(0, 1 - f.t / 1.3); ctx.fillStyle = '#000'; ctx.fillText(f.text, sx + 1, sy - 70 - f.t * 22 + 1); ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy - 70 - f.t * 22); }
    ctx.globalAlpha = 1;
    if (G.rain) drawRain();
    drawFog(ox, oy, z, vl, vt, vr, vb);
  }
  function drawNight(ox, oy, z) {
    const n = nightness() * 0.88 + (G.rain ? 0.12 : 0); if (n <= 0.01) return;
    const k = 1 / 4, x = nightX; x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, nightC.width, nightC.height);
    x.fillStyle = `rgba(6,10,26,${n})`; x.fillRect(0, 0, nightC.width, nightC.height);
    x.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, r, s) => { const [sx, sy] = toScreen(wx, wy), px = (sx * z + ox) * k, py = (sy * z + oy) * k - 8 * z * k, rr = r * HWp * 1.15 * z * k; const g = x.createRadialGradient(px, py, rr * 0.15, px, py, rr); g.addColorStop(0, `rgba(0,0,0,${s})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); };
    for (const Lg of lights) hole(Lg.x, Lg.y, Lg.r * (0.95 + 0.05 * Math.sin(time * 7 + Lg.x)), 1);
    if (!P.dead) hole(P.x, P.y, 1.8, 0.75);
    x.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(nightC, 0, 0, W, H); ctx.imageSmoothingEnabled = false;
  }
  const rainDrops = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.7, 1.3) }));
  function drawRain() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(190,210,235,0.35)'; ctx.lineWidth = Math.max(1, dpr * 0.8); ctx.beginPath();
    for (const d of rainDrops) { const x = d.x * W, y = d.y * H; ctx.moveTo(x, y); ctx.lineTo(x - 6 * dpr, y + 18 * dpr * d.s); }
    ctx.stroke();
  }
  function drawFog(ox, oy, z, vl, vt, vr, vb) {
    const f = fogX, k = 1 / 8; f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, fogC.width, fogC.height);
    f.fillStyle = '#000'; f.fillRect(0, 0, fogC.width, fogC.height);
    f.setTransform(z * k, 0, 0, z * k, ox * k, oy * k);
    const sMin = Math.floor((vt - 40) / HHp) - 1, sMax = Math.ceil((vb + MAXLV * ZPX + 40) / HHp) + 1;
    const cMin = Math.floor(vl / HWp) - 2, cMax = Math.ceil(vr / HWp) + 2;
    dimC.width = fogC.width; dimC.height = fogC.height; dimX.setTransform(z * k, 0, 0, z * k, ox * k, oy * k); dimX.fillStyle = '#000';
    const corner = (i, j) => [(i - j) * HWp, (i + j) * HHp - Hv[clamp(i, 0, N) * (N + 1) + clamp(j, 0, N)] * ZPX];
    const poly = (g, i, j) => { const a = corner(i, j), b = corner(i + 1, j), c = corner(i + 1, j + 1), d = corner(i, j + 1); g.beginPath(); g.moveTo(a[0], a[1] - 2); g.lineTo(b[0] + 3, b[1]); g.lineTo(c[0], c[1] + 2); g.lineTo(d[0] - 3, d[1]); g.closePath(); g.fill(); };
    f.globalCompositeOperation = 'destination-out'; f.fillStyle = '#000';
    for (let s = sMin; s <= sMax; s++) for (let c = cMin; c <= cMax; c++) {
      if ((s + c) & 1) continue; const i = (s + c) / 2, j = (s - c) / 2; if (!inMap(i, j)) continue; const k2 = idx(i, j);
      if (!explored[k2]) continue; poly(f, i, j); if (!visible[k2]) poly(dimX, i, j);
    }
    f.globalCompositeOperation = 'source-over'; f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = S.fog.exploredAlpha; f.drawImage(dimC, 0, 0); f.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(fogC, 0, 0, W, H); ctx.imageSmoothingEnabled = false;
  }
  function puff(x, y, c, n = 6) { for (let k = 0; k < n; k++) dust.push({ x, y, ox: rand(-12, 12), oy: rand(-30, -5), c, t: 0, life: rand(0.4, 0.9) }); }

  // ================================================================== vision
  let lastVisKey = '';
  let exploredCount = 0;
  function updateVision(force) {
    const R = Math.round(nightness() > 0.6 ? (P.torchOn ? 6 : 4) : S.fog.visionRadiusTiles + (hAt(P.x, P.y) > 3.5 ? 2 : 0));
    const pi = Math.floor(P.x), pj = Math.floor(P.y), key = pi + ',' + pj + ',' + R + ',' + lights.length;
    if (key === lastVisKey && !force) return; lastVisKey = key;
    visible.fill(0);
    const mark = (i, j) => { if (!inMap(i, j)) return; const k = idx(i, j); visible[k] = 1; if (!explored[k]) { explored[k] = 1; miniPaint(i, j); } };
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (a * a + b * b <= R * R + 1) mark(pi + a, pj + b);
    for (const Lg of lights) if (!Lg.torch && Math.hypot(Lg.x - P.x, Lg.y - P.y) < 22) { const r = Math.ceil(Lg.r); for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r) mark(Math.floor(Lg.x) + a, Math.floor(Lg.y) + b); }
    for (const s of sites) if (!s.found && visible[idx(s.i, s.j)]) { s.found = true; message(`Discovered ${s.name}.`); }
    miniDirty = true;
  }
  function revealAround(x, y, R) { for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { if (a * a + b * b > R * R) continue; const i = Math.floor(x) + a, j = Math.floor(y) + b; if (!inMap(i, j)) continue; const k = idx(i, j); if (!explored[k]) { explored[k] = 1; miniPaint(i, j); } } miniDirty = true; }

  // ================================================================== update
  const keys = new Set();
  function nearestInteractable() {
    let best = null, bd = 1e9;
    for (const o of objects) { if (o.gone || Math.abs(o.x - P.x) > 4 || Math.abs(o.y - P.y) > 4) continue; const d = reachDist(o); if (d > (o.blocks ? 1.0 : 1.5) || d >= bd) continue; if (!actionFor(o)) continue; bd = d; best = o; }
    for (const u of units) { if (u === P || !u.dead) continue; const d = dist(u, P); if (d < 1.6 && d < bd && actionFor(u)) { bd = d; best = u; } }
    if (!best) { // water nearby?
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = Math.floor(P.x) + a, j = Math.floor(P.y) + b; if (inMap(i, j) && isWater(type[idx(i, j)])) return { water: true, x: i + 0.5, y: j + 0.5 }; }
    }
    return best;
  }
  function interactNearest() {
    const t = nearestInteractable();
    if (!t) { message('Nothing to use here. Tap something in the world to use it.'); return; }
    if (t.water) { P.thirst = 100; const skins = inv.waterskin || 0; if (skins) P.water = skins * 3; message(skins ? 'You drink and fill your waterskins.' : 'You drink the cool water.'); sfx('drink'); refreshUI(); return; }
    setTask(t);
  }
  function setTask(o) {
    const act = actionFor(o); if (!act) return false;
    P.task = { obj: o, act }; P.path = []; P.taskRepath = 0; return true;
  }
  function updateTask(dt) {
    const T = P.task; if (!T) return;
    const o = T.obj; if (o.gone || o.remove || (o.unit && o.dead && T.act.kind === 'attack')) { P.task = null; return; }
    const act = actionFor(o); if (!act || act.kind !== T.act.kind) { P.task = null; return; }
    const reach = reachOf(o, act), d = reachDist(o);
    if (d > reach) {
      P.taskRepath -= dt;
      if (!P.path.length || P.taskRepath <= 0) {
        P.taskRepath = o.unit ? 0.4 : 3;
        const ap = o.unit ? [o.x, o.y] : approachPoint(o, P);
        const p = ap ? findPath(P, ap[0], ap[1], 6000) : null;
        if (!p) { if (!o.unit) message("You can't reach that."); P.task = null; return; }
        P.path = p;
      }
      stepUnit(P, dt); return;
    }
    P.path = []; P.moving = false; face(P, o);
    if (act.kind === 'attack') { playerAttack(o); return; }
    if (P.swing || P.cdT > 0) return;
    if (needsSwing(act.kind)) {
      if (P.stamina < 4) return;
      P.stamina -= 4; P.cdT = 0.25;
      startSwing(() => { const again = perform(o, act); if (!again) P.task = null; }, 0.5);
    } else { perform(o, act); P.task = null; }
  }
  function update(dt) {
    time += dt;
    collectLights();
    if (!P.dead && !G.paused) {
      advanceTime(dt);
      // survival stats
      const nearFire = lights.some(Lg => Lg.fire && dist(Lg, P) < Lg.r * 0.7);
      P.hunger = Math.max(0, P.hunger - dt * 100 / 520);
      P.thirst = Math.max(0, P.thirst - dt * 100 / 400 * (G.rain ? 0.7 : 1));
      P.energy = Math.max(0, P.energy - dt * 100 / 1000 * (isNight() ? 1.4 : 1));
      const maxSt = P.energy < 20 ? 50 : 100;
      P.stamina = Math.min(maxSt, P.stamina + dt * (P.swing ? 0 : P.energy < 20 ? 9 : 20));
      if (P.hunger <= 0) damagePlayer(dt * 0.9, true); if (P.thirst <= 0) damagePlayer(dt * 1.2, true);
      if (P.hunger > 45 && P.thirst > 45 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + dt * (nearFire ? 0.6 : 0.3));
      for (const [k, v, t] of [['hunger', P.hunger, 'You are starving. Eat something.'], ['thirst', P.thirst, 'You are parched. Find water.'], ['energy', P.energy, 'You are exhausted. Sleep in a shelter.']]) { if (v < 20 && !P.warn[k]) { P.warn[k] = 1; message(t); } if (v > 35) P.warn[k] = 0; }
      if (P.torchOn) { P.torchT -= dt; if (P.torchT <= 0) { P.torchT = 0; P.torchOn = false; if (inv.torch) { toggleTorch(); message('You light a fresh torch.'); } else message('Your torch burns out.'); } }
      P.cdT = (P.cdT || 0) - dt;
      // weather
      G.rainT -= dt; if (G.rainT <= 0) { G.rain = !G.rain && Math.random() < 0.45; G.rainT = G.rain ? rand(70, 150) : rand(150, 320); if (G.rain) message('Rain begins to fall.'); }
      if (G.rain) for (const d of rainDrops) { d.y += dt * 1.6 * d.s; d.x -= dt * 0.25 * d.s; if (d.y > 1) { d.y = 0; d.x = Math.random() * 1.2; } }
      // structures
      for (const o of objects) {
        if (o.gone) continue;
        if (o.struct === 'campfire' && o.fuel > 0) { o.fuel -= dt * (G.rain ? 1.6 : 1); if (o.fuel <= 0) { o.fuel = 0; o.asset = 'campfire_out'; markDirty(o); if (dist(o, P) < 12) message('A campfire has burnt out.'); } }
        if (o.struct === 'rain_collector') { o.fillT = (o.fillT || 0) + dt * (G.rain ? 4 : 1); if (o.fillT > 80) { o.fillT = 0; o.water = Math.min(4, (o.water || 0) + 1); } }
        if (o.regrow > 0) { o.regrow -= dt; if (o.regrow <= 0) { o.regrow = 0; o.empty = false; if (o.wasBerry) { o.asset = 'berry_bush'; o.wasBerry = false; } markDirty(o); } }
      }
      // player movement: keyboard / swing / task
      if (P.swing) {
        P.swing.t += dt;
        if (!P.swing.hit && P.swing.t >= P.swing.dur * 0.55) { P.swing.hit = true; P.swing.onHit(); }
        if (P.swing.t >= P.swing.dur) P.swing = null;
      } else {
        let kx = 0, ky = 0;
        if (keys.has('w') || keys.has('arrowup')) ky -= 1; if (keys.has('s') || keys.has('arrowdown')) ky += 1;
        if (keys.has('a') || keys.has('arrowleft')) kx -= 1; if (keys.has('d') || keys.has('arrowright')) kx += 1;
        if (kx || ky) {
          P.path = []; P.task = null; const l = Math.hypot(kx, ky); kx /= l; ky /= l;
          let dx = ky + kx / 2, dy = ky - kx / 2; const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
          const sp = P.speed * dt * (P.energy < 10 ? 0.7 : 1);
          const tryMove = (mx, my) => { const nx = P.x + mx * sp, ny = P.y + my * sp; if (walkableAt(nx, ny)) { P.x = nx; P.y = ny; return true; } return false; };
          if (!tryMove(dx, dy)) { if (!tryMove(dx, 0)) tryMove(0, dy); }
          P.dir = dirFromVec(dx, dy); P.moving = true; P.walkT += dt; cam.follow = true;
        } else if (P.task) updateTask(dt);
        else stepUnit(P, dt);
      }
      // creatures
      spawnHollows(dt);
      G.animalT -= dt; if (G.animalT <= 0) { G.animalT = 60; const prey = units.filter(u => (u.kind === 'deer' || u.kind === 'boar') && !u.dead).length; if (prey < 22) spawnWildlife(rng((Math.random() * 1e9) | 0), false); }
      for (const u of units) {
        if (u === P) continue;
        if (u.rise) { u.fade = Math.min(1, u.fade + dt * 0.8); if (u.fade >= 1) u.rise = false; }
        updateUnit(u, dt);
      }
      // keep hostile creatures from stacking on each other
      for (let a = 0; a < units.length; a++) { const u = units[a]; if (u === P || u.dead) continue; for (let b = a + 1; b < units.length; b++) { const v = units[b]; if (v === P || v.dead) continue; const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy); if (d < 0.35 && d > 0.001) { const push = (0.35 - d) * 0.5; const nx = dx / d * push, ny = dy / d * push; if (walkableAt(u.x - nx, u.y - ny)) { u.x -= nx; u.y -= ny; } if (walkableAt(v.x + nx, v.y + ny)) { v.x += nx; v.y += ny; } } } }
      for (let k = units.length - 1; k >= 0; k--) if (units[k].remove) units.splice(k, 1);
      // arrows
      for (const a of arrows) {
        a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt;
        if (!walkableAt(a.x, a.y) && !isWater(type[idx(clamp(Math.floor(a.x), 0, N - 1), clamp(Math.floor(a.y), 0, N - 1))])) a.life = 0;
        for (const u of units) if (u !== P && !u.dead && Math.hypot(u.x - a.x, u.y - a.y) < 0.45) { hurtUnit(u, a.dmg, P); a.life = 0; sfx('hit'); break; }
      }
      for (let k = arrows.length - 1; k >= 0; k--) if (arrows[k].life <= 0) arrows.splice(k, 1);
      updateVision(false);
    } else if (P.dead) { P.walkT += dt; }
    for (const f of floats) f.t += dt; for (let k = floats.length - 1; k >= 0; k--) if (floats[k].t > 1.3) floats.splice(k, 1);
    for (const p of dust) p.t += dt; for (let k = dust.length - 1; k >= 0; k--) if (dust[k].t > dust[k].life) dust.splice(k, 1);
    if (cam.follow) { const [sx, sy] = toScreen(P.x, P.y); const k = 1 - Math.exp(-dt * 6); cam.x += (sx - cam.x) * k; cam.y += (sy - 20 - cam.y) * k; }
    { // chunk prefetch + budgeted painting
      const z = zoom(), vl = cam.x - W / z / 2, vt = cam.y - H / z / 2, m = 2;
      for (let cy = Math.floor(vt / CH) - m; cy <= Math.floor((vt + H / z) / CH) + m; cy++) for (let cx = Math.floor(vl / CH) - m; cx <= Math.floor((vl + W / z) / CH) + m; cx++) {
        const key = cx + ',' + cy; if (!chunks.has(key) && !queued.has(key)) { queued.add(key); chunkQueue.push(key); }
      }
      const t0 = performance.now();
      while (chunkQueue.length && performance.now() - t0 < 8) { const key = chunkQueue.shift(); queued.delete(key); if (!chunks.has(key)) { const [cx, cy] = key.split(',').map(Number); chunks.set(key, renderChunk(cx, cy)); } }
    }
    for (const s of sparkles) s.t += dt; for (let i = sparkles.length - 1; i >= 0; i--) if (sparkles[i].t > sparkles[i].life) sparkles.splice(i, 1);
    if (sparkles.length < 50) for (let n = 0; n < 3; n++) {
      const z = zoom(), sx = cam.x + (Math.random() - 0.5) * W / z, sy = cam.y + (Math.random() - 0.5) * H / z;
      const x = sy / (2 * HHp) + sx / (2 * HWp), y = sy / (2 * HHp) - sx / (2 * HWp); const i = Math.floor(x), j = Math.floor(y);
      if (inMap(i, j) && isWater(type[idx(i, j)]) && visible[idx(i, j)] && waterDist[idx(i, j)] > 0.5) sparkles.push({ sx, sy, t: 0, life: 0.8 + Math.random() });
    }
    if (marker) marker.t -= dt * 1.2;
    hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
    const low = P.hp < 30 && !P.dead ? 0.35 + 0.15 * Math.sin(time * 5) : 0;
    $('hurt').style.boxShadow = `inset 0 0 ${120 * dpr / dpr}px 40px rgba(180,0,0,${Math.max(hurtFlash * 0.6, low)})`;
    ambience();
    if (miniDirty || ((time * 4) | 0) !== lastMiniTick) { lastMiniTick = (time * 4) | 0; drawMini(); }
    uiTick();
  }
  let lastMiniTick = 0;

  // ================================================================== audio (synthesised)
  const AU = { ctx: null, on: true, wind: null, drone: null };
  function audioInit() {
    if (AU.ctx) return; try { AU.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = AU.ctx, len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(c.destination); src.start(); AU.wind = g; AU.windF = f;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 46; const of = c.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 160; const og = c.createGain(); og.gain.value = 0; o.connect(of); of.connect(og); og.connect(c.destination); o.start(); AU.drone = og;
  }
  function ambience() {
    if (!AU.ctx || !AU.on) { if (AU.wind) { AU.wind.gain.value = 0; AU.drone.gain.value = 0; } return; }
    const n = nightness(); AU.wind.gain.setTargetAtTime((G.rain ? 0.09 : 0.03) + 0.02 * Math.sin(time * 0.3), AU.ctx.currentTime, 0.5); AU.windF.frequency.value = G.rain ? 1400 : 500;
    AU.drone.gain.setTargetAtTime(n * 0.035 * (G.paused ? 0 : 1), AU.ctx.currentTime, 1);
  }
  function tone(f0, f1, dur, typ = 'sine', vol = 0.2, delay = 0) {
    const c = AU.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = typ; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, typ = 'lowpass', delay = 0) {
    const c = AU.ctx, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = AU.noise; const f = c.createBiquadFilter(); f.type = typ; f.frequency.value = freq; const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(c.destination); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function sfx(name) {
    if (!AU.ctx || !AU.on) return;
    switch (name) {
      case 'chop': noise(0.12, 0.5, 900); tone(160, 90, 0.09, 'square', 0.12); break;
      case 'mine': noise(0.08, 0.45, 3000, 'highpass'); tone(700, 500, 0.06, 'triangle', 0.1); break;
      case 'fall': noise(0.6, 0.4, 300); tone(90, 40, 0.5, 'sine', 0.3, 0.1); break;
      case 'rustle': noise(0.18, 0.25, 2500, 'bandpass'); break;
      case 'hit': noise(0.08, 0.5, 1800); tone(220, 120, 0.08, 'square', 0.12); break;
      case 'swish': noise(0.12, 0.18, 4000, 'highpass'); break;
      case 'thud': noise(0.15, 0.5, 400); break;
      case 'hurt': tone(300, 120, 0.25, 'sawtooth', 0.18); noise(0.1, 0.3, 1200); break;
      case 'die': tone(200, 50, 0.7, 'sawtooth', 0.2); break;
      case 'hollowdie': tone(500, 60, 0.9, 'sine', 0.15); noise(0.8, 0.2, 800, 'bandpass'); break;
      case 'growl': tone(80, 55, 0.9, 'sawtooth', 0.1); noise(0.7, 0.08, 300, 'bandpass'); break;
      case 'eat': noise(0.06, 0.3, 1500, 'bandpass'); noise(0.06, 0.3, 1500, 'bandpass', 0.12); break;
      case 'heal': tone(500, 800, 0.25, 'sine', 0.12); break;
      case 'drink': tone(400, 900, 0.15, 'sine', 0.12); tone(450, 1000, 0.15, 'sine', 0.1, 0.18); break;
      case 'craft': tone(600, 600, 0.07, 'triangle', 0.15); tone(800, 800, 0.07, 'triangle', 0.15, 0.09); break;
      case 'build': noise(0.25, 0.5, 500); tone(140, 90, 0.2, 'square', 0.1, 0.05); break;
      case 'break': noise(0.4, 0.5, 700); break;
      case 'loot': tone(700, 700, 0.06, 'square', 0.08); tone(1050, 1050, 0.1, 'square', 0.08, 0.07); break;
      case 'relic': [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.35, 'triangle', 0.12, i * 0.12)); break;
      case 'fire': noise(0.4, 0.3, 900, 'bandpass'); break;
      case 'bow': tone(300, 120, 0.15, 'triangle', 0.15); break;
      case 'night': tone(110, 80, 2.0, 'sine', 0.12); tone(165, 120, 2.0, 'sine', 0.06, 0.3); break;
    }
  }

  // ================================================================== UI
  const msgBox = $('msgs');
  function message(t) {
    const d = document.createElement('div'); d.textContent = t; msgBox.appendChild(d);
    while (msgBox.children.length > 4) msgBox.removeChild(msgBox.firstChild);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 700); }, 5000);
  }
  const STATS = [['hp', 'Health', '#d8463a'], ['hunger', 'Food', '#d9903a'], ['thirst', 'Water', '#3f9ad8'], ['stamina', 'Stamina', '#c9c04a'], ['energy', 'Energy', '#8a6ad0']];
  $('stats').innerHTML = STATS.map(([k, n, c]) => `<div class="stat" id="st-${k}"><span>${n}</span><div class="bar"><i style="background:${c}"></i></div></div>`).join('') + '<div class="stat" id="st-armor" style="display:none"><span>Armor</span><div class="bar"><i style="background:#9a8a70"></i></div></div>';
  function uiTick() {
    if (!P) return;
    for (const [k] of STATS) { const v = k === 'hp' ? P.hp / P.maxHp * 100 : P[k]; const el = $('st-' + k); el.querySelector('i').style.width = clamp(v, 0, 100) + '%'; el.classList.toggle('low', v < 20); }
    const ar = $('st-armor'); ar.style.display = P.armorHP > 0 ? 'flex' : 'none'; if (P.armorHP > 0) ar.querySelector('i').style.width = clamp(P.armorHP / 220 * 100, 0, 100) + '%';
    $('day').textContent = G.day; $('tod').textContent = todLabel() + (G.rain ? ' · Rain' : ''); $('relics').textContent = `${inv.relic || 0}/8`;
    drawClock();
    // context prompt
    let label = '';
    if (P.dead) label = '';
    else if (placing) label = '';
    else if (P.task) label = P.task.act.label + '…';
    else { const t = nearestInteractable(); if (t) label = t.water ? 'Drink water' : actionFor(t).label; }
    if (label !== lastPrompt) { lastPrompt = label; $('prompt').textContent = label ? (matchMedia('(hover:hover)').matches ? '[E] ' : '') + label : ''; $('use').querySelector('.lbl').textContent = label ? label.replace(/\(.*\)/, '').slice(0, 22) : 'Use'; }
  }
  let lastPrompt = null;
  const clockX = $('clock').getContext('2d');
  function drawClock() {
    const x = clockX, r = 24; x.clearRect(0, 0, 52, 52);
    x.fillStyle = '#0d1424'; x.beginPath(); x.arc(26, 26, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5a8ac0'; x.beginPath(); x.moveTo(26, 26); x.arc(26, 26, r, -Math.PI / 2 + 0.0, -Math.PI / 2 + 0.62 * Math.PI * 2); x.closePath(); x.fill();
    x.fillStyle = '#c87a3a'; x.beginPath(); x.moveTo(26, 26); x.arc(26, 26, r, -Math.PI / 2 + 0.62 * Math.PI * 2, -Math.PI / 2 + 0.72 * Math.PI * 2); x.closePath(); x.fill();
    const a = -Math.PI / 2 + G.tod * Math.PI * 2; x.strokeStyle = '#ffd36a'; x.lineWidth = 3; x.beginPath(); x.moveTo(26, 26); x.lineTo(26 + Math.cos(a) * 20, 26 + Math.sin(a) * 20); x.stroke();
    x.strokeStyle = '#b08a3e'; x.lineWidth = 2; x.beginPath(); x.arc(26, 26, r, 0, Math.PI * 2); x.stroke();
  }
  function iconImg(k) { return ICON[k] || ''; }
  function setBtnIcon(id, k) { const img = $(id).querySelector('img'); if (img && img.dataset.k !== k) { img.dataset.k = k; img.src = iconImg(k); } }
  function refreshUI() {
    if (!P) return;
    const w = P.weapon; setBtnIcon('b-weapon', w === 'fists' ? 'hide' : w); $('b-weapon').querySelector('.lbl').textContent = WEAPONS[w].name;
    $('b-weapon').querySelector('.n').textContent = w === 'bow' ? (inv.arrow || 0) : '';
    setBtnIcon('b-attack', w === 'fists' ? 'stone' : w === 'bow' ? 'arrow' : w); setBtnIcon('use', 'herb');
    setBtnIcon('b-torch', 'torch'); $('b-torch').classList.toggle('on', P.torchOn); $('b-torch').querySelector('.n').textContent = (inv.torch || 0) + (P.torchOn ? '*' : '');
    setBtnIcon('b-pack', 'cloth'); setBtnIcon('b-build', 'log');
    if (!$('pack').classList.contains('hidden')) renderPack();
    if (!$('build').classList.contains('hidden')) renderBuild();
  }
  function costHTML(cost) { return '<div class="cost">' + Object.entries(cost).map(([k, n]) => `<span class="${(inv[k] || 0) >= n ? '' : 'no'}"><img src="${iconImg(k)}">${inv[k] || 0}/${n}</span>`).join('') + '</div>'; }
  let packTab = 'inv';
  function renderPack() {
    const order = Object.keys(ITEMS).filter(k => inv[k]);
    $('invgrid').innerHTML = order.length ? order.map(k => {
      const it = ITEMS[k], eq = (it.weapon && P.weapon === it.weapon) || (k === 'torch' && P.torchOn);
      const extra = k === 'waterskin' ? ` (${P.water}/${inv.waterskin * 3})` : '';
      return `<div class="slot frame${eq ? ' eq' : ''}" data-item="${k}" title="${it.name}${it.note ? ' — ' + it.note : ''}"><span class="c">${inv[k]}</span><img src="${iconImg(k)}"><div>${it.name}${extra}</div><div style="opacity:.7">${it.verb ? (it.weapon && P.weapon === it.weapon ? 'Unequip' : it.verb) : ''}</div></div>`;
    }).join('') : '<p>Your pack is empty.</p>';
    $('recipes').innerHTML = RECIPES.map((r, i) => `<div class="rec"><img class="o" src="${iconImg(r.out)}"><div class="t"><b>${ITEMS[r.out].name}${r.n > 1 ? ' ×' + r.n : ''}</b><div style="opacity:.75;font-size:12px">${r.desc}</div>${costHTML(r.cost)}</div><button class="frame" data-craft="${i}" ${have(r.cost) ? '' : 'disabled'}>Craft</button></div>`).join('');
  }
  const thumbCache = {};
  function thumb(asset) {
    if (thumbCache[asset]) return thumbCache[asset];
    const a = SPR[asset], c = document.createElement('canvas'), sc = Math.min(1, 120 / a.w, 90 / a.h); c.width = Math.round(a.w * sc); c.height = Math.round(a.h * sc);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(a.img, 0, 0, a.w, a.h, 0, 0, c.width, c.height); return thumbCache[asset] = c.toDataURL();
  }
  function renderBuild() {
    $('blist').innerHTML = Object.entries(STRUCTS).map(([k, d]) => `<div class="rec"><img class="bthumb" src="${thumb(d.asset)}" style="object-fit:contain"><div class="t"><b>${d.name}</b><div style="opacity:.75;font-size:12px">${d.desc}</div>${costHTML(d.cost)}</div><button class="frame" data-build="${k}" ${have(d.cost) ? '' : 'disabled'}>Build</button></div>`).join('');
  }
  let storageObj = null;
  function openStorage(o) { storageObj = o; renderStorage(); show('storage'); }
  function renderStorage() {
    const st = storageObj.store, ks = Object.keys(st).filter(k => st[k] > 0);
    $('stgrid').innerHTML = ks.length ? ks.map(k => `<div class="slot frame" data-take="${k}"><span class="c">${st[k]}</span><img src="${iconImg(k)}"><div>${ITEMS[k].name}</div></div>`).join('') : '<p style="opacity:.7">Empty.</p>';
  }
  $('st-put').onclick = () => { const st = storageObj.store; for (const k of ['log', 'stick', 'stone', 'fiber', 'rope', 'hide', 'cloth', 'herb', 'berries', 'meat_cooked', 'arrow']) if (inv[k]) { st[k] = (st[k] || 0) + inv[k]; delete inv[k]; } markDirty(storageObj); renderStorage(); refreshUI(); sfx('loot'); };
  $('st-take').onclick = () => { const st = storageObj.store; for (const k of Object.keys(st)) { const took = addItem(k, st[k], true); st[k] -= took; if (st[k] <= 0) delete st[k]; } markDirty(storageObj); renderStorage(); refreshUI(); sfx('loot'); };
  $('stgrid').addEventListener('click', e => { const s = e.target.closest('[data-take]'); if (!s) return; const k = s.dataset.take, st = storageObj.store; const took = addItem(k, st[k], true); st[k] -= took; if (st[k] <= 0) delete st[k]; renderStorage(); refreshUI(); });
  $('invgrid').addEventListener('click', e => { const s = e.target.closest('[data-item]'); if (s) { useItem(s.dataset.item); renderPack(); } });
  $('recipes').addEventListener('click', e => { const b = e.target.closest('[data-craft]'); if (b) { craft(RECIPES[+b.dataset.craft]); renderPack(); } });
  $('blist').addEventListener('click', e => { const b = e.target.closest('[data-build]'); if (b) startPlacing(b.dataset.build); });
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { packTab = b.dataset.tab; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $('tab-inv').classList.toggle('hidden', packTab !== 'inv'); $('tab-craft').classList.toggle('hidden', packTab !== 'craft'); });
  const MODALS = ['pack', 'build', 'storage', 'menu', 'help'];
  function show(id) { $(id).classList.remove('hidden'); updatePause(); }
  function hide(id) { $(id).classList.add('hidden'); updatePause(); }
  function closeModals() { MODALS.forEach(m => $(m).classList.add('hidden')); updatePause(); }
  function anyModal() { return MODALS.some(m => !$(m).classList.contains('hidden')) || ['title', 'dead', 'win'].some(m => !$(m).classList.contains('hidden')); }
  function updatePause() { G.paused = anyModal(); }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { const m = b.closest('.modal'); if (m) hide(m.id); }));
  function openPack(tab) { if (tab) document.querySelector(`.tabs button[data-tab="${tab}"]`).click(); renderPack(); show('pack'); }
  $('b-pack').onclick = () => openPack(); $('b-build').onclick = () => { renderBuild(); show('build'); };
  $('b-weapon').onclick = () => cycleWeapon(); $('b-torch').onclick = () => toggleTorch();
  $('b-attack').onclick = () => { audioInit(); const t = attackTargetAvailable(); if (t) { if (dist(t, P) <= WEAPONS[P.weapon].reach) playerAttack(t); else setTask(t); } else playerAttack(null); };
  $('use').onclick = () => { audioInit(); interactNearest(); };
  $('btn-menu').onclick = () => show('menu'); $('m-help').onclick = () => { hide('menu'); show('help'); }; $('t-help').onclick = () => show('help');
  $('m-save').onclick = () => { if (hostilesNear(8)) { message("You can't save with enemies nearby."); return; } message(saveGame() ? 'Game saved.' : 'Saving is not available in this browser.'); hide('menu'); };
  $('m-sound').onclick = () => { AU.on = !AU.on; $('m-sound').textContent = 'Sound: ' + (AU.on ? 'on' : 'off'); };
  $('m-quit').onclick = () => { closeModals(); titleScreen(); };
  $('place-cancel').onclick = () => stopPlacing();
  $('zin').onclick = () => setZoom(zi + 1); $('zout').onclick = () => setZoom(zi - 1); $('center').onclick = () => { cam.follow = true; };

  // minimap
  const miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = N; const miniBX = miniBase.getContext('2d'); let miniImg = miniBX.createImageData(N, N), miniDirty = true;
  const MINI_COL = { deep: '#1f4f78', shallow: '#3f8ea0', sand: '#d2bb84', grass: '#6b8a3a', grassLush: '#4f7a2e', dryGrass: '#a39352', dirt: '#8a6a45', road: '#b0946a', forestFloor: '#2f4a22', rock: '#8a857a', snow: '#e8eef2' };
  const MC = TT.map(t => PAL.hex(MINI_COL[t.id]));
  function miniPaint(i, j) { const k = idx(i, j), c = MC[type[k]], o = (i * N + j) * 4, sh = isWater(type[k]) ? 1 : 0.8 + lvl[k] * 0.05; miniImg.data[o] = c[0] * sh; miniImg.data[o + 1] = c[1] * sh; miniImg.data[o + 2] = c[2] * sh; miniImg.data[o + 3] = 255; }
  function drawMini() {
    miniDirty = false; miniBX.putImageData(miniImg, 0, 0);
    const m = $('mini'), x = m.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, m.width, m.height);
    const sc = m.width / (2 * N); x.setTransform(sc, sc / 2, -sc, sc / 2, m.width / 2, 0); x.imageSmoothingEnabled = false;
    x.fillStyle = '#07090b'; x.fillRect(0, 0, N, N);
    x.save(); x.transform(0, 1, 1, 0, 0, 0); x.drawImage(miniBase, 0, 0); x.restore();
    if (nightness() > 0.3) { x.fillStyle = `rgba(6,10,26,${nightness() * 0.45})`; x.fillRect(0, 0, N, N); }
    for (const o of objects) { if (o.gone || !explored[idx(Math.floor(o.x), Math.floor(o.y))]) continue; if (o.relic) { x.fillStyle = '#ffd36a'; x.fillRect(o.x - 1, o.y - 1, 2, 2); } else if (o.struct && !o.world) { x.fillStyle = '#ff9a40'; x.fillRect(o.x - 0.7, o.y - 0.7, 1.4, 1.4); } else if (SPR[o.asset].category === 'building') { x.fillStyle = '#c8b090'; x.fillRect(o.x - 0.6, o.y - 0.6, 1.2, 1.2); } }
    for (const u of units) if (!u.dead && u !== P && visible[idx(Math.floor(u.x), Math.floor(u.y))] && KINDS[u.kind] && KINDS[u.kind].hostile) { x.fillStyle = '#ff4030'; x.fillRect(u.x - 0.8, u.y - 0.8, 1.6, 1.6); }
    x.fillStyle = Math.floor(time * 3) % 2 ? '#fff' : '#5fa0ff'; x.fillRect(P.x - 1.2, P.y - 1.2, 2.4, 2.4);
  }
  $('mini').addEventListener('pointerdown', e => {
    const r = e.currentTarget.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * 2 * N - N, my = (e.clientY - r.top) / r.height * N;
    const i = (my + mx / 2), j = (my - mx / 2); if (!inMap(Math.floor(i), Math.floor(j))) return;
    const [sx, sy] = toScreen(i, j); cam.x = sx; cam.y = sy; cam.follow = false; e.stopPropagation();
  });

  // ================================================================== input
  function setZoom(n) { zi = clamp(n, 0, ZOOMS.length - 1); }
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); audioInit();
    if (e.target.tagName === 'INPUT') return;
    if (k === 'escape') { if (placing) stopPlacing(); else if (anyModal() && $('title').classList.contains('hidden') && $('dead').classList.contains('hidden') && $('win').classList.contains('hidden')) closeModals(); else if (G.started && !P.dead) show('menu'); return; }
    if (!G.started || P.dead) return;
    if (k === 'tab' || k === 'i') { e.preventDefault(); if ($('pack').classList.contains('hidden')) openPack(); else hide('pack'); return; }
    if (k === 'b') { if ($('build').classList.contains('hidden')) { renderBuild(); show('build'); } else hide('build'); return; }
    if (k === 'c' && !anyModal()) { cam.follow = true; return; }
    if (anyModal()) return;
    keys.add(k); if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    if (k === '+' || k === '=') setZoom(zi + 1); if (k === '-') setZoom(zi - 1);
    if (k === 'e') interactNearest(); if (k === 'f' || k === ' ') $('b-attack').onclick(); if (k === 'q') cycleWeapon(); if (k === 't') toggleTorch();
    if (k === 'h') cam.follow = true;
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  let wheelAcc = 0;
  cv.addEventListener('wheel', e => { e.preventDefault(); wheelAcc += e.deltaY; if (Math.abs(wheelAcc) > 80) { setZoom(zi + (wheelAcc < 0 ? 1 : -1)); wheelAcc = 0; } }, { passive: false });
  const ptrs = new Map(); let pinch = null, dragged = false;
  cv.addEventListener('pointerdown', e => { audioInit(); cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); dragged = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zi }; } });
  cv.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && G.started) { const w = screenToGround(e.clientX * dpr, e.clientY * dpr); if (placing && w) { const g = snapPlace(placing.type, w[0], w[1]); const [sx, sy] = toScreen(g.x, g.y); ghost = Object.assign(g, { sx, sy }); } hoverObj = pickAt(e.clientX * dpr, e.clientY * dpr); }
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; const r = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; setZoom(pinch.z + Math.round(Math.log2(r) * 2)); dragged = true; return; }
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 12) { dragged = true; cam.follow = false; cam.x -= dx * dpr / zoom(); cam.y -= dy * dpr / zoom(); }
  });
  const endPtr = e => { const p = ptrs.get(e.pointerId); if (!p) return; if (!dragged && e.type === 'pointerup' && ptrs.size === 1) tap(p.x * dpr, p.y * dpr); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  function screenToGround(px, py) {
    const z = zoom(), ax = (px - W / 2) / z + cam.x, ay = (py - H / 2) / z + cam.y, c = ax / HWp;
    for (let s = (ay + MAXLV * ZPX) / HHp + 1; s > ay / HHp - 1; s -= 1 / 64) { const x = (s + c) / 2, y = (s - c) / 2; if (x < 0 || y < 0 || x >= N || y >= N) continue; const sy = s * HHp - hAt(x, y) * ZPX; if (sy <= ay) return [x, y]; }
    return null;
  }
  // pick the front-most unit or object whose sprite contains the screen point
  function pickAt(px, py) {
    const z = zoom(), ax = (px - W / 2) / z + cam.x, ay = (py - H / 2) / z + cam.y;
    let best = null, bdepth = -1e9;
    const test = (o, isUnit) => {
      const i = Math.floor(o.x), j = Math.floor(o.y); if (!inMap(i, j)) return;
      if (isUnit ? !visible[idx(i, j)] : !explored[idx(i, j)]) return;
      if (!actionFor(o)) return;
      const [sx, sy] = toScreen(o.x, o.y), fw = o.fp ? o.fp[0] : 1;
      const halfW = isUnit ? 16 : 20 + (fw - 1) * 40, top = isUnit ? (o.kind === 'brute' ? 80 : 56) : Math.min(SPR[o.asset].ay - 10, TREE.test(o.asset) ? 130 : 70 * fw);
      if (ax < sx - halfW || ax > sx + halfW || ay < sy - top || ay > sy + 10) return;
      const depth = o.x + o.y + (isUnit ? 0.5 : 0);
      if (depth > bdepth) { bdepth = depth; best = o; }
    };
    for (const u of units) if (u !== P) test(u, true);
    if (!best) for (const o of objects) if (!o.gone) test(o, false);
    return best;
  }
  function tap(px, py) {
    if (!G.started || P.dead || G.paused) return;
    const w = screenToGround(px, py);
    if (placing) { if (w) placeAt(w[0], w[1]); return; }
    const o = pickAt(px, py);
    if (o) { setTask(o); marker = { x: o.x, y: o.y, t: 1 }; cam.follow = true; return; }
    if (!w || !explored[idx(Math.floor(w[0]), Math.floor(w[1]))]) return;
    let [tx, ty] = w;
    if (isWater(type[idx(Math.floor(tx), Math.floor(ty))]) && Math.hypot(tx - P.x, ty - P.y) < 2.2) { interactNearest(); return; }
    if (!walkableAt(tx, ty)) {
      let best = null, bd = 9; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const x = Math.floor(tx) + a + 0.5, y = Math.floor(ty) + b + 0.5; if (walkableAt(x, y)) { const d = Math.hypot(x - P.x, y - P.y); if (d < bd) { bd = d; best = [x, y]; } } }
      if (!best) return; [tx, ty] = best;
    }
    P.task = null; const p = findPath(P, tx, ty, 8000); if (p) { P.path = p; marker = { x: tx, y: ty, t: 1 }; cam.follow = true; }
  }

  // ================================================================== boot & game flow
  function spawnPlayer(x, y) {
    units = units.filter(u => u.kind !== 'player');
    P = addUnit('player', x, y, { asset: 'explorer', speed: 2.6, hp: 100, maxHp: 100 });
    P.warn = {};
  }
  function startView() {
    const [sx, sy] = toScreen(P.x, P.y); cam.x = sx; cam.y = sy - 20; cam.follow = true;
    const want = W / clamp(innerWidth * 1.6, 640, 1300); let best = 0;
    ZOOMS.forEach((zz, n) => { if (Math.abs(Math.log(zz / want)) < Math.abs(Math.log(ZOOMS[best] / want))) best = n; }); zi = best;
    chunks.clear(); chunkQueue = []; queued.clear(); lastVisKey = ''; miniImg = miniBX.createImageData(N, N);
    for (let k = 0; k < N * N; k++) if (explored[k]) miniPaint(k / N | 0, k % N);
    collectLights(); updateVision(true);
    const z = zoom(), vl = cam.x - W / z / 2, vt = cam.y - H / z / 2;
    for (let cy = Math.floor(vt / CH) - 1; cy <= Math.floor((vt + H / z) / CH) + 1; cy++) for (let cx = Math.floor(vl / CH) - 1; cx <= Math.floor((vl + W / z) / CH) + 1; cx++) getChunk(cx, cy, true);
    lastNight = isNight(); G.started = true; refreshUI();
  }
  async function newGame() {
    closeModals(); ['title', 'dead', 'win'].forEach(id => $(id).classList.add('hidden'));
    $('loading').classList.remove('hidden'); $('lmsg').textContent = 'shaping a new island…'; await new Promise(r => setTimeout(r, 30));
    Object.assign(G, { day: 1, tod: 0.1, rain: false, rainT: 240, beacon: null, won: false, spawnT: 5, animalT: 60, hollowsKilled: 0, beaconNight: false });
    genWorld((Math.random() * 1e9) | 0);
    spawnPlayer(start[0] + 0.5, start[1] + 0.5); newPlayerState(); setWeapon('fists');
    trapAt.clear();
    startView(); $('loading').classList.add('hidden'); updatePause();
    message('You wake on the Lantern Isles beside a cold fire pit.');
    setTimeout(() => message('Gather sticks, fiber and stones by hand, then craft rope and a stone axe (Pack → Crafting).'), 2500);
    setTimeout(() => message('Before night falls, relight the fire pit and stay in its light.'), 7000);
    saveGame();
  }
  async function continueGame() {
    const d = loadSave(); if (!d) return newGame();
    closeModals(); ['title', 'dead', 'win'].forEach(id => $(id).classList.add('hidden'));
    $('loading').classList.remove('hidden'); $('lmsg').textContent = 'returning to the isles…'; await new Promise(r => setTimeout(r, 30));
    trapAt.clear(); applySave(d); P.dead = false; P.task = null; P.swing = null; P.path = [];
    startView(); $('loading').classList.add('hidden'); updatePause();
    message(`Day ${G.day}. Welcome back.`);
  }
  function titleScreen() {
    G.started = false; $('t-cont').classList.toggle('hidden', !loadSave()); show('title');
  }
  $('t-new').onclick = () => { audioInit(); if (loadSave() && !confirmNew()) return; newGame(); };
  function confirmNew() { return $('t-new').dataset.armed === '1' || (($('t-new').dataset.armed = '1'), $('t-new').textContent = 'Start over? (tap again)', false); }
  $('t-cont').onclick = () => { audioInit(); continueGame(); };
  $('d-load').onclick = () => continueGame(); $('d-new').onclick = () => newGame();
  $('w-cont').onclick = () => { hide('win'); G.wonSafe = false; }; $('w-new').onclick = () => newGame();

  (async function boot() {
    const bar = document.querySelector('#bar i');
    resize();
    await loadAssets(p => bar.style.width = (p * 100) + '%');
    $('loading').classList.add('hidden');
    titleScreen();
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (G.started && P) { update(G.paused && !P.dead ? 0 : dt); draw(); }
      requestAnimationFrame(loop);
    })(last);
    window.GAME = { G, get P() { return P; }, inv, get objects() { return objects; }, get units() { return units; }, get sites() { return sites; }, newGame, continueGame, saveGame, addItem, addStruct, setTask, craft, RECIPES, STRUCTS, revealAll: () => { explored.fill(1); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) miniPaint(i, j); miniDirty = true; }, cam, setZoom, toScreen, spawn: (k, x, y) => addUnit(k, x, y), startPlacing, placeAt, perform, actionFor };
    window.__ready = true;
  })().catch(e => { $('lmsg').textContent = 'Error: ' + e.message; console.error(e); });
})();
