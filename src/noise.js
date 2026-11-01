/* Shared deterministic noise helpers (browser global NOISE). */
(function (root) {
  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  function hash3(x, y, z, s) { return hash(x + Math.imul(z | 0, 1013904223), y, s); }
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const wrap = (a, p) => ((a % p) + p) % p;
  const sm = t => t * t * (3 - 2 * t);
  // 2D value noise, periodic with period p (lattice cells); p large -> effectively non periodic
  function noise2(x, y, p, s) {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
    const x0 = wrap(xi, p), x1 = wrap(xi + 1, p), y0 = wrap(yi, p), y1 = wrap(yi + 1, p);
    const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm2(x, y, p, s, oct = 4) { let sum = 0, amp = .5, n = 0, f = 1; for (let o = 0; o < oct; o++) { sum += amp * noise2(x * f, y * f, p * f, s + o * 17); n += amp; amp *= .5; f *= 2; } return sum / n; }
  function noise3(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    const h = (a, b, c) => hash3(xi + a, yi + b, zi + c, s);
    const x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * u, x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * u;
    const x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * u, x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }
  function fbm3(x, y, z, s, oct = 3) { let sum = 0, amp = .5, n = 0, f = 1; for (let o = 0; o < oct; o++) { sum += amp * noise3(x * f, y * f, z * f, s + o * 31); n += amp; amp *= .5; f *= 2; } return sum / n; }
  // periodic worley -> [f1, f2, featureX, featureY]
  function worley2(x, y, p, s) {
    const xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9, fx = 0, fy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, mx = wrap(cx, p), my = wrap(cy, p);
      const px = cx + hash(mx, my, s), py = cy + hash(mx, my, s + 7), d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; fx = px; fy = py; } else if (d < f2) f2 = d;
    }
    return [f1, f2, fx, fy];
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const API = { hash, hash3, rng, wrap, noise2, fbm2, noise3, fbm3, worley2, clamp, smooth: sm };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.NOISE = API;
})(typeof window !== 'undefined' ? window : globalThis);
