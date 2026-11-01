// Procedural WebAudio (bible section 18). No sampled audio and no recorded voice:
// radio and roadside speech are captioned, with nonverbal radio static only.
import * as THREE from '../vendor/three.module.js';
import { G } from './state.js';

const AMB = {
  trail: { wind: 0.22, hiss: 0.04, birds: 1.0, creak: 0.1 },
  forest: { wind: 0.18, hiss: 0.03, birds: 0.5, creak: 0.4 },
  creek: { wind: 0.16, hiss: 0.03, birds: 0.6, creak: 0.2 },
  camp: { wind: 0.14, hiss: 0.02, birds: 0.2, creak: 0.4 },
  ridge: { wind: 0.42, hiss: 0.14, birds: 0.1, creak: 0.2 },
  tunnel: { wind: 0.04, hiss: 0.0, birds: 0, creak: 0, hum: 0.12 },
  shelter: { wind: 0.06, hiss: 0.0, birds: 0.1, creak: 0.3 },
  road: { wind: 0.2, hiss: 0.05, birds: 0.6, creak: 0 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.nodes = new Map();
    this.outsideSteps = new Map();
    this.ambType = 'trail';
    this.birdT = 3;
    this.creakT = 6;
    this.listenerPos = new THREE.Vector3();
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.fx = ctx.createGain(); this.fx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.connect(this.master);
    this.duck = ctx.createGain(); this.duck.connect(this.master);
    this.amb.disconnect(); this.amb.connect(this.duck);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0); for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // reverb for tunnel
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 1.2, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2) * (i < 300 ? 0 : 1); }
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0;
    this.fx.connect(this.verbGain); this.verbGain.connect(this.verb); this.verb.connect(this.master);
    // ambience beds
    this.wind = this.loop(this.brown, 'lowpass', 420, 0.6, this.amb);
    this.hiss = this.loop(this.white, 'highpass', 2600, 0.5, this.amb);
    this.hum = this.loop(this.brown, 'lowpass', 120, 1, this.amb);
    this.windLfo = 0;
    this.enabled = true;
    this.applyVolumes();
  }

  loop(buf, type, freq, q, dest) {
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(dest); src.start();
    return { src, f, g };
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = G.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.1);
    this.amb.gain.setTargetAtTime(s.ambience, t, 0.1);
    this.fx.gain.setTargetAtTime(s.effects, t, 0.1);
    this.mus.gain.setTargetAtTime(s.music, t, 0.1);
  }

  pause(p) { if (!this.ctx) return; if (p) this.ctx.suspend(); else this.ctx.resume(); }

  // ---------------------------------------------------------------- per frame
  update(dt, world, cameraMatrix, ctx) {
    if (!this.enabled) return;
    const ac = this.ctx, t = ac.currentTime;
    // listener in the current place's frame
    const pos = new THREE.Vector3().setFromMatrixPosition(cameraMatrix);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(cameraMatrix);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(cameraMatrix);
    this.listenerPos.copy(pos);
    const L = ac.listener;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.setTargetAtTime(up.x, t, 0.02); L.upY.setTargetAtTime(up.y, t, 0.02); L.upZ.setTargetAtTime(up.z, t, 0.02);
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }

    // ambience bed (crossfades 1 s)
    const place = world.current;
    let type = place.ambience;
    if (ctx.indoor && place.id === 'shelter') type = 'shelter';
    const a = AMB[type] || AMB.forest;
    const night = Math.min(1, Math.max(0, G.lightLevel - 1));
    this.windLfo += dt * 0.13;
    const gust = 0.75 + 0.25 * Math.sin(this.windLfo * 2.1) + 0.12 * Math.sin(this.windLfo * 5.3);
    this.wind.g.gain.setTargetAtTime(a.wind * gust, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(300 + 260 * gust, t, 0.4);
    this.hiss.g.gain.setTargetAtTime(a.hiss * gust, t, 0.5);
    this.hum.g.gain.setTargetAtTime(a.hum || 0, t, 0.5);
    this.verbGain.gain.setTargetAtTime(type === 'tunnel' ? 0.9 : 0, t, 0.3);
    // sparse birds by day, thinning at dusk; branch creaks at night
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 5 + Math.random() * 14;
      const amt = a.birds * Math.max(0, 1 - G.lightLevel * 0.9);
      if (Math.random() < amt) this.chirp(pos.x + (Math.random() - 0.5) * 40, pos.y + 8, pos.z + (Math.random() - 0.5) * 40, 0.12);
    }
    this.creakT -= dt;
    if (this.creakT <= 0) {
      this.creakT = 9 + Math.random() * 16;
      if (Math.random() < a.creak * (0.3 + night)) this.creak(pos.x + (Math.random() - 0.5) * 30, pos.y + 4, pos.z + (Math.random() - 0.5) * 30);
    }

    // positional emitters: current place + places across nearby joins (continuity)
    const want = new Map();
    const addEm = (pl, em, M4, key) => {
      if (em.cond && !em.cond()) return;
      const p = new THREE.Vector3(em.x, pl.heightAt ? (em.y + (pl.terrain ? pl.heightAt(em.x, em.z) : 0)) : em.y, em.z);
      if (M4) p.applyMatrix4(M4);
      if (p.distanceTo(pos) > 70) return;
      want.set(key, { em, p });
    };
    for (const em of place.emitters) addEm(place, em, null, place.id + ':' + em.id);
    const inv = new THREE.Matrix4();
    for (const id in place.mouths) {
      const m = place.mouths[id];
      if (Math.hypot(pos.x - m.x, pos.z - m.z) > 45) continue;
      const lk = world.link(place, id); if (!lk) continue;
      const dest = world.get(lk.place); const mB = dest && dest.mouths[lk.mouth]; if (!mB) continue;
      world.transform(m, mB, inv); inv.invert();
      for (const em of dest.emitters) addEm(dest, em, inv, `${dest.id}:${em.id}@${id}`);
    }
    for (const [key, w] of want) {
      let n = this.nodes.get(key);
      if (!n) { n = this.makeEmitter(w.em); if (!n) continue; this.nodes.set(key, n); }
      n.panner.positionX.setTargetAtTime(w.p.x, t, 0.05); n.panner.positionY.setTargetAtTime(w.p.y, t, 0.05); n.panner.positionZ.setTargetAtTime(w.p.z, t, 0.05);
      n.out.gain.setTargetAtTime(n.level, t, 0.6);
      n.tick && n.tick(dt);
    }
    for (const [key, n] of this.nodes) {
      if (!want.has(key)) {
        n.out.gain.setTargetAtTime(0, t, 0.4);
        n.dead = (n.dead || 0) + dt;
        if (n.dead > 2.5) { n.stop(); this.nodes.delete(key); }
      } else n.dead = 0;
    }
    for (const [, s] of this.outsideSteps) s.tick(dt, pos);
  }

  panner(ref = 3, roll = 1.1) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 200;
    return p;
  }

  makeEmitter(em) {
    const ac = this.ctx;
    const panner = this.panner(em.type === 'traffic' ? 14 : em.type === 'creek' ? 4 : 2, em.type === 'traffic' ? 0.6 : 1.2);
    const out = ac.createGain(); out.gain.value = 0;
    out.connect(panner); panner.connect(this.amb);
    const stops = [];
    const n = { panner, out, level: em.gain, stop: () => { stops.forEach(f => f()); setTimeout(() => { try { panner.disconnect(); } catch (e) { } }, 50); } };
    if (em.type === 'creek') {
      for (const [f, q, g] of [[900, 0.7, 0.5], [2400, 1.2, 0.25], [380, 0.8, 0.35]]) {
        const l = this.loop(this.white, 'bandpass', f, q, out); l.g.gain.value = g; stops.push(() => l.src.stop());
        const lfo = ac.createOscillator(); lfo.frequency.value = 0.3 + Math.random() * 0.6;
        const lg = ac.createGain(); lg.gain.value = f * 0.25; lfo.connect(lg); lg.connect(l.f.frequency); lfo.start(); stops.push(() => lfo.stop());
      }
      n.level = em.gain * 0.55;
    } else if (em.type === 'fire') {
      const l = this.loop(this.brown, 'lowpass', 260, 0.7, out); l.g.gain.value = 0.5; stops.push(() => l.src.stop());
      n.level = em.gain * 0.6;
      n.tick = (dt) => { if (Math.random() < dt * 9) this.click(out, 2500 + Math.random() * 3000, 0.25 + Math.random() * 0.4); };
    } else if (em.type === 'drip') {
      n.level = em.gain * 0.5;
      n.tick = (dt) => { if (Math.random() < dt * 0.35) this.plink(out); };
    } else if (em.type === 'traffic') {
      const l = this.loop(this.brown, 'lowpass', 180, 0.6, out); l.g.gain.value = 0.0; stops.push(() => l.src.stop());
      n.level = em.gain * 0.9;
      let ph = 0;
      n.tick = (dt) => { ph += dt; const v = Math.max(0, Math.sin(ph * 0.12)) ** 3; l.g.gain.setTargetAtTime(0.15 + v * 0.9, ac.currentTime, 0.5); l.f.frequency.setTargetAtTime(140 + v * 260, ac.currentTime, 0.5); };
    } else return null;
    return n;
  }

  click(dest, freq, gain) {
    const ac = this.ctx, t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = this.white;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 2;
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + 0.05);
  }
  plink(dest) {
    const ac = this.ctx, t = ac.currentTime;
    const o = ac.createOscillator(); o.frequency.setValueAtTime(1400 + Math.random() * 800, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.08);
    const g = ac.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
  }

  posGain(x, y, z, ref = 3) {
    const p = this.panner(ref, 1.1);
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    p.connect(this.fx);
    return p;
  }

  chirp(x, y, z, vol = 0.12) {
    if (!this.enabled) return;
    const ac = this.ctx, t = ac.currentTime;
    const p = this.posGain(x, y, z, 6);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator(); o.type = 'sine';
      const t0 = t + i * 0.14, f0 = 2800 + Math.random() * 1600;
      o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * 1.4, t0 + 0.06);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g); g.connect(p); o.start(t0); o.stop(t0 + 0.1);
    }
  }

  // the repeated bird call: exactly the same three notes and spacing every time
  birdCall(place, x, y, z) {
    if (!this.enabled) return;
    const ac = this.ctx, t = ac.currentTime + 0.2;
    const p = this.posGain(x, y, z, 8);
    [[2650, 0], [3180, 0.42], [2380, 0.84]].forEach(([f, dt]) => {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f, t + dt); o.frequency.linearRampToValueAtTime(f * 1.12, t + dt + 0.12); o.frequency.linearRampToValueAtTime(f * 0.96, t + dt + 0.22);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.22, t + dt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.26);
      o.connect(g); g.connect(p); o.start(t + dt); o.stop(t + dt + 0.3);
    });
    if (G.settings.soundCaptions) G.ui.cue('[a bird calls, three notes]');
  }

  creak(x, y, z) {
    const ac = this.ctx, t = ac.currentTime;
    const p = this.posGain(x, y, z, 5);
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110 + Math.random() * 60, t); o.frequency.linearRampToValueAtTime(70 + Math.random() * 40, t + 0.9);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 6;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f); f.connect(g); g.connect(p); o.start(t); o.stop(t + 1.05);
  }

  // ---------------------------------------------------------------- footsteps by surface
  footstep(surface, vol = 0.85) {
    if (!this.enabled) return;
    const ac = this.ctx, t = ac.currentTime;
    const spec = {
      leaves: [['bandpass', 2400, 0.7, 0.1, 0.45], ['lowpass', 500, 0.7, 0.05, 0.35]],
      soil: [['lowpass', 520, 0.8, 0.07, 0.6]],
      gravel: [['bandpass', 3200, 0.8, 0.09, 0.4], ['lowpass', 700, 0.7, 0.05, 0.35]],
      slate: [['bandpass', 1500, 2.5, 0.04, 0.55], ['lowpass', 260, 1, 0.05, 0.3]],
      timber: [['lowpass', 190, 3, 0.09, 0.8], ['bandpass', 900, 4, 0.04, 0.25]],
      concrete: [['bandpass', 1100, 1.5, 0.035, 0.6], ['lowpass', 300, 1, 0.04, 0.3]],
      asphalt: [['bandpass', 1400, 1.2, 0.04, 0.4]],
      water: [['bandpass', 1800, 0.6, 0.16, 0.5], ['lowpass', 400, 0.8, 0.12, 0.4]],
    }[surface] || [['lowpass', 520, 0.8, 0.07, 0.6]];
    for (const [type, f, q, dur, g0] of spec) {
      const s = ac.createBufferSource(); s.buffer = this.white;
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f * (0.9 + Math.random() * 0.2); fl.Q.value = q;
      const g = ac.createGain(); g.gain.setValueAtTime(g0 * vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(fl); fl.connect(g); g.connect(this.fx); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    }
  }

  // footsteps that circle outside (duplicate camp: 18 s once; shelter: 4 s after the door closes)
  footstepsOutside(place, key, seconds) {
    if (!this.enabled) return;
    this.stopOutsideSteps(key);
    let tLeft = seconds, ang = Math.random() * 6.28, acc = 0, paused = 0;
    const center = key === 'shelter' ? new THREE.Vector3(place.doorPos.x, 0, place.doorPos.z + 2.5) : null;
    if (G.settings.soundCaptions || G.settings.subtitles) G.ui.cue('[footsteps outside]');
    const s = {
      tick: (dt, listener) => {
        if (G.world.current !== place) { tLeft = 0; }
        tLeft -= dt; if (tLeft <= 0) { this.outsideSteps.delete(key); return; }
        const pl = G.player;
        // deliberate pause when the player approaches the tent entrance
        if (key === 'camp' && Math.hypot(pl.pos.x + 3.0, pl.pos.z + 1.2) < 2.2 && paused < 2.5) { paused += dt; return; }
        acc += dt;
        ang += dt * (key === 'camp' ? 0.42 : 0.25);
        if (acc > 0.62) {
          acc = 0;
          const r = key === 'camp' ? 7.5 : 1.2;
          const c = center || new THREE.Vector3(0, 0, 0);
          const x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r;
          const y = place.heightAt(x, z);
          const p = this.posGain(x, y, z, 3);
          const ac = this.ctx, t = ac.currentTime;
          const src = ac.createBufferSource(); src.buffer = this.white;
          const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
          const g = ac.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          src.connect(f); f.connect(g); g.connect(p); src.start(t, Math.random()); src.stop(t + 0.14);
        }
      },
    };
    this.outsideSteps.set(key, s);
  }
  stopOutsideSteps(key) { this.outsideSteps.delete(key); }

  // ---------------------------------------------------------------- one-shots
  sfx(name, o = {}) {
    if (!this.enabled) return;
    const ac = this.ctx, t = ac.currentTime;
    const dest = o.pos ? this.posGain(o.pos[0], o.pos[1], o.pos[2], 2) : this.fx;
    const noise = (type, f, q, g0, dur, start = 0) => {
      const s = ac.createBufferSource(); s.buffer = this.white;
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ac.createGain(); g.gain.setValueAtTime(g0, t + start); g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      s.connect(fl); fl.connect(g); g.connect(dest); s.start(t + start, Math.random()); s.stop(t + start + dur + 0.05);
      return { s, fl, g };
    };
    const tone = (type, f0, f1, g0, dur, start = 0) => {
      const osc = ac.createOscillator(); osc.type = type;
      osc.frequency.setValueAtTime(f0, t + start); osc.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(g0, t + start); g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.connect(g); g.connect(dest); osc.start(t + start); osc.stop(t + start + dur + 0.05);
    };
    switch (name) {
      case 'click': noise('highpass', 3000, 1, 0.4, 0.02); tone('square', 1800, 900, 0.05, 0.015); break;
      case 'zip': for (let i = 0; i < 8; i++) noise('bandpass', 3500 + i * 150, 3, 0.25, 0.03, i * 0.04); break;
      case 'pickup': noise('bandpass', 1500, 2, 0.3, 0.06); tone('sine', 600, 500, 0.05, 0.08); break;
      case 'cardoor': noise('lowpass', 220, 1, 0.9, 0.18); tone('sine', 90, 60, 0.4, 0.2); break;
      case 'door': { const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(240, t); osc.frequency.linearRampToValueAtTime(160, t + 0.7);
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 8; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
        osc.connect(f); f.connect(g); g.connect(dest); osc.start(t); osc.stop(t + 0.8); noise('lowpass', 200, 1, 0.6, 0.15, 0.7); break; }
      case 'static': { const dur = o.dur || 1.5; const s = noise('bandpass', 2200, 0.5, 0.35, dur); s.g.gain.setValueAtTime(0.3, t); s.g.gain.setValueAtTime(0.3, t + dur - 0.1); break; }
      case 'lighter': noise('bandpass', 4000, 2, 0.4, 0.05); noise('bandpass', 4500, 2, 0.4, 0.05, 0.12); noise('lowpass', 800, 1, 0.15, 0.4, 0.18); break;
      case 'whoosh': noise('lowpass', 500, 0.7, 0.5, 1.2); break;
      case 'drink': for (let i = 0; i < 4; i++) tone('sine', 300 + i * 30, 180, 0.1, 0.12, i * 0.25); break;
      case 'pour': noise('bandpass', 1200, 1, 0.3, 1.4); break;
      case 'wrapper': for (let i = 0; i < 10; i++) noise('highpass', 5000, 1, 0.12, 0.03, i * 0.05 + Math.random() * 0.03); break;
      case 'shiver': noise('bandpass', 700, 1.5, 0.12, 0.5); noise('bandpass', 650, 1.5, 0.1, 0.6, 0.55); break;
      case 'engine': { const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(40, t); osc.frequency.linearRampToValueAtTime(55, t + 1.2);
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.4); g.gain.setTargetAtTime(0.18, t + 1.2, 0.5);
        osc.connect(f); f.connect(g); g.connect(this.fx); osc.start(t); this.engine = { osc, g }; break; }
      case 'vehicle': { const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 48; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
        const g = ac.createGain(); g.gain.value = 0.0; osc.connect(f); f.connect(g); g.connect(dest); osc.start(t); this.vehicleNode = { osc, g, p: dest }; break; }
    }
  }

  stopEngine() { if (this.engine) { const t = this.ctx.currentTime; this.engine.g.gain.setTargetAtTime(0, t, 0.3); this.engine.osc.stop(t + 1.5); this.engine = null; } }

  radioVoice(dur, quiet) {
    if (!this.enabled) return;
    const ac = this.ctx, t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = this.white; s.loop = true;
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 3;
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1800; f2.Q.value = 4;
    const g = ac.createGain(); g.gain.value = 0;
    s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(this.fx);
    const base = quiet ? 0.25 : 0.6;
    let tt = t;
    while (tt < t + dur) {
      const syl = 0.09 + Math.random() * 0.14;
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(base * (0.5 + Math.random() * 0.5), tt + syl * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, tt + syl);
      f1.frequency.setValueAtTime(600 + Math.random() * 700, tt);
      tt += syl + (Math.random() < 0.18 ? 0.18 : 0.02);
    }
    s.start(t); s.stop(t + dur + 0.1);
    this.sfx('static', { dur: dur * 0.9 });
  }

  silence(dur) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this.duck.gain.setTargetAtTime(0.15, t, 0.05);
    this.duck.gain.setTargetAtTime(1, t + dur, 1.5);
  }

  // three short restrained drone cues with long silent intervals
  music(i, delay = 0) {
    if (!this.enabled) return;
    if (this._cuesPlayed && this._cuesPlayed[i] && i !== 2) return;
    this._cuesPlayed = this._cuesPlayed || {}; this._cuesPlayed[i] = true;
    const ac = this.ctx, t = ac.currentTime + delay + 0.5;
    const roots = [[55, 82.4, 110.2], [49, 73.4, 98.4], [41.2, 61.7, 82.6]][i];
    const dur = 28;
    for (const f of roots) {
      for (const det of [-0.6, 0.6]) {
        const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f + det;
        const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(180, t); fl.frequency.linearRampToValueAtTime(520, t + dur * 0.5); fl.frequency.linearRampToValueAtTime(160, t + dur);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 6); g.gain.setValueAtTime(0.05, t + dur - 8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(fl); fl.connect(g); g.connect(this.mus); o.start(t); o.stop(t + dur + 0.1);
      }
    }
  }
}
