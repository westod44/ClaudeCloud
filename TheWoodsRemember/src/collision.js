// Walkable shapes and obstacles. The readable route is walkable; natural borders
// are dense scenery with simple collision beyond (bible section 12).
import { segDist, clamp } from './noise.js';
import { PLAYER } from './config.js';

export function shapeContains(s, x, z, margin = 0) {
  switch (s.k) {
    case 'cap': return segDist(x, z, s.ax, s.az, s.bx, s.bz).d <= s.r - margin;
    case 'circ': return Math.hypot(x - s.x, z - s.z) <= s.r - margin;
    case 'rect': {
      const dx = x - s.x, dz = z - s.z, c = Math.cos(s.rot), sn = Math.sin(s.rot);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      return Math.abs(lx) <= s.hw - margin && Math.abs(lz) <= s.hd - margin;
    }
  }
  return false;
}

export function shapeProject(s, x, z, margin = 0.02) {
  switch (s.k) {
    case 'cap': {
      const r = segDist(x, z, s.ax, s.az, s.bx, s.bz);
      const rr = Math.max(0, s.r - margin);
      if (r.d <= rr) return { x, z };
      if (r.d < 1e-6) return { x: r.cx, z: r.cz };
      return { x: r.cx + ((x - r.cx) / r.d) * rr, z: r.cz + ((z - r.cz) / r.d) * rr };
    }
    case 'circ': {
      const d = Math.hypot(x - s.x, z - s.z), rr = Math.max(0, s.r - margin);
      if (d <= rr) return { x, z };
      return { x: s.x + ((x - s.x) / d) * rr, z: s.z + ((z - s.z) / d) * rr };
    }
    case 'rect': {
      const dx = x - s.x, dz = z - s.z, c = Math.cos(s.rot), sn = Math.sin(s.rot);
      let lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      lx = clamp(lx, -s.hw + margin, s.hw - margin);
      lz = clamp(lz, -s.hd + margin, s.hd - margin);
      return { x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c };
    }
  }
  return { x, z };
}

export function shapeHeight(place, s, x, z) {
  return s.h ? s.h(x, z) : place.heightAt(x, z);
}

function enabled(s) { return !s.enabled || s.enabled(); }

export function findSupport(place, x, z, feetY) {
  let best = null, bestErr = Infinity;
  for (const s of place.walk) {
    if (!enabled(s) || !shapeContains(s, x, z)) continue;
    const h = shapeHeight(place, s, x, z);
    const up = h - feetY;
    if (up > PLAYER.stepUp || -up > PLAYER.stepDown) continue;
    const err = Math.abs(up);
    if (err < bestErr) { bestErr = err; best = { shape: s, h }; }
  }
  return best;
}

function obstacleBlocks(o, feetY, height) {
  const y0 = o.y0 ?? -1e9, y1 = o.y1 ?? 1e9;
  return feetY + 0.15 < y1 && feetY + height > y0;
}

export function pushObstacles(place, x, z, feetY, height, radius = PLAYER.radius) {
  for (let iter = 0; iter < 2; iter++) {
    for (const o of place.obstacles) {
      if (o.enabled && !o.enabled()) continue;
      if (!obstacleBlocks(o, feetY, height)) continue;
      if (o.k === 'circ') {
        const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), min = o.r + radius;
        if (d < min) {
          if (d < 1e-5) { x += min; continue; }
          x = o.x + (dx / d) * min; z = o.z + (dz / d) * min;
        }
      } else if (o.k === 'rect') {
        const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot), sn = Math.sin(o.rot);
        let lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        const hw = o.hw + radius, hd = o.hd + radius;
        if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
          const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
          if (px < pz) lx = Math.sign(lx || 1) * hw; else lz = Math.sign(lz || 1) * hd;
          x = o.x + lx * c + lz * sn; z = o.z - lx * sn + lz * c;
        }
      }
    }
  }
  return { x, z };
}

export function blockedAt(place, x, z, feetY, height, radius = PLAYER.radius) {
  for (const o of place.obstacles) {
    if (o.enabled && !o.enabled()) continue;
    if (!obstacleBlocks(o, feetY, height)) continue;
    if (o.k === 'circ') { if (Math.hypot(x - o.x, z - o.z) < o.r + radius - 0.01) return true; }
    else if (o.k === 'rect') {
      const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot), sn = Math.sin(o.rot);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lx) < o.hw + radius - 0.01 && Math.abs(lz) < o.hd + radius - 0.01) return true;
    }
  }
  return false;
}

// Move from (px,pz) toward (nx,nz). Returns resolved {x,z,y,shape}.
export function resolveMove(place, px, pz, nx, nz, feetY, height) {
  let sup = findSupport(place, nx, nz, feetY);
  let x = nx, z = nz;
  if (!sup) {
    let best = null, bd = Infinity;
    for (const s of place.walk) {
      if (!enabled(s)) continue;
      const p = shapeProject(s, nx, nz, 0.03);
      const h = shapeHeight(place, s, p.x, p.z);
      if (h - feetY > PLAYER.stepUp || feetY - h > PLAYER.stepDown) continue;
      const d = Math.hypot(p.x - nx, p.z - nz);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return { x: px, z: pz, y: feetY, shape: null };
    x = best.x; z = best.z;
    sup = findSupport(place, x, z, feetY);
    if (!sup) return { x: px, z: pz, y: feetY, shape: null };
  }
  const pushed = pushObstacles(place, x, z, sup.h, height);
  if (pushed.x !== x || pushed.z !== z) {
    const sup2 = findSupport(place, pushed.x, pushed.z, sup.h);
    if (sup2) return { x: pushed.x, z: pushed.z, y: sup2.h, shape: sup2.shape };
    const back = findSupport(place, px, pz, feetY);
    return { x: px, z: pz, y: back ? back.h : feetY, shape: back ? back.shape : null };
  }
  return { x, z, y: sup.h, shape: sup.shape };
}
