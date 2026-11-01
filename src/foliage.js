/*
 * Foliage renderer: trees, bushes, grass, flowers as thousands of individually lit leaves.
 *
 * The reference style's trees are pre-rendered from 3D models with alpha-mapped leaf cards,
 * so they read as crisp clusters of tiny leaves with sky gaps, visible limbs and dappled
 * shadows, not as smooth blobs. We reproduce that directly:
 *   1. grow a 3D branch skeleton (L-system-like) in world units, same camera as everything else
 *   2. scatter leaf "cards" around the branch tips
 *   3. light each leaf: canopy normal · sun, a sun-space shadow map (self-shadowing) and inner occlusion
 *   4. painter-sort leaves and limbs by view depth and draw them supersampled
 *   5. project every leaf onto the ground along the sun for a dappled shadow layer
 *   6. snap to the shared 256-colour palette with binary alpha
 * Trees get 3 leaf-flutter frames. Whole-tree sway is done at runtime by bending the sprite,
 * so it can follow wind strength continuously. Grass, flowers and reeds get baked sway
 * frames (6 light + 6 strong).
 */
(function (root) {
  const S = root.STYLE, PAL = root.PAL, NZ = root.NOISE, R3 = root.R3;
  const { rng, noise3, clamp } = NZ;
  const hexf = h => PAL.hex(h).map(v => v / 255);
  const V = R3.V, L = R3.L, PX = R3.PX;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function rot(v, k, a) { const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v); return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)]; }
  const perpTo = v => norm(Math.abs(v[2]) < 0.9 ? cross(v, [0, 0, 1]) : cross(v, [1, 0, 0]));
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function ramp4(c, v) { v = clamp(v, 0, 1); if (v < 0.33) return mixc(c[0], c[1], v / 0.33); if (v < 0.75) return mixc(c[1], c[2], (v - 0.33) / 0.42); return mixc(c[2], c[3], (v - 0.75) / 0.25); }
  const SUNU = norm(cross(L, [0, 0, 1])), SUNW = cross(SUNU, L);
  const WIND = norm([0.7, -0.7, 0]); // blows toward screen-right

  // ---------------------------------------------------------------- species
  const P = (a, b, c, d) => [hexf(a), hexf(b), hexf(c), hexf(d)];
  const SPECIES = {
    oak: { kind: 'broad', trunkH: [0.3, 0.38], trunkR: 0.07, depth: 3, kids: [3, 4], spread: 0.62, blen: 0.3, decay: 0.76, up: 0.75, clusterR: [0.15, 0.21], leaf: [0.022, 0.03], dens: 5200, bark: P('#241811', '#4a3626', '#6e543b', '#8f7558'), leaves: P('#16301a', '#3b6a26', '#86b34a', '#c9e27f') },
    beech: { kind: 'broad', trunkH: [0.34, 0.42], trunkR: 0.066, depth: 3, kids: [3, 3], spread: 0.55, blen: 0.3, decay: 0.77, up: 0.85, clusterR: [0.16, 0.22], leaf: [0.024, 0.032], dens: 5200, bark: P('#2b2a28', '#5a5a52', '#7e7d74', '#a3a196'), leaves: P('#122a17', '#2d5a24', '#62953c', '#a8cf68') },
    maple: { kind: 'broad', trunkH: [0.32, 0.4], trunkR: 0.062, depth: 3, kids: [3, 4], spread: 0.6, blen: 0.29, decay: 0.76, up: 0.8, clusterR: [0.14, 0.2], leaf: [0.026, 0.034], dens: 4600, bark: P('#241811', '#4a3626', '#6e543b', '#8f7558'), leaves: P('#4a1a10', '#9a3c1c', '#d8742c', '#f4b25a') },
    aspen: { kind: 'broad', trunkH: [0.42, 0.52], trunkR: 0.05, depth: 3, kids: [2, 3], spread: 0.5, blen: 0.26, decay: 0.78, up: 1.0, clusterR: [0.12, 0.17], leaf: [0.02, 0.026], dens: 5000, bark: P('#3a3a34', '#9c9a8c', '#d8d6c8', '#f2f0e4'), birch: true, leaves: P('#4a3a10', '#9a7a1c', '#d8b83a', '#f4e27a') },
    birch: { kind: 'broad', trunkH: [0.45, 0.55], trunkR: 0.048, depth: 3, kids: [2, 3], spread: 0.48, blen: 0.27, decay: 0.78, up: 1.0, clusterR: [0.12, 0.16], leaf: [0.018, 0.024], dens: 5000, bark: P('#3a3a34', '#9c9a8c', '#d8d6c8', '#f2f0e4'), birch: true, leaves: P('#1d3a17', '#4f8a2e', '#9cc756', '#d6ec92') },
    pine: { kind: 'conifer', height: [1.45, 1.75], trunkR: 0.055, radius: 0.46, bark: P('#20140e', '#43291a', '#644029', '#86603e'), leaves: P('#0b1f19', '#1d4231', '#3a6e4a', '#7aa676') },
    pineSnow: { kind: 'conifer', height: [1.35, 1.6], trunkR: 0.055, radius: 0.44, snow: true, bark: P('#20140e', '#43291a', '#644029', '#86603e'), leaves: P('#0b1f19', '#1d4231', '#3a6e4a', '#7aa676') },
    palm: { kind: 'palm', height: [1.25, 1.45], bark: P('#2e2015', '#5c4128', '#8a6a44', '#b09060'), leaves: P('#173214', '#3c6e22', '#7aa83c', '#b9d672') },
    dead: { kind: 'broad', noLeaves: true, trunkH: [0.4, 0.5], trunkR: 0.065, depth: 4, kids: [2, 3], spread: 0.8, blen: 0.3, decay: 0.72, up: 0.5, bark: P('#2a2724', '#57514a', '#857d72', '#a8a094') },
    bush: { kind: 'bush', clusterR: [0.08, 0.12], leaf: [0.018, 0.024], dens: 4200, leaves: P('#14301a', '#356627', '#73a642', '#b5d873'), bark: P('#241811', '#4a3626', '#6e543b', '#8f7558') },
    berry: { kind: 'bush', berries: true, clusterR: [0.08, 0.12], leaf: [0.018, 0.024], dens: 4200, leaves: P('#122b17', '#2f5e25', '#629a3b', '#a5cf6a'), bark: P('#241811', '#4a3626', '#6e543b', '#8f7558') },
    fern: { kind: 'fern', leaves: P('#123016', '#2e6a24', '#66a844', '#a8d878') },
  };

  // ---------------------------------------------------------------- geometry builders
  // returns { segs:[{a,b,r0,r1}], leaves:[{p,s,ang,c(center),cr,w,tint,flutter}], extras:[...] , crown:{c,r}, H }
  function buildBroad(sp, R) {
    const segs = [], clusters = [];
    const th = sp.trunkH[0] + R() * (sp.trunkH[1] - sp.trunkH[0]);
    const lean = [(R() - 0.5) * 0.12, (R() - 0.5) * 0.12, 1];
    function grow(p, dir, L0, r, depth) {
      // two sub-segments with a bend
      const bendAxis = perpTo(dir), mid = add(p, mul(norm(rot(dir, bendAxis, (R() - 0.5) * 0.35)), L0 * 0.5));
      const dir2 = norm(rot(dir, perpTo(dir), (R() - 0.5) * 0.3)), end = add(mid, mul(dir2, L0 * 0.5));
      segs.push({ a: p, b: mid, r0: r, r1: r * 0.88 }, { a: mid, b: end, r0: r * 0.88, r1: r * 0.75 });
      if (depth <= 0 || r < 0.008) { clusters.push({ c: end, r: sp.clusterR ? sp.clusterR[0] + R() * (sp.clusterR[1] - sp.clusterR[0]) : 0 }); return; }
      const n = sp.kids[0] + Math.floor(R() * (sp.kids[1] - sp.kids[0] + 1));
      const base = R() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const az = base + k / n * Math.PI * 2 + (R() - 0.5) * 0.6;
        let nd = rot(dir, perpTo(dir), sp.spread * (0.6 + R() * 0.6));
        nd = rot(nd, dir, az);
        nd = norm(add(nd, [0, 0, sp.up * 0.5]));
        grow(end, nd, L0 * sp.decay * (0.85 + R() * 0.3), r * 0.62, depth - 1);
      }
      if (depth <= 2 && sp.clusterR && R() < 0.85) clusters.push({ c: add(mid, mul(norm([R() - 0.5, R() - 0.5, 0.6]), 0.06)), r: sp.clusterR[0] * 0.9 });
    }
    // trunk
    const top = add([0, 0, 0], mul(norm(lean), th));
    segs.push({ a: [0, 0, 0], b: mul(top, 0.5), r0: sp.trunkR * 1.35, r1: sp.trunkR }, { a: mul(top, 0.5), b: top, r0: sp.trunkR, r1: sp.trunkR * 0.85 });
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + R(); segs.push({ a: [0, 0, 0.04], b: [Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.0], r0: sp.trunkR * 0.7, r1: sp.trunkR * 0.25 }); } // root flare
    const n0 = sp.kids[0] + Math.floor(R() * (sp.kids[1] - sp.kids[0] + 1));
    for (let k = 0; k < n0; k++) {
      const az = k / n0 * Math.PI * 2 + R() * 0.5;
      const d = norm([Math.cos(az) * sp.spread, Math.sin(az) * sp.spread, 1.0 + sp.up * 0.4]);
      grow(top, d, sp.blen * (0.9 + R() * 0.25), sp.trunkR * 0.72, sp.depth - 1);
    }
    return { segs, clusters, th };
  }
  function scatterLeaves(sp, clusters, R, opts = {}) {
    const leaves = [];
    let cc = [0, 0, 0], n = 0; for (const c of clusters) { cc = add(cc, c.c); n++; } cc = mul(cc, 1 / Math.max(1, n));
    let cr = 0; for (const c of clusters) cr = Math.max(cr, len(sub(c.c, cc)) + c.r);
    for (const cl of clusters) {
      const count = Math.round(cl.r * cl.r * sp.dens * (opts.densMul || 1));
      for (let k = 0; k < count; k++) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = cl.r * Math.pow(R(), 0.35);
        const off = [s * Math.cos(a) * rr, s * Math.sin(a) * rr, u * rr * 0.8];
        leaves.push({ p: add(cl.c, off), cl: cl.c, clr: cl.r, s: sp.leaf[0] + R() * (sp.leaf[1] - sp.leaf[0]), ang: R() * Math.PI, el: 0.35 + R() * 0.25, tint: R(), ph: R() * Math.PI * 2 });
      }
    }
    return { leaves, crown: { c: cc, r: Math.max(cr, 0.2) } };
  }
  function buildConifer(sp, R) {
    const segs = [], leaves = [], H = sp.height[0] + R() * (sp.height[1] - sp.height[0]);
    segs.push({ a: [0, 0, 0], b: [0, 0, H * 0.55], r0: sp.trunkR * 1.3, r1: sp.trunkR * 0.8 }, { a: [0, 0, H * 0.55], b: [0, 0, H], r0: sp.trunkR * 0.8, r1: 0.01 });
    const whorls = 13;
    for (let w = 0; w < whorls; w++) {
      const t = w / (whorls - 1), z = 0.28 + t * (H - 0.36), reach = sp.radius * (1 - t * 0.92) * (0.85 + R() * 0.25);
      const arms = 8 + Math.floor(R() * 3), base = R() * Math.PI * 2;
      for (let k = 0; k < arms; k++) {
        const az = base + k / arms * Math.PI * 2 + (R() - 0.5) * 0.4;
        const dirH = [Math.cos(az), Math.sin(az), 0], start = [0, 0, z], end = add(start, add(mul(dirH, reach), [0, 0, -0.07 - reach * 0.25]));
        segs.push({ a: start, b: end, r0: 0.01, r1: 0.004, twig: true, green: true });
        // needle clumps along the arm, denser toward the tip
        const clumps = Math.round(8 + reach * 60);
        for (let c = 0; c < clumps; c++) {
          const f = Math.pow(R(), 0.7), p = add(add(start, mul(sub(end, start), f)), [(R() - 0.5) * 0.06, (R() - 0.5) * 0.06, (R() - 0.3) * 0.05]);
          leaves.push({ p, cl: [0, 0, z], clr: reach + 0.05, s: 0.03 + R() * 0.02, ang: az + (R() - 0.5) * 0.8, el: 0.3 + R() * 0.15, tint: R(), ph: R() * Math.PI * 2, needle: true, droop: f });
        }
      }
    }
    for (let k = 0; k < 14; k++) leaves.push({ p: [(R() - 0.5) * 0.05, (R() - 0.5) * 0.05, H - 0.1 + R() * 0.1], cl: [0, 0, H - 0.1], clr: 0.08, s: 0.02, ang: R() * Math.PI, el: 0.4, tint: R(), ph: R() * 6, needle: true });
    return { segs, leaves, crown: { c: [0, 0, H * 0.5], r: Math.max(sp.radius, H * 0.5) }, H };
  }
  function buildPalm(sp, R) {
    const segs = [], leaves = [], H = sp.height[0] + R() * (sp.height[1] - sp.height[0]);
    const a0 = R() * Math.PI * 2, lean = 0.22 + R() * 0.1, P = t => [Math.cos(a0) * lean * t * t, Math.sin(a0) * lean * t * t, t * H];
    for (let i = 0; i < 8; i++) segs.push({ a: P(i / 8), b: P((i + 1) / 8), r0: 0.06 - i * 0.003, r1: 0.06 - (i + 1) * 0.003, ring: true });
    const top = P(1), fronds = 10;
    for (let f = 0; f < fronds; f++) {
      const az = f / fronds * Math.PI * 2 + R() * 0.3, Lf = 0.5 + R() * 0.18, rise = 0.1 + R() * 0.12;
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([top[0] + Math.cos(az) * Lf * t, top[1] + Math.sin(az) * Lf * t, top[2] + rise * Math.sin(t * Math.PI * 0.6) - t * t * 0.42]); }
      for (let i = 0; i < 8; i++) segs.push({ a: pts[i], b: pts[i + 1], r0: 0.01, r1: 0.007, twig: true, green: true });
      for (let i = 1; i <= 8; i++) for (const side of [-1, 1]) {
        const t = i / 8, p = pts[i], tang = norm(sub(pts[Math.min(8, i)], pts[i - 1]));
        const outD = norm(add(rot(tang, [0, 0, 1], side * 1.2), [0, 0, -0.5]));
        const ln = 0.16 * Math.sin(t * Math.PI * 0.95 + 0.15);
        for (let q = 0; q < 4; q++) leaves.push({ p: add(p, mul(outD, ln * (0.2 + q * 0.27))), cl: top, clr: Lf, s: ln * 0.45, ang: Math.atan2(outD[1] - outD[0], outD[0] + outD[1]), el: 0.18, tint: R(), ph: R() * 6, frond: true });
      }
    }
    for (let k = 0; k < 4; k++) leaves.push({ p: add(top, [Math.cos(k * 1.6) * 0.05, Math.sin(k * 1.6) * 0.05, -0.06]), cl: top, clr: 0.1, s: 0.03, ang: 0, el: 1, tint: 0, ph: 0, nut: true });
    return { segs, leaves, crown: { c: top, r: 0.6 }, H };
  }
  function buildBush(sp, R) {
    const segs = [], clusters = [];
    const stems = 4 + Math.floor(R() * 3);
    for (let k = 0; k < stems; k++) {
      const az = R() * Math.PI * 2, rr = 0.05 + R() * 0.12, h = 0.12 + R() * 0.14, end = [Math.cos(az) * rr, Math.sin(az) * rr, h];
      segs.push({ a: [Math.cos(az) * 0.02, Math.sin(az) * 0.02, 0], b: end, r0: 0.012, r1: 0.006, twig: true });
      clusters.push({ c: end, r: sp.clusterR[0] + R() * (sp.clusterR[1] - sp.clusterR[0]) });
    }
    clusters.push({ c: [0, 0, 0.1], r: 0.12 });
    return { segs, clusters };
  }
  function buildFern(sp, R) {
    const segs = [], leaves = [];
    for (let f = 0; f < 11; f++) {
      const az = f / 11 * Math.PI * 2 + R() * 0.4, Lf = 0.22 + R() * 0.1, rise = 0.12 + R() * 0.08;
      const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([Math.cos(az) * Lf * t, Math.sin(az) * Lf * t, rise * Math.sin(t * Math.PI * 0.8) + 0.01]); }
      for (let i = 0; i < 6; i++) segs.push({ a: pts[i], b: pts[i + 1], r0: 0.005, r1: 0.003, twig: true, green: true });
      for (let i = 1; i <= 6; i++) for (const side of [-1, 1]) { const t = i / 6, tang = norm(sub(pts[i], pts[i - 1])), o = norm(add(rot(tang, [0, 0, 1], side * 1.3), [0, 0, -0.2])); leaves.push({ p: add(pts[i], mul(o, 0.03 * (1 - t * 0.5))), cl: [0, 0, 0.08], clr: 0.25, s: 0.028 * (1 - t * 0.4), ang: Math.atan2(o[1] - o[0], o[0] + o[1]), el: 0.3, tint: R(), ph: R() * 6, frond: true }); }
    }
    return { segs, leaves, crown: { c: [0, 0, 0.08], r: 0.28 } };
  }

  // ---------------------------------------------------------------- render
  function makeTree(speciesName, seed, frame = 0, frames = 1) {
    const sp = SPECIES[speciesName], R = rng(seed);
    let segs, leaves = [], crown;
    if (sp.kind === 'broad') { const g = buildBroad(sp, R); segs = g.segs; if (!sp.noLeaves) { const s = scatterLeaves(sp, g.clusters, R); leaves = s.leaves; crown = s.crown; } else crown = { c: [0, 0, 0.6], r: 0.5 }; }
    else if (sp.kind === 'conifer') ({ segs, leaves, crown } = buildConifer(sp, R));
    else if (sp.kind === 'palm') ({ segs, leaves, crown } = buildPalm(sp, R));
    else if (sp.kind === 'bush') { const g = buildBush(sp, R); segs = g.segs; const s = scatterLeaves(sp, g.clusters, R); leaves = s.leaves; crown = s.crown; if (sp.berries) { for (let k = 0; k < 40; k++) { const l = leaves[(R() * leaves.length) | 0]; leaves.push({ p: add(l.p, [0, 0, 0.01]), cl: l.cl, clr: l.clr, s: 0.016, ang: 0, el: 1, tint: R(), ph: 0, berry: true }); } } }
    else if (sp.kind === 'fern') ({ segs, leaves, crown } = buildFern(sp, R));
    // flutter: tiny per-leaf motion
    if (frames > 1) {
      const ph = frame / frames * Math.PI * 2, top = Math.max(0.3, crown.c[2] + crown.r);
      for (const l of leaves) { const h = clamp(l.p[2] / top, 0, 1), a = 0.009 * h * Math.sin(ph + l.ph); l.p = add(l.p, add(mul(WIND, a), [0, 0, 0.004 * Math.cos(ph * 2 + l.ph)])); l.ang += 0.25 * Math.sin(ph + l.ph); }
    }
    return { sp, segs, leaves, crown };
  }

  function render(model, opts = {}) {
    const { sp, segs, leaves, crown } = model, ss = opts.ss || 3;
    // ------------------------------------------------ sun-space shadow map (self shadowing)
    const CS = 0.04, smap = new Map();
    const sk = p => Math.floor(dot(p, SUNU) / CS) + ',' + Math.floor(dot(p, SUNW) / CS);
    for (const l of leaves) { const k = sk(l.p), d = dot(l.p, L); const m = smap.get(k); if (m === undefined || d > m) smap.set(k, d); }
    function sunVis(p, slack = 0.05) {
      const u = Math.floor(dot(p, SUNU) / CS), w = Math.floor(dot(p, SUNW) / CS), d = dot(p, L); let lit = 0, n = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const m = smap.get((u + a) + ',' + (w + b)); n++; if (m === undefined || d >= m - slack) lit++; }
      return lit / n;
    }
    // ------------------------------------------------ bounds
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    const ext = (x, y, r = 0) => { mnx = Math.min(mnx, x - r); mxx = Math.max(mxx, x + r); mny = Math.min(mny, y - r); mxy = Math.max(mxy, y + r); };
    const shadowPt = p => { const k = p[2] / L[2]; return R3.project(p[0] - L[0] * k, p[1] - L[1] * k, 0); };
    for (const s of segs) for (const p of [s.a, s.b]) { const q = R3.project(...p); ext(q[0], q[1], 4); const g = shadowPt(p); ext(g[0], g[1], 4); }
    for (const l of leaves) { const q = R3.project(...l.p); ext(q[0], q[1], l.s * PX + 2); const g = shadowPt(l.p); ext(g[0], g[1], l.s * PX + 2); }
    const box = opts.box || { x: Math.floor(mnx) - 2, y: Math.floor(mny) - 2, w: Math.ceil(mxx) + 2 - (Math.floor(mnx) - 2), h: Math.ceil(mxy) + 2 - (Math.floor(mny) - 2) };
    const W = box.w * ss, H = box.h * ss;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const sc = document.createElement('canvas'); sc.width = W; sc.height = H; const gs = sc.getContext('2d');
    const toC = p => { const q = R3.project(p[0], p[1], p[2]); return [(q[0] - box.x) * ss, (q[1] - box.y) * ss]; };
    const toS = p => { const q = shadowPt(p); return [(q[0] - box.x) * ss, (q[1] - box.y) * ss]; };
    const css = c => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    // ------------------------------------------------ build draw list
    const items = [];
    for (const s of segs) items.push({ d: (dot(s.a, V) + dot(s.b, V)) / 2 + 0.002, seg: s });
    for (const l of leaves) items.push({ d: dot(l.p, V), leaf: l });
    items.sort((a, b) => b.d - a.d); // far first
    const crownC = crown.c, crownR = crown.r;
    // ground shadow (all at once, black)
    gs.fillStyle = '#000'; gs.strokeStyle = '#000'; gs.lineCap = 'round';
    for (const s of segs) { const a = toS(s.a), b = toS(s.b); gs.lineWidth = Math.max(1, (s.r0 + s.r1) * PX * ss * 0.9); gs.beginPath(); gs.moveTo(a[0], a[1]); gs.lineTo(b[0], b[1]); gs.stroke(); }
    for (const l of leaves) { const q = toS(l.p), r = l.s * PX * ss * 0.62; gs.beginPath(); gs.ellipse(q[0], q[1], r, r * 0.6, l.ang, 0, Math.PI * 2); gs.fill(); }
    // body
    g.lineCap = 'round';
    for (const it of items) {
      if (it.seg) {
        const s = it.seg, a = toC(s.a), b = toC(s.b), w0 = Math.max(1.2, s.r0 * 2 * PX * ss), w1 = Math.max(1.0, s.r1 * 2 * PX * ss);
        const mid = mul(add(s.a, s.b), 0.5), vis = sp.noLeaves ? 1 : sunVis(mid, 0.12) * 0.75 + 0.25;
        const pal = s.green ? sp.leaves : sp.bark;
        // tapered limb as a quad, shaded across its width (sun from the left)
        const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
        const side = nx < 0 ? 1 : -1; // which side faces screen-left
        const lit = ramp4(pal, 0.35 + 0.55 * vis), dark = ramp4(pal, 0.12 + 0.25 * vis);
        const gx = g.createLinearGradient(a[0] + nx * w0 / 2 * side, a[1] + ny * w0 / 2 * side, a[0] - nx * w0 / 2 * side, a[1] - ny * w0 / 2 * side);
        gx.addColorStop(0, css(lit)); gx.addColorStop(0.55, css(mixc(lit, dark, 0.5))); gx.addColorStop(1, css(dark));
        g.fillStyle = gx; g.beginPath();
        g.moveTo(a[0] + nx * w0 / 2, a[1] + ny * w0 / 2); g.lineTo(b[0] + nx * w1 / 2, b[1] + ny * w1 / 2); g.lineTo(b[0] - nx * w1 / 2, b[1] - ny * w1 / 2); g.lineTo(a[0] - nx * w0 / 2, a[1] - ny * w0 / 2); g.closePath(); g.fill();
        g.beginPath(); g.arc(b[0], b[1], w1 / 2, 0, Math.PI * 2); g.fill();
        // bark texture / birch marks / palm rings
        if (w0 > 3 * ss || s.ring) {
          const n = Math.floor(dl / (ss * 3)); g.fillStyle = css(sp.birch ? pal[0] : mixc(dark, pal[0], 0.5));
          for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = a[0] + dx * t, y = a[1] + dy * t, wz = w0 + (w1 - w0) * t; const h = NZ.hash(k, Math.round(s.a[2] * 100), 7);
            if (s.ring) { if (k % 2 === 0) { g.fillRect(x - wz / 2, y - ss * 0.5, wz, ss); } }
            else if (sp.birch) { if (h < 0.4) g.fillRect(x - wz * (0.1 + h * 0.6), y - ss * 0.6, wz * (0.25 + h * 0.5), ss * 1.2); }
            else if (h < 0.55) g.fillRect(x + (h - 0.3) * wz, y - ss * 1.5, ss, ss * 3); }
        }
      } else {
        const l = it.leaf, q = toC(l.p);
        if (l.berry) { g.fillStyle = css(hexf(l.tint < 0.5 ? '#b02a3a' : '#d8424a')); g.beginPath(); g.arc(q[0], q[1], l.s * PX * ss * 0.5, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,220,220,0.9)'; g.fillRect(q[0] - ss * 0.6, q[1] - ss * 0.8, ss * 0.8, ss * 0.8); continue; }
        if (l.nut) { g.fillStyle = css(sp.bark[1]); g.beginPath(); g.arc(q[0], q[1], l.s * PX * ss * 0.5, 0, Math.PI * 2); g.fill(); continue; }
        // lighting
        const nrmv = norm(add(mul(norm(sub(l.p, l.cl)), 0.65), add(mul(norm(sub(l.p, crownC)), 0.35), [0, 0, 0.25])));
        const lam = Math.max(0, dot(nrmv, L)), vis = sunVis(l.p);
        const outer = clamp(len(sub(l.p, crownC)) / crownR, 0, 1);
        let v = (0.12 + 0.8 * lam * (0.35 + 0.65 * vis)) * (0.6 + 0.4 * outer) + (l.tint - 0.5) * 0.16;
        if (l.needle) v = (0.1 + 0.75 * lam * (0.3 + 0.7 * vis)) * (0.55 + 0.45 * outer) + (l.tint - 0.5) * 0.12 + (l.droop || 0) * 0.08;
        let col = ramp4(sp.leaves, v);
        if (sp.snow && nrmv[2] > 0.05 && l.tint > 0.25) col = mixc(col, hexf(vis > 0.5 ? '#f4f8fc' : '#b8c8dc'), 0.85);
        col = mixc(col, l.tint > 0.85 ? hexf('#c8d860') : col, 0.15);
        const r = l.s * PX * ss * 0.5;
        if (l.needle) {
          // needle spray: a few short strokes
          g.strokeStyle = css(col); g.lineWidth = Math.max(1, ss * 0.9);
          for (let k = -2; k <= 2; k++) { const a = l.ang + k * 0.45; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + Math.cos(a) * r * 1.5, q[1] + Math.sin(a) * r * 0.9 + r * 0.5); g.stroke(); }
        } else if (l.frond) {
          g.fillStyle = css(col); g.beginPath(); g.ellipse(q[0], q[1], r * 1.5, Math.max(ss * 0.9, r * 0.42), l.ang, 0, Math.PI * 2); g.fill();
        } else {
          // broad leaf: darker underside offset, then lit face
          g.fillStyle = css(mixc(col, sp.leaves[0], 0.45)); g.beginPath(); g.ellipse(q[0] + ss * 0.5, q[1] + ss * 0.6, r, r * l.el * 1.6, l.ang, 0, Math.PI * 2); g.fill();
          g.fillStyle = css(col); g.beginPath(); g.ellipse(q[0], q[1], r, r * l.el * 1.6, l.ang, 0, Math.PI * 2); g.fill();
        }
      }
    }
    // ------------------------------------------------ reduce: binary alpha + palette snap
    const w = box.w, h = box.h, body = new Uint8ClampedArray(w * h * 4), shadow = new Uint8ClampedArray(w * h * 4);
    const bd = g.getImageData(0, 0, W, H).data, sd = gs.getImageData(0, 0, W, H).data, n2 = ss * ss, SH = S.lighting.shadow, scol = PAL.hex(SH.color);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0, r = 0, gg = 0, b = 0, s = 0;
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) { const o = ((y * ss + j) * W + x * ss + i) * 4, al = bd[o + 3] / 255; a += al; r += bd[o] * al; gg += bd[o + 1] * al; b += bd[o + 2] * al; s += sd[o + 3] / 255; }
      const o = (y * w + x) * 4;
      if (a / n2 >= 0.42) { const q = PAL.quantize(r / a, gg / a, b / a); body[o] = q[0]; body[o + 1] = q[1]; body[o + 2] = q[2]; body[o + 3] = 255; }
      const sa = Math.round(clamp(s / n2, 0, 1) * SH.levels) / SH.levels;
      if (sa > 0) { shadow[o] = scol[0]; shadow[o + 1] = scol[1]; shadow[o + 2] = scol[2]; shadow[o + 3] = Math.round(sa * SH.maxAlpha * 255); }
    }
    return { w, h, ax: -box.x, ay: -box.y, body, shadow, box };
  }

  // ---------------------------------------------------------------- grass, flowers, reeds (baked sway frames)
  function renderBlades(kind, seed, frame, frames, strong) {
    const R = rng(seed), blades = [];
    const cfg = kind === 'reeds' ? { n: 16, r: 0.14, h: [0.28, 0.5], w: 0.012, cols: P('#2a3a14', '#5a7a2a', '#9aac52', '#c8d27a') }
      : kind === 'dry' ? { n: 26, r: 0.09, h: [0.08, 0.17], w: 0.01, cols: P('#4a3e18', '#8a7a3a', '#c2ad62', '#e6d690') }
      : kind === 'flowers' ? { n: 14, r: 0.2, h: [0.07, 0.15], w: 0.007, cols: P('#16301a', '#3b6a26', '#86b34a', '#c9e27f') }
      : { n: 28, r: 0.09, h: [0.08, 0.18], w: 0.01, cols: P('#16301a', '#3b6a26', '#7aaa44', '#bfe07a') };
    for (let k = 0; k < cfg.n; k++) { const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * cfg.r; blades.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, h: cfg.h[0] + R() * (cfg.h[1] - cfg.h[0]), la: R() * Math.PI * 2, lean: 0.03 + R() * 0.05, ph: R() * Math.PI * 2, tint: R(), cat: kind === 'reeds' && R() < 0.4, bloom: kind === 'flowers' ? ['#f2efe4', '#e8c84a', '#b38ad8', '#e07a8a'][(seed + k) % 4] : null }); }
    const ph = frame / frames * Math.PI * 2, amp = strong ? 0.075 : 0.03, bias = strong ? 0.05 : 0.008;
    const segs = [], leaves = [];
    for (const b of blades) {
      let prev = [b.x, b.y, 0];
      const sw = amp * Math.sin(ph + b.ph * 0.35 + b.x * 6) + bias;
      for (let i = 1; i <= 4; i++) {
        const t = i / 4, bend = t * t;
        const p = [b.x + Math.cos(b.la) * b.lean * t + WIND[0] * sw * bend * (b.h / 0.15), b.y + Math.sin(b.la) * b.lean * t + WIND[1] * sw * bend * (b.h / 0.15), b.h * t * (1 - 0.15 * bend * Math.abs(sw) * 4)];
        segs.push({ a: prev, b: p, r0: cfg.w * (1 - (i - 1) / 4 * 0.85), r1: cfg.w * (1 - i / 4 * 0.85), green: true, t, tint: b.tint }); prev = p;
      }
      if (b.cat) segs.push({ a: add(prev, [0, 0, -0.08]), b: add(prev, [0, 0, -0.02]), r0: 0.018, r1: 0.018, cat: true });
      if (b.bloom) leaves.push({ p: prev, bloom: b.bloom });
    }
    // draw directly (small)
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    const box = { x: -40, y: -60, w: 80, h: 76 };
    if (kind === 'reeds') { box.y = -78; box.h = 96; }
    const ss = 3, W = box.w * ss, H = box.h * ss;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.lineCap = 'round';
    const sc = document.createElement('canvas'); sc.width = W; sc.height = H; const gs = sc.getContext('2d'); gs.lineCap = 'round'; gs.strokeStyle = '#000';
    const toC = p => { const q = R3.project(p[0], p[1], p[2]); return [(q[0] - box.x) * ss, (q[1] - box.y) * ss]; };
    const shadowPt = p => { const k = p[2] / L[2]; return toC([p[0] - L[0] * k, p[1] - L[1] * k, 0]); };
    const css = c => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    segs.sort((a, b) => dot(add(b.a, b.b), V) - dot(add(a.a, a.b), V));
    for (const s of segs) { const a = shadowPt(s.a), b = shadowPt(s.b); gs.lineWidth = Math.max(1, s.r0 * PX * ss * 1.6); gs.beginPath(); gs.moveTo(a[0], a[1]); gs.lineTo(b[0], b[1]); gs.stroke(); }
    for (const s of segs) {
      const a = toC(s.a), b = toC(s.b);
      g.strokeStyle = css(s.cat ? hexf('#5a3a22') : ramp4(cfg.cols, 0.2 + (s.t || 0) * 0.65 + (s.tint - 0.5) * 0.25)); g.lineWidth = Math.max(ss * 0.8, (s.r0 + s.r1) * PX * ss);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    for (const l of leaves) { const q = toC(l.p); g.fillStyle = l.bloom; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { g.beginPath(); g.arc(q[0] + dx * ss * 1.4, q[1] + dy * ss * 1.1, ss * 1.3, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#f4d24a'; g.beginPath(); g.arc(q[0], q[1], ss * 0.9, 0, Math.PI * 2); g.fill(); }
    const w = box.w, h = box.h, body = new Uint8ClampedArray(w * h * 4), shadow = new Uint8ClampedArray(w * h * 4);
    const bd = g.getImageData(0, 0, W, H).data, sd = gs.getImageData(0, 0, W, H).data, n2 = ss * ss, SH = S.lighting.shadow, scol = PAL.hex(SH.color);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0, r = 0, gg = 0, bb = 0, s = 0;
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) { const o = ((y * ss + j) * W + x * ss + i) * 4, al = bd[o + 3] / 255; a += al; r += bd[o] * al; gg += bd[o + 1] * al; bb += bd[o + 2] * al; s += sd[o + 3] / 255; }
      const o = (y * w + x) * 4;
      if (a / n2 >= 0.38) { const q = PAL.quantize(r / a, gg / a, bb / a); body[o] = q[0]; body[o + 1] = q[1]; body[o + 2] = q[2]; body[o + 3] = 255; }
      const sa = Math.round(clamp(s / n2 * 0.8, 0, 1) * SH.levels) / SH.levels;
      if (sa > 0) { shadow[o] = scol[0]; shadow[o + 1] = scol[1]; shadow[o + 2] = scol[2]; shadow[o + 3] = Math.round(sa * SH.maxAlpha * 255); }
    }
    return { w, h, ax: -box.x, ay: -box.y, body, shadow, box };
  }

  root.FOLIAGE = { SPECIES, makeTree, render, renderBlades };
})(typeof window !== 'undefined' ? window : globalThis);
