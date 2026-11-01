// Act III-IV / a route you can learn: fence corridor, culvert + drainage tunnel,
// service hut + lookout cabin, final bridge, bank network, dawn road, the drive.
import { forest, G, KIT, M, THREE, lp, addMesh, inView } from './common.js';
import { Place } from '../place.js';
import * as P from '../props.js';
import { box, beam } from '../geo.js';
import { smooth, polyDist } from '../noise.js';
import { TEX } from '../textures.js';

// ---------------------------------------------------------------- 13 fence corridor (48 m)
export function buildCorridor() {
  const p = forest('corridor', {
    name: 'Fence Corridor', ambience: 'forest', amp: 0.25, fogScale: 1.0,
    bounds: { x0: -30, x1: 30, z0: -60, z1: 60 },
    scatter: { spacing: 3.6, conifer: 0.9, coniferTypes: [2, 1], ferns: 70, rocks: 10, logs: 3, extraClear: 7 },
  });
  const t = p.trail([[0, 26.5], [0, -26.5]], { w: 1.8, worn: 0.9, name: 'main' });
  p.mouthAtStart(t, 'start');
  p.mouthAtEnd(t, 'end');
  // repeating 8 m broken fence on the left (west)
  for (let z = 24; z > -26; z -= 8) addMesh(p, P.fenceSegment(), -1.75, z, 0);
  // planted rows: roughly parallel trunks, imperfect
  let i = 0;
  for (let z = 25; z > -26; z -= 3.3) {
    for (const x of [-4, -7.2, -10.5, 3.6, 6.8, 10.2]) {
      const jx = Math.sin(i * 7.31) * 0.45, jz = Math.cos(i * 3.17) * 0.6;
      i++;
      if (Math.abs(z + jz) > 25.6 && Math.abs(x) < 8) continue;
      p.inst(KIT.conifer[2](), x + jx, z + jz, { s: 0.92 + (i % 5) * 0.04, ry: i });
    }
  }
  p.trigger({ id: 's2', k: 'circ', x: 0, z: 0, r: 3, onEnter: () => G.story.corridorMid() });
  p.trigger({ id: 's3', k: 'circ', x: 0, z: -12, r: 3, onEnter: () => G.story.corridorFar() });
  p.watcherSpot = { x: 4.2, z: -24, trigger: { x: 0, z: 14, r: 3 } };
  p.spawn = { x: 0, z: 20, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- 15 culvert mouth
export function buildCulvert() {
  const p = forest('culvert', {
    name: 'Drainage Tunnel', variant: 'outside', ambience: 'creek', amp: 0.4,
    height: (x, z, n) => n.fbm(x * 0.04, z * 0.04) * 0.8 * smooth((Math.hypot(x, z) - 4) / 8),
    scatter: { spacing: 3.3, ferns: 100, rocks: 24, logs: 4 },
  });
  p.creek([[1.0, -0.4], [1.0, 3], [2.6, 8], [6, 13], [12, 16.5], [20, 18]], { w: 0.9, depth: 0.3, water: 0.12 });
  const t = p.trail([[-0.6, 22.5], [0, 15], [-0.6, 9], [-0.2, 3.2], [0, 1.4]], { w: 1.6, name: 'approach' });
  p.mouthAtStart(t, 'approach');
  const floorY = p.heightAt(0, 1.6) + 0.02;
  const cv = P.culvert();
  p.put(cv, 0, 0, { y: floorY });
  p.keepout(0, -3, 9);
  p.rect(0, -0.2, 0.85, 1.05, 0, { h: () => floorY, surf: 'concrete' });
  p.mouth('mouth', 0, -0.6, 0, -1, { kind: 'door', halfW: 1.2, top: 2.62, bottom: -0.15, y: floorY, depthIn: 0.4, depthOut: 0.3 });
  p.emitter({ type: 'creek', x: 2, y: 0, z: 5, gain: 0.35 });
  p.emitter({ type: 'drip', x: 0, y: 1, z: -2, gain: 0.5 });
  p.trigger({ id: 'see', k: 'circ', x: 0, z: 6, r: 4, onEnter: () => G.story.reachCulvert() });
  p.spawn = { x: 0, z: 12, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- 16 tunnel interior: 55 m, three right-angle bends
export function buildTunnel() {
  const p = new Place('tunnel', { name: 'Drainage Tunnel', variant: 'inside', ambience: 'tunnel', terrain: false, indoor: true, ambientScale: 0.28, fogScale: 0.75, flashScale: 1.0 });
  const C = [[0, 0], [0, -14], [14, -14], [14, -28], [0.6, -28]];
  const W = 1.2, hw = 0.88;
  const add = (o) => p.group.add(o);
  for (let i = 0; i < C.length - 1; i++) {
    const [ax, az] = C[i], [bx, bz] = C[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const ext0 = i === 0 ? 0.9 : W, ext1 = i === C.length - 2 ? 0 : W;
    const cx = (ax + bx) / 2 + dx * (ext1 - ext0) / 2, cz = (az + bz) / 2 + dz * (ext1 - ext0) / 2;
    const L = len + ext0 + ext1;
    const ry = Math.atan2(dx, dz);
    const floor = new THREE.Mesh(box(2.4, 0.1, L, { uvWorld: 0.5 }), M.concrete()); floor.position.set(cx, -0.05, cz); floor.rotation.y = ry; add(floor);
    const ceil = new THREE.Mesh(box(2.6, 0.15, L, { uvWorld: 0.5 }), M.concrete()); ceil.position.set(cx, 2.675, cz); ceil.rotation.y = ry; add(ceil);
    p.rect(cx, cz, hw, L / 2 - (i === 0 ? 0 : 0.3), ry, { h: () => 0, surf: 'concrete', inside: true });
    // water trickle on one side of each run
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.32, L), M.water()); w.rotation.x = -Math.PI / 2; w.rotation.z = -ry;
    w.position.set(cx + dz * 0.95, 0.012, cz - dx * 0.95); add(w);
  }
  // walls from offset polylines (mitred)
  const offset = (s) => C.map((pt, i) => {
    const prev = C[Math.max(0, i - 1)], next = C[Math.min(C.length - 1, i + 1)];
    let n1 = null, n2 = null;
    if (i > 0) { const dx = pt[0] - prev[0], dz = pt[1] - prev[1], L = Math.hypot(dx, dz); n1 = [dz / L, -dx / L]; }
    if (i < C.length - 1) { const dx = next[0] - pt[0], dz = next[1] - pt[1], L = Math.hypot(dx, dz); n2 = [dz / L, -dx / L]; }
    if (!n1) return [pt[0] + n2[0] * s, pt[1] + n2[1] * s];
    if (!n2) return [pt[0] + n1[0] * s, pt[1] + n1[1] * s];
    const mx = n1[0] + n2[0], mz = n1[1] + n2[1], ml = Math.hypot(mx, mz);
    const k = s / ((mx / ml) * n1[0] + (mz / ml) * n1[1]);
    return [pt[0] + (mx / ml) * k, pt[1] + (mz / ml) * k];
  });
  for (const s of [-1.3, 1.3]) {
    const O = offset(s);
    O[0] = [O[0][0], O[0][1] + 0.9];
    for (let i = 0; i < O.length - 1; i++) {
      const [ax, az] = O[i], [bx, bz] = O[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const wall = new THREE.Mesh(box(0.2, 2.7, L + 0.2, { uvWorld: 0.5 }), M.concrete());
      wall.position.set((ax + bx) / 2, 1.3, (az + bz) / 2); wall.rotation.y = Math.atan2(bx - ax, bz - az); add(wall);
    }
  }
  // end wall with the timber door frame (final corner) leading to the service hut
  const endWall = (z0, z1) => { const m = new THREE.Mesh(box(0.2, 2.7, Math.abs(z1 - z0), { uvWorld: 0.5 }), M.concrete()); m.position.set(0.4, 1.3, (z0 + z1) / 2); add(m); };
  endWall(-29.4, -28.6); endWall(-27.4, -26.6);
  const lint = new THREE.Mesh(box(0.2, 0.6, 1.2), M.concrete()); lint.position.set(0.4, 2.4, -28); add(lint);
  for (const z of [-28.6, -27.4]) { const post = new THREE.Mesh(box(0.14, 2.1, 0.14), M.timber(1)); post.position.set(0.55, 1.05, z); add(post); }
  const tl = new THREE.Mesh(box(0.14, 0.14, 1.36), M.timber(1)); tl.position.set(0.55, 2.1, -28); add(tl);
  p.rect(0.5, -28, 0.45, 0.2, 0, { h: () => 0, surf: 'timber', inside: true });
  p.mouth('door', 0.45, -28, -1, 0, { kind: 'door', halfW: 0.55, top: 2.06, bottom: -0.15, y: 0, depthIn: 0.35, depthOut: 0.25 });
  p.mouth('mouth', 0, 0.3, 0, 1, { kind: 'door', halfW: 1.2, top: 2.62, bottom: -0.15, y: 0, depthIn: 0.4, depthOut: 0.3 });
  p.rect(0, 0.2, 0.85, 0.8, 0, { h: () => 0, surf: 'concrete', inside: true });
  // one receding pale patch per visible corner
  for (const [x, z, ry] of [[0, -15.05, 0], [15.05, -14, Math.PI / 2], [14, -29.05, 0]]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6), M.flat(0xb3b2a8)); patch.position.set(x, 1.2, z); patch.rotation.y = ry; add(patch);
  }
  for (const [x, z] of [[0, -8], [8, -14], [14, -21], [6, -28]]) p.emitter({ type: 'drip', x, y: 2.4, z, gain: 0.5 });
  p.trigger({ id: 'deep', k: 'circ', x: 14, z: -21, r: 2, onEnter: () => G.story.deepTunnel() });
  p.spawn = { x: 0, z: -3, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- service hut + 17 lookout cabin
export function buildHut() {
  const TX = 3, TZ = 18, TRY = Math.PI;
  const p = forest('hut', {
    name: 'Service Hut', ambience: 'ridge', amp: 0.6, exposed: true, fogScale: 1.6,
    fogTint: { color: 0x3c4152, amount: 0.45 },
    height: (x, z, n) => {
      const dHut = Math.max(Math.abs(x) - 2.5, Math.abs(z) - 2.5, 0);
      const dTow = Math.max(Math.abs(x - TX) - 6, Math.abs(z - TZ) - 6, 0);
      return n.fbm(x * 0.05, z * 0.05) * 0.9 * smooth(Math.min(dHut, dTow) / 5) + (z < -4 ? (-4 - z) * 0.6 : 0);
    },
    scatter: { spacing: 3.3, conifer: 0.8, ferns: 70, rocks: 30, logs: 4, extraClear: 0.6 },
  });
  const hy = p.heightAt(0, 0);
  const floorY = hy + 0.22;
  p.floorY = floorY;
  addMesh(p, P.serviceHut(), 0, 0, 0, 0, hy);
  p.keepout(0, 0, 3.2);
  // rock bank behind the hut so it cannot be walked around
  for (const [x, z, k, s] of [[-2.4, -3, 2, 1.6], [0.6, -3.6, 5, 1.7], [3.0, -2.8, 3, 1.4], [-4.2, -0.5, 0, 1.2], [4.4, -0.2, 1, 1.2]]) p.inst(KIT.rock[k](), x, z, { s, ry: x, dy: -0.2 });
  p.rect(0, 0, 1.15, 1.15, 0, { h: () => floorY, surf: 'timber', inside: true });
  p.rect(0, 1.6, 0.25, 0.5, 0, { h: () => floorY, surf: 'timber', inside: true });
  p.rect(0, -1.6, 0.25, 0.5, 0, { h: () => floorY, surf: 'timber', inside: true });
  p.mouth('tunnelDoor', 0, -1.5, 0, -1, { kind: 'door', halfW: 0.55, top: 2.06, bottom: -0.15, y: floorY, depthIn: 0.35, depthOut: 0.25 });
  // outside: yard, path to the tower stairs
  p.rect(0, 3.6, 3.2, 1.4, 0, { surf: 'leaves', paint: true, worn: 0.35 });
  p.trail([[0, 3.2], [1.6, 7.2], [4.4, 11], [6.2, 13.8], [6.6, 14.55]], { w: 1.4, name: 'toTower' });
  // tower (stairs face the hut); walkable flights in tower-local space
  const tower = P.tower(true);
  const ty = p.heightAt(TX, TZ);
  addMesh(p, tower, TX, TZ, TRY, 0, ty);
  p.keepout(TX, TZ, 7.5);
  const R = P.TOWER.rise, F = P.TOWER.floor;
  const toLocal = (x, z) => { const dx = x - TX, dz = z - TZ, c = Math.cos(TRY), s = Math.sin(TRY); return { lx: dx * c - dz * s, lz: dx * s + dz * c }; };
  const W = (lx, lz) => lp(TX, TZ, TRY, lx, lz);
  const ramp = (x0, x1, y0) => (x, z) => { const { lx } = toLocal(x, z); const t = Math.max(0, Math.min(1, (lx - x0) / (x1 - x0))); return ty + y0 + R * t; };
  const flat = (y) => () => ty + y;
  const rectL = (lx, lz, hw, hd, h, o = {}) => { const [x, z] = W(lx, lz); return p.rect(x, z, hw, hd, TRY, { h, surf: 'timber', ...o }); };
  rectL(-2.95, 3.45, 0.6, 0.3, flat(0));
  rectL(0, 3.45, 2.6, 0.16, ramp(-2.4, 2.4, 0));
  rectL(0, 4.35, 2.6, 0.16, ramp(2.4, -2.4, R));
  rectL(0, 3.45, 2.6, 0.16, ramp(-2.4, 2.4, 2 * R));
  rectL(2.9, 3.9, 0.36, 0.75, flat(R));
  rectL(-2.9, 3.9, 0.36, 0.75, flat(2 * R));
  rectL(1.8, 2.7, 1.45, 1.05, flat(F));
  rectL(0.8, 1.5, 0.2, 0.4, flat(F), { inside: true });
  rectL(0, 0, 1.2, 1.2, flat(F), { inside: true });
  // the ground stub at the stair foot joins the path
  // cabin: radio on a low desk at foreground-left upon entry
  const deskL = [-0.65, 0.95];
  const desk = P.table(1.1, 0.5, 0.62);
  const [dx, dz] = W(...deskL); p.put(desk, dx, dz, { y: ty + F, ry: TRY });
  p.box(dx, dz, 0.58, 0.28, TRY, { y0: ty + F - 0.5, y1: ty + F + 0.7 });
  const rad = P.radio(true, false); p.put(rad, ...W(-0.75, 0.95), { y: ty + F + 0.65, ry: TRY });
  const cont = P.waterCan(); p.put(cont, ...W(-0.25, 1.05), { y: ty + F, ry: TRY }); cont.scale.set(0.8, 0.6, 0.8);
  const scratch = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), M.tex('scratch', TEX.text('scratch', ['I could see the road from here yesterday.'], { w: 256, h: 48, bgImage: TEX.timber(0).image, color: '#c9c0a6', size: 13, weight: 400, font: 'Georgia, serif' })));
  const [scx, scz] = W(-1.44, -0.6); scratch.rotation.y = TRY + Math.PI / 2; p.put(scratch, scx, scz, { y: ty + F + 1.05 });
  const rp = (() => { const [x, z] = W(-0.75, 0.95); return { x, z, y: ty + F + 0.78 }; })();
  p.interact({ id: 'radio', ...rp, r: 0.25, hold: 1, label: () => G.story.flags.radioDone ? 'Radio' : 'Use radio (hold)', action: () => G.story.lookoutRadio() });
  p.interact({ id: 'water', ...(() => { const [x, z] = W(-0.25, 1.05); return { x, z, y: ty + F + 0.3 }; })(), r: 0.25, label: () => 'Refill water', action: () => G.inv.refill('sealed water container') });
  p.interact({ id: 'scratch', x: scx, y: ty + F + 1.05, z: scz, r: 0.25, label: () => 'Read scratches', action: () => G.story.readDoc('towerScratch') });
  p.trigger({ id: 'cabin', k: 'circ', x: TX, z: TZ, r: 1.6, onEnter: () => { if (G.player.pos.y > ty + F - 0.5) G.story.reachCabin(); } });
  p.radioPos = rp;
  p.cabinY = ty + F;
  // the descent: loops back to the hut until the radio has been used
  const d = p.trail([[-1.5, 4.2], [-6, 7.2], [-11, 9.8], [-16.5, 10.6]], { w: 1.5, name: 'descent' });
  p.mouthAtEnd(d, 'descent');
  const db = p.trail([[17, 5.5], [12, 5.2], [7.5, 4.6], [3.1, 3.8]], { w: 1.5, name: 'descentBack' });
  p.mouthAtStart(db, 'descentBack');
  p.trigger({ id: 'out', k: 'circ', x: 0, z: 3.4, r: 2.2, onEnter: () => G.story.reachHut() });
  p.spawn = { x: 0, z: 4, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- 18 final bridge clearing
export function buildFinal() {
  const p = forest('final', {
    name: 'Final Bridge', ambience: 'creek', amp: 0.5, fogScale: 1.15,
    fogTint: { color: 0x4a4e58, amount: 0.35 },
    scatter: { spacing: 3.3, ferns: 120, rocks: 28, logs: 5 },
  });
  p.creek([[-48, 2], [-28, 0.6], [-12, -0.6], [0, 0], [12, 0.8], [28, -0.4], [48, 0.8]], { w: 3.4, depth: 0.6 });
  const s = p.trail([[0, 22.5], [0.4, 15], [-0.5, 9], [-0.2, 5.2], [0, 3.6]], { w: 1.6, name: 'entry' });
  p.mouthAtStart(s, 'entry');
  const far = p.trail([[0, -3.6], [0.3, -9], [-1, -15], [0.5, -21], [1, -28.5]], { w: 1.6, name: 'far' });
  p.mouthAtEnd(far, 'far');
  const bank = p.trail([[-0.4, 5.3], [-3.4, 4.6], [-8, 3.9], [-13, 3.5], [-18.4, 3.9]], { w: 1.0, worn: 0.5, walkR: 0.65, name: 'bank' });
  p.mouthAtEnd(bank, 'bank', { walkR: 0.65 });
  const deckY = Math.max(p.heightAt(0, 3.3), p.heightAt(0, -3.3)) + 0.1;
  p.put(P.footbridge(), 0, 0, { y: deckY });
  p.rect(0, 0, 0.4, 3.45, 0, { h: () => deckY, surf: 'timber' });
  p.keepout(0, 0, 4);
  addMesh(p, P.yStone(1), -3.0, 6.7, -0.25, -0.2); p.circ(-3.0, 6.7, 1.1);
  // a tree belt hides the road beyond; traffic-like sound and pale fog there
  for (let x = -14; x <= 14; x += 2.4) p.inst(KIT.conifer[3](), x + Math.sin(x) * 0.6, -32 - Math.cos(x) * 1.2, { s: 1.2, ry: x });
  p.emitter({ type: 'traffic', x: 0, y: 1, z: -45, gain: 1 });
  p.emitter({ type: 'creek', x: -10, y: 0, z: -0.5, gain: 0.9 });
  p.emitter({ type: 'creek', x: 6, y: 0, z: 0.4, gain: 0.6 });
  p.trigger({ id: 'arrive', k: 'circ', x: 0, z: 12, r: 4, onEnter: () => G.story.reachFinalBridge() });
  p.interact({ id: 'stone', x: -3.0, y: p.heightAt(-3, 6.7) + 0.9, z: 7.4, r: 0.8, label: () => 'Inspect stone', action: () => G.story.inspect('ystone') });
  p.interact({ id: 'rail', x: 0.74, y: deckY + 1.0, z: -2.25, r: 0.4, label: () => 'Inspect rail', action: () => G.ui.toast('The same missing section of rail. The same grey break.') });
  p.spawn = { x: 0, z: 14, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- bank network (Ending B route; C spur)
export function buildBank() {
  const creekPts = [[-6.5, 22], [-5.2, 12], [-4.6, 3], [-4.6, -6], [-6, -16], [-9, -26], [-12, -36]];
  const p = forest('bank', {
    name: 'Final Bank Trail', ambience: 'creek', amp: 0.6, fogScale: 1.1,
    fogTint: { color: 0x4a4e58, amount: 0.3 },
    scatter: { spacing: 3.2, ferns: 140, rocks: 30, logs: 6 },
  });
  const ck = p.creek(creekPts, { w: 2.8, depth: 0.55, speed: 1.4 });
  const e = p.trail([[0, 20.5], [0.3, 15.5], [0, 12]], { w: 1.4, name: 'entry' });
  p.mouthAtStart(e, 'entry');
  p.area(0, 12, 1.8, { worn: 0.4 });
  const fi = p.trail([[12.5, 15.4], [7, 14.2], [2.6, 12.8], [0.4, 12.1]], { w: 1.1, name: 'forkIn' });
  p.mouthAtStart(fi, 'forkIn');
  // left fork: beside the Y-cracked stone, creek immediately on the left, downstream
  p.trail([[0, 12], [-2.2, 8], [-2.6, 2], [-2.3, -4], [-1.9, -8.2]], { w: 1.1, worn: 0.55, walkR: 0.65, name: 'left' });
  addMesh(p, P.yStone(0.85), -0.8, 9.6, 0.5, -0.15); p.circ(-0.8, 9.6, 0.85);
  // right fork: loops
  const wr = p.trail([[0, 12], [3.6, 8.2], [7.6, 5.6], [12.2, 4.6], [17.4, 5.6]], { w: 1.4, name: 'wrong' });
  p.mouthAtEnd(wr, 'wrong');
  // scarred beech, pale scar facing the correct (right) turn
  addMesh(p, P.scarredBeech(9), -0.7, -9.6, Math.PI / 2, -0.1); p.circ(-0.7, -9.6, 0.75); p.keepout(-0.7, -9.6, 2);
  const on = p.trail([[-1.9, -8.2], [-2.9, -14], [-4.2, -20], [-6.8, -26.5]], { w: 1.1, name: 'creekOn' });
  p.mouthAtEnd(on, 'creekOn');
  const turn = p.trail([[-1.9, -8.2], [1.6, -10.4], [6, -11.6], [11, -12.4], [15.6, -12.8]], { w: 1.2, name: 'turn' });
  // barred survey post after 18 m
  addMesh(p, P.barredPost(), 16.5, -11.5, -0.3); p.circ(16.5, -11.5, 0.15);
  // continue past the post through the low slate gap → road after ~30 m
  const gap = p.trail([[15.6, -12.8], [20, -13.6], [24, -15.6], [27.5, -19.6], [30, -25], [31, -31.5]], { w: 1.2, name: 'gap', surf: 'slate' });
  p.mouthAtEnd(gap, 'road');
  for (const [x, z, k, s] of [[21.2, -11.8, 2, 1.25], [21.6, -15.6, 5, 1.1], [23.5, -12.9, 3, 0.9], [24.2, -17.6, 0, 1.0]]) p.inst(KIT.rock[k](), x, z, { s, ry: x, dy: -0.1 });
  // the wide CAR PARK spur
  const spur = p.trail([[15.6, -12.8], [16.2, -17], [14.6, -22.6], [11.6, -27.6], [8, -31.4]], { w: 2.5, worn: 1.3, name: 'spur' });
  p.mouthAtEnd(spur, 'spur');
  addMesh(p, P.carParkSign(), 14.3, -15.2, -0.35);
  p.circ(14.3, -15.2, 0.15);
  // drifting leaves downstream (visible creek segment)
  const leaves = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), M.leafSprite()); m.rotation.x = -Math.PI / 2;
    m.userData.s = i / 14; leaves.push(m); p.group.add(m);
  }
  const L = (() => { let s = 0; for (let i = 0; i < creekPts.length - 1; i++) s += Math.hypot(creekPts[i + 1][0] - creekPts[i][0], creekPts[i + 1][1] - creekPts[i][1]); return s; })();
  p.dyn.push((dt) => {
    for (const m of leaves) {
      m.userData.s = (m.userData.s + dt * 0.55 / L) % 1;
      let d = m.userData.s * L;
      for (let i = 0; i < creekPts.length - 1; i++) {
        const [ax, az] = creekPts[i], [bx, bz] = creekPts[i + 1]; const sl = Math.hypot(bx - ax, bz - az);
        if (d <= sl) { const t = d / sl; const x = ax + (bx - ax) * t + Math.sin(m.userData.s * 40) * 0.3, z = az + (bz - az) * t; m.position.set(x, p.heightAt(x, z) + ck.water + 0.01, z); m.rotation.z = m.userData.s * 20; break; }
        d -= sl;
      }
      m.updateMatrixWorld(true);
    }
  });
  p.emitter({ type: 'creek', x: -4.6, y: 0, z: 4, gain: 1 });
  p.emitter({ type: 'creek', x: -6, y: 0, z: -16, gain: 0.8 });
  p.interact({ id: 'stone', x: -0.8, y: p.heightAt(-0.8, 9.6) + 0.8, z: 10.3, r: 0.75, label: () => 'Inspect stone', action: () => G.story.inspect('ystone') });
  p.interact({ id: 'beech', x: -0.05, y: p.heightAt(-0.1, -9.6) + 2, z: -9.6, r: 0.7, label: () => 'Inspect dead tree', action: () => G.story.inspect('beech') });
  p.interact({ id: 'post', x: 16.5, y: p.heightAt(16.5, -11.5) + 0.6, z: -11.45, r: 0.3, label: () => 'Inspect post', action: () => G.story.inspect('barredPost') });
  p.spawn = { x: 0, z: 16, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- the rural road at dawn (Ending B)
export function buildRoad() {
  const p = forest('road', {
    name: 'Dawn Road', ambience: 'road', amp: 0.3,
    scatter: { spacing: 4.2, conifer: 0.6, ferns: 40, rocks: 8, logs: 2, mask: (x, z) => z > 6 },
  });
  const t = p.trail([[0, 31], [0.5, 23], [0, 15], [0, 4.2]], { w: 1.4, name: 'entry' });
  p.mouthAtStart(t, 'entry');
  p.rect(0, 1.2, 14, 3.0, 0, { surf: 'asphalt' });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 6.6), M.asphalt()); road.rotation.x = -Math.PI / 2;
  road.material.map.repeat.set(40, 1.4);
  p.put(road, 0, 0.5, { dy: 0.05 });
  for (let x = -60; x <= 60; x += 5) { const l = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.12), M.flat(0xbdb9a6)); l.rotation.x = -Math.PI / 2; p.put(l, x, 0.5, { dy: 0.06 }); }
  for (let x = -40; x <= 40; x += 2.4) { const post = new THREE.Mesh(box(0.1, 1.0, 0.1), M.timber(1)); p.put(post, x, -4.4, { dy: 0.5 }); }
  const wire = new THREE.Mesh(box(80, 0.03, 0.03), M.flat(0x55554f)); p.put(wire, 0, -4.4, { dy: 0.9 });
  for (let x = -100; x <= 100; x += 3) p.keepout(x, 0.5, 4);
  p.trigger({ id: 'road', k: 'circ', x: 0, z: 2.5, r: 3.4, onEnter: () => G.story.ending('B') });
  p.spawn = { x: 0, z: 20, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- the drive (Ending A)
export function buildDrive() {
  const p = forest('drive', {
    name: 'Bellwether Road', ambience: 'road', amp: 0.2,
    bounds: { x0: -30, x1: 30, z0: -170, z1: 20 },
    scatter: { spacing: 3.8, conifer: 0.8, ferns: 30, rocks: 10, logs: 2, extraClear: 1 },
  });
  p.trail([[0, 10], [0, -165]], { w: 8, worn: 0, surf: 'none', walk: true });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 190), M.asphalt()); road.rotation.x = -Math.PI / 2;
  p.put(road, 0, -78, { dy: 0.05 });
  for (let z = 5; z > -165; z -= 6) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.4), M.flat(0xbdb9a6)); l.rotation.x = -Math.PI / 2; p.put(l, 0, z, { dy: 0.06 }); }
  addMesh(p, P.roadsideSign(), 4.6, -68, -Math.PI * 0.08);
  const car = P.car(); p.put(car, -1.6, 0, { dy: 0.02 });
  p.userData = { car };
  p.spawn = { x: -1.6, z: 0, yaw: 0 };
  return p.finalize();
}
