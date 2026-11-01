// Low-resolution world render with seamless stencil joins.
// Order per frame: neighbours through each visible join (stencil + clip plane),
// join depth, the current place, then the hand-held flashlight overlay.
import * as THREE from '../vendor/three.module.js';
import { LIGHT_STATES, FLASHLIGHT, PLAYER } from './config.js';

const MARK_VS = `void main(){ vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); p.z = p.w * 0.999999; gl_Position = p; }`;
const DEPTH_VS = `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const NULL_FS = `void main(){ gl_FragColor = vec4(0.0); }`;
const SKY_FS = `uniform vec3 sky; void main(){ gl_FragColor = vec4(sky, 1.0); }`;

function portalGeometry(m) {
  // open box in join-local space: +Z is outward. Far face and two sides only.
  const hw = m.halfW, y0 = m.bottom, y1 = m.top, zi = -m.depthIn, zo = m.depthOut;
  const v = [];
  const q = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  q([-hw, y0, zo], [hw, y0, zo], [hw, y1, zo], [-hw, y1, zo]);      // far face, normal +Z
  q([hw, y0, zo], [hw, y0, zi], [hw, y1, zi], [hw, y1, zo]);        // +X side, normal +X
  q([-hw, y0, zi], [-hw, y0, zo], [-hw, y1, zo], [-hw, y1, zi]);    // -X side, normal -X
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeBoundingSphere();
  return g;
}

// how strongly night-time tints apply (0 by day, 1 at night)
function ctxNight(ls) { return Math.min(1, Math.max(0, (2.0 - ls.hemi) / 1.1)); }

export function lightStateAt(L) {
  const i = Math.max(0, Math.min(LIGHT_STATES.length - 1, Math.floor(L)));
  const j = Math.min(LIGHT_STATES.length - 1, i + 1);
  const t = Math.max(0, Math.min(1, L - i));
  const a = LIGHT_STATES[i], b = LIGHT_STATES[j];
  const c = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  return {
    sky: c(a.sky, b.sky), fog: c(a.fog, b.fog),
    fogNear: a.fogNear + (b.fogNear - a.fogNear) * t, fogFar: a.fogFar + (b.fogFar - a.fogFar) * t,
    hemiSky: c(a.hemiSky, b.hemiSky), hemiGround: c(a.hemiGround, b.hemiGround), hemi: a.hemi + (b.hemi - a.hemi) * t,
  };
}

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.r.autoClear = false;
    this.r.setPixelRatio(1);
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.NoToneMapping;
    this.gl = this.r.getContext();

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.fog = new THREE.Fog(0x8b918c, 15, 78);

    this.camera = new THREE.PerspectiveCamera(PLAYER.defaultFov, 16 / 9, 0.03, 420);
    this.camera.matrixAutoUpdate = false;
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xb9beb8, 0x4a4034, 2.2);
    this.scene.add(this.hemi);

    this.flash = new THREE.SpotLight(FLASHLIGHT.color, 0, FLASHLIGHT.distance, FLASHLIGHT.angle, FLASHLIGHT.penumbra, FLASHLIGHT.decay);
    this.flash.position.set(0.18, -0.22, 0);
    this.flash.target.position.set(0.05, -0.12, -6);
    this.camera.add(this.flash);
    this.camera.add(this.flash.target);

    this.points = [0, 1].map(() => { const l = new THREE.PointLight(0xff9a52, 0, 6, 1.6); this.scene.add(l); return l; });

    this.portalScene = new THREE.Scene();
    this.portalScene.matrixWorldAutoUpdate = true;
    this.markMat = new THREE.ShaderMaterial({
      vertexShader: MARK_VS, fragmentShader: SKY_FS, side: THREE.BackSide, uniforms: { sky: { value: new THREE.Color() } },
      colorWrite: true, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth,
      stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 1,
      stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilFail: THREE.ReplaceStencilOp,
    });
    this.depthMat = new THREE.ShaderMaterial({
      vertexShader: DEPTH_VS, fragmentShader: NULL_FS, side: THREE.BackSide,
      colorWrite: false, depthWrite: true, depthTest: true,
    });
    this.portalMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.markMat);
    this.portalMesh.matrixAutoUpdate = false;
    this.portalMesh.frustumCulled = false;
    this.portalScene.add(this.portalMesh);

    this.noClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
    this.clipPlane = new THREE.Plane();
    this.r.clippingPlanes = [this.noClip];

    // hand-held flashlight overlay (< 10% of screen height)
    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 5);
    this.viewHemi = new THREE.HemisphereLight(0xb9beb8, 0x302a24, 1.2);
    this.viewScene.add(this.viewHemi);
    const torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0x2a2c2b }));
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.05, 8), new THREE.MeshLambertMaterial({ color: 0x3a3c3a }));
    head.rotation.x = Math.PI / 2; head.position.z = -0.12;
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), new THREE.MeshBasicMaterial({ color: 0x555550 }));
    this.lens.position.z = -0.1455;
    this.lens.rotation.y = Math.PI;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.1), new THREE.MeshLambertMaterial({ color: 0x4a3a30 }));
    hand.position.set(0, -0.025, 0.03);
    torch.add(body, head, this.lens, hand);
    torch.position.set(0.24, -0.25, -0.42);
    torch.rotation.set(0.08, 0.06, 0);
    this.torch = torch;
    this.viewScene.add(torch);

    this.settings = { worldRes: 360, nearest: false, fov: 85, brightness: 1 };
    this.time = 0;
    this.stats = { portals: 0 };
    this.resize();
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    this.canvas.style.imageRendering = this.settings.nearest ? 'pixelated' : 'auto';
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / Math.max(1, h);
    let rh = this.settings.worldRes || Math.min(1080, Math.round(h * Math.min(window.devicePixelRatio || 1, 2)));
    rh = Math.min(rh, Math.max(240, h * 2));
    const rw = Math.round(rh * aspect);
    this.r.setSize(rw, rh, false);
    this.camera.aspect = aspect; this.camera.fov = this.hfovToV(this.settings.fov, 16 / 9);
    this.camera.updateProjectionMatrix();
    this.viewCam.aspect = aspect; this.viewCam.updateProjectionMatrix();
  }

  // bible: horizontal FOV 85 at 16:9
  hfovToV(hfov, aspect) {
    const h = (hfov * Math.PI) / 180;
    return (2 * Math.atan(Math.tan(h / 2) / Math.max(aspect, 1)) * 180) / Math.PI;
  }

  setPass(place, ls, ctx) {
    for (const p of ctx.world.places.values()) p.group.visible = false;
    place.group.visible = true;
    const fog = this.scene.fog;
    this.fogColorFor(place, ls, fog.color);
    fog.near = ls.fogNear * place.fogScale;
    fog.far = ls.fogFar * place.fogScale;
    this.hemi.color.copy(ls.hemiSky);
    this.hemi.groundColor.copy(ls.hemiGround);
    this.hemi.intensity = ls.hemi * place.ambientScale * ctx.brightness;
    this.flash.intensity = FLASHLIGHT.intensity * ctx.flashPower * place.flashScale * (0.85 + 0.15 * ctx.brightness);
    // fire / stove pools
    let k = 0;
    for (const l of place.lights) {
      if (k >= this.points.length) break;
      if (l.cond && !l.cond()) continue;
      const pl = this.points[k++];
      pl.position.set(l.x, l.y, l.z);
      pl.color.setHex(l.color);
      pl.distance = l.distance; pl.decay = l.decay ?? 1.6;
      const flick = l.flicker ? 0.82 + 0.12 * Math.sin(this.time * 13.1 + k) + 0.08 * Math.sin(this.time * 31.7) : 1;
      pl.intensity = l.intensity * flick * ctx.brightness;
      pl.updateMatrixWorld(true);
    }
    for (; k < this.points.length; k++) this.points[k].intensity = 0;
  }

  fogColorFor(place, ls, out) {
    out.copy(ls.fog);
    if (place.fogTint) out.lerp(new THREE.Color(place.fogTint.color), place.fogTint.amount * Math.min(1, Math.max(0, ctxNight(ls))));
    return out;
  }

  setCamera(mat) {
    this.camera.matrix.copy(mat);
    this.camera.updateMatrixWorld(true);
  }

  render(ctx) {
    // ctx: { world, eye (Matrix4), lightLevel, flashPower, flashOn, brightness, showTorch, dt }
    const { world } = ctx;
    const r = this.r, gl = this.gl;
    this.time += ctx.dt || 0;
    const ls = lightStateAt(ctx.lightLevel);
    r.setClearColor(this.fogColorFor(world.current, ls, new THREE.Color()), 1);
    r.clear(true, true, true);
    const cur = world.current;
    this.setCamera(ctx.eye);

    // collect visible joins
    const cam = this.camera.position;
    const list = [];
    for (const id of world.visible) {
      const m = cur.mouths[id];
      const loc = (cam.x - m.x) * m.ox + (cam.z - m.z) * m.oz;
      if (loc > m.depthOut) continue;
      const lk = world.link(cur, id);
      if (!lk) continue;
      const dest = world.get(lk.place);
      if (!dest || !dest.mouths[lk.mouth]) continue;
      list.push({ m, dest, mB: dest.mouths[lk.mouth], dist: Math.hypot(cam.x - m.x, cam.z - m.z) });
    }
    list.sort((a, b) => a.dist - b.dist);
    if (list.length > 6) list.length = 6;
    this.stats.portals = list.length;

    const st = r.state.buffers.stencil;
    const T = new THREE.Matrix4(), virt = new THREE.Matrix4();
    let ref = 1;
    for (const e of list) {
      if (!e.m.portalGeo) e.m.portalGeo = portalGeometry(e.m);
      // 1) mark the join opening in the stencil, resetting depth to far
      this.portalMesh.geometry = e.m.portalGeo;
      this.portalMesh.matrix.copy(e.m.matrix);
      this.portalMesh.material = this.markMat;
      this.markMat.stencilRef = ref;
      this.fogColorFor(e.dest, ls, this.markMat.uniforms.sky.value).convertLinearToSRGB();
      r.render(this.portalScene, this.camera);
      // 2) render the destination place through it, clipped at the destination join
      world.transform(e.m, e.mB, T);
      virt.multiplyMatrices(T, ctx.eye);
      this.setCamera(virt);
      const mB = e.mB;
      this.clipPlane.normal.set(-mB.ox, 0, -mB.oz);
      this.clipPlane.constant = mB.ox * mB.x + mB.oz * mB.z + 0.02;
      r.clippingPlanes = [this.clipPlane];
      st.setTest(true);
      st.setFunc(gl.EQUAL, ref, 0xff);
      st.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
      st.setLocked(true);
      this.setPass(e.dest, ls, ctx);
      r.render(this.scene, this.camera);
      st.setLocked(false);
      st.setTest(false);
      r.clippingPlanes = [this.noClip];
      this.setCamera(ctx.eye);
      ref++;
    }
    // 3) join depth so the current place cannot draw beyond its joins
    this.portalMesh.material = this.depthMat;
    for (const e of list) {
      this.portalMesh.geometry = e.m.portalGeo;
      this.portalMesh.matrix.copy(e.m.matrix);
      r.render(this.portalScene, this.camera);
    }
    // 4) the current place
    this.setPass(cur, ls, ctx);
    r.render(this.scene, this.camera);

    // 5) hand and flashlight
    if (ctx.showTorch) {
      r.clippingPlanes = [];
      r.clearDepth();
      this.viewHemi.intensity = 0.5 + ls.hemi * 0.35 * ctx.brightness;
      this.lens.material.color.setHex(ctx.flashPower > 0.05 ? 0xfff2cf : 0x4a4a46);
      this.torch.position.y = -0.25 + (ctx.torchBob || 0);
      r.render(this.viewScene, this.viewCam);
      r.clippingPlanes = [this.noClip];
    }
  }
}
