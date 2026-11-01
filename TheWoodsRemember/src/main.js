// THE WOODS REMEMBER — boot and main loop.
import * as THREE from '../vendor/three.module.js';
import { G } from './state.js';
import { GameRenderer } from './renderer.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Story } from './story.js';
import { Survival, Inventory } from './survival.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Saves } from './saves.js';
import { Endings, Watcher } from './endings.js';
import { makeLinkTable } from './links.js';
import { TEX } from './textures.js';
import { PLAYER } from './config.js';
import { findSupport } from './collision.js';
import { buildCar, buildBridge, buildGully, buildDry, buildLog, buildCamp } from './places/act1.js';
import { buildJunction, buildClearing, buildShelter, buildRidge } from './places/act2.js';
import { buildCorridor, buildCulvert, buildTunnel, buildHut, buildFinal, buildBank, buildRoad, buildDrive } from './places/act3.js';

const params = new URLSearchParams(location.search);
G.dev = params.has('dev');
G.showDebug = G.dev && !params.has('nodebug');

const canvas = document.getElementById('view');
const loading = document.getElementById('loading');

async function boot() {
  G.ui = new UI();
  G.ui.loadSettings();
  G.renderer = new GameRenderer(canvas);
  G.input = new Input(canvas);
  G.ui.applySettings();
  G.world = new World();
  G.player = new Player();
  G.story = new Story();
  G.survival = new Survival();
  G.inv = new Inventory();
  G.audio = new Audio();
  G.saves = new Saves();
  G.endings = new Endings();
  G.world.table = makeLinkTable(G.story);
  G.world.onArrive = (a) => G.story.onArrive(a);
  G.world.onCross = (c) => { G.story.onCross(c); if (G.bot) G.bot.onCross(c); };

  const builders = [
    buildCar, buildBridge, buildGully, buildDry, buildLog, () => buildCamp('coldcamp', false),
    buildJunction, buildClearing, buildShelter, buildRidge,
    buildCorridor, () => buildCamp('warmcamp', true), buildCulvert, buildTunnel, buildHut,
    buildFinal, buildBank, buildRoad, buildDrive,
  ];
  for (let i = 0; i < builders.length; i++) {
    loading.textContent = `Loading Bellwether… ${Math.round((i / builders.length) * 100)}%`;
    await new Promise(r => setTimeout(r, 0));
    const p = builders[i]();
    G.world.add(p);
    G.renderer.scene.add(p.group);
  }
  G.watcher = new Watcher();
  G.saves.syncAutoIndex();
  // warm up shaders with a render of each place
  G.world.setCurrent('bridge');
  loading.style.display = 'none';
  bindInput();
  window.addEventListener('resize', () => { G.renderer.resize(); G.ui.resize(); });
  G.toTitle();
  requestAnimationFrame(loop);
  if (G.dev) window.__twr = devApi();
}

// ------------------------------------------------------------------ game flow
G.toTitle = () => {
  G.mode = 'title';
  G.input.releaseLock();
  G.ui.closePanelSilently?.();
  G.ui.black(false, '', 600);
  G.ui.menu('title');
  G.ui.prompt(null);
  setTitleView();
};

function setTitleView() {
  G.world.setCurrent('clearing');
  G.titleLight = 1.25;
  const p = G.world.current;
  G.player.seat = null; G.player.scriptEye = null;
  G.player.place(0.6, p.heightAt(0.6, 14), 14, 0.05, 0.08);
}

function newGame() {
  G.audio.init();
  G.story.reset(); G.survival.reset(); G.inv.reset(); G.ui.mapNotes = [];
  G.lightLevel = 0;
  G.world.arrival = null; G.world.pending = null;
  G.world.setCurrent('car');
  const car = G.world.current;
  car.userData.car.userData.pack.visible = true;
  const pl = G.player;
  pl.seat = { ...car.carSeat };
  pl.place(car.carSeat.x, car.heightAt(car.carSeat.x, car.carSeat.z), car.carSeat.z, 0, -0.12);
  pl.moveLock = false; pl.frozen = false; pl.crouched = false; pl.crouchT = 0;
  for (const p of G.world.places.values()) for (const t of p.triggers) { t.inside = false; }
  G.watcher.hide();
  startPlay();
  setTimeout(() => G.ui.objective('Walk the Bellwether loop.'), 900);
  setTimeout(() => G.ui.toast('E  interact · the note, the phone, the backpack, the door.', 6), 2200);
}

