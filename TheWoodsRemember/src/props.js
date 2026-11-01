// Authored landmarks and structures (bible section 08: dimensions and identity locks).
// Each is modelled once and reused so it is recognisable twice.
import * as THREE from '../vendor/three.module.js';
import { M, box, cyl, beam, mergeParts, facetize, scaleUV, xform } from './geo.js';
import { TEX, mulberry32 } from './textures.js';
import { rock } from './kit.js';

const mesh = (g, m) => { const o = new THREE.Mesh(g, m); return o; };
const at = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

// ---------------------------------------------------------------- footbridge
// 6.0 m long, 1.35 m clear width, twelve broad planks, rails 1.0 m, a 0.7 m section
// of right-hand upper rail missing near the far end. Approach from +Z toward -Z.
// Deck top at local y = 0.
export function footbridge() {
  const g = new THREE.Group();
  const T = M.timber(0), T2 = M.timber(1);
  for (let i = 0; i < 12; i++) {
    const z = -3 + 0.25 + i * 0.5;
    const p = mesh(box(1.6, 0.07, 0.46, { uvWorld: 1 }), i % 3 ? T : T2);
    p.position.set((i % 2 ? 0.02 : -0.02), -0.035, z); p.rotation.y = (i % 4 - 1.5) * 0.008;
    g.add(p);
  }
  for (const x of [-0.6, 0.6]) g.add(at(mesh(box(0.14, 0.2, 6.3, { uvWorld: 1 }), T2), x, -0.17, 0));
  const posts = [-2.95, 0, 2.95];
  for (const x of [-0.74, 0.74]) for (const z of posts) g.add(at(mesh(box(0.13, 1.85, 0.13, { uvWorld: 1 }), T2), x, 0.12, z));
  // rails: left complete, right upper rail missing 0.7 m near far end (z -2.6 .. -1.9)
  const rail = (x, y, z0, z1) => g.add(at(mesh(box(0.08, 0.1, z1 - z0, { uvWorld: 1 }), T), x, y, (z0 + z1) / 2));
  rail(-0.74, 1.0, -2.95, 2.95); rail(-0.74, 0.5, -2.95, 2.95);
  rail(0.74, 0.5, -2.95, 2.95);
  rail(0.74, 1.0, -2.95, -2.6); rail(0.74, 1.0, -1.9, 2.95);
  // splintered stub of the broken rail end
  { const stub = at(mesh(new THREE.ConeGeometry(0.05, 0.18, 4), T), 0.74, 1.0, -1.82); stub.rotation.x = Math.PI / 2; g.add(stub); }
  return g;
}

// ---------------------------------------------------------------- ribbon log
// trunk 5.5 m, 0.75 m max diameter; two snapped prongs angled upward; 0.35 m orange
// ribbon on the lower prong; distinctive fern at the root plate. Long axis along -Z,
// root plate at +Z. The crouch gap (1.25 m opening) is under the raised crown end.
export function ribbonLog() {
  const g = new THREE.Group();
  const B = M.bark();
  const root = new THREE.Vector3(0, 0.42, 2.75), crown = new THREE.Vector3(0, 1.72, -2.75);
  const trunk = new THREE.CylinderGeometry(0.3, 0.375, 5.6, 7, 3);
  scaleUV(trunk, 1, 3);
  const dir = crown.clone().sub(root).normalize();
  trunk.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  const mid = root.clone().add(crown).multiplyScalar(0.5);
  trunk.translate(mid.x, mid.y, mid.z);
  g.add(mesh(trunk, B));
  // root plate: a ragged disc of roots and soil standing up at the root end
  const plate = new THREE.CircleGeometry(1.05, 7);
  const rp = mesh(plate, M.roots()); rp.position.set(0, 0.85, 2.95); rp.rotation.x = -0.15;
  g.add(rp);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(beam(0, 0.85, 2.9, Math.cos(a) * 1.3, 0.85 + Math.sin(a) * 1.0, 3.05 + (i % 2) * 0.2, 0.05, 4), B));
  }
  // snapped prongs
  const lowerEnd = new THREE.Vector3(-0.5, 2.6, -3.4), rightEnd = new THREE.Vector3(0.42, 3.15, -3.05);
  g.add(mesh(beam(crown.x - 0.05, crown.y, crown.z, lowerEnd.x, lowerEnd.y, lowerEnd.z, 0.13, 6), B));
  g.add(mesh(beam(crown.x + 0.05, crown.y + 0.05, crown.z, rightEnd.x, rightEnd.y, rightEnd.z, 0.16, 6), B));
  // jagged snapped tips
  for (const [e, r] of [[lowerEnd, 0.13], [rightEnd, 0.16]]) {
    const tip = new THREE.ConeGeometry(r, 0.35, 5);
    const d2 = e.clone().sub(crown).normalize();
    tip.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2));
    tip.translate(e.x + d2.x * 0.12, e.y + d2.y * 0.12, e.z + d2.z * 0.12);
    g.add(mesh(tip, M.timber(2)));
  }
  // orange ribbon tied to the lower prong (< 1% of frame)
  const rb = new THREE.Vector3().lerpVectors(crown, lowerEnd, 0.42);
  const ring = new THREE.CylinderGeometry(0.145, 0.145, 0.09, 7, 1, true);
  ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lowerEnd.clone().sub(crown).normalize()));
  ring.translate(rb.x, rb.y, rb.z);
  const ribbonMat = M.ribbon();
  g.add(mesh(ring, ribbonMat));
  const tail = new THREE.PlaneGeometry(0.05, 0.35); tail.translate(0, -0.17, 0);
  const tl = mesh(tail, M.flatDS(0xb85a28)); tl.position.copy(rb).add(new THREE.Vector3(0.1, -0.02, 0.06)); tl.rotation.set(0.15, 0.6, 0.12);
  g.add(tl);
  g.userData.ribbonTail = tl;
  // support limb under the crown end and a slate rest under the far side
  g.add(mesh(beam(-0.05, 1.45, -3.0, -0.55, 0.0, -3.55, 0.11, 5), B));
  const rk = rock(4); const rm = mesh(rk.geo, rk.mats); rm.position.set(0.85, 0, -3.0); rm.scale.set(0.55, 0.9, 0.5); g.add(rm);
  g.userData.crown = crown; g.userData.root = root;
  return g;
}

