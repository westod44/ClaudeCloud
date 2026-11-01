// Act I / the wrong turn: car park, creek bridge, shortcut gully, dry gully,
// ribbon log loop, cold campsite.
import { forest, G, KIT, M, THREE, lp, addMesh, variantGroup, brush, dropToGround, inView } from './common.js';
import { Place } from '../place.js';
import * as P from '../props.js';
import { fern as fernKit, rock } from '../kit.js';
import { box } from '../geo.js';

// ---------------------------------------------------------------- 01-02 car park / trailhead
export function buildCar() {
  const p = forest('car', { name: 'Car Park', ambience: 'trail', amp: 0.35, scatter: { spacing: 3.6, ferns: 50, rocks: 14, logs: 3 } });
  p.rect(0, -1, 8.5, 6.5, 0, { surf: 'gravel', paint: true });
  p.trail([[3, -6.5], [3.1, -10], [3, -13.5]], { w: 3, worn: 2.4, surf: 'gravel' });
  const t = p.trail([[3, -13.5], [3.5, -18.5], [5.4, -24], [7.6, -29.5], [8.3, -35.5]], { w: 1.5, worn: 0.7, name: 'out' });
  p.mouthAtEnd(t, 'trail');
  // road beyond the lot (visual only)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(140, 6.5), M.asphalt());
  road.rotation.x = -Math.PI / 2; road.material.map.repeat.set(30, 1.5);
  p.put(road, 0, 13.5, { dy: 0.04 });
  const access = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6), M.gravel());
  access.rotation.x = -Math.PI / 2; p.put(access, 0, 8, { dy: 0.03 });
  p.keepout(0, 13.5, 4); p.keepout(-30, 13.5, 4); p.keepout(30, 13.5, 4); p.keepout(0, 8, 3);
  for (let x = -60; x <= 60; x += 4) p.keepout(x, 13.5, 3.6);
  // noticeboard at the left third, trail mouth at the right third
  addMesh(p, P.noticeboard(), -1.2, -8.2, 0);
  p.box(-1.2, -8.2, 1.0, 0.25);
  // split-rail fence along the back of the lot
  for (const [x0, x1] of [[-9, 1.3], [4.7, 9]]) {
    for (let x = x0; x <= x1 + 0.01; x += 2.6) {
      const post = new THREE.Mesh(box(0.14, 1.1, 0.14, { uvWorld: 1 }), M.timber(1)); p.put(post, x, -7.6, { dy: 0.5 });
    }
    for (const y of [0.45, 0.85]) {
      const r = new THREE.Mesh(box(x1 - x0, 0.09, 0.07, { uvWorld: 1 }), M.timber(0)); p.put(r, (x0 + x1) / 2, -7.6, { dy: y });
    }
  }
  // the parked car
  const car = P.car();
  addMesh(p, car, -2, 2.5, 0);
  p.box(-2, 2.5, 0.92, 2.12);
  p.userData = { car };
  const cy = car.position.y;
  const W = (lx, ly, lz) => ({ x: -2 + lx, y: cy + ly, z: 2.5 + lz });
  p.carSeat = { ...W(P.CAR.eye.x, P.CAR.eye.y, P.CAR.eye.z), yaw: 0 };
  const seated = () => !!G.player.seat;
  p.interact({ id: 'reminder', ...W(0.32, 0.93, -0.16), r: 0.12, label: () => seated() ? 'Read note' : null, action: () => G.ui.doc('reminder') });
  p.interact({ id: 'phone', ...W(0.1, 0.8, 0.05), r: 0.12, label: () => seated() ? 'Check phone' : null, action: () => G.ui.doc('phone') });
  p.interact({ id: 'clock', ...W(0.08, 0.86, -0.125), r: 0.08, label: () => seated() ? 'Look at clock' : null, action: () => G.ui.toast('4:17 PM') });
  p.interact({
    id: 'pack', ...W(0.37, 0.95, 0.35), r: 0.22,
    label: () => seated() && !G.story.flags.hasPack ? 'Take backpack' : null,
    action: () => { G.story.set('hasPack', true); car.userData.pack.visible = false; G.audio.sfx('zip'); G.ui.toast('Backpack: flashlight, spare battery pack, water, snack, lighter, map, phone, notebook.'); },
  });
  p.interact({
    id: 'door', ...W(-0.85, 1.0, 0.25), r: 0.3,
    label: () => {
      if (seated()) return G.story.flags.radioDone ? 'Get out' : 'Get out';
      return 'Get in';
    },
    action: () => G.story.carDoor(),
  });
  p.interact({
    id: 'ignition', ...W(-0.18, 0.78, -0.12), r: 0.12,
    label: () => seated() && G.story.flags.radioDone ? 'Start the car' : null,
    action: () => G.story.ending('A'),
  });
  p.spawnOut = { x: -3.55, z: 2.2, yaw: -0.35 };
  p.spawn = { x: -3.55, z: 2.2, yaw: -0.35 };
  p.interact({ id: 'board', x: -1.2, y: p.heightAt(-1.2, -8.2) + 1.45, z: -8.15, r: 0.7, label: () => 'Read noticeboard', action: () => G.ui.doc('trailhead') });
  p.trigger({ id: 'bird', k: 'circ', x: 4.6, z: -22, r: 3, onEnter: () => G.story.once('bird1', () => G.audio.birdCall(p, 9, 6, -26)) });
  p.ambience = 'trail';
  return p.finalize();
}

