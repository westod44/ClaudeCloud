#!/usr/bin/env node
/*
 * Bakes every asset in tools/bake.html with headless Chromium and writes the dataset:
 *   assets/sprites/<name>.png + <name>_shadow.png   sprite sheets (body + shadow layers)
 *   assets/terrain/<id>.png                         tileable terrain textures
 *   assets/manifest.json                            metadata for every asset
 *   assets/atlas.js                                 everything inlined (data URIs) for the game
 *   dataset/style.json, dataset/palette.json, dataset/palette.pal (JASC-PAL, as AoE2 used)
 * Usage: node tools/bake.js            (all assets)
 *        node tools/bake.js oak_1,well (subset, only previews, writes nothing)
 *        node tools/bake.js --relink   (no rendering: rebuild manifest + atlas from the files on disk)
 * Hand-made replacements in assets/custom/ (see tools/import_custom.py and assets/custom/custom.json)
 * always override the baked versions, so a re-bake never loses them.
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');

const dataURL = file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
const b64 = d => Buffer.from(d.split(',')[1], 'base64');
function applyCustom(res) { // swap in hand-made art from assets/custom/
  const cfgPath = path.join(ROOT, 'assets/custom/custom.json'); if (!fs.existsSync(cfgPath)) return;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')), dir = path.join(ROOT, 'assets/custom');
  for (const [name, c] of Object.entries(cfg.sprites || {})) {
    const a = res.assets.find(q => q.name === name); if (!a) { console.warn('custom sprite has no asset:', name); continue; }
    if (a.w !== c.w || a.h !== c.h) throw new Error(`custom ${name} is ${c.w}x${c.h}, asset is ${a.w}x${a.h}`);
    a.body = dataURL(path.join(dir, 'sprites', name + '.png'));
    const sh = path.join(dir, 'sprites', name + '_shadow.png'); if (fs.existsSync(sh)) a.shadow = dataURL(sh);
    a.frames = c.frames; a.custom = c.source || true;
  }
  for (const id of cfg.terrain || []) res.terrain[id] = dataURL(path.join(dir, 'terrain', id + '.png'));
  console.log(`applied ${Object.keys(cfg.sprites || {}).length} custom sprites and ${(cfg.terrain || []).length} custom terrain textures`);
}

(async () => {
  const subset = process.argv[2] === '--relink' ? null : process.argv[2], relink = process.argv[2] === '--relink';
  let res;
  if (relink) { // rebuild from what is on disk
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
    res = { assets: man.assets.map(({ files, ...meta }) => Object.assign(meta, { body: dataURL(path.join(ROOT, files.body)), shadow: files.shadow ? dataURL(path.join(ROOT, files.shadow)) : null })), terrain: {} };
    for (const t of man.terrain) res.terrain[t.id] = dataURL(path.join(ROOT, t.file));
  } else res = await render(subset);
  if (!res) return;
  applyCustom(res);
  write(res);
})();

async function render(subset) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  const url = 'file://' + path.join(ROOT, 'tools/bake.html') + (subset ? '#' + subset : '');
  await page.goto(url);
  const t0 = Date.now();
  await page.waitForFunction(() => window.BAKE_RESULT || window.BAKE_ERROR, null, { timeout: 0, polling: 1000 });
  const err = await page.evaluate(() => window.BAKE_ERROR);
  if (err) { console.error(err); process.exit(1); }
  const res = await page.evaluate(() => window.BAKE_RESULT);
  console.log(await page.evaluate(() => document.getElementById('log').textContent));
  console.log(`baked in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
  if (subset) {
    fs.mkdirSync('/tmp/bake-preview', { recursive: true });
    for (const a of res.assets) { fs.writeFileSync(`/tmp/bake-preview/${a.name}.png`, b64(a.body)); if (a.shadow) fs.writeFileSync(`/tmp/bake-preview/${a.name}_shadow.png`, b64(a.shadow)); }
    for (const [id, d] of Object.entries(res.terrain)) fs.writeFileSync(`/tmp/bake-preview/terrain_${id}.png`, b64(d));
    console.log('previews in /tmp/bake-preview'); return null;
  }
  return res;
}
function write(res) {
  const sp = path.join(ROOT, 'assets/sprites'), tp = path.join(ROOT, 'assets/terrain');
  fs.rmSync(sp, { recursive: true, force: true }); fs.rmSync(tp, { recursive: true, force: true });
  fs.mkdirSync(sp, { recursive: true }); fs.mkdirSync(tp, { recursive: true }); fs.mkdirSync(path.join(ROOT, 'dataset'), { recursive: true });
  const manifest = { generated: new Date().toISOString(), style: 'dataset/style.json', palette: 'dataset/palette.json', assets: [], terrain: [] };
  const atlas = { manifest: null, images: {} };
  for (const a of res.assets) {
    fs.writeFileSync(path.join(sp, a.name + '.png'), b64(a.body));
    if (a.shadow) fs.writeFileSync(path.join(sp, a.name + '_shadow.png'), b64(a.shadow));
    const { body, shadow, ...meta } = a;
    meta.files = { body: `assets/sprites/${a.name}.png`, shadow: shadow ? `assets/sprites/${a.name}_shadow.png` : null };
    manifest.assets.push(meta);
    atlas.images[a.name] = body; if (shadow) atlas.images[a.name + '_shadow'] = shadow;
  }
  for (const [id, d] of Object.entries(res.terrain)) {
    fs.writeFileSync(path.join(tp, id + '.png'), b64(d));
    manifest.terrain.push({ id, file: `assets/terrain/${id}.png`, size: 384, texelsPerTile: 96 });
    atlas.images['terrain_' + id] = d;
  }
  atlas.manifest = manifest;
  fs.writeFileSync(path.join(ROOT, 'assets/manifest.json'), JSON.stringify(manifest, null, 1));
  // split the inlined images into ~5 MB chunks; atlas.js holds the manifest and the chunk count
  for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) if (/^atlas(-\d+)?\.js$/.test(f)) fs.unlinkSync(path.join(ROOT, 'assets', f));
  const chunks = [[]]; let size = 0;
  for (const [k, v] of Object.entries(atlas.images)) { if (size + v.length > 5e6 && chunks[chunks.length - 1].length) { chunks.push([]); size = 0; } chunks[chunks.length - 1].push([k, v]); size += v.length; }
  fs.writeFileSync(path.join(ROOT, 'assets/atlas.js'), '/* generated by tools/bake.js — do not edit */\nwindow.ATLAS=' + JSON.stringify({ manifest, images: {}, chunks: chunks.length }) + ';\n');
  chunks.forEach((c, n) => fs.writeFileSync(path.join(ROOT, `assets/atlas-${n}.js`), '/* generated */\nObject.assign(window.ATLAS.images,' + JSON.stringify(Object.fromEntries(c)) + ');\n'));
  const STYLE = require(path.join(ROOT, 'src/style.js'));
  fs.writeFileSync(path.join(ROOT, 'dataset/style.json'), JSON.stringify(STYLE, null, 2));
  if (res.palette) {
    fs.writeFileSync(path.join(ROOT, 'dataset/palette.json'), JSON.stringify({ used: res.palette.used, colors: res.palette.colors.map((c, i) => ({ index: i, name: res.palette.names[i], rgb: c, hex: '#' + c.map(v => v.toString(16).padStart(2, '0')).join('') })) }, null, 1));
    fs.writeFileSync(path.join(ROOT, 'dataset/palette.pal'), res.palette.jasc);
  }
  console.log(`wrote ${manifest.assets.length} sprite assets, ${manifest.terrain.length} terrain textures, atlas in ${chunks.length} chunks, ${(Object.values(atlas.images).reduce((a, v) => a + v.length, 0) / 1e6).toFixed(2)} MB`);
}
