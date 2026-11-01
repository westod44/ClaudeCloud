// Scenery kit (bible section 12): four conifers, three broadleaf, two dead trees,
// three saplings, three fern clumps, six rocks, three logs, two stumps.
// Each entry returns { geo, mats } suitable for InstancedMesh.
import * as THREE from '../vendor/three.module.js';
import { mergeParts, xform, cyl, beam, facetize, scaleUV, M } from './geo.js';
import { mulberry32 } from './textures.js';

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// ------------------------------------------------------------------ conifers
const CONIFER_SPECS = [
  { h: 17, r: 2.6, tiers: 5, trunkR: 0.26, startY: 0.32, tone: 0 },
  { h: 13, r: 2.2, tiers: 4, trunkR: 0.22, startY: 0.28, tone: 1 },
  { h: 20, r: 2.3, tiers: 6, trunkR: 0.3, startY: 0.42, tone: 2 }, // tall, bare lower trunk
  { h: 10, r: 2.4, tiers: 4, trunkR: 0.18, startY: 0.12, tone: 0 }, // dense young spruce
];

export function conifer(i) {
  return cached('conifer' + i, () => {
    const s = CONIFER_SPECS[i];
    const r = mulberry32(100 + i);
    const parts = [];
    parts.push({ geo: cyl(s.trunkR * 0.35, s.trunkR, s.h * 0.97, 6, { sv: s.h / 4 }), mat: 0 });
    const y0 = s.h * s.startY, span = s.h - y0;
    for (let t = 0; t < s.tiers; t++) {
      const f = t / s.tiers;
      const tierH = span * (0.42 - f * 0.12);
      const base = y0 + span * f * 0.82;
      const rad = s.r * (1 - f * 0.78) * (0.9 + r() * 0.2);
      const g = new THREE.CylinderGeometry(0, rad, tierH, 7, 1, true);
      g.translate(0, base + tierH / 2, 0);
      g.rotateY(r() * Math.PI);
      scaleUV(g, 3, 1);
      parts.push({ geo: g, mat: 1 });
    }
    return { geo: mergeParts(parts), mats: [M.bark(), M.needles(s.tone)], radius: s.r, trunkR: s.trunkR };
  });
}

// ------------------------------------------------------------------ broadleaf (beech-like, autumn)
export function broadleaf(i) {
  return cached('broad' + i, () => {
    const r = mulberry32(200 + i);
    const h = [11, 9, 13][i], tr = [0.32, 0.26, 0.36][i];
    const parts = [{ geo: cyl(tr * 0.55, tr, h * 0.62, 7, { sv: 3 }), mat: 0 }];
    const crownY = h * 0.6;
    const nb = 4 + i;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2 + r() * 0.6;
      const len = 2.2 + r() * 2.2;
      const by = crownY - 0.6 + r() * 1.6;
      const ex = Math.cos(a) * len, ez = Math.sin(a) * len, ey = by + 1.2 + r() * 2.2;
      parts.push({ geo: beam(0, by, 0, ex, ey, ez, tr * 0.32, 5), mat: 0 });
      // leaf cluster cards at branch ends (crossed quads)
      const size = 2.6 + r() * 1.6;
      for (let k = 0; k < 2; k++) {
        const g = new THREE.PlaneGeometry(size, size * 0.8);
        g.rotateY(k * Math.PI / 2 + a);
        g.translate(ex, ey + 0.2, ez);
        parts.push({ geo: g, mat: 1 });
      }
      const g2 = new THREE.PlaneGeometry(size * 0.9, size * 0.9);
      g2.rotateX(-Math.PI / 2); g2.translate(ex, ey + 0.6, ez);
      parts.push({ geo: g2, mat: 1 });
    }
    // top cluster
    for (let k = 0; k < 3; k++) {
      const g = new THREE.PlaneGeometry(3.2, 3);
      g.rotateY(k * Math.PI / 3); g.translate(0, h - 0.8, 0);
      parts.push({ geo: g, mat: 1 });
    }
    return { geo: mergeParts(parts), mats: [M.beech(), M.leaf(i)], radius: 3.2, trunkR: tr };
  });
}

// ------------------------------------------------------------------ dead trees
export function deadTree(i) {
  return cached('dead' + i, () => {
    const r = mulberry32(300 + i);
    const h = [8, 6][i], tr = [0.3, 0.24][i];
    const parts = [{ geo: cyl(tr * 0.4, tr, h, 6, { sv: 2.5 }), mat: 0 }];
    for (let b = 0; b < 3; b++) {
      const a = r() * Math.PI * 2, y = h * (0.45 + r() * 0.4), len = 0.8 + r() * 1.6;
      parts.push({ geo: beam(0, y, 0, Math.cos(a) * len, y + len * 0.6, Math.sin(a) * len, 0.07, 4), mat: 0 });
    }
    return { geo: mergeParts(parts), mats: [M.bark()], radius: 0.5, trunkR: tr };
  });
}