// ---------------------------------------------------------------- 03 original creek bridge
export function buildBridge() {
  const p = forest('bridge', {
    name: 'Creek Bridge', ambience: 'creek', amp: 0.5,
    scatter: { spacing: 3.4, ferns: 120, rocks: 30, logs: 6 },
  });
  const creek = p.creek([[-48, 2], [-28, 0.6], [-12, -0.6], [0, 0], [12, 0.8], [28, -0.4], [48, 0.8]], { w: 3.4, depth: 0.6 });
  const south = p.trail([[-4, 24], [-3.4, 17], [-1.6, 10.5], [-0.4, 6], [0, 3.6]], { w: 1.6, name: 'south' });
  p.mouthAtStart(south, 'west');
  const north = p.trail([[0, -3.6], [0.4, -6.5], [2.2, -11], [5.6, -15.5], [10.5, -19.5], [16.5, -22], [22.5, -22.6]], { w: 1.6, name: 'north' });
  p.mouthAtEnd(north, 'east');
  const deckY = Math.max(p.heightAt(0, 3.3), p.heightAt(0, -3.3)) + 0.1;
  const br = P.footbridge();
  p.put(br, 0, 0, { y: deckY });
  p.rect(0, 0, 0.4, 3.45, 0, { h: () => deckY, surf: 'timber' });
  p.keepout(0, 0, 4);
  p.deckY = deckY;
  // the Y-cracked slate stone on the far left bank
  const ys = P.yStone(1); addMesh(p, ys, -3.3, -5.2, 0.15, -0.2); p.circ(-3.3, -5.2, 1.2); p.keepout(-3.3, -5.2, 2);
  // bank rocks
  for (const [x, z, k, s] of [[2.6, 2.6, 0, 0.6], [-2.4, 2.8, 2, 0.5], [3.2, -2.9, 5, 0.55], [-6.5, 2.4, 1, 0.8], [7, -2.4, 3, 0.7], [-9, -2.6, 2, 0.6]]) {
    p.inst(KIT.rock[k](), x, z, { s, ry: x, dy: -0.2 });
  }
  p.emitter({ type: 'creek', x: -11, y: 0, z: -0.6, gain: 1.0 });
  p.emitter({ type: 'creek', x: 0, y: 0, z: 0, gain: 0.8 });
  p.emitter({ type: 'creek', x: 14, y: 0, z: 0.6, gain: 0.7 });
  p.trigger({ id: 'onBridge', k: 'circ', x: 0, z: 0, r: 2.2, onEnter: () => G.story.journal('bridge') });
  p.trigger({ id: 'crossed', k: 'circ', x: 1.4, z: -8.5, r: 3, onEnter: () => G.story.bridgeCrossed() });
  p.interact({ id: 'ystone', x: -3.3, y: p.heightAt(-3.3, -5.2) + 0.9, z: -4.5, r: 0.9, label: () => 'Inspect stone', action: () => G.story.inspect('ystone') });
  p.interact({ id: 'rail', x: 0.74, y: deckY + 1.0, z: -2.25, r: 0.4, label: () => 'Inspect rail', action: () => G.ui.toast('A section of the upper rail is missing. The wood at the break is old and grey.') });
  p.spawn = { x: -3.2, z: 16, yaw: 0.2 };
  return p.finalize();
}

