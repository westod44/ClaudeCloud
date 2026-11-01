// Geometry utilities: merging coarse parts into single meshes, simple primitives.
import * as THREE from '../vendor/three.module.js';
import { TEX } from './textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function xform(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, s = null, order = 'YXZ' } = {}) {
  if (s !== null) { sx = sy = sz = s; }
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

function ensureNonIndexed(g) {
  return g.index ? g.toNonIndexed() : g;
}

// Merge [{geo, mat}] into one BufferGeometry with material groups.
export function mergeParts(parts) {
  const byMat = new Map();
  for (const p of parts) {
    const g = ensureNonIndexed(p.geo);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!byMat.has(p.mat)) byMat.set(p.mat, []);
    byMat.get(p.mat).push(g);
  }
  const mats = [...byMat.keys()].sort((a, b) => a - b);
  let total = 0;
  for (const m of mats) for (const g of byMat.get(m)) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const hasColor = parts.some(p => p.geo.attributes.color);
  const col = hasColor ? new Float32Array(total * 3) : null;
  const out = new THREE.BufferGeometry();
  let off = 0;
  for (const m of mats) {
    const start = off;
    for (const g of byMat.get(m)) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, off * 3);
      nor.set(g.attributes.normal.array, off * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
      if (col) {
        if (g.attributes.color) col.set(g.attributes.color.array, off * 3);
        else col.fill(1, off * 3, (off + n) * 3);
      }
      off += n;
    }
    out.addGroup(start * 1, off - start, m);
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

// Flat shading with per-face planar UV projection (broad facets on rocks).
export function facetize(geo, uvScale = 0.5) {
  const g = ensureNonIndexed(geo);
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    e1.subVectors(b, a); e2.subVectors(c, a); fn.crossVectors(e1, e2).normalize();
    for (let k = 0; k < 3; k++) n.setXYZ(i + k, fn.x, fn.y, fn.z);
    const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      let u0, v0;
      if (ay >= ax && ay >= az) { u0 = v.x; v0 = v.z; } else if (ax >= az) { u0 = v.z; v0 = v.y; } else { u0 = v.x; v0 = v.y; }
      uv[(i + k) * 2] = u0 * uvScale; uv[(i + k) * 2 + 1] = v0 * uvScale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function box(w, h, d, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (opts.uvWorld) {
    // scale UVs to roughly world size so plank textures don't stretch
    const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      let u, v;
      if (ny > 0.5) { u = p.getX(i); v = p.getZ(i); } else if (nx > 0.5) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
      uv.setXY(i, u * opts.uvWorld, v * opts.uvWorld);
    }
  }
  return g;
}

export function cyl(rTop, rBot, h, seg = 7, opts = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, opts.hseg || 1, !!opts.open);
  g.translate(0, h / 2, 0);
  if (opts.su || opts.sv) scaleUV(g, opts.su || 1, opts.sv || 1);
  return g;
}

// A beam between two points (used for legs, braces, rails, branches).
export function beam(ax, ay, az, bx, by, bz, r = 0.08, seg = 5, square = false) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const g = square ? new THREE.BoxGeometry(r * 2, len, r * 2) : new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(ax, ay, az);
  scaleUV(g, 1, len);
  return g;
}

export function quad(w, h, opts = {}) {
  const g = new THREE.PlaneGeometry(w, h, opts.ws || 1, opts.hs || 1);
  return g;
}

// ---------------------------------------------------------------- materials
const matCache = new Map();
export function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}
export const lam = (opts) => new THREE.MeshLambertMaterial(opts);

export const M = {
  bark: () => mat('bark', () => lam({ map: TEX.bark() })),
  beech: () => mat('beech', () => lam({ map: TEX.beech() })),
  scar: () => mat('scar', () => lam({ map: TEX.scar() })),
  slate: (v = 0) => mat('slate' + v, () => lam({ map: TEX.slate(v) })),
  slateY: () => mat('slateY', () => lam({ map: TEX.slateY() })),
  needles: (t = 0) => mat('needles' + t, () => lam({ map: TEX.needles(t), alphaTest: 0.5, side: THREE.DoubleSide })),
  fern: () => mat('fern', () => lam({ map: TEX.fern(), alphaTest: 0.5, side: THREE.DoubleSide })),
  leaf: (t = 0) => mat('leaf' + t, () => lam({ map: TEX.leafCluster(t), alphaTest: 0.5, side: THREE.DoubleSide })),
  terrain: () => mat('terrain', () => lam({ map: TEX.litter(), vertexColors: true })),
  gravel: () => mat('gravel', () => lam({ map: TEX.gravel() })),
  timber: (t = 0) => mat('timber' + t, () => lam({ map: TEX.timber(t) })),
  cloth: () => mat('cloth', () => lam({ map: TEX.canvasCloth(), side: THREE.DoubleSide })),
  concrete: () => mat('concrete', () => lam({ map: TEX.concrete() })),
  roof: () => mat('roof', () => lam({ map: TEX.roof(), side: THREE.DoubleSide })),
  water: () => mat('water', () => lam({ map: TEX.water(), color: 0xb8c4c8 })),
  door: () => mat('door', () => lam({ map: TEX.door() })),
  postBars: () => mat('postBars', () => lam({ map: TEX.postBars() })),
  asphalt: () => mat('asphalt', () => lam({ map: TEX.asphalt() })),
  ribbon: () => mat('ribbon', () => lam({ map: TEX.ribbon() })),
  metal: () => mat('metal', () => lam({ map: TEX.metal() })),
  roots: () => mat('roots', () => lam({ map: TEX.roots(), side: THREE.DoubleSide })),
  flat: (hexcol) => mat('flat' + hexcol, () => lam({ color: hexcol })),
  flatDS: (hexcol) => mat('flatDS' + hexcol, () => lam({ color: hexcol, side: THREE.DoubleSide })),
  basic: (hexcol) => mat('basic' + hexcol, () => new THREE.MeshBasicMaterial({ color: hexcol })),
  emissive: (hexcol) => mat('emis' + hexcol, () => new THREE.MeshBasicMaterial({ color: hexcol, fog: true })),
  tex: (key, texture, extra = {}) => mat('tex:' + key, () => lam({ map: texture, ...extra })),
  notebook: () => mat('notebook', () => lam({ map: TEX.notebook() })),
  paperMap: () => mat('paperMap', () => lam({ map: TEX.paperMap() })),
  window: () => mat('window', () => lam({ map: TEX.windowPane(), emissive: 0x1a2028 })),
  leafSprite: () => mat('leafSprite', () => lam({ map: TEX.leafSprite(), alphaTest: 0.5, side: THREE.DoubleSide })),
};

export function meshOf(geo, materials) {
  return new THREE.Mesh(geo, materials);
}
