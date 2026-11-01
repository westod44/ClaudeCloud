// A Place is one compact local scene (bible section 19): terrain, trails, landmarks,
// collision, ambience and the mouths (hidden joins) that connect it to other places.
import * as THREE from '../vendor/three.module.js';
import { makeNoise, smooth, lerp, segDist, polyDist, clamp } from './noise.js';
import { M } from './geo.js';
import { KIT } from './kit.js';
import { mulberry32 } from './textures.js';

const LITTER_AVG = 0.74;

function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export class Place {
  constructor(id, opts = {}) {
    this.id = id;
    this.name = opts.name || id;
    this.variant = opts.variant || '';
    this.group = new THREE.Group();
    this.group.name = id;
    this.group.visible = false;
    this.mouths = {};
    this.walk = [];
    this.obstacles = [];
    this.interactables = [];
    this.triggers = [];
    this.emitters = [];
    this.lights = [];
    this.dyn = [];
    this.trails = [];
    this.creeks = [];
    this.areas = [];
    this.keepouts = [];
    this.paths = {};
    this.instances = new Map();
    this.ambience = opts.ambience || 'forest';
    this.fogScale = opts.fogScale || 1;
    this.fogTint = opts.fogTint || null;
    this.ambientScale = opts.ambientScale ?? 1;
    this.flashScale = opts.flashScale ?? 1;
    this.indoor = !!opts.indoor;
    this.exposed = !!opts.exposed; // ridge wind exposure
    this.spawn = opts.spawn || { x: 0, z: 0, yaw: 0 };
    this.noise = makeNoise(hashStr(id) || 7);
    this.amp = opts.amp ?? 1.2;
    this.base = opts.height || null;
    this.groundColor = opts.groundColor || null;
    this.terrain = opts.terrain !== false;
    this.cell = opts.cell || 1.5;
    this.boundsOverride = opts.bounds || null;
    this.margin = opts.margin ?? 24;
    this.scatterCfg = null;
    this.colorFn = opts.colorFn || null;
    this.onUpdate = null;
    this.rnd = mulberry32(hashStr(id + 'r'));
  }

  // ---------------------------------------------------------------- heights
  rawHeight(x, z) {
    let h = this.base ? this.base(x, z, this.noise) : this.noise.fbm(x * 0.035, z * 0.035) * this.amp * 2;
    for (const c of this.creeks) {
      const r = polyDist(x, z, c.pts);
      const hw = c.w / 2;
      const f = 1 - smooth((r.d - hw * 0.65) / (hw * 0.35 + 1.4));
      if (f > 0) h -= c.depth * f;
    }
    return h;
  }

  heightAt(x, z) {
    let h = this.rawHeight(x, z);
    for (const id in this.mouths) {
      const m = this.mouths[id];
      if (m.kind !== 'trail') continue;
      const dx = x - m.x, dz = z - m.z;
      const d = dx * m.ox + dz * m.oz, l = dx * m.rx + dz * m.rz;
      const wd = 1 - smooth((Math.abs(d) - 1) / 9);
      const wl = 1 - smooth((Math.abs(l) - (m.halfW - 3)) / 5);
      const w = wd * wl;
      if (w > 0) h = lerp(h, m.y, w);
    }
    return h;
  }

  // ---------------------------------------------------------------- authoring
  trail(pts, o = {}) {
    const t = { pts, w: o.w ?? 1.6, worn: o.worn ?? 0.7, surf: o.surf || 'leaves', walkR: o.walkR ?? ((o.w ?? 1.6) / 2 + 0.5) };
    this.trails.push(t);
    if (o.walk !== false) {
      for (let i = 0; i < pts.length - 1; i++) {
        this.walk.push({ k: 'cap', ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], r: t.walkR, surf: t.surf, enabled: o.enabled, trail: t });
      }
    }
    if (o.name) this.paths[o.name] = pts;
    return t;
  }

  area(x, z, r, o = {}) {
    const a = { k: 'circ', x, z, r, surf: o.surf || 'leaves', worn: o.worn ?? 0.25, enabled: o.enabled, refuge: o.refuge, inside: o.inside };
    this.areas.push(a);
    if (o.walk !== false) this.walk.push(a);
    return a;
  }

  rect(x, z, hw, hd, rot = 0, o = {}) {
    const s = { k: 'rect', x, z, hw, hd, rot, h: o.h || null, surf: o.surf || 'timber', enabled: o.enabled, inside: o.inside, refuge: o.refuge, ceiling: o.ceiling };
    this.walk.push(s);
    if (o.paint) this.areas.push({ ...s, worn: o.worn ?? 0.3, paintRect: true });
    return s;
  }

  creek(pts, o = {}) {
    const c = { pts, w: o.w ?? 3, depth: o.depth ?? 0.55, water: o.water ?? 0.24, speed: o.speed ?? 1, visible: o.visible !== false };
    this.creeks.push(c);
    return c;
  }

  keepout(x, z, r) { this.keepouts.push({ x, z, r }); }

  mouth(id, x, z, ox, oz, o = {}) {
    const L = Math.hypot(ox, oz); ox /= L; oz /= L;
    const m = {
      id, x, z, ox, oz, rx: -oz, rz: ox, // right-hand lateral (looking outward)
      theta: Math.atan2(ox, oz),
      halfW: o.halfW ?? 12, top: o.top ?? 34, bottom: o.bottom ?? -8,
      kind: o.kind || 'trail', y: o.y ?? null, place: this,
      depthIn: o.depthIn ?? 0.5, depthOut: o.depthOut ?? 0.25,
    };
    this.mouths[id] = m;
    if (o.extend !== false && m.kind === 'trail') {
      // walkable continues 1.5 m past the join so the plane can be crossed
      const w = o.walkR ?? 1.35;
      this.walk.push({ k: 'cap', ax: x - ox * 1.5, az: z - oz * 1.5, bx: x + ox * 1.5, bz: z + oz * 1.5, r: w, surf: o.surf || 'leaves' });
    }
    return m;
  }

  mouthAtEnd(trail, id, o = {}) {
    const p = trail.pts, n = p.length;
    const [ax, az] = p[n - 2], [bx, bz] = p[n - 1];
    return this.mouth(id, bx, bz, bx - ax, bz - az, { surf: trail.surf, walkR: trail.walkR, ...o });
  }

  mouthAtStart(trail, id, o = {}) {
    const p = trail.pts;
    const [ax, az] = p[1], [bx, bz] = p[0];
    return this.mouth(id, bx, bz, bx - ax, bz - az, { surf: trail.surf, walkR: trail.walkR, ...o });
  }

  obstacle(o) { this.obstacles.push(o); return o; }
  circ(x, z, r, o = {}) { return this.obstacle({ k: 'circ', x, z, r, ...o }); }
  box(x, z, hw, hd, rot = 0, o = {}) { return this.obstacle({ k: 'rect', x, z, hw, hd, rot, ...o }); }

  put(obj, x, z, o = {}) {
    const y = o.y ?? (this.heightAt(x, z) + (o.dy || 0));
    obj.position.set(x, y, z);
    if (o.ry) obj.rotation.y = o.ry;
    if (o.s) obj.scale.setScalar(o.s);
    this.group.add(obj);
    return obj;
  }

  inst(kitItem, x, z, o = {}) {
    if (!this.instances.has(kitItem)) this.instances.set(kitItem, []);
    const y = o.y ?? (this.heightAt(x, z) + (o.dy || 0));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    const s = o.s ?? 1;
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(o.sx ?? s, o.sy ?? s, o.sz ?? s));
    this.instances.get(kitItem).push(m);
  }

  interact(o) { this.interactables.push(o); return o; }
  trigger(o) { this.triggers.push({ inside: false, fired: false, ...o }); }
  emitter(o) { this.emitters.push({ id: o.id || `${o.type}${this.emitters.length}`, gain: 1, ...o }); }
  light(o) { this.lights.push(o); }
  scatter(cfg) { this.scatterCfg = cfg; }

  // signed clearance from walkable/creek/keepouts (positive = outside)
  clearance(x, z) {
    let c = Infinity;
    for (const s of this.walk) {
      let d;
      if (s.k === 'cap') d = segDist(x, z, s.ax, s.az, s.bx, s.bz).d - s.r;
      else if (s.k === 'circ') d = Math.hypot(x - s.x, z - s.z) - s.r;
      else {
        const dx = x - s.x, dz = z - s.z, co = Math.cos(s.rot), sn = Math.sin(s.rot);
        const lx = dx * co - dz * sn, lz = dx * sn + dz * co;
        d = Math.max(Math.abs(lx) - s.hw, Math.abs(lz) - s.hd);
      }
      if (d < c) c = d;
    }
    for (const k of this.keepouts) c = Math.min(c, Math.hypot(x - k.x, z - k.z) - k.r);
    return c;
  }

  creekClear(x, z) {
    let c = Infinity;
    for (const k of this.creeks) c = Math.min(c, polyDist(x, z, k.pts).d - k.w / 2);
    return c;
  }

  // true if (x,z) with radius r would cross a join plane in the visible band
  nearMouth(x, z, r) {
    for (const id in this.mouths) {
      const m = this.mouths[id];
      const dx = x - m.x, dz = z - m.z;
      const d = dx * m.ox + dz * m.oz, l = dx * m.rx + dz * m.rz;
      if (m.kind !== 'trail') { if (Math.hypot(dx, dz) < r + 2) return true; continue; }
      if (Math.abs(l) < m.halfW + 6 && d > -(r + 0.4) && d < 140) return true;
      if (Math.abs(l) < 8 && d > -(r + 0.4) - 0.5) return true;
    }
    return false;
  }

  bounds() {
    if (this.boundsOverride) return this.boundsOverride;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const add = (x, z, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); };
    for (const t of this.trails) for (const [x, z] of t.pts) add(x, z, t.w);
    for (const a of this.areas) add(a.x, a.z, a.r || Math.max(a.hw || 0, a.hd || 0));
    for (const id in this.mouths) add(this.mouths[id].x, this.mouths[id].z);
    const m = this.margin;
    return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
  }

  // ---------------------------------------------------------------- build
  colorAt(x, z) {
    const n = this.noise;
    const n1 = n.n2(x * 0.09 + 31, z * 0.09 - 7) * 0.5 + 0.5;
    const n2 = n.n2(x * 0.23 - 3, z * 0.23 + 11) * 0.5 + 0.5;
    const c = new THREE.Color(0x5f5040).lerp(new THREE.Color(0x433a2f), n1 * 0.8);
    if (n2 > 0.58) c.lerp(new THREE.Color(0x7a4a2c), Math.min(0.55, (n2 - 0.58) * 2.2));
    if (n2 < 0.25) c.lerp(new THREE.Color(0x45503f), (0.25 - n2) * 1.6);
    // trails: worn pale centre, leaves at the edges
    let worn = 0, gravel = 0;
    for (const t of this.trails) {
      const r = polyDist(x, z, t.pts);
      const w = 1 - smooth((r.d - t.worn / 2) / (t.w / 2 - t.worn / 2 + 0.6));
      if (t.surf === 'gravel') gravel = Math.max(gravel, w);
      else if (t.surf !== 'none') worn = Math.max(worn, w);
    }
    for (const a of this.areas) {
      let inside;
      if (a.k === 'circ') inside = 1 - smooth((Math.hypot(x - a.x, z - a.z) - a.r * 0.6) / (a.r * 0.5));
      else {
        const dx = x - a.x, dz = z - a.z, co = Math.cos(a.rot), sn = Math.sin(a.rot);
        const lx = dx * co - dz * sn, lz = dx * sn + dz * co;
        inside = 1 - smooth(Math.max(Math.abs(lx) - a.hw, Math.abs(lz) - a.hd) / 1.5 + 0.5);
      }
      if (a.surf === 'gravel') gravel = Math.max(gravel, inside);
      else worn = Math.max(worn, inside * (a.worn ?? 0.25));
    }
    if (worn > 0) c.lerp(new THREE.Color(0x968b75).lerp(new THREE.Color(0x7d725f), n2 * 0.6), Math.min(1, worn * 1.05));
    if (gravel > 0) c.lerp(new THREE.Color(0x7c7b75), gravel);
    // wet creek banks
    for (const k of this.creeks) {
      const d = polyDist(x, z, k.pts).d - k.w / 2;
      if (d < 2.5) c.lerp(new THREE.Color(0x2f2b26), (1 - smooth(d / 2.5)) * 0.7);
    }
    if (this.colorFn) this.colorFn(x, z, c);
    c.multiplyScalar(1 / LITTER_AVG);
    return c;
  }

  buildTerrain() {
    const b = this.bounds();
    const cs = this.cell;
    const nx = Math.ceil((b.x1 - b.x0) / cs), nz = Math.ceil((b.z1 - b.z0) / cs);
    const V = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = b.x0 + i * cs, z = b.z0 + j * cs;
      V.push(this.vert(x, z));
    }
    const mouths = Object.values(this.mouths).filter(m => m.kind === 'trail');
    const pos = [], nor = [], col = [], uv = [];
    const pushV = v => { pos.push(v.x, v.y, v.z); nor.push(v.nx, v.ny, v.nz); col.push(v.r, v.g, v.b); uv.push(v.x / 3.2, v.z / 3.2); };
    const tri = (a, b2, c) => {
      let poly = [a, b2, c];
      for (const m of mouths) {
        const cx = (a.x + b2.x + c.x) / 3, cz = (a.z + b2.z + c.z) / 3;
        const l = (cx - m.x) * m.rx + (cz - m.z) * m.rz;
        const dc = (cx - m.x) * m.ox + (cz - m.z) * m.oz;
        if (Math.abs(l) > m.halfW + 2 || dc > 150 || dc < -6) continue;
        poly = this.clipPoly(poly, m);
        if (poly.length < 3) return;
      }
      for (let k = 1; k < poly.length - 1; k++) { pushV(poly[0]); pushV(poly[k]); pushV(poly[k + 1]); }
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = V[j * (nx + 1) + i], b2 = V[j * (nx + 1) + i + 1];
      const c = V[(j + 1) * (nx + 1) + i], d = V[(j + 1) * (nx + 1) + i + 1];
      if ((i + j) % 2) { tri(a, c, b2); tri(b2, c, d); } else { tri(a, c, d); tri(a, d, b2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, M.terrain());
    mesh.name = 'terrain';
    this.group.add(mesh);
  }

  vert(x, z) {
    const y = this.heightAt(x, z);
    const e = 0.4;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize();
    const c = this.colorAt(x, z);
    return { x, y, z, nx: n.x, ny: n.y, nz: n.z, r: c.r, g: c.g, b: c.b };
  }

  clipPoly(poly, m) {
    const out = [];
    const dist = v => (v.x - m.x) * m.ox + (v.z - m.z) * m.oz;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = dist(a), db = dist(b);
      if (da <= 0) out.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const t = da / (da - db);
        const L = (p, q) => p + (q - p) * t;
        out.push({ x: L(a.x, b.x), y: L(a.y, b.y), z: L(a.z, b.z), nx: L(a.nx, b.nx), ny: L(a.ny, b.ny), nz: L(a.nz, b.nz), r: L(a.r, b.r), g: L(a.g, b.g), b: L(a.b, b.b) });
      }
    }
    return out;
  }

  buildWater() {
    for (const c of this.creeks) {
      if (!c.visible) continue;
      const pos = [], uv = [], nor = [];
      let s = 0;
      const pts = c.pts;
      const rows = [];
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i];
        const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
        let dx = bx - ax, dz = bz - az; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        if (i > 0) s += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
        const hw = c.w / 2 * 0.82;
        const y = this.heightAt(x, z) + c.water;
        rows.push([{ x: x - dz * hw, z: z + dx * hw, y, u: 0, v: s / 4 }, { x: x + dz * hw, z: z - dx * hw, y, u: 1, v: s / 4 }]);
      }
      for (let i = 0; i < rows.length - 1; i++) {
        const [a, b] = rows[i], [cc, d] = rows[i + 1];
        for (const v of [a, cc, b, b, cc, d]) { pos.push(v.x, v.y, v.z); uv.push(v.u, v.v); nor.push(0, 1, 0); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const mesh = new THREE.Mesh(g, M.water());
      mesh.material.side = THREE.DoubleSide;
      this.group.add(mesh);
    }
  }

  runScatter() {
    const cfg = this.scatterCfg;
    if (!cfg) return;
    const b = this.bounds();
    const r = mulberry32(hashStr(this.id + 'scatter') + (cfg.seed || 0));
    const sp = cfg.spacing ?? 3.6;
    const conifer = cfg.conifer ?? 0.65, dead = cfg.dead ?? 0.05, sap = cfg.sapling ?? 0.06;
    const maxDist = cfg.maxDist ?? 26;
    for (let z = b.z0; z < b.z1; z += sp) {
      for (let x = b.x0; x < b.x1; x += sp) {
        const px = x + (r() - 0.5) * sp * 0.9, pz = z + (r() - 0.5) * sp * 0.9;
        const cl = this.clearance(px, pz);
        if (cl > maxDist) { if (r() < 0.6) continue; }
        if (cfg.mask && !cfg.mask(px, pz)) continue;
        const roll = r();
        let item, rad, minCl;
        if (roll < sap) { item = KIT.sapling[Math.floor(r() * 3)](); rad = 0.9; minCl = 0.6; }
        else if (roll < sap + dead) { item = KIT.dead[Math.floor(r() * 2)](); rad = 0.6; minCl = 0.9; }
        else if (r() < conifer) {
          const k = cfg.coniferTypes ? cfg.coniferTypes[Math.floor(r() * cfg.coniferTypes.length)] : Math.floor(r() * 4);
          item = KIT.conifer[k](); rad = k === 3 ? 2.4 : 1.6; minCl = k === 3 ? 2.0 : 1.1;
        } else { item = KIT.broadleaf[Math.floor(r() * 3)](); rad = 1.2; minCl = 1.0; }
        if (cl < minCl + (cfg.extraClear || 0)) continue;
        if (this.creekClear(px, pz) < 0.8) continue;
        if (this.nearMouth(px, pz, rad)) continue;
        const s = 0.8 + r() * 0.45;
        this.inst(item, px, pz, { ry: r() * Math.PI * 2, s, dy: -0.05 });
      }
    }
    // ferns along edges and in shaded moist clusters
    const fernN = cfg.ferns ?? 90;
    let placed = 0;
    for (let i = 0; i < fernN * 3 && placed < fernN; i++) {
      const s = this.walk[Math.floor(r() * this.walk.length)];
      if (!s || s.k === 'rect') continue;
      let x, z;
      if (s.k === 'cap') { const t = r(); x = s.ax + (s.bx - s.ax) * t; z = s.az + (s.bz - s.az) * t; }
      else { x = s.x; z = s.z; }
      const a = r() * Math.PI * 2, d = (s.r || 2) + 0.3 + r() * 3.5;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const cl = this.clearance(px, pz);
      if (cl < 0.15 || cl > 4.5) continue;
      if (this.creekClear(px, pz) < 0.2) continue;
      if (this.nearMouth(px, pz, 0.6)) continue;
      this.inst(KIT.fern[Math.floor(r() * 3)](), px, pz, { ry: r() * 6.3, s: 0.8 + r() * 0.6 });
      placed++;
    }
    // rocks
    const rockN = cfg.rocks ?? 24;
    placed = 0;
    for (let i = 0; i < rockN * 4 && placed < rockN; i++) {
      const px = b.x0 + r() * (b.x1 - b.x0), pz = b.z0 + r() * (b.z1 - b.z0);
      const cl = this.clearance(px, pz);
      if (cl < 1.2 || cl > 14) continue;
      if (this.nearMouth(px, pz, 2)) continue;
      const k = Math.floor(r() * 6);
      this.inst(KIT.rock[k](), px, pz, { ry: r() * 6.3, s: 0.5 + r() * 0.8, dy: -0.15 });
      placed++;
    }
    // logs and stumps
    const logN = cfg.logs ?? 6;
    placed = 0;
    for (let i = 0; i < logN * 4 && placed < logN; i++) {
      const px = b.x0 + r() * (b.x1 - b.x0), pz = b.z0 + r() * (b.z1 - b.z0);
      const cl = this.clearance(px, pz);
      if (cl < 2.2 || cl > 12) continue;
      if (this.nearMouth(px, pz, 3)) continue;
      if (r() < 0.6) this.inst(KIT.log[Math.floor(r() * 2)](), px, pz, { ry: r() * 6.3, dy: -0.1 });
      else this.inst(KIT.stump[Math.floor(r() * 2)](), px, pz, { ry: r() * 6.3 });
      placed++;
    }
  }

  buildInstances() {
    for (const [item, mats] of this.instances) {
      const im = new THREE.InstancedMesh(item.geo, item.mats, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  finalize() {
    for (const id in this.mouths) {
      const m = this.mouths[id];
      if (m.y === null) m.y = this.rawHeight(m.x, m.z);
      m.matrix = new THREE.Matrix4().compose(new THREE.Vector3(m.x, m.y, m.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.theta), new THREE.Vector3(1, 1, 1));
      m.inverse = m.matrix.clone().invert();
    }
    if (this.terrain) this.buildTerrain();
    this.buildWater();
    this.runScatter();
    this.buildInstances();
    this.group.updateMatrixWorld(true);
    return this;
  }

  update(dt, G) {
    for (const d of this.dyn) d(dt, G);
    if (this.onUpdate) this.onUpdate(dt, G);
  }
}

export function localOf(m, x, z) {
  const dx = x - m.x, dz = z - m.z;
  return { d: dx * m.ox + dz * m.oz, l: dx * m.rx + dz * m.rz };
}