// ---------------------------------------------------------------- shortcut gully (sunken bend)
export function buildGully() {
  const pts = [[0, 13], [0.3, 6.5], [-0.8, 0.5], [-3.6, -5.5], [-6.5, -11], [-6.2, -17], [-3, -22.5], [1.6, -27.5], [3.6, -34]];
  const p = forest('gully', {
    name: 'Shortcut Gully', ambience: 'forest', amp: 0.7,
    height: (x, z, n) => {
      let best = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az; let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz); t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      const sink = 1.5 * (1 - Math.min(1, Math.max(0, (best - 1.2) / 5)));
      const along = Math.max(0, Math.min(1, (13 - z) / 14)) * Math.max(0, Math.min(1, (z + 34) / 14));
      return n.fbm(x * 0.04, z * 0.04) * 1.6 - sink * along;
    },
    scatter: { spacing: 3.1, conifer: 0.75, ferns: 130, rocks: 40, logs: 8 },
  });
  const t = p.trail(pts, { w: 1.5, name: 'main' });
  p.mouthAtStart(t, 'S');
  p.mouthAtEnd(t, 'L');
  for (const [x, z, k, s] of [[-2.2, -2, 0, 0.8], [-1.2, -8.5, 2, 0.9], [-9, -12, 3, 1.1], [-3.4, -14, 5, 0.9], [-4.9, -20, 1, 1.0], [0.1, -19.5, 0, 0.7]]) p.inst(KIT.rock[k](), x, z, { s, ry: x * 3, dy: -0.15 });
  // passing the occluding bend springs the trap: behind you, the bridge is no longer there
  p.trigger({ id: 'bend', k: 'circ', x: -6.4, z: -14, r: 3.2, onEnter: () => G.story.gullyBend() });
  p.spawn = { x: 0.3, z: 6, yaw: 0 };
  return p.finalize();
}

// ---------------------------------------------------------------- the dry gully where the bridge should be
export function buildDry() {
  const p = forest('dry', { name: 'Shortcut Gully', variant: 'dry', ambience: 'forest', amp: 0.5, scatter: { spacing: 3.4, ferns: 80, rocks: 22 } });
  p.creek([[-48, 1.5], [-26, 0.4], [-12, -0.5], [0, 0], [12, 0.7], [26, -0.3], [48, 0.6]], { w: 3.4, depth: 0.75, visible: false });
  const t = p.trail([[0, -14], [0.4, -8.5], [0, -3.4], [0, 3.4], [-1.3, 8.5], [-4.6, 13.8], [-9.6, 17.6], [-15.4, 19.6]], { w: 1.6, name: 'main' });
  p.mouthAtStart(t, 'back');
  p.mouthAtEnd(t, 'on');
  // dry stones in the bed
  for (let i = 0; i < 26; i++) {
    const x = -22 + i * 1.7 + Math.sin(i * 3.1) * 0.6, z = Math.sin(i * 0.9) * 0.6;
    if (Math.abs(x) < 1.3) continue;
    p.inst(KIT.rock[i % 6](), x, z, { s: 0.25 + (i % 4) * 0.08, ry: i, dy: -0.05 });
  }
  p.trigger({ id: 'dry', k: 'circ', x: 0, z: 0, r: 3, onEnter: () => G.story.dryGully() });
  p.spawn = { x: 0, z: -9, yaw: Math.PI };
  return p.finalize();
}

