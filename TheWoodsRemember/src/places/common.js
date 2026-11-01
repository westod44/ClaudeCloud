// Shared authoring helpers for places.
import * as THREE from '../../vendor/three.module.js';
import { Place } from '../place.js';
import { G } from '../state.js';
import { KIT } from '../kit.js';
import { M } from '../geo.js';

export { G, KIT, M, THREE };

export function forest(id, opts = {}) {
  const p = new Place(id, opts);
  p.scatter({ spacing: 3.3, conifer: 0.68, ferns: 110, rocks: 26, logs: 7, ...(opts.scatter || {}) });
  return p;
}

// world position of a point given in a prop's local frame
export function lp(ox, oz, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [ox + lx * c + lz * s, oz - lx * s + lz * c];
}

export function addMesh(place, obj, x, z, ry = 0, dy = 0, y = null) {
  return place.put(obj, x, z, { ry, dy, y: y ?? undefined });
}

// show a group only while cond() holds; switches only when the player is elsewhere
export function variantGroup(place, group, cond) {
  place.group.add(group);
  group.visible = !!cond();
  place.dyn.push(() => {
    const want = !!cond();
    if (want !== group.visible && G.world.current !== place) { group.visible = want; group.updateMatrixWorld(true); }
  });
  return group;
}

// a cluster of brush that physically blocks a path mouth
export function brush(x, z, r = 2.2, seed = 1) {
  const g = new THREE.Group();
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.28, d = rnd() * r;
    const item = i % 3 === 0 ? KIT.sapling[i % 2]() : KIT.fern[i % 3]();
    const m = new THREE.Mesh(item.geo, item.mats);
    m.position.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
    m.rotation.y = rnd() * 6;
    m.scale.setScalar(1 + rnd() * 0.6);
    g.add(m);
  }
  const lg = KIT.log[0]();
  const l = new THREE.Mesh(lg.geo, lg.mats); l.position.set(x, 0, z); l.rotation.y = 0.4; g.add(l);
  return g;
}

export function dropToGround(place, group) {
  for (const c of group.children) c.position.y = place.heightAt(c.position.x, c.position.z) - 0.05 + c.position.y;
  return group;
}

export function inView(obj) {
  // is a world-space point inside the current camera frustum (rough)?
  const cam = G.renderer.camera;
  const v = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
  if (v.z > 0) return false;
  v.applyMatrix4(cam.projectionMatrix);
  return Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
}