function startPlay() {
  G.ui.menu(null);
  G.mode = 'play';
  G.audio.init();
  G.audio.pause(false);
  G.input.requestLock();
  if (!G.input.locked && !G.input.dragLook) G.ui.showResume();
}

function continueGame(slot) {
  G.audio.init();
  G.watcher.hide();
  if (!G.saves.load(slot)) { G.ui.status('That save could not be loaded.'); return; }
  for (const p of G.world.places.values()) for (const t of p.triggers) t.inside = false;
  // triggers the player is already standing in should not re-fire
  primeTriggers();
  startPlay();
  G.ui.objective(G.story.objective ? ({ walk: 'Walk the Bellwether loop.', return: 'Return to the car before dark.', shelter: 'Find the ranger shelter.', lookout: 'Reach the lookout radio.', out: 'Find a way out of Bellwether.' })[G.story.objective] : '');
}

function primeTriggers() {
  const p = G.world.current, pl = G.player;
  for (const t of p.triggers) t.inside = Math.hypot(pl.pos.x - t.x, pl.pos.z - t.z) < t.r;
}

G.onMenu = (m, slot) => {
  const from = G.ui.menuName;
  if (m === 'new') newGame();
  else if (m === 'continue') continueGame(G.saves.latest());
  else if (m === 'load') { G.ui.menuBack = from; G.ui.menu('load'); }
  else if (m === 'loadslot') continueGame(slot);
  else if (m === 'settings') { G.ui.menuBack = from; G.ui.menu('settings'); }
  else if (m === 'credits') { G.ui.menuBack = from; G.ui.menu('credits'); }
  else if (m === 'quit') { G.ui.menuBack = 'title'; G.ui.menu('quit'); }
  else if (m === 'back') G.ui.menu(G.ui.menuBack || (G.mode === 'pause' ? 'pause' : 'title'));
  else if (m === 'defaults') { try { localStorage.removeItem('twr.settings'); } catch (e) { } G.ui.loadSettings(); G.ui.menu('settings'); }
  else if (m === 'resume') { G.ui.menu(null); G.mode = 'play'; G.audio.pause(false); G.input.requestLock(); if (!G.input.locked && !G.input.dragLook) G.ui.showResume(); }
  else if (m === 'save') { if (G.world.pending) G.saves.queue = { kind: 'manual', label: 'Manual save' }; else G.saves.manual(); }
  else if (m === 'title') { G.audio.pause(false); G.toTitle(); }
};

function pause() {
  if (G.mode !== 'play' && G.mode !== 'resume') return;
  G.ui.hideResume();
  G.mode = 'pause';
  G.audio.pause(true);
  G.ui.menuBack = 'pause';
  G.ui.menu('pause');
}

function bindInput() {
  const inp = G.input;
  inp.onLockChange = (locked, failed) => {
    if (failed) { G.ui.status('Mouse capture unavailable: hold the left mouse button to look.'); if (G.mode === 'resume') { G.ui.hideResume(); G.mode = 'play'; } return; }
    if (locked) { if (G.mode === 'resume') { G.ui.hideResume(); G.mode = 'play'; } return; }
    if (G.mode === 'play') pause();
  };
  inp.onKey = (e) => {
    if (G.ui.rebindKey(e)) return true;
    if (G.mode === 'panel') return G.ui.panelKey(e);
    if (e.code === 'Escape') {
      if (G.mode === 'pause') { G.onMenu(G.ui.menuName === 'pause' ? 'resume' : 'back'); return true; }
      if (G.mode === 'play' || G.mode === 'resume') { pause(); return true; }
    }
    if (G.mode === 'play' && !e.repeat) {
      const k = G.settings.keys;
      if (e.code === k.backpack) { G.ui.openPanel('backpack'); return true; }
      if (e.code === k.journal) { G.ui.openPanel('journal'); return true; }
      if (e.code === k.map) { G.ui.openPanel('map'); return true; }
      if (e.code === 'F3' || (G.dev && e.code === 'Backquote')) { G.showDebug = !G.showDebug; return true; }
    }
    return false;
  };
  canvas.addEventListener('click', () => {
    if (G.mode === 'play' || G.mode === 'resume') { G.audio.init(); inp.requestLock(); }
  });
  document.getElementById('resume').addEventListener('click', () => { G.audio.init(); inp.requestLock(); if (inp.dragLook) { G.ui.hideResume(); G.mode = 'play'; } });
}

