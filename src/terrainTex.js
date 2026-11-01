/*
 * Tileable top-down terrain textures (384x384 texels = 4x4 tiles at 96 texels/tile).
 * They are sampled in world space, so the iso projection comes for free and neighbouring
 * tiles never show seams (the approach AoE2 DE uses for its terrain).
 */
(function (root) {
  const S = root.STYLE, PAL = root.PAL, N = root.NOISE;
  const { fbm2, noise2, worley2, hash, rng, clamp } = N;
  const T = S.terrain.textureSize, TPT = S.terrain.texelsPerTile, PER = T / TPT; // 4 tiles per repeat
  const hexf = h => PAL.hex(h).map(v => v / 255);
  const C = {}; for (const [k, h] of Object.entries(S.materials)) C[k] = hexf(h);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, m) => [a[0] * m, a[1] * m, a[2] * m];

  function make(id) {
    const d = new Float32Array(T * T * 3), seed = id.length * 97 + id.charCodeAt(0);
    const put = (x, y, c) => { x = ((x % T) + T) % T; y = ((y % T) + T) % T; const o = (y * T + x) * 3; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; };
    const get = (x, y) => { x = ((x % T) + T) % T; y = ((y % T) + T) % T; const o = (y * T + x) * 3; return [d[o], d[o + 1], d[o + 2]]; };
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const u = x / TPT, v = y / TPT, h = hash(x, y, seed);
      let c;
      switch (id) {
        case 'grass': case 'grassLush': {
          const n1 = fbm2(u * 1.5, v * 1.5, PER * 1.5, seed, 4), n2 = fbm2(u * 6, v * 6, PER * 6, seed + 1, 3);
          const base = id === 'grass' ? mix(C.grass, C.grassLush, clamp((n1 - 0.35) * 2, 0, 1) * 0.7) : mix(C.grassLush, C.leaf, n1 * 0.6);
          c = mul(mix(base, C.dryGrass, clamp((n2 - 0.62) * 2, 0, 0.35)), 0.86 + (n2 - 0.5) * 0.35 + (h < 0.05 ? -0.12 : h > 0.97 ? 0.1 : 0));
          break;
        }
        case 'dryGrass': {
          const n1 = fbm2(u * 1.5, v * 1.5, PER * 1.5, seed, 4), n2 = fbm2(u * 7, v * 7, PER * 7, seed + 2, 3);
          c = mix(C.dryGrass, C.grass, clamp((n1 - 0.4) * 1.5, 0, 0.55));
          if (n2 < 0.36) c = mix(c, C.dirt, 0.6);
          c = mul(c, 0.88 + (n2 - 0.5) * 0.3 + (h < 0.05 ? -0.1 : 0));
          break;
        }
        case 'dirt': case 'road': {
          const n1 = fbm2(u * 2, v * 2, PER * 2, seed, 4), n2 = fbm2(u * 9, v * 9, PER * 9, seed + 3, 2);
          c = id === 'road' ? mix(C.dirt, C.sand, 0.35) : mix(C.dirt, C.forestFloor, clamp(0.4 - n1, 0, 0.3));
          c = mul(c, 0.85 + (n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.2);
          const [f1] = worley2(u * 5, v * 5, PER * 5, seed + 4); if (f1 < 0.12) c = mix(mul(C.rock, 1.05 - f1 * 3), c, 0.25);
          break;
        }
        case 'forestFloor': {
          const n1 = fbm2(u * 2, v * 2, PER * 2, seed, 4), n2 = fbm2(u * 10, v * 10, PER * 10, seed + 5, 2);
          c = mul(mix(C.forestFloor, C.dirt, clamp(n1 - 0.4, 0, 0.5)), 0.8 + (n2 - 0.5) * 0.4);
          break;
        }
        case 'sand': {
          const n1 = fbm2(u * 2, v * 2, PER * 2, seed, 4), r = Math.sin((u * 2 + v * 3) * Math.PI * 2 / PER * 4 + n1 * 6) * 0.5 + 0.5;
          c = mul(C.sand, 0.88 + (n1 - 0.5) * 0.25 + r * 0.08 + (h < 0.04 ? -0.12 : h > 0.96 ? 0.08 : 0));
          break;
        }
        case 'rock': {
          const n0 = fbm2(u * 1.5, v * 1.5, PER * 1.5, seed + 4, 4), n = fbm2(u * 6, v * 6, PER * 6, seed + 1, 3);
          const [f1, f2] = worley2(u * 4, v * 4, PER * 4, seed);
          c = mix(mix(C.rock, C.dirt, clamp(0.55 - n0, 0, 0.45)), C.dryGrass, clamp(n0 - 0.62, 0, 0.3));
          c = mul(c, 0.82 + (n - 0.5) * 0.35);
          if (f1 < 0.22) c = mul(mix(C.rock, C.stone, 0.4), 1.12 - f1 * 1.2); else if (f1 < 0.27) c = mul(C.rock, 0.55);
          if (f2 - f1 < 0.03 && n0 < 0.5) c = mul(c, 0.8);
          break;
        }
        case 'snow': {
          const n1 = fbm2(u * 1.5, v * 1.5, PER * 1.5, seed, 4), n2 = fbm2(u * 6, v * 6, PER * 6, seed + 1, 2);
          c = mul(mix(C.snow, hexf('#b9c8dc'), clamp(0.5 - n1, 0, 0.5)), 0.92 + (n2 - 0.5) * 0.12 + (h > 0.985 ? 0.08 : 0));
          break;
        }
        case 'shallow': {
          const [f1, f2] = worley2(u * 2.5, v * 2.5, PER * 2.5, seed); const n = fbm2(u * 2, v * 2, PER * 2, seed + 2, 3);
          c = mul(mix(C.shallow, C.sand, clamp(n - 0.45, 0, 0.3)), 0.9 + (n - 0.5) * 0.2);
          if (f2 - f1 < 0.035) c = mix(c, hexf('#a9dede'), 0.18);
          break;
        }
        case 'deep': {
          const n = fbm2(u * 1.5, v * 3, PER * 1.5, seed, 4), w = Math.sin((u * 2 - v) * Math.PI * 2 / PER * 6 + n * 8);
          c = mul(C.deep, 0.88 + (n - 0.5) * 0.3 + (w > 0.93 ? 0.22 : 0));
          break;
        }
        default: c = [1, 0, 1];
      }
      put(x, y, c);
    }
    // detail strokes
    const R = rng(seed);
    if (id === 'grass' || id === 'grassLush' || id === 'dryGrass') {
      const n = id === 'dryGrass' ? 2600 : 4200;
      for (let k = 0; k < n; k++) {
        const x0 = R() * T | 0, y0 = R() * T | 0, len = 2 + R() * 4 | 0, a = R() * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
        const base = get(x0, y0), m = R() < 0.5 ? 0.78 : 1.18;
        for (let s = 0; s < len; s++) put(Math.round(x0 + dx * s), Math.round(y0 + dy * s), mul(base, m));
      }
      if (id !== 'dryGrass') for (let k = 0; k < 40; k++) { const x0 = R() * T | 0, y0 = R() * T | 0, col = [hexf('#f1e9c8'), hexf('#e8c94a'), hexf('#b59ad6')][k % 3]; put(x0, y0, col); put(x0 + 1, y0, col); }
    }
    if (id === 'forestFloor') for (let k = 0; k < 3000; k++) {
      const x0 = R() * T | 0, y0 = R() * T | 0, col = [C.dryGrass, mix(C.dirt, C.berry, 0.3), C.leaf, mul(C.bark, 0.8)][R() * 4 | 0];
      put(x0, y0, col); if (R() < 0.6) put(x0 + 1, y0, col); if (R() < 0.4) put(x0, y0 + 1, mul(col, 0.85));
    }
    if (id === 'dirt' || id === 'road' || id === 'sand') for (let k = 0; k < 500; k++) {
      const x0 = R() * T | 0, y0 = R() * T | 0, base = get(x0, y0);
      put(x0, y0, mul(base, 1.2)); put(x0 + 1, y0, mul(base, 1.05)); put(x0, y0 + 1, mul(base, 0.7)); put(x0 + 1, y0 + 1, mul(base, 0.75));
    }
    // quantize to palette
    const out = new Uint8ClampedArray(T * T * 4);
    for (let i = 0; i < T * T; i++) { const q = PAL.quantize(d[i * 3] * 255, d[i * 3 + 1] * 255, d[i * 3 + 2] * 255); out[i * 4] = q[0]; out[i * 4 + 1] = q[1]; out[i * 4 + 2] = q[2]; out[i * 4 + 3] = 255; }
    return out;
  }
  root.TERRAINTEX = { make, size: T, types: S.terrain.types.map(t => t.id) };
})(typeof window !== 'undefined' ? window : globalThis);
