// Story progression: objectives, evidence, counters and the three physical endings.
// Hints escalate only from completed returns, never from impatience timers.
import { G } from './state.js';
import { OBJECTIVES, JOURNAL, DOCS, OPENING_JOURNAL, DUP_CAMP_TAIL, RADIO_SEQUENCE } from './docs.js';
import { LAP_ENTRIES } from './links.js';

export class Story {
  constructor() { this.reset(); }

  reset() {
    this.flags = {
      hasPack: false, gotOut: false, bridgeCrossed: false, gullyTrap: false, dry: false,
      logArrivals: 0, coldCamp: false, coldRead: false, batCamp: false, batShelter: false,
      junctionReturns: 0, junctionCentre: false, overlookPending: false, clearingLoops: 0, clearing: false,
      shelter: false, logRead: false, radioKnown: false, shelterShift: false, stoveLit: false, shelterSteps: false,
      ridgeLoops: 0, ridgeA: false, corridorDir: '', corridorFar: false, corridorSeen: false,
      warmCamp: false, warmSteps: false, culvert: false, tunnel: false, hut: false, cabin: false,
      radioDone: false, radioPlaying: false, campLaps: 0, finalBridge: false,
      ystones: [], inspected: {}, watcherSeen: [], once: {},
    };
    this.objective = 'walk';
    this.entries = [{ id: 'opening', fresh: false }];
    this.notes = [];
    this.lightTarget = 0;
    this.endingPlaying = false;
  }

  serialize() {
    return { flags: JSON.parse(JSON.stringify(this.flags)), objective: this.objective, entries: this.entries, notes: this.notes, lightTarget: this.lightTarget };
  }
  restore(d) {
    this.reset();
    Object.assign(this.flags, d.flags || {});
    this.objective = d.objective || 'walk';
    this.entries = d.entries || this.entries;
    this.notes = d.notes || [];
    this.lightTarget = d.lightTarget ?? 0;
    this.flags.radioPlaying = false;
  }

  set(k, v) { this.flags[k] = v; }
  once(k, fn) { if (this.flags.once[k]) return; this.flags.once[k] = true; fn(); }
  light(t) { if (t > this.lightTarget) this.lightTarget = t; }

  setObjective(key) {
    if (this.objective === key) return;
    this.objective = key;
    G.ui.objective(OBJECTIVES[key]);
  }

  journal(id) {
    if (this.entries.find(e => e.id === id)) return;
    this.entries.push({ id, fresh: true });
    G.ui.journalPing();
  }

  addNote(id) { if (!this.notes.includes(id)) this.notes.push(id); }
  readDoc(id) { this.addNote(id); G.ui.doc(id); }

  // ------------------------------------------------------------ Act I
  carDoor() {
    const pl = G.player, car = G.world.get('car');
    if (pl.seat) {
      if (!this.flags.hasPack) { G.ui.toast('Take the backpack first.'); return; }
      pl.seat = null;
      const s = car.spawnOut;
      pl.place(s.x, car.heightAt(s.x, s.z), s.z, s.yaw, 0);
      G.audio.sfx('cardoor');
      if (!this.flags.gotOut) {
        this.flags.gotOut = true;
        G.saves.autosave('Left the car');
        G.ui.objective(OBJECTIVES.walk);
      }
      return;
    }
    if (this.flags.radioDone) {
      pl.seat = { ...car.carSeat };
      pl.yaw = car.carSeat.yaw; pl.pitch = -0.1;
      G.audio.sfx('cardoor');
      G.ui.toast('E  Start the car — or get out again.');
      return;
    }
    G.ui.toast(this.flags.bridgeCrossed ? 'Not yet. The loop comes back round to the car.' : 'Forty-five minutes round the loop. There\'s time.');
  }

  bridgeCrossed() {
    if (this.flags.bridgeCrossed) return;
    this.flags.bridgeCrossed = true;
    this.light(0.15);
    this.setObjective('return');
  }

  gullyBend() { if (!this.flags.gullyTrap) { this.flags.gullyTrap = true; this.light(0.2); } }

  dryGully() {
    if (this.flags.dry) return;
    this.flags.dry = true;
    this.journal('dryGully');
    G.ui.mapNote('Creek appeared twice.');
  }

  arriveLog() {
    const n = ++this.flags.logArrivals;
    if (n === 2) { this.journal('ribbon2'); this.light(0.35); }
    if (n === 3) { this.light(0.55); G.audio.music(0, 0.0); }
    if (n === 4) { this.journal('ribbon4'); }
    if (n === 6) G.audio.birdCall(G.world.get('log'), -14, 7, -27);
  }

  reachColdCamp() {
    if (this.flags.coldCamp) return;
    this.flags.coldCamp = true;
    this.light(0.9);
    this.journal('coldCamp');
    G.saves.autosave('Cold campsite');
  }
  readColdNotebook() { this.readDoc('coldNotebook'); this.flags.coldRead = true; this.setObjective('shelter'); }
  readSketch() { this.readDoc('campSketch'); this.flags.coldRead = true; this.setObjective('shelter'); }
  takeBattery(flag) {
    if (this.flags[flag]) return;
    this.flags[flag] = true;
    G.inv.spares++;
    G.audio.sfx('pickup');
    G.ui.toast('Battery pack taken. (' + G.inv.spares + ' spare)');
  }