// ------------------------------------------------------------------ saplings
export function sapling(i) {
  return cached('sapling' + i, () => {
    const r = mulberry32(400 + i);
    const parts = [];
    if (i < 2) {
      const h = 2.2 + i;
      parts.push({ geo: cyl(0.02, 0.06, h, 5), mat: 0 });
      for (let t = 0; t < 3; t++) {
        const g = new THREE.CylinderGeometry(0, 0.9 - t * 0.25, 1.0, 6, 1, true);
        g.translate(0, 0.6 + t * 0.6 + 0.5, 0); g.rotateY(r() * 3); scaleUV(g, 2, 1);
        parts.push({ geo: g, mat: 1 });
      }
      return { geo: mergeParts(parts), mats: [M.bark(), M.needles(1)], radius: 0.9, trunkR: 0.06 };
    }
    parts.push({ geo: cyl(0.02, 0.05, 2.4, 5), mat: 0 });
    for (let k = 0; k < 2; k++) {
      const g = new THREE.PlaneGeometry(1.5, 1.4); g.rotateY(k * Math.PI / 2); g.translate(0, 2.1, 0);
      parts.push({ geo: g, mat: 1 });
    }
    return { geo: mergeParts(parts), mats: [M.beech(), M.leaf(1)], radius: 0.8, trunkR: 0.05 };
  });
}

// ------------------------------------------------------------------ ferns
export function fern(i) {
  return cached('fern' + i, () => {
    const r = mulberry32(500 + i);
    const n = [6, 8, 5][i], len = [0.9, 1.15, 0.7][i];
    const parts = [];
    for (let k = 0; k < n; k++) {
      const g = new THREE.PlaneGeometry(0.42 * len, len, 1, 2);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const y = p.getY(v) + len / 2; // 0..len
        const bend = (y / len) * (y / len) * 0.45 * len;
        p.setXYZ(v, p.getX(v), y * 0.75, -bend);
      }
      g.rotateX(-0.35 - r() * 0.3);
      g.rotateY((k / n) * Math.PI * 2 + r() * 0.4);
      parts.push({ geo: g, mat: 0 });
    }
    return { geo: mergeParts(parts), mats: [M.fern()], radius: len };
  });
}

// ------------------------------------------------------------------ rocks (few large facets)
export function rock(i) {
  return cached('rock' + i, () => {
    const r = mulberry32(600 + i);
    const g0 = new THREE.IcosahedronGeometry(1, i % 3 === 0 ? 1 : 0);
    const p = g0.attributes.position;
    // weld-like displacement by direction hash so shared vertices stay together
    const disp = new Map();
    for (let v = 0; v < p.count; v++) {
      const key = `${p.getX(v).toFixed(3)},${p.getY(v).toFixed(3)},${p.getZ(v).toFixed(3)}`;
      if (!disp.has(key)) disp.set(key, 0.72 + r() * 0.45);
      const d = disp.get(key);
      let y = p.getY(v) * d;
      if (y < -0.25) y = -0.25;
      p.setXYZ(v, p.getX(v) * d, y, p.getZ(v) * d);
    }
    const sx = [1.4, 1.0, 1.8, 1.2, 0.9, 2.2][i], sy = [0.8, 0.9, 0.7, 1.1, 0.6, 1.0][i], sz = [1.0, 1.2, 1.1, 0.9, 1.3, 1.4][i];
    g0.scale(sx, sy, sz);
    g0.translate(0, 0.22 * sy, 0);
    const g = facetize(g0, 0.45);
    return { geo: g, mats: [M.slate(i % 3)], radius: Math.max(sx, sz) };
  });
}

// ------------------------------------------------------------------ logs and stumps
export function log(i) {
  return cached('log' + i, () => {
    const len = [4, 3, 5.5][i], rr = [0.28, 0.22, 0.34][i];
    const g = new THREE.CylinderGeometry(rr * 0.9, rr, len, 7, 1, false);
    scaleUV(g, 1, len / 2);
    g.rotateZ(Math.PI / 2); g.translate(0, rr * 0.8, 0);
    return { geo: mergeParts([{ geo: g, mat: 0 }]), mats: [M.bark()], radius: len / 2 };
  });
}

export function stump(i) {
  return cached('stump' + i, () => {
    const r = [0.38, 0.28][i], h = [0.55, 0.4][i];
    const parts = [{ geo: cyl(r * 0.9, r * 1.15, h, 7), mat: 0 }];
    const top = new THREE.CircleGeometry(r * 0.9, 7); top.rotateX(-Math.PI / 2); top.translate(0, h + 0.005, 0);
    parts.push({ geo: top, mat: 1 });
    return { geo: mergeParts(parts), mats: [M.bark(), M.timber(2)], radius: r };
  });
}

export const KIT = {
  conifer: [0, 1, 2, 3].map(i => () => conifer(i)),
  broadleaf: [0, 1, 2].map(i => () => broadleaf(i)),
  dead: [0, 1].map(i => () => deadTree(i)),
  sapling: [0, 1, 2].map(i => () => sapling(i)),
  fern: [0, 1, 2].map(i => () => fern(i)),
  rock: [0, 1, 2, 3, 4, 5].map(i => () => rock(i)),
  log: [0, 1, 2].map(i => () => log(i)),
  stump: [0, 1].map(i => () => stump(i)),
};