// ------------------------------------------------------------------ per-frame
let last = performance.now();
let holdT = 0, holdTarget = null;
const fpsHist = [];

function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsHist.push(dt); if (fpsHist.length > 60) fpsHist.shift();
  step(dt);
}

function step(dt) {
  const pl = G.player, w = G.world, inp = G.input;
  G.time += dt;
  TEX.water().offset.y -= dt * 0.22;
  if (G.mode === 'play' || G.mode === 'ending') {
    const m = inp.takeMouse();
    pl.look(m.dx, m.dy, G.settings);
    if (G.mode === 'play') playStep(dt);
    else {
      pl.computeEye();
      if (G.endings.update) G.endings.update(dt);
    }
    G.lightLevel += Math.sign(G.story.lightTarget - G.lightLevel) * Math.min(Math.abs(G.story.lightTarget - G.lightLevel), dt / (G.story.lightTarget >= 3 ? 6 : 30));
  } else if (G.mode === 'title') {
    pl.computeEye();
  } else {
    inp.takeMouse();
    pl.computeEye();
  }
  for (const p of w.places.values()) if (p === w.current || p.dyn.length) p.update(dt, G);
  G.ui.update(dt);
  // render
  G.renderer.setCamera(pl.eye);
  w.updateVisibility(G.renderer.camera);
  if (G.skipRender) { inp.endFrame(); if (G.mode === 'play' || G.mode === 'ending') G.audio.update(dt, w, pl.eye, {}); return; }
  const light = G.mode === 'title' ? G.titleLight : G.lightLevel;
  G.renderer.render({
    world: w, eye: pl.eye, lightLevel: light, dt,
    flashPower: G.mode === 'title' ? 0 : G.survival.flashPower,
    brightness: G.settings.brightness,
    showTorch: (G.mode === 'play' || G.mode === 'panel' || G.mode === 'pause' || G.mode === 'resume') && G.story.flags.hasPack && !pl.seat,
    torchBob: pl.bob * 0.6,
  });
  if (G.mode === 'play' || G.mode === 'ending') G.audio.update(dt, w, pl.eye, { indoor: !!(pl.shape && pl.shape.inside) });
  if (G.showDebug) debugText(); else if (G._dbgShown) { G.ui.debug(''); }
  G._dbgShown = !!G.showDebug;
  inp.endFrame();
}

function playStep(dt) {
  const pl = G.player, w = G.world, inp = G.input, S = G.story;
  if (G.bot) G.bot.drive(dt);
  // crouch / flashlight
  if (inp.hit('crouch') || (inp.pressed.has('ControlLeft') && G.settings.keys.crouch === 'KeyC')) {
    if (!pl.seat && !pl.toggleCrouch(w.current)) G.ui.status('No room to stand.');
  }
  if (inp.hit('flashlight') && S.flags.hasPack) G.survival.toggleFlash();
  const prevPlace = w.current;
  pl.update(dt, inp, w, G);
  w.update(pl);
  // triggers
  const place = w.current;
  if (place !== prevPlace) { for (const t of prevPlace.triggers) t.inside = false; }
  for (const t of place.triggers) {
    const inside = Math.hypot(pl.pos.x - t.x, pl.pos.z - t.z) < t.r;
    if (inside && !t.inside && t.onEnter) t.onEnter();
    if (!inside && t.inside && t.onExit) t.onExit();
    if (inside && t.onStay) t.onStay(dt);
    t.inside = inside;
  }
  // interaction: centre ray within 1.8 m
  const eye = pl.eyePos(), fwd = pl.forward();
  let best = null, bestD = Infinity;
  if (!G.ui.busy && !pl.moveLock || pl.seat) {
    for (const it of place.interactables) {
      const label = it.label();
      if (!label) continue;
      const c = new THREE.Vector3(it.x, it.y, it.z);
      const oc = c.clone().sub(eye);
      const tca = oc.dot(fwd);
      if (tca < 0) continue;
      const d2 = oc.lengthSq() - tca * tca;
      const r = it.r || 0.3;
      if (d2 > r * r) continue;
      const hit = tca - Math.sqrt(Math.max(0, r * r - d2));
      if (hit > PLAYER.interactRange) continue;
      if (hit < bestD) { bestD = hit; best = { it, label }; }
    }
  }
  if (best) {
    const holdNeeded = best.it.hold || 0;
    if (holdNeeded > 0) {
      if (inp.isDown('interact') && holdTarget === best.it) holdT += dt; else holdT = 0;
      holdTarget = best.it;
      if (holdT >= holdNeeded) { holdT = 0; holdTarget = null; best.it.action(); }
      G.ui.prompt(best.label, Math.min(1, holdT / holdNeeded));
    } else {
      G.ui.prompt(best.label);
      if (inp.hit('interact')) best.it.action();
    }
  } else { G.ui.prompt(null); holdT = 0; holdTarget = null; }
  // survival
  const sh = pl.shape || {};
  let nearFire = false;
  for (const l of place.lights) if ((!l.cond || l.cond()) && Math.hypot(pl.pos.x - l.x, pl.pos.z - l.z) < 3.2) nearFire = true;
  G.survival.update(dt, {
    sprinting: pl.sprinting && pl.moving, moving: pl.moving, phase: G.lightLevel,
    indoor: !!sh.inside || place.indoor, refuge: sh.refuge || null, nearFire,
    exposed: place.exposed && !sh.inside, inWater: pl.inWater,
  });
  pl.speedMul = G.survival.warmth < 20 ? 0.87 : 1;
  G.watcher.update(dt);
  G.saves.tick(dt);
}

