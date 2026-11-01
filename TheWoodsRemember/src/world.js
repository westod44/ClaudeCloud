// Connection contract (bible section 19): human-readable source/exit → destination/entry
// records, rigid transforms between join frames, deferred relinking while occluded,
// and an arrival return link so turning 180° on a join always walks back.
import * as THREE from '../vendor/three.module.js';
import { localOf } from './place.js';

const R_PI = new THREE.Matrix4().makeRotationY(Math.PI);

export class World {
  constructor() {
    this.places = new Map();
    this.current = null;
    this.arrival = null; // { place, mouth, fromPlace, fromMouth, expired }
    this.pending = null; // arrival awaiting confirmation (1.5 m rearm band)
    this.cache = new Map(); // `${place}.${mouth}` → {place, mouth}
    this.table = () => null;
    this.onArrive = null;
    this.onCross = null;
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this._v = new THREE.Vector3();
    this.visible = new Set();
  }

  add(place) { this.places.set(place.id, place); return place; }
  get(id) { return this.places.get(id); }

  setCurrent(id) {
    this.current = this.places.get(id);
    this.cache.clear();
    this.refreshLinks(true);
  }

  desired(place, mouthId) {
    const a = this.arrival;
    if (a && !a.expired && a.place === place.id && a.mouth === mouthId) return { place: a.fromPlace, mouth: a.fromMouth };
    const r = this.table(place.id, mouthId);
    return r ? { place: r[0], mouth: r[1] } : null;
  }

  link(place, mouthId) {
    if (place !== this.current) return this.desired(place, mouthId);
    const key = place.id + '.' + mouthId;
    if (!this.cache.has(key)) this.cache.set(key, this.desired(place, mouthId));
    return this.cache.get(key);
  }

  // Story changes apply only while a join is out of view (no visible scenery swap).
  refreshLinks(force = false) {
    const p = this.current;
    if (!p) return;
    for (const id in p.mouths) {
      const key = p.id + '.' + id;
      const want = this.desired(p, id);
      const have = this.cache.get(key);
      const same = (have && want && have.place === want.place && have.mouth === want.mouth) || (!have && !want);
      if (same && this.cache.has(key)) continue;
      if (force || !this.cache.has(key) || !this.visible.has(id)) this.cache.set(key, want);
    }
  }

  mouthBox(m) {
    const b = this._box.makeEmpty();
    for (const sx of [-1, 1]) for (const sy of [m.bottom, m.top]) for (const sz of [-m.depthIn, m.depthOut]) {
      this._v.set(sx * m.halfW, sy, sz).applyMatrix4(m.matrix);
      b.expandByPoint(this._v);
    }
    return b;
  }

  updateVisibility(camera) {
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._m);
    this.visible.clear();
    const p = this.current;
    const cp = camera.position;
    for (const id in p.mouths) {
      const m = p.mouths[id];
      if (Math.hypot(cp.x - m.x, cp.z - m.z) > 170) continue;
      if (this.frustum.intersectsBox(this.mouthBox(m))) this.visible.add(id);
    }
  }

  // A-frame → B-frame rigid transform: Mb · Rπ · Ma⁻¹
  transform(mA, mB, out = new THREE.Matrix4()) {
    return out.multiplyMatrices(mB.matrix, R_PI).multiply(mA.inverse);
  }

  yawDelta(mA, mB) { return mB.theta + Math.PI - mA.theta; }

  update(player) {
    const p = this.current;
    // confirm a pending arrival once the player is 1.5 m inside
    if (this.pending && this.pending.place === p.id) {
      const m = p.mouths[this.pending.mouth];
      const loc = localOf(m, player.pos.x, player.pos.z);
      if (loc.d < -1.5) {
        const a = this.pending; this.pending = null;
        if (this.onArrive) this.onArrive(a);
      }
    }
    // expire the arrival return link once the player is well inside and the join is unseen
    const a = this.arrival;
    if (a && !a.expired && a.place === p.id) {
      const m = p.mouths[a.mouth];
      const dist = Math.hypot(player.pos.x - m.x, player.pos.z - m.z);
      if (dist > 8 && !this.visible.has(a.mouth)) a.expired = true;
    }
    this.refreshLinks();
  }

  // Detect crossing a join plane from the permitted (inside) side.
  tryCross(px, pz, nx, nz, feetY) {
    const p = this.current;
    for (const id in p.mouths) {
      const m = p.mouths[id];
      const a = localOf(m, px, pz), b = localOf(m, nx, nz);
      if (!(a.d < 0 && b.d >= 0)) continue;
      const t = a.d / (a.d - b.d);
      const l = a.l + (b.l - a.l) * t;
      if (Math.abs(l) > m.halfW) continue;
      if (m.kind !== 'trail' && (feetY < m.y + m.bottom - 0.5 || feetY > m.y + m.top)) continue;
      const lk = this.link(p, id);
      if (!lk) continue;
      const dest = this.places.get(lk.place);
      const mB = dest && dest.mouths[lk.mouth];
      if (!mB) { console.warn('missing link target', lk); continue; }
      return { from: p, mA: m, to: dest, mB };
    }
    return null;
  }

  commitCross(c) {
    this.arrival = { place: c.to.id, mouth: c.mB.id, fromPlace: c.from.id, fromMouth: c.mA.id, expired: false };
    this.pending = { place: c.to.id, mouth: c.mB.id, fromPlace: c.from.id, fromMouth: c.mA.id };
    this.current = c.to;
    if (this.onCross) this.onCross(c);
    this.cache.clear();
    this.refreshLinks(true);
  }

  debugExits() {
    const p = this.current;
    return Object.keys(p.mouths).map(id => {
      const l = this.link(p, id);
      return `${id} → ${l ? l.place + '.' + l.mouth : '—'}${this.visible.has(id) ? ' (seen)' : ''}`;
    });
  }
}