// ---------------------------------------------------------------- 04-05 the ribbon log (45 m loop)
export function buildLog() {
  const p = forest('log', { name: 'Ribbon Log Trail', ambience: 'forest', amp: 0.8, scatter: { spacing: 3.0, conifer: 0.62, ferns: 140, rocks: 28, logs: 6 } });
  const loop = p.trail([[3.5, 12.5], [3, 6.5], [1.2, 1], [0, -4], [-0.6, -9], [-2.2, -13.5], [-5.5, -18], [-10, -21.5], [-15.5, -23.5], [-21, -23], [-25.5, -20.5], [-28.6, -16.4]], { w: 1.8, worn: 0.85, name: 'loop' });
  p.mouthAtStart(loop, 'entry');
  p.mouthAtEnd(loop, 'loop');
  // ribbon log: crown end raised, crouch gap under the right-hand prong
  const LX = 3.0, LZ = -8, LR = 0.25;
  const log = P.ribbonLog();
  addMesh(p, log, LX, LZ, LR, -0.05);
  const W = (lx, lz) => lp(LX, LZ, LR, lx, lz);
  const [tx, tz] = W(0, 0.8); p.box(tx, tz, 0.45, 2.25, LR);
  const [gx, gz] = W(0, -2.0);
  const gy = p.heightAt(gx, gz);
  p.box(gx, gz, 0.5, 0.6, LR, { y0: gy + 1.2, y1: gy + 3 });
  const [cx, cz] = W(0, -3.15); p.box(cx, cz, 0.65, 0.55, LR);
  const [rx, rz] = W(0.85, -3.0); p.circ(rx, rz, 0.45);
  const [sx, sz] = W(-0.55, -3.55); p.circ(sx, sz, 0.25);
  p.keepout(LX, LZ - 1, 6); p.keepout(1.5, -2, 3.5); p.keepout(0, 3, 2.5);
  // distinctive fern at the root plate
  const [fx, fz] = W(0.6, 3.4); p.inst(KIT.fern[1](), fx, fz, { s: 1.4, ry: 0.5 });
  // the 0.8 m animal track beneath the right-hand prong, usable from the first visit
  const track = p.trail([[-0.2, -9.15], [2.0, -9.75], [4.8, -10.5], [7.6, -11.6], [10.6, -13.9], [13.1, -17.6], [14.6, -22.2]], { w: 0.8, worn: 0.45, walkR: 0.48, name: 'track' });
  p.mouthAtEnd(track, 'track', { walkR: 0.5 });
  // a fern partly screening the track mouth; moved slightly aside on the third arrival (only while unseen)
  const fk = fernKit(1);
  const screen = new THREE.Mesh(fk.geo, fk.mats);
  addMesh(p, screen, 1.05, -9.0, 0.3);
  screen.scale.setScalar(1.5);
  screen.updateMatrixWorld(true);
  p.dyn.push(() => {
    if (G.story.flags.logArrivals >= 3 && !screen.userData.moved && (G.world.current !== p || !inView(screen))) {
      screen.position.x -= 0.65; screen.position.z += 0.55; screen.rotation.y += 0.6; screen.scale.setScalar(1.1);
      screen.updateMatrixWorld(true); screen.userData.moved = true;
    }
  });
  p.emitter({ type: 'creek', x: 6.5, y: 0, z: -12, gain: 0.22, cond: () => G.story.flags.logArrivals >= 3 });
  p.interact({ id: 'ribbon', ...(() => { const [x, z] = W(-0.2, -3.0); return { x, z, y: p.heightAt(x, z) + 2.2 }; })(), r: 0.45, label: () => 'Inspect ribbon', action: () => G.story.inspect('ribbon') });
  p.interact({ id: 'gap', x: gx - 0.3, y: gy + 0.7, z: gz + 0.1, r: 0.5, label: () => G.player.crouched ? null : 'Look under the trunk', action: () => G.ui.toast('There is a narrow track under the broken trunk. You would have to crouch (C).') });
  p.spawn = { x: 3.2, z: 9, yaw: 0.1 };
  return p.finalize();
}

