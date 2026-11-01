// Act II / learning what persists: sign junction, dead-tree clearing, ranger shelter.
// Act III opening: lookout ridge (contradictory tower bearings).
import { forest, G, KIT, M, THREE, lp, addMesh, inView } from './common.js';
import * as P from '../props.js';
import { polyDist, smooth } from '../noise.js';
import { mergeParts, beam, cyl } from '../geo.js';

// ---------------------------------------------------------------- 07 sign junction
export function buildJunction() {
  const creekPts = [[17, 14], [13.6, 3], [12, -7], [11.8, -16], [13, -27]];
  const p = forest('junction', {
    name: 'Sign Junction', ambience: 'forest', amp: 0.6,
    height: (x, z, n) => {
      let h = n.fbm(x * 0.04, z * 0.04) * 1.2;
      const d = polyDist(x, z, creekPts).d;
      h -= 2.2 * (1 - smooth((d - 1) / 6)); // hollow below the narrow path
      if (z < -17 && Math.abs(x) < 9) h -= Math.min(9, (-17 - z) * 1.2); // overlook drop
      return h;
    },
    scatter: { spacing: 3.2, ferns: 120, rocks: 26, logs: 6, mask: (x, z) => !(z < -15 && Math.abs(x) < 10) },
  });
  p.creek(creekPts, { w: 2.6, depth: 0.45 });
  p.area(0, 0, 3.4, { worn: 0.5 });
  const s = p.trail([[0, 16.5], [0.4, 9.5], [0, 3.5], [0, 0]], { w: 1.6, name: 'south' });
  p.mouthAtStart(s, 'south');
  const ranger = p.trail([[-0.6, -0.9], [-4, -5], [-9, -8.6], [-14, -13], [-17, -19], [-17.2, -26], [-14.4, -31.5]], { w: 2.5, worn: 1.3, name: 'ranger' });
  p.mouthAtEnd(ranger, 'ranger');
  p.trail([[0, -1.5], [0.3, -6], [-0.4, -11], [0.4, -15.4]], { w: 1.4, name: 'lookout' });
  p.area(0.5, -16.4, 2.0, { worn: 0.4 });
  const creek = p.trail([[1.2, -0.8], [4, -3.6], [6.6, -7.8], [8.2, -12.6], [8.7, -18], [7.4, -23.6]], { w: 1.0, worn: 0.55, walkR: 0.65, name: 'creek' });
  p.mouthAtEnd(creek, 'creek', { walkR: 0.7 });
  // signpost at the left third: arms point at actual mouths, labels unreliable
  const sp = P.signpost([
    { text: 'RANGER STATION', angle: Math.PI - 0.75 },
    { text: 'LOOKOUT', angle: Math.PI / 2 },
    { text: 'CREEK', angle: 0.75 },
  ], { initials: true, branch: true });
  addMesh(p, sp, -1.7, -0.5, 0);
  p.circ(-1.7, -0.5, 0.25);
  // overlook rail at the end of the LOOKOUT path
  const rail = new THREE.Group();
  for (let i = 0; i < 5; i++) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), M.timber(1)); post.position.set(-1.5 + i * 0.85, 0.55, 0); rail.add(post); }
  const rr = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.08), M.timber(0)); rr.position.set(0.2, 1.0, 0); rail.add(rr);
  addMesh(p, rail, 0.4, -18.1, 0);
  p.interact({ id: 'post', x: -1.7, y: p.heightAt(-1.7, -0.5) + 1.3, z: -0.42, r: 0.35, label: () => 'Inspect signpost', action: () => G.story.inspect('signpost') });
  p.interact({ id: 'branch', x: -1.2, y: p.heightAt(-1.2, 0.1) + 0.15, z: 0.1, r: 0.4, label: () => 'Inspect branch', action: () => G.ui.toast('A snapped forked branch at the foot of the post.') });
  p.emitter({ type: 'creek', x: 12.4, y: 0, z: -6, gain: 1.0 });
  p.emitter({ type: 'creek', x: 12, y: 0, z: -18, gain: 0.7 });
  p.trigger({ id: 'overlook', k: 'circ', x: 0.5, z: -16.4, r: 2.4, onEnter: () => G.story.junctionOverlook() });
  p.trigger({ id: 'centre', k: 'circ', x: 0, z: 0, r: 4.2, onEnter: () => G.story.junctionCentre(), onStay: (dt) => G.story.junctionPause(dt) });
  p.spawn = { x: 0, z: 9, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- 08 dead-tree clearing (18 m)
export function buildClearing() {
  const p = forest('clearing', {
    name: 'Dead-Tree Clearing', ambience: 'forest', amp: 0.5,
    colorFn: (x, z, c) => { if (z > 7 && z < 13 && Math.abs(x) < 4) c.lerp(new THREE.Color(0x2f2a22), 0.5 * (1 - Math.abs(x) / 4)); },
    scatter: { spacing: 3.2, ferns: 110, rocks: 18, logs: 5 },
  });
  p.area(0, 0, 9, { worn: 0.3 });
  const south = p.trail([[0, 8.5], [0.5, 14], [-0.5, 20], [0.8, 26.5]], { w: 1.6, name: 'south' });
  p.mouthAtEnd(south, 'south');
  const east = p.trail([[8.5, 0], [13, -0.6], [17.5, -2.6], [21, -6.6], [22.4, -12], [21.4, -17.5]], { w: 1.6, name: 'east' });
  p.mouthAtEnd(east, 'east');
  const west = p.trail([[-8.5, 0], [-13.5, 0.7], [-18, 2.9], [-21.4, 6.9], [-22.8, 12]], { w: 1.4, name: 'west' });
  p.mouthAtEnd(west, 'west');
  const north = p.trail([[0, -8.5], [0.4, -13.5], [-0.8, -18.5], [0.8, -24], [3.2, -29.5]], { w: 1.6, name: 'north' });
  p.mouthAtEnd(north, 'north');
  // dark spruce on the west exit
  for (let i = 0; i < 14; i++) {
    const t = i / 13; const x = -9 - t * 14, z = 0.5 + t * 10;
    for (const side of [-1, 1]) p.inst(KIT.conifer[3](), x + side * 2.6 * (0.8 + (i % 3) * 0.2), z + side * 2.2, { s: 1.15, ry: i });
  }
  p.keepout(-15, 3, 3);
  // the dead beech: 9 m, scar facing the south arrival
  const tree = P.scarredBeech(9);
  addMesh(p, tree, 0, 0, 0, -0.1);
  p.circ(0, 0, 0.75);
  // split slate boulder marks east, barred post marks north
  addMesh(p, P.yStone(1), 9.6, 1.9, -1.2, -0.2); p.circ(9.6, 1.9, 1.1); p.keepout(9.6, 1.9, 1.8);
  addMesh(p, P.barredPost(), 1.35, -10.0, 0.1); p.circ(1.35, -10, 0.15);
  p.interact({ id: 'tree', x: 0, y: p.heightAt(0, 0.7) + 2, z: 0.62, r: 0.7, label: () => 'Inspect dead tree', action: () => G.story.inspect('beech') });
  p.interact({ id: 'post', x: 1.35, y: p.heightAt(1.35, -10) + 0.6, z: -9.95, r: 0.3, label: () => 'Inspect post', action: () => G.story.inspect('barredPost') });
  p.interact({ id: 'stone', x: 9.6, y: p.heightAt(9.6, 1.9) + 0.9, z: 2.6, r: 0.9, label: () => 'Inspect stone', action: () => G.story.inspect('ystone') });
  p.trigger({ id: 'enter', k: 'circ', x: 0, z: 0, r: 8, onEnter: () => G.story.reachClearing() });
  p.spawn = { x: 0, z: 7, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- 09-10 ranger shelter (exterior + interior)
export function buildShelter() {
  const SX = -0.7, SZ = 0;
  const p = forest('shelter', {
    name: 'Ranger Shelter', ambience: 'forest', amp: 0.5,
    height: (x, z, n) => {
      const d = Math.max(Math.abs(x - SX) - 3.5, Math.abs(z - SZ) - 3.5, 0);
      return n.fbm(x * 0.04, z * 0.04) * 1.0 * smooth(d / 6);
    },
    scatter: { spacing: 3.2, ferns: 90, rocks: 16, logs: 5 },
  });
  const t = p.trail([[0, 22.5], [0.6, 16], [-0.3, 10], [0.4, 5.6], [0, 4.0]], { w: 1.6, name: 'approach' });
  p.mouthAtStart(t, 'approach');
  p.rect(0, 3.9, 3.0, 1.1, 0, { surf: 'leaves', paint: true, worn: 0.4 });
  p.keepout(SX, SZ, 5);
  const sh = P.shelter();
  addMesh(p, sh, SX, SZ, 0);
  const gy = sh.position.y; const floorY = gy + 0.32;
  p.floorY = floorY;
  // interior and doorway (walls are the bounds of these walkable rects)
  p.rect(SX, SZ - 0.05, 2.05, 1.55, 0, { h: () => floorY, surf: 'timber', inside: true, refuge: 'shelter' });
  const door = sh.userData.doorPivot;
  p.doorOpen = false;
  p.doorT = 0;
  p.rect(0, 2.0, 0.16, 0.55, 0, { h: () => floorY, surf: 'timber', inside: true, enabled: () => p.doorOpen || p.doorT > 0.7 });
  // furniture: table + map on the left, stove on the right, bench at rear under the window
  const tb = P.table(1.4, 0.8); p.put(tb, SX - 0.9, SZ - 0.15, { y: floorY }); p.box(SX - 0.9, SZ - 0.15, 0.72, 0.42, 0, { y0: floorY - 1, y1: floorY + 0.8 });
  const mp = P.mapSheet(); p.put(mp, SX - 1.05, SZ - 0.2, { y: floorY + 0.79, ry: 0.1 });
  const lb = P.notebookProp(false); p.put(lb, SX - 0.45, SZ + 0.05, { y: floorY + 0.79, ry: -0.3 });
  lb.scale.set(1.6, 1.6, 1.6);
  const sv = P.stove(); p.put(sv, SX + 1.85, SZ - 1.15, { y: floorY }); p.circ(SX + 1.85, SZ - 1.15, 0.38);
  const bn = P.bench(2.0); p.put(bn, SX - 1.1, SZ - 1.62, { y: floorY }); p.box(SX - 1.1, SZ - 1.62, 1.0, 0.22, 0, { y0: floorY - 1, y1: floorY + 0.5 });
  const rd = P.radio(false, true); p.put(rd, SX + 0.75, SZ - 1.7, { y: floorY + 0.48 });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.3), M.timber(0)); p.put(shelf, SX + 0.75, SZ - 1.75, { y: floorY + 0.46 });
  p.box(SX + 0.75, SZ - 1.7, 0.35, 0.18, 0, { y0: floorY - 1, y1: floorY + 0.7 });
  const can = P.waterCan(); p.put(can, SX + 1.2, SZ - 0.3, { y: floorY }); p.circ(SX + 1.2, SZ - 0.3, 0.2, { y0: floorY - 1, y1: floorY + 0.5 });
  const bat = P.batteryPack(); p.put(bat, SX - 1.7, SZ - 1.6, { y: floorY + 0.48 });
  const coat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.12), M.flat(0x2e3a2c)); p.put(coat, SX - 2.2, SZ - 1.85, { y: floorY + 1.3 });
  // barred post beside the approach (stable post)
  addMesh(p, P.barredPost(), 1.4, 8.0, 0.2); p.circ(1.4, 8.0, 0.15);
  // stove pool after ignition; cool window light
  p.light({ x: SX + 1.85, y: floorY + 0.6, z: SZ - 0.8, color: 0xff8c48, intensity: 2.6, distance: 4.8, decay: 1, flicker: true, cond: () => !!G.story.flags.stoveLit });
  p.dyn.push(() => { sv.userData.window.material = G.story.flags.stoveLit ? M.emissive(0xd2702e) : M.flat(0x15100c); });
  p.dyn.push((dt) => {
    // door swing and spring hinge (closes behind you once you are well inside)
    const target = p.doorOpen ? 1 : 0;
    p.doorT += Math.sign(target - p.doorT) * Math.min(Math.abs(target - p.doorT), dt * 1.6);
    door.rotation.y = p.doorT * 1.65; door.updateMatrixWorld(true);
    const pl = G.player;
    const inside = G.world.current === p && pl.pos.y > floorY - 0.05 && pl.pos.z < SZ + 0.9 && Math.abs(pl.pos.x - SX) < 2.3;
    if (p.doorOpen && inside) { p.insideT = (p.insideT || 0) + dt; if (p.insideT > 2.5) { p.doorOpen = false; G.audio.sfx('door', { pos: [0, floorY + 1, 2] }); G.story.shelterDoorClosed(); } }
    else p.insideT = 0;
  });
  const dy = floorY + 1.0;
  p.interact({ id: 'door', x: 0.0, y: dy, z: 2.0, r: 0.55, label: () => p.doorOpen ? 'Close door' : 'Open door', action: () => { p.doorOpen = !p.doorOpen; G.audio.sfx('door', { pos: [0, dy, 2] }); if (!p.doorOpen) G.story.shelterDoorClosed(); else G.story.shelterDoorOpened(); } });
  p.interact({ id: 'log', x: SX - 0.45, y: floorY + 0.82, z: SZ + 0.05, r: 0.22, label: () => 'Read logbook', action: () => G.story.readRangerLog() });
  p.interact({ id: 'map', x: SX - 1.05, y: floorY + 0.8, z: SZ - 0.2, r: 0.25, label: () => 'Read trail sheet', action: () => G.story.readDoc('trailSheet') });
  p.interact({ id: 'radio', x: SX + 0.75, y: floorY + 0.62, z: SZ - 1.65, r: 0.25, label: () => 'Try radio', action: () => G.story.tryShelterRadio() });
  p.interact({ id: 'stove', x: SX + 1.85, y: floorY + 0.5, z: SZ - 0.9, r: 0.35, label: () => G.story.flags.stoveLit ? 'Warm your hands' : 'Light stove', action: () => G.story.stove() });
  p.interact({ id: 'can', x: SX + 1.2, y: floorY + 0.5, z: SZ - 0.3, r: 0.25, label: () => 'Refill water', action: () => G.inv.refill('shelter water can') });
  p.interact({ id: 'battery', x: SX - 1.7, y: floorY + 0.52, z: SZ - 1.6, r: 0.15, label: () => G.story.flags.batShelter ? null : 'Take battery pack', action: () => { G.story.takeBattery('batShelter'); bat.visible = false; } });
  p.dyn.push(() => { if (G.story.flags.batShelter && bat.visible) bat.visible = false; });
  p.interact({ id: 'bench', x: SX - 1.1, y: floorY + 0.5, z: SZ - 1.55, r: 0.45, label: () => 'Rest', action: () => G.story.rest(G.story.flags.stoveLit ? 'fire' : 'shelter') });
  p.interact({ id: 'post', x: 1.4, y: p.heightAt(1.4, 8) + 0.6, z: 8.05, r: 0.3, label: () => 'Inspect post', action: () => G.story.inspect('barredPost') });
  p.trigger({ id: 'arrive', k: 'circ', x: 0, z: 6, r: 4, onEnter: () => G.story.reachShelter() });
  p.interiorCheck = (x, z, y) => y > floorY - 0.05 && Math.abs(x - SX) < 2.3 && Math.abs(z - SZ) < 1.9;
  p.spawn = { x: 0, z: 12, yaw: 0 };
  p.doorPos = { x: 0, z: 2 };
  return p.finalize();
}

