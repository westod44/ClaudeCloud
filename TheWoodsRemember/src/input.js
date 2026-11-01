// Keyboard + mouse. Pointer lock when available; drag-to-look fallback otherwise.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.dx = 0; this.dy = 0;
    this.locked = false;
    this.dragLook = false;
    this.dragging = false;
    this.keymap = {};
    this.lockFailed = false;
    this.onLockChange = null;
    this.onKey = null;

    window.addEventListener('keydown', e => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (this.onKey && this.onKey(e) === true) { e.preventDefault(); return; }
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', e => { this.down.delete(e.code); this.released.add(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); });
    document.addEventListener('mousemove', e => {
      if (this.locked || this.dragging) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; }
    });
    canvas.addEventListener('mousedown', e => {
      if (this.dragLook) { this.dragging = true; }
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
      this.dragLook = true;
      if (this.onLockChange) this.onLockChange(false, true);
    });
  }

  requestLock() {
    if (this.dragLook) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.lockFailed = true; this.dragLook = true; if (this.onLockChange) this.onLockChange(false, true); });
    } catch (e) { this.lockFailed = true; this.dragLook = true; }
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  setKeys(keys) { this.keymap = keys; }
  isDown(action) { const c = this.keymap[action]; return c ? this.down.has(c) || (action === 'crouch' && false) : false; }
  hit(action) { const c = this.keymap[action]; return c ? this.pressed.has(c) : false; }
  codeHit(code) { return this.pressed.has(code); }

  takeMouse() { const r = { dx: this.dx, dy: this.dy }; this.dx = 0; this.dy = 0; return r; }
  endFrame() { this.pressed.clear(); this.released.clear(); }
  clear() { this.down.clear(); this.pressed.clear(); this.dx = this.dy = 0; }
}