  // ------------------------------------------------------------ Act II
  junctionCentre() {
    if (!this.flags.junctionCentre) { this.flags.junctionCentre = true; this.light(1.1); }
    if (this.flags.overlookPending) {
      this.flags.overlookPending = false;
      this.junctionReturn();
    }
  }
  junctionOverlook() { this.flags.overlookPending = true; }
  junctionReturn() {
    const n = ++this.flags.junctionReturns;
    if (n === 1) this.journal('junction1');
    if (n === 2) this.journal('junction2');
  }
  junctionPause(dt) {
    const pl = G.player;
    this._pauseT = pl.moving ? 0 : (this._pauseT || 0) + dt;
    if (this._pauseT > 3 && G.settings.soundCaptions) G.ui.cue('Water ahead-right');
  }

  reachClearing() { if (!this.flags.clearing) { this.flags.clearing = true; this.light(1.35); } }

  reachShelter() {
    if (this.flags.shelter) return;
    this.flags.shelter = true;
    this.light(1.6);
  }
  readRangerLog() {
    this.addNote('rangerLog'); this.addNote('fieldNote'); this.addNote('radioNote'); this.addNote('backPage');
    G.ui.docPages(['rangerLog', 'fieldNote', 'radioNote', 'backPage']);
    if (!this.flags.logRead) {
      this.flags.logRead = true;
      this.journal('shelter');
      this.light(1.85);
      G.audio.music(0);
    }
    this.radioKnown();
  }
  tryShelterRadio() {
    G.audio.sfx('static', { dur: 1.6 });
    G.ui.caption('[static]', 1.6);
    setTimeout(() => G.ui.toast('Dead. The broken antenna, the dark indicator. The logbook might say something about it.'), 1500);
    this.radioKnown();
  }
  radioKnown() {
    if (this.flags.radioKnown) return;
    this.flags.radioKnown = true;
    this.setObjective('lookout');
    G.saves.autosave('Ranger shelter');
  }
  stove() {
    if (this.flags.stoveLit) { this.rest('fire'); return; }
    this.flags.stoveLit = true;
    G.audio.sfx('lighter');
    setTimeout(() => G.audio.sfx('whoosh'), 400);
    G.ui.toast('The lighter catches. The stove draws.');
  }
  shelterDoorClosed() {
    const sh = G.world.get('shelter');
    const pl = G.player;
    const inside = G.world.current === sh && sh.interiorCheck(pl.pos.x, pl.pos.z, pl.pos.y);
    if (!inside) return;
    if (this.flags.radioKnown && !this.flags.shelterShift) this.flags.shelterShift = true;
    if (!this.flags.shelterSteps) {
      this.flags.shelterSteps = true;
      setTimeout(() => { if (!sh.doorOpen) G.audio.footstepsOutside(sh, 'shelter', 4); }, 1500);
    }
  }
  shelterDoorOpened() { G.audio.stopOutsideSteps('shelter'); }

  // ------------------------------------------------------------ Act III
  ridgeView(which) {
    this.light(2.0);
    if (which === 'A' && !this.flags.ridgeA) { this.flags.ridgeA = true; this.journal('tower1'); G.saves.autosave('Lookout ridge'); }
  }
  arriveRidgeReturn() {
    const n = ++this.flags.ridgeLoops;
    if (n === 2) this.journal('tower2');
  }
  corridorMid() { if (!this.flags.corridorSeen && this.flags.corridorDir === 'north') { this.flags.corridorSeen = true; } }
  corridorFar() {
    if (this.flags.corridorDir === 'north') { this.flags.corridorFar = true; this.journal('corridor'); }
  }
  reachWarmCamp() {
    if (this.flags.warmCamp) {
      if (this.flags.radioDone && this.flags.campLaps === 2 && !this.flags.once.lap2) { this.flags.once.lap2 = true; this.journal('campLoop'); }
      return;
    }
    this.flags.warmCamp = true;
    this.journal('warmCamp');
    G.audio.music(1);
    G.saves.autosave('Second campsite');
    setTimeout(() => {
      if (!this.flags.warmSteps && G.world.current && G.world.current.id === 'warmcamp') {
        this.flags.warmSteps = true;
        G.audio.footstepsOutside(G.world.get('warmcamp'), 'camp', 18);
      }
    }, 9000);
  }
  inspectSecondPack() { this.readDoc('secondPack'); }
  readWarmNotebook() {
    if (this.flags.radioDone && this.flags.campLaps >= 3) {
      G.ui.docCustom('Notebook, open on the stump', [OPENING_JOURNAL], 'hand', () => this.ending('C'));
      return;
    }
    // inserts exactly one observation the player actually recorded, then the tail line
    const pick = ['ribbon2', 'junction1', 'clearing', 'tower2', 'dryGully', 'corridor', 'barredPost'].find(id => this.entries.find(e => e.id === id)) || 'ribbon2';
    const obs = JOURNAL[pick].text;
    DOCS.warmNotebook = { title: 'Notebook on the stump', style: 'hand', body: [obs, DUP_CAMP_TAIL] };
    this.readDoc('warmNotebook');
  }
  reachCulvert() { if (!this.flags.culvert) { this.flags.culvert = true; } }
  deepTunnel() { if (!this.flags.tunnel) { this.flags.tunnel = true; this.journal('tunnel'); } }
  reachHut() { if (!this.flags.hut) { this.flags.hut = true; } }
  reachCabin() {
    if (this.flags.cabin) return;
    this.flags.cabin = true;
    G.saves.autosave('Lookout cabin');
  }

