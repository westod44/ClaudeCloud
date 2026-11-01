# The Woods Remember

First-person spatial horror built from *The Woods Remember — Visual Production Bible*.
Browser build (three.js r160, vendored), no build step.

**Status: early playable build, work in progress.** All 18 places, the join/portal
system, survival, journal, map, saves and the three endings are implemented; the
automated route tests and final polish are still in progress.

## Run

```bash
cd TheWoodsRemember && python3 -m http.server 8765
```

Open http://localhost:8765/ in a desktop browser (WebGL required). Add `?dev` for the
debug overlay (F3 toggles it) and the `window.__twr` test API.

## Controls

WASD move · mouse look · Shift sprint · C crouch · E interact (hold for the radio) ·
F flashlight · Tab backpack · M paper map · J journal · Esc pause. All keys rebindable.

## Deviations from the bible

- Engine: browser/three.js instead of Unreal Engine 4.27 + packaged Windows build
  (neither is available in this environment).
- Crouch defaults to C (Ctrl+W closes browser tabs); Ctrl also toggles crouch.
- No recorded voices: radio and roadside lines are captioned over nonverbal static.
