// Seeded value noise for gentle terrain undulation.
export function makeNoise(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256).map(() => rnd() * 2 - 1);
  const fade = t => t * t * (3 - 2 * t);
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = val[perm[(xi & 255) + perm[yi & 255]]];
    const b = val[perm[((xi + 1) & 255) + perm[yi & 255]]];
    const c = val[perm[(xi & 255) + perm[(yi + 1) & 255]]];
    const d = val[perm[((xi + 1) & 255) + perm[(yi + 1) & 255]]];
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 3) {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { sum += n2(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  return { n2, fbm };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// distance from point to segment, returns {d, t, cx, cz}
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

export function polyDist(px, pz, pts) {
  let best = { d: Infinity, seg: 0, t: 0, cx: 0, cz: 0, s: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const r = segDist(px, pz, ax, az, bx, bz);
    const len = Math.hypot(bx - ax, bz - az);
    if (r.d < best.d) best = { d: r.d, seg: i, t: r.t, cx: r.cx, cz: r.cz, s: acc + len * r.t };
    acc += len;
  }
  return best;
}
