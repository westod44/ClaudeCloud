// Small painted diffuse textures (bible section 13): 64-128 px props, 256 px surfaces.
// Everything is painted procedurally with broad shapes — no photo detail.
import * as THREE from '../vendor/three.module.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

function shade(col, f) {
  const r = Math.min(255, Math.max(0, Math.round(((col >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((col >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((col & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function finish(canvas, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 1;
  t.needsUpdate = true;
  return t;
}

function blotches(ctx, w, h, rnd, n, colors, rmin, rmax, alpha = 1) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.5 + rnd() * 0.5);
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const x = rnd() * w, y = rnd() * h, r = rmin + rnd() * (rmax - rmin);
    ctx.beginPath();
    const sides = 5 + Math.floor(rnd() * 3);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const rr = r * (0.6 + rnd() * 0.5);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (0.6 + rnd() * 0.6);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    // wrap copies for tiling
    for (const [dx, dy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) {
      if ((dx > 0 && x + r < w) || (dx < 0 && x - r > 0) || (dy > 0 && y + r < h) || (dy < 0 && y - r > 0)) continue;
      ctx.save(); ctx.translate(dx, dy); ctx.fill(); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function get(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export const TEX = {
  bark: () => get('bark', () => {
    const c = makeCanvas(64, 128), x = c.getContext('2d'), r = mulberry32(11);
    x.fillStyle = hex(0x42382e); x.fillRect(0, 0, 64, 128);
    // broad vertical patches
    for (let i = 0; i < 26; i++) {
      x.fillStyle = [shade(0x5a4f43, 1), shade(0x42382e, 0.75), shade(0x6a6052, 0.9), shade(0x3a3128, 1)][i % 4];
      x.globalAlpha = 0.55 + r() * 0.4;
      const px = r() * 64, w = 3 + r() * 9, y0 = r() * 128, hh = 20 + r() * 60;
      x.fillRect(px, y0, w, hh); x.fillRect(px - 64, y0, w, hh); x.fillRect(px, y0 - 128, w, hh);
    }
    // painted fissures, no black outline
    x.globalAlpha = 0.7;
    for (let i = 0; i < 9; i++) {
      x.strokeStyle = shade(0x2a231c, 1); x.lineWidth = 1 + r() * 1.5;
      let px = r() * 64; x.beginPath(); x.moveTo(px, 0);
      for (let y = 0; y <= 128; y += 8) { px += (r() - 0.5) * 4; x.lineTo(px, y); }
      x.stroke();
    }
    x.globalAlpha = 1;
    return finish(c);
  }),

  beech: () => get('beech', () => {
    const c = makeCanvas(64, 128), x = c.getContext('2d'), r = mulberry32(12);
    x.fillStyle = hex(0x5d5a52); x.fillRect(0, 0, 64, 128);
    blotches(x, 64, 128, r, 40, [shade(0x6e6a60, 1), shade(0x4c4942, 1), shade(0x465044, 1)], 3, 10, 0.6);
    for (let i = 0; i < 5; i++) { x.fillStyle = shade(0x3d3a34, 1); x.globalAlpha = 0.5; x.fillRect(0, r() * 128, 64, 1 + r() * 2); }
    x.globalAlpha = 1;
    return finish(c);
  }),

  scar: () => get('scar', () => {
    const c = makeCanvas(32, 128), x = c.getContext('2d'), r = mulberry32(13);
    x.fillStyle = hex(0xc9bfa6); x.fillRect(0, 0, 32, 128);
    for (let i = 0; i < 14; i++) { x.fillStyle = shade(0xa89c80, 1); x.globalAlpha = 0.5; const px = r() * 32; x.fillRect(px, 0, 1 + r() * 2, 128); }
    x.globalAlpha = 1;
    return finish(c);
  }),

  slate: (variant = 0) => get('slate' + variant, () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d'), r = mulberry32(21 + variant);
    x.fillStyle = hex(0x414a55); x.fillRect(0, 0, 128, 128);
    blotches(x, 128, 128, r, 18, [shade(0x4b5562, 1), shade(0x39414b, 1), shade(0x525c66, 1)], 14, 34, 0.7);
    // moss patches concentrated at the lower half
    for (let i = 0; i < 10; i++) {
      x.globalAlpha = 0.5 + r() * 0.4; x.fillStyle = [shade(0x465044, 1), shade(0x3d4a37, 1)][i % 2];
      const px = r() * 128, py = 64 + r() * 64, rr = 6 + r() * 16;
      x.beginPath(); x.ellipse(px, py, rr, rr * 0.6, r() * 3, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 0.35;
    for (let i = 0; i < 60; i++) { x.fillStyle = shade(0x8b918c, 1); x.fillRect(r() * 128, r() * 128, 1, 1); }
    x.globalAlpha = 1;
    return finish(c);
  }),

  // landmark crack — only applied to the designated Y-stone
  slateY: () => get('slateY', () => {
    const base = TEX.slate(7).image;
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    x.strokeStyle = '#d6d2c4'; x.lineCap = 'round'; x.lineJoin = 'round';
    x.lineWidth = 6;
    x.beginPath(); x.moveTo(64, 120); x.lineTo(62, 92); x.lineTo(65, 70);
    x.moveTo(65, 70); x.lineTo(40, 30); x.lineTo(34, 10);
    x.moveTo(65, 70); x.lineTo(92, 34); x.lineTo(100, 12);
    x.stroke();
    x.lineWidth = 2; x.strokeStyle = '#efece2';
    x.stroke();
    return finish(c, { repeat: false });
  }),

  needles: (tone = 0) => get('needles' + tone, () => {
    const c = makeCanvas(64, 64), x = c.getContext('2d'), r = mulberry32(31 + tone);
    const base = [0x252d25, 0x2a3329, 0x222a24][tone % 3];
    x.fillStyle = hex(base); x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) {
      x.strokeStyle = [shade(base, 1.35), shade(base, 0.7), shade(0x465044, 0.9)][i % 3];
      x.globalAlpha = 0.6; x.lineWidth = 1.2;
      const px = r() * 64, py = r() * 56; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 8, py + 4 + r() * 6); x.stroke();
    }
    x.globalAlpha = 1;
    // jagged lower edge (v=0 is canvas bottom after flipY)
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.moveTo(0, 64);
    for (let px = 0; px <= 64; px += 4) x.lineTo(px, 64 - (px % 8 === 0 ? 14 + r() * 6 : 2 + r() * 3));
    x.lineTo(64, 64); x.closePath(); x.fill();
    x.globalCompositeOperation = 'source-over';
    const t = finish(c); t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }),

  fern: () => get('fern', () => {
    const c = makeCanvas(64, 128), x = c.getContext('2d'), r = mulberry32(41);
    x.clearRect(0, 0, 64, 128);
    x.strokeStyle = hex(0x3d4a30); x.lineWidth = 2;
    x.beginPath(); x.moveTo(32, 128); x.quadraticCurveTo(30, 60, 34, 4); x.stroke();
    for (let y = 10; y < 124; y += 6) {
      const len = 6 + (1 - Math.abs(y - 60) / 70) * 22;
      for (const s of [-1, 1]) {
        x.fillStyle = [hex(0x55653e), hex(0x4a5a38), hex(0x5f6e45)][Math.floor(r() * 3)];
        x.beginPath(); x.moveTo(32, y); x.lineTo(32 + s * len, y - 3); x.lineTo(32 + s * len * 0.9, y + 2); x.closePath(); x.fill();
      }
    }
    return finish(c, { repeat: false });
  }),

  leafCluster: (tone = 0) => get('leafc' + tone, () => {
    const c = makeCanvas(64, 64), x = c.getContext('2d'), r = mulberry32(51 + tone);
    const cols = [
      [0x7a5a36, 0x655643, 0x8a4f2a, 0x5d4a33],
      [0x6b5a3a, 0x7d6a45, 0x585033, 0x655643],
      [0x8a4a2c, 0x713d36, 0x7a5a36, 0x5e3d2a],
    ][tone % 3];
    for (let i = 0; i < 70; i++) {
      x.fillStyle = hex(cols[i % cols.length]);
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 26;
      const px = 32 + Math.cos(a) * d, py = 32 + Math.sin(a) * d * 0.85;
      x.beginPath(); x.ellipse(px, py, 3 + r() * 3, 2 + r() * 2, r() * 3, 0, Math.PI * 2); x.fill();
    }
    return finish(c, { repeat: false });
  }),

  litter: () => get('litter', () => {
    const c = makeCanvas(256, 256), x = c.getContext('2d'), r = mulberry32(61);
    x.fillStyle = '#c8c0b4'; x.fillRect(0, 0, 256, 256);
    // neutral-ish leaf shapes (tinted by vertex colour), some warm accents
    const cols = ['#d8cfc0', '#a89c8a', '#bfb2a0', '#8f8576', '#cdb79a', '#c79f80', '#b7a790'];
    for (let i = 0; i < 520; i++) {
      x.fillStyle = cols[Math.floor(r() * cols.length)];
      x.globalAlpha = 0.75;
      const px = r() * 256, py = r() * 256, a = r() * Math.PI;
      x.save(); x.translate(px, py); x.rotate(a);
      x.beginPath(); x.ellipse(0, 0, 3 + r() * 4, 1.5 + r() * 2, 0, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    x.globalAlpha = 0.35;
    blotches(x, 256, 256, r, 18, ['#7d756a', '#9a9184'], 10, 26, 0.35);
    x.globalAlpha = 1;
    return finish(c);
  }),

  gravel: () => get('gravel', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d'), r = mulberry32(71);
    x.fillStyle = '#7a7a74'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      x.fillStyle = ['#8e8d86', '#66655f', '#a19f97', '#5a5953'][i % 4];
      x.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 2);
    }
    return finish(c);
  }),

  timber: (tone = 0) => get('timber' + tone, () => {
    const c = makeCanvas(64, 128), x = c.getContext('2d'), r = mulberry32(81 + tone);
    const base = [0x5e5546, 0x4d4436, 0x6b6150][tone % 3];
    x.fillStyle = hex(base); x.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 40; i++) {
      x.globalAlpha = 0.4; x.fillStyle = [shade(base, 1.2), shade(base, 0.75), shade(base, 0.9)][i % 3];
      x.fillRect(r() * 64, 0, 1 + r() * 4, 128);
    }
    x.globalAlpha = 0.6; x.fillStyle = shade(base, 0.55);
    for (let i = 0; i < 4; i++) x.fillRect(0, r() * 128, 64, 1);
    x.globalAlpha = 1;
    return finish(c);
  }),

  canvasCloth: () => get('canvas', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d'), r = mulberry32(91);
    x.fillStyle = '#8f7340'; x.fillRect(0, 0, 128, 128);
    blotches(x, 128, 128, r, 22, ['#9c7d45', '#7a6236', '#86703f', '#6e5a32'], 10, 28, 0.6);
    x.strokeStyle = '#5f4d2a'; x.lineWidth = 2; x.globalAlpha = 0.7;
    x.beginPath(); x.moveTo(0, 42); x.lineTo(128, 46); x.moveTo(0, 90); x.lineTo(128, 86); x.stroke();
    x.globalAlpha = 1;
    return finish(c);
  }),

  concrete: () => get('concrete', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d'), r = mulberry32(101);
    x.fillStyle = '#8a8a82'; x.fillRect(0, 0, 128, 128);
    blotches(x, 128, 128, r, 30, ['#9a9a92', '#7b7c74', '#85877d', '#6f7266'], 6, 20, 0.5);
    // mossy seams
    x.fillStyle = '#4e5a43'; x.globalAlpha = 0.55;
    x.fillRect(0, 0, 128, 3); x.fillRect(0, 0, 3, 128);
    for (let i = 0; i < 12; i++) x.fillRect(r() * 128, 110 + r() * 18, 6 + r() * 14, 3 + r() * 8);
    x.globalAlpha = 1;
    return finish(c);
  }),

  roof: () => get('roof', () => {
    const c = makeCanvas(64, 64), x = c.getContext('2d');
    for (let i = 0; i < 64; i += 8) {
      x.fillStyle = '#3f5a3f'; x.fillRect(i, 0, 4, 64);
      x.fillStyle = '#2f4530'; x.fillRect(i + 4, 0, 4, 64);
    }
    x.fillStyle = '#5a4a32'; x.globalAlpha = 0.35; x.fillRect(0, 50, 64, 14); x.globalAlpha = 1;
    return finish(c);
  }),

  water: () => get('water', () => {
    const c = makeCanvas(64, 128), x = c.getContext('2d'), r = mulberry32(111);
    x.fillStyle = '#4c5a62'; x.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 60; i++) {
      x.globalAlpha = 0.5; x.fillStyle = ['#6f8088', '#3c4950', '#8a9aa0'][i % 3];
      x.fillRect(r() * 64, r() * 128, 2 + r() * 10, 1 + r() * 3);
    }
    // foam and drifting leaf flecks
    for (let i = 0; i < 14; i++) { x.globalAlpha = 0.85; x.fillStyle = i % 3 ? '#c9d0cf' : '#8a5a33'; x.fillRect(r() * 64, r() * 128, 2, 3); }
    x.globalAlpha = 1;
    return finish(c);
  }),

  door: () => get('door', () => {
    const c = makeCanvas(64, 128), x = c.getContext('2d'), r = mulberry32(121);
    x.fillStyle = '#a58c4a'; x.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 6; i++) { x.fillStyle = '#8a7438'; x.fillRect(i * 11, 0, 1, 128); }
    x.fillStyle = '#c0a65c'; x.globalAlpha = 0.4; blotches(x, 64, 128, r, 10, ['#b89e56', '#94793c'], 5, 14, 0.4);
    x.globalAlpha = 1; x.fillStyle = '#7d6833';
    x.fillRect(0, 14, 64, 8); x.fillRect(0, 106, 64, 8);
    x.save(); x.translate(32, 64); x.rotate(-0.95); x.fillRect(-60, -4, 120, 8); x.restore();
    return finish(c, { repeat: false });
  }),

  // barred post: dull yellow square crossed by two black horizontal bars
  postBars: () => get('postBars', () => {
    const c = makeCanvas(32, 128), x = c.getContext('2d');
    x.drawImage(TEX.timber(1).image, 0, 0, 32, 128);
    x.fillStyle = '#b49c52'; x.fillRect(4, 10, 24, 30);
    x.fillStyle = '#151a18'; x.fillRect(4, 17, 24, 5); x.fillRect(4, 28, 24, 5);
    return finish(c, { repeat: false });
  }),

  asphalt: () => get('asphalt', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d'), r = mulberry32(131);
    x.fillStyle = '#4a4c4c'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) { x.fillStyle = ['#585a59', '#3f4141', '#626463'][i % 3]; x.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1); }
    blotches(x, 128, 128, r, 8, ['#3a3c3c', '#525453'], 8, 20, 0.4);
    return finish(c);
  }),

  ribbon: () => get('ribbon', () => {
    const c = makeCanvas(16, 16), x = c.getContext('2d');
    x.fillStyle = '#c4622c'; x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#a24f22'; x.fillRect(0, 10, 16, 6);
    return finish(c);
  }),

  metal: () => get('metal', () => {
    const c = makeCanvas(32, 32), x = c.getContext('2d'), r = mulberry32(141);
    x.fillStyle = '#2b2d2c'; x.fillRect(0, 0, 32, 32);
    blotches(x, 32, 32, r, 8, ['#353837', '#4a3a30'], 2, 6, 0.5);
    return finish(c);
  }),

  roots: () => get('roots', () => {
    const c = makeCanvas(64, 64), x = c.getContext('2d'), r = mulberry32(151);
    x.fillStyle = '#3a3026'; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 24; i++) {
      x.strokeStyle = ['#5a4a38', '#2c241c', '#4a3e30'][i % 3]; x.lineWidth = 1 + r() * 3;
      x.beginPath(); x.moveTo(32, 32); x.lineTo(r() * 64, r() * 64); x.stroke();
    }
    return finish(c, { repeat: false });
  }),

  // authored, legible lettering for signs (bible: no generated gibberish text)
  text: (key, lines, opts = {}) => get('text:' + key, () => {
    const w = opts.w || 256, h = opts.h || 64;
    const c = makeCanvas(w, h), x = c.getContext('2d');
    if (opts.bgImage) x.drawImage(opts.bgImage, 0, 0, w, h);
    else { x.fillStyle = opts.bg || '#5e5546'; x.fillRect(0, 0, w, h); }
    if (opts.border) { x.strokeStyle = opts.border; x.lineWidth = 4; x.strokeRect(3, 3, w - 6, h - 6); }
    x.fillStyle = opts.color || '#e4ddc8';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const size = opts.size || Math.floor(h / (lines.length + 0.6));
    x.font = `${opts.weight || 700} ${size}px ${opts.font || 'Arial, Helvetica, sans-serif'}`;
    lines.forEach((ln, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.1;
      x.fillText(ln, w / 2, y, w - 16);
    });
    return finish(c, { repeat: false });
  }),

  noticeboard: () => get('noticeboard', () => {
    const c = makeCanvas(256, 160), x = c.getContext('2d');
    x.fillStyle = '#d8d2bf'; x.fillRect(0, 0, 256, 160);
    x.fillStyle = '#2c3a2c'; x.fillRect(0, 0, 256, 30);
    x.fillStyle = '#e8e2cf'; x.font = '700 17px Arial'; x.textAlign = 'center';
    x.fillText('BELLWETHER FOREST RESERVE', 128, 21);
    x.fillStyle = '#2b2b26'; x.font = '700 14px Arial'; x.fillText('Creek Loop - 45 minutes', 128, 50);
    x.font = '12px Arial'; x.fillText('Stay on marked trails. Return before dark.', 128, 68);
    // simple loop map
    x.strokeStyle = '#5c6b4c'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(40, 140); x.lineTo(70, 92); x.lineTo(150, 86); x.lineTo(210, 118); x.lineTo(180, 146); x.closePath(); x.stroke();
    x.strokeStyle = '#5f7a8a'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(20, 118); x.lineTo(80, 128); x.lineTo(140, 108); x.lineTo(236, 126); x.stroke();
    x.fillStyle = '#151a18'; x.beginPath(); x.arc(40, 140, 4, 0, 7); x.fill();
    x.font = '10px Arial'; x.textAlign = 'left'; x.fillText('YOU ARE HERE', 48, 152);
    return finish(c, { repeat: false });
  }),

  paperMap: () => get('paperMap', () => {
    const c = makeCanvas(128, 96), x = c.getContext('2d');
    x.fillStyle = '#d6cfba'; x.fillRect(0, 0, 128, 96);
    x.strokeStyle = '#3a3a34'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(20, 80); x.lineTo(34, 30); x.lineTo(80, 22); x.lineTo(110, 60); x.lineTo(90, 84); x.closePath(); x.stroke();
    x.strokeStyle = '#5f7a8a'; x.lineWidth = 4; x.beginPath(); x.moveTo(4, 60); x.lineTo(50, 70); x.lineTo(124, 52); x.stroke();
    x.fillStyle = '#b8ae96'; x.fillRect(62, 0, 2, 96);
    return finish(c, { repeat: false });
  }),

  notebook: () => get('notebook', () => {
    const c = makeCanvas(64, 48), x = c.getContext('2d');
    x.fillStyle = '#e2dccb'; x.fillRect(0, 0, 64, 48);
    x.fillStyle = '#8a8478'; x.fillRect(31, 0, 2, 48);
    x.strokeStyle = '#4a4a5a'; x.lineWidth = 1;
    for (let y = 8; y < 44; y += 5) { x.beginPath(); x.moveTo(4, y); x.lineTo(28, y + (y % 3)); x.moveTo(36, y); x.lineTo(60, y - (y % 2)); x.stroke(); }
    return finish(c, { repeat: false });
  }),

  clockFace: (text) => get('clock:' + text, () => {
    const c = makeCanvas(64, 32), x = c.getContext('2d');
    x.fillStyle = '#0d120f'; x.fillRect(0, 0, 64, 32);
    x.fillStyle = '#5cd67a'; x.font = '700 20px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 32, 17);
    return finish(c, { repeat: false });
  }),

  gauge: () => get('gauge', () => {
    const c = makeCanvas(64, 32), x = c.getContext('2d');
    x.fillStyle = '#121513'; x.fillRect(0, 0, 64, 32);
    for (const cx of [16, 48]) {
      x.strokeStyle = '#6b6a60'; x.lineWidth = 2; x.beginPath(); x.arc(cx, 18, 12, 0, 7); x.stroke();
      x.strokeStyle = '#c16d32'; x.beginPath(); x.moveTo(cx, 18); x.lineTo(cx - 8, 12); x.stroke();
    }
    return finish(c, { repeat: false });
  }),

  radioFace: (lit) => get('radio' + (lit ? 'L' : 'D'), () => {
    const c = makeCanvas(64, 32), x = c.getContext('2d');
    x.fillStyle = '#2f302c'; x.fillRect(0, 0, 64, 32);
    x.fillStyle = '#4a4a44';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) x.fillRect(4 + i * 5, 5 + j * 6, 3, 3);
    x.fillStyle = '#6a6a62'; x.beginPath(); x.arc(46, 20, 5, 0, 7); x.arc(57, 20, 4, 0, 7); x.fill();
    x.fillStyle = lit ? '#ff8a3a' : '#3a2a22'; x.fillRect(42, 4, 8, 5);
    return finish(c, { repeat: false });
  }),

  leafSprite: () => get('leafSprite', () => {
    const c = makeCanvas(16, 16), x = c.getContext('2d');
    x.fillStyle = '#8a5a33'; x.beginPath(); x.ellipse(8, 8, 6, 3, 0.5, 0, 7); x.fill();
    return finish(c, { repeat: false });
  }),

  windowPane: () => get('windowPane', () => {
    const c = makeCanvas(32, 32), x = c.getContext('2d');
    x.fillStyle = '#5c6670'; x.fillRect(0, 0, 32, 32);
    x.fillStyle = '#7a8590'; x.globalAlpha = 0.5; x.fillRect(4, 4, 10, 24); x.globalAlpha = 1;
    x.fillStyle = '#3a3026'; x.fillRect(15, 0, 2, 32); x.fillRect(0, 15, 32, 2);
    return finish(c, { repeat: false });
  }),
};
