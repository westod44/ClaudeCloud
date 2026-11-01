/*
 * Player status portrait: picks a baked expression (rendered from the same 3D survivor model)
 * and layers pixel-art state on top: blood, bruises, dirt, sweat, rain, frost, pallor,
 * sickness, tired eyes. Overlays are placed only on skin / hat / eye pixels found by colour.
 */
(function (root) {
  const cache = {}; // expr -> { w,h, data (Uint8ClampedArray), skin:[idx], eyes:[idx], hat:[idx], hair:[idx] }
  const near = (d, o, c, tol) => Math.abs(d[o] - c[0]) + Math.abs(d[o + 1] - c[1]) + Math.abs(d[o + 2] - c[2]) < tol;
  function analyse(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height), d = id.data, PALc = root.PAL, W = c.width, H = c.height;
    const ramp = name => PALc.PALETTE.entries.map((e, i) => e.name.startsWith(name + '.') ? PALc.colors[i] : null).filter(Boolean);
    const skin = ramp('skin'), hair = ramp('hair');
    // The hat is found geometrically, not by colour (lit skin and hat leather share palette shades):
    // the brim is the widest silhouette row in the upper half; everything down to the brim's underside is hat.
    const width = new Array(H).fill(0);
    for (let y = 0; y < H; y++) { let a = -1, b = -1; for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (a < 0) a = x; b = x; } width[y] = a < 0 ? 0 : b - a + 1; }
    let brimY = 0, best = 0; for (let y = 0; y < H * 0.55; y++) if (width[y] > best) { best = width[y]; brimY = y; }
    let hatEnd = brimY; while (hatEnd + 1 < H * 0.6 && width[hatEnd + 1] > best * 0.72) hatEnd++;
    const out = { w: W, h: H, data: d, skin: [], eyes: [], hat: [], hair: [], hatEnd, eyeY: 0 };
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      if (!d[i + 3]) continue; const y = (p / W) | 0;
      if (y <= hatEnd) { out.hat.push(p); continue; }
      if (y < H * 0.62 && d[i] > 200 && d[i + 1] > 190 && d[i + 2] > 180) out.eyes.push(p);
      else if (skin.some(s => near(d, i, s, 40))) out.skin.push(p);
      else if (y < H * 0.62 && hair.some(s => near(d, i, s, 30))) out.hair.push(p);
    }
    out.eyeY = out.eyes.length ? out.eyes.reduce((a, p) => a + ((p / W) | 0), 0) / out.eyes.length : H * 0.4;
    out.skinSet = new Set(out.skin);
    out.face = out.skin.filter(p => ((p / W) | 0) < H * 0.62); // head only (not neck/hands)
    return out;
  }
  function seeded(n) { let s = n * 9301 + 49297; return () => (s = (s * 233280 + 49297) % 2147483647) / 2147483647; }
  const mix = (d, o, c, t) => { d[o] += (c[0] - d[o]) * t; d[o + 1] += (c[1] - d[o + 1]) * t; d[o + 2] += (c[2] - d[o + 2]) * t; };
  /**
   * draw(canvas, imgs, st): st = { expr, blood 0..1, bleeding, bruise 0..1, cold 0..1, wet 0..1, sick 0..1, pale 0..1, sweat 0..1, dirt 0..1, tired 0..1, flash 0..1, time }
   */
  function draw(canvas, imgs, st) {
    const img = imgs[st.expr] || imgs.neutral; if (!img) return;
    const A = cache[st.expr] || (cache[st.expr] = analyse(img));
    if (canvas.width !== A.w || canvas.height !== A.h) { canvas.width = A.w; canvas.height = A.h; }
    const g = canvas.getContext('2d'), id = g.createImageData(A.w, A.h), d = id.data; d.set(A.data);
    // tints on skin
    for (const p of A.skin) {
      const o = p * 4;
      if (st.pale > 0) mix(d, o, [222, 214, 204], st.pale * 0.45);
      if (st.sick > 0) mix(d, o, [150, 176, 110], st.sick * 0.4);
      if (st.cold > 0) mix(d, o, [170, 190, 226], st.cold * 0.45);
      if (st.wet > 0) mix(d, o, [120, 110, 120], st.wet * 0.12);
    }
    // tired: darken the skin just below the eyes
    if (st.tired > 0.05) for (const p of A.eyes) { const x = p % A.w, y = (p / A.w) | 0; for (let k = 2; k <= 3; k++) { const q = (y + k) * A.w + x; if (A.skinSet.has(q)) mix(d, q * 4, [70, 40, 50], st.tired * 0.45); } }
    const R = seeded(7);
    const skinPick = () => A.face[(R() * A.face.length) | 0];
    const put = (p, c, a = 1) => { if (p == null || p < 0 || p >= A.w * A.h) return; mix(d, p * 4, c, a); d[p * 4 + 3] = 255; };
    // dirt specks
    for (let k = 0; k < Math.round(st.dirt * 40); k++) { const p = skinPick(); put(p, [92, 66, 44], 0.55); if (R() < 0.4) put(p + 1, [92, 66, 44], 0.4); }
    // bruise near an eye
    if (st.bruise > 0.05 && A.eyes.length) { const e = A.eyes[(A.eyes.length * 0.8) | 0]; for (let j = -1; j <= 3; j++) for (let i = -2; i <= 3; i++) { const q = e + j * A.w + i; if (A.skinSet.has(q)) put(q, [110, 60, 110], st.bruise * 0.5); } }
    // blood: splatters grow with damage; a drip line when badly hurt or bleeding
    const spots = Math.round(st.blood * 18);
    for (let k = 0; k < spots; k++) { const p = skinPick(), col = R() < 0.5 ? [120, 14, 20] : [168, 30, 36]; put(p, col); if (R() < 0.6) put(p + 1, col, 0.9); if (R() < 0.5) put(p + A.w, col, 0.8); }
    if (st.blood > 0.45 || st.bleeding) {
      const R2 = seeded(3), brow = A.face.filter(p => ((p / A.w) | 0) < A.eyeY - 1), start = brow[(R2() * brow.length) | 0] || A.face[0];
      const len = 4 + Math.round(st.blood * 10 + (st.bleeding ? (st.time * 3) % 5 : 0));
      for (let k = 0; k < len; k++) put(start + k * A.w + (k > 5 ? 1 : 0), [150, 20, 28]);
    }
    // sweat drops at the temples
    if (st.sweat > 0.1) { const R3 = seeded(11); for (let k = 0; k < Math.round(st.sweat * 5); k++) { const tm = A.face.filter(q => ((q / A.w) | 0) < A.eyeY); const p = tm[(R3() * tm.length) | 0]; if (p == null) continue; const off = ((st.time * 6 + k * 3) | 0) % 6; put(p + off * A.w, [200, 230, 255]); put(p + (off + 1) * A.w, [150, 200, 240], 0.8); } }
    // rain droplets
    if (st.wet > 0.1) for (let k = 0; k < Math.round(st.wet * 14); k++) { const p = ((R() * A.w * A.h) | 0); if (d[p * 4 + 3]) put(p, [190, 215, 240], 0.75); }
    // frost: a rime along the top of the hat and brim, and on the brows
    if (st.cold > 0.3) {
      const R4 = seeded(5);
      for (const p of A.hat) { const up = p - A.w; if (up < 0 || !d[up * 4 + 3]) { put(p, [236, 244, 252], 0.8 * st.cold); if (R4() < 0.5 * st.cold) put(p + A.w, [220, 234, 248], 0.5 * st.cold); } }
      for (const p of A.hair) if (((p / A.w) | 0) < A.eyeY && R4() < 0.5 * st.cold) put(p, [210, 225, 240], 0.7);
    }
    g.putImageData(id, 0, 0);
    if (st.flash > 0) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(200,20,20,${st.flash * 0.45})`; g.fillRect(0, 0, A.w, A.h); g.globalCompositeOperation = 'source-over'; }
  }
  root.PORTRAIT = { draw };
})(typeof window !== 'undefined' ? window : globalThis);