// ---------------------------------------------------------------- Y-cracked slate boulder
export function yStone(scale = 1) {
  const r = mulberry32(777);
  const g0 = new THREE.BoxGeometry(2.1, 1.6, 1.6, 1, 1, 1);
  const p = g0.attributes.position;
  const disp = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
    if (!disp.has(key)) disp.set(key, [(r() - 0.5) * 0.3, (r() - 0.5) * 0.2, (r() - 0.5) * 0.12]);
    const d = disp.get(key);
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0) { x *= 0.78; z *= 0.82; }
    p.setXYZ(i, x + d[0], y + d[1] + 0.8, z + (z > 0 ? d[2] * 0.3 : d[2]));
  }
  g0.computeVertexNormals();
  const mats = [M.slate(0), M.slate(0), M.slate(1), M.slate(0), M.slateY(), M.slateY()];
  const m = new THREE.Mesh(g0.toNonIndexed(), mats);
  m.geometry.computeVertexNormals();
  m.scale.setScalar(scale);
  const g = new THREE.Group(); g.add(m);
  return g;
}

// ---------------------------------------------------------------- scarred dead beech
// 9 m tall, ~1.2 m trunk, no living crown, broken right limb at 3 m, pale scar 0.8-3.8 m.
// Scar faces +Z; broken limb toward +X (the tree's right when facing the scar side... the viewer's left)
export function scarredBeech(h = 9) {
  const g = new THREE.Group();
  const trunk = cyl(0.36, 0.6, h, 8, { sv: 3, hseg: 3 });
  // ragged broken top
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) if (tp.getY(i) > h - 0.01) tp.setY(i, h - (i % 3) * 0.45);
  g.add(mesh(trunk, M.beech()));
  // root flare
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    g.add(mesh(beam(Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3, Math.cos(a) * 1.1, -0.05, Math.sin(a) * 1.1, 0.16, 5), M.beech()));
  }
  // broken right limb at 3 m (viewer's right when facing the scar)
  const limbDir = 1; // +X is the viewer's right when facing the scar (+Z face)
  g.add(mesh(beam(0, 3.0, 0, limbDir * 1.7, 4.1, 0.1, 0.17, 6), M.beech()));
  const tip = new THREE.ConeGeometry(0.17, 0.4, 5); tip.rotateZ(-limbDir * 1.0); tip.translate(limbDir * 1.85, 4.25, 0.1);
  g.add(mesh(tip, M.timber(2)));
  // a couple of dead upper limbs (no living crown)
  g.add(mesh(beam(0, 6.4, 0, 1.4, 8.0, -0.4, 0.12, 5), M.beech()));
  g.add(mesh(beam(0, 7.2, 0, -0.6, 8.6, 0.9, 0.09, 5), M.beech()));
  // long pale scar on the +Z face from 0.8 m to 3.8 m
  const sc = new THREE.PlaneGeometry(0.34, 3.0, 1, 4);
  const sp = sc.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) + 1.5; // 0..3
    const zig = Math.sin(y * 2.1) * 0.07;
    const rAt = 0.6 - (0.24 * (0.8 + y)) / h;
    sp.setXYZ(i, sp.getX(i) + zig, y + 0.8, rAt + 0.012);
  }
  sc.computeVertexNormals();
  g.add(mesh(sc, M.scar()));
  return g;
}

// ---------------------------------------------------------------- barred survey post
// knee-high square post; dull yellow square crossed by two black horizontal bars
export function barredPost() {
  const g = new THREE.Group();
  const mats = [M.timber(1), M.timber(1), M.timber(2), M.timber(1), M.postBars(), M.postBars()];
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.17), mats);
  m.position.y = 0.39;
  g.add(m);
  const cap = mesh(new THREE.ConeGeometry(0.13, 0.08, 4), M.timber(2)); cap.position.y = 0.82; cap.rotation.y = Math.PI / 4;
  g.add(cap);
  return g;
}

// ---------------------------------------------------------------- signposts
export function signpost(arms, extra = {}) {
  const g = new THREE.Group();
  g.add(at(mesh(box(0.14, 2.3, 0.14, { uvWorld: 1 }), M.timber(1)), 0, 1.15, 0));
  arms.forEach((a, i) => {
    const tex = TEX.text('arm:' + a.text, [a.text], { w: 256, h: 48, bgImage: TEX.timber(0).image, color: '#e6dfc8', size: 26 });
    const mats = [M.timber(0), M.timber(0), M.timber(0), M.timber(0), M.tex('arm:' + a.text, tex), M.tex('arm:' + a.text, tex)];
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.24, 0.05), mats);
    const tipG = new THREE.ConeGeometry(0.17, 0.25, 3); tipG.rotateZ(-Math.PI / 2); tipG.scale(1, 1, 0.25);
    const tipM = mesh(tipG, M.timber(0)); tipM.position.x = 0.69;
    const holder = new THREE.Group();
    arm.position.x = 0.55; holder.add(arm); tipM.position.x = 1.24; holder.add(tipM);
    holder.position.y = a.y ?? (1.95 - i * 0.34);
    holder.rotation.y = a.angle;
    g.add(holder);
  });
  if (extra.initials) {
    const t = TEX.text('initials', ['E.M.'], { w: 64, h: 32, bgImage: TEX.timber(1).image, color: '#2a221a', size: 18, font: 'Georgia, serif' });
    const pl = mesh(new THREE.PlaneGeometry(0.13, 0.07), M.tex('initials', t));
    pl.position.set(0, 1.25, 0.071); g.add(pl);
  }
  if (extra.branch) {
    // snapped forked branch at the foot of the post
    const b = mesh(beam(0.1, 0.05, 0.3, 1.1, 0.12, 0.9, 0.05, 5), M.bark()); g.add(b);
    g.add(mesh(beam(0.7, 0.1, 0.66, 1.05, 0.12, 0.35, 0.035, 4), M.bark()));
  }
  return g;
}