// ---------------------------------------------------------------- 06 / 14 campsite (cold and warm variants)
export function buildCamp(id, warm) {
  const p = forest(id, {
    name: warm ? 'Warm Campsite' : 'Cold Campsite', variant: warm ? 'warm' : 'cold', ambience: warm ? 'camp' : 'forest', amp: 0.45,
    scatter: { spacing: 3.2, ferns: 100, rocks: 22, logs: 5 },
  });
  p.rect(0, 0, 6, 5, 0, { surf: 'leaves', paint: true, worn: 0.3 });
  p.area(0, 0, 5.4, { worn: 0 });
  const entry = p.trail([[0, 17.5], [0.6, 11], [0, 5]], { w: 1.6, name: 'entry' });
  p.mouthAtStart(entry, 'entry');
  const on = p.trail([[0.5, -4.5], [-0.9, -10], [0.8, -15.5], [4, -20], [6.2, -25.5]], { w: warm ? 2.2 : 1.6, worn: warm ? 1.1 : 0.7, name: 'onward' });
  p.mouthAtEnd(on, warm ? 'broad' : 'onward');
  // shared identity: footprint, tent position, stump, mug, stone ring and log arrangement
  const tentObj = P.tent(warm);
  addMesh(p, tentObj, -4.2, -1.2, Math.PI / 2);
  p.box(-4.2, -1.2, 1.2, 1.0);
  const ring = P.fireRing(warm);
  addMesh(p, ring, -1.7, -1.2, 0);
  p.circ(-1.7, -1.2, 0.85);
  const st = P.stumpProp(); addMesh(p, st, 3.6, 2.6, 0.3); p.circ(3.6, 2.6, 0.45);
  const sy = st.position.y + 0.625;
  const mg = P.mug(); p.put(mg, 3.75, 2.5, { y: sy });
  const nb = P.notebookProp(warm); p.put(nb, 3.45, 2.72, { y: sy, ry: 0.4 });
  for (const [x, z, ry] of [[-1.6, 1.5, 0], [1.3, -3.5, 0.5]]) { addMesh(p, P.logSeat(1.9), x, z, ry); p.box(x, z, 0.95, 0.25, ry); }
  // the dry patch under a spruce
  const dry = new THREE.Mesh(new THREE.CircleGeometry(1.3, 9), M.flat(0x4a3a2a)); dry.rotation.x = -Math.PI / 2;
  p.put(dry, 4.8, -3.3, { dy: 0.03 });
  p.inst(KIT.conifer[0](), 6.6, -4.6, { s: 1.0, ry: 1 });
  p.light({ x: -1.7, y: p.heightAt(-1.7, -1.2) + 0.7, z: -1.2, color: 0xff9a52, intensity: warm ? 4.5 : 0, distance: 6.5, decay: 1, flicker: true, cond: () => warm });
  p.interact({ id: 'rest', x: 4.8, y: p.heightAt(4.8, -3.3) + 0.4, z: -3.3, r: 0.9, label: () => 'Rest', action: () => G.story.rest(warm ? 'fire' : 'camp') });
  p.interact({ id: 'mug', x: 3.75, y: sy + 0.06, z: 2.5, r: 0.12, label: () => 'Inspect mug', action: () => G.ui.toast('A chipped green enamel mug. Rainwater in the bottom.') });
  p.interact({ id: 'ring', x: -1.7, y: p.heightAt(-1.7, -1.2) + 0.25, z: -1.2, r: 0.7, label: () => warm ? 'Warm your hands' : 'Inspect fire ring', action: () => warm ? G.story.rest('fire') : G.ui.toast('Seven stones, three pale logs. The ash is soaked through. It will not light.') });
  if (!warm) {
    p.interact({ id: 'notebook', x: 3.45, y: sy + 0.02, z: 2.72, r: 0.16, label: () => 'Read notebook', action: () => G.story.readColdNotebook() });
    const sk = P.mapSheet(); p.put(sk, -1.4, 1.5, { y: p.heightAt(-1.6, 1.5) + 0.41, ry: 0.2 });
    p.interact({ id: 'sketch', x: -1.4, y: p.heightAt(-1.4, 1.5) + 0.42, z: 1.5, r: 0.25, label: () => 'Inspect map sketch', action: () => G.story.readSketch() });
    const bat = P.batteryPack(); addMesh(p, bat, 3.05, 3.25, 0.3);
    p.interact({ id: 'battery', x: 3.05, y: bat.position.y + 0.04, z: 3.25, r: 0.15, label: () => G.story.flags.batCamp ? null : 'Take battery pack', action: () => { G.story.takeBattery('batCamp'); bat.visible = false; } });
    p.dyn.push(() => { if (G.story.flags.batCamp && bat.visible) bat.visible = false; });
    p.interact({ id: 'tent', x: -3.3, y: p.heightAt(-3.3, -1.2) + 0.4, z: -1.2, r: 0.6, label: () => 'Inspect tent', action: () => G.ui.toast('The tent has collapsed. One corner is torn, as if something pulled it outward.') });
    p.trigger({ id: 'arrive', k: 'circ', x: 0, z: 2, r: 4, onEnter: () => G.story.reachColdCamp() });
  } else {
    const pack2 = P.backpack(0x2a3048); addMesh(p, pack2, -3.0, 0.5, -0.4);
    p.interact({ id: 'pack2', x: -3.0, y: pack2.position.y + 0.3, z: 0.5, r: 0.3, label: () => 'Inspect backpack', action: () => G.story.inspectSecondPack() });
    p.interact({ id: 'notebook', x: 3.45, y: sy + 0.02, z: 2.72, r: 0.18, label: () => 'Read notebook', action: () => G.story.readWarmNotebook() });
    p.interact({ id: 'tent', x: -3.2, y: p.heightAt(-3.2, -1.2) + 0.6, z: -1.2, r: 0.6, label: () => 'Look in the tent', action: () => G.ui.toast('Dry inside. A sleeping mat, unrolled. Nobody.') });
    p.emitter({ type: 'fire', x: -1.7, y: 0.4, z: -1.2, gain: 1 });
    p.userData = { flames: ring.userData.flames };
    p.dyn.push((dt) => {
      const f = ring.userData.flames; if (!f) return;
      const t = G.time;
      f.children.forEach((c, i) => { c.scale.y = (1 - i * 0.15) * (0.85 + 0.2 * Math.sin(t * 9 + i * 2) + 0.1 * Math.sin(t * 23 + i)); });
      f.updateMatrixWorld(true);
    });
    // finale: the narrow path beside a barred post, and lap arrival trails (open only after the radio)
    const narrow = p.trail([[5.0, -1.6], [9, -3.6], [13.4, -7.2], [16.6, -12.4]], { w: 1.1, worn: 0.5, walkR: 0.6, name: 'narrow', enabled: () => !!G.story.flags.radioDone });
    p.mouthAtEnd(narrow, 'narrow', { walkR: 0.6 });
    const post = P.barredPost();
    const postG = new THREE.Group(); postG.add(post); post.position.set(5.9, p.heightAt(5.9, -0.7), -0.7); post.rotation.y = -0.9;
    variantGroup(p, postG, () => !!G.story.flags.radioDone);
    const bl = brush(10, -4.4, 2.0, 3); dropToGround(p, bl);
    variantGroup(p, bl, () => !G.story.flags.radioDone);
    const sign = P.carParkSign(); const signG = new THREE.Group(); signG.add(sign);
    sign.position.set(1.9, p.heightAt(1.9, -5.4), -5.4); sign.rotation.y = 0.2;
    variantGroup(p, signG, () => !!G.story.flags.radioDone);
    const wIn = p.trail([[-17.5, 5.5], [-12, 4.2], [-5.6, 2.7]], { w: 1.8, name: 'westIn', enabled: () => !!G.story.flags.radioDone });
    p.mouthAtStart(wIn, 'westIn');
    const eIn = p.trail([[17.5, 5.0], [12, 3.7], [5.8, 2.4]], { w: 1.8, name: 'eastIn', enabled: () => !!G.story.flags.radioDone });
    p.mouthAtStart(eIn, 'eastIn');
    for (const [x, z, s] of [[-12, 4.2, 4], [12, 3.7, 5]]) { const b = brush(x, z, 2.2, s); dropToGround(p, b); variantGroup(p, b, () => !G.story.flags.radioDone); }
    p.trigger({ id: 'arrive', k: 'circ', x: 0, z: 1, r: 4.5, onEnter: () => G.story.reachWarmCamp() });
  }
  p.spawn = { x: 0, z: 8, yaw: 0 };
  return p.finalize();
}