// ---------------------------------------------------------------- 11-12 lookout ridge
export const RIDGE = { A: [1.5, -2], B: [8, -1], pine: [6, -9], tower: [29.3, -87.6] };

function forkedPine() {
  const g = new THREE.Group();
  const parts = [{ geo: cyl(0.22, 0.38, 6.2, 7, { sv: 2 }), mat: 0 }];
  parts.push({ geo: beam(0, 6.0, 0, -0.9, 9.6, 0.2, 0.2, 6), mat: 0 });
  parts.push({ geo: beam(0, 6.0, 0, 0.8, 9.0, -0.2, 0.17, 6), mat: 0 });
  parts.push({ geo: beam(0, 3.4, 0, 1.2, 4.2, 0.3, 0.07, 4), mat: 0 });
  const geo = mergeParts(parts);
  g.add(new THREE.Mesh(geo, [M.bark()]));
  return g;
}

export function buildRidge() {
  const p = forest('ridge', {
    name: 'Lookout Ridge', ambience: 'ridge', amp: 0.8, exposed: true, fogScale: 4.2,
    fogTint: { color: 0x3c4152, amount: 0.55 },
    height: (x, z, n) => {
      let h = n.fbm(x * 0.05, z * 0.05) * 0.9;
      if (z < -12) h -= Math.min(16, (-12 - z) * 0.55 + Math.pow(Math.max(0, -12 - z) / 10, 2) * 2);
      if (z > 6) h -= (z - 6) * 0.18;
      return h;
    },
    bounds: { x0: -38, x1: 48, z0: -42, z1: 34 },
    scatter: { spacing: 3.3, conifer: 0.85, ferns: 70, rocks: 34, logs: 4, mask: (x, z) => !(z < -8 && z > -34 && x > -6 && x < 34) },
  });
  const [Ax, Az] = RIDGE.A, [Bx, Bz] = RIDGE.B;
  const ent = p.trail([[0, 21], [0.5, 14], [-0.6, 8], [0, 3], [Ax, Az]], { w: 1.5, name: 'entry', surf: 'slate' });
  p.mouthAtStart(ent, 'entry');
  p.area(Ax, Az, 2.1, { surf: 'slate', worn: 0.2 });
  p.area(Bx, Bz, 2.0, { surf: 'slate', worn: 0.2 });
  const up = p.trail([[Ax, Az], [2.3, -7], [4.2, -12.4], [7.6, -16.4], [12, -19.6]], { w: 2.2, worn: 1.0, name: 'uphill', surf: 'leaves' });
  p.mouthAtEnd(up, 'uphill');
  const ret = p.trail([[21, 3.2], [15.5, 1.8], [11, 0.2], [Bx, Bz]], { w: 2.0, name: 'ret' });
  p.mouthAtStart(ret, 'ret');
  // occluded lower spurs from both viewpoints, meeting between the split stone and barred post
  p.trail([[Ax, Az], [2.4, 1.6], [4.6, 3.6]], { w: 1.2, name: 'spurA' });
  p.trail([[Bx, Bz], [7.2, 2.0], [5.2, 3.7]], { w: 1.2, name: 'spurB' });
  const low = p.trail([[4.9, 3.6], [6.2, 8], [9.4, 12.5], [14, 15.6], [19.4, 17.2]], { w: 1.4, name: 'lower' });
  p.mouthAtEnd(low, 'lower');
  // outcrop between A and B: blocks the direct sightline swap
  for (const [x, z, k, s] of [[4.8, -0.6, 2, 1.25], [5.4, -2.6, 5, 1.0], [4.4, 1.1, 0, 0.8], [6.0, 0.6, 3, 0.7]]) p.inst(KIT.rock[k](), x, z, { s, ry: x, dy: -0.1 });
  p.keepout(5, -1, 2);
  for (const [x, z, k, s] of [[-3, -5, 2, 1.4], [-1.5, 3.5, 5, 1.0], [10.8, -3.8, 3, 1.2], [-5.5, 1, 0, 1.3], [12.5, 4.2, 1, 1.1]]) p.inst(KIT.rock[k](), x, z, { s, ry: z, dy: -0.15 });
  addMesh(p, P.yStone(0.9), 3.7, 5.0, 0.4, -0.15); p.circ(3.7, 5.0, 1.0);
  addMesh(p, P.barredPost(), 6.4, 4.3, -0.2); p.circ(6.4, 4.3, 0.15);
  // the forked pine on the rock notch
  const [px, pz] = RIDGE.pine;
  addMesh(p, forkedPine(), px, pz, 0.3, -0.1); p.circ(px, pz, 0.5); p.keepout(px, pz, 1.5);
  // valley floor, far hill and the tower (distant presentation; not reachable)
  const [TX, TZ] = RIDGE.tower;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(420, 260), M.flat(0x2a2a26)); floor.rotation.x = -Math.PI / 2;
  p.put(floor, 10, -120, { y: -15.5 });
  const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.tex('hillLitter', null, { color: 0x3a3830 }));
  hill.scale.set(48, 17, 40); p.put(hill, TX, TZ, { y: -15.5 });
  const towerObj = P.tower(false);
  p.put(towerObj, TX, TZ, { y: 1.3, ry: 2.6 });
  const rnd = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
  for (let i = 0; i < 140; i++) {
    const a = Math.abs(rnd(i)) * Math.PI * 2, d = 6 + Math.abs(rnd(i + 99)) * 70;
    const x = TX + Math.cos(a) * d * 1.3, z = TZ + Math.sin(a) * d * 0.9;
    if (z > -40) continue;
    const r2 = ((x - TX) / 48) ** 2 + ((z - TZ) / 40) ** 2;
    const y = r2 < 1 ? -15.5 + 17 * Math.sqrt(1 - r2) : -15.5;
    if (Math.hypot(x - TX, z - TZ) < 16) continue;
    p.inst(KIT.conifer[i % 3](), x, z, { y: y - 0.5, s: 0.45 + Math.abs(rnd(i + 7)) * 0.25, ry: i });
  }
  p.trigger({ id: 'A', k: 'circ', x: Ax, z: Az, r: 2.4, onEnter: () => G.story.ridgeView('A') });
  p.trigger({ id: 'B', k: 'circ', x: Bx, z: Bz, r: 2.4, onEnter: () => G.story.ridgeView('B') });
  p.interact({ id: 'stone', x: 3.7, y: p.heightAt(3.7, 5) + 0.8, z: 5.6, r: 0.8, label: () => 'Inspect stone', action: () => G.story.inspect('ystone') });
  p.interact({ id: 'post', x: 6.4, y: p.heightAt(6.4, 4.3) + 0.6, z: 4.35, r: 0.3, label: () => 'Inspect post', action: () => G.story.inspect('barredPost') });
  p.watcherSpot = { x: -24, z: -6, trigger: { x: Ax, z: Az, r: 3 } };
  p.spawn = { x: 0, z: 12, yaw: 0 };
  return p.finalize();
}