export function noticeboard() {
  const g = new THREE.Group();
  for (const x of [-0.85, 0.85]) g.add(at(mesh(box(0.14, 2.3, 0.14, { uvWorld: 1 }), M.timber(1)), x, 1.15, 0));
  g.add(at(mesh(box(1.6, 1.0, 0.06), [M.timber(0), M.timber(0), M.timber(0), M.timber(0), M.tex('notice', TEX.noticeboard()), M.timber(0)]), 0, 1.45, 0.02));
  const roof = new THREE.Group();
  const r1 = mesh(box(2.1, 0.05, 0.55, { uvWorld: 2 }), M.timber(2)); r1.position.set(0, 2.22, 0.18); r1.rotation.x = 0.45; roof.add(r1);
  const r2 = mesh(box(2.1, 0.05, 0.55, { uvWorld: 2 }), M.timber(2)); r2.position.set(0, 2.22, -0.18); r2.rotation.x = -0.45; roof.add(r2);
  g.add(roof);
  return g;
}

export function roadsideSign() {
  const g = new THREE.Group();
  for (const x of [-1.1, 1.1]) g.add(at(mesh(box(0.1, 2.4, 0.1, { uvWorld: 1 }), M.timber(1)), x, 1.2, 0));
  const tex = TEX.text('roadsign', ['BELLWETHER FOREST RESERVE - 2 KM'], { w: 512, h: 96, bg: '#2f4a3a', color: '#e8e4d4', border: '#e8e4d4', size: 30 });
  g.add(at(mesh(box(2.8, 0.55, 0.05), [M.flat(0x2f4a3a), M.flat(0x2f4a3a), M.flat(0x2f4a3a), M.flat(0x2f4a3a), M.tex('roadsign', tex), M.flat(0x2f4a3a)]), 0, 1.9, 0));
  return g;
}

export function carParkSign() {
  const g = new THREE.Group();
  g.add(at(mesh(box(0.12, 1.9, 0.12, { uvWorld: 1 }), M.timber(1)), 0, 0.95, 0));
  const tex = TEX.text('carparksign', ['CAR PARK'], { w: 256, h: 64, bgImage: TEX.timber(0).image, color: '#ece5cf', size: 30 });
  const mats = [M.timber(0), M.timber(0), M.timber(0), M.timber(0), M.tex('carparksign', tex), M.tex('carparksign', tex)];
  g.add(at(mesh(new THREE.BoxGeometry(1.0, 0.28, 0.05), mats), 0, 1.65, 0));
  return g;
}

// ---------------------------------------------------------------- fence (8 m broken pattern)
export function fenceSegment() {
  const g = new THREE.Group();
  const T = M.timber(1);
  for (const z of [0, 2.7, 5.4]) g.add(at(mesh(box(0.16, 1.15, 0.16, { uvWorld: 1 }), T), 0, 0.57, -z));
  const rail = (y, z0, z1, rz = 0) => { const m = mesh(box(0.07, 0.11, Math.abs(z1 - z0), { uvWorld: 1 }), M.timber(0)); m.position.set(0.05, y, -(z0 + z1) / 2); m.rotation.x = rz; g.add(m); };
  rail(0.95, 0, 5.4); rail(0.5, 0, 2.7);
  // broken lower rail dropping to the ground
  rail(0.3, 2.8, 5.3, -0.12);
  g.add(at(mesh(box(0.16, 0.6, 0.16, { uvWorld: 1 }), T), 0, 0.3, -7.6));
  rail(0.95, 5.4, 7.4);
  return g;
}

// ---------------------------------------------------------------- tent
export function tent(intact) {
  const g = new THREE.Group();
  const L = 2.3, W = 1.9, H = intact ? 1.35 : 0.62;
  const C = M.cloth();
  const pos = [];
  const sag = intact ? 0 : 0.18;
  const ridge = z => H - sag * Math.cos((z / L) * Math.PI);
  const N = 4;
  for (const s of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const z0 = -L / 2 + (i / N) * L, z1 = -L / 2 + ((i + 1) / N) * L;
      const tear = !intact && s > 0 && i === N - 1;
      const ex0 = s * W / 2, ex1 = s * W / 2 * (tear ? 0.7 : 1);
      const a = [0, ridge(z0), z0], b = [0, ridge(z1), z1], c = [ex1, tear ? 0.25 : 0, z1], d = [ex0, 0, z0];
      if (s > 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d); else pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  }
  // end triangles (front one with an open flap when intact)
  const back = [[-W / 2, 0, -L / 2], [W / 2, 0, -L / 2], [0, ridge(-L / 2), -L / 2]];
  pos.push(...back[0], ...back[2], ...back[1]);
  if (intact) {
    pos.push(-W / 2, 0, L / 2, -0.12, 0, L / 2, 0, H, L / 2);
    pos.push(W / 2, 0, L / 2, 0, H, L / 2, 0.42, 0.3, L / 2 + 0.25);
  } else {
    pos.push(-W / 2, 0, L / 2, 0.5, 0.05, L / 2 + 0.25, 0, ridge(L / 2), L / 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 0.5 + 0.5, pos[i + 2] * 0.4 + pos[i + 1] * 0.4);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  g.add(mesh(geo, C));
  const pole = M.timber(2);
  if (intact) {
    g.add(mesh(beam(0, 0, L / 2 + 0.02, 0, H + 0.08, L / 2 + 0.02, 0.02, 4), pole));
    g.add(mesh(beam(0, 0, -L / 2 - 0.02, 0, H + 0.08, -L / 2 - 0.02, 0.02, 4), pole));
  } else {
    g.add(mesh(beam(0, 0, L / 2 + 0.02, 0.35, H * 0.9, L / 2 + 0.1, 0.02, 4), pole));
  }
  // dark interior shadow
  const inner = mesh(new THREE.PlaneGeometry(W * 0.8, L * 0.95), M.flat(0x1a1712)); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.02;
  g.add(inner);
  return g;
}

// ---------------------------------------------------------------- fire ring: 7 stones, 3 pale logs like spokes
export function fireRing(lit) {
  const g = new THREE.Group();
  const rk = rock(1);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const s = mesh(rk.geo, rk.mats); s.scale.set(0.2, 0.22, 0.2); s.position.set(Math.cos(a) * 0.68, 0, Math.sin(a) * 0.68); s.rotation.y = a * 3;
    g.add(s);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    g.add(mesh(beam(Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08, Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62, 0.06, 5), M.flat(0x8f8574)));
  }
  const ash = mesh(new THREE.CircleGeometry(0.5, 8), M.flat(lit ? 0x3a2a20 : 0x3c3a36)); ash.rotation.x = -Math.PI / 2; ash.position.y = 0.02;
  g.add(ash);
  if (lit) {
    const flames = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const fm2 = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    for (let k = 0; k < 3; k++) {
      const f = mesh(new THREE.ConeGeometry(0.22, 0.75, 5, 1, true), k === 1 ? fm2 : fm);
      f.position.set((k - 1) * 0.08, 0.38, (k % 2) * 0.06); f.scale.set(1 - k * 0.2, 1 - k * 0.15, 1 - k * 0.2);
      flames.add(f);
    }
    const embers = mesh(new THREE.CircleGeometry(0.32, 8), new THREE.MeshBasicMaterial({ color: 0xc8501e, fog: true })); embers.rotation.x = -Math.PI / 2; embers.position.y = 0.06;
    g.add(embers);
    g.add(flames);
    g.userData.flames = flames;
  }
  return g;
}

