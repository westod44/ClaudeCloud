/*
 * Lantern Isles — Survival.
 * Requires: style.js, palette.js, noise.js, data.js, audio.js, weather.js, portrait.js, assets/atlas*.js
 */
(function () {
  'use strict';
  const S = STYLE, NZ = NOISE, AU = AUDIO, WX = WEATHER;
  const { fbm2, noise2, hash, rng, clamp } = NZ;
  const { ITEMS, WEAPONS, RECIPES, STRUCTS, BUILD_CATS, KINDS, NIGHT_SPAWNS } = DATA;
  const HWp = S.projection.tile.w / 2, HHp = S.projection.tile.h / 2, ZPX = S.projection.elevation.pxPerLevel;
  const LV_UNITS = ZPX / S.projection.pxPerUnitZ;
  const N = 96, MAXLV = 7, CH = 128;
  const DAY_SECONDS = 480;
  const SAVE_KEY = 'lantern-isles-survival-v2';
  const $ = id => document.getElementById(id);
  const TYPES = {}; S.terrain.types.forEach((t, k) => { TYPES[t.id] = k; t.k = k; });
  const TT = S.terrain.types;
  const isWater = k => k === TYPES.deep || k === TYPES.shallow;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

  // ================================================================== assets
  const SPR = {}, TEX = {}, ICON = {};
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src)); document.head.appendChild(s); }); }
  async function loadAssets(progress) {
    const A = window.ATLAS;
    for (let k = 0; k < (A.chunks || 0); k++) { await loadScript(`assets/atlas-${k}.js`); progress(0.4 * (k + 1) / A.chunks); }
    const list = A.manifest.assets; let n = 0; const total = list.length + A.manifest.terrain.length;
    await Promise.all(list.map(async a => {
      SPR[a.name] = Object.assign({}, a, { img: await loadImg(A.images[a.name]), sh: A.images[a.name + '_shadow'] ? await loadImg(A.images[a.name + '_shadow']) : null });
      if (a.name.startsWith('icon_')) ICON[a.name.slice(5)] = A.images[a.name];
      progress(0.4 + 0.6 * (++n / total));
    }));
    for (const t of A.manifest.terrain) {
      const img = await loadImg(A.images['terrain_' + t.id]); const c = document.createElement('canvas'); c.width = c.height = t.size;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); TEX[TYPES[t.id]] = new Uint32Array(x.getImageData(0, 0, t.size, t.size).data.buffer);
      progress(0.4 + 0.6 * (++n / total));
    }
  }
  // per-asset alpha masks (frame 0) for pixel-accurate picking
  const MASK = {};
  function maskOf(name) {
    if (MASK[name]) return MASK[name]; const a = SPR[name]; if (!a) return null;
    const c = document.createElement('canvas'); c.width = a.w; c.height = a.h; const g = c.getContext('2d'); g.drawImage(a.img, 0, 0, a.w, a.h, 0, 0, a.w, a.h);
    const d = g.getImageData(0, 0, a.w, a.h).data, m = new Uint8Array(a.w * a.h); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    return MASK[name] = { w: a.w, h: a.h, m };
  }
  const TS = S.terrain.textureSize, TPT = S.terrain.texelsPerTile;

  // ================================================================== world state
  const type = new Uint8Array(N * N), lvl = new Float32Array(N * N), Hv = new Float32Array((N + 1) * (N + 1));
  const waterDist = new Float32Array(N * N), landDist = new Float32Array(N * N);
  const blocked = new Uint8Array(N * N); // 0 free, 1 solid, 2 gate (player may pass)
  const explored = new Uint8Array(N * N), visible = new Uint8Array(N * N);
  const idx = (i, j) => i * N + j, inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  let objects = [], units = [], sites = [], baseObjCount = 0;
  let start = [N / 2, N / 2], seed = 1;
  const G = { day: 1, tod: 0.1, won: false, started: false, paused: false, spawnT: 5, animalT: 30, killed: 0, beacon: null, beaconNight: false };
  const danger = (x, y) => clamp((Math.hypot(x - start[0], y - start[1]) - 12) / 26, 0, 1);

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
  const surfaceAt = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y); if (!inMap(i, j)) return 'grass';
    for (const o of objects) if (o.struct === 'floor' && !o.gone && Math.floor(o.x) === i && Math.floor(o.y) === j) return 'wood';
    const t = type[idx(i, j)];
    if (t === TYPES.shallow) return 'water'; if (t === TYPES.sand) return 'sand'; if (t === TYPES.rock) return 'rock'; if (t === TYPES.snow || WX.S.snowCover > 0.5) return 'snow';
    if (t === TYPES.dirt || t === TYPES.road || t === TYPES.forestFloor) return 'dirt'; return 'grass';
  };

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
    const a = SPR[asset]; const o = Object.assign({ asset, x, y, fp: a ? a.footprint : [1, 1], blocks: a ? a.blocks : false }, extra);
    objects.push(o);
    if (o.blocks) setBlock(o, o.struct === 'gate' ? 2 : 1);
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
  function treeFor(i, j, L, r, sd) {
    if (L >= 4.4 || (L >= 3.4 && r < 0.3)) return 'pine_snow_' + (1 + (r * 7 | 0) % 2);
    if (L >= 2.8) return r < 0.72 ? 'pine_' + (1 + (r * 4 | 0) % 3) : 'oak_3';
    if (r < 0.09) return 'maple_' + (1 + (r * 50 | 0) % 2);
    if (r < 0.15) return 'aspen_1';
    if (r < 0.28) return 'birch_' + (1 + (r * 20 | 0) % 2);
    if (r < 0.38) return 'pine_' + (1 + (r * 30 | 0) % 3);
    return 'oak_' + (1 + (r * 37 | 0) % 4);
  }
  function placeWorld(sd, R) {
    const avoid = [start];
    const grassy = k => k === TYPES.grass || k === TYPES.grassLush || k === TYPES.dryGrass;
    clearArea(start[0], start[1], 3, TYPES.grass);
    addObj('campfire_out', start[0] + 1.5, start[1] + 1.5, { struct: 'campfire', fuel: 0, hp: 80, world: true });
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
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = idx(i, j); if (type[k] !== TYPES.forestFloor || blocked[k]) continue;
      addObj(treeFor(i, j, lvl[k], hash(i, j, sd + 1), sd), i + 0.5 + (hash(i, j, 3) - 0.5) * 0.3, j + 0.5 + (hash(i, j, 4) - 0.5) * 0.3);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = idx(i, j); if (blocked[k] || isWater(type[k])) continue;
      if (Math.abs(i - start[0]) <= 1 && Math.abs(j - start[1]) <= 1) continue;
      const t = type[k], r = hash(i, j, sd + 5), r2 = hash(i, j, sd + 9), x = i + 0.5 + (hash(i, j, 6) - 0.5) * 0.4, y = j + 0.5 + (hash(i, j, 7) - 0.5) * 0.4;
      const nearForest = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inMap(i + a, j + b) && type[idx(i + a, j + b)] === TYPES.forestFloor);
      const nearStart = Math.hypot(i - start[0], j - start[1]) < 9 ? 1.8 : 1;
      if (t === TYPES.rock || t === TYPES.snow) {
        if (r < 0.07) addObj('boulder_' + (1 + (r * 100 | 0) % 3), x, y); else if (r < 0.09) addObj('stone_pile', x, y); else if (r < 0.105) addObj(r < 0.1 ? 'gold_vein' : 'gold_boulder', x, y); else if (r < 0.16 && t === TYPES.rock) addObj('pine_snow_' + (1 + (r * 300 | 0) % 2), x, y);
      } else if (t === TYPES.sand) {
        if (r < 0.03) addObj('palm_' + (1 + (r * 100 | 0) % 2), x, y); else if (r < 0.045) addObj('boulder_2', x, y); else if (r < 0.09) addObj('grass_tuft_dry', x, y);
        if (landDist[k] <= 1 && r > 0.8) addObj('reeds', x + 0.2, y - 0.2);
      } else if (t !== TYPES.road) {
        if (nearForest && r < 0.07) addObj(r < 0.03 ? 'berry_bush' : 'bush_' + (1 + (r * 100 | 0) % 2), x, y);
        else if (nearForest && r < 0.12) addObj('fern_' + (1 + (r * 100 | 0) % 2), x, y);
        else if (r < 0.008 * nearStart) addObj('boulder_' + (1 + (r * 1000 | 0) % 3), x, y);
        else if (r < 0.011 * nearStart && t === TYPES.dryGrass) addObj('dead_tree', x, y);
        else if (r < 0.014 * nearStart) addObj('stone_pile', x, y);
        else if (r < 0.034 * nearStart) addObj('bush_' + (1 + (r * 100 | 0) % 2), x, y);
        else if (r < 0.042 * nearStart) addObj('berry_bush', x, y);
        else if (r < 0.075 * nearStart) addObj(['flowers_yellow', 'flowers_white', 'flowers_purple'][(r * 1000 | 0) % 3], x, y);
        else if (r > 0.994 && !nearForest) addObj(treeFor(i, j, lvl[k], r2, sd), x, y);
        // grass cover: lots of swaying tufts
        if (r2 < (t === TYPES.dryGrass ? 0.32 : 0.4)) addObj(t === TYPES.dryGrass ? 'grass_tuft_dry' : r2 < 0.2 ? 'grass_tuft' : 'grass_tuft_2', i + hash(i, j, 12) * 0.9 + 0.05, j + hash(i, j, 13) * 0.9 + 0.05, { decor: true });
      }
      if (t === TYPES.forestFloor && r2 < 0.12) addObj('fern_' + (1 + (r2 * 100 | 0) % 2), i + 0.15, j + 0.8, { decor: true });
    }
    const cs = pickSites(14, 6, (i, j) => { const k = idx(i, j); return !isWater(type[k]) && !blocked[k] && type[k] !== TYPES.forestFloor; }, avoid, R);
    cs.forEach(c => addObj('chest', c[0] + 0.5, c[1] + 0.5, { chest: true }));
    ensureReachable();
    spawnWildlife(R, true);
  }
  function spawnWildlife(R, initial) {
    const count = k => units.filter(u => u.kind === k && !u.dead).length;
    const grassOk = (i, j) => { const k = idx(i, j); return (type[k] === TYPES.grass || type[k] === TYPES.grassLush || type[k] === TYPES.dryGrass) && !blocked[k]; };
    const forestEdge = (i, j) => [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([a, b]) => inMap(i + a, j + b) && type[idx(i + a, j + b)] === TYPES.forestFloor);
    const farFromPlayer = (i, j) => !P || Math.hypot(i - P.x, j - P.y) > 14;
    pickSites(initial ? 6 : count('deer') < 16 ? 1 : 0, 8, (i, j) => grassOk(i, j) && danger(i, j) >= 0 && Math.hypot(i - start[0], j - start[1]) > 7 && farFromPlayer(i, j), [], R)
      .forEach(h => { for (let k = 0; k < 3 + (R() * 2 | 0); k++) addUnit('deer', h[0] + 0.5 + (R() - 0.5) * 2, h[1] + 0.5 + (R() - 0.5) * 2, { home: [h[0] + 0.5, h[1] + 0.5] }); });
    pickSites(initial ? 4 : count('wolf') < 9 ? 1 : 0, 14, (i, j) => grassOk(i, j) && danger(i, j) > 0.15 && forestEdge(i, j) && farFromPlayer(i, j), [], R)
      .forEach(h => { for (let k = 0; k < 2 + (R() * 2 | 0); k++) addUnit('wolf', h[0] + 0.5 + (R() - 0.5) * 2, h[1] + 0.5 + (R() - 0.5) * 2, { home: [h[0] + 0.5, h[1] + 0.5] }); });
    pickSites(initial ? 7 : count('boar') < 8 ? 1 : 0, 8, (i, j) => grassOk(i, j) && Math.hypot(i - start[0], j - start[1]) > 9 && farFromPlayer(i, j), [], R)
      .forEach(h => addUnit('boar', h[0] + 0.5, h[1] + 0.5, { home: [h[0] + 0.5, h[1] + 0.5] }));
    pickSites(initial ? 3 : count('bear') < 4 ? 1 : 0, 16, (i, j) => grassOk(i, j) && danger(i, j) > 0.5 && forestEdge(i, j) && farFromPlayer(i, j), [], R)
      .forEach(h => addUnit('bear', h[0] + 0.5, h[1] + 0.5, { home: [h[0] + 0.5, h[1] + 0.5] }));
    pickSites(initial ? 4 : count('spider') < 7 ? 1 : 0, 12, (i, j) => { const k = idx(i, j); return !blocked[k] && type[k] !== TYPES.forestFloor && !isWater(type[k]) && danger(i, j) > 0.45 && forestEdge(i, j) && farFromPlayer(i, j); }, [], R)
      .forEach(h => { for (let k = 0; k < 1 + (R() * 2 | 0); k++) addUnit('spider', h[0] + 0.5 + (R() - 0.5), h[1] + 0.5 + (R() - 0.5), { home: [h[0] + 0.5, h[1] + 0.5] }); });
  }
  function ensureReachable() {
    const reach = () => { const seen = new Uint8Array(N * N), q = [idx(start[0], start[1])]; seen[q[0]] = 1; for (let h = 0; h < q.length; h++) { const i = q[h] / N | 0, j = q[h] % N; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + a, nj = j + b; if (!inMap(ni, nj)) continue; const k = idx(ni, nj); if (!seen[k] && walkCostP(k)) { seen[k] = 1; q.push(k); } } } return seen; };
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
  const walkCostP = k => type[k] === TYPES.deep || blocked[k] === 1 ? 0 : 1; // the player can pass gates
  const walkCostE = k => type[k] === TYPES.deep || blocked[k] ? 0 : 1;      // creatures cannot
  function walkableAt(x, y, enemy) { const i = Math.floor(x), j = Math.floor(y); if (!inMap(i, j)) return false; return (enemy ? walkCostE : walkCostP)(idx(i, j)) > 0; }
  function los(x0, y0, x1, y1, enemy) { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2); for (let s = 1; s <= n; s++) { const t = s / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (!walkableAt(x, y, enemy) || !walkableAt(x + 0.18, y, enemy) || !walkableAt(x - 0.18, y, enemy) || !walkableAt(x, y + 0.18, enemy) || !walkableAt(x, y - 0.18, enemy)) return false; } return true; }
  function findPath(u, tx, ty, maxNodes) {
    const enemy = u !== P, cost = enemy ? walkCostE : walkCostP;
    const si = Math.floor(u.x), sj = Math.floor(u.y), ti = Math.floor(tx), tj = Math.floor(ty);
    if (!inMap(ti, tj) || !cost(idx(ti, tj)) || !inMap(si, sj)) return null;
    const p = astar(si, sj, ti, tj, cost, maxNodes); if (!p) return null;
    const pts = p.map(([i, j]) => [i + 0.5, j + 0.5]); pts[pts.length - 1] = [tx, ty];
    const out = []; let cur = [u.x, u.y], k = 0;
    while (k < pts.length) { let far = k; for (let m = Math.min(pts.length - 1, k + 12); m > k; m--) if (los(cur[0], cur[1], pts[m][0], pts[m][1], enemy)) { far = m; break; } out.push(pts[far]); cur = pts[far]; k = far + 1; }
    return out;
  }
  function approachPoint(o, from) {
    if (!o.blocks && walkableAt(o.x, o.y, from !== P)) return [o.x, o.y];
    let best = null, bd = 1e9; const tiles = fpTiles(o);
    for (const [i, j] of tiles) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const x = i + a + 0.5, y = j + b + 0.5; if (!walkableAt(x, y, from !== P)) continue;
      const d = Math.hypot(x - from.x, y - from.y); if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  }

  // ================================================================== units
  let P = null;
  function addUnit(kind, x, y, extra = {}) {
    if (!walkableAt(x, y, true)) { const i = Math.floor(x), j = Math.floor(y); let ok = false; for (let r = 1; r < 4 && !ok; r++) for (let a = -r; a <= r && !ok; a++) for (let b = -r; b <= r && !ok; b++) if (walkableAt(i + a + 0.5, j + b + 0.5, true)) { x = i + a + 0.5; y = j + b + 0.5; ok = true; } if (!ok) return null; }
    const K = KINDS[kind] || {};
    const u = Object.assign({ kind, asset: K.asset || kind, x, y, dir: (Math.random() * 8) | 0, moving: false, path: [], walkT: Math.random() * 3, wait: Math.random() * 4, speed: K.speed || 2.6, unit: true,
      hp: K.hp || 100, maxHp: K.hp || 100, cd: 0, repath: 0, hurtT: 0, aggroT: 0, braveT: rand(3, 8), brave: false, fade: 1, home: [x, y], callT: rand(5, 30), stepT: 0 }, extra);
    units.push(u); return u;
  }
  const DIRS = S.sprites.directions;
  const DIR_ANG = { E: 0, SE: Math.PI / 4, S: Math.PI / 2, SW: 3 * Math.PI / 4, W: Math.PI, NW: -3 * Math.PI / 4, N: -Math.PI / 2, NE: -Math.PI / 4 };
  // screen angle of a world vector (0 = screen right, PI/2 = screen down), undoing the vertical squash
  const screenAng = (dx, dy) => Math.atan2((dx + dy) * HHp * 2, (dx - dy) * HWp);
  function dirFromVec(dx, dy, cur) {
    const a = screenAng(dx, dy);
    if (cur != null && cur >= 0 && angDiff(a, DIR_ANG[DIRS[cur]]) < Math.PI / 8 + 0.12) return cur; // hysteresis: no flicker at sector edges
    const sectors = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    return DIRS.indexOf(sectors[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]);
  }
  // world unit vector for a screen angle
  function worldFromScreenAng(a) { const sx = Math.cos(a), sy = Math.sin(a) / 2; let dx = sy + sx / 2, dy = sy - sx / 2; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  function face(u, t) { u.dir = dirFromVec(t.x - u.x, t.y - u.y); }
  function stepUnit(u, dt, speedMul = 1) {
    if (u.path.length) {
      const [tx, ty] = u.path[0], dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
      const sp = u.speed * speedMul * dt;
      if (d <= sp) { u.x = tx; u.y = ty; u.path.shift(); }
      else { const nx = u.x + dx / d * sp, ny = u.y + dy / d * sp; if (walkableAt(nx, ny, u !== P)) { u.x = nx; u.y = ny; } else u.path = []; u.dir = dirFromVec(dx, dy, u.dir); }
      u.moving = u.path.length > 0; u.walkT += dt * speedMul;
    } else u.moving = false;
  }

  // ================================================================== player & inventory
  // ================================================================== inventory: Minecraft-style slots
  // slots[0..5] are the hotbar (keys 1-6), slots[6..35] the pack. `inv` is a live count view over the slots,
  // so `inv.log`, `inv.log -= 2`, `delete inv.log` and Object.keys(inv) all keep working.
  const HOT = 6, PACK = 30, NSLOT = HOT + PACK;
  const slots = new Array(NSLOT).fill(null);
  const stackOf = k => Math.max(1, (ITEMS[k] && ITEMS[k].max) || 50);
  const usable = k => { const it = ITEMS[k]; return !!(it && (it.weapon || it.eat || k === 'torch' || k === 'waterskin' || k === 'armor')); };
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const ORD_HOT = range(0, NSLOT), ORD_PACK = range(HOT, NSLOT).concat(range(0, HOT)), ORD_TAKE = range(HOT, NSLOT).reverse().concat(range(0, HOT).reverse());
  let held = null, heldFrom = null, focus = null; // item stack on the cursor, where it came from, hovered slot
  let takePref = -1; // when using an item from a hotbar slot, that slot is spent first
  const countIn = (arr, k) => { let n = 0; for (const q of arr) if (q && q.id === k) n += q.n; return n; };
  function putInto(arr, k, n, order) { // returns how many fitted: tops up matching stacks first, then empty slots
    const max = stackOf(k); let left = n;
    for (const i of order) { const q = arr[i]; if (q && q.id === k && q.n < max) { const a = Math.min(max - q.n, left); q.n += a; left -= a; if (!left) return n; } }
    for (const i of order) if (!arr[i]) { const a = Math.min(max, left); arr[i] = { id: k, n: a }; left -= a; if (!left) return n; }
    return n - left;
  }
  function takeFrom(arr, k, n, order) {
    let left = n; const ord = takePref >= 0 && arr === slots ? [takePref].concat(order) : order;
    for (const i of ord) { const q = arr[i]; if (q && q.id === k) { const a = Math.min(q.n, left); q.n -= a; left -= a; if (!q.n) arr[i] = null; if (!left) break; } }
    return n - left;
  }
  const fitRoom = (arr, k) => { const max = stackOf(k); let r = 0; for (const q of arr) r += !q ? max : q.id === k ? max - q.n : 0; return r; };
  const inv = new Proxy({}, {
    get: (t, k) => typeof k === 'string' && ITEMS[k] ? countIn(slots, k) || undefined : undefined,
    set: (t, k, v) => { if (!ITEMS[k]) return true; v = Math.max(0, Math.round(+v || 0)); const c = countIn(slots, k); if (v > c) { const add = putInto(slots, k, v - c, usable(k) ? ORD_HOT : ORD_PACK); if (add < v - c) dropItems(k, v - c - add); } else if (v < c) takeFrom(slots, k, c - v, ORD_TAKE); return true; },
    deleteProperty: (t, k) => { if (ITEMS[k]) takeFrom(slots, k, 1e9, ORD_TAKE); return true; },
    has: (t, k) => !!(ITEMS[k] && countIn(slots, k)),
    ownKeys: () => [...new Set(slots.filter(Boolean).map(q => q.id))],
    getOwnPropertyDescriptor: (t, k) => { const n = ITEMS[k] ? countIn(slots, k) : 0; return n ? { value: n, enumerable: true, configurable: true, writable: true } : undefined; },
  });
  // items that don't fit go into a sack on the ground (it can be looted like a crate)
  function dropItems(k, n, at) {
    if (n <= 0 || !P) return; const x = at ? at.x : P.x, y = at ? at.y : P.y;
    let sack = objects.find(o => o.drop && !o.gone && Math.hypot(o.x - x, o.y - y) < 1.3);
    if (!sack) { sack = addObj('chest', x + 0.35, y + 0.35, { drop: new Array(18).fill(null), blocks: false }); markDirty(sack); }
    putInto(sack.drop, k, n, range(0, sack.drop.length));
  }
  function newPlayerState() {
    slots.fill(null); held = null; takePref = -1;
    Object.assign(inv, { berries: 3, stick: 2 });
    Object.assign(P, { hp: 100, maxHp: 100, hunger: 100, thirst: 100, stamina: 100, warmth: 75, wet: 0, bleed: 0, sick: 0, comfort: 0, fear: 0, weapon: 'fists', armorHP: 0, torchT: 0, torchOn: false, water: 0,
      task: null, swing: null, dead: false, warn: {}, dodgeT: 0, dodgeCd: 0, invulnT: 0, exhausted: false, lastHurt: -99, warmBuff: 0, aim: Math.PI / 2, bruise: 0 });
  }
  const have = cost => Object.entries(cost).every(([k, n]) => (inv[k] || 0) >= n);
  function pay(cost) { for (const [k, n] of Object.entries(cost)) { inv[k] -= n; if (inv[k] <= 0) delete inv[k]; } }
  function addItem(k, n, quiet) {
    const add = putInto(slots, k, n, usable(k) ? ORD_HOT : ORD_PACK);
    if (add > 0 && !quiet) floatText(P.x, P.y, `+${add} ${ITEMS[k].name}`, '#ffe9a8');
    if (add < n) { dropItems(k, n - add); message(`Your pack is full: ${n - add} ${ITEMS[k].name.toLowerCase()} dropped on the ground.`); }
    refreshUI(); return add;
  }
  function useItem(k) {
    const it = ITEMS[k]; if (!it || !inv[k]) return;
    if (it.eat) {
      const e = it.eat; P.hunger = clamp(P.hunger + (e.hunger || 0), 0, 100); P.thirst = clamp(P.thirst + (e.thirst || 0), 0, 100);
      if (e.hp > 0) P.hp = Math.min(P.maxHp, P.hp + e.hp); else if (e.hp < 0) damagePlayer(-e.hp, { silent: true });
      if (e.sick) P.sick = clamp(P.sick + e.sick, 0, 120); if (e.bleed) { P.bleed = 0; message('You bind your wounds.'); } if (e.warm) P.warmBuff = 90;
      inv[k]--; if (!inv[k]) delete inv[k];
      if (k === 'meat_raw') message('Raw meat turns your stomach.'); AU.sfx(e.hp > 10 ? 'heal' : 'eat');
    } else if (it.weapon) setWeapon(P.weapon === it.weapon ? 'fists' : it.weapon);
    else if (k === 'torch') toggleTorch();
    else if (k === 'waterskin') { if (P.water > 0) { P.water--; P.thirst = Math.min(100, P.thirst + 40); AU.sfx('drink'); } else message('Your waterskins are empty. Fill them at water.'); }
    else if (k === 'armor') { if (P.armorHP > 0) { message('You are already wearing armor.'); return; } inv.armor--; if (!inv.armor) delete inv.armor; P.armorHP = 220; message('You strap on the hide armor.'); AU.sfx('craft'); }
    refreshUI();
  }
  function setWeapon(w) { if (w !== 'fists' && !inv[w]) w = 'fists'; P.weapon = w; P.asset = WEAPONS[w].asset; refreshUI(); }
  function ownedWeapons() { return ['fists'].concat(['club', 'knife', 'axe', 'spear', 'greataxe', 'bow', 'sling'].filter(w => inv[w])); }
  function cycleWeapon() { const o = ownedWeapons(), i = o.indexOf(P.weapon); setWeapon(o[(i + 1) % o.length]); message(`Equipped: ${WEAPONS[P.weapon].name}`); }
  function toggleTorch() {
    if (P.torchOn) { P.torchOn = false; refreshUI(); return; }
    if (P.torchT <= 0) { if (!inv.torch) { message('You have no torches. Craft one from a stick and fiber.'); return; } inv.torch--; if (!inv.torch) delete inv.torch; P.torchT = 150; }
    P.torchOn = true; AU.sfx('fire'); refreshUI();
  }
  const nearBench = () => objects.some(o => !o.gone && o.struct === 'workbench' && dist(o, P) < 3.2);
  function craft(r) {
    if (r.bench && !nearBench()) { message('You need to stand at a workbench to craft that.'); return; }
    if (!have(r.cost)) return;
    pay(r.cost); addItem(r.out, r.n, true); AU.sfx('craft'); message(`Crafted ${r.n > 1 ? r.n + ' ' : ''}${ITEMS[r.out].name}.`);
    if (ITEMS[r.out].weapon && P.weapon === 'fists') setWeapon(ITEMS[r.out].weapon);
    refreshUI();
  }

  // ================================================================== time & light
  function nightness(t = G.tod) {
    if (t < 0.04) return 0.45 * (1 - t / 0.04);
    if (t < 0.62) return 0; if (t < 0.72) return NZ.smooth((t - 0.62) / 0.1); if (t < 0.94) return 1;
    return 1 - 0.55 * NZ.smooth((t - 0.94) / 0.06);
  }
  const isNight = () => G.tod >= 0.68 || G.tod < 0.02;
  function clockStr() { const h = (5 + G.tod * 24) % 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; }
  function todLabel() { const t = G.tod; return t < 0.08 ? 'Dawn' : t < 0.3 ? 'Morning' : t < 0.45 ? 'Midday' : t < 0.62 ? 'Afternoon' : t < 0.72 ? 'Dusk' : t < 0.94 ? 'Night' : 'Before dawn'; }
  let lights = []; const tempLights = [];
  function collectLights() {
    lights = [];
    for (const o of objects) {
      if (o.gone || !o.struct) continue; const def = STRUCTS[o.struct];
      if (o.struct === 'campfire' || o.struct === 'brazier') { if (o.fuel > 0) lights.push({ x: o.x, y: o.y, r: def.light, o, fire: true }); }
      else if (o.struct === 'beacon') { if (G.beacon && G.beacon.lit) lights.push({ x: o.x, y: o.y, r: 7.5, o, fire: true }); }
      else if (def && def.light) lights.push({ x: o.x, y: o.y, r: def.light, o, fire: true, ward: !!def.ward });
    }
    for (const t of tempLights) lights.push({ x: t.x, y: t.y, r: 3.5 * Math.min(1, t.t / 4), fire: true });
    if (P && P.torchOn && !P.dead) lights.push({ x: P.x, y: P.y, r: 3.6, torch: true });
  }
  function lightAt(x, y, skipTorch) { let best = 0, src = null; for (const L of lights) { if (skipTorch && L.torch) continue; const d = Math.hypot(x - L.x, y - L.y), v = 1 - d / L.r; if (v > best) { best = v; src = L; } } return [best, src]; }
  const wardAt = (x, y) => lights.some(L => L.ward && Math.hypot(x - L.x, y - L.y) < L.r);

  // ================================================================== effects
  const floats = [], projectiles = [], sparkles = [], dust = [];
  function floatText(x, y, text, color) {
    // stack texts that pop at the same spot so several pickups stay readable
    const slot = floats.filter(f => f.t < 0.9 && Math.hypot(f.x - x, f.y - y) < 0.6).reduce((m, f) => Math.max(m, f.slot + 1), 0);
    floats.push({ x, y, text, color, t: 0, slot });
  }
  function puff(x, y, c, n = 6) { for (let k = 0; k < n; k++) dust.push({ x, y, ox: rand(-12, 12), oy: rand(-30, -5), c, t: 0, life: rand(0.4, 0.9) }); }
  function markDirty(o) { o.dirty = true; }
  const panOf = o => { const [sx] = toScreen(o.x, o.y); return clamp((sx - cam.x) * zoom() / (W / 2), -1, 1); };

  // ================================================================== actions
  const TREE = /^(oak|birch|pine|palm|maple|aspen)_/;
  const ROCK = /^(boulder_|gold_boulder|stone_pile|gold_vein)/;
  function nameOf(o) {
    if (o.unit) return KINDS[o.kind] ? KINDS[o.kind].name + (o.dead ? ' (dead)' : '') : 'You';
    if (o.struct && STRUCTS[o.struct]) return STRUCTS[o.struct].name;
    const a = SPR[o.asset]; return a ? a.description.replace(/\s*\(.*\)/, '') : o.asset;
  }
  function actionsFor(o) {
    if (!o || o.gone) return [];
    const out = [], A = (label, kind, extra = {}) => out.push(Object.assign({ label, kind }, extra));
    if (o.unit) {
      if (o === P) return out;
      if (o.dead) { if (!o.harvested && KINDS[o.kind] && KINDS[o.kind].loot) A('Harvest carcass', 'harvest', { range: 1.2 }); return out; }
      A('Attack ' + KINDS[o.kind].name.toLowerCase(), 'attack'); return out;
    }
    const a = o.asset;
    if (o.struct) return structActions(o);
    if (a === 'stump') A('Dig up stump', 'stump', { repeat: true });
    else if (TREE.test(a) || a === 'dead_tree') A('Chop down', 'chop', { repeat: true });
    else if ((a === 'bush_1' || a === 'bush_2') && !o.empty) A('Gather sticks & fiber', 'gather', { range: 1.1 });
    else if (a === 'berry_bush') { A('Pick berries', 'berries', { range: 1.2 }); A('Gather sticks & fiber', 'gather', { range: 1.2 }); }
    else if (a.startsWith('grass_tuft') || a === 'reeds' || a.startsWith('fern_')) A('Pull fiber', 'fiber', { range: 1.0 });
    else if (a.startsWith('flowers_')) A('Pick herbs', 'herb', { range: 1.0 });
    else if (ROCK.test(a)) A('Gather stone', 'mine', { repeat: true });
    else if (o.drop) { A('Pick up everything', 'pickup', { range: 1.1 }); A('Look through', 'storage', { range: 1.1 }); }
    else if (o.chest) A('Open chest', 'chest', { range: 1.1 });
    else if (o.search && !o.looted) A(a === 'market_stall' ? 'Search stall' : 'Search house', 'search', { range: 1.7 });
    else if (a === 'well') { A('Drink', 'drink', { range: 1.3 }); if (inv.waterskin) A('Fill waterskins', 'drink', { range: 1.3 }); }
    else if (o.relic) A('Take the relic', 'relic', { range: 1.35 });
    else if (a === 'watchtower') A('Climb the tower', 'climb', { range: 1.3 });
    return out;
  }
  function structActions(o) {
    const out = [], A = (label, kind, extra = {}) => out.push(Object.assign({ label, kind }, extra)), def = STRUCTS[o.struct] || {};
    switch (o.struct) {
      case 'campfire': case 'brazier':
        if (o.fuel <= 0) A('Relight (2 sticks)', 'relight');
        else { if (inv.meat_raw) A(`Cook meat (${inv.meat_raw})`, 'cook'); A(`Add log (${Math.ceil(o.fuel)}s left)`, 'fuel_log', { disabled: !inv.log }); A('Add stick', 'fuel_stick', { disabled: !inv.stick }); A('Warm up', 'warm'); }
        break;
      case 'lean_to': case 'cabin': case 'bed': A('Sleep', 'sleep', { range: 1.7 }); break;
      case 'crate': case 'shelf': A('Open storage', 'storage'); break;
      case 'rain_collector': A(o.water > 0 ? `Drink (${o.water})` : 'Collector is empty', 'rain', { disabled: !(o.water > 0) }); if (inv.waterskin && o.water > 0) A('Fill waterskin', 'rainfill'); break;
      case 'beacon': if (!(G.beacon && G.beacon.lit)) A('Light the beacon', 'beacon', { range: 1.9 }); break;
      case 'drying_rack': {
        const done = (o.rack || []).filter(t => t <= 0).length, hanging = (o.rack || []).length - done;
        if (done) A(`Collect jerky (${done})`, 'rack_take');
        if (inv.meat_raw && (o.rack || []).length < 6) A(`Hang raw meat (${Math.min(inv.meat_raw, 6 - (o.rack || []).length)})`, 'rack_hang');
        if (!out.length) A(hanging ? `Drying… (${hanging})` : 'Rack is empty', 'noop', { disabled: true });
        break;
      }
      case 'stew_pot': A('Cook stew (meat, herb, 2 berries)', 'stew', { disabled: !have({ meat_raw: 1, herb: 1, berries: 2 }) && !have({ meat_cooked: 1, herb: 1, berries: 2 }) }); if (inv.meat_raw) A(`Cook meat (${inv.meat_raw})`, 'cook'); break;
      case 'garden':
        if (!o.stage) A('Plant seeds', 'plant', { disabled: !inv.seeds });
        else if (o.stage === 1) A(`Growing… (${Math.ceil(o.growT || 0)}s)`, 'noop', { disabled: true });
        else A('Harvest', 'garden_take');
        break;
      case 'workbench': A('Craft at the workbench', 'bench'); break;
      case 'lookout': A('Climb the lookout', 'climb', { range: 1.3 }); break;
      case 'campfire_out': break;
    }
    if (!o.world && o.struct !== 'beacon') {
      if (o.hp < (def.hp || 0)) A(`Repair (${def.cost.stone && !def.cost.log ? '2 stone' : '1 log'})`, 'repair');
      A('Demolish', 'demolish');
    }
    return out;
  }
  const LOOT_CHEST = [['cloth', 1, 3, 0.7], ['rope', 1, 2, 0.5], ['arrow', 3, 6, 0.35], ['herb', 2, 3, 0.4], ['meat_cooked', 1, 2, 0.3], ['bandage', 1, 1, 0.3], ['salve', 1, 1, 0.15], ['hide', 1, 2, 0.25], ['torch', 1, 2, 0.4], ['seeds', 1, 3, 0.35], ['bone', 1, 2, 0.3]];
  const LOOT_HOUSE = [['cloth', 1, 2, 0.6], ['rope', 1, 1, 0.35], ['herb', 1, 2, 0.3], ['berries', 2, 4, 0.3], ['torch', 1, 1, 0.3], ['stick', 2, 4, 0.4], ['hide', 1, 1, 0.15], ['seeds', 1, 2, 0.3]];
  function rollLoot(table, guaranteed) {
    const got = []; for (const [k, a, b, p] of table) if (Math.random() < p) got.push([k, a + ((Math.random() * (b - a + 1)) | 0)]);
    if (!got.length || guaranteed) got.push(pick(table).slice(0, 2));
    for (const [k, n] of got) addItem(k, n);
    message('You found: ' + got.map(([k, n]) => `${n} ${ITEMS[k].name.toLowerCase()}`).join(', ') + '.');
  }
  const needsSwing = kind => kind === 'chop' || kind === 'mine' || kind === 'gather' || kind === 'stump';
  function chopTree(o, power = 1) {
    o.hp = o.hp == null ? (o.asset === 'dead_tree' ? 3 : 5) : o.hp; o.hp -= power; AU.sfx('chop', panOf(o)); puff(o.x, o.y, '#8a6a45'); o.shake = 0.3;
    if (o.hp > 0) return true;
    const logs = o.asset === 'dead_tree' || o.asset.startsWith('birch') || o.asset.startsWith('aspen') ? 1 : 2, sticks = o.asset === 'dead_tree' ? 3 : 2;
    addItem('log', logs); addItem('stick', sticks); if (Math.random() < 0.25) addItem('seeds', 1);
    setBlock(o, 0); o.asset = 'stump'; o.blocks = false; o.fp = [1, 1]; markDirty(o); AU.sfx('fall', panOf(o)); return false;
  }
  function mineRock(o, power = 1) {
    o.res = o.res == null ? (o.asset.startsWith('boulder') || o.asset === 'gold_boulder' ? 6 : 10) : o.res;
    const n = Math.min(o.res, power); o.res -= n; addItem('stone', n); AU.sfx('mine', panOf(o)); puff(o.x, o.y, '#9a9384'); markDirty(o);
    if (o.res <= 0) { o.gone = true; setBlock(o, 0); return false; } return true;
  }
  // returns true if a repeating task should continue
  function perform(o, act) {
    const def = o.struct ? STRUCTS[o.struct] : null;
    switch (act.kind) {
      case 'chop': {
        const w = WEAPONS[P.weapon];
        if (!w.chop) { const best = inv.greataxe ? 'greataxe' : inv.axe ? 'axe' : null; if (best) setWeapon(best); else { message('You need a stone axe to chop trees. Craft one in your pack.'); return false; } }
        return chopTree(o, WEAPONS[P.weapon].chop);
      }
      case 'stump': { // hack the roots out: needs an axe (or a knife, slowly); leaves clear ground for building
        if (!WEAPONS[P.weapon].chop) { const best = inv.greataxe ? 'greataxe' : inv.axe ? 'axe' : inv.knife ? 'knife' : null; if (best) setWeapon(best); else { message('You need an axe or a knife to dig out a stump.'); return false; } }
        o.dig = (o.dig == null ? 4 : o.dig) - (WEAPONS[P.weapon].chop || 0.5); AU.sfx('chop', panOf(o)); puff(o.x, o.y, '#6a4e32'); markDirty(o);
        if (o.dig > 0) return true;
        addItem('stick', 2); if (Math.random() < 0.5) addItem('log', 1); o.gone = true; AU.sfx('fall', panOf(o)); message('You dig out the stump.'); return false;
      }
      case 'mine': return mineRock(o, WEAPONS[P.weapon].chop ? 2 : 1);
      case 'gather': addItem('fiber', 2); addItem('stick', 1); if (o.asset === 'bush_1' || o.asset === 'bush_2') { o.empty = true; o.regrow = 300; } markDirty(o); AU.sfx('rustle', panOf(o)); return false;
      case 'berries': addItem('berries', 3); if (Math.random() < 0.35) addItem('seeds', 1); o.asset = 'bush_1'; o.wasBerry = true; o.empty = true; o.regrow = 320; markDirty(o); AU.sfx('rustle', panOf(o)); return false;
      case 'fiber': addItem('fiber', o.asset === 'reeds' ? 2 : 1); o.gone = true; markDirty(o); AU.sfx('rustle', panOf(o)); return false;
      case 'herb': addItem('herb', 1 + (Math.random() < 0.4 ? 1 : 0)); if (Math.random() < 0.3) addItem('seeds', 1); o.gone = true; markDirty(o); AU.sfx('rustle', panOf(o)); return false;
      case 'chest': rollLoot(LOOT_CHEST, true); o.gone = true; markDirty(o); AU.sfx('loot'); return false;
      case 'search': rollLoot(LOOT_HOUSE, false); o.looted = true; markDirty(o); AU.sfx('loot'); return false;
      case 'drink': P.thirst = 100; if (inv.waterskin) P.water = inv.waterskin * 3; message(inv.waterskin ? 'You drink deeply and fill your waterskins.' : 'You drink deeply.'); AU.sfx('drink'); refreshUI(); return false;
      case 'relic': o.relic = false; o.asset = 'shrine_empty'; markDirty(o); addItem('relic', 1, true); AU.sfx('relic');
        message(inv.relic >= 8 ? 'All eight relics! Build the Signal Beacon (Build → Fire & light) and light it at dusk.' : `Relic recovered (${inv.relic}/8). The Hollows grow weaker.`); return false;
      case 'climb': revealAround(o.x, o.y, o.struct === 'lookout' ? 13 : 15); message('From up high you survey the land.'); AU.sfx('craft'); return false;
      case 'relight': if ((inv.stick || 0) < 2) { message('You need 2 sticks to relight it.'); return false; } pay({ stick: 2 }); o.fuel = 150; o.asset = def.asset; markDirty(o); AU.sfx('fire', panOf(o)); return false;
      case 'fuel_log': if (!inv.log) { message('You have no logs.'); return false; } pay({ log: 1 }); o.fuel = Math.min(o.struct === 'brazier' ? 900 : 480, o.fuel + 160); AU.sfx('fire', panOf(o)); markDirty(o); return false;
      case 'fuel_stick': if (!inv.stick) { message('You have no sticks.'); return false; } pay({ stick: 1 }); o.fuel = Math.min(o.struct === 'brazier' ? 900 : 480, o.fuel + 50); AU.sfx('fire', panOf(o)); markDirty(o); return false;
      case 'warm': P.warmth = Math.min(100, P.warmth + 25); P.wet = Math.max(0, P.wet - 0.4); message('You warm your hands by the fire.'); return false;
      case 'cook': { const n = inv.meat_raw || 0; if (!n) return false; delete inv.meat_raw; addItem('meat_cooked', n); message(`You cook ${n} meat.`); AU.sfx('fire', panOf(o)); return false; }
      case 'stew': { const meat = inv.meat_raw ? 'meat_raw' : 'meat_cooked'; if (!have({ [meat]: 1, herb: 1, berries: 2 })) { message('A stew needs meat, a herb and 2 berries.'); return false; } pay({ [meat]: 1, herb: 1, berries: 2 }); addItem('stew', 1); AU.sfx('fire', panOf(o)); return false; }
      case 'rack_hang': { o.rack = o.rack || []; const n = Math.min(inv.meat_raw || 0, 6 - o.rack.length); for (let k = 0; k < n; k++) o.rack.push(100); inv.meat_raw -= n; if (!inv.meat_raw) delete inv.meat_raw; o.asset = 'drying_rack_full'; markDirty(o); message(`You hang ${n} meat to dry.`); refreshUI(); return false; }
      case 'rack_take': { const done = o.rack.filter(t => t <= 0).length; o.rack = o.rack.filter(t => t > 0); addItem('jerky', done); if (!o.rack.length) o.asset = 'drying_rack'; markDirty(o); return false; }
      case 'plant': if (!inv.seeds) return false; pay({ seeds: 1 }); o.stage = 1; o.growT = 150; o.asset = 'garden_growing'; markDirty(o); AU.sfx('rustle', panOf(o)); message('You plant the seeds.'); return false;
      case 'garden_take': addItem('berries', 4); addItem('herb', 1 + (Math.random() < 0.5 ? 1 : 0)); if (Math.random() < 0.6) addItem('seeds', 1); o.stage = 0; o.asset = 'garden'; markDirty(o); AU.sfx('rustle', panOf(o)); return false;
      case 'bench': openPack('craft'); return false;
      case 'sleep': trySleep(o); return false;
      case 'storage': openStorage(o); return false;
      case 'pickup': { for (let i = 0; i < o.drop.length; i++) { const q = o.drop[i]; if (!q) continue; const a = putInto(slots, q.id, q.n, usable(q.id) ? ORD_HOT : ORD_PACK); if (a) floatText(P.x, P.y, `+${a} ${ITEMS[q.id].name}`, '#ffe9a8'); q.n -= a; if (!q.n) o.drop[i] = null; }
        if (!o.drop.some(Boolean)) o.gone = true; else message('Your pack is full.'); AU.sfx('loot'); refreshUI(); return false; }
      case 'rain': if (o.water > 0) { o.water--; P.thirst = Math.min(100, P.thirst + 45); AU.sfx('drink'); } return false;
      case 'rainfill': { const need = inv.waterskin * 3 - P.water, n = Math.min(need, o.water); P.water += n; o.water -= n; message(`You fill your waterskin (${P.water}).`); AU.sfx('drink'); return false; }
      case 'beacon': lightBeacon(o); return false;
      case 'harvest': { const L = KINDS[o.kind].loot; for (const [k, n] of Object.entries(L)) addItem(k, n + (WEAPONS[P.weapon].skin && (k === 'meat_raw' || k === 'hide') ? 1 : 0)); o.harvested = true; AU.sfx('rustle', panOf(o)); return false; }
      case 'repair': { const useStone = def.cost.stone && !def.cost.log, c = useStone ? { stone: 2 } : { log: 1 }; if (!have(c)) { message(`Repairing needs ${useStone ? '2 stone' : '1 log'}.`); return false; } pay(c); o.hp = Math.min(def.hp, o.hp + def.hp * 0.5); markDirty(o); AU.sfx('build', panOf(o)); return false; }
      case 'demolish': { for (const [k, n] of Object.entries(def.cost)) if (k !== 'relic' && Math.floor(n / 2) > 0) addItem(k, Math.floor(n / 2)); destroyStruct(o, true); return false; }
    }
    return false;
  }

  // ================================================================== structures
  const trapAt = new Map();
  function addStruct(t, x, y, extra = {}) {
    const def = STRUCTS[t];
    const o = addObj(def.asset, x, y, Object.assign({ struct: t, hp: def.hp }, extra));
    if ((t === 'campfire' || t === 'brazier') && o.fuel == null) o.fuel = t === 'brazier' ? 360 : 200;
    if (t === 'rain_collector' && o.water == null) { o.water = 1; o.fillT = 0; }
    if (def.store) { const n = def.store === true ? 24 : def.store; if (!Array.isArray(o.store)) { const old = o.store || {}; o.store = new Array(n).fill(null); for (const [k, c] of Object.entries(old)) if (ITEMS[k]) putInto(o.store, k, c, range(0, n)); } }
    if (t === 'spike_trap') { trapAt.set(idx(Math.floor(x), Math.floor(y)), o); if (o.uses == null) o.uses = 4; }
    if (t === 'gate' && !o.orient) o.orient = wallAt(Math.floor(x) - 1, Math.floor(y)) || wallAt(Math.floor(x) + 1, Math.floor(y)) ? 'i' : wallAt(Math.floor(x), Math.floor(y) - 1) || wallAt(Math.floor(x), Math.floor(y) + 1) ? 'j' : 'i';
    if (t === 'beacon') G.beacon = Object.assign(G.beacon || { lit: false, sawNight: false }, { obj: o });
    if (t === 'drying_rack' && o.rack && o.rack.length) o.asset = 'drying_rack_full';
    if (t === 'garden') o.asset = ['garden', 'garden_growing', 'garden_ripe'][o.stage || 0];
    if (o.id == null) o.id = 100000 + objects.length;
    wallIndexDirty = true;
    return o;
  }
  function destroyStruct(o, quiet) {
    o.gone = true; setBlock(o, 0); markDirty(o); trapAt.delete(idx(Math.floor(o.x), Math.floor(o.y))); wallIndexDirty = true;
    puff(o.x, o.y, '#5a4636', 14); AU.sfx('break', panOf(o));
    if (!quiet && o.struct !== 'spike_trap') message(`Your ${STRUCTS[o.struct] ? STRUCTS[o.struct].name.toLowerCase() : 'structure'} was destroyed!`);
  }
  // wall connectivity
  let wallIndex = new Map(), wallIndexDirty = true;
  function wallAt(i, j) {
    if (wallIndexDirty) { wallIndex = new Map(); for (const o of objects) if (!o.gone && (STRUCTS[o.struct] || {}).wall || (!o.gone && o.struct === 'gate')) wallIndex.set(idx(Math.floor(o.x), Math.floor(o.y)), o); wallIndexDirty = false; }
    return inMap(i, j) ? wallIndex.get(idx(i, j)) : null;
  }
  let placing = null, ghost = null;
  function snapPlace(t, wx, wy) {
    const fp = SPR[STRUCTS[t].asset].footprint;
    const x = fp[0] % 2 ? Math.floor(wx) + 0.5 : Math.round(wx), y = fp[1] % 2 ? Math.floor(wy) + 0.5 : Math.round(wy);
    let ok = Math.hypot(x - P.x, y - P.y) < 7.5;
    const [w, h] = fp, i0 = Math.round(x - w / 2), j0 = Math.round(y - h / 2);
    const flat = STRUCTS[t].flat;
    for (let i = i0; i < i0 + w && ok; i++) for (let j = j0; j < j0 + h && ok; j++) {
      if (!inMap(i, j)) { ok = false; break; } const k = idx(i, j);
      if (!explored[k] || isWater(type[k]) || blocked[k]) ok = false;
      if (!flat && SPR[STRUCTS[t].asset].blocks && Math.floor(P.x) === i && Math.floor(P.y) === j) ok = false;
      for (const o of objects) if (!o.gone && Math.floor(o.x) === i && Math.floor(o.y) === j) {
        if (TREE.test(o.asset) || o.asset === 'dead_tree') ok = false;
        else if (o.struct && (o.struct === 'floor') === (t === 'floor')) ok = false; // a floor can sit under one other piece
      }
    }
    if (t === 'gate' && ok) { const fi = Math.floor(x), fj = Math.floor(y); if (!(wallAt(fi - 1, fj) || wallAt(fi + 1, fj) || wallAt(fi, fj - 1) || wallAt(fi, fj + 1))) ok = false; }
    return { x, y, ok };
  }
  function placeAt(wx, wy) {
    const def = STRUCTS[placing.type], g = snapPlace(placing.type, wx, wy);
    if (!g.ok) { message(placing.type === 'gate' ? 'Place the gate next to a wall.' : "You can't build there."); return; }
    if (def.bench && !nearBench()) { message('Build a workbench first and stand near it.'); return; }
    if (!have(def.cost)) { message('Not enough materials.'); stopPlacing(); return; }
    if (placing.type === 'beacon' && G.beacon && G.beacon.obj && !G.beacon.obj.gone) { message('You have already built the beacon.'); stopPlacing(); return; }
    const [w, h] = SPR[def.asset].footprint, i0 = Math.round(g.x - w / 2), j0 = Math.round(g.y - h / 2);
    for (const o of objects) if (!o.gone && !o.struct && fpTiles(o).some(([a, b]) => a >= i0 && a < i0 + w && b >= j0 && b < j0 + h)) { o.gone = true; markDirty(o); }
    const payCost = Object.assign({}, def.cost); delete payCost.relic; pay(payCost); addStruct(placing.type, g.x, g.y); AU.sfx('build'); puff(g.x, g.y, '#a08a60', 10);
    message(`Built: ${def.name}.`); refreshUI();
    if (!def.repeat || !have(def.cost)) stopPlacing();
  }
  function startPlacing(t) { closeModals(); placing = { type: t }; $('placebar').classList.remove('hidden'); $('placetxt').textContent = `Placing ${STRUCTS[t].name}: tap the ground near you`; }
  function stopPlacing() { placing = null; ghost = null; $('placebar').classList.add('hidden'); }

  // ================================================================== combat
  function reachDist(o, from = P) {
    if (o.unit || !o.blocks) return dist(o, from);
    const [w, h] = o.fp, i0 = Math.round(o.x - w / 2), j0 = Math.round(o.y - h / 2);
    const dx = Math.max(i0 - from.x, 0, from.x - (i0 + w)), dy = Math.max(j0 - from.y, 0, from.y - (j0 + h));
    return Math.hypot(dx, dy);
  }
  function startSwing(onHit, dur = 0.5) { P.swing = { t: 0, dur, onHit, hit: false }; P.moving = false; P.path = []; }
  function ammoFor(w) { return (WEAPONS[w].ammo || []).find(a => inv[a]); }
  /** manual attack toward a screen angle (aim) — melee arc or projectile */
  function playerAttack(aim, target) {
    const w = WEAPONS[P.weapon];
    if (P.swing || P.cdT > 0 || P.dodgeT > 0 || P.dead) return;
    if (P.stamina < w.stam) { if (!P.warn.tired) { message('Too exhausted. Catch your breath.'); P.warn.tired = 1; setTimeout(() => P.warn.tired = 0, 3000); } return; }
    const ammo = w.ranged ? ammoFor(P.weapon) : null;
    if (w.ranged && !ammo) { message(P.weapon === 'bow' ? 'No arrows. Craft some in your pack.' : 'No stones to sling.'); return; }
    P.fightT = time;
    if (target) aim = screenAng(target.x - P.x, target.y - P.y);
    P.aim = aim; const [fx, fy] = worldFromScreenAng(aim); P.dir = dirFromVec(fx, fy);
    P.stamina -= w.stam; P.cdT = w.cd;
    AU.sfx(P.weapon === 'greataxe' ? 'heavyswish' : w.ranged ? 'swish' : 'swish');
    startSwing(() => {
      if (w.ranged) {
        inv[ammo]--; if (!inv[ammo]) delete inv[ammo]; refreshUI();
        // leave from the bow/sling hand: forward and to the side of the body, at chest height
        const side = [-fy, fx], hx = P.x + fx * 0.18 + side[0] * -0.06, hy = P.y + fy * 0.18 + side[1] * -0.06;
        const sp = ammo === 'stone' ? 9 : 11, dmg = ammo === 'fire_arrow' ? 45 : w.dmg;
        projectiles.push({ x: hx, y: hy, z: 0.45, vz: 0.35, vx: fx * sp, vy: fy * sp, life: w.reach / sp, dmg, kind: ammo, from: P });
        AU.sfx(P.weapon === 'bow' ? 'bow' : 'sling'); return;
      }
      let hits = 0;
      for (const u of units) {
        if (u === P || u.dead || u.dissolve) continue; const d = dist(u, P), r = KINDS[u.kind] && (u.kind === 'bear' || u.kind === 'brute') ? 0.35 : 0.2;
        if (d > w.reach + r + 0.1) continue; if (d > 0.3 && angDiff(screenAng(u.x - P.x, u.y - P.y), aim) > w.arc * Math.PI / 180) continue;
        hurtUnit(u, w.dmg * (P.stamina < 15 ? 0.6 : 1) * rand(0.85, 1.15), P, w.knock); hits++;
        if (w.arc < 40) break; // thrusts hit one target
      }
      if (!hits) { // swinging at a tree or rock in front of you works too
        let best = null, bd = 9;
        for (const o of objects) { if (o.gone || Math.abs(o.x - P.x) > 2.5 || Math.abs(o.y - P.y) > 2.5) continue; if (!(TREE.test(o.asset) || o.asset === 'dead_tree' || ROCK.test(o.asset))) continue; const d = reachDist(o); if (d > 0.9 || angDiff(screenAng(o.x - P.x, o.y - P.y), aim) > 1.0) continue; if (d < bd) { bd = d; best = o; } }
        if (best) { if (ROCK.test(best.asset)) mineRock(best, w.chop ? 2 : 1); else if (w.chop) chopTree(best, w.chop); else { AU.sfx('thud'); message('You need an axe to fell trees.'); } return; }
      }
      AU.sfx(hits ? 'hit' : 'swish');
    }, w.ranged ? 0.55 : w.cd > 0.9 ? 0.75 : 0.45);
  }
  function dodge() {
    if (P.dead || P.dodgeCd > 0 || P.stamina < 20 || P.swing) return;
    let dx = 0, dy = 0; const kv = keyVector(); if (kv) [dx, dy] = kv; else [dx, dy] = worldFromScreenAng(DIR_ANG[DIRS[P.dir]]);
    P.dodgeT = 0.24; P.dodgeV = [dx * 7, dy * 7]; P.invulnT = 0.3; P.dodgeCd = 0.7; P.stamina -= 20; P.task = null; P.path = []; AU.sfx('dodge'); puff(P.x, P.y, '#b0a080', 4);
  }
  function hurtUnit(u, dmg, src, knock = 0) {
    dmg = Math.round(dmg); u.hp -= dmg; u.hurtT = 0.18; floatText(u.x, u.y, '-' + dmg, '#ff9a8a');
    u.aggroT = 14;
    if (src && !u.dead) { const d = dist(u, src) || 1, kb = 0.15 + knock; const kx = (u.x - src.x) / d * kb, ky = (u.y - src.y) / d * kb; if (walkableAt(u.x + kx, u.y + ky, true)) { u.x += kx; u.y += ky; } }
    if (u.kind === 'wolf') for (const o of units) if (o.kind === 'wolf' && !o.dead && dist(o, u) < 8) o.aggroT = 14;
    if (u.hp <= 0) killUnit(u); else if (KINDS[u.kind].flee) u.fleeT = 0;
  }
  function killUnit(u) {
    u.dead = true; u.deadT = 0; u.path = []; u.attackT = null; u.moving = false;
    if (KINDS[u.kind].night) { G.killed++; AU.sfx('hollowdie', panOf(u)); } else AU.sfx('die', panOf(u));
    if (P.task && P.task.obj === u) P.task = null;
  }
  let hurtFlash = 0;
  function damagePlayer(dmg, opt = {}) {
    if (P.dead) return; if (!opt.silent && P.invulnT > 0) { floatText(P.x, P.y, 'dodged', '#cfe8ff'); return; }
    if (P.armorHP > 0 && !opt.silent) { const absorbed = dmg * 0.4; P.armorHP -= absorbed * 2; dmg -= absorbed; if (P.armorHP <= 0) { P.armorHP = 0; message('Your hide armor falls apart.'); } }
    dmg = Math.round(dmg); if (dmg <= 0) return; P.hp -= dmg; floatText(P.x, P.y, '-' + dmg, '#ff5a4a');
    if (!opt.silent) { AU.sfx('hurt'); hurtFlash = 1; P.lastHurt = time; P.bruise = Math.min(1, P.bruise + dmg / 40); if (opt.bleed && Math.random() < opt.bleed) { P.bleed = 25; message('You are bleeding! Apply a bandage.'); } if (opt.venom) { P.sick = Math.min(120, P.sick + opt.venom); message('Venom burns in your veins…'); } }
    if (P.hp <= 0) { P.hp = 0; playerDie(); }
  }
  function playerDie() {
    P.dead = true; P.path = []; P.task = null; P.swing = null; AU.sfx('die');
    setTimeout(() => { $('deadtxt').textContent = `You survived ${G.day} day${G.day > 1 ? 's' : ''}, recovered ${inv.relic || 0} of 8 relics and banished ${G.killed} creatures of the night.`; show('dead'); }, 2200);
  }

  // ================================================================== AI
  function wander(u, dt, range = 5, speedMul = 0.55) {
    if (u.path.length) return stepUnit(u, dt, speedMul);
    u.wait -= dt; if (u.wait > 0) return;
    u.wait = rand(2, 6); const a = Math.random() * Math.PI * 2, r = Math.random() * range;
    const tx = u.home[0] + Math.cos(a) * r, ty = u.home[1] + Math.sin(a) * r;
    if (Math.hypot(tx - u.x, ty - u.y) < 8 && walkableAt(tx, ty, true)) { const p = findPath(u, tx, ty, 600); if (p) u.path = p; }
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
      if (K.night) { if (u.deadT > 1.5) u.fade -= dt * 0.7; } else if (u.deadT > 240 || u.harvested) u.fade -= dt * 0.8;
      if (u.fade <= 0) u.remove = true; return;
    }
    if (u.dissolve) { u.fade -= dt * 0.6; if (u.fade <= 0) u.remove = true; return; }
    u.cd -= dt; u.hurtT -= dt; u.aggroT -= dt; u.callT -= dt;
    const dp = P.dead ? 99 : dist(u, P);
    if (u.callT <= 0) { u.callT = K.night ? rand(6, 14) : rand(12, 35); if (dp < 16 && visible[idx(Math.floor(u.x), Math.floor(u.y))]) AU.sfx(K.call, panOf(u)); }
    const tk = idx(Math.floor(u.x), Math.floor(u.y));
    if (K.hostile && trapAt.has(tk) && (u.trapCd || 0) <= 0) { const tr = trapAt.get(tk); if (!tr.gone) { hurtUnit(u, 30, null); u.trapCd = 1.2; tr.uses = (tr.uses == null ? 4 : tr.uses) - 1; markDirty(tr); if (tr.uses <= 0) destroyStruct(tr); AU.sfx('hit'); } }
    u.trapCd = (u.trapCd || 0) - dt;
    if (u.attackT != null) {
      u.attackT += dt;
      if (!u.hitDone && u.attackT >= 0.25) {
        u.hitDone = true; const t = u.atkTarget;
        if (K.ranged) { if (t === P && !P.dead) { const d = dist(u, P) || 1, sp = 5.2; projectiles.push({ x: u.x, y: u.y, z: 0.5, vz: 0, vx: (P.x - u.x) / d * sp, vy: (P.y - u.y) / d * sp, life: K.reach / sp + 0.4, dmg: K.dmg, kind: 'bolt', enemy: true }); AU.sfx('bolt', panOf(u)); } }
        else if (t === P) { if (!P.dead && dist(u, P) <= K.reach + 0.35) damagePlayer(K.dmg * rand(0.85, 1.15), { bleed: K.bleed, venom: K.venom }); }
        else if (t && !t.gone) { t.hp -= K.structDmg || K.dmg; AU.sfx('thud', panOf(t)); puff(t.x, t.y, '#6a5040'); markDirty(t); const th = (STRUCTS[t.struct] || {}).thorns; if (th) hurtUnit(u, th, null);
          if (t.struct === 'campfire' && !t.warned) { t.warned = 1; message('A Hollow is smothering your fire!'); } if (t.hp <= 0) destroyStruct(t); }
      }
      if (u.attackT >= 0.5) u.attackT = null; return;
    }
    if (u.leapT > 0) { u.leapT -= dt; const nx = u.x + u.leapV[0] * dt, ny = u.y + u.leapV[1] * dt; if (walkableAt(nx, ny, true)) { u.x = nx; u.y = ny; } u.moving = true; u.walkT += dt * 2; return; }
    const night = nightness() > 0.5;
    switch (u.kind) {
      case 'deer': case 'sheep': if (dp < K.flee || u.aggroT > 0) fleeFrom(u, P, dt, 6, u.kind === 'deer' ? 1.4 : 1.2); else wander(u, dt, 5, 0.5); break;
      case 'wolf': { const aggro = u.aggroT > 0 || dp < (night ? K.nightAggro : K.aggro); if (u.hp < u.maxHp * 0.25) { fleeFrom(u, P, dt, 7, 1.3); break; } if (aggro && !P.dead) chase(u, dt, 1.25); else wander(u, dt, 6, 0.6); break; }
      case 'boar': case 'bear': if ((u.aggroT > 0 || dp < K.aggro) && !P.dead) { if (dp < K.aggro) u.aggroT = Math.max(u.aggroT, 6); chase(u, dt, u.kind === 'boar' ? 1.35 : 1.15); } else wander(u, dt, 4, 0.45); break;
      case 'spider': if ((u.aggroT > 0 || dp < (night ? K.aggro + 2 : K.aggro)) && !P.dead) chase(u, dt, 1.2); else wander(u, dt, 3, 0.4); break;
      case 'wisp': {
        if (P.dead) { wander(u, dt, 3, 0.5); break; }
        face(u, P);
        if (dp > 5.5 || !los(u.x, u.y, P.x, P.y, true)) chase(u, dt, 0.9);
        else if (dp < 3.5) fleeFrom(u, P, dt, 3, 1.1);
        else { u.moving = false; if (u.cd <= 0) startUnitAttack(u, P); }
        break;
      }
      case 'stalker':
        if (!P.dead && dp > 1.6 && dp < 3.4 && u.cd <= 0 && !wardAt(P.x, P.y) && los(u.x, u.y, P.x, P.y, true) && Math.random() < dt * 2) { const d = dp || 1; u.leapT = 0.3; u.leapV = [(P.x - u.x) / d * 7, (P.y - u.y) / d * 7]; face(u, P); u.cd = 0.2; break; }
        if (P.dead) wander(u, dt, 4, 0.6); else chase(u, dt, 1); break;
      default: if (P.dead) wander(u, dt, 4, 0.6); else chase(u, dt, 1);
    }
    if (u.hp < u.maxHp && !K.night && u.aggroT < -20) u.hp = Math.min(u.maxHp, u.hp + dt * 0.5);
  }
  function chase(u, dt, speedMul) {
    const K = KINDS[u.kind], dp = dist(u, P);
    u.braveT -= dt;
    if (u.braveT <= 0) {
      u.braveT = rand(5, 9); u.brave = Math.random() < (K.fear < 1 ? 0.45 : 0.08 + G.day * 0.028) + (G.beaconNight ? 0.25 : 0) - (inv.relic || 0) * 0.015;
      if (u.brave && K.night && Math.random() < 0.45) { const [pl, ps] = lightAt(P.x, P.y, true); if (pl > 0 && ps && ps.o && ps.o.struct !== 'beacon' && !ps.ward && !ps.o.gone) { u.wall = ps.o; u.path = []; u.repath = 0; } }
    }
    const warded = K.night && (wardAt(u.x, u.y) || wardAt(P.x, P.y));
    const fearful = K.fear && (!u.brave || warded) && (dp > 2.2 || warded);
    if (fearful) {
      const [selfLit, src] = lightAt(u.x, u.y);
      if (selfLit > 0.12) { fleeFrom(u, src, dt, src.r - Math.hypot(u.x - src.x, u.y - src.y) + 1.5, 1.2); return; }
      const [pLit, psrc] = lightAt(P.x, P.y);
      if (pLit > 0) {
        const a = Math.atan2(u.y - psrc.y, u.x - psrc.x) + dt * 0.4, r = psrc.r + 0.8;
        const tx = psrc.x + Math.cos(a) * r, ty = psrc.y + Math.sin(a) * r;
        if (walkableAt(tx, ty, true)) { const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy); if (d > 0.1) { const sp = Math.min(d, u.speed * 0.5 * dt); const nx = u.x + dx / d * sp, ny = u.y + dy / d * sp; if (walkableAt(nx, ny, true)) { u.x = nx; u.y = ny; } u.dir = dirFromVec(P.x - u.x, P.y - u.y, u.dir); u.moving = true; u.walkT += dt * 0.5; } }
        return;
      }
    }
    if (dp <= K.reach && !K.ranged) { if (u.cd <= 0) startUnitAttack(u, P); else { face(u, P); u.moving = false; } return; }
    if (u.wall && !u.wall.gone && u.brave && (u.wall.struct === 'campfire' || u.wall.struct === 'brazier') && dist(u, u.wall) >= 1.2) {
      u.repath -= dt; if (u.repath <= 0) { u.repath = 0.8; const ap = approachPoint(u.wall, u); const pp = ap && findPath(u, ap[0], ap[1], 2500); u.path = pp || []; }
      stepUnit(u, dt, speedMul); return;
    }
    if (u.wall && !u.wall.gone && reachDist(u.wall, u) < 0.9) { if (u.cd <= 0) startUnitAttack(u, u.wall); else face(u, u.wall); return; }
    u.repath -= dt;
    if (u.repath <= 0) {
      u.repath = rand(0.6, 1.0);
      const p = dp < 40 ? findPath(u, P.x, P.y, 2500) : null;
      if (p) { u.path = p; u.wall = null; }
      else if (dp < 14 && objects.some(o => o.struct && !o.world && o.blocks && !o.gone && dist(o, u) < 12)) {
        let best = null, bd = 1e9; for (const o of objects) { if (o.gone || !o.struct || o.world || !o.blocks) continue; const d = dist(o, u) + dist(o, P) * 0.6; if (d < bd && dist(o, u) < 12) { bd = d; best = o; } }
        if (best) { u.wall = best; const ap = approachPoint(best, u); if (ap) { const pp = findPath(u, ap[0], ap[1], 2500); u.path = pp || []; } }
      } else u.path = [[P.x, P.y]];
    }
    stepUnit(u, dt, speedMul);
  }

  // ================================================================== sleep / beacon / days
  function hostilesNear(r) { return units.some(u => !u.dead && !u.dissolve && KINDS[u.kind] && KINDS[u.kind].hostile && (KINDS[u.kind].night || u.aggroT > 0) && dist(u, P) < r); }
  function trySleep(o) {
    if (hostilesNear(10)) { message("You can't sleep with enemies nearby."); return; }
    const evening = G.tod >= 0.55 || G.tod < 0.02;
    const fade = $('sleepfade'); fade.textContent = evening ? 'Sleeping…' : 'Resting…'; fade.style.opacity = 1; G.paused = true; G.sleeping = true;
    setTimeout(() => {
      if (evening) { if (G.tod > 0.5) G.day++; G.tod = 0.05; } else G.tod = Math.min(0.6, G.tod + 0.12);
      const q = STRUCTS[o.struct].sleep || 1;
      P.hp = Math.min(P.maxHp, P.hp + (evening ? [0, 25, 45, 70][q] : 10) + P.comfort * 2); P.stamina = 100; P.warmth = Math.max(P.warmth, 60); P.wet = 0;
      P.hunger = Math.max(0, P.hunger - (evening ? 18 : 6)); P.thirst = Math.max(0, P.thirst - (evening ? 22 : 8));
      for (const u of units) if (KINDS[u.kind] && KINDS[u.kind].night) u.remove = true;
      saveGame(); fade.textContent = evening ? `Day ${G.day}` : 'Rested';
      setTimeout(() => { fade.style.opacity = 0; G.sleeping = false; updatePause(); message(evening ? `You wake at dawn. Day ${G.day}. Game saved.` : 'You feel rested. Game saved.'); }, 900);
    }, 1100);
  }
  function lightBeacon(o) {
    if (!isNight() && G.tod < 0.55) { message('Light the beacon at dusk. Its fire will burn through the night.'); return; }
    G.beacon.lit = true; G.beacon.sawNight = false; o.asset = 'beacon_lit'; markDirty(o); G.beaconNight = true;
    message('The beacon blazes across the sea. Survive until dawn!'); AU.sfx('relic'); saveGame();
  }
  let lastNight = false;
  function advanceTime(dt) {
    const prev = G.tod; G.tod += dt / DAY_SECONDS;
    if (G.tod >= 1) { G.tod -= 1; G.day++; message(`Day ${G.day} dawns.`); }
    const night = isNight();
    if (night && !lastNight) { message(G.beacon && G.beacon.lit ? 'The final night. Hold out until dawn!' : 'Night falls. Stay near the fire…'); AU.sfx('night'); }
    if (!night && lastNight) {
      for (const u of units) if (KINDS[u.kind] && KINDS[u.kind].night && !u.dead) u.dissolve = true;
      if (G.beacon && G.beacon.lit && G.beacon.sawNight && !G.won) win();
      else if (!P.dead) { saveGame(); message('The creatures of the night retreat. Game saved.'); }
      G.beaconNight = false;
    }
    if (night && G.beacon && G.beacon.lit) { G.beacon.sawNight = true; G.beaconNight = true; }
    lastNight = night;
    if (prev < 0.62 && G.tod >= 0.62 && !G.won) message('Dusk is coming. Prepare a fire.');
  }
  function win() {
    G.won = true; AU.sfx('relic');
    $('wintxt').textContent = `At first light a ship answers the beacon. You survived ${G.day} days and banished ${G.killed} creatures of the night on the Lantern Isles.`;
    show('win'); saveGame();
  }
  function spawnNight(dt) {
    if (P.dead) return;
    const foggyDay = !isNight() && WX.S.cur.fog > 0.55 && danger(P.x, P.y) > 0.35;
    if (!isNight() && !foggyDay) return;
    G.spawnT -= dt; if (G.spawnT > 0) return;
    G.spawnT = rand(3, 7) / (1 + G.day * 0.08) * (G.beaconNight ? 0.4 : 1);
    const alive = units.filter(u => KINDS[u.kind] && KINDS[u.kind].night && !u.dead && !u.dissolve).length;
    const cap = foggyDay ? 3 : G.beaconNight ? 18 : clamp(Math.round(1 + G.day * 1.0 + danger(P.x, P.y) * 4 - (inv.relic || 0) * 0.35), 1, 14);
    if (alive >= cap) return;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, r = rand(10, 15), x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
      if (!inMap(Math.floor(x), Math.floor(y)) || !walkableAt(x, y, true)) continue;
      if (lightAt(x, y)[0] > 0) continue;
      const dz = Math.max(danger(x, y), danger(P.x, P.y));
      const table = NIGHT_SPAWNS.filter(([k, md, mz]) => (G.day >= md || dz >= mz) && (!foggyDay || k === 'stalker' || k === 'crawler'));
      if (!table.length) return;
      const extra = G.beaconNight ? 3 : 1; let tot = 0; for (const [, , , w] of table) tot += w; let rr = Math.random() * tot, kind = table[0][0];
      for (const [k, , , w] of table) { rr -= w * (k === 'hollow' ? 1 : extra); if (rr <= 0) { kind = k; break; } }
      addUnit(kind, x, y, { home: [x, y], fade: 0.01, rise: true });
      if (Math.random() < 0.5) AU.sfx(KINDS[kind].call, clamp((x - P.x - (y - P.y)) / 10, -1, 1));
      return;
    }
  }

  // ================================================================== save / load
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
  function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function saveGame() {
    if (!P || P.dead) return false;
    const objs = {}, structs = [];
    for (const o of objects) {
      if (o.id < baseObjCount && o.dirty) objs[o.id] = { gone: o.gone || 0, dig: o.dig, asset: o.asset, blocks: o.blocks, res: o.res, hp: o.hp, empty: o.empty, regrow: o.regrow, wasBerry: o.wasBerry, looted: o.looted, relic: o.relic, fuel: o.fuel, fp: o.fp };
      if (o.id >= baseObjCount && o.struct && !o.gone) structs.push({ t: o.struct, x: o.x, y: o.y, hp: o.hp, fuel: o.fuel, water: o.water, store: o.store, uses: o.uses, asset: o.asset, orient: o.orient, rack: o.rack, stage: o.stage, growT: o.growT });
    }
    const exp = new Uint8Array(Math.ceil(N * N / 8)); for (let k = 0; k < N * N; k++) if (explored[k]) exp[k >> 3] |= 1 << (k & 7);
    const p = {}; for (const k of ['x', 'y', 'hp', 'hunger', 'thirst', 'stamina', 'warmth', 'wet', 'bleed', 'sick', 'weapon', 'armorHP', 'torchT', 'water']) p[k] = P[k]; p.slots = slots.map(q => q && [q.id, q.n]);
    const drops = objects.filter(o => o.drop && !o.gone && o.drop.some(Boolean)).map(o => ({ x: o.x, y: o.y, s: o.drop.map(q => q && [q.id, q.n]) }));
    const data = { v: 2, seed, day: G.day, tod: G.tod, won: G.won, killed: G.killed, beacon: G.beacon ? { lit: G.beacon.lit, sawNight: G.beacon.sawNight } : null,
      weather: { type: WX.S.type, t: WX.S.t, snow: WX.S.snowCover }, sites: sites.map(s => s.found ? 1 : 0), p, objs, structs, drops, exp: b64(exp) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); const d = s ? JSON.parse(s) : null; return d && d.v === 2 ? d : null; } catch (e) { return null; } }
  function applySave(d) {
    genWorld(d.seed);
    Object.assign(G, { day: d.day, tod: d.tod, won: d.won, killed: d.killed || 0, beacon: null });
    for (const [id, st] of Object.entries(d.objs)) { const o = objects[+id]; if (!o) continue; if (o.blocks) setBlock(o, 0); Object.assign(o, st); o.dirty = true; if (o.gone) continue; if (o.blocks) setBlock(o, o.struct === 'gate' ? 2 : 1); }
    for (const s of d.structs) { const o = addStruct(s.t, s.x, s.y, { hp: s.hp, fuel: s.fuel, water: s.water, store: s.store, uses: s.uses, orient: s.orient, rack: s.rack, stage: s.stage, growT: s.growT }); if (s.asset) o.asset = s.asset; }
    if (d.beacon && G.beacon) Object.assign(G.beacon, d.beacon);
    if (d.weather) { WX.force(d.weather.type); WX.S.t = d.weather.t; WX.S.snowCover = d.weather.snow || 0; }
    d.sites.forEach((f, n) => { if (sites[n]) sites[n].found = !!f; });
    const exp = unb64(d.exp); for (let k = 0; k < N * N; k++) explored[k] = (exp[k >> 3] >> (k & 7)) & 1;
    spawnPlayer(d.p.x, d.p.y); newPlayerState();
    if (d.p.slots) d.p.slots.forEach((q, i) => { slots[i] = q && ITEMS[q[0]] ? { id: q[0], n: q[1] } : null; });
    else for (const [k, n] of Object.entries(d.p.inv || {})) if (ITEMS[k]) putInto(slots, k, n, usable(k) ? ORD_HOT : ORD_PACK); // older saves
    for (const dr of d.drops || []) { const o = addObj('chest', dr.x, dr.y, { drop: dr.s.map(q => q && { id: q[0], n: q[1] }), blocks: false }); markDirty(o); }
    for (const k of Object.keys(d.p)) if (k !== 'inv' && k !== 'slots' && d.p[k] != null) P[k] = d.p[k];
    setWeapon(d.p.weapon || 'fists');
  }

  // ================================================================== terrain chunks
  const chunks = new Map(); let chunkQueue = []; const queued = new Set();
  const L = S.lighting.sunDir, TSL = S.lighting.terrainSlope;
  const FLAT = TSL.ambient + TSL.litSlopeGain * L[2];
  const FOAM = PAL.hex('#e3efe9');
  const SNAP = /[?&]snap=1/.test(location.search); // terrain keeps the texture artists' exact colours unless ?snap=1
  function renderChunk(cx, cy) {
    const X0 = cx * CH, Y0 = cy * CH, sBuf = new Float32Array(CH * CH).fill(NaN);
    const ds = 1 / 64, sLo = Y0 / HHp - 0.25, sHi = (Y0 + CH + MAXLV * ZPX) / HHp + 0.25;
    for (let col = 0; col < CH; col++) {
      const c = (X0 + col + 0.5) / HWp; let prev = null;
      for (let s = sLo; s <= sHi; s += ds) {
        const x = (s + c) / 2, y = (s - c) / 2, inside = x >= 0 && y >= 0 && x < N && y < N;
        const h = inside ? hAt(x, y) : 0, sy = s * HHp - h * ZPX - Y0;
        if (prev !== null && sy > prev) { const a = Math.max(0, Math.ceil(prev)), b = Math.min(CH - 1, Math.floor(sy)); for (let py = a; py <= b; py++) sBuf[py * CH + col] = inside ? s : NaN; }
        prev = Math.max(prev === null ? -1e9 : prev, sy); if (prev > CH) break;
      }
    }
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = CH; const g = cvs.getContext('2d'), img = g.createImageData(CH, CH), d = img.data;
    const snow = document.createElement('canvas'); snow.width = snow.height = CH; const sg = snow.getContext('2d'), simg = sg.createImageData(CH, CH), sd = simg.data;
    for (let py = 0; py < CH; py++) for (let px = 0; px < CH; px++) {
      const s = sBuf[py * CH + px]; if (s !== s) continue;
      const c = (X0 + px + 0.5) / HWp, x = (s + c) / 2, y = (s - c) / 2;
      const wx = (noise2(x * 1.6, y * 1.6, 1e5, 91) - 0.5) * 1.05 + (noise2(x * 5, y * 5, 1e5, 93) - 0.5) * 0.35;
      const wy = (noise2(x * 1.6 + 31, y * 1.6 + 17, 1e5, 92) - 0.5) * 1.05 + (noise2(x * 5 + 5, y * 5 + 9, 1e5, 94) - 0.5) * 0.35;
      const t1 = type[idx(clamp(Math.floor(x + wx), 0, N - 1), clamp(Math.floor(y + wy), 0, N - 1))];
      const t2 = type[idx(clamp(Math.floor(x + wx * 0.55), 0, N - 1), clamp(Math.floor(y + wy * 0.55), 0, N - 1))];
      const u = ((Math.floor(x * TPT) % TS) + TS) % TS, v = ((Math.floor(y * TPT) % TS) + TS) % TS, ti_ = v * TS + u;
      let r, gg, b; const sample = t => { const p = TEX[t][ti_]; return [p & 255, (p >> 8) & 255, (p >> 16) & 255]; };
      const depth = bil(waterDist, x - 0.5, y - 0.5); let shade = 1;
      if (isWater(t1) || isWater(t2)) {
        const wsh = sample(TYPES.shallow), wdp = sample(TYPES.deep), k = NZ.smooth(clamp((depth - 0.8) / 2.2, 0, 1));
        let col = [wsh[0] + (wdp[0] - wsh[0]) * k, wsh[1] + (wdp[1] - wsh[1]) * k, wsh[2] + (wdp[2] - wsh[2]) * k];
        if (!isWater(t1) || !isWater(t2)) { const land = sample(isWater(t1) ? t2 : t1); col = col.map((v, i) => (v + land[i]) / 2); }
        if (depth < 0.95 && noise2(x * 5, y * 5, 1e5, 77) > 0.35 + depth * 0.45) col = col.map((v, i) => v + (FOAM[i] - v) * 0.55);
        [r, gg, b] = col;
      } else {
        let col = sample(t1); if (t2 !== t1) { const c2 = sample(t2); col = [(col[0] + c2[0]) / 2, (col[1] + c2[1]) / 2, (col[2] + c2[2]) / 2]; }
        const ld = bil(landDist, x - 0.5, y - 0.5); if (ld < 1.4 && t1 === TYPES.sand) { const m = 0.82 + 0.18 * clamp(ld - 0.4, 0, 1); col = col.map(v => v * m); }
        const e = 0.08, hx = (hAt(x + e, y) - hAt(x - e, y)) / (2 * e) * LV_UNITS, hy = (hAt(x, y + e) - hAt(x, y - e)) / (2 * e) * LV_UNITS;
        const nl = Math.hypot(hx, hy, 1), ndl = (-hx * L[0] - hy * L[1] + L[2]) / nl; shade = (TSL.ambient + TSL.litSlopeGain * Math.max(0, ndl)) / FLAT;
        [r, gg, b] = [col[0] * shade, col[1] * shade, col[2] * shade];
        // snow layer for this pixel (shown when it snows)
        const snc = sample(TYPES.snow), sh2 = Math.min(1.08, shade + 0.04), sq = SNAP ? PAL.quantize(snc[0] * shade, snc[1] * shade, snc[2] * sh2) : [snc[0] * shade, snc[1] * shade, snc[2] * sh2], so = (py * CH + px) * 4; // snow cover uses the snow texture
        // mostly continuous cover with small bare patches, thinner on steep slopes, dithered pixel-art edges
        const cov = 0.62 * noise2(x * 2.2, y * 2.2, 1e5, 62) + 0.38 * noise2(x * 9, y * 9, 1e5, 63) - Math.min(0.3, Math.hypot(hx, hy) * 0.12);
        sd[so] = sq[0]; sd[so + 1] = sq[1]; sd[so + 2] = sq[2]; sd[so + 3] = cov > 0.34 ? 255 : cov > 0.3 && ((px + py) & 1) ? 255 : 0;
      }
      const q = SNAP ? PAL.quantize(r, gg, b) : [r, gg, b], o = (py * CH + px) * 4; d[o] = q[0]; d[o + 1] = q[1]; d[o + 2] = q[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); sg.putImageData(simg, 0, 0);
    return { c: cvs, snow };
  }
  function bil(F, x, y) {
    x = clamp(x, 0, N - 1.001); y = clamp(y, 0, N - 1.001); const xi = x | 0, yi = y | 0, u = x - xi, v = y - yi, o = xi * N + yi;
    const a = Math.min(F[o], 9), b = Math.min(F[o + N], 9), c = Math.min(F[o + 1], 9), dd = Math.min(F[o + N + 1], 9);
    return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v;
  }
  function getChunk(cx, cy, now) {
    const key = cx + ',' + cy; let c = chunks.get(key); if (c) return c;
    if (now) { c = renderChunk(cx, cy); chunks.set(key, c); return c; }
    if (queued.has(key)) { const at = chunkQueue.indexOf(key); if (at > 0) { chunkQueue.splice(at, 1); chunkQueue.unshift(key); } } else { queued.add(key); chunkQueue.unshift(key); }
    return null;
  }

  // ================================================================== view
  const cv = $('game'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, lowDetail = false;
  const ZOOMS = [0.5, 1, 2, 3, 4];
  let zi = 1;
  const cam = { x: 0, y: 0, follow: true };
  const fogC = document.createElement('canvas'), fogX = fogC.getContext('2d'), dimC = document.createElement('canvas'), dimX = dimC.getContext('2d');
  const nightC = document.createElement('canvas'), nightX = nightC.getContext('2d');
  function resize() { dpr = Math.min(3, window.devicePixelRatio || 1); W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr); cv.width = W; cv.height = H; fogC.width = Math.ceil(W / 8); fogC.height = Math.ceil(H / 8); nightC.width = Math.ceil(W / 4); nightC.height = Math.ceil(H / 4); }
  addEventListener('resize', resize);
  const zoom = () => ZOOMS[zi];
  const toScreen = (x, y) => { const h = hAt(x, y); return [(x - y) * HWp, (x + y) * HHp - h * ZPX]; };
  let time = 0, marker = null, hoverObj = null, walkers = [], view = { ox: 0, oy: 0, vl: 0, vt: 0, vr: 0, vb: 0 };

  function animCol(a, u) {
    if (!a.anim) return 0;
    if (u.dead) return a.anim.dead[0];
    if (u === P && P.swing) return a.anim.attack[0] + Math.min(a.anim.attack[1] - 1, Math.floor(P.swing.t / P.swing.dur * a.anim.attack[1]));
    if (u.attackT != null) return a.anim.attack[0] + Math.min(a.anim.attack[1] - 1, Math.floor(u.attackT / 0.5 * a.anim.attack[1]));
    if (u.moving) return a.anim.walk[0] + (Math.floor(u.walkT * a.fps) % a.anim.walk[1]);
    return 0;
  }
  // Per-object wind state. The phase is integrated (never time * rate), so a gust changes how far things bend,
  // not how fast they flicker; tempo only rises gently with wind.
  function windState(o, sx, sy, baseRate, gain) {
    const w = WX.windAt(sx, sy), d = Math.min(0.1, Math.max(0, time - (o.wt == null ? time : o.wt)));
    if (o.wt == null) { o.ws = w; o.wph = (o.x * 3.7 + o.y * 5.3) % 6; }
    o.wt = time; o.ws += (w - o.ws) * Math.min(1, d * 1.2); o.wph += d * (baseRate + Math.min(1.2, o.ws) * gain);
    return o;
  }
  // damped spring per plant: bends away (screen x) from nearby walkers and flattens under them, then springs back
  function pushState(o) {
    let tx = 0, tq = 0;
    for (const u of walkers) {
      const dx = o.x - u.x, dy = o.y - u.y; if (dx > 0.9 || dx < -0.9 || dy > 0.9 || dy < -0.9) continue;
      const d = Math.hypot(dx, dy), r = u.kind === 'bear' || u.kind === 'brute' ? 0.9 : 0.68; if (d >= r) continue;
      const pr = 1 - d / r, side = (dx - dy) / Math.max(0.12, d);
      tx += clamp(Math.abs(dx - dy) < 0.08 ? (((o.x * 13.1 + o.y * 7.7) | 0) % 2 ? 1 : -1) : side, -1, 1) * pr; tq = Math.max(tq, pr);
    }
    const dd = Math.min(0.05, Math.max(0, time - (o.pt == null ? time : o.pt))); o.pt = time;
    o.pp = o.pp || 0; o.pv = o.pv || 0; o.pq = o.pq || 0;
    o.pv += ((clamp(tx, -1.2, 1.2) - o.pp) * 140 - o.pv * 11) * dd; o.pp += o.pv * dd;
    o.pq += (tq - o.pq) * Math.min(1, dd * (tq > o.pq ? 18 : 3));
    return o;
  }
  function blit(img, a, col, row, X, Y) { ctx.drawImage(img, col * a.w, row * a.h, a.w, a.h, X - a.ax, Y - a.ay, a.w, a.h); }
  function drawAsset(name, o, sx, sy, shadowPass, alpha = 1, colOverride) {
    const a = SPR[name]; if (!a) return; const img = shadowPass ? a.sh : a.img; if (!img) return;
    const X = Math.round(sx), Y = Math.round(sy);
    if (alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    let col = colOverride || 0;
    if (a.wind && a.wind.bend) {
      // trees: leaf flutter frames + whole-tree bending in the wind (strips shifted more toward the top)
      const ws = windState(o, sx, sy, 1.15, 0.45), w = ws.ws; col = w > 0.05 ? Math.floor(ws.wph * 2.6) % 3 : 0;
      // strong wind: a deeper lean and wider sway, with a second faster harmonic for buffeting, at nearly the same tempo
      const push = o.decor && !shadowPass ? pushState(o).pp * 6 : 0;
      const sway = push + (Math.sin(ws.wph) * (0.6 + w * 2.6) + Math.sin(ws.wph * 2.3 + o.x) * w * w * 0.9 + w * 3.2) * (o.shake ? 1 + o.shake * 6 : 1) + (o.shake ? Math.sin(time * 60) * o.shake * 4 : 0);
      if (!shadowPass && !lowDetail && Math.abs(sway) > 0.45) {
        const top = 0, bottom = a.ay, strip = 8;
        for (let y = top; y < a.h; y += strip) { const hgt = Math.min(strip, a.h - y), f = y + hgt / 2 < bottom ? Math.pow((bottom - (y + hgt / 2)) / bottom, 1.6) : 0; ctx.drawImage(img, col * a.w, y, a.w, hgt, X - a.ax + Math.round(sway * f), Y - a.ay + y, a.w, hgt); }
        ctx.globalAlpha = 1; return;
      }
    } else if (a.wind) { // grass & flowers: baked sway frames, breeze or gale set
      const ws = windState(o, sx, sy, 4.5, 1.5), w = ws.ws;
      if (w > 0.07) { o.gale = o.gale ? w > 0.62 : w > 0.8; const set = o.gale ? a.wind.gale : a.wind.breeze; col = set[0] + (Math.floor(ws.wph) % set[1]); }
      // pushed aside by anyone walking through (grass, flowers, reeds)
      if (!shadowPass) {
        pushState(o);
        if (Math.abs(o.pp) > 0.04 || o.pq > 0.03) {
          const shift = o.pp * 7, sq = o.pq * 0.45, ay = a.ay;
          for (let y = 0; y < ay; y += 2) {
            const hgt = Math.min(2, ay - y), f = Math.pow((ay - y - hgt / 2) / ay, 1.2), ny = ay - (ay - y) * (1 - sq * f);
            ctx.drawImage(img, col * a.w, y, a.w, hgt, X - a.ax + Math.round(shift * f), Y - ay + Math.round(ny), a.w, Math.max(1, Math.round(hgt * (1 - sq * f))));
          }
          if (a.h > ay) ctx.drawImage(img, col * a.w, ay, a.w, a.h - ay, X - a.ax, Y, a.w, a.h - ay);
          ctx.globalAlpha = 1; return;
        }
      }
    } else if (a.frames > 1 && !colOverride) col = Math.floor(time * (a.fps || 8) + o.x * 7) % a.frames;
    blit(img, a, col, 0, X, Y);
    ctx.globalAlpha = 1;
  }
  function drawUnit(u, sx, sy, shadowPass, alpha) {
    const a = SPR[u.asset]; if (!a) return; const img = shadowPass ? a.sh : a.img; if (!img) return;
    const row = Math.max(0, a.dirs.indexOf(DIRS[u.dir])), col = animCol(a, u), X = Math.round(sx), Y = Math.round(sy - (u.kind === 'wisp' ? 0 : 0));
    if (alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    blit(img, a, col, row, X, Y);
    if (!shadowPass && u.hurtT > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; blit(img, a, col, row, X, Y); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
  }
  const WALL_PARTS_BACK = [['in', -1, 0], ['jn', 0, -1]], WALL_PARTS_FRONT = [['ip', 1, 0], ['jp', 0, 1]];
  function drawObject(o, sx, sy, shadowPass) {
    const def = o.struct ? STRUCTS[o.struct] : null;
    if (def && def.wall) {
      const fam = def.wall, i = Math.floor(o.x), j = Math.floor(o.y);
      for (const [p, di, dj] of WALL_PARTS_BACK) if (wallAt(i + di, j + dj)) drawAsset(`wall_${fam}_${p}`, o, sx, sy, shadowPass);
      drawAsset(`wall_${fam}_post`, o, sx, sy, shadowPass);
      for (const [p, di, dj] of WALL_PARTS_FRONT) if (wallAt(i + di, j + dj)) drawAsset(`wall_${fam}_${p}`, o, sx, sy, shadowPass);
      return;
    }
    if (o.struct === 'gate') { const open = P && !P.dead && dist(o, P) < 1.5; drawAsset(`gate_${o.orient || 'i'}${open ? '_open' : ''}`, o, sx, sy, shadowPass); return; }
    drawAsset(o.asset, o, sx, sy, shadowPass);
  }
  function draw() {
    const z = zoom();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const cx0 = Math.round(cam.x), cy0 = Math.round(cam.y); // snap the camera to whole art pixels: no sub-pixel shimmer
    const ox = Math.round(W / 2 - cx0 * z), oy = Math.round(H / 2 - cy0 * z);
    ctx.setTransform(z, 0, 0, z, ox, oy); ctx.imageSmoothingEnabled = false;
    const vl = -ox / z, vt = -oy / z, vr = vl + W / z, vb = vt + H / z; view = { ox, oy, vl, vt, vr, vb, z };
    const snowA = WX.S.snowCover;
    for (let cy = Math.floor(vt / CH); cy <= Math.floor(vb / CH); cy++) for (let cx = Math.floor(vl / CH); cx <= Math.floor(vr / CH); cx++) {
      const c = getChunk(cx, cy, false); if (!c) continue; ctx.drawImage(c.c, cx * CH, cy * CH);
      if (snowA > 0.02) { ctx.globalAlpha = Math.min(1, snowA * 1.1); ctx.drawImage(c.snow, cx * CH, cy * CH); ctx.globalAlpha = 1; }
    }
    // wet ground darkening in rain
    if (WX.S.cur.rain > 0.05) { ctx.fillStyle = `rgba(10,20,40,${WX.S.cur.rain * 0.12})`; ctx.fillRect(vl, vt, vr - vl, vb - vt); }
    ctx.fillStyle = 'rgba(235,248,255,0.85)';
    for (const s of sparkles) { const a = Math.sin(s.t / s.life * Math.PI); if (a <= 0) continue; ctx.globalAlpha = a * (1 - nightness() * 0.7) * (1 - WX.S.cur.cloud * 0.6); ctx.fillRect(Math.round(s.sx), Math.round(s.sy), 3, 1); }
    ctx.globalAlpha = 1;
    const ring = (o, col) => { if (!o || o.gone) return; const [sx, sy] = toScreen(o.x, o.y), r = 14 + (o.fp ? (o.fp[0] - 1) * 30 : 0); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, r, r / 2, 0, 0, Math.PI * 2); ctx.stroke(); };
    if (hoverObj && hoverObj !== P) ring(hoverObj, 'rgba(255,255,255,0.5)');
    if (P.task && P.task.obj) ring(P.task.obj, P.task.obj.unit && !P.task.obj.dead ? 'rgba(255,90,70,0.85)' : 'rgba(255,214,110,0.85)');
    const list = [];
    const c0 = vl / HWp, s0 = vt / HHp, c1 = vr / HWp, s1 = (vb + 400) / HHp; // screen -> world (s = x + y, c = x - y)
    const vl0 = (s0 + c0) / 2 - 2, vr0 = (s1 + c1) / 2 + 2, vt0 = (s0 - c1) / 2 - 2, vb0 = (s1 - c0) / 2 + 2;
    const consider = (o, isUnit) => {
      const i = Math.floor(o.x), j = Math.floor(o.y); if (!inMap(i, j)) return;
      if (isUnit ? !visible[idx(i, j)] && o !== P : !explored[idx(i, j)]) return;
      const [sx, sy] = toScreen(o.x, o.y), a = SPR[o.asset]; if (!a) return;
      if (sx + a.w < vl || sx - a.w > vr || sy - a.ay > vb + 10 || sy + a.h < vt) return;
      const def = o.struct ? STRUCTS[o.struct] : null;
      list.push([o.x + o.y + (isUnit ? (o.dead ? -0.3 : 0.01) : 0) - (a.footprint[0] > 1 ? 0.3 : 0) + (def && def.flat || o.asset === 'spike_trap' || o.asset === 'stump' ? -0.6 : 0) + (o.decor ? -0.2 : 0), o, sx, sy, isUnit]);
    };
    walkers.length = 0; for (const u of units) if (!u.dead && !u.dissolve && u.kind !== 'wisp' && u.x > vl0 && u.x < vr0 && u.y > vt0 && u.y < vb0) walkers.push(u);
    for (const o of objects) if (!o.gone) consider(o, false);
    for (const u of units) consider(u, true);
    list.sort((a, b) => a[0] - b[0]);
    for (const it of list) it[4] ? drawUnit(it[1], it[2], it[3], true, it[1].fade) : drawObject(it[1], it[2], it[3], true);
    for (const it of list) it[4] ? drawUnit(it[1], it[2], it[3], false, it[1].fade) : drawObject(it[1], it[2], it[3], false);
    // rolling cloud shadows darken the ground and everything standing on it
    WX.drawCloudShadows(ctx, 1 - nightness());
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
      const a = SPR[o.asset], w = 26, y = it[3] - (it[4] ? (o.kind === 'brute' || o.kind === 'bear' ? 84 : 62) : Math.min(a.ay, 80));
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(Math.round(it[2] - w / 2) - 1, Math.round(y) - 1, w + 2, 5);
      ctx.fillStyle = it[4] && KINDS[o.kind] && KINDS[o.kind].hostile ? '#d8463a' : '#e0b040'; ctx.fillRect(Math.round(it[2] - w / 2), Math.round(y), Math.round(w * clamp(o.hp / maxHp, 0, 1)), 3);
    }
    // aim indicator (desktop mouse or mobile drag)
    if (aimVis > 0 && !P.dead) {
      const [sx, sy] = toScreen(P.x, P.y), w = WEAPONS[P.weapon], a = P.aim, len = (w.ranged ? 5 : w.reach) * HWp;
      ctx.globalAlpha = aimVis * 0.6; ctx.strokeStyle = w.ranged ? '#ffe39a' : '#ffffff'; ctx.lineWidth = 1;
      if (w.ranged) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sx, sy - 22); ctx.lineTo(sx + Math.cos(a) * len, sy - 22 + Math.sin(a) * len * 0.5); ctx.stroke(); ctx.setLineDash([]); }
      else { const arc = w.arc * Math.PI / 180; ctx.beginPath(); ctx.ellipse(sx, sy, len, len / 2, 0, a - arc, a + arc); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // fire glows
    ctx.globalCompositeOperation = 'lighter';
    for (const Lg of lights) {
      const [sx, sy] = toScreen(Lg.x, Lg.y), r = Lg.r * 22, fl = 0.85 + 0.15 * Math.sin(time * 9 + Lg.x * 3), cy1 = sy - (Lg.torch ? 30 : 14);
      const col = Lg.ward ? '140,220,255' : '255,190,100', g = ctx.createRadialGradient(sx, cy1, 2, sx, cy1, r); g.addColorStop(0, `rgba(${col},${(0.16 + 0.25 * nightness()) * fl})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(sx - r, cy1 - r, r * 2, r * 2);
    }
    for (const it of list) if (it[1].asset === 'shrine_lit') { const g = ctx.createRadialGradient(it[2], it[3] - 55, 2, it[2], it[3] - 55, 60); g.addColorStop(0, 'rgba(255,215,120,0.35)'); g.addColorStop(1, 'rgba(255,200,100,0)'); ctx.fillStyle = g; ctx.fillRect(it[2] - 60, it[3] - 115, 120, 120); }
    for (const u of units) if (KINDS[u.kind] && KINDS[u.kind].night && !u.dead && visible[idx(Math.floor(u.x), Math.floor(u.y))]) { const [sx, sy] = toScreen(u.x, u.y), h = u.kind === 'brute' ? 74 : u.kind === 'crawler' ? 22 : u.kind === 'wisp' ? 38 : 52; const g = ctx.createRadialGradient(sx + 3, sy - h, 1, sx + 3, sy - h, u.kind === 'wisp' ? 30 : 16); g.addColorStop(0, `rgba(140,230,255,${0.5 * u.fade})`); g.addColorStop(1, 'rgba(140,230,255,0)'); ctx.fillStyle = g; ctx.fillRect(sx - 30, sy - h - 30, 66, 60); }
    if (P.torchOn && !P.dead) { const [sx, sy] = toScreen(P.x, P.y), side = DIR_ANG[DIRS[P.dir]], fx = sx + Math.cos(side + Math.PI / 2) * 9, fy = sy - 34 + Math.sin(time * 20) * 0.6; ctx.fillStyle = 'rgba(255,200,90,0.95)'; ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 3, 3, 5); ctx.fillStyle = 'rgba(255,120,40,0.8)'; ctx.fillRect(Math.round(fx) - 2, Math.round(fy), 5, 3); }
    ctx.globalCompositeOperation = 'source-over';
    // projectiles
    for (const p of projectiles) {
      const [sx, sy] = toScreen(p.x, p.y), zz = p.z * 78, vx = (p.vx - p.vy) * HWp, vy = (p.vx + p.vy) * HHp - p.vz * 78, vl = Math.hypot(vx, vy) || 1, ux = vx / vl, uy = vy / vl;
      if (p.kind === 'bolt') { const g = ctx.createRadialGradient(sx, sy - zz, 1, sx, sy - zz, 9); g.addColorStop(0, 'rgba(200,250,255,1)'); g.addColorStop(1, 'rgba(120,220,255,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(sx - 9, sy - zz - 9, 18, 18); ctx.globalCompositeOperation = 'source-over'; continue; }
      if (p.kind === 'stone') { ctx.fillStyle = '#8a857a'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy - zz) - 1, 3, 3); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1); continue; }
      ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx - ux * 10, sy - zz - uy * 10); ctx.lineTo(sx, sy - zz); ctx.stroke();
      ctx.fillStyle = p.kind === 'fire_arrow' ? '#ffb040' : '#9a9a9a'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy - zz) - 1, 2, 2);
      ctx.fillStyle = '#f0f0f0'; ctx.fillRect(Math.round(sx - ux * 10) - 1, Math.round(sy - zz - uy * 10), 2, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(sx - ux * 5), Math.round(sy), 5, 1);
    }
    for (const p of dust) { const [sx, sy] = toScreen(p.x, p.y); ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c; ctx.fillRect(Math.round(sx + p.ox), Math.round(sy + p.oy - p.t * 30), 3, 3); }
    ctx.globalAlpha = 1;
    if (marker && marker.t > 0) { const [sx, sy] = toScreen(marker.x, marker.y); ctx.strokeStyle = `rgba(255,214,110,${marker.t})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, 12 * (1.5 - marker.t * 0.5), 6 * (1.5 - marker.t * 0.5), 0, 0, Math.PI * 2); ctx.stroke(); }
    // clouds drift above everything in the world
    WX.drawClouds(ctx, nightness());
    drawNight(ox, oy, z);
    ctx.setTransform(z, 0, 0, z, ox, oy); ctx.font = 'bold 10px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center';
    for (const f of floats) { const [sx, sy] = toScreen(f.x, f.y), yy = sy - 70 - f.slot * 12 - f.t * 18; ctx.globalAlpha = Math.max(0, 1 - f.t / 1.6); ctx.fillStyle = '#000'; ctx.fillText(f.text, sx + 1, yy + 1); ctx.fillStyle = f.color; ctx.fillText(f.text, sx, yy); }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    WX.drawScreen(ctx, W, H, z, cx0, cy0, lastDt, nightness());
    drawFog(ox, oy, z, vl, vt, vr, vb);
  }
  let lastDt = 0.016;
  function drawNight(ox, oy, z) {
    const n = Math.min(0.96, nightness() * 0.88 + WX.S.cur.dark * (1 - nightness() * 0.5)); if (n <= 0.01) return;
    const k = 1 / 4, x = nightX; x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, nightC.width, nightC.height);
    x.fillStyle = `rgba(6,10,26,${n})`; x.fillRect(0, 0, nightC.width, nightC.height);
    x.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, r, s) => { const [sx, sy] = toScreen(wx, wy), px = (sx * z + ox) * k, py = (sy * z + oy) * k - 8 * z * k, rr = r * HWp * 1.15 * z * k; const g = x.createRadialGradient(px, py, rr * 0.15, px, py, rr); g.addColorStop(0, `rgba(0,0,0,${s})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); };
    for (const Lg of lights) hole(Lg.x, Lg.y, Lg.r * (0.95 + 0.05 * Math.sin(time * 7 + Lg.x)), 1);
    if (!P.dead) hole(P.x, P.y, 1.8, 0.75);
    if (WX.S.flash > 0) { x.fillStyle = `rgba(0,0,0,${WX.S.flash * 0.8})`; x.fillRect(0, 0, nightC.width, nightC.height); }
    x.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(nightC, 0, 0, W, H); ctx.imageSmoothingEnabled = false;
  }
  function drawFog(ox, oy, z, vl, vt, vr, vb) {
    const f = fogX, k = 1 / 8; f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, fogC.width, fogC.height);
    f.fillStyle = '#000'; f.fillRect(0, 0, fogC.width, fogC.height);
    f.setTransform(z * k, 0, 0, z * k, ox * k, oy * k);
    const sMin = Math.floor((vt - 40) / HHp) - 1, sMax = Math.ceil((vb + MAXLV * ZPX + 40) / HHp) + 1, cMin = Math.floor(vl / HWp) - 2, cMax = Math.ceil(vr / HWp) + 2;
    dimC.width = fogC.width; dimC.height = fogC.height; dimX.setTransform(z * k, 0, 0, z * k, ox * k, oy * k); dimX.fillStyle = '#000';
    const corner = (i, j) => [(i - j) * HWp, (i + j) * HHp - Hv[clamp(i, 0, N) * (N + 1) + clamp(j, 0, N)] * ZPX];
    const poly = (g, i, j) => { const a = corner(i, j), b = corner(i + 1, j), c = corner(i + 1, j + 1), d = corner(i, j + 1); g.beginPath(); g.moveTo(a[0], a[1] - 2); g.lineTo(b[0] + 3, b[1]); g.lineTo(c[0], c[1] + 2); g.lineTo(d[0] - 3, d[1]); g.closePath(); g.fill(); };
    f.globalCompositeOperation = 'destination-out'; f.fillStyle = '#000';
    for (let s = sMin; s <= sMax; s++) for (let c = cMin; c <= cMax; c++) { if ((s + c) & 1) continue; const i = (s + c) / 2, j = (s - c) / 2; if (!inMap(i, j)) continue; const k2 = idx(i, j); if (!explored[k2]) continue; poly(f, i, j); if (!visible[k2]) poly(dimX, i, j); }
    f.globalCompositeOperation = 'source-over'; f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = S.fog.exploredAlpha; f.drawImage(dimC, 0, 0); f.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(fogC, 0, 0, W, H); ctx.imageSmoothingEnabled = false;
  }

  // ================================================================== vision
  let lastVisKey = '';
  function updateVision(force) {
    const fog = WX.S.cur.fog, night = nightness() > 0.6;
    let R = night ? (P.torchOn ? 6 : 4) : S.fog.visionRadiusTiles + (hAt(P.x, P.y) > 3.5 ? 2 : 0);
    R = Math.max(3, Math.round(R * (1 - fog * 0.45) + objects.some(o => o.struct === 'lookout' && !o.gone && dist(o, P) < 1.6) * 4));
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

  // ================================================================== interaction & update
  const keys = new Set();
  function nearestInteractable() {
    let best = null, bd = 1e9;
    for (const o of objects) { if (o.gone || Math.abs(o.x - P.x) > 4 || Math.abs(o.y - P.y) > 4) continue; const d = reachDist(o) + (o.decor ? 0.6 : 0); if (d > (o.blocks ? 1.0 : 1.5) || d >= bd) continue; const acts = actionsFor(o); if (!acts.length || acts.every(a => a.disabled)) continue; bd = d; best = o; }
    for (const u of units) { if (u === P || !u.dead) continue; const d = dist(u, P); if (d < 1.6 && d < bd && actionsFor(u).length) { bd = d; best = u; } }
    if (!best) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = Math.floor(P.x) + a, j = Math.floor(P.y) + b; if (inMap(i, j) && isWater(type[idx(i, j)])) return { water: true, x: i + 0.5, y: j + 0.5 }; }
    return best;
  }
  function drinkWater() { P.thirst = 100; if (inv.waterskin) P.water = inv.waterskin * 3; P.wet = Math.min(1, P.wet + 0.05); message(inv.waterskin ? 'You drink and fill your waterskins.' : 'You drink the cool water.'); AU.sfx('drink'); refreshUI(); }
  function interactNearest() {
    const t = nearestInteractable();
    if (!t) { message('Nothing to use here. Click or tap something to use it.'); return; }
    if (t.water) { drinkWater(); return; }
    const acts = actionsFor(t).filter(a => !a.disabled);
    if (acts.length > 1) { const [sx, sy] = toScreen(t.x, t.y); openMenuFor(t, (sx * view.z + view.ox) / dpr, (sy * view.z + view.oy) / dpr - 40); }
    else setTask(t, acts[0]);
  }
  function setTask(o, act) { act = act || actionsFor(o).find(a => !a.disabled); if (!act) return false; P.task = { obj: o, act }; P.path = []; P.taskRepath = 0; return true; }
  function updateTask(dt) {
    const T = P.task; if (!T) return;
    const o = T.obj; if (o.gone || o.remove || (o.unit && o.dead && T.act.kind === 'attack')) { P.task = null; return; }
    const still = actionsFor(o).find(a => a.kind === T.act.kind); if (!still) { P.task = null; return; }
    const reach = T.act.kind === 'attack' ? WEAPONS[P.weapon].reach : o.blocks && !o.unit ? 0.75 : (T.act.range || 1.3), d = reachDist(o);
    if (d > reach) {
      P.taskRepath -= dt;
      if (!P.path.length || P.taskRepath <= 0) {
        P.taskRepath = o.unit ? 0.4 : 3;
        const ap = o.unit ? [o.x, o.y] : approachPoint(o, P), p = ap ? findPath(P, ap[0], ap[1], 6000) : null;
        if (!p) { if (!o.unit) message("You can't reach that."); P.task = null; return; } P.path = p;
      }
      stepUnit(P, dt, sprinting() ? 1.6 : 1); return;
    }
    P.path = []; P.moving = false; face(P, o);
    if (T.act.kind === 'attack') { playerAttack(null, o); return; }
    if (P.swing || P.cdT > 0) return;
    if (needsSwing(T.act.kind)) { if (P.stamina < 4) return; P.stamina -= 4; P.cdT = 0.25; startSwing(() => { const again = perform(o, T.act); if (!again || !T.act.repeat) P.task = null; }, 0.5); }
    else { perform(o, T.act); P.task = null; }
  }
  function keyVector() {
    let kx = 0, ky = 0;
    if (keys.has('w') || keys.has('arrowup')) ky -= 1; if (keys.has('s') || keys.has('arrowdown')) ky += 1;
    if (keys.has('a') || keys.has('arrowleft')) kx -= 1; if (keys.has('d') || keys.has('arrowright')) kx += 1;
    if (joy.active && Math.hypot(joy.dx, joy.dy) > 0.18) { kx = joy.dx; ky = joy.dy; }
    if (!kx && !ky) return null; const l = Math.hypot(kx, ky); kx /= l; ky /= l;
    let dx = ky + kx / 2, dy = ky - kx / 2; const dl = Math.hypot(dx, dy); return [dx / dl, dy / dl];
  }
  let sprintToggle = false;
  const sprinting = () => (keys.has('shift') || sprintToggle) && !P.exhausted && P.stamina > 0;
  let aimVis = 0, mouseAimT = -9, rmbHeld = false;
  function update(dt) {
    time += dt; lastDt = dt;
    collectLights();
    WX.update(dt, { day: G.day, vl: view.vl, vr: view.vr, vt: view.vt, vb: view.vb, onBolt: lightningStrike, onChange: t => message({ rain: 'Rain begins to fall.', storm: 'A storm is rolling in.', fog: 'Fog creeps over the island.', snow: 'Snow begins to fall. Stay warm.', windy: 'The wind picks up.', clear: 'The skies clear.', overcast: 'Clouds gather overhead.' }[t] || '') });
    for (let k = tempLights.length - 1; k >= 0; k--) { tempLights[k].t -= dt; if (Math.random() < dt * 6) puff(tempLights[k].x, tempLights[k].y, '#ffa040', 1); if (tempLights[k].t <= 0) tempLights.splice(k, 1); }
    if (!P.dead && !G.paused) {
      advanceTime(dt);
      survivalTick(dt);
      // weather & structures
      for (const o of objects) {
        if (o.gone) continue;
        if ((o.struct === 'campfire' || o.struct === 'brazier') && o.fuel > 0) { o.fuel -= dt * (1 + WX.S.cur.rain * 0.6 + WX.wind * 0.4); if (o.fuel <= 0) { o.fuel = 0; o.asset = o.struct === 'campfire' ? 'campfire_out' : 'brazier'; markDirty(o); if (dist(o, P) < 12) message(`A ${STRUCTS[o.struct].name.toLowerCase()} has burnt out.`); } }
        if (o.struct === 'rain_collector') { o.fillT = (o.fillT || 0) + dt * (1 + WX.S.cur.rain * 5); if (o.fillT > 80) { o.fillT = 0; o.water = Math.min(4, (o.water || 0) + 1); } }
        if (o.struct === 'drying_rack' && o.rack && o.rack.length) for (let k = 0; k < o.rack.length; k++) o.rack[k] -= dt * (WX.S.cur.rain > 0.3 ? 0.4 : 1);
        if (o.struct === 'garden' && o.stage === 1) { o.growT -= dt * (1 + WX.S.cur.rain); if (o.growT <= 0) { o.stage = 2; o.asset = 'garden_ripe'; markDirty(o); } }
        if (o.regrow > 0) { o.regrow -= dt; if (o.regrow <= 0) { o.regrow = 0; o.empty = false; if (o.wasBerry) { o.asset = 'berry_bush'; o.wasBerry = false; } markDirty(o); } }
        if (o.shake > 0) o.shake = Math.max(0, o.shake - dt);
      }
      // player movement
      P.cdT = (P.cdT || 0) - dt; P.dodgeCd -= dt; P.invulnT -= dt;
      if (P.dodgeT > 0) { P.dodgeT -= dt; const nx = P.x + P.dodgeV[0] * dt, ny = P.y + P.dodgeV[1] * dt; if (walkableAt(nx, ny)) { P.x = nx; P.y = ny; } P.moving = true; P.walkT += dt * 2; }
      else {
        // swings no longer freeze the player: while fighting, movement eases to a steady slower pace instead of stop-start
        if (P.swing) { P.swing.t += dt; if (!P.swing.hit && P.swing.t >= P.swing.dur * 0.55) { P.swing.hit = true; P.swing.onHit(); } if (P.swing.t >= P.swing.dur) P.swing = null; }
        const fighting = !!P.swing || rmbHeld || time - (P.fightT || -9) < 0.9;
        P.combatF = (P.combatF || 1) + ((fighting ? 0.6 : 1) - (P.combatF || 1)) * Math.min(1, dt * 3);
        const kv = keyVector();
        if (kv) {
          P.path = []; P.task = null; const [dx, dy] = kv, sp = P.speed * dt * (sprinting() ? 1.65 : 1) * (P.hp < 20 ? 0.8 : 1) * P.combatF;
          const tryMove = (mx, my) => { const nx = P.x + mx * sp, ny = P.y + my * sp; if (walkableAt(nx, ny)) { P.x = nx; P.y = ny; return true; } return false; };
          if (!tryMove(dx, dy)) { if (!tryMove(dx, 0)) tryMove(0, dy); }
          if (!P.swing && (time - mouseAimT > 0.6 || !matchMedia('(hover:hover)').matches)) P.dir = dirFromVec(dx, dy, P.dir); P.moving = true; P.walkT += dt * (sprinting() ? 1.5 : 1) * P.combatF; cam.follow = true;
        } else if (P.swing) P.moving = false;
        else if (P.task) updateTask(dt);
        else stepUnit(P, dt, (sprinting() ? 1.6 : 1) * P.combatF);
        if (rmbHeld) playerAttack(P.aim);
      }
      // face the mouse while fighting with a mouse
      if (time - mouseAimT < 0.6 && !P.moving) P.dir = dirFromVec(...worldFromScreenAng(P.aim), P.dir);
      if (P.moving) { P.stepT -= dt * (sprinting() ? 1.5 : 1); if (P.stepT <= 0) { P.stepT = 0.34; AU.footstep(surfaceAt(P.x, P.y), 0, sprinting() ? 1.3 : 1); } }
      if (sprinting() && P.moving) { P.stamina = Math.max(0, P.stamina - dt * 16); if (P.stamina <= 0) { P.exhausted = true; message('You are out of breath.'); } }
      // creatures
      spawnNight(dt);
      G.animalT -= dt; if (G.animalT <= 0) { G.animalT = 60; spawnWildlife(rng((Math.random() * 1e9) | 0), false); }
      for (const u of units) { if (u === P) continue; if (u.rise) { u.fade = Math.min(1, u.fade + dt * 0.8); if (u.fade >= 1) u.rise = false; } updateUnit(u, dt); }
      for (let a = 0; a < units.length; a++) { const u = units[a]; if (u === P || u.dead) continue; for (let b = a + 1; b < units.length; b++) { const v = units[b]; if (v === P || v.dead) continue; const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy); if (d < 0.35 && d > 0.001) { const push = (0.35 - d) * 0.5, nx = dx / d * push, ny = dy / d * push; if (walkableAt(u.x - nx, u.y - ny, true)) { u.x -= nx; u.y -= ny; } if (walkableAt(v.x + nx, v.y + ny, true)) { v.x += nx; v.y += ny; } } } }
      for (let k = units.length - 1; k >= 0; k--) if (units[k].remove) units.splice(k, 1);
      // projectiles
      for (const p of projectiles) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0.05, p.z + p.vz * dt); p.vz -= 0.9 * dt; p.life -= dt;
        const ti = clamp(Math.floor(p.x), 0, N - 1), tj = clamp(Math.floor(p.y), 0, N - 1);
        if (blocked[idx(ti, tj)] === 1 && p.z < 0.9) { p.life = 0; puff(p.x, p.y, '#8a6a45', 2); }
        if (p.enemy) { if (!P.dead && Math.hypot(P.x - p.x, P.y - p.y) < 0.4) { damagePlayer(p.dmg); p.life = 0; } continue; }
        for (const u of units) if (u !== P && !u.dead && Math.hypot(u.x - p.x, u.y - p.y) < 0.42) { hurtUnit(u, p.dmg * (p.kind === 'fire_arrow' && KINDS[u.kind].night ? 2 : 1), p.from); p.life = 0; AU.sfx('hit', panOf(u)); break; }
      }
      for (let k = projectiles.length - 1; k >= 0; k--) if (projectiles[k].life <= 0) projectiles.splice(k, 1);
      updateVision(false);
    } else if (P.dead) P.walkT += dt;
    for (const f of floats) f.t += dt; for (let k = floats.length - 1; k >= 0; k--) if (floats[k].t > 1.6) floats.splice(k, 1);
    for (const p of dust) p.t += dt; for (let k = dust.length - 1; k >= 0; k--) if (dust[k].t > dust[k].life) dust.splice(k, 1);
    if (cam.follow) { const [sx, sy] = toScreen(P.x, P.y); const k = 1 - Math.exp(-dt * 8); cam.x += (sx - cam.x) * k; cam.y += (sy - 20 - cam.y) * k; }
    {
      const z = zoom(), vl = cam.x - W / z / 2, vt = cam.y - H / z / 2, m = 2;
      for (let cy = Math.floor(vt / CH) - m; cy <= Math.floor((vt + H / z) / CH) + m; cy++) for (let cx = Math.floor(vl / CH) - m; cx <= Math.floor((vl + W / z) / CH) + m; cx++) { const key = cx + ',' + cy; if (!chunks.has(key) && !queued.has(key)) { queued.add(key); chunkQueue.push(key); } }
      const t0 = performance.now();
      while (chunkQueue.length && performance.now() - t0 < 8) { const key = chunkQueue.shift(); queued.delete(key); if (!chunks.has(key)) { const [cx, cy] = key.split(',').map(Number); chunks.set(key, renderChunk(cx, cy)); } }
    }
    for (const s of sparkles) s.t += dt; for (let i = sparkles.length - 1; i >= 0; i--) if (sparkles[i].t > sparkles[i].life) sparkles.splice(i, 1);
    if (sparkles.length < 50) for (let n = 0; n < 3; n++) { const z = zoom(), sx = cam.x + (Math.random() - 0.5) * W / z, sy = cam.y + (Math.random() - 0.5) * H / z; const x = sy / (2 * HHp) + sx / (2 * HWp), y = sy / (2 * HHp) - sx / (2 * HWp); const i = Math.floor(x), j = Math.floor(y); if (inMap(i, j) && isWater(type[idx(i, j)]) && visible[idx(i, j)] && waterDist[idx(i, j)] > 0.5) sparkles.push({ sx, sy, t: 0, life: 0.8 + Math.random() }); }
    if (marker) marker.t -= dt * 1.2;
    aimVis = Math.max(time - mouseAimT < 1.2 || aimDrag ? 1 : 0, aimVis - dt * 2);
    hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
    const low = P.hp < 30 && !P.dead ? 0.35 + 0.15 * Math.sin(time * 5) : 0;
    $('hurt').style.boxShadow = `inset 0 0 120px 40px rgba(180,0,0,${Math.max(hurtFlash * 0.6, low)})`;
    // soundscape
    let nearWater = 0; for (let a = -4; a <= 4; a += 2) for (let b = -4; b <= 4; b += 2) { const i = Math.floor(P.x) + a, j = Math.floor(P.y) + b; if (inMap(i, j) && isWater(type[idx(i, j)])) nearWater += 0.08; }
    const nf = lights.filter(L2 => L2.fire && !L2.torch).reduce((m, L2) => Math.max(m, 1 - dist(L2, P) / 6), 0);
    AU.ambience({ night: nightness(), wind: WX.wind, rain: WX.S.cur.rain, snow: WX.S.cur.snow, storm: WX.S.cur.storm, nearWater: Math.min(1, nearWater), nearFire: Math.max(0, nf), danger: P.fear || 0, paused: G.paused, dt });
    if (miniDirty || ((time * 4) | 0) !== lastMiniTick) { lastMiniTick = (time * 4) | 0; drawMini(); }
    uiTick(dt);
  }
  let lastMiniTick = 0;
  function survivalTick(dt) {
    const night = nightness(), wc = WX.S.cur;
    const sheltered = objects.some(o => !o.gone && (o.struct === 'cabin' || o.struct === 'lean_to') && dist(o, P) < 1.6);
    const nearFire = lights.reduce((m, L2) => L2.fire && !L2.torch ? Math.max(m, 1 - dist(L2, P) / L2.r) : m, 0);
    // comfort (once a second)
    P.comfortT = (P.comfortT || 0) - dt;
    if (P.comfortT <= 0) {
      P.comfortT = 1; let c = 0, floors = 0;
      for (const o of objects) { if (o.gone || !o.struct || Math.abs(o.x - P.x) > 5 || Math.abs(o.y - P.y) > 5 || dist(o, P) > 4.5) continue; const d = STRUCTS[o.struct]; if (!d) continue; if (o.struct === 'floor') floors++; else c += d.comfort || 0; }
      c += Math.min(2, floors * 0.25) + (nearFire > 0 ? 2 : 0) + (sheltered ? 1 : 0); P.comfort = Math.min(10, c);
      const hostile = units.some(u => !u.dead && !u.dissolve && KINDS[u.kind] && KINDS[u.kind].hostile && (KINDS[u.kind].night || u.aggroT > 0) && dist(u, P) < 7 && visible[idx(Math.floor(u.x), Math.floor(u.y))]);
      P.fear = hostile ? Math.min(1, (P.fear || 0) + 0.5) : Math.max(0, (P.fear || 0) - 0.15);
    }
    // wetness and warmth
    const inWater = isWater(type[idx(clamp(Math.floor(P.x), 0, N - 1), clamp(Math.floor(P.y), 0, N - 1))]);
    if (inWater) P.wet = Math.min(1, P.wet + dt / 3); else if (wc.rain > 0.1 && !sheltered) P.wet = Math.min(1, P.wet + dt * wc.rain / 25); else P.wet = Math.max(0, P.wet - dt * (nearFire > 0 ? 1 / 12 : 1 / 90));
    P.warmBuff = Math.max(0, (P.warmBuff || 0) - dt);
    let target = 74 - night * 34 - wc.rain * 10 - wc.snow * 28 - WX.wind * 9 - Math.max(0, hAt(P.x, P.y) - 3) * 3 - P.wet * 18 - WX.S.snowCover * 8;
    target += nearFire * 50 + (sheltered ? 22 : 0) + P.comfort * 1.5 + (P.armorHP > 0 ? 10 : 0) + (P.warmBuff > 0 ? 22 : 0) + (sprinting() && P.moving ? 6 : 0);
    target = clamp(target, 0, 100); P.warmth += (target - P.warmth) * Math.min(1, dt * 0.08);
    // needs
    P.hunger = Math.max(0, P.hunger - dt * 100 / 520 * (P.sick > 0 ? 1.6 : 1) * (P.warmth < 30 ? 1.3 : 1));
    P.thirst = Math.max(0, P.thirst - dt * 100 / 400 * (wc.rain > 0.3 ? 0.75 : 1) * (sprinting() && P.moving ? 1.6 : 1));
    if (P.sick > 0) P.sick = Math.max(0, P.sick - dt);
    if (P.bleed > 0) { P.bleed -= dt; damagePlayer(dt * 0.6, { silent: true }); if (Math.random() < dt * 2) puff(P.x, P.y, '#8a1a1a', 1); }
    P.bruise = Math.max(0, P.bruise - dt / 60);
    // stamina
    if (!(sprinting() && P.moving)) { let rg = 20; if (P.warmth < 30) rg *= 0.5; if (P.sick > 0) rg *= 0.5; if (P.hunger < 15) rg *= 0.6; P.stamina = Math.min(100, P.stamina + dt * (P.swing ? 0 : rg)); }
    if (P.exhausted && P.stamina > 25) P.exhausted = false;
    // health
    if (P.hunger <= 0) damagePlayer(dt * 0.9, { silent: true }); if (P.thirst <= 0) damagePlayer(dt * 1.2, { silent: true }); if (P.warmth < 12) damagePlayer(dt * 0.6, { silent: true });
    if (P.hunger > 45 && P.thirst > 45 && P.warmth > 30 && P.bleed <= 0 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + dt * (0.3 + (nearFire > 0 ? 0.35 : 0) + (P.comfort >= 5 ? 0.4 : 0)));
    for (const [k, cond, t] of [['hunger', P.hunger < 20, 'You are starving. Eat something.'], ['thirst', P.thirst < 20, 'You are parched. Find water.'], ['cold', P.warmth < 25, 'You are freezing. Get to a fire or shelter.']]) { if (cond && !P.warn[k]) { P.warn[k] = 1; message(t); } if (!cond) P.warn[k] = 0; }
    if (P.torchOn) { P.torchT -= dt * (1 + wc.rain * 0.6); if (P.torchT <= 0) { P.torchT = 0; P.torchOn = false; if (inv.torch) { toggleTorch(); message('You light a fresh torch.'); } else message('Your torch burns out.'); } }
  }
  function lightningStrike() {
    const near = Math.random() < 0.35;
    AU.sfx('thunder', rand(-0.6, 0.6), near);
    if (near && P) {
      const trees = objects.filter(o => !o.gone && TREE.test(o.asset) && dist(o, P) < 10 && dist(o, P) > 2.5);
      if (trees.length) { const t = pick(trees); tempLights.push({ x: t.x, y: t.y, t: 18 }); puff(t.x, t.y, '#ffd060', 14); setBlock(t, 0); t.asset = 'stump'; t.blocks = false; t.fp = [1, 1]; markDirty(t); message('Lightning strikes a tree nearby!'); }
    }
  }

  // ================================================================== UI
  const touch = matchMedia('(pointer: coarse)').matches; if (touch) document.body.classList.add('touch');
  const msgBox = $('msgs');
  function message(t) {
    if (!t) return; const d = document.createElement('div'); d.textContent = t; msgBox.appendChild(d);
    while (msgBox.children.length > 4) msgBox.removeChild(msgBox.firstChild);
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 700); }, 5000);
  }
  const iconImg = k => ICON[k] || '';
  const BARS = [['hp', 'Health', '#d8463a', 'heart'], ['hunger', 'Food', '#d9903a', 'meat_cooked'], ['thirst', 'Water', '#3f9ad8', 'waterskin'], ['stamina', 'Stamina', '#d8c44a', 'bolt'], ['warmth', 'Warmth', '#e0683a', 'torch'], ['armorHP', 'Armor', '#9a9aa8', 'armor']];
  function buildHud() {
    $('bars').innerHTML = BARS.map(([k, n, c, ic]) => `<div class="stat" id="st-${k}" title="${n}"><span class="si">${ic === 'heart' ? '<i class="heart"></i>' : ic === 'bolt' ? '<i class="bolt">⚡</i>' : `<img src="${iconImg(ic)}">`}</span><div class="bar"><i style="background:${c}"></i></div><b>0</b></div>`).join('');
    $('hotbar').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<button class="hs frame" data-slot="${n - 1}"><span class="hn">${n}</span><img alt=""><span class="hc"></span></button>`).join('');
    for (const [id, ic] of [['b-pack', 'cloth'], ['b-build', 'log'], ['b-torch', 'torch'], ['b-use', 'herb'], ['b-attack', 'axe'], ['b-dodge', 'hide'], ['b-sprint', 'meat_cooked']]) { const b = $(id); if (b) b.querySelector('img').src = iconImg(ic); }
  }
  function useSlot(n) { // hotbar keys 1-6 / taps: use whatever is in that slot
    const q = slots[n]; if (!q) return;
    if (!usable(q.id)) { message(`${ITEMS[q.id].name} can't be used directly.`); return; }
    takePref = n; useItem(q.id); takePref = -1;
  }
  function refreshUI() {
    if (!P) return;
    if (P.weapon !== 'fists' && !inv[P.weapon]) { P.weapon = 'fists'; P.asset = WEAPONS.fists.asset; }
    document.querySelectorAll('#hotbar .hs').forEach((b, n) => {
      const k = slots[n] && slots[n].id, img = b.querySelector('img'), c = b.querySelector('.hc');
      if (!k) { img.style.visibility = 'hidden'; c.textContent = ''; b.classList.remove('eq'); b.title = ''; return; }
      img.style.visibility = 'visible'; if (img.dataset.k !== k) { img.dataset.k = k; img.src = iconImg(k); }
      const it = ITEMS[k]; b.title = it.name; b.classList.toggle('eq', (it.weapon && P.weapon === it.weapon) || (k === 'torch' && P.torchOn));
      c.textContent = it.weapon === 'bow' ? (inv.arrow || 0) + (inv.fire_arrow || 0) : it.weapon === 'sling' ? (inv.stone || 0) : k === 'waterskin' ? P.water : slots[n].n > 1 ? slots[n].n : '';
    });
    const tb = $('b-torch'); if (tb) { tb.classList.toggle('on', P.torchOn); tb.querySelector('.n').textContent = (inv.torch || 0) + (P.torchOn ? '*' : ''); }
    const sb = $('b-sprint'); if (sb) sb.classList.toggle('on', sprintToggle);
    const ab = $('b-attack'); if (ab) { const im = ab.querySelector('img'), k = P.weapon === 'fists' ? 'stone' : P.weapon; if (im.dataset.k !== k) { im.dataset.k = k; im.src = iconImg(k); } }
    if (!$('pack').classList.contains('hidden')) renderPack();
    if (!$('storage').classList.contains('hidden')) renderStorage();
    if (!$('build').classList.contains('hidden')) renderBuild();
  }
  let faceT = 0;
  const faceCv = $('face');
  function uiTick(dt) {
    if (!P) return;
    if ((hoverT -= dt) < 0) { hoverT = 0.2; if (!touch) refreshHover(); }
    for (const [k] of BARS) {
      const el = $('st-' + k); if (k === 'armorHP') { el.style.display = P.armorHP > 0 ? 'flex' : 'none'; if (!(P.armorHP > 0)) continue; }
      const v = k === 'hp' ? P.hp / P.maxHp * 100 : k === 'armorHP' ? P.armorHP / 220 * 100 : P[k];
      el.querySelector('i:not(.heart):not(.bolt)').style.width = clamp(v, 0, 100) + '%'; el.querySelector('b').textContent = Math.round(k === 'hp' ? P.hp : k === 'armorHP' ? P.armorHP : v); el.classList.toggle('low', v < 20);
    }
    $('day').textContent = G.day; $('time').textContent = clockStr(); $('wx').textContent = WX.S.label; $('relics').textContent = `${inv.relic || 0}/8`;
    drawClock();
    // status badges
    const B = [];
    if (P.bleed > 0) B.push(['Bleeding', 'bad']); if (P.warmth < 12) B.push(['Freezing', 'bad']); else if (P.warmth < 30) B.push(['Cold', 'warn']);
    if (P.wet > 0.4) B.push(['Wet', 'warn']); if (P.sick > 0) B.push(['Sick', 'bad']); if (P.hunger < 20) B.push(['Starving', 'bad']); if (P.thirst < 20) B.push(['Parched', 'bad']);
    if (P.exhausted) B.push(['Exhausted', 'warn']); if (P.fear > 0.5) B.push(['Scared', 'warn']); if (P.comfort >= 5) B.push(['Comfortable', 'good']); if (P.warmBuff > 0) B.push(['Warm meal', 'good']);
    const bh = B.map(([t, c]) => `<span class="${c}">${t}</span>`).join(''); if (bh !== $('badges').dataset.h) { $('badges').dataset.h = bh; $('badges').innerHTML = bh; }
    // portrait
    faceT -= dt;
    if (faceT <= 0) { // the face is animated: redraw ~20 times a second
      faceT = 0.05;
      const hpf = P.hp / P.maxHp, hurtRecent = time - P.lastHurt < 1.1, exert = sprinting() && P.moving;
      const expr = P.dead ? 'dead' : hurtRecent ? 'hurt' : hpf < 0.25 ? 'weak' : P.fear > 0.6 ? 'scared' : P.warmth < 25 ? 'cold' : P.sick > 0 ? 'sick' : P.thirst < 25 ? 'thirsty' : P.hunger < 25 ? 'hungry' : P.exhausted || P.stamina < 12 ? 'tired' : exert ? 'exert' : P.fear > 0.2 || (time - (P.fightT || -9) < 2.5) ? 'angry' : P.comfort >= 5 && P.hunger > 50 && P.thirst > 50 ? 'content' : 'neutral';
      PORTRAIT.draw(faceCv, null, { expr, dead: P.dead, hurtAt: P.lastHurt, blood: clamp((1 - hpf) * 1.15 - 0.1, 0, 1), bleeding: P.bleed > 0, bruise: P.bruise, cold: clamp((40 - P.warmth) / 35, 0, 1), wet: P.wet, sick: P.sick > 0 ? 0.8 : 0, pale: clamp((0.4 - hpf) * 2, 0, 1), sweat: exert ? 0.8 : P.warmth > 85 ? 0.4 : expr === 'scared' || expr === 'sick' ? 0.5 : 0, dirt: clamp(G.day * 0.05, 0, 0.5), tired: P.stamina < 25 || nightness() > 0.8 ? 0.6 : 0, exert, flash: hurtFlash, time });
    }
    // context prompt & tooltip
    let label = '';
    if (!P.dead && !placing) { if (P.task) label = P.task.act.label + '…'; else { const t = nearestInteractable(); if (t) label = t.water ? 'Drink water' : (actionsFor(t).find(a => !a.disabled) || {}).label || ''; } }
    if (label !== lastPrompt) { lastPrompt = label; $('prompt').textContent = label ? (touch ? '' : '[E] ') + label : ''; const ub = $('b-use'); if (ub) ub.querySelector('.lbl').textContent = label ? label.replace(/\(.*\)/, '').slice(0, 18) : 'Use'; }
  }
  let lastPrompt = null;
  const clockX = $('clock').getContext('2d');
  function drawClock() {
    const x = clockX, r = 24; x.clearRect(0, 0, 52, 52);
    x.fillStyle = '#0d1424'; x.beginPath(); x.arc(26, 26, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5a8ac0'; x.beginPath(); x.moveTo(26, 26); x.arc(26, 26, r, -Math.PI / 2, -Math.PI / 2 + 0.62 * Math.PI * 2); x.closePath(); x.fill();
    x.fillStyle = '#c87a3a'; x.beginPath(); x.moveTo(26, 26); x.arc(26, 26, r, -Math.PI / 2 + 0.62 * Math.PI * 2, -Math.PI / 2 + 0.72 * Math.PI * 2); x.closePath(); x.fill();
    const a = -Math.PI / 2 + G.tod * Math.PI * 2; x.strokeStyle = '#ffd36a'; x.lineWidth = 3; x.beginPath(); x.moveTo(26, 26); x.lineTo(26 + Math.cos(a) * 20, 26 + Math.sin(a) * 20); x.stroke();
    x.strokeStyle = '#b08a3e'; x.lineWidth = 2; x.beginPath(); x.arc(26, 26, r, 0, Math.PI * 2); x.stroke();
  }
  function costHTML(cost) { return '<div class="cost">' + Object.entries(cost).map(([k, n]) => `<span class="${(inv[k] || 0) >= n ? '' : 'no'}"><img src="${iconImg(k)}">${inv[k] || 0}/${n}</span>`).join('') + '</div>'; }
  function renderPack() {
    renderSlots('pk-pack', slots, 'inv', HOT, NSLOT); renderSlots('pk-hot', slots, 'inv', 0, HOT); renderDetail('pk-detail');
    const bench = nearBench();
    $('recipes').innerHTML = RECIPES.map((r, i) => `<div class="rec${r.bench && !bench ? ' locked' : ''}"><img class="o" src="${iconImg(r.out)}"><div class="t"><b>${ITEMS[r.out].name}${r.n > 1 ? ' ×' + r.n : ''}</b>${r.bench ? ' <em>workbench</em>' : ''}<div style="opacity:.75;font-size:12px">${r.desc}</div>${costHTML(r.cost)}</div><button class="frame" data-craft="${i}" ${have(r.cost) && (!r.bench || bench) ? '' : 'disabled'}>Craft</button></div>`).join('');
  }
  const thumbCache = {};
  function thumb(asset) {
    if (thumbCache[asset]) return thumbCache[asset];
    const a = SPR[asset], c = document.createElement('canvas'), sc = Math.min(1, 120 / a.w, 90 / a.h); c.width = Math.round(a.w * sc); c.height = Math.round(a.h * sc);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(a.img, 0, 0, a.w, a.h, 0, 0, c.width, c.height); return thumbCache[asset] = c.toDataURL();
  }
  let buildCat = 'shelter';
  function renderBuild() {
    $('btabs').innerHTML = BUILD_CATS.map(([k, n]) => `<button class="frame${k === buildCat ? ' on' : ''}" data-bcat="${k}">${n}</button>`).join('');
    const bench = nearBench();
    $('blist').innerHTML = Object.entries(STRUCTS).filter(([, d]) => d.cat === buildCat).map(([k, d]) => `<div class="rec${d.bench && !bench ? ' locked' : ''}"><img class="bthumb" src="${thumb(d.asset)}"><div class="t"><b>${d.name}</b>${d.bench ? ' <em>workbench</em>' : ''}<div style="opacity:.75;font-size:12px">${d.desc}</div>${costHTML(d.cost)}</div><button class="frame" data-build="${k}" ${have(d.cost) && (!d.bench || bench) ? '' : 'disabled'}>Build</button></div>`).join('');
  }
  // ---------------------------------------------------------------- slot grids (pack & containers)
  let storageObj = null, splitMode = false, quickMode = false;
  const boxArr = () => storageObj ? storageObj.store || storageObj.drop : null;
  function slotHTML(arr, i, area) {
    const q = arr[i], it = q && ITEMS[q.id], eq = q && ((it.weapon && P.weapon === it.weapon) || (q.id === 'torch' && P.torchOn));
    return `<div class="islot${eq ? ' eq' : ''}" data-a="${area}" data-i="${i}" title="${q ? it.name : ''}">${q ? `<img src="${iconImg(q.id)}" alt=""><span class="c">${q.n > 1 ? q.n : ''}</span>` : ''}${area === 'inv' && i < HOT ? `<span class="hn">${i + 1}</span>` : ''}</div>`;
  }
  function renderSlots(id, arr, area, a, b) { const el = $(id); if (el && arr) el.innerHTML = range(a, b).map(i => slotHTML(arr, i, area)).join(''); }
  function describe(k) {
    const it = ITEMS[k], e = it.eat, bits = [];
    if (it.weapon) { const w = WEAPONS[it.weapon]; bits.push(w.ranged ? `ranged, ${w.dmg} damage` : `${w.dmg} damage, reach ${w.reach}`); }
    if (e) { if (e.hunger) bits.push(`food ${e.hunger > 0 ? '+' : ''}${e.hunger}`); if (e.thirst) bits.push(`water ${e.thirst > 0 ? '+' : ''}${e.thirst}`); if (e.hp) bits.push(`health ${e.hp > 0 ? '+' : ''}${e.hp}`); if (e.bleed) bits.push('stops bleeding'); if (e.sick < 0) bits.push('eases sickness'); if (e.warm) bits.push('warms you'); }
    return bits.join(' · ') + (it.note ? (bits.length ? ' · ' : '') + it.note : '');
  }
  function renderDetail(id) {
    const el = $(id); if (!el) return; const arr = focus && (focus.area === 'box' ? boxArr() : slots), q = held || (arr && arr[focus.i]);
    const help = touch ? 'Tap to pick up and place. Turn on Split to take half or drop one; Quick sends a stack across.' : 'Click: pick up / place · Right-click: take half / drop one · Shift-click: quick move · 1-6: swap with hotbar · E: use · Q: drop';
    if (!q) { el.innerHTML = `<div class="dt"><div class="hint">${help}</div></div>`; return; }
    const it = ITEMS[q.id], verb = it.weapon ? (P.weapon === it.weapon ? 'Unequip' : 'Equip') : it.verb;
    el.innerHTML = `<img src="${iconImg(q.id)}" alt=""><div class="dt"><b>${it.name}</b> ×${q.n} <span class="hint">(stacks to ${stackOf(q.id)})</span><div class="hint">${describe(q.id) || 'Material'}</div></div>${usable(q.id) && verb ? `<button class="frame" data-iact="use">${verb}</button>` : ''}<button class="frame" data-iact="drop">Drop</button>`;
  }
  function invChanged() {
    if (held && held.n <= 0) held = null;
    if (storageObj) markDirty(storageObj);
    refreshUI(); updateHeld();
  }
  function clickSlot(area, i, right, shift) {
    const arr = area === 'box' ? boxArr() : slots; if (!arr) return; const q = arr[i];
    if (shift && !held && q) return quickMove(area, i);
    if (right) {
      if (!held && q) { const h = Math.ceil(q.n / 2); held = { id: q.id, n: h }; heldFrom = { area, i }; q.n -= h; if (!q.n) arr[i] = null; }
      else if (held && !q) { arr[i] = { id: held.id, n: 1 }; held.n--; }
      else if (held && q.id === held.id && q.n < stackOf(q.id)) { q.n++; held.n--; }
      else if (held) { arr[i] = held; held = q; }
    } else {
      if (!held) { if (q) { held = q; heldFrom = { area, i }; arr[i] = null; } }
      else if (!q) { arr[i] = held; held = null; }
      else if (q.id === held.id) { const a = Math.min(stackOf(q.id) - q.n, held.n); q.n += a; held.n -= a; }
      else { arr[i] = held; held = q; }
    }
    AU.sfx('rustle', 0, 0.4); invChanged();
  }
  function quickMove(area, i) {
    const arr = area === 'box' ? boxArr() : slots, q = arr[i]; if (!q) return; const box = boxArr();
    let to, ord;
    if (area === 'box') { to = slots; ord = usable(q.id) ? ORD_HOT : ORD_PACK; }
    else if (box) { to = box; ord = range(0, box.length); }
    else { to = slots; ord = i < HOT ? range(HOT, NSLOT) : range(0, HOT); }
    const a = putInto(to, q.id, q.n, ord.filter(j => !(to === arr && j === i))); q.n -= a; if (!q.n) arr[i] = null;
    AU.sfx('loot', 0, 0.5); invChanged();
  }
  function swapHot(n) { // hover a slot and press 1-6: swap it with that hotbar slot (like Minecraft)
    if (!focus) return; const arr = focus.area === 'box' ? boxArr() : slots; if (!arr || (arr === slots && focus.i === n)) return;
    const t = arr[focus.i]; arr[focus.i] = slots[n]; slots[n] = t; invChanged();
  }
  function returnHeld() { // closing a screen puts the held stack back
    if (!held) return; const from = heldFrom && (heldFrom.area === 'box' ? boxArr() : slots);
    if (from && !from[heldFrom.i]) { from[heldFrom.i] = held; held = null; }
    else { const a = putInto(slots, held.id, held.n, usable(held.id) ? ORD_HOT : ORD_PACK); held.n -= a; if (held.n > 0) dropItems(held.id, held.n); held = null; }
    invChanged();
  }
  function itemAction(act) {
    const arr = focus && (focus.area === 'box' ? boxArr() : slots), q = held || (arr && arr[focus.i]); if (!q) return;
    if (act === 'drop') { if (held) { dropItems(held.id, held.n); held = null; } else { dropItems(q.id, q.n); arr[focus.i] = null; } message('Dropped.'); invChanged(); return; }
    if (act === 'use') { const k = q.id; if (held) returnHeld(); if (focus && focus.area === 'inv' && slots[focus.i] && slots[focus.i].id === k) takePref = focus.i; if (!inv[k]) { message('Move it into your pack first.'); return; } useItem(k); takePref = -1; invChanged(); }
  }
  const heldEl = document.createElement('div'); heldEl.id = 'held'; heldEl.className = 'hidden'; document.body.appendChild(heldEl);
  let ptrX = 0, ptrY = 0;
  function updateHeld() {
    if (!held) { heldEl.classList.add('hidden'); return; }
    heldEl.classList.remove('hidden'); if (heldEl.dataset.k !== held.id) { heldEl.dataset.k = held.id; heldEl.innerHTML = `<img src="${iconImg(held.id)}" alt=""><span class="c"></span>`; }
    heldEl.querySelector('.c').textContent = held.n > 1 ? held.n : ''; heldEl.style.left = ptrX + 'px'; heldEl.style.top = ptrY + 'px';
  }
  addEventListener('pointermove', e => { ptrX = e.clientX; ptrY = e.clientY; if (held) updateHeld(); }, { passive: true });
  let dragStart = null;
  for (const id of ['pack', 'storage']) {
    const m = $(id);
    m.addEventListener('contextmenu', e => { if (e.target.closest('.islot')) e.preventDefault(); });
    m.addEventListener('pointerdown', e => {
      const el = e.target.closest('.islot'); if (!el) return; e.preventDefault(); ptrX = e.clientX; ptrY = e.clientY;
      const hadHeld = !!held; clickSlot(el.dataset.a, +el.dataset.i, e.button === 2 || splitMode, e.shiftKey || quickMode);
      dragStart = !hadHeld && held && e.button === 0 ? { a: el.dataset.a, i: +el.dataset.i } : null; // press-drag-release also works
    });
    m.addEventListener('pointerup', e => {
      if (!dragStart || !held) { dragStart = null; return; }
      const t = document.elementFromPoint(e.clientX, e.clientY), el = t && t.closest('.islot');
      if (el && !(el.dataset.a === dragStart.a && +el.dataset.i === dragStart.i)) clickSlot(el.dataset.a, +el.dataset.i, false, false);
      dragStart = null;
    });
    m.addEventListener('pointerover', e => { const el = e.target.closest('.islot'); if (el) { focus = { area: el.dataset.a, i: +el.dataset.i }; renderDetail(id === 'pack' ? 'pk-detail' : 'st-detail'); } });
    m.addEventListener('click', e => { const b = e.target.closest('[data-iact]'); if (b) itemAction(b.dataset.iact); const t = e.target.closest('[data-mode]'); if (t) { if (t.dataset.mode === 'split') { splitMode = !splitMode; quickMode = false; } else { quickMode = !quickMode; splitMode = false; } document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x.dataset.mode === 'split' ? splitMode : quickMode)); } });
  }
  function openStorage(o) { storageObj = o; focus = null; $('st-title').textContent = o.drop ? 'Dropped items' : STRUCTS[o.struct].name; renderStorage(); show('storage'); }
  function renderStorage() {
    const box = boxArr(); if (!box) return;
    renderSlots('st-box', box, 'box', 0, box.length); renderSlots('st-pack', slots, 'inv', HOT, NSLOT); renderSlots('st-hot', slots, 'inv', 0, HOT); renderDetail('st-detail');
  }
  $('st-sort').onclick = () => { // tidy: merge and sort the container's stacks
    const box = boxArr(); const all = {}; for (const q of box) if (q) all[q.id] = (all[q.id] || 0) + q.n; box.fill(null);
    for (const k of Object.keys(ITEMS)) if (all[k]) putInto(box, k, all[k], range(0, box.length)); invChanged();
  };
  $('recipes').addEventListener('click', e => { const b = e.target.closest('[data-craft]'); if (b) { craft(RECIPES[+b.dataset.craft]); renderPack(); } });
  $('blist').addEventListener('click', e => { const b = e.target.closest('[data-build]'); if (b) startPlacing(b.dataset.build); });
  $('btabs').addEventListener('click', e => { const b = e.target.closest('[data-bcat]'); if (b) { buildCat = b.dataset.bcat; renderBuild(); } });
  $('hotbar').addEventListener('click', e => { const b = e.target.closest('[data-slot]'); if (b) { AU.init(); useSlot(+b.dataset.slot); } });
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $('tab-inv').classList.toggle('hidden', b.dataset.tab !== 'inv'); $('tab-craft').classList.toggle('hidden', b.dataset.tab !== 'craft'); });
  const MODALS = ['pack', 'build', 'storage', 'menu', 'help'];
  function show(id) { $(id).classList.remove('hidden'); updatePause(); }
  function leaveSlots() { // closing the pack or a container returns the held stack; empty dropped sacks vanish
    returnHeld(); focus = null; splitMode = quickMode = false; document.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('on'));
    if (storageObj && storageObj.drop && !storageObj.drop.some(Boolean)) storageObj.gone = true;
    if ($('storage').classList.contains('hidden')) storageObj = null;
  }
  function hide(id) { $(id).classList.add('hidden'); if (id === 'pack' || id === 'storage') leaveSlots(); updatePause(); }
  function closeModals() { MODALS.forEach(m => $(m).classList.add('hidden')); leaveSlots(); closeMenu(); updatePause(); }
  function anyModal() { return MODALS.some(m => !$(m).classList.contains('hidden')) || ['title', 'dead', 'win'].some(m => !$(m).classList.contains('hidden')); }
  function updatePause() { G.paused = anyModal() || !!G.sleeping; }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { const m = b.closest('.modal'); if (m) hide(m.id); }));
  function openPack(tab) { if (tab) document.querySelector(`.tabs button[data-tab="${tab}"]`).click(); renderPack(); show('pack'); }
  // context menu
  function openMenuFor(o, x, y) {
    const acts = actionsFor(o); if (!acts.length) return; const m = $('ctxmenu');
    m.innerHTML = `<div class="ct">${nameOf(o)}</div>` + acts.map((a, n) => `<button class="frame" data-act="${n}" ${a.disabled ? 'disabled' : ''}>${a.label}</button>`).join('');
    m.classList.remove('hidden'); const r = m.getBoundingClientRect(); m.style.left = clamp(x - r.width / 2, 6, innerWidth - r.width - 6) + 'px'; m.style.top = clamp(y - r.height, 6, innerHeight - r.height - 6) + 'px';
    m.onclick = e => { const b = e.target.closest('[data-act]'); if (!b) return; setTask(o, acts[+b.dataset.act]); marker = { x: o.x, y: o.y, t: 1 }; cam.follow = true; closeMenu(); };
  }
  function closeMenu() { $('ctxmenu').classList.add('hidden'); }
  $('b-pack').onclick = () => openPack(); $('b-build').onclick = () => { renderBuild(); show('build'); };
  $('b-torch').onclick = () => toggleTorch();
  $('b-use').onclick = () => { AU.init(); interactNearest(); };
  $('b-dodge').onclick = () => dodge();
  $('b-sprint').onclick = () => { sprintToggle = !sprintToggle; refreshUI(); };
  $('btn-menu').onclick = () => show('menu'); $('m-help').onclick = () => { hide('menu'); show('help'); }; $('t-help').onclick = () => show('help');
  $('m-save').onclick = () => { if (hostilesNear(8)) { message("You can't save with enemies nearby."); return; } message(saveGame() ? 'Game saved.' : 'Saving is not available in this browser.'); hide('menu'); };
  $('m-sound').onclick = () => { AU.on = !AU.on; $('m-sound').textContent = 'Sound: ' + (AU.on ? 'on' : 'off'); };
  $('m-detail').onclick = () => { lowDetail = !lowDetail; $('m-detail').textContent = 'Detail: ' + (lowDetail ? 'low' : 'high'); };
  $('m-quit').onclick = () => { closeModals(); titleScreen(); };
  $('place-cancel').onclick = () => stopPlacing();
  $('zin').onclick = () => setZoom(zi + 1); $('zout').onclick = () => setZoom(zi - 1); $('center').onclick = () => { cam.follow = true; };

  // minimap (diamond in a round frame)
  const miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = N; const miniBX = miniBase.getContext('2d'); let miniImg = miniBX.createImageData(N, N), miniDirty = true;
  const MINI_COL = { deep: '#1f4f78', shallow: '#3f8ea0', sand: '#d2bb84', grass: '#6b8a3a', grassLush: '#4f7a2e', dryGrass: '#a39352', dirt: '#8a6a45', road: '#b0946a', forestFloor: '#2f4a22', rock: '#8a857a', snow: '#e8eef2' };
  const MC = TT.map(t => PAL.hex(MINI_COL[t.id]));
  function miniPaint(i, j) { const k = idx(i, j), c = MC[type[k]], o = (i * N + j) * 4, sh = isWater(type[k]) ? 1 : 0.8 + lvl[k] * 0.05; miniImg.data[o] = c[0] * sh; miniImg.data[o + 1] = c[1] * sh; miniImg.data[o + 2] = c[2] * sh; miniImg.data[o + 3] = 255; }
  function drawMini() {
    miniDirty = false; miniBX.putImageData(miniImg, 0, 0);
    const m = $('mini'), x = m.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#0b1622'; x.fillRect(0, 0, m.width, m.height);
    const sc = m.width / (2 * N) * 0.98; x.setTransform(sc, sc / 2, -sc, sc / 2, m.width / 2, m.height / 2 - sc * N / 2); x.imageSmoothingEnabled = false;
    x.fillStyle = '#132a3c'; x.fillRect(0, 0, N, N);
    x.save(); x.transform(0, 1, 1, 0, 0, 0); x.drawImage(miniBase, 0, 0); x.restore();
    if (nightness() > 0.3) { x.fillStyle = `rgba(6,10,26,${nightness() * 0.45})`; x.fillRect(0, 0, N, N); }
    for (const o of objects) { if (o.gone || !explored[idx(Math.floor(o.x), Math.floor(o.y))]) continue; if (o.relic) { x.fillStyle = '#ffd36a'; x.fillRect(o.x - 1, o.y - 1, 2, 2); } else if (o.struct && !o.world) { x.fillStyle = '#ff9a40'; x.fillRect(o.x - 0.7, o.y - 0.7, 1.4, 1.4); } else if (SPR[o.asset] && SPR[o.asset].category === 'building') { x.fillStyle = '#c8b090'; x.fillRect(o.x - 0.6, o.y - 0.6, 1.2, 1.2); } }
    for (const u of units) if (!u.dead && u !== P && visible[idx(Math.floor(u.x), Math.floor(u.y))] && KINDS[u.kind] && KINDS[u.kind].hostile) { x.fillStyle = '#ff4030'; x.fillRect(u.x - 0.8, u.y - 0.8, 1.6, 1.6); }
    x.fillStyle = Math.floor(time * 3) % 2 ? '#fff' : '#5fa0ff'; x.fillRect(P.x - 1.2, P.y - 1.2, 2.4, 2.4);
  }
  $('mini').addEventListener('pointerdown', e => {
    const m = e.currentTarget, r = m.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * m.width, py = (e.clientY - r.top) / r.height * m.height;
    const sc = m.width / (2 * N) * 0.98, X = (px - m.width / 2) / sc, Y = (py - (m.height / 2 - sc * N / 2)) / (sc / 2);
    const i = (Y + X) / 2, j = (Y - X) / 2; if (!inMap(Math.floor(i), Math.floor(j))) return;
    const [sx, sy] = toScreen(i, j); cam.x = sx; cam.y = sy; cam.follow = false; e.stopPropagation();
  });

  // ================================================================== input
  function setZoom(n) { zi = clamp(n, 0, ZOOMS.length - 1); }
  function assistAim() {
    const w = WEAPONS[P.weapon]; let best = null, bd = 1e9;
    for (const u of units) { if (u === P || u.dead || u.dissolve || !visible[idx(Math.floor(u.x), Math.floor(u.y))]) continue; const d = dist(u, P); if (d < bd && d <= (w.ranged ? w.reach : w.reach + 2.5)) { bd = d; best = u; } }
    return best ? screenAng(best.x - P.x, best.y - P.y) : DIR_ANG[DIRS[P.dir]];
  }
  function attackKey() { AU.init(); if (P.dead) return; const aim = !touch && time - mouseAimT < 3 ? P.aim : assistAim(); playerAttack(aim); }
  let lastMouse = null, hoverT = 0;
  // hover is re-picked as the world moves under a still cursor, and hidden over the HUD or when the cursor leaves
  function refreshHover() {
    const tt = $('tooltip');
    hoverObj = placing || !lastMouse || anyModal() || P.dead ? null : pickAt(lastMouse[0] * dpr, lastMouse[1] * dpr);
    if (hoverObj && (hoverObj.dead && !actionsFor(hoverObj).length)) hoverObj = null;
    if (!hoverObj) { tt.classList.add('hidden'); return; }
    const acts = actionsFor(hoverObj).filter(a => !a.disabled);
    tt.innerHTML = `<b>${nameOf(hoverObj)}</b>${acts.length ? `<br>${acts.length > 1 ? 'Click for options' : 'Click: ' + acts[0].label}` : ''}`;
    tt.style.left = (lastMouse[0] + 16) + 'px'; tt.style.top = (lastMouse[1] + 12) + 'px'; tt.classList.remove('hidden');
  }
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { lastMouse = null; refreshHover(); } });
  function updateMouseAim(cx, cy) { const [sx, sy] = toScreen(P.x, P.y), px = (sx * view.z + view.ox) / dpr, py = (sy * view.z + view.oy) / dpr - 20; P.aim = Math.atan2((cy - py) * 1, cx - px); mouseAimT = time; }
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); AU.init();
    if (e.target.tagName === 'INPUT') return;
    if (k === 'escape') { if (!$('ctxmenu').classList.contains('hidden')) closeMenu(); else if (placing) stopPlacing(); else if (anyModal() && $('title').classList.contains('hidden') && $('dead').classList.contains('hidden') && $('win').classList.contains('hidden')) closeModals(); else if (G.started && !P.dead) show('menu'); return; }
    if (!G.started || P.dead) return;
    if (k === 'tab' || k === 'i') { e.preventDefault(); if ($('pack').classList.contains('hidden')) openPack(); else hide('pack'); return; }
    if (k === 'b') { if ($('build').classList.contains('hidden')) { renderBuild(); show('build'); } else hide('build'); return; }
    const slotsOpen = !$('pack').classList.contains('hidden') && !$('tab-inv').classList.contains('hidden') || !$('storage').classList.contains('hidden');
    if (slotsOpen) { if (k >= '1' && k <= '6') swapHot(+k - 1); else if (k === 'e') itemAction('use'); else if (k === 'q') itemAction('drop'); return; }
    if (anyModal()) return;
    keys.add(k); if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    if (k === '+' || k === '=') setZoom(zi + 1); if (k === '-') setZoom(zi - 1);
    if (k === 'e') interactNearest(); if (k === 'f') attackKey(); if (k === ' ') dodge(); if (k === 'q') cycleWeapon(); if (k === 't') toggleTorch(); if (k === 'c') cam.follow = true;
    if (k >= '1' && k <= '6') useSlot(+k - 1);
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); rmbHeld = false; });
  let wheelAcc = 0;
  cv.addEventListener('wheel', e => { e.preventDefault(); wheelAcc += e.deltaY; if (Math.abs(wheelAcc) > 80) { setZoom(zi + (wheelAcc < 0 ? 1 : -1)); wheelAcc = 0; } }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  const ptrs = new Map(); let pinch = null, dragged = false;
  cv.addEventListener('pointerdown', e => {
    AU.init(); closeMenu();
    if (e.pointerType === 'mouse' && e.button === 2) { if (G.started && !P.dead) { updateMouseAim(e.clientX, e.clientY); rmbHeld = true; playerAttack(P.aim); } return; }
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); dragged = false;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zi }; }
  });
  addEventListener('pointerup', e => { if (e.button === 2) rmbHeld = false; });
  cv.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && G.started && P) {
      lastMouse = [e.clientX, e.clientY];
      if (rmbHeld || WEAPONS[P.weapon].ranged || units.some(u => !u.dead && u !== P && KINDS[u.kind] && KINDS[u.kind].hostile && dist(u, P) < 6)) updateMouseAim(e.clientX, e.clientY);
      const w = screenToGround(e.clientX * dpr, e.clientY * dpr);
      if (placing && w) { const g = snapPlace(placing.type, w[0], w[1]); const [sx, sy] = toScreen(g.x, g.y); ghost = Object.assign(g, { sx, sy }); }
      refreshHover();
    }
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; const r = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; setZoom(pinch.z + Math.round(Math.log2(r) * 1.5)); dragged = true; return; }
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 12) { dragged = true; cam.follow = false; cam.x -= dx * dpr / zoom(); cam.y -= dy * dpr / zoom(); }
  });
  const endPtr = e => { const p = ptrs.get(e.pointerId); if (!p) return; if (!dragged && e.type === 'pointerup' && ptrs.size === 1) tap(p.x * dpr, p.y * dpr, p.x, p.y); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  function screenToGround(px, py) {
    const z = zoom(), ax = (px - view.ox) / z, ay = (py - view.oy) / z, c = ax / HWp;
    for (let s = (ay + MAXLV * ZPX) / HHp + 1; s > ay / HHp - 1; s -= 1 / 64) { const x = (s + c) / 2, y = (s - c) / 2; if (x < 0 || y < 0 || x >= N || y >= N) continue; const sy = s * HHp - hAt(x, y) * ZPX; if (sy <= ay) return [x, y]; }
    return null;
  }
  // pixel-accurate picking: test the sprite's own alpha mask, front-most first
  function pickAt(px, py) {
    const z = zoom(), ax = (px - view.ox) / z, ay = (py - view.oy) / z, tol = touch ? 6 : 2;
    const cands = [];
    for (const u of units) {
      if (u === P) continue; const i = Math.floor(u.x), j = Math.floor(u.y); if (!inMap(i, j) || !visible[idx(i, j)] || !actionsFor(u).length) continue;
      const [sx, sy] = toScreen(u.x, u.y), big = u.kind === 'bear' || u.kind === 'brute', hw = (big ? 26 : 16) + tol, top = (big ? 84 : u.kind === 'crawler' || u.kind === 'spider' ? 34 : 60) + tol;
      if (ax > sx - hw && ax < sx + hw && ay > sy - top && ay < sy + 8 + tol) cands.push([u.x + u.y + 1, u]);
    }
    for (const o of objects) {
      if (o.gone) continue; const i = Math.floor(o.x), j = Math.floor(o.y); if (!inMap(i, j) || !explored[idx(i, j)]) continue;
      const [sx, sy] = toScreen(o.x, o.y), a = SPR[o.asset]; if (!a) continue;
      const lx = Math.round(ax - sx + a.ax), ly = Math.round(ay - sy + a.ay); if (lx < -tol || ly < -tol || lx >= a.w + tol || ly >= a.h + tol) continue;
      if (!actionsFor(o).length) continue;
      const def = o.struct ? STRUCTS[o.struct] : null, mk = maskOf(def && def.wall ? `wall_${def.wall}_post` : o.struct === 'gate' ? 'gate_' + (o.orient || 'i') : o.asset); let hit = false;
      const t = o.decor ? 0 : tol;
      for (let dy = -t; dy <= t && !hit; dy++) for (let dx = -t; dx <= t && !hit; dx++) { const qx = lx + dx, qy = ly + dy; if (qx >= 0 && qy >= 0 && qx < mk.w && qy < mk.h && mk.m[qy * mk.w + qx]) hit = true; }
      if (!hit && def && def.flat) { const g = screenToGround(px, py); hit = g && Math.floor(g[0]) === i && Math.floor(g[1]) === j; }
      if (hit) cands.push([o.x + o.y + (o.decor ? -2 : 0) - (def && def.flat ? 1.5 : 0), o]);
    }
    if (!cands.length) return null; cands.sort((a, b) => b[0] - a[0]); return cands[0][1];
  }
  function tap(px, py, cssX, cssY) {
    if (!G.started || P.dead || G.paused) return;
    const w = screenToGround(px, py);
    if (placing) { if (w) placeAt(w[0], w[1]); return; }
    const o = pickAt(px, py);
    if (o) {
      const acts = actionsFor(o), live = acts.filter(a => !a.disabled);
      if (acts.length > 1 || (acts.length === 1 && acts[0].disabled)) openMenuFor(o, cssX, cssY - 10);
      else if (live.length) { setTask(o, live[0]); marker = { x: o.x, y: o.y, t: 1 }; cam.follow = true; }
      return;
    }
    if (!w || !explored[idx(Math.floor(w[0]), Math.floor(w[1]))]) return;
    let [tx, ty] = w;
    if (isWater(type[idx(Math.floor(tx), Math.floor(ty))]) && Math.hypot(tx - P.x, ty - P.y) < 2.2) { drinkWater(); return; }
    if (!walkableAt(tx, ty)) { let best = null, bd = 9; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const x = Math.floor(tx) + a + 0.5, y = Math.floor(ty) + b + 0.5; if (walkableAt(x, y)) { const d = Math.hypot(x - P.x, y - P.y); if (d < bd) { bd = d; best = [x, y]; } } } if (!best) return; [tx, ty] = best; }
    P.task = null; const p = findPath(P, tx, ty, 8000); if (p) { P.path = p; marker = { x: tx, y: ty, t: 1 }; cam.follow = true; }
  }
  // touch: virtual joystick + drag-to-aim attack button
  const joy = { active: false, dx: 0, dy: 0, id: null };
  const jb = $('joy'), jk = $('joyk');
  jb.addEventListener('pointerdown', e => { AU.init(); joy.active = true; joy.id = e.pointerId; jb.setPointerCapture(e.pointerId); moveJoy(e); });
  jb.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.id) moveJoy(e); });
  const endJoy = () => { joy.active = false; joy.dx = joy.dy = 0; jk.style.transform = ''; };
  jb.addEventListener('pointerup', endJoy); jb.addEventListener('pointercancel', endJoy);
  function moveJoy(e) { const r = jb.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R0 = r.width / 2; let dx = (e.clientX - cx) / R0, dy = (e.clientY - cy) / R0; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } joy.dx = dx; joy.dy = dy; jk.style.transform = `translate(${dx * R0 * 0.6}px,${dy * R0 * 0.6}px)`; }
  let aimDrag = false, aimStart = null;
  const ab = $('b-attack');
  ab.addEventListener('pointerdown', e => { AU.init(); ab.setPointerCapture(e.pointerId); aimStart = [e.clientX, e.clientY]; aimDrag = false; });
  ab.addEventListener('pointermove', e => { if (!aimStart) return; const dx = e.clientX - aimStart[0], dy = e.clientY - aimStart[1]; if (Math.hypot(dx, dy) > 14) { aimDrag = true; P.aim = Math.atan2(dy, dx); P.dir = dirFromVec(...worldFromScreenAng(P.aim)); } });
  ab.addEventListener('pointerup', () => { if (!aimStart) return; if (aimDrag) playerAttack(P.aim); else attackKey(); aimStart = null; aimDrag = false; });

  // ================================================================== boot & flow
  function spawnPlayer(x, y) { units = units.filter(u => u.kind !== 'player'); P = addUnit('player', x, y, { asset: 'explorer', speed: 2.6, hp: 100, maxHp: 100 }); P.warn = {}; }
  function startView() {
    const [sx, sy] = toScreen(P.x, P.y); cam.x = sx; cam.y = sy - 20; cam.follow = true;
    const want = W / clamp(innerWidth * 1.6, 640, 1300); let best = 0;
    ZOOMS.forEach((zz, n) => { if (Math.abs(Math.log(zz / want)) < Math.abs(Math.log(ZOOMS[best] / want))) best = n; }); zi = Math.max(1, best);
    chunks.clear(); chunkQueue = []; queued.clear(); lastVisKey = ''; miniImg = miniBX.createImageData(N, N); wallIndexDirty = true; trapAt.clear();
    for (const o of objects) if (!o.gone && o.struct === 'spike_trap') trapAt.set(idx(Math.floor(o.x), Math.floor(o.y)), o);
    for (let k = 0; k < N * N; k++) if (explored[k]) miniPaint(k / N | 0, k % N);
    collectLights(); updateVision(true);
    const z = zoom(), vl = cam.x - W / z / 2, vt = cam.y - H / z / 2;
    view = { ox: Math.round(W / 2 - cam.x * z), oy: Math.round(H / 2 - cam.y * z), vl, vt, vr: vl + W / z, vb: vt + H / z, z };
    for (let cy = Math.floor(vt / CH) - 1; cy <= Math.floor((vt + H / z) / CH) + 1; cy++) for (let cx = Math.floor(vl / CH) - 1; cx <= Math.floor((vl + W / z) / CH) + 1; cx++) getChunk(cx, cy, true);
    lastNight = isNight(); G.started = true; buildHud(); refreshUI();
  }
  async function newGame() {
    closeModals(); ['title', 'dead', 'win'].forEach(id => $(id).classList.add('hidden'));
    $('loading').classList.remove('hidden'); $('lmsg').textContent = 'shaping a new island…'; await new Promise(r => setTimeout(r, 30));
    Object.assign(G, { day: 1, tod: 0.1, won: false, spawnT: 5, animalT: 60, killed: 0, beacon: null, beaconNight: false }); WX.force('fair'); WX.S.snowCover = 0;
    genWorld((Math.random() * 1e9) | 0);
    spawnPlayer(start[0] + 0.5, start[1] + 0.5); newPlayerState(); setWeapon('fists');
    startView(); $('loading').classList.add('hidden'); updatePause();
    message('You wake on the Lantern Isles beside a cold fire pit.');
    setTimeout(() => message('Click bushes and rocks to gather sticks, fiber and stones, then craft rope and a stone axe (Pack → Crafting).'), 2500);
    setTimeout(() => message('Before night falls, relight the fire pit and stay in its light.'), 7000);
    saveGame();
  }
  async function continueGame() {
    const d = loadSave(); if (!d) return newGame();
    closeModals(); ['title', 'dead', 'win'].forEach(id => $(id).classList.add('hidden'));
    $('loading').classList.remove('hidden'); $('lmsg').textContent = 'returning to the isles…'; await new Promise(r => setTimeout(r, 30));
    applySave(d); P.dead = false; P.task = null; P.swing = null; P.path = [];
    startView(); $('loading').classList.add('hidden'); updatePause();
    message(`Day ${G.day}. Welcome back.`);
  }
  function titleScreen() { G.started = false; $('t-cont').classList.toggle('hidden', !loadSave()); show('title'); }
  $('t-new').onclick = () => { AU.init(); if (loadSave() && $('t-new').dataset.armed !== '1') { $('t-new').dataset.armed = '1'; $('t-new').textContent = 'Start over? (tap again)'; return; } newGame(); };
  $('t-cont').onclick = () => { AU.init(); continueGame(); };
  $('d-load').onclick = () => continueGame(); $('d-new').onclick = () => newGame();
  $('w-cont').onclick = () => hide('win'); $('w-new').onclick = () => newGame();

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
    window.GAME = { G, get P() { return P; }, inv, get objects() { return objects; }, get units() { return units; }, get sites() { return sites; }, newGame, continueGame, saveGame, addItem, addStruct, setTask, craft, RECIPES, STRUCTS,
      revealAll: () => { explored.fill(1); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) miniPaint(i, j); miniDirty = true; }, cam, setZoom, toScreen, spawn: (k, x, y) => addUnit(k, x, y), startPlacing, placeAt, perform, actionsFor, playerAttack, WX, view: () => view, pickAt, openMenuFor };
    window.__ready = true;
  })().catch(e => { $('lmsg').textContent = 'Error: ' + e.message; console.error(e); });
})();
