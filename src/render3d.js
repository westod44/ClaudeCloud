/*
 * Pre-rendered sprite renderer.
 * Ray-marches signed-distance-field models with the ONE camera and ONE sun from STYLE,
 * supersamples, and outputs two layers, as AoE2 sprites have:
 *   body   - opaque palette-quantized pixels (binary alpha, no outlines)
 *   shadow - translucent cast shadow on the ground plane (separate layer)
 * Model interface: { bounds:[x0,y0,z0,x1,y1,z1], sdf(x,y,z)->dist (sets model.m), mat(m,x,y,z,nx,ny,nz)->[r,g,b,emissive,spec] }
 */
(function (root) {
  const S = root.STYLE, PAL = root.PAL;
  const S2 = Math.SQRT1_2, C30 = Math.cos(Math.PI / 6), SN30 = 0.5;
  const R = [S2, -S2, 0], D = [SN30 * S2, SN30 * S2, -C30], V = [-C30 * S2, -C30 * S2, -SN30];
  const PX = S.projection.pxPerUnit;
  const L = S.lighting.sunDir;
  const hexf = h => PAL.hex(h).map(v => v / 255);
  const SUN = hexf(S.lighting.sunColor).map(v => v * S.lighting.sunIntensity);
  const SKY = hexf(S.lighting.skyColor).map(v => v * S.lighting.skyIntensity);
  const BOUNCE = hexf(S.lighting.bounceColor).map(v => v * S.lighting.bounceIntensity);
  const HV = (() => { const h = [L[0] - V[0], L[1] - V[1], L[2] - V[2]], l = Math.hypot(...h); return h.map(v => v / l); })();
  const SH = S.lighting.shadow;

  const CAM_DEF = { R, D, V, PX, L, ground: true };
  const norm3l = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  function project(x, y, z) { return [(x - y) * S2 * PX, ((x + y) * SN30 * S2 - z * C30) * PX]; }

  function rayBox(ox, oy, oz, dx, dy, dz, b) {
    let tn = -1e9, tf = 1e9; const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < b[a] || o[a] > b[a + 3]) return null; continue; }
      let t1 = (b[a] - o[a]) / d[a], t2 = (b[a + 3] - o[a]) / d[a]; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tn) tn = t1; if (t2 < tf) tf = t2; if (tn > tf) return null;
    }
    return [tn, tf];
  }

  function worldBounds(b, ang) {
    if (!ang) return b.slice();
    const c = Math.cos(ang), s = Math.sin(ang); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) { const wx = x * c - y * s, wy = x * s + y * c; x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy); }
    return [x0, y0, b[2], x1, y1, b[5]];
  }
  // screen-space box (art px) that contains the model and its ground shadow
  function screenBox(wb) {
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    const add = (x, y, z) => { const p = project(x, y, z); mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); };
    for (const x of [wb[0], wb[3]]) for (const y of [wb[1], wb[4]]) for (const z of [Math.max(0, wb[2]), wb[5]]) {
      add(x, y, z); if (z > 0) { const k = z / L[2]; add(x - L[0] * k, y - L[1] * k, 0); }
    }
    const x = Math.floor(mnx) - 2, y = Math.floor(mny) - 2;
    return { x, y, w: Math.ceil(mxx) + 2 - x, h: Math.ceil(mxy) + 2 - y };
  }
  function camBox(wb, C) {
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const x of [wb[0], wb[3]]) for (const y of [wb[1], wb[4]]) for (const z of [wb[2], wb[5]]) {
      const px = (x * C.R[0] + y * C.R[1] + z * C.R[2]) * C.PX, py = (x * C.D[0] + y * C.D[1] + z * C.D[2]) * C.PX;
      mnx = Math.min(mnx, px); mxx = Math.max(mxx, px); mny = Math.min(mny, py); mxy = Math.max(mxy, py);
    }
    const x = Math.floor(mnx), y = Math.floor(mny); return { x, y, w: Math.ceil(mxx) - x, h: Math.ceil(mxy) - y };
  }
  function unionBox(a, b) { if (!a) return b; const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; }

  /**
   * render(model, {angle, box, ss}) -> {w,h,ax,ay, body:Uint8ClampedArray, shadow:Uint8ClampedArray}
   * angle: facing (radians) — model local +x is turned to this world direction.
   */
  function render(model, opts = {}) {
    // optional custom camera (used for the character portrait); defaults to the standard iso camera
    const C = opts.cam || CAM_DEF;
    const R = C.R, D = C.D, V = C.V, PX = C.PX, L = C.L;
    const ang = opts.angle || 0, ca = Math.cos(ang), sa = Math.sin(ang);
    const ss = opts.ss || S.render.supersample;
    const wb = worldBounds(model.bounds, ang);
    const box = opts.box || (opts.cam ? camBox(wb, C) : screenBox(wb));
    const W = box.w * ss, H = box.h * ss;
    // local transform (rotate world point by -ang)
    const sdf = ang ? (x, y, z) => model.sdf(x * ca + y * sa, -x * sa + y * ca, z) : (x, y, z) => model.sdf(x, y, z);
    const maxSteps = S.render.maxSteps;

    function softShadow(px, py, pz) {
      const rb = rayBox(px, py, pz, L[0], L[1], L[2], wb); if (!rb || rb[1] < 0) return 1;
      let t = Math.max(rb[0], 0.003), res = 1;
      for (let i = 0; i < 72; i++) {
        const h = sdf(px + L[0] * t, py + L[1] * t, pz + L[2] * t);
        if (h < 0.0008) return 0;
        res = Math.min(res, SH.softness * h / t);
        t += Math.min(Math.max(h * 0.9, 0.004), 0.12); if (t > rb[1]) break;
      }
      return Math.max(0, Math.min(1, res));
    }

    const col = new Float32Array(W * H * 3), hit = new Uint8Array(W * H), shd = new Float32Array(W * H);
    for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
      const px = (box.x + (sx + 0.5) / ss) / PX, py = (box.y + (sy + 0.5) / ss) / PX;
      const ox = R[0] * px + D[0] * py, oy = R[1] * px + D[1] * py, oz = D[2] * py;
      const k = sy * W + sx;
      const rb = rayBox(ox, oy, oz, V[0], V[1], V[2], wb);
      let found = false, x = 0, y = 0, z = 0;
      if (rb) {
        let t = rb[0];
        for (let i = 0; i < maxSteps; i++) {
          x = ox + V[0] * t; y = oy + V[1] * t; z = oz + V[2] * t;
          const d = sdf(x, y, z);
          if (d < 0.0012) { found = !C.ground || z > -0.01; break; }
          t += d * 0.8; if (t > rb[1]) break;
        }
      }
      if (!found && !C.ground) continue;
      if (!found) { // ground plane z = 0 catches the shadow
        const tg = oz / SN30; const gx = ox + V[0] * tg, gy = oy + V[1] * tg;
        shd[k] = 1 - softShadow(gx, gy, 0.0005);
        continue;
      }
      // normal (tetrahedron technique)
      const e = 0.0015;
      const a1 = sdf(x + e, y - e, z - e), a2 = sdf(x - e, y - e, z + e), a3 = sdf(x - e, y + e, z - e), a4 = sdf(x + e, y + e, z + e);
      let nx = a1 - a2 - a3 + a4, ny = -a1 - a2 + a3 + a4, nz = -a1 + a2 - a3 + a4; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      sdf(x, y, z); const m = model.m;
      const lx = ang ? x * ca + y * sa : x, ly = ang ? -x * sa + y * ca : y;
      const mt = model.mat(m, lx, ly, z, nx, ny, nz);
      let r, g, b;
      if (mt[3]) { r = mt[0]; g = mt[1]; b = mt[2]; }
      else {
        const ndl = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const vis = ndl > 0 ? softShadow(x + nx * 0.004, y + ny * 0.004, z + nz * 0.004) : 0;
        let occ = 0; for (let j = 1; j <= 4; j++) { const hk = 0.025 * j; occ += (hk - sdf(x + nx * hk, y + ny * hk, z + nz * hk)) / j; }
        const ao = Math.max(0.35, Math.min(1, 1 - occ * S.lighting.ambientOcclusion * 5));
        const sky = 0.5 + 0.5 * (C.ground ? nz : -(nx * D[0] + ny * D[1] + nz * D[2])), bo = 1 - sky;
        const lit = ndl * vis;
        r = mt[0] * (SUN[0] * lit + (SKY[0] * sky + BOUNCE[0] * bo) * ao);
        g = mt[1] * (SUN[1] * lit + (SKY[1] * sky + BOUNCE[1] * bo) * ao);
        b = mt[2] * (SUN[2] * lit + (SKY[2] * sky + BOUNCE[2] * bo) * ao);
        if (mt[4]) { const hv = C === CAM_DEF ? HV : norm3l([L[0] - V[0], L[1] - V[1], L[2] - V[2]]); const sp = Math.pow(Math.max(0, nx * hv[0] + ny * hv[1] + nz * hv[2]), 36) * mt[4] * vis; r += sp; g += sp; b += sp * 0.9; }
      }
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b; hit[k] = 1;
    }
    // reduce supersamples -> binary-alpha body + quantized shadow alpha
    const w = box.w, h = box.h, body = new Uint8ClampedArray(w * h * 4), shadow = new Uint8ClampedArray(w * h * 4);
    const sc = PAL.hex(SH.color), n2 = ss * ss;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let hc = 0, r = 0, g = 0, b = 0, s = 0;
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
        const k = (y * ss + j) * W + (x * ss + i);
        if (hit[k]) { hc++; r += col[k * 3]; g += col[k * 3 + 1]; b += col[k * 3 + 2]; } else s += shd[k];
      }
      const o = (y * w + x) * 4;
      if (hc * 2 >= n2) {
        const q = PAL.quantize(Math.pow(r / hc, 0.92) * 255, Math.pow(g / hc, 0.92) * 255, Math.pow(b / hc, 0.92) * 255);
        body[o] = q[0]; body[o + 1] = q[1]; body[o + 2] = q[2]; body[o + 3] = 255;
      }
      const sa = Math.round((s / n2) * SH.levels) / SH.levels;
      if (sa > 0) { shadow[o] = sc[0]; shadow[o + 1] = sc[1]; shadow[o + 2] = sc[2]; shadow[o + 3] = Math.round(sa * SH.maxAlpha * 255); }
    }
    return { w, h, ax: -box.x, ay: -box.y, body, shadow };
  }

  const API = { render, project, screenBox, camBox, worldBounds, unionBox, R, D, V, L, PX };
  root.R3 = API;
})(typeof window !== 'undefined' ? window : globalThis);