export function mug() {
  const g = new THREE.Group();
  const green = M.flat(0x2f5a3c);
  g.add(mesh(cyl(0.05, 0.048, 0.1, 9), green));
  const rim = mesh(new THREE.TorusGeometry(0.05, 0.007, 4, 10), M.flat(0xd0d0c4)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; g.add(rim);
  const h = mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 8, Math.PI), green); h.position.set(0.055, 0.05, 0); h.rotation.z = -Math.PI / 2; g.add(h);
  // chips in the enamel
  const chip = mesh(new THREE.PlaneGeometry(0.02, 0.015), M.flat(0x1a1a18)); chip.position.set(0, 0.06, 0.0505); g.add(chip);
  return g;
}

export function notebookProp(open = false) {
  const g = new THREE.Group();
  if (open) {
    const p = mesh(new THREE.BoxGeometry(0.3, 0.015, 0.21), [M.flat(0xd8d2c0), M.flat(0xd8d2c0), M.notebook(), M.flat(0x2a3a2a), M.flat(0xd8d2c0), M.flat(0xd8d2c0)]);
    p.position.y = 0.008; g.add(p);
  } else {
    const p = mesh(new THREE.BoxGeometry(0.15, 0.025, 0.21), M.flat(0x2a3a2e)); p.position.y = 0.013; g.add(p);
    const pg = mesh(new THREE.BoxGeometry(0.14, 0.02, 0.2), M.flat(0xd8d2c0)); pg.position.set(0.006, 0.013, 0); g.add(pg);
  }
  return g;
}

export function mapSheet() {
  const m = mesh(new THREE.PlaneGeometry(0.42, 0.3), M.paperMap()); m.rotation.x = -Math.PI / 2; m.position.y = 0.01;
  const g = new THREE.Group(); g.add(m); return g;
}

export function backpack(color = 0x4a5032) {
  const g = new THREE.Group();
  const c = M.flat(color), d = M.flat(new THREE.Color(color).multiplyScalar(0.7).getHex());
  g.add(at(mesh(box(0.38, 0.52, 0.24), c), 0, 0.26, 0));
  g.add(at(mesh(box(0.3, 0.2, 0.08), d), 0, 0.2, 0.15));
  g.add(at(mesh(box(0.36, 0.1, 0.26), d), 0, 0.53, -0.01));
  for (const x of [-0.12, 0.12]) g.add(at(mesh(box(0.04, 0.42, 0.03), M.flat(0x222222)), x, 0.28, -0.135));
  return g;
}

export function batteryPack() {
  const g = new THREE.Group();
  g.add(at(mesh(box(0.12, 0.05, 0.08), M.flat(0x26303a)), 0, 0.025, 0));
  g.add(at(mesh(box(0.05, 0.051, 0.081), M.flat(0xb49c52)), 0.02, 0.025, 0));
  return g;
}

export function stumpProp() {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.36, 0.44, 0.62, 8, { sv: 0.6 }), M.bark()));
  const top = mesh(new THREE.CircleGeometry(0.36, 8), M.timber(2)); top.rotation.x = -Math.PI / 2; top.position.y = 0.625; g.add(top);
  return g;
}

export function logSeat(len = 1.8) {
  const g = new THREE.Group();
  const l = mesh(new THREE.CylinderGeometry(0.2, 0.22, len, 7), M.bark()); l.rotation.z = Math.PI / 2; l.position.y = 0.2; g.add(l);
  return g;
}

// ---------------------------------------------------------------- radio, stove, furniture
export function radio(lit = false, brokenAntenna = true) {
  const g = new THREE.Group();
  const face = M.tex('radio' + (lit ? 'L' : 'D'), TEX.radioFace(lit));
  g.add(at(mesh(new THREE.BoxGeometry(0.42, 0.24, 0.16), [M.metal(), M.metal(), M.metal(), M.metal(), face, M.metal()]), 0, 0.12, 0));
  if (brokenAntenna) {
    g.add(mesh(beam(0.15, 0.24, -0.04, 0.2, 0.42, -0.06, 0.006, 4), M.flat(0x8a8a84)));
    g.add(mesh(beam(0.2, 0.42, -0.06, 0.34, 0.45, -0.12, 0.005, 4), M.flat(0x8a8a84)));
  } else g.add(mesh(beam(0.15, 0.24, -0.04, 0.15, 0.95, -0.04, 0.006, 4), M.flat(0xa0a09a)));
  if (lit) {
    const glow = mesh(new THREE.PlaneGeometry(0.06, 0.035), M.emissive(0xff8a3a)); glow.position.set(0.0625, 0.21, 0.081); g.add(glow);
    g.userData.glow = glow;
  }
  return g;
}

