// Three endings, no menu (bible section 07). Each is reached physically.
import * as THREE from '../vendor/three.module.js';
import { G } from './state.js';
import * as P from './props.js';
import { CREDITS } from './docs.js';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export class Endings {
  constructor() { this.update = null; }

  async play(which) {
    G.mode = 'ending';
    G.saves.queue = null;
    if (which === 'A') await this.road();
    if (which === 'B') await this.longWay();
    if (which === 'C') await this.placeYouWere();
    G.saves.recordEnding(which);
    await this.credits({ A: 'THE ROAD', B: 'THE LONG WAY HOME', C: 'THE PLACE YOU WERE' }[which]);
    this.update = null;
    G.story.endingPlaying = false;
    G.toTitle();
  }

  // Ending A: drive automatically for 12 seconds; the clock still reads 4:17; the sign; fog takes the road.
  async road() {
    const pl = G.player;
    pl.moveLock = true;
    G.audio.sfx('engine');
    G.ui.caption('[the engine turns over]', 2);
    await wait(1800);
    G.ui.black(true, '', 700);
    await wait(800);
    const drive = G.world.get('drive');
    G.world.setCurrent('drive');
    G.world.arrival = null;
    const car = drive.userData.car;
    const startZ = 0;
    car.position.z = startZ; car.updateMatrixWorld(true);
    const seatOf = () => ({ x: car.position.x + P.CAR.eye.x, y: car.position.y + P.CAR.eye.y, z: car.position.z + P.CAR.eye.z, yaw: 0 });
    pl.seat = seatOf(); pl.yaw = 0; pl.pitch = -0.05;
    pl.pos.set(pl.seat.x, car.position.y, pl.seat.z);
    G.ui.black(false, '', 900);
    let t = 0;
    this.update = (dt) => {
      t += dt;
      const v = Math.min(8.5, t * 3.2);
      car.position.z -= v * dt; car.updateMatrixWorld(true);
      pl.seat = { ...seatOf(), yaw: pl.seat.yaw };
      pl.pos.set(pl.seat.x, car.position.y, pl.seat.z);
      drive.fogScale = Math.max(0.12, 1 - Math.max(0, t - 6) * 0.15);
    };
    await wait(5000);
    G.ui.caption('4:17 PM', 2.5);
    await wait(7000);
    G.ui.black(true, '', 1500);
    G.audio.stopEngine();
    await wait(1700);
    drive.fogScale = 1;
  }

  // Ending B: a rural road at cold dawn; an ordinary vehicle stops beyond the route.
  async longWay() {
    const pl = G.player, road = G.world.get('road');
    pl.moveLock = true;
    G.story.lightTarget = 3;
    const v = P.car(0x6c7072);
    v.rotation.y = -Math.PI / 2;
    road.group.add(v);
    let x = -70;
    const y = road.heightAt(-6, -0.8) + 0.05;
    v.position.set(x, y, -0.9); v.updateMatrixWorld(true);
    G.audio.sfx('vehicle', { pos: [x, y + 0.6, -0.9] });
    let t = 0;
    this.update = (dt) => {
      t += dt;
      const target = -6.5;
      const d = target - x;
      const speed = Math.max(0, Math.min(11, d * 0.7));
      x += speed * dt;
      v.position.x = x; v.updateMatrixWorld(true);
      const vn = G.audio.vehicleNode;
      if (vn) { vn.p.positionX.value = x; vn.g.gain.setTargetAtTime(0.25 * Math.min(1, speed / 6 + 0.2), G.audio.ctx.currentTime, 0.2); vn.osc.frequency.value = 40 + speed * 3; }
    };
    await wait(8500);
    G.ui.caption('"They\'ve been searching since Thursday."', 3.4);
    await wait(3800);
    G.ui.card(['YOUR PHONE', 'Thursday', '4:17 PM · No service'], ['THEIR DASHBOARD', 'Sunday', '06:52']);
    await wait(4200);
    G.ui.card(null);
    G.ui.caption('"Come on. Get in."', 2.6);
    await wait(3000);
    G.ui.black(true, '', 1800);
    await wait(2000);
    if (G.audio.vehicleNode) { try { G.audio.vehicleNode.osc.stop(); } catch (e) { } G.audio.vehicleNode = null; }
    road.group.remove(v);
  }

  // Ending C: the notebook shows the opening text; footsteps approach from outside the tent.
  async placeYouWere() {
    const pl = G.player, camp = G.world.get('warmcamp');
    pl.moveLock = true;
    G.ui.cue('[footsteps outside the tent]');
    const ac = G.audio;
    if (ac.enabled) {
      for (let i = 0; i < 7; i++) {
        setTimeout(() => {
          const r = 8 - i * 1.0, a = Math.PI * 0.85;
          const x = -4.2 + Math.cos(a) * r, z = -1.2 + Math.sin(a) * r;
          const p = ac.posGain(x, camp.heightAt(x, z), z, 3);
          const t = ac.ctx.currentTime;
          const src = ac.ctx.createBufferSource(); src.buffer = ac.white;
          const f = ac.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8;
          const g = ac.ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
          src.connect(f); f.connect(g); g.connect(p); src.start(t, Math.random()); src.stop(t + 0.15);
        }, i * 650);
      }
    }
    await wait(4700);
    G.ui.black(true, '', 400);
    await wait(1600);
  }

  async credits(title) {
    G.ui.black(true, title, 10);
    await wait(4200);
    G.ui.black(true, '', 800);
    await wait(900);
    G.ui.creditsRoll(CREDITS);
    await wait(9000);
    G.ui.creditsRoll(null);
  }
}