function debugText() {
  const w = G.world, pl = G.player;
  const fps = Math.round(fpsHist.length / fpsHist.reduce((a, b) => a + b, 0.0001));
  const p = w.current;
  G.ui.debug([
    `${p.name}${p.variant ? ' [' + p.variant + ']' : ''}  (${p.id})   ${fps} fps   portals ${G.renderer.stats.portals}`,
    `pos ${pl.pos.x.toFixed(1)} ${pl.pos.y.toFixed(1)} ${pl.pos.z.toFixed(1)}  yaw ${(pl.yaw % 6.283).toFixed(2)}  light ${G.lightLevel.toFixed(2)}`,
    `exits: ${w.debugExits().join('  |  ')}`,
    `arrival: ${w.arrival ? `${w.arrival.mouth} ← ${w.arrival.fromPlace}.${w.arrival.fromMouth}${w.arrival.expired ? ' (expired)' : ''}` : '—'}`,
    `stamina ${G.survival.stamina.toFixed(0)}  warmth ${G.survival.warmth.toFixed(1)}  hydration ${G.survival.hydration.toFixed(1)}  battery ${G.survival.battery.toFixed(1)}  wet ${G.survival.wet}`,
    `log ${G.story.flags.logArrivals}  junction ${G.story.flags.junctionReturns}  clearing ${G.story.flags.clearingLoops}  ridge ${G.story.flags.ridgeLoops}  laps ${G.story.flags.campLaps}  objective ${G.story.objective}`,
  ].join('\n'));
}

