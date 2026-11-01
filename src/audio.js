/*
 * Synthesised soundscape (WebAudio, no sample files):
 * one-shot effects, terrain footsteps, animal calls, birds/crickets/owls,
 * and continuous wind / rain / waves / fire / night-drone layers. Sounds are panned by screen position.
 */
(function (root) {
  let ctx = null, master = null, on = true, noiseBuf = null, volume = 0.8;
  const layers = {};
  let lastBird = 0, lastNight = 0, lastCrackle = 0, gustLevel = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    const len = ctx.sampleRate * 3; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } // pinkish
    const loop = (ftype, freq, q = 0.7) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(0, Math.random() * 2); return { f, g }; };
    layers.wind = loop('bandpass', 500, 0.6); layers.rain = loop('highpass', 1800); layers.rainLow = loop('lowpass', 500); layers.waves = loop('lowpass', 420); layers.fire = loop('bandpass', 900, 1.5);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 46; const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 150; const og = ctx.createGain(); og.gain.value = 0; o.connect(of); of.connect(og); og.connect(master); o.start(); layers.drone = { g: og };
  }
  function panner(pan = 0) { const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (!p) return master; p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(master); return p; }
  function tone(f0, f1, dur, typ = 'sine', vol = 0.2, delay = 0, pan = 0, opt = {}) {
    if (!ctx || !on) return; const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain(); o.type = typ;
    o.frequency.setValueAtTime(f0, t); if (opt.mid) o.frequency.linearRampToValueAtTime(opt.mid, t + dur * (opt.midT || 0.4)); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (opt.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = opt.vib; lg.gain.value = opt.vibAmt || 8; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    const atk = opt.atk || 0.005; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o; if (opt.filter) { const f = ctx.createBiquadFilter(); f.type = opt.filter; f.frequency.value = opt.ff || 1000; f.Q.value = opt.q || 1; o.connect(f); node = f; }
    node.connect(g); g.connect(panner(pan)); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, typ = 'lowpass', delay = 0, pan = 0, q = 0.8, atk = 0.003) {
    if (!ctx || !on) return; const t = ctx.currentTime + delay, s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = typ; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(panner(pan)); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }
  const R = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------------ one-shots
  const SFX = {
    chop: p => { noise(0.12, 0.5, 900, 'lowpass', 0, p); tone(170, 90, 0.09, 'square', 0.1, 0, p); },
    mine: p => { noise(0.07, 0.45, 3200, 'highpass', 0, p); tone(R(650, 800), 480, 0.07, 'triangle', 0.12, 0, p); },
    fall: p => { noise(0.25, 0.3, 2400, 'bandpass', 0, p); noise(0.8, 0.45, 260, 'lowpass', 0.2, p); tone(90, 40, 0.6, 'sine', 0.3, 0.25, p); },
    rustle: p => { noise(0.22, 0.25, 2600, 'bandpass', 0, p); noise(0.15, 0.15, 3800, 'bandpass', 0.08, p); },
    hit: p => { noise(0.08, 0.5, 1800, 'lowpass', 0, p); tone(230, 110, 0.08, 'square', 0.12, 0, p); },
    swish: p => { noise(0.14, 0.2, 3500, 'bandpass', 0, p, 2); },
    heavyswish: p => { noise(0.25, 0.28, 1400, 'bandpass', 0, p, 1.5); },
    thud: p => noise(0.18, 0.5, 380, 'lowpass', 0, p),
    hurt: p => { tone(320, 120, 0.25, 'sawtooth', 0.15, 0, p, { filter: 'lowpass', ff: 1400 }); noise(0.1, 0.3, 1200, 'lowpass', 0, p); },
    die: p => tone(220, 50, 0.8, 'sawtooth', 0.18, 0, p, { filter: 'lowpass', ff: 900 }),
    hollowdie: p => { tone(520, 60, 1.0, 'sine', 0.14, 0, p); noise(0.9, 0.2, 800, 'bandpass', 0, p); },
    eat: p => { noise(0.06, 0.3, 1500, 'bandpass', 0, p); noise(0.06, 0.3, 1300, 'bandpass', 0.13, p); noise(0.06, 0.25, 1600, 'bandpass', 0.26, p); },
    heal: () => tone(500, 820, 0.28, 'sine', 0.12),
    drink: () => { for (let k = 0; k < 3; k++) tone(R(380, 450), R(850, 1000), 0.12, 'sine', 0.1, k * 0.16); },
    craft: () => { tone(620, 620, 0.06, 'triangle', 0.14); tone(820, 820, 0.07, 'triangle', 0.14, 0.09); noise(0.06, 0.2, 2200, 'bandpass', 0.02); },
    build: p => { for (let k = 0; k < 3; k++) { noise(0.12, 0.45, 600, 'lowpass', k * 0.16, p); tone(150, 100, 0.1, 'square', 0.08, k * 0.16, p); } },
    break: p => { noise(0.45, 0.5, 700, 'lowpass', 0, p); noise(0.3, 0.3, 2400, 'bandpass', 0.05, p); },
    loot: () => { tone(700, 700, 0.06, 'square', 0.07); tone(1050, 1050, 0.1, 'square', 0.07, 0.07); },
    relic: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.4, 'triangle', 0.12, i * 0.12)),
    fire: p => { noise(0.4, 0.3, 900, 'bandpass', 0, p); for (let k = 0; k < 5; k++) noise(0.012, 0.25, 3000, 'bandpass', R(0, 0.4), p); },
    bow: p => { tone(320, 110, 0.16, 'triangle', 0.15, 0, p); noise(0.05, 0.15, 3000, 'highpass', 0, p); },
    sling: p => { noise(0.3, 0.18, 900, 'bandpass', 0, p, 3); tone(260, 180, 0.2, 'sine', 0.05, 0.05, p); },
    dodge: p => { noise(0.18, 0.25, 1600, 'bandpass', 0, p, 1.2); },
    night: () => { tone(110, 80, 2.2, 'sine', 0.12); tone(165, 120, 2.2, 'sine', 0.06, 0.3); },
    thunder: (p, near) => { if (near) noise(0.25, 0.6, 3000, 'highpass', 0, p); noise(3.2, near ? 0.7 : 0.45, 140, 'lowpass', near ? 0.05 : R(0.5, 1.8), p, 0.7, 0.08); noise(2.0, 0.25, 420, 'lowpass', near ? 0.3 : R(0.9, 2.2), p); },
    // creatures
    deer: p => tone(560, 420, 0.28, 'sawtooth', 0.06, 0, p, { filter: 'bandpass', ff: 1200, q: 3 }),
    sheep: p => tone(300, 260, 0.7, 'sawtooth', 0.07, 0, p, { filter: 'bandpass', ff: 900, q: 2, vib: 7, vibAmt: 18 }),
    boar: p => { for (let k = 0; k < 2; k++) { noise(0.16, 0.25, 420, 'lowpass', k * 0.22, p); tone(95, 70, 0.16, 'sawtooth', 0.08, k * 0.22, p, { filter: 'lowpass', ff: 500 }); } },
    wolf: p => tone(330, 420, 2.8, 'sine', 0.08, 0, p, { mid: 610, midT: 0.35, vib: 5, vibAmt: 9, atk: 0.4 }),
    growl: p => { tone(85, 60, 0.9, 'sawtooth', 0.09, 0, p, { filter: 'lowpass', ff: 380, vib: 22, vibAmt: 9 }); },
    bear: p => { noise(1.3, 0.4, 300, 'bandpass', 0, p, 1.2, 0.1); tone(75, 52, 1.3, 'sawtooth', 0.14, 0, p, { filter: 'lowpass', ff: 420, vib: 18, vibAmt: 6, atk: 0.1 }); },
    spider: p => noise(0.55, 0.22, 3400, 'highpass', 0, p, 0.7, 0.05),
    hollow: p => { tone(R(100, 130), 85, 1.6, 'sawtooth', 0.06, 0, p, { filter: 'bandpass', ff: R(500, 800), q: 4, vib: 4, vibAmt: 6, atk: 0.3 }); noise(1.2, 0.05, 2200, 'bandpass', 0.2, p, 3, 0.3); },
    wisp: p => { tone(880, 860, 1.2, 'sine', 0.06, 0, p); tone(1320, 1300, 1.0, 'sine', 0.04, 0.08, p); tone(1760, 1750, 0.8, 'sine', 0.03, 0.15, p); },
    bolt: p => { tone(1200, 300, 0.35, 'sine', 0.1, 0, p); noise(0.2, 0.15, 3000, 'bandpass', 0, p, 2); },
    splash: p => { noise(0.2, 0.3, 900, 'bandpass', 0, p); tone(320, 640, 0.08, 'sine', 0.06, 0.03, p); },
  };
  // footsteps by surface
  function footstep(surface, pan = 0, vol = 1) {
    if (!ctx || !on) return;
    switch (surface) {
      case 'grass': noise(0.07, 0.07 * vol, 1100, 'lowpass', 0, pan); noise(0.05, 0.03 * vol, 3200, 'bandpass', 0.01, pan, 1.5); break;
      case 'dirt': noise(0.06, 0.09 * vol, 700, 'lowpass', 0, pan); break;
      case 'sand': noise(0.1, 0.06 * vol, 2600, 'highpass', 0, pan, 0.5, 0.01); break;
      case 'rock': noise(0.035, 0.1 * vol, 2200, 'bandpass', 0, pan, 2); tone(R(500, 700), 400, 0.03, 'triangle', 0.03 * vol, 0, pan); break;
      case 'snow': for (let k = 0; k < 3; k++) noise(0.03, 0.05 * vol, 1700 + k * 300, 'bandpass', k * 0.025, pan, 3); break;
      case 'water': noise(0.16, 0.1 * vol, 900, 'bandpass', 0, pan, 1); tone(R(280, 340), R(560, 700), 0.06, 'sine', 0.04 * vol, 0.04, pan); break;
      case 'wood': tone(R(140, 160), 95, 0.06, 'triangle', 0.08 * vol, 0, pan); noise(0.04, 0.05 * vol, 600, 'lowpass', 0, pan); break;
      default: noise(0.06, 0.07 * vol, 900, 'lowpass', 0, pan);
    }
  }
  // birds: a few song "species"
  function bird(pan) {
    const kind = Math.floor(Math.random() * 4), base = R(2400, 3600), v = 0.035;
    if (kind === 0) { const n = 3 + Math.floor(Math.random() * 4); for (let k = 0; k < n; k++) tone(base * R(0.9, 1.2), base * R(1.2, 1.5), 0.07, 'sine', v, k * 0.11, pan); }
    else if (kind === 1) { tone(base, base * 0.82, 0.18, 'sine', v, 0, pan); tone(base * 0.8, base * 0.66, 0.2, 'sine', v, 0.24, pan); }
    else if (kind === 2) { for (let k = 0; k < 10; k++) tone(base * 1.1, base * 1.25, 0.03, 'sine', v * 0.8, k * 0.045, pan); }
    else { tone(base * 0.7, base * 1.3, 0.25, 'sine', v, 0, pan, { vib: 30, vibAmt: 150 }); }
  }
  function cricket(pan) { const f = R(4000, 4600); for (let c = 0; c < 2; c++) for (let k = 0; k < 3; k++) tone(f, f, 0.018, 'sine', 0.018, c * 0.3 + k * 0.035, pan); }
  function owl(pan) { tone(390, 360, 0.35, 'sine', 0.06, 0, pan, { atk: 0.05 }); tone(380, 340, 0.55, 'sine', 0.06, 0.5, pan, { atk: 0.08 }); }
  function frog(pan) { for (let k = 0; k < 2; k++) tone(R(180, 240), 140, 0.12, 'square', 0.025, k * 0.18, pan, { filter: 'bandpass', ff: 600, q: 4 }); }

  /**
   * ambience(s): s = { night 0..1, wind 0..1, rain 0..1, snow, storm, nearWater 0..1, nearFire 0..1, danger 0..1, paused, dt }
   */
  function ambience(s) {
    if (!ctx) return;
    const t = ctx.currentTime, set = (L, v, tc = 0.6) => L.g.gain.setTargetAtTime(on && !s.paused ? v : 0, t, tc);
    gustLevel += (s.wind - gustLevel) * Math.min(1, s.dt * 2);
    set(layers.wind, 0.02 + gustLevel * 0.16 + s.snow * 0.03); layers.wind.f.frequency.setTargetAtTime(380 + gustLevel * 700, t, 0.4);
    set(layers.rain, s.rain * 0.12); set(layers.rainLow, s.rain * 0.08 + s.storm * 0.05);
    set(layers.waves, s.nearWater * (0.07 + 0.05 * Math.sin(t * 0.6)) , 1.2);
    set(layers.fire, s.nearFire * 0.05);
    set(layers.drone, s.night * 0.03 + s.danger * 0.03, 1.5);
    if (!on || s.paused) return;
    if (s.nearFire > 0.2 && t - lastCrackle > R(0.08, 0.4) / s.nearFire) { lastCrackle = t; noise(0.012, 0.12 * s.nearFire, R(2500, 4000), 'bandpass', 0, R(-0.3, 0.3), 2); }
    const pan = () => R(-0.9, 0.9);
    if (s.night < 0.4 && s.rain < 0.3 && s.wind < 0.8 && t - lastBird > R(1.8, 6)) { lastBird = t; bird(pan()); }
    if (s.night > 0.6 && t - lastNight > R(0.6, 2.2)) {
      lastNight = t; const r = Math.random();
      if (s.snow < 0.2 && s.rain < 0.5 && r < 0.7) cricket(pan());
      else if (r < 0.8 && s.nearWater > 0.2) frog(pan());
      else if (r < 0.9) owl(pan());
      else if (r < 0.95) SFX.wolf(pan());
    }
  }

  root.AUDIO = {
    init, footstep, ambience,
    sfx(name, pan = 0, ...rest) { if (!ctx || !on || !SFX[name]) return; SFX[name](pan, ...rest); },
    get on() { return on; }, set on(v) { on = v; if (master) master.gain.value = on ? volume : 0; },
    setVolume(v) { volume = v; if (master) master.gain.value = on ? v : 0; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
