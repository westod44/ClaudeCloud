#!/usr/bin/env python3
"""
Import hand-made art that replaces baked assets.

Source images (as supplied) live in assets/custom/source/:
  trees/<name>.png              sprite body (binary alpha), same canvas as the baked frame
  trees/<name>_with_shadow.png  the same sprite composited over its ground shadow
  terrain/<id>.png              384x384 tileable terrain texture

This script writes game-ready files to assets/custom/:
  sprites/<name>.png + <name>_shadow.png   sheets with 3 leaf-flutter frames (frame 0 is the source image untouched;
                                           frames 1-2 shift leaf clusters by about a pixel with a smooth field that
                                           leaves trunks still), plus the shadow separated from the composite
  terrain/<id>.png                         the texture, opaque RGBA
  custom.json                              what tools/bake.js must override

Then run:  node tools/bake.js --relink   (rebuilds the atlas without re-rendering anything)
Needs Python 3 with Pillow and NumPy.
"""
import json, math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets/custom/source')
OUT = os.path.join(ROOT, 'assets/custom')

# flutter amplitude (px) and where the moving canopy starts/ends, as fractions of sprite height above the ground point
SPECIES = {
    'oak': (1.15, 0.30, 0.55), 'maple': (1.15, 0.30, 0.55), 'aspen': (1.1, 0.35, 0.6), 'birch': (1.1, 0.35, 0.6),
    'pine': (0.8, 0.15, 0.4), 'palm': (1.3, 0.55, 0.75), 'bush': (0.9, 0.0, 0.45), 'berry': (0.9, 0.0, 0.45),
    'fern': (1.0, 0.0, 0.4), 'dead': (0.0, 0.5, 0.8),
}
FRAMES = 3


def flutter(body, ay, name):
    amp, s0, s1 = SPECIES[name.split('_')[0]]
    arr = np.asarray(body)
    H, W = arr.shape[:2]
    opaque = np.where(arr[:, :, 3] > 0)[0]
    top = int(opaque.min()) if len(opaque) else 0
    span = max(1, ay - top)
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    y0, y1 = ay - span * s0, ay - span * s1
    w = np.clip((y0 - yy) / max(1e-6, y0 - y1), 0, 1)
    seed = sum(ord(c) for c in name) * 0.37
    f = 0.55 * xx + 0.37 * yy + seed
    g = 0.41 * xx - 0.60 * yy + seed * 1.7
    frames = [arr]
    for k in range(1, FRAMES):
        ph = 2 * math.pi * k / FRAMES
        dx = amp * w * (0.7 * (np.sin(f + ph) - np.sin(f)) + 0.3 * (np.sin(g + ph + 1) - np.sin(g + 1)))
        dy = 0.45 * amp * w * (np.sin(g + ph) - np.sin(g))
        sx = np.clip(np.rint(xx - dx), 0, W - 1).astype(int)
        sy = np.clip(np.rint(yy - dy), 0, H - 1).astype(int)
        frames.append(arr[sy, sx])
    return np.concatenate(frames, axis=1)


def main():
    manifest = json.load(open(os.path.join(ROOT, 'assets/manifest.json')))
    meta = {a['name']: a for a in manifest['assets']}
    os.makedirs(os.path.join(OUT, 'sprites'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'terrain'), exist_ok=True)
    cfg = {'sprites': {}, 'terrain': []}
    tdir = os.path.join(SRC, 'trees')
    for fn in sorted(os.listdir(tdir)):
        if not fn.endswith('.png') or fn.endswith('_with_shadow.png'):
            continue
        name = fn[:-4]
        if name not in meta:
            print('skip (no such asset):', name); continue
        m = meta[name]
        body = Image.open(os.path.join(tdir, fn)).convert('RGBA')
        if body.size != (m['w'], m['h']):
            sys.exit(f'{name}: image is {body.size}, the game frame is {(m["w"], m["h"])}')
        b = np.array(body)
        b[:, :, 3] = np.where(b[:, :, 3] >= 128, 255, 0)  # keep the style's binary alpha
        comp_path = os.path.join(tdir, name + '_with_shadow.png')
        shadow = np.zeros_like(b)
        if os.path.exists(comp_path):
            c = np.asarray(Image.open(comp_path).convert('RGBA'))
            mask = (b[:, :, 3] == 0) & (c[:, :, 3] > 0)
            shadow[mask] = c[mask]
        sheet = flutter(b, m['ay'], name)
        Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, 'sprites', name + '.png'), optimize=True)
        Image.fromarray(np.concatenate([shadow] * FRAMES, axis=1), 'RGBA').save(os.path.join(OUT, 'sprites', name + '_shadow.png'), optimize=True)
        cfg['sprites'][name] = {'w': m['w'], 'h': m['h'], 'frames': FRAMES, 'source': f'assets/custom/source/trees/{fn}'}
        print('sprite', name)
    gdir = os.path.join(SRC, 'terrain')
    for fn in sorted(os.listdir(gdir)):
        if not fn.endswith('.png'):
            continue
        tid = fn[:-4]
        im = Image.open(os.path.join(gdir, fn)).convert('RGBA')
        if im.size != (384, 384):
            sys.exit(f'terrain {tid}: must be 384x384, got {im.size}')
        a = np.array(im); a[:, :, 3] = 255
        Image.fromarray(a, 'RGBA').save(os.path.join(OUT, 'terrain', tid + '.png'), optimize=True)
        cfg['terrain'].append(tid)
        print('terrain', tid)
    json.dump(cfg, open(os.path.join(OUT, 'custom.json'), 'w'), indent=1)
    print(f"{len(cfg['sprites'])} sprites, {len(cfg['terrain'])} terrain textures -> assets/custom/ (now run: node tools/bake.js --relink)")


if __name__ == '__main__':
    main()
