/*
 * The shared 256-colour palette, built from STYLE.materials and STYLE.playerColors.
 * Each material becomes a 7-step ramp: shadows shift cool, highlights shift warm.
 * Every sprite and terrain pixel is snapped to this palette (like AoE2's palette 50500),
 * which keeps all assets visually consistent.
 */
(function (root) {
  const STYLE = root.STYLE || (typeof require !== 'undefined' ? require('./style.js') : null);
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const cl = v => Math.max(0, Math.min(255, Math.round(v)));

  function buildPalette() {
    const cool = hex(STYLE.rampCool), warm = hex(STYLE.rampWarm);
    const entries = []; // {rgb, name}
    const ramps = {};
    for (const [name, h] of Object.entries(STYLE.materials)) {
      const base = hex(h); ramps[name] = [];
      STYLE.rampSteps.forEach((m, k) => {
        let c = base.map(v => v * m);
        if (k < 3) c = mix(c, cool, (3 - k) * 0.09);
        if (k > 4) c = mix(c, warm, (k - 4) * 0.12);
        const rgb = c.map(cl);
        ramps[name].push(entries.length); entries.push({ rgb, name: `${name}.${k}` });
      });
    }
    for (let k = 0; k < 8; k++) { const v = cl(12 + k * 34); entries.push({ rgb: [v, v, v + 2 > 255 ? 255 : v + 2], name: `grey.${k}` }); }
    for (const [name, h] of Object.entries(STYLE.playerColors)) {
      const base = hex(h);
      STYLE.playerShadeSteps.forEach((m, k) => entries.push({ rgb: base.map(v => cl(v * m)), name: `player.${name}.${k}` }));
    }
    while (entries.length < 256) entries.push({ rgb: [0, 0, 0], name: 'unused' });
    return { entries: entries.slice(0, 256), ramps };
  }

  const PALETTE = buildPalette();
  const P = PALETTE.entries.map(e => e.rgb);
  const used = PALETTE.entries.filter(e => e.name !== 'unused').length;

  // 32x32x32 inverse colour map (the same trick as AoE2's view_icm.dat)
  const LUT = new Uint8Array(32768);
  (function buildLut() {
    for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
      const R = r * 8 + 4, G = g * 8 + 4, B = b * 8 + 4;
      let best = 0, bd = 1e12;
      for (let i = 0; i < used; i++) {
        const p = P[i], rm = (R + p[0]) / 2;
        const dr = R - p[0], dg = G - p[1], db = B - p[2];
        const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db; // "redmean"
        if (d < bd) { bd = d; best = i; }
      }
      LUT[(r << 10) | (g << 5) | b] = best;
    }
  })();

  function quantIndex(r, g, b) { return LUT[((cl(r) >> 3) << 10) | ((cl(g) >> 3) << 5) | (cl(b) >> 3)]; }
  function quantize(r, g, b) { return P[quantIndex(r, g, b)]; }
  function quantizeImageData(d) { // in place, keeps alpha
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const p = P[quantIndex(d[i], d[i + 1], d[i + 2])]; d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; }
  }
  function toJascPal() { // AoE2-era palette file format
    return 'JASC-PAL\r\n0100\r\n256\r\n' + P.map(c => c.join(' ')).join('\r\n') + '\r\n';
  }

  const API = { PALETTE, colors: P, used, quantize, quantIndex, quantizeImageData, toJascPal, hex };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PAL = API;
})(typeof window !== 'undefined' ? window : globalThis);