// ------------------------------------------------------------------ development / test API (?dev)
function devApi() {
  const api = {
    G,
    state: () => ({
      mode: G.mode, place: G.world.current.id, x: G.player.pos.x, y: G.player.pos.y, z: G.player.pos.z, yaw: G.player.yaw,
      flags: G.story.flags, objective: G.story.objective, entries: G.story.entries.map(e => e.id), seat: !!G.player.seat,
      survival: G.survival.serialize(), inv: G.inv.serialize(), light: G.lightLevel, crouched: G.player.crouched,
    }),
    newGame: () => newGame(),
    load: (slot) => continueGame(slot),
    teleport: (placeId, x, z, yaw = 0) => {
      G.world.arrival = null; G.world.pending = null;
      G.world.setCurrent(placeId);
      const p = G.world.current;
      G.player.seat = null;
      const y = p.heightAt(x, z);
      const sup = findSupport(p, x, z, y);
      G.player.place(x, sup ? sup.h : y, z, yaw, 0);
      primeTriggers();
    },
    interact: (id) => { const it = G.world.current.interactables.find(i => i.id === id); if (!it) throw new Error('no interactable ' + id + ' in ' + G.world.current.id); it.action(); },
    look: (yaw, pitch = 0) => { G.player.yaw = yaw; G.player.pitch = pitch; },
    setLight: (l) => { G.lightLevel = l; G.story.lightTarget = l; },
    flash: (on) => { G.survival.flashOn = on; },
    // bot: walk a sequence of waypoints [{place, x, z, crouch}]
    walk: (pts) => new Promise((resolve, reject) => {
      G.bot = {
        pts: pts.slice(), t: 0, stuck: 0, lastD: Infinity,
        onCross(c) { while (this.pts.length && this.pts[0].place !== c.to.id) this.pts.shift(); },
        drive(dt) {
          const pl = G.player, inp = G.input;
          this.t += dt;
          inp.down.delete(G.settings.keys.forward);
          const tgt = this.pts[0];
          if (!tgt) { G.bot = null; inp.down.delete(G.settings.keys.forward); resolve(api.state()); return; }
          if (tgt.place !== G.world.current.id) { inp.down.add(G.settings.keys.forward); this.stuck += dt; if (this.stuck > 6) { G.bot = null; api._botErr = `bot stranded: in ${G.world.current.id}, next target in ${tgt.place}`; reject(new Error(`bot stranded: in ${G.world.current.id}, next target in ${tgt.place}`)); } return; }
          if (tgt.crouch && !pl.crouched) pl.toggleCrouch(G.world.current);
          if (!tgt.crouch && pl.crouched && tgt.stand) pl.toggleCrouch(G.world.current);
          const dx = tgt.x - pl.pos.x, dz = tgt.z - pl.pos.z, d = Math.hypot(dx, dz);
          if (d < (tgt.tol || 0.7)) { this.pts.shift(); this.stuck = 0; this.lastD = Infinity; return; }
          pl.yaw = Math.atan2(-dx, -dz);
          pl.pitch = 0;
          inp.down.add(G.settings.keys.forward);
          if (d > this.lastD - 0.002) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
          this.lastD = d;
          if (this.stuck > 5) { G.bot = null; inp.down.delete(G.settings.keys.forward); api._botErr = `bot stuck in ${G.world.current.id} at ${pl.pos.x.toFixed(2)},${pl.pos.z.toFixed(2)} -> ${tgt.x},${tgt.z}`; reject(new Error(`bot stuck in ${G.world.current.id} at ${pl.pos.x.toFixed(2)},${pl.pos.z.toFixed(2)} → ${tgt.x},${tgt.z}`)); }
        },
      };
    }),
    // run the simulation faster than real time (for tests)
    fast: (seconds, dt = 1 / 30) => { G.skipRender = true; const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) { step(dt); } G.skipRender = false; return api.state(); },
    // drive the bot synchronously along waypoints; returns a log of crossings
    run: (pts, maxSeconds = 600, dt = 1 / 30) => {
      const crossings = [];
      const prev = G.world.onCross;
      G.world.onCross = (c) => { crossings.push(`${c.from.id}.${c.mA.id}>${c.to.id}.${c.mB.id}`); prev(c); };
      api._botErr = null;
      api.walk(pts).catch(() => { });
      G.skipRender = true;
      let t = 0;
      try {
        while (G.bot && t < maxSeconds) {
          if (G.mode === 'ending') break;
          if (G.mode !== 'play') { if (G.ui.panel === 'doc') G.ui.closeDoc(); else if (G.ui.panel) G.ui.closePanel(false); G.ui.hideResume(); if (G.mode !== 'ending') G.mode = 'play'; }
          step(dt); t += dt;
        }
      } finally { G.skipRender = false; G.world.onCross = prev; }
      const st = api.state();
      if (G.bot) { G.bot = null; G.input.down.clear(); return { ok: false, error: 'timeout', t, crossings, state: st }; }
      return { ok: !api._botErr, error: api._botErr, t, crossings, state: st };
    },
    closePanels: () => { if (G.ui.panel === 'doc') G.ui.closeDoc(); else if (G.ui.panel) G.ui.closePanel(false); G.ui.hideResume(); if (G.mode !== 'ending') G.mode = 'play'; },
    paths: (placeId) => G.world.get(placeId).paths,
  };
  return api;
}

boot().catch(e => { loading.textContent = 'Failed to start: ' + e.message; console.error(e); });