export function stove() {
  const g = new THREE.Group();
  const iron = M.flat(0x26292a);
  g.add(at(mesh(box(0.55, 0.55, 0.5), iron), 0, 0.42, 0));
  for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) g.add(at(mesh(box(0.05, 0.16, 0.05), iron), x, 0.08, z));
  { const pipe = mesh(cyl(0.07, 0.07, 2.4, 7), iron); pipe.position.set(0, 0.7, -0.1); g.add(pipe); }
  const window = mesh(new THREE.PlaneGeometry(0.25, 0.16), M.flat(0x15100c)); window.position.set(0, 0.42, 0.251); g.add(window);
  g.userData.window = window;
  return g;
}

export function table(w = 1.4, d = 0.8, h = 0.76) {
  const g = new THREE.Group();
  g.add(at(mesh(box(w, 0.06, d, { uvWorld: 1.5 }), M.timber(0)), 0, h, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(mesh(box(0.07, h, 0.07), M.timber(1)), x * (w / 2 - 0.06), h / 2, z * (d / 2 - 0.06)));
  return g;
}

export function bench(w = 2.0) {
  const g = new THREE.Group();
  g.add(at(mesh(box(w, 0.06, 0.38, { uvWorld: 1.5 }), M.timber(0)), 0, 0.45, 0));
  for (const x of [-1, 1]) g.add(at(mesh(box(0.06, 0.45, 0.34), M.timber(1)), x * (w / 2 - 0.1), 0.225, 0));
  return g;
}

export function waterCan() {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.16, 0.17, 0.48, 9), M.flat(0x4f5a52)));
  { const cap = mesh(cyl(0.05, 0.05, 0.06, 6), M.flat(0x33352f)); cap.position.y = 0.48; g.add(cap); }
  return g;
}

// ---------------------------------------------------------------- ranger shelter
// 5 x 4 m footprint, 2.4 m interior wall height, green corrugated pitched roof,
// yellow braced timber door (off-centre), one 0.8 m square window, stone footing.
// Front wall faces +Z. Floor at local y = 0.3.
export function shelter() {
  const g = new THREE.Group();
  const T = M.timber(1), T1 = M.timber(1);
  const F = 0.3, Hh = 2.4, hw = 2.5, hd = 2.0, th = 0.14;
  // stone footing
  const stone = M.slate(1);
  g.add(at(mesh(box(5.2, F, 4.2, { uvWorld: 0.8 }), stone), 0, F / 2, 0));
  // floor
  g.add(at(mesh(box(4.8, 0.04, 3.8, { uvWorld: 1 }), M.timber(2)), 0, F + 0.02, 0));
  // walls with openings: door (x 0.25..1.15) and window (x -1.7..-0.9, y 1.0..1.8) on front; back window
  const wall = (x0, x1, y0, y1, z, mat = T) => g.add(at(mesh(box(x1 - x0, y1 - y0, th, { uvWorld: 1 }), mat), (x0 + x1) / 2, F + (y0 + y1) / 2, z));
  const fz = hd - th / 2, bz = -hd + th / 2;
  wall(-hw, -1.7, 0, Hh, fz); wall(-1.7, -0.9, 0, 1.0, fz); wall(-1.7, -0.9, 1.8, Hh, fz); wall(-0.9, 0.25, 0, Hh, fz);
  wall(0.25, 1.15, 2.05, Hh, fz); wall(1.15, hw, 0, Hh, fz);
  wall(-hw, -1.2, 0, Hh, bz); wall(-1.2, -0.4, 0, 1.2, bz); wall(-1.2, -0.4, 2.0, Hh, bz); wall(-0.4, hw, 0, Hh, bz);
  const side = (x) => g.add(at(mesh(box(th, Hh, 2 * hd, { uvWorld: 1 }), T), x, F + Hh / 2, 0));
  side(-hw + th / 2); side(hw - th / 2);
  // gable ends
  for (const z of [fz, bz]) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0, 0, hw, 0, 0, 0, 1.1, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2.5, 0, 1.25, 1], 2));
    tri.computeVertexNormals();
    const tm = mesh(tri, M.tex('timberDS', TEX.timber(0), { side: THREE.DoubleSide })); tm.position.set(0, F + Hh, z); g.add(tm);
  }
  // window panes
  const win = M.window();
  g.add(at(mesh(new THREE.PlaneGeometry(0.8, 0.8), win), -1.3, F + 1.4, fz + 0.01));
  const bw = mesh(new THREE.PlaneGeometry(0.8, 0.8), win); bw.position.set(-0.8, F + 1.6, bz - 0.01); bw.rotation.y = Math.PI; g.add(bw);
  const bwi = mesh(new THREE.PlaneGeometry(0.8, 0.8), win); bwi.position.set(-0.8, F + 1.6, bz + 0.08); g.add(bwi);
  // roof: two corrugated planes, ridge along X, 0.4 m overhang
  const ra = Math.atan2(1.2, 2.4);
  for (const s of [-1, 1]) {
    const r = mesh(new THREE.PlaneGeometry(6.0, 2.8), M.roof());
    r.rotation.x = s > 0 ? ra - Math.PI / 2 : -(Math.PI / 2 + ra);
    r.position.set(0, F + Hh + 0.5, s * 1.2);
    g.add(r);
  }
  g.add(at(mesh(box(0.12, 0.12, 0.12), M.flat(0x26292a)), 1.8, F + Hh + 1.6, -0.9));
  g.add(at(mesh(cyl(0.07, 0.07, 1.0, 7), M.flat(0x26292a)), 1.8, F + Hh + 0.6, -0.9));
  // door on a hinge pivot (hinge at x = 0.25)
  const pivot = new THREE.Group(); pivot.position.set(0.25, F, fz);
  const door = mesh(box(0.9, 2.05, 0.06), [M.timber(1), M.timber(1), M.timber(1), M.timber(1), M.door(), M.door()]);
  door.position.set(0.45, 1.025, 0); pivot.add(door);
  g.add(pivot);
  g.userData.doorPivot = pivot;
  // threshold step and firewood stack
  g.add(at(mesh(box(1.2, 0.18, 0.5), M.slate(2)), 0.7, 0.09, hd + 0.3));
  for (let i = 0; i < 9; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), M.bark()); l.rotation.x = Math.PI / 2;
    l.position.set(hw + 0.25 + (i % 3) * 0.17, 0.09 + Math.floor(i / 3) * 0.16, 1.2); g.add(l);
  }
  return g;
}