  lookoutRadio() {
    if (this.flags.radioDone) { G.audio.sfx('static', { dur: 1.2 }); G.ui.caption('[static]', 1.2); return; }
    if (this.flags.radioPlaying) return;
    this.flags.radioPlaying = true;
    G.player.moveLock = true;
    G.audio.sfx('click');
    const t0 = performance.now();
    for (const step of RADIO_SEQUENCE) {
      setTimeout(() => {
        if (step.cap) G.ui.caption(step.cap, (step.voice || step.static || 1.5) + 0.6);
        if (step.static) G.audio.sfx('static', { dur: step.static });
        if (step.voice) G.audio.radioVoice(step.voice, !!step.quiet);
      }, step.t * 1000);
    }
    setTimeout(() => {
      G.audio.silence(1.2);
      this.flags.radioPlaying = false;
      this.flags.radioDone = true;
      G.player.moveLock = false;
      this.journal('radio');
      this.setObjective('out');
      G.audio.music(2);
      G.saves.checkpoint();
    }, 15600);
  }

  // ------------------------------------------------------------ Act IV
  reachFinalBridge() {
    if (this.flags.finalBridge) return;
    this.flags.finalBridge = true;
    this.journal('finalBridge');
    G.saves.autosave('The bridge again');
  }

  // ------------------------------------------------------------ world events
  onArrive(a) {
    const f = this.flags;
    if (a.place === 'log' && a.mouth === 'entry') this.arriveLog();
    if (a.place === 'junction' && a.mouth === 'creek' && a.fromPlace === 'junction') this.junctionReturn();
    if (a.place === 'clearing' && a.fromPlace === 'clearing') {
      if (++f.clearingLoops === 1) this.journal('clearing');
    }
    if (a.place === 'ridge' && a.mouth === 'ret') this.arriveRidgeReturn();
    if (a.place === 'warmcamp' && a.fromPlace === 'warmcamp' && a.fromMouth === 'broad' && f.radioDone) {
      f.campLaps++;
      if (f.campLaps === 2) { this.journal('campLoop'); }
      if (f.campLaps >= 3) G.audio.music(2, 0.5);
    }
  }

  onCross(c) {
    const f = this.flags;
    if (c.from.id === 'warmcamp' && c.mA.id === 'narrow') f.campLaps = 0;
    if (c.to.id === 'corridor') {
      if (c.mB.id === 'start') f.corridorDir = 'north';
      if (c.mB.id === 'end') f.corridorDir = 'south';
      f.corridorFar = false;
    }
    if (c.to.id === 'ridge') this.light(2.0);
    if (c.to.id === 'road') this.lightTarget = 3;
  }

  inspect(kind) {
    const f = this.flags;
    const text = {
      ystone: 'Dark slate, split by a pale crack in the shape of a Y.',
      ribbon: 'An orange ribbon tied around the lower prong. Faded, knotted twice.',
      signpost: 'RANGER STATION, LOOKOUT, CREEK. Someone has cut the initials E.M. into the post. A forked branch lies snapped at its foot.',
      beech: 'A dead beech. A long pale scar from knee height to well above your head; the right-hand limb broken off at about three metres.',
      barredPost: 'A knee-high post. A dull yellow square crossed by two black bars.',
    }[kind];
    G.ui.toast(text);
    const placeId = G.world.current.id;
    if (kind === 'barredPost') this.journal('barredPost');
    if (kind === 'ystone' && !f.ystones.includes(placeId)) {
      f.ystones.push(placeId);
      if (f.ystones.length === 2) {
        JOURNAL.ystone = { title: 'The split stone', text: 'The same slate stone with the pale Y-shaped crack. I have now seen it in two different places. It never changes.' };
        this.journal('ystone');
      }
    }
  }

  rest(kind) {
    if (G.ui.busy) return;
    G.ui.fade(4, () => {
      const s = G.survival;
      s.warmth = Math.max(s.warmth, 70);
      s.stamina = 100;
      if (kind === 'fire' || kind === 'shelter') { s.wetT = 0; s.wet = false; }
    }, 'Resting');
  }

  ending(which) {
    if (this.endingPlaying) return;
    this.endingPlaying = true;
    G.endings.play(which);
  }
}

export { LAP_ENTRIES };
