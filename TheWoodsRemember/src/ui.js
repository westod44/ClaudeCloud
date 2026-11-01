// Native-resolution interface (bible sections 16-17): quiet during walking, clear during
// inspection. No minimap, compass, waypoint or permanent survival bars.
import { G } from './state.js';
import { DOCS, JOURNAL, OBJECTIVES, ITEM_INFO, CREDITS } from './docs.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from './config.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const KEY_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', sprint: 'Sprint (hold)', crouch: 'Crouch (toggle)',
  interact: 'Interact', flashlight: 'Flashlight', backpack: 'Backpack', map: 'Paper map', journal: 'Journal',
};
const keyName = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R');

export class UI {
  constructor() {
    this.mapNotes = [];
    this.panel = null;
    this.busy = false;
    this.toastT = 0; this.objT = 0; this.statusT = 0; this.cueT = 0; this.capT = 0; this.savedT = 0;
    this.hold = null;
    this.prog = null;
    this.selItem = 0;
    this.selEntry = 0;
    this.docPage = 0;
    this.rebinding = null;
  }

  // ---------------------------------------------------------------- settings
  loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { }
    G.settings = { ...DEFAULT_SETTINGS, ...s, keys: { ...DEFAULT_SETTINGS.keys, ...(s.keys || {}) } };
    this.applySettings();
  }
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) { } this.applySettings(); }
  applySettings() {
    const s = G.settings;
    this.resize();
    G.input && G.input.setKeys(s.keys);
    G.renderer && G.renderer.applySettings({ worldRes: s.worldRes, nearest: s.nearest, fov: s.fov, brightness: s.brightness });
    G.audio && G.audio.applyVolumes();
    document.documentElement.style.setProperty('--sub', String(s.subtitleSize));
    $('#dot').style.display = s.centreDot ? '' : 'none';
  }
  resize() {
    const u = Math.max(0.62, Math.min(1.6, window.innerHeight / 1080)) * (G.settings ? G.settings.uiScale : 1);
    document.documentElement.style.setProperty('--u', String(u));
  }

  // ---------------------------------------------------------------- HUD
  prompt(text, holdFrac = 0) {
    const el = $('#prompt');
    if (!text) { el.style.opacity = 0; $('#hold').style.opacity = 0; return; }
    const k = keyName(G.settings.keys.interact);
    el.innerHTML = `<span class="key">${esc(k)}</span>${esc(text)}`;
    el.style.opacity = 1;
    $('#hold').style.opacity = holdFrac > 0 ? 1 : 0;
    $('#hold > div').style.width = `${Math.round(holdFrac * 100)}%`;
  }
  toast(text, sec = 4.5) { const el = $('#toast'); el.textContent = text; el.style.opacity = 1; this.toastT = sec + text.length * 0.02; }
  objective(text) { const el = $('#objective'); el.innerHTML = `<small>OBJECTIVE</small>${esc(text)}`; el.style.opacity = 1; this.objT = 5; }
  status(text) { const el = $('#status'); el.textContent = text; el.style.opacity = 1; this.statusT = 4; }
  cue(text) { if (!G.settings.soundCaptions && !text.startsWith('[footsteps')) return; const el = $('#cue'); el.textContent = text; el.style.opacity = 1; this.cueT = 3; }
  caption(text, sec = 2.5) {
    if (!G.settings.subtitles) return;
    const el = $('#captions'); el.textContent = text; el.style.opacity = text ? 1 : 0; this.capT = sec;
  }
  saved() { const el = $('#saved'); el.style.opacity = 1; this.savedT = 2.2; }
  journalPing() { const el = $('#jping'); el.style.opacity = 1; this.pingT = 3; }
  mapNote(t) { if (!this.mapNotes.includes(t)) this.mapNotes.push(t); }

  battery() {
    const s = G.survival, el = $('#battery');
    const show = this.panel === 'backpack' || (s.battery < 15 && s.flashOn);
    el.style.opacity = show ? 1 : 0;
    el.textContent = `Battery ${Math.ceil(s.battery)}%`;
  }

  update(dt) {
    const fade = (id, key) => { if (this[key] > 0) { this[key] -= dt; if (this[key] <= 0) $(id).style.opacity = 0; } };
    fade('#toast', 'toastT'); fade('#objective', 'objT'); fade('#status', 'statusT'); fade('#cue', 'cueT'); fade('#captions', 'capT'); fade('#saved', 'savedT'); fade('#jping', 'pingT');
    this.battery();
    if (this.prog) {
      this.prog.t += dt;
      $('#progress').style.opacity = 1;
      $('#progress').innerHTML = `${esc(this.prog.label)}<div class="bar"><div style="width:${Math.min(100, (this.prog.t / this.prog.dur) * 100)}%"></div></div>`;
      if (this.prog.t >= this.prog.dur) { const d = this.prog.done; this.prog = null; $('#progress').style.opacity = 0; d(); }
    }
  }

  progress(label, dur, done) { this.prog = { label, dur, t: 0, done }; }

  fade(sec, mid, label = '') {
    this.busy = true;
    const el = $('#fade');
    el.innerHTML = label ? `<div class="fade-label">${esc(label)}</div>` : '';
    el.style.transition = 'opacity 0.8s'; el.style.opacity = 1;
    G.player.moveLock = true;
    setTimeout(() => { mid && mid(); }, 900);
    setTimeout(() => { el.style.opacity = 0; G.player.moveLock = false; this.busy = false; }, sec * 1000);
  }

  black(on, text = '', ms = 1200) {
    const el = $('#fade');
    el.style.transition = `opacity ${ms / 1000}s`;
    el.innerHTML = text ? `<div class="end-title">${esc(text)}</div>` : '';
    el.style.opacity = on ? 1 : 0;
  }

  // ---------------------------------------------------------------- panels (pause gameplay timers)
  openPanel(name) {
    this.panel = name;
    this.prevMode = G.mode === 'panel' ? this.prevMode : G.mode;
    G.mode = 'panel';
    G.input.releaseLock();
    const el = $('#panel');
    el.className = 'panel ' + name;
    this.renderPanel();
    G.audio && G.audio.pause(false);
  }
  closePanel(relock = true) {
    this.panel = null;
    $('#panel').className = 'panel hidden';
    G.mode = 'play';
    if (relock) G.input.requestLock();
    if (!G.input.locked && !G.input.dragLook) this.showResume();
  }
  showResume() { if (!G.input.dragLook) { G.mode = 'resume'; $('#resume').classList.remove('hidden'); } }
  hideResume() { $('#resume').classList.add('hidden'); }

  renderPanel() {
    const el = $('#panel');
    const p = this.panel;
    if (p === 'backpack') el.innerHTML = this.backpackHTML();
    else if (p === 'journal') el.innerHTML = this.journalHTML();
    else if (p === 'map') el.innerHTML = this.mapHTML();
    else if (p === 'doc') el.innerHTML = this.docHTML();
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); this.act(b.dataset.act, b.dataset.arg); }));
  }

  act(a, arg) {
    if (a === 'close') this.closePanel();
    if (a === 'sel') { this.selItem = +arg; this.renderPanel(); }
    if (a === 'entry') { this.selEntry = +arg; const e = G.story.entries[this.selEntry]; if (e) e.fresh = false; this.renderPanel(); }
    if (a === 'use') this.useItem();
    if (a === 'note') { this.docList = [arg]; this.docPage = 0; this.docCb = null; this.panel = 'doc'; this.renderPanel(); }
    if (a === 'page') { this.docPage = Math.max(0, Math.min(this.docList.length - 1, this.docPage + +arg)); this.renderPanel(); }
  }

  items() {
    const inv = G.inv;
    return [
      { key: 'water', label: 'Water', info: ITEM_INFO.water(inv.water), action: inv.water >= 250 ? 'Drink 250 mL' : null },
      { key: 'food', label: 'Food', info: ITEM_INFO.food(inv.snacks), action: inv.snacks > 0 ? 'Eat snack' : null },
      { key: 'batteries', label: 'Batteries', info: ITEM_INFO.batteries(inv.spares), action: inv.spares > 0 ? 'Replace battery' : null },
      { key: 'fire', label: 'Fire kit', info: ITEM_INFO.fire(), action: null },
      { key: 'map', label: 'Map / journal', info: ITEM_INFO.map(), action: 'Open map' },
      { key: 'notes', label: 'Notes', info: ITEM_INFO.notes(G.story.notes.length), action: null },
    ];
  }

  backpackHTML() {
    const items = this.items();
    const it = items[this.selItem] || items[0];
    const s = G.survival;
    const grid = items.map((x, i) => `<button class="slot ${i === this.selItem ? 'sel' : ''}" data-act="sel" data-arg="${i}">${esc(x.label)}${x.key === 'water' ? `<small>${G.inv.water} mL</small>` : x.key === 'batteries' ? `<small>${G.inv.spares} spare</small>` : x.key === 'food' ? `<small>${G.inv.snacks}</small>` : ''}</button>`).join('');
    let right = `<h3>${esc(it.info.name.toUpperCase())}</h3><p>${esc(it.info.desc)}</p><p class="dim">${esc(it.info.actionDesc).replace(/\n/g, '<br>')}</p>`;
    if (it.key === 'notes') right += `<div class="notes">${G.story.notes.map(id => `<button class="linkbtn" data-act="note" data-arg="${id}">${esc(DOCS[id]?.title || id)}</button>`).join('') || '<p class="dim">Nothing yet.</p>'}</div>`;
    if (it.action) right += `<button class="action" data-act="use">${esc(it.action)}</button>`;
    const cond = [];
    if (s.warmth < 40) cond.push(s.warmth < 20 ? 'Very cold' : 'Cold');
    if (s.hydration < 20) cond.push('Thirsty');
    if (s.wet) cond.push('Wet');
    cond.push(`Flashlight ${Math.ceil(s.battery)}%`);
    return `<div class="phead"><h2>BACKPACK</h2><span class="dim">${esc(cond.join(' · '))}</span><button class="x" data-act="close">${esc(keyName(G.settings.keys.backpack))} / Esc</button></div>
      <div class="bp"><div class="grid">${grid}</div><div class="detail">${right}</div></div>`;
  }

  useItem() {
    const it = this.items()[this.selItem];
    if (!it || !it.action) return;
    if (it.key === 'water') G.inv.drink();
    if (it.key === 'food') G.inv.eat();
    if (it.key === 'batteries') { this.closePanel(); G.inv.replaceBattery(); return; }
    if (it.key === 'map') { this.openPanel('map'); return; }
    this.renderPanel();
  }

  journalHTML() {
    const S = G.story;
    const list = S.entries.map((e, i) => `<button class="entry ${i === this.selEntry ? 'sel' : ''}" data-act="entry" data-arg="${i}">${e.fresh ? '<i class="new"></i>' : ''}${esc(JOURNAL[e.id]?.title || e.id)}</button>`).join('');
    const sel = S.entries[this.selEntry] || S.entries[0];
    const j = JOURNAL[sel.id] || { title: sel.id, text: '' };
    return `<div class="phead"><h2>JOURNAL</h2><button class="x" data-act="close">${esc(keyName(G.settings.keys.journal))} / Esc</button></div>
      <div class="objective-line"><small>OBJECTIVE</small>${esc(OBJECTIVES[S.objective])}</div>
      <div class="jr"><div class="list">${list}</div><div class="text"><h3>${esc(j.title.toUpperCase())}</h3><p>${esc(j.text)}</p></div></div>`;
  }

  mapHTML() {
    const notes = this.mapNotes.map((n, i) => `<text x="70" y="${520 + i * 26}" class="hand">${esc(n)}</text>`).join('');
    return `<div class="phead"><h2>PAPER MAP</h2><button class="x" data-act="close">${esc(keyName(G.settings.keys.map))} / Esc</button></div>
    <svg class="papermap" viewBox="0 0 700 600" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="700" height="600" fill="#d9d2bd"/>
      <line x1="350" y1="0" x2="350" y2="600" stroke="#c4bba3" stroke-width="3"/>
      <text x="40" y="58" class="mt">BELLWETHER / CREEK LOOP</text>
      <text x="40" y="96" class="ms">45-minute loop</text><text x="40" y="122" class="ms">Stay on marked trails</text>
      <path d="M90 470 L120 250 L250 170 L420 190 L520 330 L470 470 Z" fill="none" stroke="#5f6a4f" stroke-width="5" stroke-dasharray="2 0"/>
      <path d="M10 330 C 90 300, 150 380, 230 350 S 380 260, 440 330 S 600 360, 690 300" fill="none" stroke="#5f7a8a" stroke-width="14" stroke-linecap="round"/>
      <rect x="20" y="20" width="660" height="560" fill="none" stroke="#3a3a32" stroke-width="2" stroke-dasharray="10 6"/>
      <circle cx="90" cy="470" r="7" fill="#151a18"/><text x="104" y="476" class="ml">CAR PARK</text>
      <circle cx="170" cy="358" r="7" fill="#151a18"/><text x="184" y="388" class="ml">BRIDGE</text>
      <circle cx="420" cy="190" r="7" fill="#151a18"/><text x="434" y="196" class="ml">SHELTER</text>
      <circle cx="505" cy="420" r="7" fill="#151a18"/><text x="519" y="426" class="ml">LOOKOUT</text>
      <text x="40" y="500" class="hand">${this.mapNotes.length ? 'Handwritten after discovery:' : ''}</text>
      ${notes}
    </svg><p class="dim mapnote">The map shows expected geography. It never shows where you are.</p>`;
  }

  // ---------------------------------------------------------------- documents
  doc(id) { this.docPages([id]); }
  docPages(ids, cb = null) {
    this.docList = ids; this.docPage = 0; this.docCb = cb;
    ids.forEach(id => G.story && G.story.addNote(id));
    if (this.panel !== 'doc') this.openPanel('doc'); else this.renderPanel();
  }
  docCustom(title, body, style, cb) {
    DOCS.__custom = { title, body, style };
    this.docList = ['__custom']; this.docPage = 0; this.docCb = cb;
    this.openPanel('doc');
  }
  docHTML() {
    const id = this.docList[this.docPage];
    const d = DOCS[id] || { title: id, body: [] };
    const n = this.docList.length;
    const nav = n > 1 ? `<div class="pager"><button data-act="page" data-arg="-1" ${this.docPage === 0 ? 'disabled' : ''}>◀ Previous</button><span>${this.docPage + 1} / ${n}</span><button data-act="page" data-arg="1" ${this.docPage === n - 1 ? 'disabled' : ''}>Next ▶</button></div>` : '';
    return `<div class="phead"><h2>${esc(d.title.toUpperCase())}</h2><button class="x" data-act="close">Esc</button></div>
      <div class="paper ${d.style || 'note'}">${d.body.map(b => `<p>${esc(b)}</p>`).join('')}</div>${nav}`;
  }

  closeDoc() {
    const cb = this.docCb; this.docCb = null;
    this.closePanel(!cb);
    if (cb) cb();
  }

  // ---------------------------------------------------------------- keyboard while a panel is open
  panelKey(e) {
    const k = G.settings.keys;
    const code = e.code;
    if (code === 'Escape') { if (this.panel === 'doc') this.closeDoc(); else this.closePanel(false); return true; }
    if (this.panel === 'backpack' && (code === k.backpack)) { this.closePanel(); return true; }
    if (this.panel === 'journal' && code === k.journal) { this.closePanel(); return true; }
    if (this.panel === 'map' && code === k.map) { this.closePanel(); return true; }
    if (this.panel === 'doc' && (code === k.interact || code === 'Enter' || code === 'Space')) {
      if (this.docPage < this.docList.length - 1) { this.docPage++; this.renderPanel(); } else this.closeDoc();
      return true;
    }
    if (this.panel === 'doc' && (code === 'ArrowRight' || code === 'ArrowLeft')) { this.act('page', code === 'ArrowRight' ? 1 : -1); return true; }
    if (code === k.journal && this.panel !== 'journal') { this.openPanel('journal'); return true; }
    if (code === k.map && this.panel !== 'map') { this.openPanel('map'); return true; }
    if (code === k.backpack && this.panel !== 'backpack') { this.openPanel('backpack'); return true; }
    if (this.panel === 'backpack') {
      const n = 6;
      if (code === 'ArrowRight' || code === 'KeyD') this.selItem = (this.selItem + 1) % n;
      if (code === 'ArrowLeft' || code === 'KeyA') this.selItem = (this.selItem + n - 1) % n;
      if (code === 'ArrowDown' || code === 'KeyS') this.selItem = (this.selItem + 2) % n;
      if (code === 'ArrowUp' || code === 'KeyW') this.selItem = (this.selItem + n - 2) % n;
      if (code === 'Enter' || code === k.interact) { this.useItem(); return true; }
      this.renderPanel(); return true;
    }
    if (this.panel === 'journal') {
      const n = G.story.entries.length;
      if (code === 'ArrowDown' || code === 'KeyS') this.act('entry', (this.selEntry + 1) % n);
      if (code === 'ArrowUp' || code === 'KeyW') this.act('entry', (this.selEntry + n - 1) % n);
      return true;
    }
    return true;
  }

  // ---------------------------------------------------------------- menus
  menu(name) {
    const el = $('#menu');
    this.menuName = name;
    if (!name) { el.className = 'hidden'; el.innerHTML = ''; return; }
    el.className = 'menu ' + name;
    let html = '';
    if (name === 'title') {
      const seen = G.saves.endingsSeen();
      const latest = G.saves.latest();
      html = `<div class="title-block"><h1>THE WOODS<br>REMEMBER</h1><p class="sub">A first-person walk that will not let you leave the way you came.</p></div>
        <div class="buttons">
          <button data-m="new">New Game</button>
          <button data-m="continue" ${latest ? '' : 'disabled'}>Continue</button>
          <button data-m="load" ${latest ? '' : 'disabled'}>Load Checkpoint</button>
          <button data-m="settings">Settings</button>
          <button data-m="credits">Credits</button>
          <button data-m="quit">Quit</button>
        </div>
        <p class="endings">${seen.length ? 'Endings seen: ' + seen.map(e => ({ A: 'The Road', B: 'The Long Way Home', C: 'The Place You Were' }[e])).join(' · ') : ''}</p>
        <p class="controls">WASD move · Mouse look · Shift sprint · C crouch · E interact · F flashlight · Tab backpack · M map · J journal · Esc pause</p>`;
    } else if (name === 'pause') {
      html = `<h2>PAUSED</h2><div class="buttons">
        <button data-m="resume">Resume</button>
        <button data-m="save">Save</button>
        <button data-m="load">Load Checkpoint</button>
        <button data-m="settings">Settings</button>
        <button data-m="title">Quit to Title</button></div>`;
    } else if (name === 'load') {
      const list = G.saves.list();
      const names = { manual: 'Manual', radio: 'Checkpoint', auto0: 'Autosave', auto1: 'Autosave', auto2: 'Autosave' };
      html = `<h2>LOAD CHECKPOINT</h2><div class="buttons saves">${list.map(s => `<button data-m="loadslot" data-slot="${s.slot}">${esc(names[s.slot])} — ${esc(s.label)}<small>${new Date(s.time).toLocaleString()}</small></button>`).join('') || '<p class="dim">No saves yet.</p>'}
        <button data-m="back">Back</button></div>`;
    } else if (name === 'settings') {
      html = this.settingsHTML();
    } else if (name === 'credits') {
      html = `<div class="credits">${CREDITS.map(l => `<p>${esc(l)}</p>`).join('')}</div><div class="buttons"><button data-m="back">Back</button></div>`;
    } else if (name === 'quit') {
      html = `<h2>You can close this tab.</h2><div class="buttons"><button data-m="back">Back to title</button></div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => G.onMenu(b.dataset.m, b.dataset.slot)));
    el.querySelectorAll('[data-set]').forEach(inp => inp.addEventListener('input', () => this.setFromInput(inp)));
    el.querySelectorAll('[data-bind]').forEach(b => b.addEventListener('click', () => { this.rebinding = b.dataset.bind; b.textContent = 'Press a key…'; }));
  }

  settingsHTML() {
    const s = G.settings;
    const range = (key, label, min, max, step, fmt = (v) => v) => `<label><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-set="${key}"><b id="v-${key}">${fmt(s[key])}</b></label>`;
    const check = (key, label) => `<label class="chk"><span>${label}</span><input type="checkbox" ${s[key] ? 'checked' : ''} data-set="${key}"></label>`;
    const sel = (key, label, opts) => `<label><span>${label}</span><select data-set="${key}">${opts.map(([v, t]) => `<option value="${v}" ${String(s[key]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
    const binds = Object.keys(KEY_LABELS).map(a => `<label><span>${KEY_LABELS[a]}</span><button class="bind" data-bind="${a}">${esc(keyName(s.keys[a]))}</button></label>`).join('');
    return `<h2>SETTINGS</h2><div class="settings">
      <div class="col"><h3>Controls</h3>
        ${range('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, v => (+v).toFixed(2))}
        ${check('invertY', 'Invert Y')}
        ${range('fov', 'Field of view', 75, 105, 1, v => v + '°')}
        ${check('headBob', 'Head bob')}
        ${check('centreDot', 'Centre dot')}
        <h3>Display</h3>
        ${sel('worldRes', 'World resolution', [[360, '640 × 360'], [540, '960 × 540'], [0, 'Full output']])}
        ${check('nearest', 'Nearest-neighbour upscaling')}
        ${range('brightness', 'Brightness', 0.6, 1.6, 0.05, v => (+v).toFixed(2))}
        ${range('uiScale', 'UI scale', 1, 1.5, 0.05, v => Math.round(v * 100) + '%')}
      </div>
      <div class="col"><h3>Audio</h3>
        ${range('master', 'Master', 0, 1, 0.05, v => Math.round(v * 100))}
        ${range('ambience', 'Ambience', 0, 1, 0.05, v => Math.round(v * 100))}
        ${range('effects', 'Effects', 0, 1, 0.05, v => Math.round(v * 100))}
        ${range('music', 'Music', 0, 1, 0.05, v => Math.round(v * 100))}
        ${check('subtitles', 'Subtitles')}
        ${range('subtitleSize', 'Subtitle size', 0.8, 1.6, 0.05, v => Math.round(v * 100) + '%')}
        ${check('soundCaptions', 'Visual cues for sound clues')}
      </div>
      <div class="col"><h3>Keys</h3>${binds}<p class="dim">Click a binding, then press a key. Escape is always pause.</p></div>
    </div><div class="buttons row"><button data-m="defaults">Defaults</button><button data-m="back">Back</button></div>`;
  }

  setFromInput(inp) {
    const key = inp.dataset.set;
    let v = inp.type === 'checkbox' ? inp.checked : inp.value;
    if (inp.type === 'range' || key === 'worldRes') v = +v;
    G.settings[key] = v;
    const out = document.getElementById('v-' + key);
    if (out) out.textContent = inp.type === 'range' ? (key === 'fov' ? v + '°' : ['master', 'ambience', 'effects', 'music'].includes(key) ? Math.round(v * 100) : ['uiScale', 'subtitleSize'].includes(key) ? Math.round(v * 100) + '%' : (+v).toFixed(2)) : '';
    this.saveSettings();
  }

  rebindKey(e) {
    if (!this.rebinding) return false;
    if (e.code !== 'Escape') {
      for (const a in G.settings.keys) if (G.settings.keys[a] === e.code) G.settings.keys[a] = G.settings.keys[this.rebinding];
      G.settings.keys[this.rebinding] = e.code;
    }
    this.rebinding = null;
    this.saveSettings();
    this.menu('settings');
    return true;
  }

  card(a, b) {
    const el = $('#card');
    if (!a) { el.style.opacity = 0; return; }
    const c = (x) => `<div class="c"><small>${esc(x[0])}</small><b>${esc(x[1])}</b><span>${esc(x[2])}</span></div>`;
    el.innerHTML = c(a) + c(b);
    el.style.opacity = 1;
  }

  creditsRoll(lines) {
    const el = $('#credits-roll');
    if (!lines) { el.style.display = 'none'; return; }
    el.innerHTML = lines.map(l => `<p>${esc(l) || '&nbsp;'}</p>`).join('');
    el.style.display = 'flex';
  }

  closePanelSilently() { this.panel = null; $('#panel').className = 'panel hidden'; this.hideResume(); }

  debug(text) { const el = $('#debug'); el.style.display = text ? 'block' : 'none'; if (text) el.textContent = text; }
}
