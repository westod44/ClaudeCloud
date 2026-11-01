// Survival creates pressure, not lethal attrition (bible section 15).
import { SURVIVAL as S } from './config.js';
import { G } from './state.js';

export class Survival {
  constructor() { this.reset(); }
  reset() {
    this.stamina = S.staminaMax;
    this.warmth = S.warmthStart;
    this.hydration = S.hydrationStart;
    this.wet = false; this.wetT = 0; this.dryT = 0;
    this.battery = 100;
    this.flashOn = false;
    this.flashPower = 0;
    this.sinceSprint = 10;
    this.snackUsed = false;
    this.exhausted = false;
    this.shiverT = 0;
    this.warnCold = 0; this.warnThirst = 0;
    this.batteryFade = 0;
  }
  serialize() { return { stamina: this.stamina, warmth: this.warmth, hydration: this.hydration, wet: this.wet, battery: this.battery, flashOn: this.flashOn, snackUsed: this.snackUsed }; }
  restore(d) { this.reset(); Object.assign(this, d); }

  canSprint() { return this.stamina > 1 && !this.exhausted; }

  recoveryMul() {
    let m = 1;
    if (this.warmth < 20) m *= S.coldSevereMul; else if (this.warmth < 40) m *= S.coldMildMul;
    if (this.hydration < 20) m *= S.thirstMul;
    return m;
  }

  update(dt, ctx) {
    // ctx: { sprinting, moving, phase (0..3 light level), indoor, refuge, nearFire, exposed, inWater }
    const min = dt / 60;
    // stamina
    if (ctx.sprinting) {
      this.stamina = Math.max(0, this.stamina - S.sprintDrain * dt);
      this.sinceSprint = 0;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.sinceSprint += dt;
      if (this.sinceSprint >= S.staminaRecoverDelay) {
        let rec = S.staminaRecover * this.recoveryMul();
        if (this.warmth < 20) rec *= 0.75; // severe cold: stamina reduction
        this.stamina = Math.min(S.staminaMax, this.stamina + rec * dt);
      }
      if (this.stamina > 25) this.exhausted = false;
    }
    // wetness: active after 3 s in creek water; clears after 60 s under shelter or beside fire
    if (ctx.inWater) { this.wetT += dt; if (this.wetT >= S.wetAfterWater && !this.wet) { this.wet = true; G.ui.status('Wet'); } this.dryT = 0; }
    else if (this.wet && (ctx.refuge || ctx.nearFire)) { this.dryT += dt; if (this.dryT >= S.wetClearRefuge) { this.wet = false; this.wetT = 0; } }
    else if (!ctx.inWater) this.wetT = Math.max(0, this.wetT - dt * 0.5);
    // warmth
    if (ctx.nearFire) {
      if (this.warmth < S.fireCap) this.warmth = Math.min(S.fireCap, this.warmth + S.fireRestore * min);
    } else if (ctx.refuge === 'shelter') {
      this.warmth = Math.min(100, this.warmth + S.shelterRestore * min);
    } else if (!ctx.indoor) {
      let loss = ctx.phase < 0.6 ? S.warmthLossAfternoon : ctx.phase < 1.6 ? S.warmthLossDusk : S.warmthLossNight;
      if (ctx.exposed) loss += S.warmthRidgeExtra;
      if (this.wet) loss += S.warmthWetExtra;
      this.warmth = Math.max(S.warmthFloor, this.warmth - loss * min);
    }
    // hydration (active play)
    this.hydration = Math.max(S.hydrationFloor, this.hydration - S.hydrationLoss * min);
    // flashlight battery
    if (this.flashOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - S.batteryDrain * min);
      if (this.battery <= 0) { this.batteryFade = 1.2; G.audio.sfx('click'); }
    }
    if (this.batteryFade > 0) {
      this.batteryFade -= dt;
      this.flashPower = Math.max(0, this.batteryFade / 1.2) * 0.6;
      if (this.batteryFade <= 0) { this.flashOn = false; this.flashPower = 0; G.ui.status('Flashlight dead'); }
    } else {
      const target = this.flashOn && this.battery > 0 ? (this.battery < 8 ? 0.7 + 0.3 * (this.battery / 8) : 1) : 0;
      this.flashPower += (target - this.flashPower) * Math.min(1, dt * 14);
    }
    // short state messages only when changing (no permanent bars)
    if (this.warmth < 20) { if (this.warnCold <= 0) { G.ui.status('Very cold'); this.warnCold = 90; } }
    this.warnCold -= dt;
    if (this.hydration < 20) { if (this.warnThirst <= 0) { G.ui.status('Thirsty'); this.warnThirst = 120; } }
    this.warnThirst -= dt;
    // shivering breath below 40
    if (this.warmth < 40) {
      this.shiverT -= dt;
      if (this.shiverT <= 0) { G.audio.sfx('shiver'); this.shiverT = this.warmth < 20 ? 14 : 28; }
    }
  }

  toggleFlash() {
    if (this.battery <= 0) { G.ui.status('Flashlight dead. Replace the battery (Tab).'); G.audio.sfx('click'); return; }
    this.flashOn = !this.flashOn;
    G.audio.sfx('click');
  }
}

export class Inventory {
  constructor() { this.reset(); }
  reset() { this.water = 500; this.snacks = 1; this.spares = 1; this.busy = 0; }
  serialize() { return { water: this.water, snacks: this.snacks, spares: this.spares }; }
  restore(d) { this.reset(); Object.assign(this, d); }

  drink() {
    if (this.water < 250) { G.ui.toast('The bottle is empty.'); return false; }
    this.water -= 250;
    G.survival.hydration = Math.min(100, G.survival.hydration + 30);
    G.audio.sfx('drink');
    return true;
  }
  eat() {
    if (this.snacks <= 0) return false;
    this.snacks--;
    G.survival.warmth = Math.min(100, G.survival.warmth + 15);
    G.survival.stamina = Math.min(100, G.survival.stamina + 30);
    G.survival.snackUsed = true;
    G.audio.sfx('wrapper');
    return true;
  }
  replaceBattery(done) {
    if (this.spares <= 0) { G.ui.toast('No spare battery packs.'); return false; }
    G.ui.progress('Replacing battery', 2, () => {
      this.spares--;
      G.survival.battery = 100;
      G.survival.batteryFade = 0;
      G.audio.sfx('click');
      if (done) done();
    });
    return true;
  }
  refill(source) {
    if (this.water >= 750) { G.ui.toast('The bottle is already full.'); return; }
    this.water = 750;
    G.audio.sfx('pour');
    G.ui.toast(`Refilled the bottle from the ${source}. 750 / 750 mL.`);
  }
}
