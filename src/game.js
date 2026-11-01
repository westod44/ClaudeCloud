/*
 * Lantern Isles — open-world exploration on the pre-rendered isometric standard.
 * Requires: style.js, palette.js, noise.js, assets/atlas.js
 */
(function () {
  'use strict';
  const S = STYLE, A = ATLAS, NZ = NOISE;
  const { fbm2, noise2, hash, rng, clamp } = NZ;
  const HWp = S.projection.tile.w / 2, HHp = S.projection.tile.h / 2, ZPX = S.projection.elevation.pxPerLevel;
  const LV_UNITS = ZPX / S.projection.pxPerUnitZ;
  const N = 96, MAXLV = 7, CH = 128;
  const $ = id => document.getElementById(id);
  const TYPES = {}; S.terrain.types.forEach((t, k) => { TYPES[t.id] = k; t.k = k; });
  const TT = S.terrain.types;
  const isWater = k => k === TYPES.deep || k === TYPES.shallow;

  // ================================================================== assets
  const SPR = {};
  const TEX = {};
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  async function loadAssets(progress) {
    const list = A.manifest.assets; let n = 0; const total = list.length + A.manifest.terrain.length;
    await Promise.all(list.map(async a => {
      SPR[a.name] = Object.assign({}, a, { img: await loadImg(A.images[a.name]), sh: await loadImg(A.images[a.name + '_shadow']) });
      progress(++n / total);
    }));
    for (const t of A.manifest.terrain) {
      const img = await loadImg(A.images['terrain_' + t.id]); const c = document.createElement('canvas'); c.width = c.height = t.size;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); TEX[TYPES[t.id]] = new Uint32Array(x.getImageData(0, 0, t.size, t.size).data.buffer);
      progress(++n / total);
    }
  }
  const TS = S.terrain.textureSize, TPT = S.terrain.texelsPerTile;

  // ================================================================== world
  const type = new Uint8Array(N * N), lvl = new Float32Array(N * N), Hv = new Float32Array((N + 1) * (N + 1));
  const waterDist = new Float32Array(N * N), landDist = new Float32Array(N * N);
  const blocked = new Uint8Array(N * N), explored = new Uint8Array(N * N), visible = new Uint8Array(N * N);
  const idx = (i, j) => i * N + j, inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  const objects = [], units = [];
  const sites = []; // discoveries
  let start = [N / 2, N / 2], relicTotal = 0, relicFound = 0, gold = 0, discovered = 0;

  // terrain height in levels at continuous coords: uniform cubic B-spline over the vertex grid (C2 smooth, no per-tile creases)
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

  function genWorld(seed) {
    const R = rng(seed);
    const E = new Float32Array(N * N), moist = new Float32Array(N * N), forestN = new Float32Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = i / N - 0.5, y = j / N - 0.5, d = Math.hypot(x, y) * 2;
      E[idx(i, j)] = fbm2(i / 16, j / 16, 1e5, seed, 5) * 0.95 + fbm2(i / 6, j / 6, 1e5, seed + 3, 3) * 0.12 - d * d * 0.95 + 0.32;
      moist[idx(i, j)] = fbm2(i / 12 + 50, j / 12, 1e5, seed + 7, 4);
      forestN[idx(i, j)] = fbm2(i / 7, j / 7, 1e5, seed + 11, 4);
    }
    const WL = 0.36;
    for (let k = 0; k < N * N; k++) {
      if (E[k] < WL) { lvl[k] = 0; type[k] = TYPES.deep; continue; }
      type[k] = TYPES.grass;
      const l = (E[k] - WL) / 0.075, f = Math.floor(l), fr = l - f;
      lvl[k] = clamp(f + NZ.smooth(clamp((fr - 0.3) / 0.4, 0, 1)), 0.25, MAXLV);
    }
    bfsDist(k => !isWater(type[k]), waterDist);       // for water tiles: distance to land
    bfsDist(k => isWater(type[k]), landDist);         // for land tiles: distance to water
    for (let k = 0; k < N * N; k++) {
      if (isWater(type[k])) { type[k] = waterDist[k] <= 2 ? TYPES.shallow : TYPES.deep; continue; }
      const L = lvl[k], m = moist[k], i = k / N | 0, j = k % N;
      let t = m < 0.42 ? TYPES.dryGrass : m > 0.6 ? TYPES.grassLush : TYPES.grass;
      if (fbm2(i / 5, j / 5, 1e5, seed + 21, 3) > 0.66) t = TYPES.dirt;
      if (landDist[k] <= 1 && L < 1.6) t = TYPES.sand;
      else if (landDist[k] <= 2 && L < 1.2 && m < 0.5) t = TYPES.sand;
      const rn = fbm2(i / 4, j / 4, 1e5, seed + 31, 3);
      if (L >= 6.6 + rn * 0.6) t = TYPES.snow; else if (L >= 5.3 + rn * 0.8) t = TYPES.rock; else if (L >= 4.2 && t !== TYPES.dirt) t = TYPES.dryGrass;
      else if (t !== TYPES.sand && forestN[k] > 0.57 && L < 4.4) t = TYPES.forestFloor;
      type[k] = t;
    }
    computeVertices();
    // start: flat-ish grass near centre
    let best = 1e9;
    for (let i = 8; i < N - 8; i++) for (let j = 8; j < N - 8; j++) { const k = idx(i, j); if (type[k] !== TYPES.grass && type[k] !== TYPES.grassLush) continue; const d = Math.hypot(i - N / 2, j - N / 2) + lvl[k] * 2; if (d < best) { best = d; start = [i, j]; } }
    placeWorld(seed, R);
    computeVertices();
  }
  function computeVertices() {
    // vertex heights: average of touching tiles; any vertex touching water sits at sea level
    for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) {
      let s = 0, c = 0, wet = false;
      for (const [di, dj] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) { const i = a + di, j = b + dj; if (!inMap(i, j)) { wet = true; continue; } const k = idx(i, j); if (isWater(type[k])) wet = true; s += lvl[k]; c++; }
      Hv[a * (N + 1) + b] = wet ? 0 : s / c;
    }
  }
  function flatten(ci, cj, r) { // level the ground for a settlement (blend edge)
    const L0 = lvl[idx(ci, cj)];
    for (let i = ci - r - 2; i <= ci + r + 2; i++) for (let j = cj - r - 2; j <= cj + r + 2; j++) {
      if (!inMap(i, j)) continue; const k = idx(i, j); if (isWater(type[k])) continue;
      const d = Math.hypot(i - ci, j - cj), t = clamp((d - r) / 2.5, 0, 1); lvl[k] = L0 + (lvl[k] - L0) * t;
    }
  }

  // ------------------------------------------------------------------ objects
  function addObj(asset, x, y, extra = {}) {
    const a = SPR[asset]; const o = Object.assign({ asset, x, y, frame: 0, fp: a.footprint, blocks: a.blocks }, extra);
    objects.push(o);
    if (o.blocks) for (const [i, j] of fpTiles(o)) blocked[idx(i, j)] = 1;
    return o;
  }
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

  function placeWorld(seed, R) {
    const avoid = [start];
    const grassy = k => k === TYPES.grass || k === TYPES.grassLush || k === TYPES.dryGrass;
    // villages
    const vs = pickSites(3, 15, (i, j) => grassy(type[idx(i, j)]) && flatness(i, j, 5) < 2.2 && lvl[idx(i, j)] < 3.6 && Math.hypot(i - start[0], j - start[1]) > 11, avoid, R);
    vs.forEach((v, n) => {
      const [ci, cj] = v; clearArea(ci, cj, 7, TYPES.grass); flatten(ci, cj, 6);
      const site = { kind: 'village', name: 'the village of ' + VILLAGE_NAMES[n], i: ci, j: cj, found: false }; sites.push(site);
      const put = (asset, dx, dy, extra) => { const fp = SPR[asset].footprint; const x = ci + dx + (fp[0] % 2 ? 0.5 : 0), y = cj + dy + (fp[1] % 2 ? 0.5 : 0); if (freeFor(x, y, fp, true)) return addObj(asset, x, y, extra); };
      put('well', 0, 0);
      put('cottage_thatch', -3, -2); put('cottage_timber', 3, -3); put(n % 2 ? 'cottage_timber' : 'cottage_thatch', -2, 4); put('cottage_thatch', 4, 2);
      put('market_stall', 2, 0); put('campfire', -2, 1, { anim: true }); put('windmill', -5, -5); put('signpost', 1, 3);
      for (let k = 0; k < 4; k++) addUnit('villager_' + (1 + (k % 3)), ci + 0.5 + (R() - 0.5) * 3, cj + 0.5 + (R() - 0.5) * 3, { home: [ci + 0.5, cj + 0.5], range: 4, ai: 'wander' });
      for (let k = 0; k < 5; k++) addUnit('sheep', ci + 6 + R() * 2, cj - 1 + R() * 3, { home: [ci + 7, cj], range: 3, ai: 'wander' });
      avoid.push(v);
    });
    // roads between start and villages
    const hubs = [start].concat(vs);
    for (let k = 1; k < hubs.length; k++) buildRoad(hubs[k - 1], hubs[k]);
    // ruins
    const rs = pickSites(4, 13, (i, j) => !isWater(type[idx(i, j)]) && flatness(i, j, 3) < 2 && Math.hypot(i - start[0], j - start[1]) > 10, avoid, R);
    const shrinePos = [];
    rs.forEach((r, n) => {
      const [ci, cj] = r; clearArea(ci, cj, 4, TYPES.dirt); flatten(ci, cj, 3);
      for (let i = ci - 4; i <= ci + 4; i++) for (let j = cj - 4; j <= cj + 4; j++) if (inMap(i, j) && !isWater(type[idx(i, j)]) && Math.hypot(i - ci, j - cj) + (noise2(i / 2.5, j / 2.5, 1e5, seed + n) - 0.5) * 4 < 3.2) type[idx(i, j)] = TYPES.road;
      sites.push({ kind: 'ruin', name: RUIN_NAMES[n], i: ci, j: cj, found: false });
      const tryPut = (asset, x, y) => { if (freeFor(x, y, SPR[asset].footprint, true)) return addObj(asset, x, y); };
      if (n === 1) { for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; tryPut('standing_stone_' + (1 + k % 3), ci + 0.5 + Math.round(Math.cos(a) * 3), cj + 0.5 + Math.round(Math.sin(a) * 3)); } }
      else {
        tryPut('ruin_arch', ci, cj - 2.5 + 0.5 * 0); tryPut('ruin_wall_' + (1 + n % 2), ci - 3, cj + 0.5); tryPut('ruin_wall_1', ci + 3, cj + 2.5);
        for (let k = 0; k < 4; k++) tryPut('column_' + (1 + k % 3), ci + 0.5 + [-2, 2, -2, 2][k], cj + 0.5 + [-1, -1, 2, 2][k] + 1);
        tryPut('column_fallen_' + (1 + n % 2), ci + 1.5, cj + 3.5);
      }
      shrinePos.push([ci + 0.5, cj + 0.5]);
    });
    // remote shrines to reach 8 relics
    const remote = pickSites(8 - shrinePos.length, 10, (i, j) => { const k = idx(i, j); return !isWater(type[k]) && type[k] !== TYPES.forestFloor && !blocked[k] && Math.hypot(i - start[0], j - start[1]) > 9; }, avoid.concat(rs), R);
    remote.forEach(p => shrinePos.push([p[0] + 0.5, p[1] + 0.5]));
    for (const [x, y] of shrinePos) { const k = idx(x | 0, y | 0); if (type[k] === TYPES.forestFloor) type[k] = TYPES.dirt; const o = addObj('shrine_lit', x, y, { relic: true }); if (o) relicTotal++; }
    // watchtowers on high ground
    const ts = pickSites(3, 14, (i, j) => { const k = idx(i, j); return lvl[k] >= 3.5 && type[k] !== TYPES.forestFloor && !blocked[k]; }, avoid.concat(rs), R);
    ts.forEach((t, n) => { addObj('watchtower', t[0] + 0.5, t[1] + 0.5); sites.push({ kind: 'tower', name: 'a watchtower', i: t[0], j: t[1], found: false }); });
    // forests
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = idx(i, j); if (type[k] !== TYPES.forestFloor || blocked[k]) continue;
      const L = lvl[k], r = hash(i, j, seed + 1);
      const asset = L >= 2.8 ? (r < 0.75 ? 'pine_' + (1 + (r * 4 | 0) % 3) : 'oak_3') : (r < 0.15 ? 'birch_' + (1 + (r * 20 | 0) % 2) : r < 0.25 ? 'pine_1' : 'oak_' + (1 + (r * 37 | 0) % 4));
      addObj(asset, i + 0.5 + (hash(i, j, 3) - 0.5) * 0.3, j + 0.5 + (hash(i, j, 4) - 0.5) * 0.3);
    }
    // scattered nature & resources
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = idx(i, j); if (blocked[k] || isWater(type[k])) continue;
      const t = type[k], r = hash(i, j, seed + 5), x = i + 0.5 + (hash(i, j, 6) - 0.5) * 0.4, y = j + 0.5 + (hash(i, j, 7) - 0.5) * 0.4;
      const nearForest = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inMap(i + a, j + b) && type[idx(i + a, j + b)] === TYPES.forestFloor);
      if (t === TYPES.rock || t === TYPES.snow) {
        if (r < 0.07) addObj('boulder_' + (1 + (r * 100 | 0) % 3), x, y); else if (r < 0.09) addObj('stone_pile', x, y); else if (r < 0.105) addObj(r < 0.1 ? 'gold_vein' : 'gold_boulder', x, y); else if (r < 0.16 && t === TYPES.rock) addObj('pine_' + (1 + (r * 300 | 0) % 3), x, y);
      } else if (t === TYPES.sand) {
        if (r < 0.03) addObj('palm_' + (1 + (r * 100 | 0) % 2), x, y); else if (r < 0.045) addObj('boulder_2', x, y); else if (r < 0.07) addObj('grass_tuft_dry', x, y);
        if (landDist[k] <= 1 && r > 0.85) addObj('reeds', x, y);
      } else if (t !== TYPES.road) {
        if (nearForest && r < 0.06) addObj(r < 0.025 ? 'berry_bush' : 'bush_' + (1 + (r * 100 | 0) % 2), x, y);
        else if (r < 0.006) addObj('boulder_' + (1 + (r * 1000 | 0) % 3), x, y);
        else if (r < 0.009 && t === TYPES.dryGrass) addObj('dead_tree', x, y);
        else if (r < 0.012) addObj('gold_boulder', x, y);
        else if (r < 0.03) addObj('bush_' + (1 + (r * 100 | 0) % 2), x, y);
        else if (r < 0.06) addObj(['flowers_yellow', 'flowers_white', 'flowers_purple'][(r * 1000 | 0) % 3], x, y);
        else if (r < 0.13) addObj(t === TYPES.dryGrass ? 'grass_tuft_dry' : 'grass_tuft', x, y);
        else if (r > 0.995 && !nearForest) addObj('oak_' + (1 + (r * 10000 | 0) % 2), x, y);
      }
    }
    // treasure chests
    const cs = pickSites(12, 6, (i, j) => { const k = idx(i, j); return !isWater(type[k]) && !blocked[k] && type[k] !== TYPES.forestFloor; }, avoid, R);
    cs.forEach(c => addObj('chest', c[0] + 0.5, c[1] + 0.5, { chest: true }));
    // deer herds near forests
    const hs = pickSites(6, 10, (i, j) => { const k = idx(i, j); return (type[k] === TYPES.grass || type[k] === TYPES.grassLush) && !blocked[k]; }, avoid, R);
    hs.forEach(h => { for (let k = 0; k < 3 + (R() * 2 | 0); k++) addUnit('deer', h[0] + 0.5 + (R() - 0.5) * 2, h[1] + 0.5 + (R() - 0.5) * 2, { home: [h[0] + 0.5, h[1] + 0.5], range: 5, ai: 'deer' }); });
    ensureReachable();
  }
  // carve a trail through forest/rocks to anything the player must reach
  function ensureReachable() {
    const reach = () => { const seen = new Uint8Array(N * N), q = [idx(start[0], start[1])]; seen[q[0]] = 1; for (let h = 0; h < q.length; h++) { const i = q[h] / N | 0, j = q[h] % N; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + a, nj = j + b; if (!inMap(ni, nj)) continue; const k = idx(ni, nj); if (!seen[k] && walkCost(k)) { seen[k] = 1; q.push(k); } } } return seen; };
    const removable = o => !o.relic && !o.chest && (SPR[o.asset].category === 'nature' || SPR[o.asset].category === 'resource');
    for (const o of objects.filter(o => o.relic || o.chest || o.asset === 'watchtower')) {
      const seen = reach(), i0 = Math.floor(o.x), j0 = Math.floor(o.y);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inMap(i0 + a, j0 + b) && seen[idx(i0 + a, j0 + b)])) continue;
      const cost = k => type[k] === TYPES.deep ? 0 : 1 + (blocked[k] ? 4 : 0);
      const path = astar(start[0], start[1], i0, j0, cost); if (!path) continue;
      for (const [i, j] of path.slice(0, -1)) {
        const k = idx(i, j); if (!blocked[k]) continue;
        for (const ob of objects) if (!ob.gone && removable(ob) && fpTiles(ob).some(([a, b]) => a === i && b === j)) { ob.gone = true; for (const [a, b] of fpTiles(ob)) blocked[idx(a, b)] = 0; }
        if (type[k] === TYPES.forestFloor) type[k] = TYPES.dirt;
      }
    }
    for (let k = objects.length - 1; k >= 0; k--) if (objects[k].gone) objects.splice(k, 1);
  }
  function buildRoad(a, b) {
    const cost = k => { const t = type[k]; if (isWater(t)) return 0; return 1 + (t === TYPES.forestFloor ? 6 : 0) + (blocked[k] ? 30 : 0) + (t === TYPES.road ? -0.6 : 0); };
    const path = astar(a[0], a[1], b[0], b[1], cost); if (!path) return;
    for (const [i, j] of path) for (const [a, b] of [[0, 0], [1, 0], [0, 1]]) { if (!inMap(i + a, j + b)) continue; const k = idx(i + a, j + b); if (!isWater(type[k]) && (a + b === 0 || hash(i + a, j + b, 9) < 0.55)) type[k] = TYPES.road; }
  }

  // ------------------------------------------------------------------ pathfinding
  function astar(si, sj, ti, tj, costFn) {
    const g = new Float32Array(N * N).fill(1e9), prev = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
    const heap = []; const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const s = idx(si, sj), t = idx(ti, tj); g[s] = 0; push(s, 0);
    const hfn = (i, j) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    while (heap.length) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === t) break;
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
  const walkCost = k => (isWater(type[k]) && type[k] === TYPES.deep) || blocked[k] ? 0 : 1;
  function walkableAt(x, y) { const i = Math.floor(x), j = Math.floor(y); if (!inMap(i, j)) return false; return walkCost(idx(i, j)) > 0; }
  function los(x0, y0, x1, y1) { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2); for (let s = 1; s <= n; s++) { const t = s / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (!walkableAt(x, y) || !walkableAt(x + 0.18, y) || !walkableAt(x - 0.18, y) || !walkableAt(x, y + 0.18) || !walkableAt(x, y - 0.18)) return false; } return true; }
  function findPath(u, tx, ty) {
    const si = Math.floor(u.x), sj = Math.floor(u.y), ti = Math.floor(tx), tj = Math.floor(ty);
    if (!inMap(ti, tj) || !walkCost(idx(ti, tj))) return null;
    const p = astar(si, sj, ti, tj, walkCost); if (!p) return null;
    const pts = p.map(([i, j]) => [i + 0.5, j + 0.5]); pts[pts.length - 1] = [tx, ty];
    const out = []; let cur = [u.x, u.y], k = 0;
    while (k < pts.length) { let far = k; for (let m = pts.length - 1; m > k; m--) if (los(cur[0], cur[1], pts[m][0], pts[m][1])) { far = m; break; } out.push(pts[far]); cur = pts[far]; k = far + 1; }
    return out;
  }

  // ------------------------------------------------------------------ units
  function addUnit(asset, x, y, extra = {}) {
    if (!walkableAt(x, y)) { const i = Math.floor(x), j = Math.floor(y); let ok = false; for (let r = 1; r < 4 && !ok; r++) for (let a = -r; a <= r && !ok; a++) for (let b = -r; b <= r && !ok; b++) if (walkableAt(i + a + 0.5, j + b + 0.5)) { x = i + a + 0.5; y = j + b + 0.5; ok = true; } if (!ok) return null; }
    const u = Object.assign({ asset, x, y, dir: (Math.random() * 8) | 0, moving: false, path: [], walkT: Math.random() * 3, wait: Math.random() * 4, speed: SPR[asset].speed || 1.5, unit: true }, extra);
    units.push(u); return u;
  }
  const DIRS = S.sprites.directions; // S SW W NW N NE E SE
  function dirFromVec(dx, dy) { // world delta -> screen direction index
    const sx = (dx - dy) * HWp, sy = (dx + dy) * HHp * 2; // undo vertical squash for angle
    const a = Math.atan2(sy, sx); // 0 = E (screen right), PI/2 = S
    const sectors = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    return DIRS.indexOf(sectors[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]);
  }
  function stepUnit(u, dt) {
    if (u.path.length) {
      const [tx, ty] = u.path[0], dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
      const sp = u.speed * (u.flee ? 1.6 : 1) * dt;
      if (d <= sp) { u.x = tx; u.y = ty; u.path.shift(); }
      else { const nx = u.x + dx / d * sp, ny = u.y + dy / d * sp; if (walkableAt(nx, ny)) { u.x = nx; u.y = ny; } else u.path = []; u.dir = dirFromVec(dx, dy); }
      u.moving = u.path.length > 0; u.walkT += dt;
    } else u.moving = false;
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
      const s = sBuf[py * CH + px]; if (s !== s) continue; // NaN -> void
      const c = (X0 + px + 0.5) / HWp, x = (s + c) / 2, y = (s - c) / 2;
      // blended terrain type (domain-warped borders)
      const wx = (noise2(x * 1.6, y * 1.6, 1e5, 91) - 0.5) * 1.05 + (noise2(x * 5, y * 5, 1e5, 93) - 0.5) * 0.35;
      const wy = (noise2(x * 1.6 + 31, y * 1.6 + 17, 1e5, 92) - 0.5) * 1.05 + (noise2(x * 5 + 5, y * 5 + 9, 1e5, 94) - 0.5) * 0.35;
      const ti = clamp(Math.floor(x + wx), 0, N - 1), tj = clamp(Math.floor(y + wy), 0, N - 1);
      const t1 = type[idx(ti, tj)];
      const ti2 = clamp(Math.floor(x + wx * 0.55), 0, N - 1), tj2 = clamp(Math.floor(y + wy * 0.55), 0, N - 1);
      const t2 = type[idx(ti2, tj2)];
      const u = ((Math.floor(x * TPT) % TS) + TS) % TS, v = ((Math.floor(y * TPT) % TS) + TS) % TS, ti_ = v * TS + u;
      let r, g, b;
      const sample = t => { const p = TEX[t][ti_]; return [p & 255, (p >> 8) & 255, (p >> 16) & 255]; };
      // water depth field (bilinear over tile centres)
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
        const ld = bil(landDist, x - 0.5, y - 0.5); if (ld < 1.4 && (t1 === TYPES.sand)) { const m = 0.82 + 0.18 * clamp(ld - 0.4, 0, 1); col = col.map(v => v * m); }
        // slope lighting
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
    else { queued.add(key); chunkQueue.unshift(key); } // visible: highest priority
    return null;
  }

  // ================================================================== view
  const cv = $('game'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
  let zi = 2;
  const cam = { x: 0, y: 0, follow: true };
  function resize() { dpr = Math.min(3, window.devicePixelRatio || 1); W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr); cv.width = W; cv.height = H; fogC.width = Math.ceil(W / 8); fogC.height = Math.ceil(H / 8); }
  const fogC = document.createElement('canvas'), fogX = fogC.getContext('2d'), dimC = document.createElement('canvas'), dimX = dimC.getContext('2d');
  addEventListener('resize', resize);
  const zoom = () => ZOOMS[zi];
  const toScreen = (x, y) => { const h = hAt(x, y); return [(x - y) * HWp, (x + y) * HHp - h * ZPX]; };

  let player = null, time = 0;
  const sparkles = [];

  function draw() {
    const z = zoom();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const ox = Math.round(W / 2 - cam.x * z), oy = Math.round(H / 2 - cam.y * z);
    ctx.setTransform(z, 0, 0, z, ox, oy); ctx.imageSmoothingEnabled = false;
    const vl = -ox / z, vt = -oy / z, vr = vl + W / z, vb = vt + H / z;
    // terrain
    for (let cy = Math.floor(vt / CH); cy <= Math.floor(vb / CH); cy++) for (let cx = Math.floor(vl / CH); cx <= Math.floor(vr / CH); cx++) {
      const c = getChunk(cx, cy, false); if (c) ctx.drawImage(c, cx * CH, cy * CH);
    }
    // water sparkles
    ctx.fillStyle = 'rgba(235,248,255,0.85)';
    for (const s of sparkles) { const a = Math.sin(s.t / s.life * Math.PI); if (a <= 0) continue; ctx.globalAlpha = a; ctx.fillRect(Math.round(s.sx), Math.round(s.sy), 3, 1); }
    ctx.globalAlpha = 1;
    // gather visible sprites
    const list = [];
    const consider = (o, isUnit) => {
      const i = Math.floor(o.x), j = Math.floor(o.y); if (!inMap(i, j)) return;
      if (isUnit ? !visible[idx(i, j)] && o !== player : !explored[idx(i, j)]) return;
      const [sx, sy] = toScreen(o.x, o.y), a = SPR[o.asset];
      if (sx + a.w < vl || sx - a.w > vr || sy - a.ay > vb || sy + a.h < vt) return;
      list.push([o.x + o.y + (isUnit ? 0.01 : 0) - (a.footprint[0] > 1 ? 0.3 : 0), o, sx, sy, isUnit]);
    };
    for (const o of objects) if (!o.gone) consider(o, false);
    for (const u of units) consider(u, true);
    list.sort((a, b) => a[0] - b[0]);
    for (const it of list) drawSprite(it[1], it[2], it[3], it[4], true);
    for (const it of list) drawSprite(it[1], it[2], it[3], it[4], false);
    // glows
    ctx.globalCompositeOperation = 'lighter';
    for (const it of list) {
      const o = it[1];
      if (o.asset === 'shrine_lit' || o.asset === 'campfire' || o.asset === 'explorer') {
        const r = o.asset === 'campfire' ? 90 : o.asset === 'explorer' ? 40 : 70, cy0 = it[3] - (o.asset === 'shrine_lit' ? 55 : o.asset === 'explorer' ? 22 : 12);
        const fl = 0.85 + 0.15 * Math.sin(time * 9 + o.x * 3);
        const g = ctx.createRadialGradient(it[2], cy0, 2, it[2], cy0, r); g.addColorStop(0, `rgba(255,200,110,${0.35 * fl})`); g.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = g; ctx.fillRect(it[2] - r, cy0 - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // path marker
    if (marker && marker.t > 0) { const [sx, sy] = toScreen(marker.x, marker.y); ctx.strokeStyle = `rgba(255,214,110,${marker.t})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, 12 * (1.5 - marker.t * 0.5), 6 * (1.5 - marker.t * 0.5), 0, 0, Math.PI * 2); ctx.stroke(); }
    // fog of war
    drawFog(ox, oy, z, vl, vt, vr, vb);
  }
  function drawSprite(o, sx, sy, isUnit, shadowPass) {
    const a = SPR[o.asset]; let row = 0, col = 0, flip = false;
    if (isUnit) {
      const d = DIRS[o.dir]; const src = a.mirrored[d] || d; flip = !!a.mirrored[d]; row = a.dirs.indexOf(src);
      col = o.moving ? 1 + (Math.floor(o.walkT * a.fps) % (a.frames - 1)) : 0;
    } else if (a.frames > 1) col = Math.floor(time * (a.fps || 8) + o.x * 7) % a.frames;
    const img = shadowPass ? a.sh : a.img;
    const X = Math.round(sx), Y = Math.round(sy);
    if (flip) { ctx.save(); ctx.translate(X, Y); ctx.scale(-1, 1); ctx.drawImage(img, col * a.w, row * a.h, a.w, a.h, -a.ax, -a.ay, a.w, a.h); ctx.restore(); }
    else ctx.drawImage(img, col * a.w, row * a.h, a.w, a.h, X - a.ax, Y - a.ay, a.w, a.h);
  }
  function drawFog(ox, oy, z, vl, vt, vr, vb) {
    const f = fogX, k = 1 / 8; f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, fogC.width, fogC.height);
    f.fillStyle = '#000'; f.fillRect(0, 0, fogC.width, fogC.height);
    f.setTransform(z * k, 0, 0, z * k, ox * k, oy * k);
    // erase explored / visible tiles out of the black, then re-darken explored-but-not-visible
    const sMin = Math.floor((vt - 40) / HHp) - 1, sMax = Math.ceil((vb + MAXLV * ZPX + 40) / HHp) + 1;
    const cMin = Math.floor(vl / HWp) - 2, cMax = Math.ceil(vr / HWp) + 2;
    // pass 1: punch every explored tile fully out of the black (overlaps are harmless at alpha 1)
    // pass 2: paint explored-but-unseen tiles opaque on a separate layer, composite it once at the fog alpha
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

  // ================================================================== vision & interaction
  let lastVisTile = -1;
  function updateVision(force) {
    const pi = Math.floor(player.x), pj = Math.floor(player.y), key = idx(pi, pj);
    if (key === lastVisTile && !force) return; lastVisTile = key;
    visible.fill(0); const R = S.fog.visionRadiusTiles + (hAt(player.x, player.y) > 3.5 ? 2 : 0);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { if (a * a + b * b > R * R + 1) continue; const i = pi + a, j = pj + b; if (!inMap(i, j)) continue; const k = idx(i, j); visible[k] = 1; if (!explored[k]) { explored[k] = 1; miniPaint(i, j); exploredCount++; } }
    for (const s of sites) if (!s.found && visible[idx(s.i, s.j)]) { s.found = true; discovered++; message(`Discovered ${s.name}.`); }
    for (const o of objects) if (o.asset === 'watchtower' && !o.revealed && Math.hypot(o.x - player.x, o.y - player.y) < 1.8) { o.revealed = true; revealAround(o.x, o.y, 14); message('From the watchtower you survey the land.'); }
    hud(); miniDirty = true;
  }
  let exploredCount = 0;
  function revealAround(x, y, R) { for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { if (a * a + b * b > R * R) continue; const i = Math.floor(x) + a, j = Math.floor(y) + b; if (!inMap(i, j)) continue; const k = idx(i, j); if (!explored[k]) { explored[k] = 1; miniPaint(i, j); exploredCount++; } } }
  function interact() {
    for (const o of objects) {
      if (o.gone) continue; const d = Math.hypot(o.x - player.x, o.y - player.y);
      if (o.chest && d < 1.0) { o.gone = true; const g = 25 + ((hash(o.x * 10, o.y * 10, 5) * 75) | 0); gold += g; message(`You open a chest: ${g} gold.`); hud(); }
      if (o.relic && d < 1.35) { o.relic = false; o.asset = 'shrine_empty'; relicFound++; message(relicFound === relicTotal ? 'All relics recovered. The lanterns of the isles burn again!' : `Relic recovered (${relicFound}/${relicTotal}).`); hud(); miniDirty = true; if (relicFound === relicTotal) $('win').style.display = 'flex'; }
    }
  }

  // ================================================================== update
  let marker = null;
  const keys = new Set();
  function update(dt) {
    time += dt;
    // keyboard: screen-relative movement
    let kx = 0, ky = 0;
    if (keys.has('w') || keys.has('arrowup')) ky -= 1; if (keys.has('s') || keys.has('arrowdown')) ky += 1;
    if (keys.has('a') || keys.has('arrowleft')) kx -= 1; if (keys.has('d') || keys.has('arrowright')) kx += 1;
    if (kx || ky) {
      player.path = []; const l = Math.hypot(kx, ky); kx /= l; ky /= l;
      // screen dir -> world: sx = (dx-dy), sy = (dx+dy)/2  => dx = sy + sx/2, dy = sy - sx/2
      let dx = ky + kx / 2, dy = ky - kx / 2; const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
      const sp = player.speed * dt;
      const tryMove = (mx, my) => { const nx = player.x + mx * sp, ny = player.y + my * sp; if (walkableAt(nx, ny)) { player.x = nx; player.y = ny; return true; } return false; };
      if (!tryMove(dx, dy)) { if (!tryMove(dx, 0)) tryMove(0, dy); }
      player.dir = dirFromVec(dx, dy); player.moving = true; player.walkT += dt; cam.follow = true;
    } else stepUnit(player, dt);
    // AI
    for (const u of units) {
      if (u === player) continue;
      const dp = Math.hypot(u.x - player.x, u.y - player.y);
      if (u.ai === 'deer' && dp < 3.2 && !u.flee) { const a = Math.atan2(u.y - player.y, u.x - player.x) + (Math.random() - 0.5) * 0.8; const tx = u.x + Math.cos(a) * 5, ty = u.y + Math.sin(a) * 5; const p = findPath(u, tx, ty); if (p) { u.path = p; u.flee = true; } }
      if (!u.path.length) {
        u.flee = false; u.wait -= dt;
        if (u.wait <= 0) {
          u.wait = 2 + Math.random() * 5;
          const a = Math.random() * Math.PI * 2, r = Math.random() * u.range, tx = u.home[0] + Math.cos(a) * r, ty = u.home[1] + Math.sin(a) * r;
          if (Math.hypot(tx - u.x, ty - u.y) < 6) { const p = findPath(u, tx, ty); if (p) u.path = p; }
        }
      }
      stepUnit(u, dt);
    }
    updateVision(false); interact();
    // camera
    if (cam.follow) { const [sx, sy] = toScreen(player.x, player.y); const k = 1 - Math.exp(-dt * 6); cam.x += (sx - cam.x) * k; cam.y += (sy - 20 - cam.y) * k; }
    // background chunk rendering budget
    { // prefetch a ring around the view, then spend ~9 ms per frame painting chunks
      const z = zoom(), vl = cam.x - W / z / 2, vt = cam.y - H / z / 2, m = 2;
      for (let cy = Math.floor(vt / CH) - m; cy <= Math.floor((vt + H / z) / CH) + m; cy++) for (let cx = Math.floor(vl / CH) - m; cx <= Math.floor((vl + W / z) / CH) + m; cx++) {
        const key = cx + ',' + cy; if (!chunks.has(key) && !queued.has(key)) { queued.add(key); chunkQueue.push(key); }
      }
      const t0 = performance.now();
      while (chunkQueue.length && performance.now() - t0 < 9) { const key = chunkQueue.shift(); queued.delete(key); if (!chunks.has(key)) { const [cx, cy] = key.split(',').map(Number); chunks.set(key, renderChunk(cx, cy)); } }
    }
    // sparkles on visible deep-ish water near the camera
    for (const s of sparkles) s.t += dt; for (let i = sparkles.length - 1; i >= 0; i--) if (sparkles[i].t > sparkles[i].life) sparkles.splice(i, 1);
    if (sparkles.length < 60) for (let n = 0; n < 4; n++) {
      const z = zoom(), sx = cam.x + (Math.random() - 0.5) * W / z, sy = cam.y + (Math.random() - 0.5) * H / z;
      const x = sy / (2 * HHp) + sx / (2 * HWp), y = sy / (2 * HHp) - sx / (2 * HWp); const i = Math.floor(x), j = Math.floor(y);
      if (inMap(i, j) && isWater(type[idx(i, j)]) && visible[idx(i, j)] && waterDist[idx(i, j)] > 0.5) sparkles.push({ sx, sy, t: 0, life: 0.8 + Math.random() });
    }
    if (marker) marker.t -= dt * 1.2;
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
    if (miniDirty) drawMini();
  }

  // ================================================================== HUD / minimap
  let msgT = 0;
  function message(t) { const m = $('msg'); m.textContent = t; m.style.opacity = 1; msgT = 4; }
  function hud() {
    $('r-relic').textContent = `${relicFound}/${relicTotal}`; $('r-gold').textContent = gold;
    $('r-disc').textContent = `${discovered}/${sites.length}`; $('r-expl').textContent = Math.round(exploredCount / (N * N) * 100) + '%';
  }
  const miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = N; const miniBX = miniBase.getContext('2d'); let miniImg, miniDirty = true;
  const MINI_COL = { deep: '#1f4f78', shallow: '#3f8ea0', sand: '#d2bb84', grass: '#6b8a3a', grassLush: '#4f7a2e', dryGrass: '#a39352', dirt: '#8a6a45', road: '#b0946a', forestFloor: '#2f4a22', rock: '#8a857a', snow: '#e8eef2' };
  const MC = TT.map(t => PAL.hex(MINI_COL[t.id]));
  function miniPaint(i, j) { const k = idx(i, j), c = MC[type[k]], o = (i * N + j) * 4, sh = isWater(type[k]) ? 1 : 0.8 + lvl[k] * 0.05; miniImg.data[o] = c[0] * sh; miniImg.data[o + 1] = c[1] * sh; miniImg.data[o + 2] = c[2] * sh; miniImg.data[o + 3] = 255; }
  function drawMini() {
    miniDirty = false; miniBX.putImageData(miniImg, 0, 0);
    const m = $('mini'), x = m.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, m.width, m.height);
    const sc = m.width / (2 * N); x.setTransform(sc, sc / 2, -sc, sc / 2, m.width / 2, 0); x.imageSmoothingEnabled = false;
    x.fillStyle = '#07090b'; x.fillRect(0, 0, N, N);
    // canvas pixel (px=j, py=i) in miniImg -> we stored at (i*N+j) i.e. row=i, col=j; transform expects (x=i, y=j)
    x.save(); x.transform(0, 1, 1, 0, 0, 0); x.drawImage(miniBase, 0, 0); x.restore();
    for (const o of objects) { if (o.gone || !explored[idx(Math.floor(o.x), Math.floor(o.y))]) continue; if (o.relic) { x.fillStyle = '#ffd36a'; x.fillRect(o.x - 1, o.y - 1, 2, 2); } else if (SPR[o.asset].category === 'building') { x.fillStyle = '#c8b090'; x.fillRect(o.x - 0.6, o.y - 0.6, 1.2, 1.2); } }
    x.fillStyle = Math.floor(time * 3) % 2 ? '#fff' : '#5fa0ff'; x.fillRect(player.x - 1.2, player.y - 1.2, 2.4, 2.4);
    // view frustum
    const z = zoom(), w2 = W / z / 2, h2 = H / z / 2, inv = (sx, sy) => [sy / (2 * HHp) + sx / (2 * HWp), sy / (2 * HHp) - sx / (2 * HWp)];
    const pts = [[cam.x - w2, cam.y - h2], [cam.x + w2, cam.y - h2], [cam.x + w2, cam.y + h2], [cam.x - w2, cam.y + h2]].map(p => inv(p[0], p[1]));
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 0.6; x.beginPath(); pts.forEach((p, n) => n ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.stroke();
  }

  // ================================================================== input
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys.add(k); if (k.startsWith('arrow')) e.preventDefault(); if (k === '+' || k === '=') setZoom(zi + 1); if (k === '-') setZoom(zi - 1); if (k === ' ' || k === 'c') cam.follow = true; });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  function setZoom(n) { zi = clamp(n, 0, ZOOMS.length - 1); }
  cv.addEventListener('wheel', e => { e.preventDefault(); wheelAcc += e.deltaY; if (Math.abs(wheelAcc) > 80) { setZoom(zi + (wheelAcc < 0 ? 1 : -1)); wheelAcc = 0; } }, { passive: false });
  let wheelAcc = 0;
  const ptrs = new Map(); let pinch = null, dragged = false;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); dragged = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zi }; } });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; const r = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; setZoom(pinch.z + Math.round(Math.log2(r) * 2)); dragged = true; return; }
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 10) { dragged = true; cam.follow = false; cam.x -= dx * dpr / zoom(); cam.y -= dy * dpr / zoom(); }
  });
  const endPtr = e => { const p = ptrs.get(e.pointerId); if (!p) return; if (!dragged && e.type === 'pointerup' && ptrs.size === 1) tap(p.x * dpr, p.y * dpr); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  function tap(px, py) {
    const z = zoom(), ax = (px - W / 2) / z + cam.x, ay = (py - H / 2) / z + cam.y;
    // find the front-most terrain point under the cursor: march s from front to back
    const c = ax / HWp; let hit = null;
    for (let s = (ay + MAXLV * ZPX) / HHp + 1; s > ay / HHp - 1; s -= 1 / 64) { const x = (s + c) / 2, y = (s - c) / 2; if (x < 0 || y < 0 || x >= N || y >= N) continue; const sy = s * HHp - hAt(x, y) * ZPX; if (sy <= ay) { hit = [x, y]; break; } }
    if (!hit || !explored[idx(Math.floor(hit[0]), Math.floor(hit[1]))]) return;
    let [tx, ty] = hit;
    if (!walkableAt(tx, ty)) { // walk next to the clicked object instead
      let best = null, bd = 9; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const x = Math.floor(tx) + a + 0.5, y = Math.floor(ty) + b + 0.5; if (walkableAt(x, y)) { const d = Math.hypot(x - player.x, y - player.y); if (d < bd) { bd = d; best = [x, y]; } } }
      if (!best) return; [tx, ty] = best;
    }
    const p = findPath(player, tx, ty); if (p) { player.path = p; marker = { x: tx, y: ty, t: 1 }; cam.follow = true; }
  }
  $('zin').onclick = () => setZoom(zi + 1); $('zout').onclick = () => setZoom(zi - 1); $('center').onclick = () => { cam.follow = true; };
  $('mini').addEventListener('pointerdown', e => {
    const r = e.currentTarget.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * 2 * N - N, my = (e.clientY - r.top) / r.height * N;
    const i = (my + mx / 2), j = (my - mx / 2); if (!inMap(Math.floor(i), Math.floor(j))) return;
    const [sx, sy] = toScreen(i, j); cam.x = sx; cam.y = sy; cam.follow = false; e.stopPropagation();
  });

  // ================================================================== boot
  (async function boot() {
    const bar = document.querySelector('#bar i');
    resize();
    await loadAssets(p => bar.style.width = (p * 60) + '%');
    $('lmsg').textContent = 'shaping the isles…'; await new Promise(r => setTimeout(r, 20));
    genWorld(1234);
    miniImg = miniBX.createImageData(N, N);
    player = addUnit('explorer', start[0] + 0.5, start[1] + 0.5, { ai: 'player' });
    const [sx, sy] = toScreen(player.x, player.y); cam.x = sx; cam.y = sy - 20;
    { // pick the zoom so roughly 640-1300 art pixels span the screen width
      const want = W / clamp(innerWidth * 1.6, 640, 1300); let best = 0;
      ZOOMS.forEach((zz, n) => { if (Math.abs(Math.log(zz / want)) < Math.abs(Math.log(ZOOMS[best] / want))) best = n; }); zi = best;
    }
    updateVision(true);
    // render the chunks around the start synchronously
    $('lmsg').textContent = 'painting terrain…'; await new Promise(r => setTimeout(r, 20));
    const z = zoom(), vl = cam.x - W / z / 2, vt = cam.y - H / z / 2;
    for (let cy = Math.floor(vt / CH) - 1; cy <= Math.floor((vt + H / z) / CH) + 1; cy++) for (let cx = Math.floor(vl / CH) - 1; cx <= Math.floor((vl + W / z) / CH) + 1; cx++) getChunk(cx, cy, true);
    bar.style.width = '100%';
    $('loading').style.display = 'none';
    message('Find the eight lost relics of the isles.');
    let last = performance.now();
    (function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); draw(); requestAnimationFrame(loop); })(last);
    window.GAME = { player, objects, units, sites, explored, revealAll: () => { explored.fill(1); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) miniPaint(i, j); miniDirty = true; }, cam, setZoom, get zi() { return zi; }, toScreen, chunks, type, TYPES };
    window.__ready = true;
  })().catch(e => { $('lmsg').textContent = 'Error: ' + e.message; console.error(e); });
})();
