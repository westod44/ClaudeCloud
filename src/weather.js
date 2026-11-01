/*
 * Weather: a state machine over clear / fair / cloudy / overcast / rain / storm / fog / snow / windy,
 * with smoothly blended parameters, rolling cloud shadows, wind with travelling gusts,
 * rain, snow (with ground accumulation), fog banks, lightning, and blowing leaves.
 * World-space drawing happens in art pixels (the game's camera transform); precipitation is screen space.
 */
(function (root) {
  const TYPES = {
    clear: { cloud: 0.06, wind: 0.12, rain: 0, snow: 0, fog: 0, dark: 0, storm: 0, label: 'Clear' },
    fair: { cloud: 0.3, wind: 0.28, rain: 0, snow: 0, fog: 0, dark: 0, storm: 0, label: 'Fair' },
    cloudy: { cloud: 0.6, wind: 0.38, rain: 0, snow: 0, fog: 0, dark: 0.06, storm: 0, label: 'Cloudy' },
    overcast: { cloud: 0.95, wind: 0.32, rain: 0, snow: 0, fog: 0.05, dark: 0.16, storm: 0, label: 'Overcast' },
    rain: { cloud: 0.95, wind: 0.5, rain: 0.7, snow: 0, fog: 0.08, dark: 0.22, storm: 0, label: 'Rain' },
    storm: { cloud: 1, wind: 0.95, rain: 1, snow: 0, fog: 0.1, dark: 0.34, storm: 1, label: 'Thunderstorm' },
    fog: { cloud: 0.45, wind: 0.05, rain: 0, snow: 0, fog: 0.9, dark: 0.1, storm: 0, label: 'Fog' },
    snow: { cloud: 0.9, wind: 0.4, rain: 0, snow: 0.8, fog: 0.15, dark: 0.12, storm: 0, label: 'Snow' },
    windy: { cloud: 0.4, wind: 1.0, rain: 0, snow: 0, fog: 0, dark: 0.02, storm: 0, label: 'Gale' },
  };
  const NEXT = {
    clear: [['fair', 4], ['cloudy', 2], ['windy', 1.5], ['fog', 1], ['clear', 1.5]],
    fair: [['clear', 3], ['cloudy', 3.5], ['windy', 1.5], ['rain', 1], ['fog', 1]],
    cloudy: [['overcast', 3.5], ['rain', 2.5], ['fair', 2.5], ['windy', 1.5]],
    overcast: [['rain', 4], ['storm', 1.5], ['cloudy', 2.5], ['snow', 1], ['fog', 1]],
    rain: [['storm', 2.5], ['overcast', 3.5], ['cloudy', 3], ['fair', 1]],
    storm: [['rain', 5], ['overcast', 4], ['windy', 1]],
    fog: [['fair', 4], ['cloudy', 4], ['clear', 2]],
    snow: [['overcast', 4], ['cloudy', 3], ['snow', 2], ['clear', 1]],
    windy: [['fair', 4], ['cloudy', 3], ['storm', 1], ['clear', 2]],
  };
  const S = { type: 'fair', t: 160, cur: Object.assign({}, TYPES.fair), gust: 0, gustT: 5, gustPow: 0, dirA: -0.25, flash: 0, boltT: 8, snowCover: 0, time: 0, label: 'Fair' };
  let clouds = [], leaves = [], drops = [], flakes = [];
  const CLOUD_IMGS = [];
  function makeClouds() {
    for (let v = 0; v < 6; v++) {
      const w = 420, h = 230, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      let seed = v * 977 + 13; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 34; k++) {
        const x = w * (0.18 + r() * 0.64), y = h * (0.3 + r() * 0.42) - Math.abs(x - w / 2) * 0.12, rad = 30 + r() * 62 * (1 - Math.abs(x - w / 2) / w);
        const gr = g.createRadialGradient(x, y, rad * 0.1, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      }
      // pixel-snap the alpha into a few levels for a painted, sprite-like edge
      const id = g.getImageData(0, 0, w, h), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; const q = a < 0.12 ? 0 : a < 0.3 ? 0.35 : a < 0.5 ? 0.6 : 0.85; const shade = 0.82 + 0.18 * Math.min(1, a * 1.4); d[i] = 255 * shade; d[i + 1] = 255 * shade; d[i + 2] = 255 * Math.min(1, shade + 0.03); d[i + 3] = q * 255; }
      g.putImageData(id, 0, 0);
      const s = document.createElement('canvas'); s.width = w; s.height = h; const sg = s.getContext('2d'); sg.drawImage(c, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#05070c'; sg.fillRect(0, 0, w, h);
      CLOUD_IMGS.push({ img: c, shadow: s, w, h });
    }
  }
  function pickNext(day) {
    const opts = NEXT[S.type].filter(([k]) => k !== 'snow' || day >= 2);
    let tot = 0; for (const [, w] of opts) tot += w; let r = Math.random() * tot;
    for (const [k, w] of opts) { r -= w; if (r <= 0) return k; } return 'fair';
  }
  function force(type) { if (!TYPES[type]) return; S.type = type; S.t = 180; S.label = TYPES[type].label; }
  function update(dt, env) {
    if (!CLOUD_IMGS.length) makeClouds();
    S.time += dt; S.t -= dt;
    if (S.t <= 0) { S.type = pickNext(env.day); S.t = 100 + Math.random() * 140; S.label = TYPES[S.type].label; if (env.onChange) env.onChange(S.type); }
    const tgt = TYPES[S.type], k = Math.min(1, dt / 18);
    for (const key of ['cloud', 'wind', 'rain', 'snow', 'fog', 'dark', 'storm']) S.cur[key] += (tgt[key] - S.cur[key]) * k;
    S.dirA += (Math.sin(S.time * 0.013) * 0.4 - 0.25 - S.dirA) * dt * 0.05;
    // gusts
    S.gustT -= dt; if (S.gustT <= 0) { S.gustT = 3 + Math.random() * (10 - S.cur.wind * 6); S.gustPow = 0.25 + S.cur.wind * 0.75 * Math.random(); }
    S.gust += ((S.gustT > 0 && S.gustT < 2.5 ? S.gustPow : 0) - S.gust) * Math.min(1, dt * 1.5);
    // snow accumulation
    if (S.cur.snow > 0.3) S.snowCover = Math.min(0.85, S.snowCover + dt / 160 * S.cur.snow); else S.snowCover = Math.max(0, S.snowCover - dt / (S.type === 'clear' ? 150 : 320));
    // lightning
    S.flash = Math.max(0, S.flash - dt * 3.2);
    if (S.cur.storm > 0.6) { S.boltT -= dt; if (S.boltT <= 0) { S.boltT = 5 + Math.random() * 11; S.flash = 1; if (env.onBolt) env.onBolt(); } }
    // clouds: keep a population around the view, drifting downwind
    const vx = Math.cos(S.dirA) * (14 + S.cur.wind * 50), vy = Math.sin(S.dirA) * (14 + S.cur.wind * 50) * 0.5;
    const want = Math.round(S.cur.cloud * 16), m = 600;
    const L = env.vl - m, R_ = env.vr + m, T = env.vt - m, B = env.vb + m;
    for (const c of clouds) { c.x += vx * dt * c.sp; c.y += vy * dt * c.sp; }
    clouds = clouds.filter(c => c.x > L - 400 && c.x < R_ + 400 && c.y > T - 400 && c.y < B + 400 && !(c.fade && c.a <= 0));
    while (clouds.filter(c => !c.fade).length < want) {
      const fresh = clouds.length < 2 && !S.seeded; // first fill: anywhere in view
      const x = fresh ? L + Math.random() * (R_ - L) : vx > 0 ? L - 200 + Math.random() * 200 : R_ + Math.random() * 200, y = T + Math.random() * (B - T);
      clouds.push({ x: fresh || Math.random() < 0.3 ? L + Math.random() * (R_ - L) : x, y, v: (Math.random() * 6) | 0, s: 0.9 + Math.random() * 1.1 + S.cur.cloud * 0.6, sp: 0.8 + Math.random() * 0.4, a: 0, alt: 180 + Math.random() * 120 });
    }
    S.seeded = true;
    let extra = clouds.filter(c => !c.fade).length - want; for (const c of clouds) { if (extra <= 0) break; if (!c.fade) { c.fade = true; extra--; } }
    for (const c of clouds) c.a = c.fade ? Math.max(0, c.a - dt * 0.25) : Math.min(1, c.a + dt * 0.25);
    // blowing leaves in strong wind
    if (S.cur.wind + S.gust * 0.6 > 0.6 && leaves.length < 40 && Math.random() < dt * 20 * S.cur.wind) leaves.push({ x: env.vl - 20, y: env.vt + Math.random() * (env.vb - env.vt), t: 0, ph: Math.random() * 6, c: ['#5f8a2a', '#9aa83c', '#b8862c', '#7a5a2a'][(Math.random() * 4) | 0], sp: 0.7 + Math.random() * 0.6 });
    for (const l of leaves) { l.t += dt; const w = 120 + (S.cur.wind + S.gust) * 160; l.x += Math.cos(S.dirA) * w * dt * l.sp + Math.sin(l.t * 5 + l.ph) * 10 * dt; l.y += (Math.sin(S.dirA) * w * 0.5 + Math.cos(l.t * 3 + l.ph) * 30) * dt * l.sp; }
    leaves = leaves.filter(l => l.x < env.vr + 40 && l.t < 12);
  }
  // effective wind at a screen-space point (art px), with gusts travelling downwind as waves
  function windAt(sx, sy) {
    const dx = Math.cos(S.dirA), dy = Math.sin(S.dirA), along = sx * dx + sy * dy;
    const wave = Math.max(0, Math.sin(along / 260 - S.time * (1.2 + S.cur.wind))) ;
    return Math.min(1.6, S.cur.wind * (0.75 + 0.25 * Math.sin(S.time * 0.7 + along / 500)) + S.gust * wave * 1.1);
  }
  function drawCloudShadows(ctx, vis) {
    // the clouds themselves are never drawn: only their dark shadows roll across the land
    for (const c of clouds) { const im = CLOUD_IMGS[c.v]; ctx.globalAlpha = Math.min(0.5, 0.36 * c.a * vis * (0.8 + S.cur.cloud * 0.35)); ctx.drawImage(im.shadow, c.x - im.w * c.s / 2, c.y - im.h * c.s / 2, im.w * c.s, im.h * c.s); }
    ctx.globalAlpha = 1;
  }
  function drawClouds(ctx, night) {
    for (const l of leaves) { ctx.fillStyle = l.c; ctx.fillRect(Math.round(l.x), Math.round(l.y), 2 + (Math.sin(l.t * 9 + l.ph) > 0 ? 1 : 0), 2); }
  }
  // screen-space precipitation, fog and lightning; px = device pixels per art pixel
  const fogC = document.createElement('canvas'); fogC.width = fogC.height = 256; (function () {
    const g = fogC.getContext('2d'), id = g.createImageData(256, 256), d = id.data, N = root.NOISE;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const n = N.fbm2(x / 64, y / 64, 4, 3, 4); const a = Math.max(0, (n - 0.35) * 1.8); const o = (y * 256 + x) * 4; d[o] = 220; d[o + 1] = 226; d[o + 2] = 232; d[o + 3] = Math.min(255, a * 255); }
    g.putImageData(id, 0, 0);
  })();
  function drawScreen(ctx, W, H, px, camX, camY, dt, night) {
    const c = S.cur;
    // fog banks (parallax with the camera, drifting with the wind)
    if (c.fog > 0.02) {
      ctx.save(); ctx.globalAlpha = Math.min(0.75, c.fog * 0.8) * (1 - night * 0.35); const sc = 3 * px, tw = 256 * sc;
      const ox = -((camX * px * 0.6 + S.time * 12 * px) % tw) - tw, oy = -((camY * px * 0.6) % tw) - tw;
      ctx.imageSmoothingEnabled = true;
      for (let y = oy; y < H; y += tw) for (let x = ox; x < W; x += tw) ctx.drawImage(fogC, x, y, tw, tw);
      ctx.globalAlpha = c.fog * 0.25; ctx.fillStyle = night > 0.5 ? '#1a2030' : '#c8d0d8'; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // rain
    const nRain = Math.round(c.rain * 260);
    while (drops.length < nRain) drops.push({ x: Math.random(), y: Math.random(), s: 0.7 + Math.random() * 0.6 });
    if (drops.length > nRain) drops.length = nRain;
    if (nRain) {
      const ang = 0.25 + (c.wind + S.gust) * 0.35, len = 16 * px;
      ctx.strokeStyle = night > 0.5 ? 'rgba(150,170,200,0.35)' : 'rgba(200,215,235,0.4)'; ctx.lineWidth = Math.max(1, px * 0.7); ctx.beginPath();
      for (const d of drops) { d.y += dt * 1.9 * d.s; d.x -= dt * ang * 1.2 * d.s; if (d.y > 1) { d.y -= 1; d.x = Math.random() * 1.3; } if (d.x < -0.1) d.x += 1.2; const x = d.x * W, y = d.y * H; ctx.moveTo(x, y); ctx.lineTo(x - Math.sin(ang) * len * d.s, y - Math.cos(ang) * len * d.s); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(210,225,240,0.35)'; for (let k = 0; k < c.rain * 25; k++) ctx.fillRect(Math.random() * W, Math.random() * H, 2 * px, px);
    }
    // snow
    const nSnow = Math.round(c.snow * 320);
    while (flakes.length < nSnow) flakes.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), ph: Math.random() * 6 });
    if (flakes.length > nSnow) flakes.length = nSnow;
    ctx.fillStyle = 'rgba(245,248,255,0.9)';
    for (const f of flakes) { f.y += dt * 0.12 * f.s; f.x += dt * (0.04 * Math.sin(S.time + f.ph) + Math.cos(S.dirA) * (c.wind + S.gust) * 0.12); if (f.y > 1) { f.y -= 1; f.x = Math.random(); } f.x = (f.x + 1.2) % 1.2 - 0.1; const sz = Math.max(1, Math.round(px * (f.s > 1.1 ? 2 : 1.4))); ctx.fillRect(Math.round(f.x * W), Math.round(f.y * H), sz, sz); }
    // lightning
    if (S.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${S.flash * 0.55})`; ctx.fillRect(0, 0, W, H); }
  }

  root.WEATHER = { S, TYPES, update, windAt, drawCloudShadows, drawClouds, drawScreen, force, get wind() { return Math.min(1.5, S.cur.wind + S.gust * 0.7); } };
})(typeof window !== 'undefined' ? window : globalThis);
