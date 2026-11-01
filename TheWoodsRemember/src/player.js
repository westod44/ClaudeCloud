// First-person controller (bible section 03): 1.65 m eye, 1.05 m crouched,
// walk 2.3, sprint 3.6, crouch 1.2 m/s; no jump; no forced camera turns.
import * as THREE from '../vendor/three.module.js';
import { PLAYER } from './config.js';
import { resolveMove, findSupport, blockedAt } from './collision.js';

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.vel = new THREE.Vector2();
    this.crouched = false;
    this.crouchT = 0;
    this.bobT = 0; this.bob = 0;
    this.stepAcc = 0;
    this.moveLock = false; // look-only (radio transmission, seated)
    this.frozen = false;   // scripted camera (endings)
    this.seat = null;      // {x,y,z,yaw} eye position when seated
    this.surface = 'leaves';
    this.shape = null;
    this.sprinting = false;
    this.speedMul = 1;
    this.moving = false;
    this.inWater = false;
    this.distance = 0;
    this.eye = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.scriptEye = null;
  }

  place(x, y, z, yaw = 0, pitch = 0) {
    this.pos.set(x, y, z); this.yaw = yaw; this.pitch = pitch; this.vel.set(0, 0);
  }

  look(dx, dy, s) {
    const k = 0.0022 * s.sensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (s.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    if (this.seat) {
      const d = ((this.yaw - this.seat.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(d) > 1.6) this.yaw = this.seat.yaw + Math.sign(d) * 1.6;
    }
  }

  get height() { return this.crouched ? PLAYER.heightCrouch : PLAYER.heightStand; }

  toggleCrouch(place) {
    if (this.crouched) {
      if (blockedAt(place, this.pos.x, this.pos.z, this.pos.y, PLAYER.heightStand)) return false;
      this.crouched = false;
    } else this.crouched = true;
    return true;
  }

  // returns crossing info if a join was crossed
  update(dt, input, world, G) {
    const place = world.current;
    let wish = new THREE.Vector2();
    if (!this.moveLock && !this.frozen && !this.seat) {
      if (input.isDown('forward')) wish.y += 1;
      if (input.isDown('back')) wish.y -= 1;
      if (input.isDown('left')) wish.x -= 1;
      if (input.isDown('right')) wish.x += 1;
      if (input.down.has('ArrowUp')) wish.y += 1;
      if (input.down.has('ArrowDown')) wish.y -= 1;
    }
    if (input.down.has('ArrowLeft')) this.yaw += 1.8 * dt;
    if (input.down.has('ArrowRight')) this.yaw -= 1.8 * dt;
    if (wish.lengthSq() > 1) wish.normalize();
    const wantSprint = input.isDown('sprint') && wish.y > 0.3 && !this.crouched && G.survival.canSprint();
    this.sprinting = wantSprint && wish.lengthSq() > 0.01;
    let speed = this.crouched ? PLAYER.crouch : this.sprinting ? PLAYER.sprint : PLAYER.walk;
    if (!this.crouched && !this.sprinting) speed = Math.max(PLAYER.minColdWalk, speed * this.speedMul);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const tvx = (fx * wish.y + rx * wish.x) * speed, tvz = (fz * wish.y + rz * wish.x) * speed;
    const acc = wish.lengthSq() > 0 ? 9 : 12;
    const k = 1 - Math.exp(-acc * dt);
    this.vel.x += (tvx - this.vel.x) * k;
    this.vel.y += (tvz - this.vel.y) * k;
    if (this.frozen || this.seat) this.vel.set(0, 0);

    // crouch height easing
    this.crouchT += ((this.crouched ? 1 : 0) - this.crouchT) * (1 - Math.exp(-10 * dt));

    let crossing = null;
    const sp = this.vel.length();
    this.moving = sp > 0.2;
    if (sp > 0.001) {
      let remaining = dt;
      const steps = Math.max(1, Math.ceil((sp * dt) / 0.2));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        const cur = world.current;
        const px = this.pos.x, pz = this.pos.z;
        const nx = px + this.vel.x * sdt, nz = pz + this.vel.y * sdt;
        const res = resolveMove(cur, px, pz, nx, nz, this.pos.y, this.height);
        const moved = Math.hypot(res.x - px, res.z - pz);
        this.distance += moved; this.stepAcc += moved;
        this.pos.set(res.x, res.y, res.z);
        if (res.shape) { this.shape = res.shape; this.surface = res.shape.surf || 'leaves'; }
        // crossing a join plane
        const c = world.tryCross(px, pz, res.x, res.z, res.y);
        if (c) {
          const T = world.transform(c.mA, c.mB);
          this.pos.applyMatrix4(T);
          const dy = world.yawDelta(c.mA, c.mB);
          this.yaw += dy;
          const cs = Math.cos(dy), sn = Math.sin(dy);
          // rotate velocity (x,z) by dy about Y
          const vx = this.vel.x, vz = this.vel.y;
          this.vel.set(vx * cs + vz * sn, -vx * sn + vz * cs);
          world.commitCross(c);
          const sup = findSupport(c.to, this.pos.x, this.pos.z, this.pos.y);
          if (sup) { this.pos.y = sup.h; this.shape = sup.shape; }
          crossing = c;
        }
        remaining -= sdt;
      }
    }
    // water: creek channel under the feet
    this.inWater = false;
    for (const ck of world.current.creeks) {
      if (!ck.visible) continue;
      let best = Infinity;
      for (let i = 0; i < ck.pts.length - 1; i++) {
        const [ax, az] = ck.pts[i], [bx, bz] = ck.pts[i + 1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        let t = ((this.pos.x - ax) * dx + (this.pos.z - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(this.pos.x - ax - dx * t, this.pos.z - az - dz * t));
      }
      if (best < ck.w * 0.38 && this.shape && !this.shape.h) this.inWater = true;
    }
    if (this.inWater) this.surface = 'water';

    // head bob (bible: ≤ 0.015 m vertical; may be disabled)
    if (this.moving && !this.seat) {
      this.bobT += sp * dt * 2.2;
    }
    const bobAmp = G.settings.headBob ? PLAYER.defaultBob * Math.min(1, sp / 2.3) : 0;
    this.bob = Math.sin(this.bobT * 2) * bobAmp;

    // footsteps
    const stride = this.sprinting ? 0.95 : this.crouched ? 0.55 : 0.75;
    if (this.stepAcc >= stride) {
      this.stepAcc = 0;
      if (G.audio) G.audio.footstep(this.surface, this.sprinting ? 1.15 : this.crouched ? 0.55 : 0.85);
    }
    this.computeEye();
    return crossing;
  }

  eyeHeight() { return PLAYER.eyeStand + (PLAYER.eyeCrouch - PLAYER.eyeStand) * this.crouchT; }

  computeEye() {
    if (this.scriptEye) { this.eye.copy(this.scriptEye); return this.eye; }
    let x = this.pos.x, y = this.pos.y + this.eyeHeight() + this.bob, z = this.pos.z;
    if (this.seat) { x = this.seat.x; y = this.seat.y; z = this.seat.z; }
    this._e.set(this.pitch, this.yaw, 0, 'YXZ');
    this._q.setFromEuler(this._e);
    this.eye.compose(new THREE.Vector3(x, y, z), this._q, new THREE.Vector3(1, 1, 1));
    return this.eye;
  }

  eyePos() { return new THREE.Vector3().setFromMatrixPosition(this.eye); }
  forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this._q); }
}
