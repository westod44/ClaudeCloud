// Persistence (bible section 20): actual fields only; three rotating autosaves, one
// manual slot, and a separate post-radio checkpoint that endings never overwrite.
import { G } from './state.js';
import { SAVE_PREFIX, TOPOLOGY_VERSION, ENDINGS_KEY } from './config.js';
import { findSupport } from './collision.js';

function store() { try { return window.localStorage; } catch (e) { return null; } }

export class Saves {
  constructor() { this.memory = {}; this.autoIndex = 0; this.lastSafe = null; this.safeT = 0; }

  read(slot) {
    const s = store();
    try {
      const raw = s ? s.getItem(SAVE_PREFIX + slot) : this.memory[slot];
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  write(slot, data) {
    const raw = JSON.stringify(data);
    const s = store();
    try {
      if (s) { s.setItem(SAVE_PREFIX + slot, raw); if (s.getItem(SAVE_PREFIX + slot) !== raw) throw new Error('verify'); }
      else this.memory[slot] = raw;
      return true;
    } catch (e) { console.warn('save failed', e); return false; }
  }

  snapshot(label) {
    const pl = G.player, w = G.world;
    return {
      version: TOPOLOGY_VERSION, time: Date.now(), label,
      place: w.current.id, variant: w.current.variant,
      transform: { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch, crouched: pl.crouched, seated: !!pl.seat },
      lastSafe: this.lastSafe,
      survival: G.survival.serialize(), inv: G.inv.serialize(), story: G.story.serialize(),
      light: G.lightLevel, mapNotes: G.ui.mapNotes.slice(),
    };
  }

  // queue a request made mid-transition until one safe frame after it completes
  autosave(label) { this.queue = { kind: 'auto', label }; }
  checkpoint() { this.queue = { kind: 'radio', label: 'After the lookout radio' }; }
  manual() { return this.commit({ kind: 'manual', label: 'Manual save' }); }

  tick(dt) {
    // track the last safe transform on stable walkable ground
    this.safeT += dt;
    const pl = G.player;
    if (this.safeT > 1.5 && pl.shape && !pl.seat && !pl.moveLock) {
      this.safeT = 0;
      this.lastSafe = { place: G.world.current.id, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, yaw: pl.yaw };
    }
    if (this.queue && G.mode === 'play' && !G.world.pending) {
      const q = this.queue; this.queue = null;
      this.commit(q);
    }
  }

  commit(q) {
    if (G.story.endingPlaying) return false;
    let slot;
    if (q.kind === 'auto') { slot = 'auto' + this.autoIndex; this.autoIndex = (this.autoIndex + 1) % 3; }
    else slot = q.kind;
    const ok = this.write(slot, this.snapshot(q.label));
    if (ok) G.ui.saved(); else G.ui.status('Could not save. The previous save is kept.');
    return ok;
  }

  list() {
    const out = [];
    for (const slot of ['manual', 'radio', 'auto0', 'auto1', 'auto2']) {
      const d = this.read(slot);
      if (d && d.version === TOPOLOGY_VERSION) out.push({ slot, label: d.label, time: d.time, place: d.place });
    }
    return out.sort((a, b) => b.time - a.time);
  }

  latest() { const l = this.list(); return l.length ? l[0].slot : null; }

  syncAutoIndex() {
    let oldest = 0, ot = Infinity;
    for (let i = 0; i < 3; i++) { const d = this.read('auto' + i); const t = d ? d.time : 0; if (t < ot) { ot = t; oldest = i; } }
    this.autoIndex = oldest;
  }

  // restore the matching topology and logical variant first, then place the player
  load(slot) {
    const d = this.read(slot);
    if (!d || d.version !== TOPOLOGY_VERSION) return false;
    G.story.restore(d.story);
    G.survival.restore(d.survival);
    G.inv.restore(d.inv);
    G.ui.mapNotes = d.mapNotes || [];
    G.lightLevel = d.light ?? G.story.lightTarget;
    const w = G.world;
    w.arrival = null; w.pending = null;
    let place = w.get(d.place);
    let tr = d.transform;
    let recovered = false;
    if (!place) { place = w.get(d.lastSafe?.place) || w.get('car'); tr = d.lastSafe || null; recovered = true; }
    w.setCurrent(place.id);
    const pl = G.player;
    pl.seat = null; pl.moveLock = false; pl.frozen = false; pl.scriptEye = null;
    if (tr && tr.seated && place.carSeat) {
      pl.seat = { ...place.carSeat }; pl.yaw = tr.yaw; pl.pitch = tr.pitch || 0; pl.pos.set(place.carSeat.x, 0, place.carSeat.z);
    } else if (tr && findSupport(place, tr.x, tr.z, tr.y)) {
      pl.place(tr.x, tr.y, tr.z, tr.yaw, tr.pitch || 0);
      pl.crouched = !!tr.crouched; pl.crouchT = pl.crouched ? 1 : 0;
    } else {
      const s = (d.lastSafe && d.lastSafe.place === place.id) ? d.lastSafe : place.spawn;
      pl.place(s.x, place.heightAt(s.x, s.z), s.z, s.yaw || 0, 0);
      const sup = findSupport(place, s.x, s.z, pl.pos.y); if (sup) pl.pos.y = sup.h;
      recovered = true;
    }
    if (recovered) G.ui.status('Recovered to the last safe position.');
    w.refreshLinks(true);
    return true;
  }

  endingsSeen() { try { return JSON.parse(store()?.getItem(ENDINGS_KEY) || '[]'); } catch (e) { return []; } }
  recordEnding(e) {
    const seen = this.endingsSeen(); if (!seen.includes(e)) seen.push(e);
    try { store()?.setItem(ENDINGS_KEY, JSON.stringify(seen)); } catch (er) { }
  }
}