// ---------------------------------------------------------------- lookout tower
// 14 m total; four splayed timber legs across a 5 x 5 m base; three zigzag stair
// flights with landings; 3 x 3 m cabin (floor 11 m); shallow pyramidal roof;
// glazed upper walls; one missing lower side panel facing the access stairs (+Z).
export const TOWER = { floor: 11.0, rise: 11.0 / 3, run: 4.8 };
export function tower(detail = true) {
  const g = new THREE.Group();
  const T = M.timber(1), T0 = M.timber(0);
  const F = TOWER.floor;
  const leg = (sx, sz) => g.add(mesh(beam(sx * 2.5, 0, sz * 2.5, sx * 1.5, F + 2.2, sz * 1.5, 0.11, 4, true), T));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(sx, sz);
  // zigzag braces on each face
  const lerp = (a, b, t) => a + (b - a) * t;
  const W = y => lerp(2.5, 1.5, y / (F + 2.2));
  const levels = [0, F / 3, (2 * F) / 3, F];
  for (let i = 0; i < 3; i++) {
    const y0 = levels[i], y1 = levels[i + 1];
    for (const face of [0, 1, 2, 3]) {
      const w0 = W(y0), w1 = W(y1);
      const p = (w, y, s) => face === 0 ? [s * w, y, w] : face === 1 ? [s * w, y, -w] : face === 2 ? [w, y, s * w] : [-w, y, s * w];
      const s0 = i % 2 ? 1 : -1;
      const a = p(w0, y0, s0), b = p(w1, y1, -s0);
      g.add(mesh(beam(...a, ...b, 0.05, 4, true), T0));
      const h1 = p(w1, y1, -1), h2 = p(w1, y1, 1);
      g.add(mesh(beam(...h1, ...h2, 0.06, 4, true), T0));
    }
  }
  // stairs: flights along X outside the +Z face; band A z 3.0..3.9, band B z 3.9..4.8
  const R = TOWER.rise;
  const flight = (x0, x1, y0, zc) => {
    const n = 18;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const st = mesh(box(4.8 / n + 0.02, 0.05, 0.86, { uvWorld: 1 }), T0);
      st.position.set(lerp(x0, x1, t), y0 + R * t - 0.02, zc); g.add(st);
    }
    for (const dz of [-0.45, 0.45]) g.add(mesh(beam(x0, y0 - 0.15, zc + dz, x1, y0 + R - 0.15, zc + dz, 0.06, 4, true), T));
    // handrail on the outer side
    g.add(mesh(beam(x0, y0 + 0.95, zc + 0.47, x1, y0 + R + 0.95, zc + 0.47, 0.035, 4, true), T0));
  };
  flight(-2.4, 2.4, 0, 3.45);
  flight(2.4, -2.4, R, 4.35);
  flight(-2.4, 2.4, 2 * R, 3.45);
  const landing = (x0, x1, z0, z1, y) => {
    g.add(at(mesh(box(x1 - x0, 0.08, z1 - z0, { uvWorld: 1 }), T0), (x0 + x1) / 2, y - 0.04, (z0 + z1) / 2));
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) g.add(mesh(beam(x, 0, z, x, y + 1.0, z, 0.06, 4, true), T));
  };
  landing(2.4, 3.4, 3.0, 4.8, R);
  landing(-3.4, -2.4, 3.0, 4.8, 2 * R);
  landing(0.2, 3.4, 1.5, 3.9, F); // deck in front of the cabin
  // landing rails
  g.add(mesh(beam(3.4, R + 1, 3.0, 3.4, R + 1, 4.8, 0.035, 4, true), T0));
  g.add(mesh(beam(-3.4, 2 * R + 1, 3.0, -3.4, 2 * R + 1, 4.8, 0.035, 4, true), T0));
  g.add(mesh(beam(3.4, F + 1, 1.5, 3.4, F + 1, 3.9, 0.035, 4, true), T0));
  g.add(mesh(beam(0.2, F + 1, 3.9, 3.4, F + 1, 3.9, 0.035, 4, true), T0));
  // cabin
  const cab = new THREE.Group(); cab.position.y = F;
  cab.add(at(mesh(box(3.2, 0.12, 3.2, { uvWorld: 1 }), T0), 0, -0.06, 0));
  const glass = new THREE.MeshLambertMaterial({ color: 0x2a3038, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  for (const [x, z, ry] of [[0, 1.5, 0], [0, -1.5, 0], [1.5, 0, Math.PI / 2], [-1.5, 0, Math.PI / 2]]) {
    const front = z > 1;
    const lower = mesh(box(3.0, 1.0, 0.08, { uvWorld: 1 }), T0);
    lower.position.set(x, 0.5, z); lower.rotation.y = ry;
    if (front) {
      // one missing lower panel facing the stairs: opening x 0.3..1.3
      const a = mesh(box(1.8, 1.0, 0.08, { uvWorld: 1 }), T0); a.position.set(-0.6, 0.5, z); cab.add(a);
      const b = mesh(box(0.2, 1.0, 0.08, { uvWorld: 1 }), T0); b.position.set(1.4, 0.5, z); cab.add(b);
    } else cab.add(lower);
    const gl = mesh(new THREE.PlaneGeometry(3.0, 1.1), glass); gl.position.set(x, 1.6, z); gl.rotation.y = ry; cab.add(gl);
  }
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) cab.add(mesh(beam(x, 0, z, x, 2.25, z, 0.07, 4, true), T));
  for (const [x, z, w, d] of [[0, 1.5, 3.1, 0.1], [0, -1.5, 3.1, 0.1], [1.5, 0, 0.1, 3.1], [-1.5, 0, 0.1, 3.1]]) cab.add(at(mesh(box(w, 0.1, d), T), x, 2.2, z));
  // shallow pyramidal roof
  const roof = mesh(new THREE.ConeGeometry(2.6, 0.75, 4, 1), M.flat(0x3a4038)); roof.rotation.y = Math.PI / 4; roof.position.y = 2.25 + 0.37; cab.add(roof);
  g.add(cab);
  g.userData.cabin = cab;
  return g;
}