// The Watcher: a featureless dark adult-sized silhouette. At most three sightings,
// 25-45 m, 2-4 s; disappears only when occluded or after the player looks away.
export class Watcher {
  constructor() {
    this.mesh = P.watcher();
    this.active = null;
    this.seen = 0;
  }
  spots() {
    const r = G.world.get('ridge'), c = G.world.get('corridor');
    return [
      { id: 'ridge', place: 'ridge', ...r.watcherSpot },
      { id: 'corridor', place: 'corridor', ...c.watcherSpot, cond: () => G.story.flags.corridorDir === 'north' },
      { id: 'camp', place: 'warmcamp', x: -19, z: -17, trigger: { x: 0, z: 1, r: 4.5 }, cond: () => !G.story.flags.radioDone },
    ];
  }
  inView(x, y, z) {
    const cam = G.renderer.camera;
    const v = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    if (v.z > -1) return false;
    v.applyMatrix4(cam.projectionMatrix);
    return Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
  }
  hide() {
    if (this.active) { const p = G.world.get(this.active.place); p.group.remove(this.mesh); }
    this.active = null;
  }
  update(dt) {
    const f = G.story.flags;
    const cur = G.world.current;
    if (this.active) {
      if (cur.id !== this.active.place) { this.hide(); return; }
      const m = this.mesh.position;
      const vis = this.inView(m.x, m.y + 1.2, m.z);
      if (vis) this.seen += dt;
      else if (this.seen > 1.2 || this.away > 6) { this.hide(); return; }
      if (!vis) this.away = (this.away || 0) + dt; else this.away = 0;
      return;
    }
    for (const s of this.spots()) {
      if (f.watcherSeen.includes(s.id) || s.place !== cur.id) continue;
      if (s.cond && !s.cond()) continue;
      const pl = G.player;
      if (Math.hypot(pl.pos.x - s.trigger.x, pl.pos.z - s.trigger.z) > s.trigger.r) continue;
      const y = cur.heightAt(s.x, s.z);
      if (this.inView(s.x, y + 1, s.z)) continue; // never pop into view
      f.watcherSeen.push(s.id);
      this.active = s; this.seen = 0; this.away = 0;
      this.mesh.position.set(s.x, y, s.z);
      this.mesh.rotation.y = Math.atan2(pl.pos.x - s.x, pl.pos.z - s.z);
      cur.group.add(this.mesh);
      this.mesh.updateMatrixWorld(true);
      break;
    }
  }
}
