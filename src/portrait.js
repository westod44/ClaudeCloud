/*
 * Live status portrait: a rigged pixel-art face drawn fresh every frame (96x108 art pixels).
 *
 * The survivor matches the in-game model (brown wide-brim hat, dark hair and stubble, blue shirt, pack strap).
 * A small rig drives it: brows (inner/outer height, squeeze), upper and lower lids, pupils (look, size),
 * mouth (width, smile/frown, opening, teeth, clenched teeth, tongue, pucker, pressed lips), cheeks, nostrils,
 * wrinkles and head motion. Each mood is an animated pose, not a still image: teeth chatter and the head
 * shivers in the cold, eyes dart when scared, the face screws up and recoils when hurt, the eyes droop and
 * yawn when tired, and so on. Rig values ease toward their targets, so moods blend into one another.
 * State overlays (blood that drips while bleeding, bruises, dirt, sweat, rain, frost, breath vapour, pallor,
 * sickly or cold skin, a red flash on damage) are painted on top in the same pixel grid.
 */
(function (root) {
  const W = 96, H = 108, CX = 48, CY = 51;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ramp = a => a.map(hex);
  const C = {
    skin: ramp(['#3a2118', '#5a3426', '#7a4935', '#996046', '#b67858', '#cf926e', '#e3ab86', '#f0c39f']),
    hat: ramp(['#1c120a', '#2c1c10', '#402916', '#56381e', '#6e4927', '#875b31', '#a0703f']),
    band: ramp(['#100a06', '#1a110a', '#26190f', '#352315']),
    hair: ramp(['#0d0806', '#19100b', '#261911', '#352418', '#463020']),
    shirt: ramp(['#0a1430', '#111f4d', '#192f70', '#224295', '#2c56b8', '#4370d0', '#628ce2']),
    collar: ramp(['#2a2116', '#433524', '#5c4b34', '#776347', '#917d5c']),
    strap: ramp(['#1c120b', '#2d1e13', '#43301e', '#5b4128', '#735333']),
    white: ramp(['#7e746a', '#a89e90', '#cfc6b6', '#ebe4d6']),
    iris: ramp(['#1e120a', '#3a2414', '#58391e', '#78512a']),
    lip: ramp(['#4e231c', '#6e3329', '#8c4436', '#a65546', '#bf6a58']),
    mouth: ramp(['#140605', '#240b09', '#3a1311']),
    tongue: ramp(['#7a2c30', '#a03f48', '#c05860']),
    teeth: ramp(['#8a806e', '#bdb39c', '#e6dfca']),
    line: hex('#140a06'), outline: hex('#0a0604'),
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.47);
  const L = (() => { const v = [-0.52, -0.56, 0.65], n = Math.hypot(...v); return v.map(x => x / n); })();
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shadeOf = (r, v, x, y, amt = 0.55) => r[clamp(Math.round(v * (r.length - 1) + BAYER[(y & 3) * 4 + (x & 3)] * amt), 0, r.length - 1)];

  // ------------------------------------------------------------------ rig & moods
  const DEF = { browIn: 0, browOut: 0, browSq: 0, lidU: 0.95, lidLo: 0.12, lookX: 0, lookY: 0, pupil: 1, mouthW: 1, smile: 0, open: 0, teeth: 0, clench: 0, tongue: 0, pucker: 0, lipPress: 0, asym: 0, cheek: 0, puff: 0, nostril: 0, creaseBrow: 0, creaseFore: 0, headX: 0, headY: 0, tilt: 0 };
  const S = Math.sin, PI = Math.PI;
  const bump = (t, period, dur) => { const p = ((t % period) + period) % period; return p < dur ? S(PI * p / dur) : 0; }; // 0..1..0 once per period
  // each mood: (t = seconds in this mood) -> [rig targets, unsmoothed additions (fast motion)]
  const MOODS = {
    neutral: t => [{ smile: 0 }, { hy: S(t * 1.6) * 0.25 }],
    content: t => { const g = bump(t + 2, 6.5, 1.8); return [{ smile: 1.05 + g * 0.2, cheek: 0.8 + g * 0.2, lidLo: 0.42 + g * 0.2, lidU: 0.8 - g * 0.2, browIn: -0.9, browOut: -0.3, mouthW: 1.1 + g * 0.1, teeth: g, open: g * 1.8 }, { tilt: S(t * 0.9) * 0.04, hy: S(t * 1.5) * 0.35 }]; },
    hungry: t => { const lick = bump(t, 4.6, 1.2), growl = bump(t + 2.3, 7, 0.8); return [{ browIn: -1.8, browOut: 0.7, smile: -0.55 + lick * 0.35, lidU: 0.8 - growl * 0.55, lidLo: 0.15 + growl * 0.45, open: lick * 1.4, tongue: lick, mouthW: 0.95, creaseBrow: growl, lookY: 0.6, lookX: -0.3 }, { hx: growl * S(t * 48) * 0.9, hy: growl * 1.3 }]; },
    thirsty: t => { const gulp = bump(t + 1, 5, 0.6), tg = bump(t + 3, 6.2, 1.1); return [{ browIn: -1.4, browOut: 0.4, smile: -0.4, lidU: 0.7, lidLo: 0.25, mouthW: 0.92, tongue: tg * 0.8, lookY: -0.2 }, { open: Math.max(0, 1.6 + 0.8 * S(t * 3.4) - gulp * 1.8 + tg), hy: gulp * 1.4 }]; },
    hurt: (t, et) => { const r = Math.exp(-et * 2.8); return [{ lidU: 0.06, lidLo: 0.8, browIn: 2.6, browOut: -0.7, browSq: 1.5, clench: 1, teeth: 1, open: 2.6, smile: -0.6, mouthW: 1.24, cheek: 1, nostril: 1, creaseBrow: 1, asym: 0.3 }, { hx: S(et * 36) * 2.4 * r, hy: -1.6 * r, tilt: -0.09 * r }]; },
    scared: t => [{ browIn: -3.6, browOut: -1.5, browSq: 1, lidU: 1.34, lidLo: 0, pupil: 0.55, mouthW: 0.78, smile: -0.6, teeth: 0.4, creaseFore: 1, nostril: 0.7 }, { open: 2.6 + S(t * 5.5) * 0.7, hx: S(t * 41) * 0.6 + S(t * 23) * 0.35, hy: S(t * 37) * 0.3 }],
    tired: t => { const cyc = (t % 6.5) / 6.5, nod = cyc < 0.86 ? cyc / 0.86 : 0, y = bump(t + 4, 9, 2.4); return [{ lidLo: 0.15, browIn: -0.8 - y * 1.4, browOut: 0.8, smile: -0.2, mouthW: 0.86 - y * 0.12, pucker: y * 0.4, teeth: y * 0.7, lookY: 0.45 }, { lid: (0.62 - nod * nod * 0.55) * (1 - y) + y * 0.04, open: 0.6 + y * 8, hy: nod * nod * 3.2 - y * 1.6, tilt: nod * 0.06 - y * 0.03 }]; },
    cold: t => [{ browIn: -1.9, browOut: 0.5, lidU: 0.76, lidLo: 0.22, smile: -0.4, clench: 1, teeth: 1, mouthW: 1.05, nostril: 0.4, creaseBrow: 0.4 }, { hx: S(t * 53) * 0.85 + S(t * 31) * 0.45, open: 1.1 + (S(t * 25) > 0 ? 1.5 : 0) }],
    weak: t => [{ lidLo: 0.2, browIn: -1.5, browOut: 1.2, smile: -0.4, mouthW: 0.9, lookX: S(t * 0.5) * 0.55, lookY: 0.5 }, { lid: 0.42 + S(t * 0.7) * 0.1, open: 1.6 + S(t * 1.3) * 0.9, hy: 2.8 + S(t * 1.3) * 0.5, tilt: 0.12 + S(t * 0.4) * 0.03 }],
    sick: t => { const n = bump(t + 1, 5.5, 1.6); return [{ lidU: 0.58 + n * 0.55, lidLo: 0.25 - n * 0.2, browIn: -1.4 - n, browOut: 0.6, smile: -0.65, asym: 0.4, mouthW: 0.9 - n * 0.25, lipPress: n, puff: n, open: 0.5 * (1 - n), creaseBrow: 0.6 }, { hy: -n * 1.3, hx: S(t * 0.8) * 0.7 }]; },
    angry: t => [{ browIn: 2.9, browOut: -1.4, browSq: 1.7, lidU: 0.66, lidLo: 0.42, clench: 1, teeth: 1, open: 2.3, smile: -0.9, mouthW: 1.14, creaseBrow: 1, cheek: 0.45 }, { nostril: 0.6 + 0.4 * S(t * 4.5), hy: 0.6 + S(t * 4.5) * 0.35 }],
    exert: t => [{ browIn: -1, browOut: 0.2, lidU: 0.78, lidLo: 0.25, mouthW: 0.96, smile: -0.15, teeth: 0.4, cheek: 0.3 }, { open: 2.4 + S(t * 9) * 1.7, hy: S(t * 9) * 0.45 }],
    dead: () => [{ lidU: 0, lidLo: 0, open: 2.4, smile: -0.35, mouthW: 0.95, browIn: 0, browOut: 0.7 }, { tilt: 0.24, hy: 3.6 }],
  };
  const newState = () => ({ t: 0, last: null, mood: 'neutral', moodT: 0, hurtT: 9, blinkT: 1 + Math.random() * 2.5, blink: 0, lookT: 0, lx: 0, ly: 0, puffs: [], puffT: 1, rig: Object.assign({}, DEF) });
  let A0 = newState();

  function step(st, A) {
    const now = st.time || 0, dt = A.last == null ? 0.05 : clamp(now - A.last, 0, 0.25); A.last = now; A.t += dt;
    let mood = MOODS[st.expr] ? st.expr : 'neutral'; if (st.dead) mood = 'dead';
    if (mood !== A.mood) { if (mood === 'hurt') A.hurtT = 0; A.mood = mood; A.moodT = 0; }
    if (st.hurtAt != null && st.hurtAt !== A.hurtAt) { A.hurtAt = st.hurtAt; A.hurtT = 0; } // flinch again on every new hit
    A.moodT += dt; A.hurtT += dt;
    const [tg, add] = MOODS[mood](A.moodT, A.hurtT);
    // idle eye movement: glances, quick darting when scared, held gaze otherwise
    A.lookT -= dt;
    if (A.lookT <= 0) {
      const scared = mood === 'scared';
      A.lookT = scared ? 0.25 + Math.random() * 0.45 : 0.9 + Math.random() * 2.6;
      A.lx = scared ? (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4) : Math.random() < 0.55 ? 0 : (Math.random() - 0.5) * 1.4;
      A.ly = scared ? (Math.random() - 0.5) * 0.6 : Math.random() < 0.7 ? 0 : (Math.random() - 0.3) * 0.6;
    }
    const T = Object.assign({}, DEF, tg);
    if (tg.lookX == null && mood !== 'dead') T.lookX = A.lx; if (tg.lookY == null && mood !== 'dead') T.lookY = A.ly; else if (mood !== 'dead') T.lookY += A.ly * 0.3;
    const k = Math.min(1, dt * 11), rig = A.rig;
    for (const key of Object.keys(DEF)) rig[key] += (T[key] - rig[key]) * k;
    // blinking (not when eyes are already shut or in death)
    A.blinkT -= dt;
    if (A.blinkT <= 0 && mood !== 'dead') { A.blink = 0.13; A.blinkT = Math.random() < 0.2 ? 0.28 : 2 + Math.random() * 3.5; }
    A.blink = Math.max(0, A.blink - dt);
    const blinkF = A.blink > 0 ? 1 - S(PI * (1 - A.blink / 0.13)) : 1;
    // shared modifiers that ride on top of any mood
    const shiver = st.cold > 0.55 && mood !== 'dead' && mood !== 'cold' ? (st.cold - 0.55) * 1.6 : 0;
    const out = Object.assign({}, rig);
    out.headX += (add.hx || 0) + S(A.t * 50) * 0.7 * shiver;
    out.headY += (add.hy || 0);
    out.tilt += add.tilt || 0;
    if (add.open != null) out.open = Math.max(out.open, add.open);
    if (add.nostril != null) out.nostril = add.nostril;
    if (add.lid != null) out.lidU = add.lid;
    out.lidU *= blinkF;
    if (st.tired > 0.5 && mood !== 'tired' && mood !== 'dead') out.lidU = Math.min(out.lidU, 0.7 * blinkF);
    out.heave = mood === 'dead' ? 0 : S(A.t * (mood === 'exert' || mood === 'angry' || mood === 'scared' ? 7 : 2.1)) * (mood === 'exert' ? 1 : 0.5);
    // breath vapour in the cold
    if (st.cold > 0.35 && mood !== 'dead') { A.puffT -= dt; if (A.puffT <= 0) { A.puffT = 2.1 + Math.random() * 0.6; A.puffs.push({ t: 0 }); } }
    for (const p of A.puffs) p.t += dt; A.puffs = A.puffs.filter(p => p.t < 1.6);
    return out;
  }

  // ------------------------------------------------------------------ geometry helpers (head space: u right, v down, origin mid-face)
  const faceRx = v => v < 0 ? 18.6 * Math.sqrt(Math.max(0, 1 - (v / 27) * (v / 27))) : v < 10 ? 18.6 - v * 0.12 : 17.4 - (v - 10) * 0.42 - (v - 10) * (v - 10) * 0.026;
  const inFace = (u, v) => v > -23 && Math.abs(u) <= faceRx(v) && v <= 24.6 - u * u / 40;
  function height(u, v, r) { // relief used for skin lighting
    const fx = faceRx(v) || 1, e = 1 - (u / (fx + 1.5)) ** 2 - ((v + 2) / 29) ** 2;
    let z = Math.sqrt(Math.max(0, e)) * 13;
    const au = Math.abs(u);
    z += 4.2 * Math.exp(-(u * u) / 4.4) * clamp((v + 4) / 9, 0, 1) * (v < 7.3 ? 1 : Math.exp(-((v - 7.3) ** 2) / 1.6)); // nose ridge
    z += 2.6 * Math.exp(-(u * u / 9 + (v - 5.6) ** 2 / 4.5)); // nose tip
    z += 1.3 * Math.exp(-(((au - 2.9) ** 2) / 2 + (v - 6.6) ** 2 / 2.2)); // nose wings
    z += 1.8 * Math.exp(-((v + 9.3) ** 2) / 4.5) * (au < 14 ? 1 : 0); // brow ridge
    z -= 2.4 * Math.exp(-(((au - 8.4) ** 2) / 22 + (v + 3) ** 2 / 9)); // eye sockets
    z += (1.4 + r.cheek * 1.6) * Math.exp(-(((au - 9.2) ** 2) / 18 + (v - 4.2 + r.cheek * 1.2) ** 2 / 11)); // cheekbones
    z += r.puff * 4.5 * Math.exp(-(((au - 8) ** 2) / 20 + (v - 9.5) ** 2 / 14)); // puffed cheeks
    z += 2 * Math.exp(-(u * u / 50 + (v - 12.5) ** 2 / 22)); // muzzle
    z += 2.2 * Math.exp(-(u * u / 26 + (v - 20.5) ** 2 / 8)); // chin
    return z;
  }

  // ------------------------------------------------------------------ draw
  const buf = new Uint8ClampedArray(W * H * 4), mat = new Uint8Array(W * H), hu = new Float32Array(W * H), hv = new Float32Array(W * H), zb = new Float32Array(W * H);
  function draw(canvas, _unused, st, inst) { // inst: optional independent animation state (PORTRAIT.instance())
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const A = inst || A0, r = step(st, A), t = A.t;
    const cx = CX + r.headX, cy = CY + r.headY, ct = Math.cos(-r.tilt), sn = Math.sin(-r.tilt), PIV = 30;
    const jaw = Math.max(r.open, r.clench * 2.3) * 0.42, stretch = 1 + jaw / 15;
    const toHead = (px, py) => { const dx = px - cx, dy = py - cy - PIV; return [dx * ct - dy * sn, dx * sn + dy * ct + PIV]; };
    const toScr = (u, v) => { if (v > 8) v = 8 + (v - 8) * stretch; const dy = v - PIV; return [Math.round(cx + u * ct + dy * sn - 0.5), Math.round(cy + PIV - u * sn + dy * ct - 0.5)]; };
    buf.fill(0); mat.fill(0);
    // pass 1: head-space coordinates and relief for the face
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px; let [u, v] = toHead(px + 0.5, py + 0.5); if (v > 8) v = 8 + (v - 8) / stretch;
      hu[i] = u; hv[i] = v; zb[i] = inFace(u, v) ? height(u, v, r) : 0;
    }
    const lidU = r.lidU, cold = st.cold || 0, sick = st.sick || 0, pale = st.pale || 0, flush = Math.max(st.exert ? 0.5 : 0, A.mood === 'angry' ? 0.45 : 0, cold * 0.3);
    const lipBase = mix(mix(C.lip[3], [128, 116, 150], cold * 0.6), [190, 150, 140], (A.mood === 'thirsty' ? 0.45 : 0));
    const tint = c => { if (cold > 0.2) c = mix(c, [150, 172, 214], cold * 0.32); if (pale > 0) c = mix(c, [214, 206, 196], pale * 0.42); if (sick > 0) c = mix(c, [152, 178, 104], sick * 0.36); return c; };
    const browOf = (u, v) => { // returns brow shade index or -1
      for (const s of [-1, 1]) {
        const au = u * s, inner = 3.3 - r.browSq * 0.9, outer = 13.6; if (au < inner || au > outer) continue;
        const p = (au - inner) / (outer - inner), yc = -9.8 + r.browIn * (1 - p) + r.browOut * p - 1.3 * S(PI * Math.min(1, p * 1.12)) * (1 - Math.max(0, r.browIn) * 0.12), th = 3 - 1.4 * p;
        if (Math.abs(v - yc) < th / 2) return v < yc - 0.4 ? 3 : 2;
      }
      return -1;
    };
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px, o = i * 4, u = hu[i], v = hv[i], au = Math.abs(u);
      let col = null, m = 0;
      // ---- hat: brim (front half over the crown), crown with band and dent, brim back
      const bcy = -18.6, eb = (u / 33.5) ** 2 + ((v - bcy) / 5.4) ** 2, cw = 19.6 - (bcy - v) * 0.18, ctop = -39.5 + 3.2 * (u / 16.5) ** 2 + 2.5 * Math.exp(-u * u / 12);
      const inCrown = v <= bcy + 0.5 && v >= ctop && au <= cw;
      if (eb <= 1 && v >= bcy) { // front brim: lit top surface, darker lip at its edge
        const edge = eb > 0.78 && v > bcy + 1.4; col = shadeOf(C.hat, clamp(0.62 - u / 90 - (edge ? 0.35 : 0) + (hash(px, py) - 0.5) * 0.12, 0, 1), px, py); m = 1;
      } else if (inCrown) {
        const nx = clamp(u / cw, -1, 1), nz = Math.sqrt(1 - nx * nx), d = Math.max(0, nx * L[0] - 0.25 * L[1] + nz * L[2]);
        if (v > bcy - 4.6) col = shadeOf(C.band, clamp(d * 1.1 - 0.1, 0, 1), px, py);
        else { const dent = Math.exp(-(u * u) / 10 - ((v - ctop - 1.5) ** 2) / 8); col = shadeOf(C.hat, clamp(0.16 + d * 0.9 - dent * 0.25 + (hash(px * 2, py) - 0.5) * 0.1, 0, 1), px, py); }
        m = 1;
      } else if (eb <= 1) { col = shadeOf(C.hat, 0.45 - u / 120, px, py); m = 1; }
      // ---- face
      if (!col && inFace(u, v)) {
        m = 2; let si = null, special = null;
        // eyes
        for (const s of [-1, 1]) {
          const ex = u - s * 8.4, ey = v + 3; if (Math.abs(ex) > 6 || ey < -6.5 || ey > 4.5) continue;
          const tt = ex / 4.8, shp = Math.max(0, 1 - tt * tt), eh = 3.2;
          const top = -eh * lidU * Math.pow(shp, 0.55) - (s * ex > 0 ? 0.25 * shp : 0), bot = eh * 0.8 * Math.pow(shp, 0.75) * (1 - r.lidLo * 0.72);
          if (lidU < 0.12) { // shut: a lash curve (squeezed shut curves up, relaxed curves down)
            const cyy = (r.lidLo > 0.45 ? -0.7 : 0.7) * shp;
            if (Math.abs(tt) < 1.06 && Math.abs(ey - cyy) < 0.75) { special = C.line; break; }
            if (r.lidLo > 0.45 && Math.abs(tt) < 0.9 && (Math.abs(ey - (cyy - 2.3)) < 0.45 || Math.abs(ey - (cyy + 2)) < 0.4)) { si = -2; break; }
            continue;
          }
          if (Math.abs(tt) < 1 && ey > top && ey < bot) {
            const ix = ex - r.lookX * 1.7, iy = ey - r.lookY * 1.15, d = Math.hypot(ix, iy);
            if (d < 1.3 * r.pupil) special = C.iris[0];
            else if (d < 2.7) special = C.iris[clamp(Math.round(1 + (iy > 0.4 ? 2 : iy > -0.8 ? 1 : 0) - (ey - top < 1.2 ? 1 : 0)), 0, 3)];
            else { let w = ey - top < 1 ? 1 : Math.abs(tt) > 0.72 ? 1 : 2; if (sick > 0.3 && hash(px, py) > 0.6) special = mix(C.white[w], [200, 190, 110], 0.4); else special = C.white[w + (ey > 0.5 && Math.abs(tt) < 0.5 ? 1 : 0)]; if ((st.tired || 0) > 0.5 && Math.abs(tt) > 0.5 && hash(px * 3, py) > 0.7) special = [176, 92, 84]; }
            if (lidU > 0.32 && Math.abs(ix + 0.9) < 0.6 && Math.abs(iy + 0.9) < 0.6) special = [255, 246, 228]; // catch-light
            m = 3; break;
          }
          if (Math.abs(tt) < 1.1 && ey <= top + 0.05 && ey > top - 1.2 - 0.6 * Math.max(0, s * tt)) { special = C.line; break; } // upper lash line
          if (Math.abs(tt) < 0.95 && ey >= bot && ey < bot + 0.75) { si = -2; break; } // lower lid
          if (lidU > 0.5 && Math.abs(tt) < 0.9 && ey < top - 2 && ey > top - 2.6) { si = -1; break; } // lid fold
          if ((st.tired || 0) > 0.3 && Math.abs(tt) < 0.85 && ey > bot + 0.9 && ey < bot + 2.4) { si = -1.4 * st.tired; break; } // dark rings
          if ((r.cheek > 0.5 || r.lidLo > 0.6) && s * ex > 4.6 && s * ex < 7.4) { const q = s * ex - 4.6; for (const kk of [-0.55, 0, 0.55]) if (Math.abs(ey - kk * q) < 0.4) si = -1.3; if (si) break; } // crow's feet
        }
        // brows
        if (!special && si == null) { const b = browOf(u, v); if (b >= 0) { special = C.hair[b + (hash(px, py * 3) > 0.75 ? 1 : 0)]; if (cold > 0.5 && hash(px * 5, py) > 0.82) special = [214, 228, 240]; m = 4; } }
        // mouth
        if (!special && si == null) {
          const hw = 6.8 * r.mouthW * (1 - r.pucker * 0.4), tt = u / hw, at = Math.abs(tt);
          if (at <= 1.15 && v > 6 && v < 22) {
            const y0 = 12.6 - r.smile * 3.1 * tt * tt + r.asym * tt, op = Math.max(r.open, r.clench * 2.3), sh = Math.pow(Math.max(0, 1 - tt * tt), r.pucker > 0.2 ? 0.45 : 0.65);
            const yu = y0 - op * 0.3 * sh, yl = y0 + op * 0.7 * sh;
            const lipU = yu - (1.9 - r.lipPress) * Math.pow(Math.max(0, 1 - tt * tt), 0.35), lipL = yl + (2.4 - r.lipPress * 1.2) * Math.pow(Math.max(0, 1 - tt * tt), 0.4);
            if (r.tongue > 0.5 && op < 3 && Math.hypot((u - 1.2) / 2.5, (v - yl - 0.9) / (1.5 * r.tongue)) < 1) { special = C.tongue[v < yl + 0.8 ? 2 : 1]; m = 5; }
            else if (op > 0.7 && at < 1 && v > yu && v < yl) {
              m = 5;
              const gap = Math.abs(u) < 0.45 || Math.abs(Math.abs(u) - 2.7) < 0.35 || Math.abs(Math.abs(u) - 5) < 0.35;
              if (r.teeth > 0.05 && v < yu + 1.8 * r.teeth) special = C.teeth[gap ? 0 : v < yu + 0.8 ? 1 : 2];
              else if (r.clench > 0.3 && v > yl - 1.7) special = C.teeth[gap ? 0 : 1];
              else if (r.tongue > 0.05 && v > yl - 0.8 - r.tongue * 1.4) special = C.tongue[1];
              else special = C.mouth[at < 0.5 ? 0 : 1];
            } else if (at < 1 && v >= lipU && v <= yu + 0.55) { m = 5; special = op <= 0.7 && Math.abs(v - y0) < 0.6 ? C.lip[0] : mix(lipBase, C.lip[1], 0.55); }
            else if (at < 1 && v > yl && v <= lipL) { m = 5; special = v < yl + 1 && at < 0.55 ? mix(lipBase, C.lip[4], 0.5) : lipBase; if (A.mood === 'thirsty' && hash(px, py) > 0.72) special = C.lip[1]; }
            else if (at >= 0.95 && at <= 1.15 && Math.abs(v - y0) < 0.8) { m = 5; special = C.lip[0]; } // corners
          }
        }
        if (!special && si == null) {
          // nostrils, folds, creases
          for (const s of [-1, 1]) if (Math.hypot((u - s * 2.5) / (1.15 + r.nostril * 0.55), (v - 7.4) / 0.7) < 1) special = C.skin[1];
          const fold = Math.max(r.smile, r.clench, r.cheek * 0.8);
          if (!special && fold > 0.25) for (const s of [-1, 1]) {
            const ax = s * (4.3 + r.cheek * 0.5), ay = 7.4, bx = s * (8.2 + r.smile * 0.6 + r.clench * 0.5), by = 14 - r.smile * 1.3, qx = u - ax, qy = v - ay, dx = bx - ax, dy = by - ay, tq = clamp((qx * dx + qy * dy) / (dx * dx + dy * dy), 0, 1);
            if (Math.hypot(qx - dx * tq, qy - dy * tq) < 0.5) si = -1.4 * fold;
          }
          if (r.creaseBrow > 0.2 && Math.abs(au - 1.3) < 0.45 && v > -11.5 && v < -7.4) si = -1.3 * r.creaseBrow;
          if (r.creaseFore > 0.2 && au < 9 && (Math.abs(v + 13 - 0.5 * S(u * 0.5)) < 0.45 || Math.abs(v + 15.2 - 0.5 * S(u * 0.45 + 1)) < 0.45)) si = -1.2 * r.creaseFore;
        }
        if (special) col = special;
        else {
          // skin: light from relief, brim shadow, stubble, tints
          const zr = zb[i + 1 < W * H ? i + 1 : i] || zb[i], zl = zb[i - 1 >= 0 ? i - 1 : i] || zb[i], zd = zb[i + W < W * H ? i + W : i] || zb[i], zu = zb[i - W >= 0 ? i - W : i] || zb[i];
          let nx = -(zr - zl) * 0.5, ny = -(zd - zu) * 0.5, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          let lv = 0.2 + 0.85 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          if (v < -10.6 + u * 0.1) lv *= 0.55; // shadow under the hat brim
          if (v > 20 && au > 6) lv *= 0.9;
          lv += (si || 0) / 7;
          const stubble = v > 8.5 && v < 25 && !(au < 8 && v > 10 && v < 16.5) && au < faceRx(v) - 0.8 && hash(px, py) > 0.6;
          if (stubble) lv -= 0.09;
          col = shadeOf(C.skin, clamp(lv, 0, 1), px, py, 0.6);
          if (stubble) col = mix(col, C.hair[2], 0.18);
          const ck = Math.exp(-(((au - 9.5) ** 2) / 10 + (v - 5.5) ** 2 / 8));
          if (flush > 0) col = mix(col, [196, 70, 60], flush * 0.5 * ck);
          if (A.mood === 'content') col = mix(col, [214, 110, 96], 0.14 * ck);
          if (cold > 0.2) { col = mix(col, [150, 172, 214], cold * 0.32); const nose = Math.exp(-(u * u / 6 + (v - 5) ** 2 / 5)); col = mix(col, [200, 76, 76], cold * 0.45 * Math.max(nose, ck * 0.7)); }
          if (pale > 0) col = mix(col, [214, 206, 196], pale * 0.42);
          if (sick > 0) col = mix(col, [152, 178, 104], sick * 0.36);
          if (stubble && cold > 0.7 && hash(px * 7, py) > 0.975) col = [222, 234, 246];
        }
      }
      // ears
      if (!col) for (const s of [-1, 1]) { const ex = (u - s * 18.6) / 2.7, ey = (v - 0.5) / 5.2; if (ex * ex + ey * ey <= 1 && au > faceRx(v) - 0.5) { const inner = Math.hypot((u - s * 18.4) / 1.4, (v - 0.8) / 3.2) < 1; col = shadeOf(C.skin, (s < 0 ? 0.62 : 0.38) - (inner ? 0.28 : 0) - (v < -3 ? 0.1 : 0), px, py); col = tint(col); if (cold > 0.2) col = mix(col, [200, 80, 80], cold * 0.35); m = 9; } }
      // hair: back & sides, fringe under the brim, sideburns
      if (!col) {
        const back = (u / 21.5) ** 2 + ((v + 6) / 23) ** 2 <= 1 && v < 5;
        if (back) { col = C.hair[clamp(1 + (hash(px, py * 2) > 0.72 ? 1 : 0) + (u < -6 ? 1 : 0) - (st.wet > 0.5 ? 1 : 0), 0, 4)]; m = 6; }
      }
      if (m === 2 && !(mat[i]) && col) {
        if ((v < -16.4 + 1.4 * hash(Math.floor(u * 0.9), 3) && au < 17) || (au > faceRx(v) - 2.3 && v < 1 && v > -17)) { col = C.hair[clamp(1 + (hash(px, py) > 0.7 ? 1 : 0) - (st.wet > 0.5 ? 1 : 0), 0, 4)]; m = 6; }
      }
      // shirt, strap and collar (screen space, rising with breath), then the neck behind
      if (!col) {
        const hv0 = r.heave * 0.6, sy = py + 0.5 - (111 + hv0), sx = px + 0.5 - CX, e = Math.pow(Math.abs(sx) / 46, 2.6) + (sy / 29) ** 2;
        const vee = py + 0.5 > 81 + hv0 && Math.abs(sx) < 7 - (py - 81 - hv0) * 0.75;
        if (e <= 1 && !vee) {
          const sl = (px + 0.5 - 66) * (108 - 83) - (py + 0.5 - 83) * (30 - 66), sd = Math.abs(sl) / Math.hypot(25, 36);
          const nearVee = Math.abs(sx) < 10 - (py - 81 - hv0) * 0.75 && py < 96;
          if (sd < 2.7 && py > 80) { col = shadeOf(C.strap, sd < 1 ? 0.75 : 0.45, px, py); m = 10; if (Math.hypot(px - 52, py - 95) < 2.2) col = [150, 128, 80]; }
          else if (nearVee || e > 0.84 && sy < -16) { col = shadeOf(C.collar, 0.55 - sx / 60, px, py); m = 10; }
          else { const nx = sx / 46, ny = sy / 29, nz = Math.sqrt(Math.max(0.05, 1 - e)), d = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / Math.hypot(nx, ny, nz)); col = shadeOf(C.shirt, clamp(0.15 + d * 0.85 + (S(px * 0.7 + py * 0.25) > 0.85 ? -0.12 : 0), 0, 1), px, py); m = 7; }
        }
      }
      if (!col && au < 9.2 + Math.max(0, v - 26) * 0.5 && v > 14 && v < 60) { col = shadeOf(C.skin, v < 25.6 ? 0.18 : 0.44 - u / 40, px, py); col = tint(col); m = 8; }
      if (col) { buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; buf[o + 3] = 255; mat[i] = m; }
    }
    // ---- overlays painted in head space
    const put = (u, v, c, a = 1, on) => { const [x, y] = toScr(u, v); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (on && !on.includes(mat[i])) return; const o = i * 4; if (!buf[o + 3]) return; buf[o] += (c[0] - buf[o]) * a; buf[o + 1] += (c[1] - buf[o + 1]) * a; buf[o + 2] += (c[2] - buf[o + 2]) * a; };
    const SK = [2, 9, 8], SKH = [2, 9, 8, 1, 6, 4];
    const dirt = st.dirt || 0;
    if (dirt > 0.05) for (const [du, dv, rr] of [[-11, 6, 3.2], [8, -13, 2.4], [5, 20, 2.2], [13, 3, 1.8]]) for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const d = Math.hypot(a, b) / rr; if (d < 1 && hash(du + a, dv + b) < dirt * 1.4 * (1 - d)) put(du + a, dv + b, [92, 64, 40], 0.5, SK); }
    const bruise = st.bruise || 0;
    if (bruise > 0.05) for (let a = -6; a <= 6; a++) for (let b = -4; b <= 6; b++) { const d = Math.hypot(a / 6, (b - 0.5) / 5); if (d < 1 && d > 0.35) put(-8.4 + a, -3 + b, d > 0.8 ? [150, 140, 70] : [96, 50, 96], bruise * 0.55 * (1 - d * 0.5), SK); }
    const blood = st.blood || 0, bleeding = st.bleeding, red = [150, 18, 24], dark = [96, 10, 16];
    if (blood > 0.12) { // forehead gash with a drip toward the brow
      for (let k = 0; k < 5; k++) put(4.5 + k, -14 + k * 0.5, dark, 1, SK);
      const len = 2 + blood * 8 + (bleeding ? (t * 2.4) % 4 : 0); for (let k = 0; k < len; k++) put(7 + (k > 4 ? 0.5 : 0), -12 + k, k > len - 2 ? red : [170, 26, 32], 0.95, SKH);
      if (bleeding) { const f = (t * 1.6) % 1; put(7.5, -12 + len + f * 10, red, 1, SKH); }
    }
    if (blood > 0.35) for (let k = 0; k < 3; k++) for (let q = 0; q < 5; q++) put(-12.5 + k * 1.6 + q * 0.7, 2.5 + q, k === 1 ? dark : red, 0.85, SK); // claw scratches
    if (blood > 0.6) { const len = 4 + blood * 5 + (bleeding ? (t * 2) % 3 : 0); for (let k = 0; k < len; k++) put(2.6 + k * 0.08, 7.8 + k, [160, 20, 28], 1, [2, 5]); } // nosebleed over the lip
    if (blood > 0.25) for (let k = 0; k < Math.round(blood * 12); k++) put((hash(k, 1) - 0.5) * 30, -10 + hash(k, 2) * 30, hash(k, 3) > 0.5 ? red : dark, 0.9, SK);
    const sweat = st.sweat || 0;
    if (sweat > 0.1) for (let k = 0; k < 2 + Math.round(sweat * 3); k++) { const su = [-14.5, 14.2, -6, 9, 2][k], sv = -12 + ((t * (2.2 + k * 0.4) + k * 2.7) % 11); put(su, sv, [210, 236, 255], 0.9, SK); put(su, sv + 1, [140, 190, 230], 0.7, SK); }
    if ((A.mood === 'weak' || (A.mood === 'hurt' && blood > 0.5)) && lidU > 0.05) for (const s of [-1, 1]) for (let k = 0; k < 5; k++) put(s * 11 + s * k * 0.15, 0.5 + k + ((t * 1.5) % 1) * 2, [170, 210, 240], 0.55, SK); // tears
    const wet = st.wet || 0;
    if (wet > 0.15) for (let k = 0; k < Math.round(wet * 16); k++) { const du = (hash(k, 7) - 0.5) * 50, dv = -38 + ((t * (3 + hash(k, 8) * 3) + hash(k, 9) * 60) % 60); put(du, dv, [200, 225, 245], 0.8, SKH); put(du, dv - 1, [160, 200, 235], 0.4, SKH); }
    if (cold > 0.4) { // rime on top of the hat and brim
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { const i = y * W + x; if (mat[i] === 1 && (y === 0 || mat[i - W] === 0)) { const o = i * 4, a = Math.min(1, (cold - 0.4) * 2) * (0.6 + hash(x, y) * 0.4); buf[o] += (232 - buf[o]) * a; buf[o + 1] += (242 - buf[o + 1]) * a; buf[o + 2] += (252 - buf[o + 2]) * a; if (y + 1 < H && hash(x, 9) > 0.5 && mat[i + W] === 1) { const o2 = o + W * 4; buf[o2] += (210 - buf[o2]) * a * 0.6; buf[o2 + 1] += (226 - buf[o2 + 1]) * a * 0.6; buf[o2 + 2] += (244 - buf[o2 + 2]) * a * 0.6; } break; } }
    }
    // silhouette outline
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (mat[i]) continue; if ((x > 0 && mat[i - 1]) || (x < W - 1 && mat[i + 1]) || (y > 0 && mat[i - W]) || (y < H - 1 && mat[i + W])) { const o = i * 4; buf[o] = C.outline[0]; buf[o + 1] = C.outline[1]; buf[o + 2] = C.outline[2]; buf[o + 3] = 255; } }
    // breath vapour, drifting up and away
    for (const p of A.puffs) { const [bx, by] = toScr(0, 13.5); const rr = 2 + p.t * 5, ox = bx - 4 - p.t * 9, oy = by - p.t * 7, a = (1 - p.t / 1.6) * 0.55;
      for (let y = Math.floor(oy - rr); y <= oy + rr; y++) for (let x = Math.floor(ox - rr); x <= ox + rr; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const d = Math.hypot(x - ox, y - oy) / rr; if (d > 1 || BAYER[(y & 3) * 4 + (x & 3)] + 0.5 > a * (1.3 - d)) continue; const o = (y * W + x) * 4; buf[o] = 228; buf[o + 1] = 236; buf[o + 2] = 244; buf[o + 3] = Math.max(buf[o + 3], 200); } }
    if (A.mood === 'dead') for (let o = 0; o < buf.length; o += 4) { const g = (buf[o] + buf[o + 1] + buf[o + 2]) / 3 * 0.8; buf[o] = g + 6; buf[o + 1] = g; buf[o + 2] = g; }
    if (st.flash > 0) for (let o = 0; o < buf.length; o += 4) if (buf[o + 3]) { const a = st.flash * 0.5; buf[o] += (220 - buf[o]) * a; buf[o + 1] *= 1 - a; buf[o + 2] *= 1 - a; }
    const g = canvas.getContext('2d'), id = g.createImageData(W, H); id.data.set(buf); g.putImageData(id, 0, 0);
  }
  root.PORTRAIT = { draw, W, H, moods: Object.keys(MOODS), instance: newState, reset: () => { A0 = newState(); } };
})(typeof window !== 'undefined' ? window : globalThis);