// ---------------------------------------------------------------- culvert mouth
// 2.4 x 2.6 m rectangular concrete opening in a low 7 m-deep earth embankment.
// Opening faces +Z; the join plane sits 0.6 m inside the opening.
export function culvert() {
  const g = new THREE.Group();
  const C = M.concrete();
  g.add(at(mesh(box(0.9, 3.4, 0.5, { uvWorld: 0.7 }), C), -1.65, 1.7, 0));
  g.add(at(mesh(box(0.9, 3.4, 0.5, { uvWorld: 0.7 }), C), 1.65, 1.7, 0));
  g.add(at(mesh(box(4.2, 0.8, 0.5, { uvWorld: 0.7 }), C), 0, 3.0, 0));
  // wing walls
  for (const s of [-1, 1]) { const w = mesh(box(0.4, 2.2, 3.0, { uvWorld: 0.7 }), C); w.position.set(s * 2.6, 1.1, 1.2); w.rotation.y = s * 0.45; g.add(w); }
  // inner walls up to the join (0.6 m deep) and floor
  g.add(at(mesh(box(0.2, 2.6, 1.2, { uvWorld: 0.7 }), C), -1.3, 1.3, -0.5));
  g.add(at(mesh(box(0.2, 2.6, 1.2, { uvWorld: 0.7 }), C), 1.3, 1.3, -0.5));
  g.add(at(mesh(box(2.8, 0.2, 1.2, { uvWorld: 0.7 }), C), 0, 2.7, -0.5));
  g.add(at(mesh(box(2.4, 0.1, 1.6, { uvWorld: 0.7 }), C), 0, -0.05, -0.2));
  // earth embankment mound
  const emb = new THREE.BufferGeometry();
  const H = 4.6, D = 7.0, Wb = 18, Wt = 10;
  const v = [
    [-Wb / 2, 0, 0.3], [Wb / 2, 0, 0.3], [Wt / 2, H, -1.6], [-Wt / 2, H, -1.6],
    [-Wt / 2, H, -1.6 - 3.0], [Wt / 2, H, -1.6 - 3.0], [Wb / 2, 0, -D - 1.2], [-Wb / 2, 0, -D - 1.2],
  ];
  const f = (a, b, c, d) => [...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]];
  emb.setAttribute('position', new THREE.Float32BufferAttribute([...f(0, 1, 2, 3), ...f(3, 2, 5, 4), ...f(4, 5, 6, 7), ...f(0, 3, 4, 7), ...f(1, 6, 5, 2)], 3));
  const ep = emb.attributes.position; const euv = [];
  for (let i = 0; i < ep.count; i++) euv.push(ep.getX(i) / 3, (ep.getY(i) + ep.getZ(i)) / 3);
  emb.setAttribute('uv', new THREE.Float32BufferAttribute(euv, 2));
  emb.computeVertexNormals();
  g.add(mesh(emb, M.tex('embank', TEX.litter(), { color: 0x5a4c3c })));
  return g;
}

// tunnel corridor piece: 2.4 m wide, 2.6 m high, along -Z from z=0 to z=-len
export function tunnelPiece(len, opts = {}) {
  const g = new THREE.Group();
  const C = M.concrete();
  g.add(at(mesh(box(2.4, 0.1, len, { uvWorld: 0.5 }), C), 0, -0.05, -len / 2));
  g.add(at(mesh(box(2.4, 0.15, len, { uvWorld: 0.5 }), C), 0, 2.675, -len / 2));
  if (!opts.noLeft) g.add(at(mesh(box(0.2, 2.6, len, { uvWorld: 0.5 }), C), -1.3, 1.3, -len / 2));
  if (!opts.noRight) g.add(at(mesh(box(0.2, 2.6, len, { uvWorld: 0.5 }), C), 1.3, 1.3, -len / 2));
  // water trickle along one side
  const w = mesh(new THREE.PlaneGeometry(0.35, len), M.water()); w.rotation.x = -Math.PI / 2; w.position.set(opts.waterX ?? 0.95, 0.012, -len / 2);
  g.add(w);
  return g;
}

// ---------------------------------------------------------------- small timber service hut (3 x 3 m)
// front door faces +Z, timber door frame to the tunnel in the back wall (-Z). Floor y 0.2.
export function serviceHut() {
  const g = new THREE.Group();
  const T = M.timber(2), F = 0.2;
  g.add(at(mesh(box(3.3, F, 3.3, { uvWorld: 1 }), M.slate(1)), 0, F / 2, 0));
  g.add(at(mesh(box(3.0, 0.04, 3.0, { uvWorld: 1 }), M.timber(0)), 0, F + 0.02, 0));
  const wall = (x0, x1, y0, y1, z) => g.add(at(mesh(box(x1 - x0, y1 - y0, 0.12, { uvWorld: 1 }), T), (x0 + x1) / 2, F + (y0 + y1) / 2, z));
  wall(-1.6, -0.5, 0, 2.3, 1.55); wall(0.5, 1.6, 0, 2.3, 1.55); wall(-0.5, 0.5, 2.05, 2.3, 1.55);
  wall(-1.6, -0.5, 0, 2.3, -1.55); wall(0.5, 1.6, 0, 2.3, -1.55); wall(-0.5, 0.5, 2.05, 2.3, -1.55);
  for (const x of [-1.55, 1.55]) g.add(at(mesh(box(0.12, 2.3, 3.2, { uvWorld: 1 }), T), x, F + 1.15, 0));
  // back door frame (to the tunnel), heavier timber
  for (const x of [-0.55, 0.55]) g.add(at(mesh(box(0.12, 2.1, 0.2), M.timber(1)), x, F + 1.05, -1.55));
  g.add(at(mesh(box(1.22, 0.14, 0.2), M.timber(1)), 0, F + 2.1, -1.55));
  // front door frame
  for (const x of [-0.55, 0.55]) g.add(at(mesh(box(0.12, 2.1, 0.18), M.timber(1)), x, F + 1.05, 1.55));
  const roof = mesh(box(3.8, 0.1, 3.8, { uvWorld: 1 }), M.roof()); roof.position.set(0, F + 2.4, 0); roof.rotation.x = 0.08; g.add(roof);
  // shelves and a crate
  g.add(at(mesh(box(0.6, 0.5, 0.5), M.timber(1)), -1.1, F + 0.25, 0.9));
  return g;
}

