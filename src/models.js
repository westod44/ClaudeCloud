/*
 * Asset model library (signed distance fields), all in world units: 1 unit = 1 tile.
 * The shapes are original designs. Only the rendering conventions follow the reference style.
 * Each factory returns { bounds, sdf, mat, m } for R3.render().
 */
(function (root) {
  const S = root.STYLE, PAL = root.PAL, N = root.NOISE;
  const { noise3, fbm3, hash, rng, clamp } = N;
  const hexf = h => PAL.hex(h).map(v => v / 255);
  const C = {}; for (const [k, h] of Object.entries(S.materials)) C[k] = hexf(h);
  const TEAM = {}; for (const [k, h] of Object.entries(S.playerColors)) TEAM[k] = hexf(h);
  const GLASS = hexf('#1b2330'), BIRCH = hexf('#e4dfd2'), MARBLE = hexf('#cfc8b6'), GLOWC = hexf('#ffe39a'), DARK = hexf('#2a2420');

  // ---------------------------------------------------------------- sdf kit
  const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
  const sph = (x, y, z, r) => len3(x, y, z) - r;
  function ell(x, y, z, a, b, c) { const k0 = len3(x / a, y / b, z / c), k1 = len3(x / (a * a), y / (b * b), z / (c * c)); return k0 * (k0 - 1) / (k1 || 1e-6); }
  function box(x, y, z, bx, by, bz, r = 0) {
    const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r;
    return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }
  function cap(x, y, z, ax, ay, az, bx, by, bz, r, r2) {
    const px = x - ax, py = y - ay, pz = z - az, ex = bx - ax, ey = by - ay, ez = bz - az;
    const h = clamp((px * ex + py * ey + pz * ez) / (ex * ex + ey * ey + ez * ez), 0, 1);
    return len3(px - ex * h, py - ey * h, pz - ez * h) - (r2 === undefined ? r : r + (r2 - r) * h);
  }
  function cylZ(x, y, z, r, h) { // base at z=0, height h
    const dx = Math.hypot(x, y) - r, dz = Math.abs(z - h / 2) - h / 2;
    return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  }
  function rcone(x, y, z, r1, r2, h) { // round cone along z: base radius r1 at 0, r2 at h
    const qx = Math.hypot(x, y), qy = z, b = (r1 - r2) / h, a = Math.sqrt(Math.max(0, 1 - b * b)), k = -b * qx + a * qy;
    if (k < 0) return Math.hypot(qx, qy) - r1; if (k > a * h) return Math.hypot(qx, qy - h) - r2; return qx * a + qy * b - r1;
  }
  function cone(x, y, z, r, h) { return tri2(Math.hypot(x, y), h - z, r, h); } // base radius r at z=0, apex at z=h
  function tri2(px, py, qx, qy) { // isosceles triangle, apex at origin, base at y=qy (iq)
    px = Math.abs(px);
    const t = clamp((px * qx + py * qy) / (qx * qx + qy * qy), 0, 1), ax = px - qx * t, ay = py - qy * t;
    const u = clamp(px / qx, 0, 1), bx = px - qx * u, by = py - qy;
    const s = -Math.sign(qy);
    const d1 = ax * ax + ay * ay, s1 = s * (px * qy - py * qx), d2 = bx * bx + by * by, s2 = s * (py - qy);
    const d = Math.min(d1, d2), sg = Math.min(s1, s2);
    return -Math.sqrt(d) * Math.sign(sg);
  }
  function prismX(x, y, z, L, w, h) { // triangular roof along x; base half-width w at z=0, apex at z=h
    const d2 = tri2(y, h - z, w, h), dx = Math.abs(x) - L;
    return Math.min(Math.max(d2, dx), 0) + Math.hypot(Math.max(d2, 0), Math.max(dx, 0));
  }
  function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

  // ---------------------------------------------------------------- materials
  const M = { BARK: 1, LEAF: 2, PINE: 3, BIRCH: 4, ROCK: 5, STONE: 6, PLASTER: 7, TIMBER: 8, THATCH: 9, SHINGLE: 10, WOOD: 11,
    CLOTH: 12, TEAM: 13, SKIN: 14, HAIR: 15, LEATHER: 16, METAL: 17, GOLD: 18, FUR: 19, WOOL: 20, FIRE: 21, GLOW: 22, WATER: 23,
    BERRY: 24, FLOWER: 25, CANVAS: 26, GLASS: 27, MARBLE: 28, WALL: 29, SAIL: 30, CONESHINGLE: 31, FURDARK: 32, DARK: 33, PALMBARK: 34, CLOTH2: 35 };
  const out = [0, 0, 0, 0, 0];
  function set(c, mul = 1, emit = 0, spec = 0) { out[0] = c[0] * mul; out[1] = c[1] * mul; out[2] = c[2] * mul; out[3] = emit; out[4] = spec; return out; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  const frac = v => v - Math.floor(v);

  function stoneBlocks(x, y, z, nx, ny, nz, base, bu = 0.15, bv = 0.075, seed = 3) {
    let u, v; if (Math.abs(nz) > 0.7) { u = x; v = y; } else if (Math.abs(nx) > Math.abs(ny)) { u = y; v = z; } else { u = x; v = z; }
    const row = Math.floor(v / bv), off = (row & 1) * 0.5, col = Math.floor(u / bu + off), fu = frac(u / bu + off), fv = frac(v / bv);
    if (fu < 0.07 || fv < 0.12) return set(base, 0.6);
    return set(base, (0.8 + 0.32 * hash(row, col, seed)) * (0.92 + 0.16 * noise3(x * 25, y * 25, z * 25, seed)));
  }

  function shade(m, x, y, z, nx, ny, nz, ctx) {
    switch (m) {
      case M.BARK: return set(ctx.barkColor || C.bark, 0.7 + 0.55 * noise3(x * 45, y * 45, z * 7, 5));
      case M.PALMBARK: return set(C.bark, (0.75 + 0.4 * noise3(x * 30, y * 30, z * 8, 5)) * (frac(z * 14) < 0.25 ? 0.75 : 1.1));
      case M.LEAF: {
        const n = fbm3(x * 6, y * 6, z * 6, ctx.seed || 1, 2), cl = noise3(x * 26, y * 26, z * 26, 9);
        const base = ctx.leafColor || C.leaf;
        return set(mixc(base, C.dryGrass, clamp((n - 0.55) * 1.4, 0, 0.45)), 0.86 + (n - 0.5) * 0.5 + (cl - 0.5) * 0.45);
      }
      case M.PINE: return set(C.pine, 0.72 + 0.5 * noise3(x * 35, y * 35, z * 12, 4));
      case M.BIRCH: return noise3(x * 12, y * 12, z * 30, 7) > 0.68 ? set(DARK, 1) : set(BIRCH, 0.85 + 0.2 * noise3(x * 30, y * 30, z * 30, 2));
      case M.ROCK: {
        const n = fbm3(x * 5, y * 5, z * 5, ctx.seed || 2, 3);
        if (nz > 0.55 && noise3(x * 7, y * 7, z * 7, 8) > 0.55) return set(mixc(C.leaf, C.grass, 0.5), 0.7 + 0.4 * n);
        return set(ctx.rockColor || C.rock, 0.68 + 0.6 * (n - 0.5) + 0.5 * (noise3(x * 30, y * 30, z * 30, 3) - 0.5) * 0.4 + 0.25);
      }
      case M.STONE: return stoneBlocks(x, y, z, nx, ny, nz, C.stone);
      case M.MARBLE: {
        if (z < 0.22 && noise3(x * 9, y * 9, z * 9, 4) > 0.5 + z * 1.2) return set(mixc(C.leaf, C.grass, 0.4), 0.8);
        return set(MARBLE, 0.82 + 0.25 * fbm3(x * 8, y * 8, z * 8, 6, 2));
      }
      case M.PLASTER: return set(C.plaster, (0.88 + 0.2 * fbm3(x * 6, y * 6, z * 6, 3, 2)) * (z < 0.25 ? 0.8 + z * 0.8 : 1));
      case M.TIMBER: return set(C.timber, 0.8 + 0.35 * noise3(x * 4, y * 4, z * 50, 1));
      case M.THATCH: return set(C.thatch, (0.7 + 0.4 * noise3(x * 70, y * 70, z * 9, 11)) * (frac(z * 13) < 0.18 ? 0.82 : 1));
      case M.SHINGLE: {
        const row = Math.floor(z * 24), off = (row & 1) * 0.5, c = Math.floor(x * 12 + off), fv = frac(z * 24), fu = frac(x * 12 + off);
        if (fv < 0.2 || fu < 0.08) return set(C.shingle, 0.55);
        return set(C.shingle, 0.82 + 0.35 * hash(row, c, 4));
      }
      case M.CONESHINGLE: {
        const a = Math.atan2(y, x) / (Math.PI * 2) + 0.5, row = Math.floor(z * 22), off = (row & 1) * 0.5, c = Math.floor(a * 26 + off);
        if (frac(z * 22) < 0.2 || frac(a * 26 + off) < 0.1) return set(C.shingle, 0.55);
        return set(C.shingle, 0.82 + 0.35 * hash(row, c, 8));
      }
      case M.WOOD: {
        const p = Math.floor(z * 22 + x * 0.01), fv = frac(z * 22);
        return set(ctx.woodColor || C.wood, (fv < 0.12 ? 0.6 : 0.85 + 0.25 * hash(p, 0, 6)) * (0.9 + 0.2 * noise3(x * 3, y * 3, z * 60, 2)));
      }
      case M.CLOTH: return set(ctx.clothColor || C.cloth, 0.86 + 0.24 * noise3(x * 25, y * 25, z * 25, 1));
      case M.CLOTH2: return set(ctx.cloth2Color || C.leather, 0.86 + 0.24 * noise3(x * 25, y * 25, z * 25, 1));
      case M.TEAM: return set(TEAM[ctx.team || 'blue'], 0.9 + 0.2 * noise3(x * 25, y * 25, z * 25, 1));
      case M.SKIN: return set(C.skin, 1);
      case M.HAIR: return set(ctx.hairColor || C.hair, 0.9 + 0.2 * noise3(x * 60, y * 60, z * 60, 2));
      case M.LEATHER: return set(C.leather, 0.85 + 0.25 * noise3(x * 30, y * 30, z * 30, 3));
      case M.METAL: return set(C.metal, 0.9, 0, S.lighting.specular.metal);
      case M.GOLD: return set(C.gold, 1.08, 0, S.lighting.specular.gold);
      case M.FUR: return (nz < -0.3 && z > 0.22 && z < 0.36) ? set(C.wool, 0.95) : set(C.fur, 0.85 + 0.25 * noise3(x * 50, y * 50, z * 50, 5));
      case M.FURDARK: return set(mixc(C.fur, DARK, 0.55), 0.95);
      case M.WOOL: return set(C.wool, 0.78 + 0.32 * noise3(x * 45, y * 45, z * 45, 6));
      case M.FIRE: { const t = clamp((z - 0.05) / 0.32, 0, 1); return set(mixc(hexf('#fff3b0'), hexf('#e2461c'), t), 1, 1); }
      case M.GLOW: return set(GLOWC, 1, 1);
      case M.WATER: return set(C.deep, 1.1, 0, S.lighting.specular.water);
      case M.BERRY: return set(C.berry, 1, 0, 0.3);
      case M.FLOWER: return set(ctx.flowerColor || C.flower, 1);
      case M.CANVAS: return (Math.floor((y + 1) * 9) & 1) ? set(C.canvasRed, 1) : set(C.plaster, 1.05);
      case M.SAIL: return (frac(x * 9) < 0.12 || frac(z * 9) < 0.12) ? set(C.timber, 1) : set(C.plaster, 0.95);
      case M.GLASS: return set(GLASS, 1, 0, 0.4);
      case M.DARK: return set(DARK, 1);
      default: return set([1, 0, 1]);
    }
  }
  function model(bounds, sdf, ctx = {}, matFn) {
    const mo = { bounds, m: 0 };
    mo.sdf = (x, y, z) => sdf(x, y, z, mo);
    mo.mat = matFn ? (m, x, y, z, nx, ny, nz) => matFn(m, x, y, z, nx, ny, nz, ctx) : (m, x, y, z, nx, ny, nz) => shade(m, x, y, z, nx, ny, nz, ctx);
    return mo;
  }

  // ================================================================ NATURE
  function oak(seed, o = {}) {
    const R = rng(seed), th = (o.birch ? 0.62 : 0.42) + R() * 0.12, cz = th + 0.4;
    const sc = o.birch ? 0.8 : 1;
    const blobs = [[0, 0, cz + 0.12, 0.3 * sc]];
    for (let k = 0; k < 11; k++) { const a = R() * Math.PI * 2, rr = (0.16 + R() * 0.17) * sc; blobs.push([Math.cos(a) * rr, Math.sin(a) * rr, cz + (R() - 0.45) * 0.34 * sc, (0.16 + R() * 0.1) * sc]); }
    const br = blobs.slice(1, 4);
    const leafColor = o.birch ? mixc(C.leaf, C.dryGrass, 0.3) : (o.dark ? mixc(C.leaf, C.pine, 0.4) : C.leaf);
    return model([-0.62, -0.62, 0, 0.62, 0.62, cz + 0.55], (x, y, z, mo) => {
      let d = rcone(x, y, z, o.birch ? 0.05 : 0.075, o.birch ? 0.03 : 0.045, th + 0.15), m = o.birch ? M.BIRCH : M.BARK;
      d = smin(d, ell(x, y, z - 0.01, 0.12, 0.12, 0.05), 0.05);
      for (const b of br) { const e = cap(x, y, z, 0, 0, th * 0.8, b[0] * 0.8, b[1] * 0.8, b[2] * 0.95, 0.03, 0.018); if (e < d) d = e; }
      if (z > th - 0.1) {
        let c = 1e9; for (const b of blobs) c = smin(c, sph(x - b[0], y - b[1], z - b[2], b[3]), 0.09);
        if (c < 0.14) c += (noise3(x * 10, y * 10, z * 10, seed) - 0.5) * 0.1 + (noise3(x * 26, y * 26, z * 26, seed + 1) - 0.5) * 0.045;
        if (c < d) { d = c; m = M.LEAF; }
      }
      mo.m = m; return d;
    }, { seed, leafColor });
  }
  function pine(seed) {
    const R = rng(seed), tiers = 5, hgt = 1.55 + R() * 0.25;
    return model([-0.5, -0.5, 0, 0.5, 0.5, hgt + 0.1], (x, y, z, mo) => {
      let d = rcone(x, y, z, 0.05, 0.03, hgt * 0.9), m = M.BARK;
      if (z > 0.25) {
        const ang = Math.atan2(y, x);
        for (let k = 0; k < tiers; k++) {
          const zb = 0.3 + k * (hgt - 0.65) / tiers, r = 0.45 - k * 0.075;
          let c = cone(x, y, z - zb, r, 0.52);
          if (c < 0.08) c += 0.022 * Math.sin(ang * 11 + k * 1.7) + (noise3(x * 18, y * 18, z * 18, seed + k) - 0.5) * 0.05;
          if (c < d) { d = c; m = M.PINE; }
        }
      }
      mo.m = m; return d;
    }, { seed });
  }
  function palm(seed) {
    const R = rng(seed), a0 = R() * Math.PI * 2, lean = 0.28, dx = Math.cos(a0) * lean, dy = Math.sin(a0) * lean;
    const P = t => [dx * t * t, dy * t * t, t * 1.35];
    const top = P(1), fronds = [];
    for (let f = 0; f < 8; f++) {
      const a = f / 8 * Math.PI * 2 + R() * 0.3, c = Math.cos(a), s = Math.sin(a), L = 0.55 + R() * 0.15;
      fronds.push([top, [top[0] + c * L * 0.4, top[1] + s * L * 0.4, top[2] + 0.1], [top[0] + c * L * 0.8, top[1] + s * L * 0.8, top[2] - 0.05], [top[0] + c * L, top[1] + s * L, top[2] - 0.25]]);
    }
    return model([-0.95, -0.95, 0, 0.95, 0.95, 1.6], (x, y, z, mo) => {
      let d = 1e9, m = M.PALMBARK;
      for (let i = 0; i < 6; i++) { const a = P(i / 6), b = P((i + 1) / 6); const e = cap(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], 0.055 - i * 0.003); if (e < d) d = e; }
      if (z > 1.0) {
        for (const fr of fronds) for (let i = 0; i < 3; i++) { const a = fr[i], b = fr[i + 1]; const e = cap(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], 0.045 - i * 0.012); if (e < d) { d = e; m = M.LEAF; } }
        for (let k = 0; k < 3; k++) { const a = k * 2.1; const e = sph(x - top[0] - Math.cos(a) * 0.05, y - top[1] - Math.sin(a) * 0.05, z - top[2] + 0.06, 0.045); if (e < d) { d = e; m = M.WOOD; } }
      }
      mo.m = m; return d;
    }, { seed, leafColor: mixc(C.leaf, C.grass, 0.5) });
  }
  function deadTree(seed) {
    const R = rng(seed), br = [];
    for (let k = 0; k < 6; k++) { const a = R() * Math.PI * 2, z0 = 0.4 + R() * 0.45, L = 0.2 + R() * 0.25; br.push([0, 0, z0, Math.cos(a) * L, Math.sin(a) * L, z0 + 0.15 + R() * 0.25]); }
    return model([-0.55, -0.55, 0, 0.55, 0.55, 1.25], (x, y, z, mo) => {
      let d = rcone(x, y, z, 0.07, 0.025, 1.1);
      d = smin(d, ell(x, y, z, 0.12, 0.12, 0.05), 0.05);
      for (const b of br) { const e = cap(x, y, z, b[0], b[1], b[2], b[3], b[4], b[5], 0.025, 0.008); if (e < d) d = e; }
      mo.m = M.BARK; return d;
    }, { seed, barkColor: mixc(C.bark, C.rock, 0.45) });
  }
  function bush(seed, berries) {
    const R = rng(seed), bl = [];
    for (let k = 0; k < 7; k++) { const a = R() * Math.PI * 2, rr = R() * 0.16; bl.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.08 + R() * 0.14, 0.1 + R() * 0.07]); }
    return model([-0.42, -0.42, 0, 0.42, 0.42, 0.5], (x, y, z, mo) => {
      let c = 1e9; for (const b of bl) c = smin(c, sph(x - b[0], y - b[1], z - b[2], b[3]), 0.07);
      if (c < 0.1) c += (noise3(x * 16, y * 16, z * 16, seed) - 0.5) * 0.07;
      mo.m = berries && c < 0.01 && noise3(x * 30, y * 30, z * 30, seed + 5) > 0.7 ? M.BERRY : M.LEAF; return c;
    }, { seed, leafColor: mixc(C.leaf, C.grassLush, 0.5) });
  }
  function boulder(seed, o = {}) {
    const R = rng(seed), a = 0.24 + R() * 0.1, b = 0.2 + R() * 0.08, c = 0.17 + R() * 0.08;
    return model([-0.5, -0.5, 0, 0.5, 0.5, 0.5], (x, y, z, mo) => {
      let d = ell(x, y, z - 0.1, a, b, c);
      if (d < 0.15) d += (fbm3(x * 3, y * 3, z * 3, seed, 2) - 0.5) * 0.2 + Math.abs(noise3(x * 8, y * 8, z * 8, seed + 3) - 0.5) * 0.06;
      mo.m = o.gold && noise3(x * 13, y * 13, z * 13, seed + 9) > 0.66 ? M.GOLD : M.ROCK; return d;
    }, { seed });
  }
  function rockCluster(seed, o = {}) {
    const R = rng(seed), rs = [];
    for (let k = 0; k < (o.n || 6); k++) { const a = R() * Math.PI * 2, rr = 0.1 + R() * 0.28, an = R() * Math.PI; rs.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.06 + R() * 0.06, 0.07 + R() * 0.06, 0.05 + R() * 0.04, 0.05 + R() * 0.05, Math.cos(an), Math.sin(an)]); }
    return model([-0.55, -0.55, 0, 0.55, 0.55, 0.35], (x, y, z, mo) => {
      let d = 1e9;
      for (const r of rs) { const lx = x - r[0], ly = y - r[1]; const u = lx * r[6] + ly * r[7], v = -lx * r[7] + ly * r[6]; const e = box(u, v, z - r[2], r[3], r[4], r[5], 0.025); if (e < d) d = e; }
      if (d < 0.05) d += (noise3(x * 20, y * 20, z * 20, seed) - 0.5) * 0.025;
      mo.m = o.gold && noise3(x * 15, y * 15, z * 15, seed + 2) > 0.6 ? M.GOLD : M.ROCK; return d;
    }, { seed, rockColor: o.gold ? mixc(C.rock, C.dirt, 0.4) : mixc(C.rock, C.stone, 0.5) });
  }
  function standingStone(seed) {
    const R = rng(seed), tilt = (R() - 0.5) * 0.25, ct = Math.cos(tilt), st = Math.sin(tilt), hh = 0.42 + R() * 0.15;
    return model([-0.4, -0.4, 0, 0.4, 0.4, hh * 2 + 0.2], (x, y, z, mo) => {
      const u = x * ct - z * st, w = x * st + z * ct;
      let d = box(u, y, w - hh, 0.13, 0.08, hh, 0.04);
      if (d < 0.1) d += (fbm3(x * 6, y * 6, z * 6, seed, 2) - 0.5) * 0.07;
      mo.m = M.ROCK; return d;
    }, { seed, rockColor: mixc(C.rock, C.stone, 0.3) });
  }
  function flowers(seed, color) {
    const R = rng(seed), st = [];
    for (let k = 0; k < 11; k++) { const a = R() * Math.PI * 2, rr = R() * 0.25; st.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.07 + R() * 0.08]); }
    return model([-0.32, -0.32, 0, 0.32, 0.32, 0.2], (x, y, z, mo) => {
      let d = 1e9, m = M.LEAF;
      for (const s of st) {
        const e = cap(x, y, z, s[0], s[1], 0, s[0], s[1], s[2], 0.007); if (e < d) { d = e; m = M.LEAF; }
        const f = sph(x - s[0], y - s[1], z - s[2], 0.024); if (f < d) { d = f; m = M.FLOWER; }
      }
      mo.m = m; return d;
    }, { seed, flowerColor: hexf(color), leafColor: C.grass });
  }
  function grassTuft(seed, dry) {
    const R = rng(seed), bl = [];
    for (let k = 0; k < 16; k++) { const a = R() * Math.PI * 2, rr = R() * 0.08, h = 0.09 + R() * 0.1, lean = 0.04 + R() * 0.05; bl.push([Math.cos(a) * rr, Math.sin(a) * rr, Math.cos(a) * (rr + lean), Math.sin(a) * (rr + lean), h]); }
    return model([-0.25, -0.25, 0, 0.25, 0.25, 0.22], (x, y, z, mo) => {
      let d = 1e9; for (const b of bl) { const e = cap(x, y, z, b[0], b[1], 0, b[2], b[3], b[4], 0.012, 0.003); if (e < d) d = e; }
      mo.m = M.LEAF; return d;
    }, { seed, leafColor: dry ? C.dryGrass : mixc(C.grass, C.leaf, 0.5) });
  }
  function reeds(seed) {
    const R = rng(seed), bl = [];
    for (let k = 0; k < 12; k++) { const a = R() * Math.PI * 2, rr = R() * 0.14, h = 0.28 + R() * 0.2; bl.push([Math.cos(a) * rr, Math.sin(a) * rr, Math.cos(a) * (rr + 0.04), Math.sin(a) * (rr + 0.04), h, R() < 0.5]); }
    return model([-0.3, -0.3, 0, 0.3, 0.3, 0.55], (x, y, z, mo) => {
      let d = 1e9, m = M.LEAF;
      for (const b of bl) {
        const e = cap(x, y, z, b[0], b[1], 0, b[2], b[3], b[4], 0.008, 0.004); if (e < d) { d = e; m = M.LEAF; }
        if (b[5]) { const f = cap(x, y, z, b[2], b[3], b[4] - 0.09, b[2], b[3], b[4] - 0.02, 0.017); if (f < d) { d = f; m = M.LEATHER; } }
      }
      mo.m = m; return d;
    }, { seed, leafColor: mixc(C.grass, C.dryGrass, 0.4) });
  }

  // ================================================================ BUILDINGS (footprint centred on origin)
  function cottage(variant) {
    const roofM = variant === 1 ? M.SHINGLE : M.THATCH;
    const wallMat = (m, x, y, z, nx, ny, nz, ctx) => {
      if (m !== M.WALL) return shade(m, x, y, z, nx, ny, nz, ctx);
      const longSide = Math.abs(ny) > 0.5, gable = Math.abs(nx) > 0.5;
      // openings
      if (longSide && ny > 0) {
        if (Math.abs(x + 0.2) < 0.1 && z < 0.5) return Math.abs(x + 0.2) > 0.085 || z > 0.485 ? shade(M.TIMBER, x, y, z, nx, ny, nz, ctx) : shade(M.WOOD, x, y, z, nx, ny, nz, { woodColor: mixc(C.wood, C.timber, 0.4) });
        if (Math.abs(x - 0.3) < 0.075 && z > 0.48 && z < 0.62) return Math.abs(x - 0.3) > 0.06 || z < 0.495 || z > 0.605 ? shade(M.TIMBER, x, y, z, nx, ny, nz, ctx) : set(GLASS, 1);
      }
      if (gable && nx > 0 && Math.abs(y) < 0.075 && z > 0.48 && z < 0.62) return Math.abs(y) > 0.06 || z < 0.495 || z > 0.605 ? shade(M.TIMBER, x, y, z, nx, ny, nz, ctx) : set(GLASS, 1);
      if (variant === 1) return shade(M.WOOD, x, y, z, nx, ny, nz, ctx);
      // timber framing
      const beam = (longSide && Math.abs(x) > 0.6) || (gable && Math.abs(y) > 0.4) || Math.abs(z - 0.44) < 0.022 || (z > 0.69 && z < 0.73) || z < 0.16;
      const stud = longSide && (Math.abs(x + 0.32) < 0.02 || Math.abs(x) < 0.02 || Math.abs(x - 0.32) < 0.02 || Math.abs(x - 0.6) < 0.02);
      const brace = longSide && x > 0.02 && x < 0.3 && z < 0.44 && Math.abs((x - 0.02) * 1.05 - (z - 0.17)) < 0.02;
      const gableBeam = gable && z > 0.72 && Math.abs(y) < 0.02;
      if (beam || stud || brace || gableBeam) return shade(M.TIMBER, x, y, z, nx, ny, nz, ctx);
      return shade(M.PLASTER, x, y, z, nx, ny, nz, ctx);
    };
    return model([-0.9, -0.75, 0, 0.9, 0.75, 1.32], (x, y, z, mo) => {
      let d = box(x, y, z - 0.06, 0.69, 0.51, 0.06, 0.01), m = M.STONE;
      let e = box(x, y, z - 0.42, 0.64, 0.46, 0.3); if (e < d) { d = e; m = M.WALL; }
      e = prismX(x, y, z - 0.72, 0.64, 0.46, 0.38); if (e < d) { d = e; m = M.WALL; }
      const outer = prismX(x, y, z - 0.68, 0.76, 0.62, 0.5), inner = prismX(x, y, z - 0.63, 0.9, 0.55, 0.46);
      e = Math.max(outer, -inner); if (e < d) { d = e; m = roofM; }
      e = box(x - 0.36, y - 0.22, z - 0.95, 0.07, 0.07, 0.3, 0.01); if (e < d) { d = e; m = M.STONE; }
      mo.m = m; return d;
    }, {}, wallMat);
  }
  function watchtower(team) {
    const towerMat = (m, x, y, z, nx, ny, nz, ctx) => {
      if (m === M.STONE) {
        if (ny > 0.5 && Math.abs(x) < 0.12 && z < 0.42) return Math.abs(x) > 0.1 || z > 0.4 ? set(C.stone, 0.75) : shade(M.WOOD, x, y, z, nx, ny, nz, { woodColor: mixc(C.wood, C.timber, 0.4) });
        if ((nx > 0.5 && Math.abs(y) < 0.025 || ny > 0.5 && Math.abs(x) < 0.025) && z > 1.1 && z < 1.38) return set(GLASS, 0.6);
        return stoneBlocks(x, y, z, nx, ny, nz, C.stone, 0.13, 0.07, 5);
      }
      return shade(m, x, y, z, nx, ny, nz, ctx);
    };
    return model([-0.62, -0.62, 0, 0.62, 0.62, 3.1], (x, y, z, mo) => {
      const hb = 0.36 - z * 0.022;
      let d = box(x, y, z - 0.9, hb, hb, 0.9, 0.01), m = M.STONE;
      let e = box(x, y, z - 1.86, 0.45, 0.45, 0.06); if (e < d) { d = e; m = M.WOOD; }
      if (z > 1.8) {
        for (const sx of [-0.41, 0.41]) for (const sy of [-0.41, 0.41]) { e = box(x - sx, y - sy, z - 2.07, 0.03, 0.03, 0.17); if (e < d) { d = e; m = M.TIMBER; } }
        e = Math.min(box(x, Math.abs(y) - 0.41, z - 2.0, 0.43, 0.015, 0.015), box(Math.abs(x) - 0.41, y, z - 2.0, 0.015, 0.43, 0.015)); if (e < d) { d = e; m = M.TIMBER; }
        e = cone(x, y, z - 2.2, 0.58, 0.62); if (e < d) { d = e; m = M.CONESHINGLE; }
        e = cap(x, y, z, 0, 0, 2.7, 0, 0, 3.05, 0.012); if (e < d) { d = e; m = M.TIMBER; }
        e = box(x - 0.11, y, z - 2.94, 0.1, 0.006, 0.06); if (e < d) { d = e; m = M.TEAM; }
      }
      mo.m = m; return d;
    }, { team }, towerMat);
  }
  function well() {
    return model([-0.45, -0.45, 0, 0.45, 0.45, 1.05], (x, y, z, mo) => {
      let d = Math.max(cylZ(x, y, z, 0.3, 0.28), -cylZ(x, y, z - 0.05, 0.21, 0.5)), m = M.STONE;
      let e = cylZ(x, y, z, 0.22, 0.2); if (e < d) { d = e; m = M.WATER; }
      e = Math.min(box(x, y - 0.27, z - 0.42, 0.03, 0.03, 0.42), box(x, y + 0.27, z - 0.42, 0.03, 0.03, 0.42)); if (e < d) { d = e; m = M.TIMBER; }
      e = cap(x, y, z, 0, -0.31, 0.74, 0, 0.31, 0.74, 0.025); if (e < d) { d = e; m = M.TIMBER; }
      e = prismX(y, x, z - 0.8, 0.38, 0.24, 0.2); if (e < d) { d = e; m = M.SHINGLE; }
      e = cap(x, y, z, 0, 0, 0.74, 0, 0, 0.5, 0.005); if (e < d) { d = e; m = M.LEATHER; }
      e = cylZ(x, y, z - 0.42, 0.05, 0.08); if (e < d) { d = e; m = M.WOOD; }
      mo.m = m; return d;
    });
  }
  function stall() {
    const fruit = []; const R = rng(77);
    for (let k = 0; k < 9; k++) fruit.push([-0.28 + R() * 0.5, -0.05 + R() * 0.2, R() < 0.5 ? M.BERRY : M.FLOWER]);
    return model([-0.6, -0.55, 0, 0.6, 0.55, 1.0], (x, y, z, mo) => {
      let d = 1e9, m = M.TIMBER, e;
      for (const sx of [-0.4, 0.4]) for (const sy of [-0.32, 0.32]) { e = box(x - sx, y - sy, z - 0.42, 0.025, 0.025, 0.42); if (e < d) { d = e; m = M.TIMBER; } }
      e = box(x, y, z - (0.86 - 0.12 * x), 0.48, 0.4, 0.012) * 0.9; if (e < d) { d = e; m = M.CANVAS; }
      e = box(x, y - 0.05, z - 0.38, 0.36, 0.2, 0.025); if (e < d) { d = e; m = M.WOOD; }
      e = box(x, y - 0.05, z - 0.18, 0.33, 0.17, 0.17); if (e < d) { d = e; m = M.WOOD; }
      for (const f of fruit) { e = sph(x - f[0], y - f[1], z - 0.44, 0.035); if (e < d) { d = e; m = f[2]; } }
      e = box(x - 0.28, y - 0.36, z - 0.1, 0.1, 0.1, 0.1, 0.01); if (e < d) { d = e; m = M.WOOD; }
      e = cylZ(x + 0.32, y - 0.34, z, 0.1, 0.27); if (e < d) { d = e; m = (Math.abs(z - 0.06) < 0.015 || Math.abs(z - 0.21) < 0.015) ? M.METAL : M.WOOD; }
      mo.m = m; return d;
    }, { flowerColor: hexf('#e8a23a') });
  }
  function windmill(rot = 0) {
    const S2 = Math.SQRT1_2, H = [0.335, 0.335, 1.5];
    const arms = [0, 1, 2, 3].map(k => { const t = Math.PI / 4 + k * Math.PI / 2 + rot, c = Math.cos(t), s = Math.sin(t); return { u: [S2 * c, -S2 * c, s], w: [-S2 * s, S2 * s, c] }; });
    const F = [S2, S2, 0];
    const mat = (m, x, y, z, nx, ny, nz, ctx) => {
      if (m === M.PLASTER && z < 0.3) return stoneBlocks(x, y, z, nx, ny, nz, C.stone);
      if (m === M.PLASTER && ny > 0.3 && nx > 0.3 && Math.abs(x - y) < 0.12 && z < 0.55) return shade(M.WOOD, x, y, z, nx, ny, nz, { woodColor: mixc(C.wood, C.timber, 0.4) });
      return shade(m, x, y, z, nx, ny, nz, ctx);
    };
    return model([-1.12, -1.12, 0, 1.12, 1.12, 2.6], (x, y, z, mo) => {
      let d = rcone(x, y, z, 0.55, 0.38, 1.45), m = M.PLASTER;
      let e = cone(x, y, z - 1.42, 0.5, 0.55); if (e < d) { d = e; m = M.THATCH; }
      e = cap(x, y, z, 0.2, 0.2, 1.5, H[0], H[1], H[2], 0.04); if (e < d) { d = e; m = M.TIMBER; }
      if (z > 0.4) {
        const px = x - H[0], py = y - H[1], pz = z - H[2];
        for (const a of arms) {
          const au = px * a.u[0] + py * a.u[1] + pz * a.u[2], aw = px * a.w[0] + py * a.w[1] + pz * a.w[2], af = px * F[0] + py * F[1];
          e = cap(au, aw, af, 0, 0, 0, 1.0, 0, 0, 0.018); if (e < d) { d = e; m = M.TIMBER; }
          e = box(au - 0.58, aw - 0.09, af, 0.38, 0.075, 0.008); if (e < d) { d = e; m = M.SAIL; mo.su = au; mo.sw = aw; }
        }
      }
      mo.m = m; return d;
    }, {}, (m, x, y, z, nx, ny, nz, ctx) => m === M.SAIL ? ((frac(x * 7 + y * 7) < 0.1 || frac(z * 9) < 0.12) ? set(C.timber, 1) : set(C.plaster, 0.95)) : mat(m, x, y, z, nx, ny, nz, ctx));
  }
  function campfire(frame) {
    const st = []; for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; st.push([Math.cos(a) * 0.2, Math.sin(a) * 0.2]); }
    const ph = frame / 6 * Math.PI * 2;
    return model([-0.3, -0.3, 0, 0.3, 0.3, 0.55], (x, y, z, mo) => {
      let d = 1e9, m = M.ROCK, e;
      for (const s of st) { e = sph(x - s[0], y - s[1], z - 0.025, 0.055); if (e < d) { d = e; m = M.ROCK; } }
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; e = cap(x, y, z, Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.03, -Math.cos(a) * 0.04, -Math.sin(a) * 0.04, 0.12, 0.03); if (e < d) { d = e; m = M.BARK; } }
      for (let k = 0; k < 3; k++) {
        const ox = Math.cos(k * 2.1 + ph * 0.5) * 0.04, oy = Math.sin(k * 2.1 + ph * 0.5) * 0.04, h = 0.28 + 0.07 * Math.sin(ph + k * 2);
        e = rcone(x - ox, y - oy, z - 0.06, 0.07, 0.004, h);
        if (e < 0.06) e += (noise3(x * 14, y * 14, z * 9 - ph, k) - 0.5) * 0.06;
        if (e < d) { d = e; m = M.FIRE; }
      }
      mo.m = m; return d;
    });
  }
  function signpost() {
    return model([-0.35, -0.35, 0, 0.35, 0.35, 0.9], (x, y, z, mo) => {
      let d = cylZ(x, y, z, 0.03, 0.85), m = M.TIMBER;
      let e = box(x - 0.12, y, z - 0.72, 0.16, 0.012, 0.045, 0.006); if (e < d) { d = e; m = M.WOOD; }
      const c = Math.cos(1.2), s = Math.sin(1.2), u = x * c + y * s, v = -x * s + y * c;
      e = box(u + 0.1, v, z - 0.57, 0.14, 0.012, 0.04, 0.006); if (e < d) { d = e; m = M.WOOD; }
      mo.m = m; return d;
    });
  }
  function chest() {
    return model([-0.25, -0.2, 0, 0.25, 0.2, 0.32], (x, y, z, mo) => {
      let d = box(x, y, z - 0.09, 0.17, 0.11, 0.09, 0.012), m = M.WOOD;
      let e = Math.max(Math.hypot(y, z - 0.17) - 0.11, Math.abs(x) - 0.17, -(z - 0.17)); if (e < d) { d = e; m = M.WOOD; }
      mo.m = m; return d;
    }, {}, (m, x, y, z, nx, ny, nz, ctx) => {
      if (Math.abs(Math.abs(x) - 0.12) < 0.018) return set(C.metal, 0.9, 0, 0.6);
      if (Math.abs(x) < 0.03 && z > 0.12 && z < 0.2 && (ny > 0.4 || nx > 0.4)) return set(C.gold, 1.05, 0, 0.9);
      return shade(M.WOOD, x, y, z, nx, ny, nz, { woodColor: mixc(C.wood, C.timber, 0.25) });
    });
  }
  function shrine(lit) {
    return model([-0.36, -0.36, 0, 0.36, 0.36, 0.92], (x, y, z, mo) => {
      let d = box(x, y, z - 0.04, 0.3, 0.3, 0.04, 0.01), m = M.MARBLE, e;
      e = box(x, y, z - 0.12, 0.22, 0.22, 0.04, 0.01); if (e < d) d = e;
      e = cylZ(x, y, z - 0.15, 0.085 - 0.006 * Math.max(0, Math.cos(Math.atan2(y, x) * 10)), 0.44); if (e < d) d = e;
      e = box(x, y, z - 0.6, 0.13, 0.13, 0.025, 0.005); if (e < d) d = e;
      for (const sx of [-0.05, 0.05]) for (const sy of [-0.05, 0.05]) { e = box(x - sx, y - sy, z - 0.7, 0.008, 0.008, 0.07); if (e < d) { d = e; m = M.GOLD; } }
      e = rcone(x, y, z - 0.77, 0.075, 0.005, 0.1); if (e < d) { d = e; m = M.GOLD; }
      e = sph(x, y, z - 0.7, 0.042); if (e < d) { d = e; m = lit ? M.GLOW : M.GLASS; }
      mo.m = m; return d;
    });
  }

  // ================================================================ RUINS
  function brokenColumn(seed) {
    const R = rng(seed), h = 0.45 + R() * 0.55, sl = (R() - 0.5) * 0.4;
    return model([-0.4, -0.4, 0, 0.4, 0.4, h + 0.2], (x, y, z, mo) => {
      const rr = 0.12 - 0.012 * Math.max(0, Math.cos(Math.atan2(y, x) * 12));
      const top = h + (noise3(x * 9, y * 9, 0.5, seed) - 0.5) * 0.18 + x * sl;
      let d = Math.max(Math.hypot(x, y) - rr, z - top, -z);
      d = Math.min(d, box(x, y, z - 0.05, 0.18, 0.18, 0.05, 0.01));
      d = Math.min(d, box(x - 0.24, y + 0.15, z - 0.04, 0.07, 0.05, 0.04, 0.015));
      mo.m = M.MARBLE; return d;
    }, { seed });
  }
  function fallenColumn(seed) {
    const R = rng(seed), a = R() * Math.PI, c = Math.cos(a), s = Math.sin(a);
    return model([-0.75, -0.75, 0, 0.75, 0.75, 0.3], (x, y, z, mo) => {
      const u = x * c + y * s, v = -x * s + y * c;
      const seg = Math.abs(u - 0.05) < 0.02 ? 1 : 0;
      let d = Math.max(Math.hypot(v, z - 0.11) - 0.11, Math.abs(u) - 0.6);
      if (seg) d = Math.max(d, 0.02 - Math.abs(u - 0.05));
      mo.m = M.MARBLE; return d;
    }, { seed });
  }
  function ruinWall(seed) {
    const R = rng(seed);
    return model([-0.95, -0.25, 0, 0.95, 0.25, 0.8], (x, y, z, mo) => {
      let top = 0.3 + 0.48 * N.fbm2(x * 2 + 5, seed, 1e4, seed, 3);
      top = Math.floor(top / 0.075) * 0.075 + 0.0001;
      let d = Math.max(box(x, y, z - 0.4, 0.85, 0.11, 0.4), z - top);
      d = Math.max(d, -box(x - 0.32, y, z - 0.38, 0.11, 0.2, 0.13));
      d = Math.min(d, box(x + 0.6, y - 0.22, z - 0.04, 0.08, 0.06, 0.04, 0.01));
      mo.m = M.STONE; return d;
    }, { seed });
  }
  function ruinArch() {
    return model([-0.75, -0.3, 0, 0.75, 0.3, 1.55], (x, y, z, mo) => {
      let d = box(x + 0.44, y, z - 0.52, 0.11, 0.13, 0.52, 0.01);
      d = Math.min(d, Math.max(box(x - 0.44, y, z - 0.38, 0.11, 0.13, 0.38, 0.01), z - 0.6 - (noise3(x * 9, y * 9, 1, 3) - 0.5) * 0.3));
      const q = Math.hypot(x, z - 1.0) - 0.44;
      let arch = Math.max(Math.abs(q) - 0.1, Math.abs(y) - 0.13, -(z - 1.0));
      arch = Math.max(arch, x - 0.12 - (noise3(z * 8, y * 8, 2, 4) - 0.5) * 0.2);
      d = Math.min(d, arch);
      d = Math.min(d, box(x - 0.3, y - 0.2, z - 0.05, 0.07, 0.05, 0.05, 0.01), box(x - 0.55, y + 0.15, z - 0.04, 0.05, 0.08, 0.04, 0.01));
      mo.m = M.STONE; return d;
    });
  }

  // ================================================================ UNITS (local +x = facing)
  function human(phase, o = {}) {
    const walk = phase !== null, ph = walk ? phase : 0;
    const sw = walk ? Math.sin(ph) : 0, bob = walk ? Math.abs(Math.sin(ph)) * 0.012 : 0;
    const legs = [[0.045, sw], [-0.045, -sw]].map(([ly, s]) => {
      const fx = s * 0.085, lift = walk ? Math.max(0, Math.cos(ph + (ly > 0 ? 0 : Math.PI))) * 0.035 : 0;
      return { hip: [0, ly, 0.3 + bob], knee: [fx * 0.5 + 0.02, ly, 0.16 + lift * 0.6], foot: [fx, ly, 0.035 + lift] };
    });
    const arms = [[0.105, -sw], [-0.105, sw]].map(([ay, s]) => ({ sh: [0, ay, 0.46 + bob], el: [s * 0.04, ay * 1.08, 0.37 + bob], hand: [s * 0.075 + 0.02, ay * 1.08, 0.3 + bob] }));
    const tunic = o.team ? M.TEAM : M.CLOTH;
    const hatted = o.hat !== false;
    return model([-0.22, -0.22, 0, 0.22, 0.22, 0.68], (x, y, z, mo) => {
      let d = 1e9, m = M.CLOTH2, e;
      for (const L of legs) {
        e = cap(x, y, z, L.hip[0], L.hip[1], L.hip[2], L.knee[0], L.knee[1], L.knee[2], 0.034, 0.03); if (e < d) { d = e; m = M.CLOTH2; }
        e = cap(x, y, z, L.knee[0], L.knee[1], L.knee[2], L.foot[0], L.foot[1], L.foot[2] + 0.02, 0.03, 0.027); if (e < d) { d = e; m = M.CLOTH2; }
        e = ell(x - L.foot[0] - 0.02, y - L.foot[1], z - L.foot[2], 0.05, 0.03, 0.03); if (e < d) { d = e; m = M.LEATHER; }
      }
      e = rcone(x + 0.005, y, z - 0.25 - bob, 0.088, 0.078, 0.24); if (e < d) { d = e; m = tunic; }
      e = cylZ(x, y, z - 0.31 - bob, 0.09, 0.03); if (e < d) { d = e; m = M.LEATHER; }
      if (o.pack !== false) { e = box(x + 0.085, y, z - 0.42 - bob, 0.035, 0.065, 0.075, 0.02); if (e < d) { d = e; m = M.LEATHER; } }
      for (const A of arms) {
        e = cap(x, y, z, A.sh[0], A.sh[1], A.sh[2], A.el[0], A.el[1], A.el[2], 0.029, 0.026); if (e < d) { d = e; m = tunic; }
        e = cap(x, y, z, A.el[0], A.el[1], A.el[2], A.hand[0], A.hand[1], A.hand[2], 0.025, 0.022); if (e < d) { d = e; m = tunic; }
        e = sph(x - A.hand[0], y - A.hand[1], z - A.hand[2], 0.024); if (e < d) { d = e; m = M.SKIN; }
      }
      e = sph(x, y, z - 0.545 - bob, 0.056); if (e < d) { d = e; m = M.SKIN; }
      e = sph(x + 0.012, y, z - 0.56 - bob, 0.056); if (e < d) { d = e; m = M.HAIR; }
      if (hatted) {
        e = cylZ(x, y, z - 0.585 - bob, 0.1, 0.012); if (e < d) { d = e; m = M.LEATHER; }
        e = rcone(x, y, z - 0.59 - bob, 0.056, 0.046, 0.05); if (e < d) { d = e; m = M.LEATHER; }
      }
      if (o.lantern) { const h = arms[0].hand; e = box(x - h[0], y - h[1], z - h[2] + 0.06, 0.02, 0.02, 0.032, 0.006); if (e < d) { d = e; m = M.GLOW; } }
      mo.m = m; return d;
    }, { team: o.team, clothColor: o.cloth ? hexf(o.cloth) : null, cloth2Color: o.trousers ? hexf(o.trousers) : null, hairColor: o.hair ? hexf(o.hair) : null },
    (m, x, y, z, nx, ny, nz, ctx) => {
      if (m === M.HAIR && !hatted && nx > 0.35 && z < 0.575) return shade(M.SKIN, x, y, z, nx, ny, nz, ctx); // face of hatless villagers
      if (m === M.HAIR && hatted && nx > 0.2) return shade(M.SKIN, x, y, z, nx, ny, nz, ctx);
      return shade(m, x, y, z, nx, ny, nz, ctx);
    });
  }
  function quadruped(phase, kind) {
    const deer = kind === 'deer', walk = phase !== null, ph = walk ? phase : 0, graze = !walk;
    const bz = deer ? 0.34 : 0.24, bx = deer ? 0.19 : 0.15, legX = deer ? 0.12 : 0.09;
    const legs = [[legX, 0.045, 0], [legX, -0.045, Math.PI], [-legX, 0.045, Math.PI], [-legX, -0.045, 0]].map(([lx, ly, off]) => {
      const s = walk ? Math.sin(ph + off) * 0.07 : 0, lift = walk ? Math.max(0, Math.cos(ph + off)) * 0.035 : 0;
      return { top: [lx, ly, bz - 0.03], knee: [lx + s * 0.5, ly, bz * 0.5 + lift], hoof: [lx + s, ly, 0.012 + lift] };
    });
    const neckTop = deer ? (graze ? [0.3, 0, 0.16] : [0.25, 0, 0.53]) : (graze ? [0.24, 0, 0.12] : [0.22, 0, 0.32]);
    const head = deer ? (graze ? [0.33, 0, 0.1] : [0.29, 0, 0.55]) : (graze ? [0.27, 0, 0.08] : [0.25, 0, 0.32]);
    return model([-0.34, -0.34, 0, 0.34, 0.34, deer ? 0.78 : 0.45], (x, y, z, mo) => {
      let d, m, e;
      if (deer) { d = ell(x, y, z - bz, bx, 0.075, 0.085); d = smin(d, ell(x - 0.11, y, z - bz - 0.01, 0.09, 0.07, 0.09), 0.05); m = M.FUR; }
      else { d = ell(x, y, z - bz, bx, 0.1, 0.1); if (d < 0.05) d += (noise3(x * 30, y * 30, z * 30, 3) - 0.5) * 0.03; m = M.WOOL; }
      e = cap(x, y, z, bx * 0.75, 0, bz + 0.02, neckTop[0], neckTop[1], neckTop[2], deer ? 0.035 : 0.04, deer ? 0.028 : 0.035); if (e < d) { d = e; m = deer ? M.FUR : M.WOOL; }
      const hx = x - head[0], hz = z - head[2];
      e = deer ? ell(hx, y, hz, 0.055, 0.03, 0.032) : ell(hx, y, hz, 0.055, 0.032, 0.036); if (e < d) { d = e; m = deer ? M.FUR : M.FURDARK; }
      e = ell(hx - 0.045, y, hz - 0.012, 0.03, 0.02, 0.02); if (e < d) { d = e; m = deer ? M.FURDARK : M.FURDARK; }
      e = Math.min(ell(hx + 0.01, y - 0.035, hz + (deer ? 0.04 : 0.0), 0.012, 0.025, 0.012), ell(hx + 0.01, y + 0.035, hz + (deer ? 0.04 : 0.0), 0.012, 0.025, 0.012)); if (e < d) { d = e; m = deer ? M.FUR : M.FURDARK; }
      if (deer) {
        for (const sy of [-1, 1]) {
          const a = [head[0] - 0.01, sy * 0.02, head[2] + 0.03], b = [head[0] - 0.04, sy * 0.07, head[2] + 0.15], c = [head[0] - 0.08, sy * 0.06, head[2] + 0.22];
          e = Math.min(cap(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], 0.008), cap(x, y, z, b[0], b[1], b[2], c[0], c[1], c[2], 0.007), cap(x, y, z, b[0], b[1], b[2], b[0] + 0.05, b[1] + sy * 0.02, b[2] + 0.06, 0.006));
          if (e < d) { d = e; m = M.WOOD; }
        }
        e = ell(x + bx + 0.01, y, z - bz - 0.04, 0.025, 0.02, 0.035); if (e < d) { d = e; m = M.WOOL; }
      }
      for (const L of legs) {
        e = cap(x, y, z, L.top[0], L.top[1], L.top[2], L.knee[0], L.knee[1], L.knee[2], deer ? 0.024 : 0.022, 0.016); if (e < d) { d = e; m = deer ? M.FUR : M.FURDARK; }
        e = cap(x, y, z, L.knee[0], L.knee[1], L.knee[2], L.hoof[0], L.hoof[1], L.hoof[2], 0.014, 0.011); if (e < d) { d = e; m = M.FURDARK; }
      }
      mo.m = m; return d;
    });
  }

  root.MODELS = {
    M, shade,
    oak, pine, palm, deadTree, bush, boulder, rockCluster, standingStone, flowers, grassTuft, reeds,
    cottage, watchtower, well, stall, windmill, campfire, signpost, chest, shrine,
    brokenColumn, fallenColumn, ruinWall, ruinArch,
    explorer: (ph) => human(ph, { team: 'blue', lantern: true }),
    villager: (ph, i = 0) => human(ph, [
      { hat: false, pack: false, cloth: '#7a6a3e', trousers: '#5b4a34', hair: '#6b4a2a' },
      { hat: false, pack: false, cloth: '#8a4a38', trousers: '#4a4436', hair: '#2e2018' },
      { hat: false, pack: false, cloth: '#4e6a7a', trousers: '#5a4a38', hair: '#c79a5a' },
    ][i % 3]),
    deer: (ph) => quadruped(ph, 'deer'),
    sheep: (ph) => quadruped(ph, 'sheep'),
  };
})(typeof window !== 'undefined' ? window : globalThis);