// ---------------------------------------------------------------- the car (driver on the left)
// local: front is -Z. Driver eye at (-0.37, 1.12, 0.25).
export const CAR = { eye: { x: -0.37, y: 1.16, z: 0.52 } };
export function car(color = 0x2d4640) {
  const g = new THREE.Group();
  const body = M.flat(color), dark = M.flat(0x151a18), trim = M.flat(0x2a2c2b);
  // hollow body shell so the interior is visible from the driver's seat
  g.add(at(mesh(box(1.72, 0.55, 1.45), body), 0, 0.62, -1.33));
  g.add(at(mesh(box(1.72, 0.55, 0.9), body), 0, 0.62, 1.6));
  for (const x of [-0.83, 0.83]) g.add(at(mesh(box(0.06, 0.55, 1.6), body), x, 0.62, 0.35));
  g.add(at(mesh(box(1.6, 0.05, 1.7), M.flat(0x1c1e1d)), 0, 0.4, 0.35));
  // cabin shell (roof + pillars), leaving the glass areas open
  g.add(at(mesh(box(1.6, 0.06, 1.9), body), 0, 1.42, 0.35));
  for (const x of [-0.78, 0.78]) {
    g.add(mesh(beam(x, 0.9, -0.62, x, 1.42, -0.15, 0.028, 4, true), M.flat(0x1a2421))); // A pillars
    g.add(mesh(beam(x, 0.9, 1.3, x, 1.42, 1.25, 0.06, 4, true), body)); // C pillars
    g.add(at(mesh(box(0.05, 0.5, 0.1), body), x, 1.15, 0.55)); // B pillar
  }
  g.add(at(mesh(box(1.6, 0.5, 0.05), body), 0, 1.15, 1.32));
  const glass = new THREE.MeshLambertMaterial({ color: 0x3a444c, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
  const ws = mesh(new THREE.PlaneGeometry(1.52, 0.72), glass); ws.position.set(0, 1.16, -0.39); ws.rotation.x = -0.82; g.add(ws);
  for (const x of [-0.79, 0.79]) { const s = mesh(new THREE.PlaneGeometry(1.5, 0.5), glass); s.position.set(x, 1.16, 0.55); s.rotation.y = Math.PI / 2; g.add(s); }
  // wheels
  for (const [x, z] of [[-0.82, -1.3], [0.82, -1.3], [-0.82, 1.3], [0.82, 1.3]]) {
    const w = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.32, z); g.add(w);
  }
  // lights
  for (const x of [-0.6, 0.6]) g.add(at(mesh(box(0.3, 0.12, 0.02), M.flat(0xc8c4b0)), x, 0.75, -2.06));
  for (const x of [-0.6, 0.6]) g.add(at(mesh(box(0.3, 0.12, 0.02), M.flat(0x6a1e1a)), x, 0.78, 2.06));
  // interior
  g.add(at(mesh(box(1.55, 0.22, 0.5), trim), 0, 0.8, -0.38)); // dashboard
  g.add(at(mesh(box(1.55, 0.05, 0.3), M.flat(0x202322)), 0, 0.93, -0.5));
  const clock = mesh(new THREE.PlaneGeometry(0.12, 0.06), M.tex('clock417', TEX.clockFace('4:17'), { emissive: 0x2a5a33 }));
  clock.position.set(0.08, 0.86, -0.125); clock.rotation.x = -0.35; g.add(clock);
  const gauges = mesh(new THREE.PlaneGeometry(0.34, 0.14), M.tex('gauges', TEX.gauge(), { emissive: 0x1a1612 })); gauges.position.set(-0.37, 0.87, -0.14); gauges.rotation.x = -0.4; g.add(gauges);
  const wheel = mesh(new THREE.TorusGeometry(0.19, 0.022, 5, 14), dark); wheel.position.set(-0.37, 0.86, -0.02); wheel.rotation.x = -0.45; g.add(wheel);
  g.add(mesh(beam(-0.37, 0.86, -0.02, -0.37, 0.8, -0.25, 0.03, 5), dark));
  for (const x of [-0.37, 0.37]) {
    g.add(at(mesh(box(0.5, 0.15, 0.55), M.flat(0x2c2a28)), x, 0.62, 0.35));
    g.add(at(mesh(box(0.5, 0.65, 0.12), M.flat(0x2c2a28)), x, 0.98, 0.68));
  }
  g.add(at(mesh(box(1.5, 0.4, 0.5), M.flat(0x2c2a28)), 0, 0.8, 1.15));
  const pack = backpack(0x4a5032); pack.position.set(0.37, 0.7, 0.35); pack.rotation.y = 0.3; g.add(pack);
  g.userData.pack = pack;
  const note = mesh(new THREE.PlaneGeometry(0.1, 0.07), M.tex('reminder', TEX.text('reminder', ['Home before dark.'], { w: 128, h: 64, bg: '#e6e0a8', color: '#2a2a3a', size: 15, weight: 400, font: 'Georgia, serif' })));
  note.position.set(0.32, 0.93, -0.16); note.rotation.x = -0.6; g.add(note);
  const phone = mesh(box(0.07, 0.01, 0.14), M.flat(0x111111)); phone.position.set(0.1, 0.78, 0.05); g.add(phone);
  return g;
}

// ---------------------------------------------------------------- the Watcher
// featureless dark adult-sized silhouette, 1.8 m, ordinary proportions
export function watcher() {
  const g = new THREE.Group();
  const m = M.flat(0x151a18);
  g.add(at(mesh(new THREE.SphereGeometry(0.11, 7, 5), m), 0, 1.68, 0));
  g.add(at(mesh(box(0.4, 0.62, 0.22), m), 0, 1.25, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(beam(s * 0.22, 1.52, 0, s * 0.27, 0.86, 0.02, 0.05, 5), m));
    g.add(mesh(beam(s * 0.1, 0.95, 0, s * 0.12, 0.0, 0.0, 0.07, 5), m));
  }
  return g;
}

export function vehicle(color = 0x6a6e70) {
  const g = car(color);
  return g;
}
