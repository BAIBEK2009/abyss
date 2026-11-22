// The dive (CLAUDE.md v3.1, 19): a separate deep-sea scene rendered by the same view.
//  1. The shot from under the surface: the real bathyscaphe "Nerpa-2" (yellow sphere, porthole, tanks,
//     frame, name plate, cable) sinks past the camera under the ship's floodlights; above, the rippled
//     surface in the pool of light, slanted light shafts, bubbles; its lamps switch on with a click.
//  2. The cockpit: a 5.5 s descent with shaking, the light comes on, a thud on the bottom; then the
//     player drives (W/S, A/D), aims the searchlight with the mouse, pings the sonar (Space, -3 s O2),
//     holds E to grab the box, surfaces with Q. The beacon pinger is louder when close and comes from
//     the box's side. Oxygen 60 s. The result goes back to Python: found, or the share of seabed seen.
import * as THREE from "three";
import { canvasTexture } from "../view.js";
import { anim, ease, sleep } from "../anim.js";
import { t } from "../i18n.js";
import { createNerpa } from "./nerpa.js";
import { HULL } from "./deck.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import { sfx } from "../audio.js";
import { createCockpit } from "../ui/cockpit.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
/** Seabed height around the dive spot (gentle dunes and ripples). */
export const bedH = (x, z) => (fbm(x * 0.07 + 3.1, z * 0.07 + 1.7) - 0.5) * 3.4 + Math.sin(x * 0.9 + z * 0.35) * 0.06 + Math.sin(x * 0.37 - z * 0.83) * 0.05
  + 0.03 * Math.sin(x * 6.4 + z * 2.1 + 0.8 * Math.sin(z * 0.45 + x * 0.12));          // sand ripples, curved crests ~0.9 m apart
const SPOT_I = 150;          // the cockpit searchlight (decay 2: physically falling off)
const BED_M = 950, O2_MAX = 60, SEARCH_R = 17, TETHER = 24, CINE_S = 2;

const std = (o) => new THREE.MeshStandardMaterial(o);
const soft = canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

// the brightness of a point lit by up to two searchlight cones (GLSL, shared by the snow, the bokeh and the bubbles)
const CONE_GLSL = /* glsl */`
  uniform vec3 uLP; uniform vec3 uLD; uniform vec3 uLP2; uniform vec3 uLD2; uniform float uCos; uniform float uOn; uniform float uOn2;
  float coneOf(vec3 w, vec3 lp, vec3 ld) {
    vec3 d = w - lp; float dist = max(length(d), 0.001);
    return smoothstep(uCos - 0.06, uCos + 0.1, dot(d / dist, ld)) / (1.0 + dist * dist * 0.045);
  }
  float lit(vec3 w) { return min(1.4, coneOf(w, uLP, uLD) * uOn + coneOf(w, uLP2, uLD2) * uOn2); }`;
const coneUniforms = () => ({ uLP: { value: new THREE.Vector3() }, uLD: { value: new THREE.Vector3(0, 0, -1) }, uLP2: { value: new THREE.Vector3() },
  uLD2: { value: new THREE.Vector3(0, 0, -1) }, uCos: { value: Math.cos(0.44) }, uOn: { value: 1 }, uOn2: { value: 0 } });

/** "Marine snow" (23.3-V): thousands of 1-2 px flakes and a few of 3 px; in a searchlight cone they shine, outside
 *  it they are a faint ~10 %. A handful of out-of-focus bokeh discs drift within 1.5 m of the glass. */
export function marineSnow(count = 3600) {
  const pos = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 28, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 28], i * 3);
    const r = Math.random();
    size[i] = r < 0.78 ? 1 + Math.random() * 0.6 : r < 0.96 ? 2 : 3;          // px: many tiny, a few bigger
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aS", new THREE.BufferAttribute(size, 1));
  const uniforms = { ...coneUniforms(), uPR: { value: 1 }, uAmb: { value: 0.1 }, uStreak: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: CONE_GLSL + /* glsl */`
      uniform float uPR; uniform float uAmb; attribute float aS; varying float vB;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp; float z = max(0.05, -mv.z);
        float c = lit(wp.xyz);
        vB = mix(uAmb, 1.0, clamp(c, 0.0, 1.0)) * (0.55 + 0.45 * c) * exp(-z * 0.05);
        vB *= smoothstep(0.5, 1.2, z);                             // nothing big at the glass: the bokeh layer does that
        gl_PointSize = max(1.0, aS * uPR * clamp(2.2 / z, 0.75, 1.5));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uStreak; varying float vB;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        p.y *= 1.0 - uStreak * 0.7;                                 // moving fast: flakes stretch into short streaks
        float a = smoothstep(0.5, 0.0, length(p));
        gl_FragColor = vec4(vec3(0.84, 0.92, 0.94) * vB * a, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  // bokeh: a few soft discs right in front of the glass, lit only when they float through the beam
  const NB = 6, bpos = new Float32Array(NB * 3), bsz = new Float32Array(NB);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute("position", new THREE.BufferAttribute(bpos, 3));
  bgeo.setAttribute("aS", new THREE.BufferAttribute(bsz, 1));
  const bmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: CONE_GLSL + /* glsl */`
      uniform float uPR; uniform float uAmb; attribute float aS; varying float vB;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * wp; float z = max(0.2, -mv.z);
        vB = mix(min(uAmb, 0.2) * 0.25, 0.4, clamp(lit(wp.xyz), 0.0, 1.0)) * smoothstep(0.3, 0.55, z) * smoothstep(1.6, 1.2, z);
        gl_PointSize = aS * uPR / z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vB;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.42, r) * 0.55 + smoothstep(0.5, 0.0, r) * 0.2;   // a soft disc with a brighter rim
        gl_FragColor = vec4(vec3(0.8, 0.92, 0.96) * vB * a, 1.0);
      }`,
  });
  const bokeh = new THREE.Points(bgeo, bmat);
  bokeh.frustumCulled = false;
  points.add(bokeh);
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3();
  const respawn = (i, cam) => {
    cam.getWorldDirection(fwd); right.crossVectors(fwd, cam.up).normalize(); upv.crossVectors(right, fwd);
    const d = 0.55 + Math.random() * 0.9;
    tmp.copy(cam.position).addScaledVector(fwd, d).addScaledVector(right, (Math.random() - 0.5) * d * 1.4).addScaledVector(upv, (Math.random() - 0.5) * d * 0.9);
    bpos.set([tmp.x, tmp.y, tmp.z], i * 3); bsz[i] = 22 + Math.random() * 30;
  };
  let bokehInit = false;
  return {
    points, mat,
    /** Keep flakes around the camera; rise = extra drift upwards (descending fast). */
    update(dt, time, cam, rise = 0) {
      const p = pos, camP = cam.position ?? cam;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] += dt * (0.05 + rise); p[i] += Math.sin(time * 0.3 + i) * dt * 0.02; p[i + 2] += Math.cos(time * 0.23 + i) * dt * 0.015;
        for (let a = 0; a < 3; a++) {
          const c = a === 0 ? camP.x : a === 1 ? camP.y : camP.z, h = a === 1 ? 7 : 14, v = p[i + a] - c;
          if (v > h) p[i + a] -= 2 * h; else if (v < -h) p[i + a] += 2 * h;
        }
      }
      geo.attributes.position.needsUpdate = true;
      if (!cam.isCamera) return;
      cam.getWorldDirection(fwd);
      for (let i = 0; i < NB; i++) {
        bpos[i * 3 + 1] += dt * (0.04 + rise); bpos[i * 3] += Math.sin(time * 0.4 + i) * dt * 0.03;
        tmp.fromArray(bpos, i * 3).sub(camP);
        const along = tmp.dot(fwd);
        if (!bokehInit || along < 0.35 || along > 1.6 || tmp.length() > 1.9) respawn(i, cam);
      }
      bokehInit = true;
      bgeo.attributes.position.needsUpdate = true; bgeo.attributes.aS.needsUpdate = true;
    },
  };
}

/** Bubbles (23.3-V): small rings that rise with a wobble from emitters (Nerpa's hull and thrusters, the mud
 *  volcano); never above the surface (uSurf). emit() returns a world point or null. */
export function bubbleTrail({ count = 260, rate = 60, life = 4.5, speed = 0.35, spread = 0.2 } = {}) {
  const pos = new Float32Array(count * 3), base = new Float32Array(count * 3), age = new Float32Array(count).fill(-1),
        sz = new Float32Array(count), ph = new Float32Array(count), sp = new Float32Array(count);
  for (let i = 0; i < count; i++) pos[i * 3 + 1] = -1e5;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aS", new THREE.BufferAttribute(sz, 1));
  const uniforms = { ...coneUniforms(), uPR: { value: 1 }, uAmb: { value: 0.25 }, uSurf: { value: 1e6 } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: CONE_GLSL + /* glsl */`
      uniform float uPR; uniform float uAmb; uniform float uSurf; attribute float aS; varying float vB; varying float vPx;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * wp; float z = max(0.2, -mv.z);
        vB = (uAmb + 1.2 * lit(wp.xyz)) * exp(-z * 0.06) * step(wp.y, uSurf - 0.05);
        gl_PointSize = clamp(aS * uPR * 900.0 / z, 1.5, 22.0); vPx = gl_PointSize;     // aS: the diameter in metres
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vB; varying float vPx;
      void main() {
        vec2 p = gl_PointCoord - 0.5; float r = length(p);
        if (r > 0.5) discard;
        float rim = smoothstep(0.5, 0.4, r) * smoothstep(0.22, 0.4, r);            // a bubble: a bright thin rim
        float glint = smoothstep(0.13, 0.0, length(p - vec2(-0.14, -0.14)));       // and a glint of the light
        float big = rim * 0.9 + glint + 0.08, dot = smoothstep(0.5, 0.0, r) * 0.9; // far/small ones are just a bright dot
        gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * vB * mix(dot, big, smoothstep(3.0, 6.0, vPx)), 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let acc = 0, next = 0;
  const v = new THREE.Vector3();
  return {
    points, mat,
    update(dt, time, emit, boost = 1) {
      acc += emit ? dt * rate * boost : 0;
      while (acc >= 1) {
        acc -= 1;
        const at = emit(v);
        if (!at) break;
        const i = next; next = (next + 1) % count;
        base.set([at.x + (Math.random() - 0.5) * spread, at.y, at.z + (Math.random() - 0.5) * spread], i * 3);
        age[i] = 0; sz[i] = 0.012 + Math.random() * Math.random() * 0.05; ph[i] = Math.random() * 6.3; sp[i] = speed * (0.7 + Math.random() * 0.7);
      }
      for (let i = 0; i < count; i++) {
        if (age[i] < 0) continue;
        age[i] += dt;
        if (age[i] > life) { age[i] = -1; pos[i * 3 + 1] = -1e5; continue; }
        const a = age[i], w = 0.06 + sz[i];
        pos[i * 3] = base[i * 3] + Math.sin(a * 5 + ph[i]) * w;                       // wobbling up
        pos[i * 3 + 1] = base[i * 3 + 1] + a * sp[i] * (1 + a * 0.15);
        pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(a * 4.3 + ph[i]) * w;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aS.needsUpdate = true;
    },
    clear() { age.fill(-1); for (let i = 0; i < count; i++) pos[i * 3 + 1] = -1e5; geo.attributes.position.needsUpdate = true; },
  };
}

/** A volumetric beam (23.3-V): additive, no depth write; fades along its length (pow), soft at the rim
 *  (the angle to the camera), brighter looking down its axis, with 3D noise of murk drifting through it.
 *  axis: the beam's direction in the cone's local space (apex -> base). */
const beamUniforms = { uT: { value: 0 } };
function beamMat(k = 1, axis = new THREE.Vector3(0, -1, 0)) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: beamUniforms.uT, uK: { value: k }, uAxis: { value: axis.clone().normalize() } },
    vertexShader: `uniform vec3 uAxis; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vA;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w;
        vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); vA = normalize(normalMatrix * uAxis); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uT; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vA;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main() {
        float along = clamp(vUv.y, 0.0, 1.0);                                   // 1 at the lamp, 0 at the far end
        float fall = pow(along, 2.2) * smoothstep(1.0, 0.96, along);            // inverse-square-ish, no hard tip
        float edge = pow(abs(dot(vN, vV)), 1.6);                                 // soft rim: thin at grazing angles
        float axial = 1.0 + 1.6 * pow(abs(dot(vA, vV)), 6.0);                   // looking down the beam: it glares
        vec3 q = vW * 0.9 + vec3(uT * 0.05, uT * 0.11, -uT * 0.04);
        float murk = 0.45 + 0.75 * n3(q) + 0.35 * n3(q * 2.7 + 5.0) - 0.2;      // drifting silt in the water
        float a = 0.085 * uK * fall * edge * axial * murk;
        gl_FragColor = vec4(vec3(0.74, 0.9, 1.0) * a, 1.0);
      }`,
  });
}

/** Mnemiopsis, the Caspian comb jelly: a clear oval body; rainbow light runs down its eight comb rows. */
function ctenophore(size) {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const f = i / 16; pts.push(new THREE.Vector2(Math.sin(f * Math.PI) * size * 0.42 * (1 - f * 0.25), (f - 0.5) * size)); }
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: { value: 0 }, uLit: { value: 0 } },
    vertexShader: "varying vec3 vL; varying vec3 vN; varying vec3 vV; void main() { vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }",
    fragmentShader: `uniform float uT; uniform float uLit; varying vec3 vL; varying vec3 vN; varying vec3 vV;
      void main() {
        float fr = pow(1.0 - abs(dot(vN, vV)), 2.0);
        float ang = atan(vL.z, vL.x);
        float row = pow(0.5 + 0.5 * cos(ang * 8.0), 18.0);                 // eight comb rows
        float wave = 0.5 + 0.5 * sin(vL.y * 60.0 - uT * 9.0);               // the beat running down them
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (vL.y * 6.0 - uT * 0.8 + vec3(0.0, 0.33, 0.67)));
        vec3 c = vec3(0.55, 0.7, 0.8) * fr * 0.35 + rainbow * row * wave * (0.4 + 1.6 * uLit);
        gl_FragColor = vec4(c * (0.25 + uLit), 1.0);
      }`,
  }));
  const g = new THREE.Group(); g.add(body);
  for (const sx of [-1, 1]) {        // the two oral lobes
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), body.material);
    lobe.position.set(sx * size * 0.16, -size * 0.45, 0); lobe.scale.set(1, 1.4, 0.6); lobe.rotation.x = Math.PI; g.add(lobe);
  }
  g.userData.mat = body.material;
  return g;
}

/** The real "Nerpa-2" at full size: the same model as on the deck (scenes/nerpa.js), with lit lamps.
 *  The group's origin is the middle of the sphere (the descent shot aims at it). */
function realNerpa(env) {
  const g = new THREE.Group();
  const n = createNerpa({ lights: true, env, glass: "transmission" });
  n.position.y = -1.05;                               // the group's origin: the middle of the vehicle
  g.add(n);
  const lamps = n.userData.lamps;
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(n.userData.eye.clone().add(new THREE.Vector3(0, -1.05, 0)), n.userData.eye.clone().add(new THREE.Vector3(0, 40, 0))), 1, 0.02, 6), std({ color: 0x111111, metalness: 0.5, roughness: 0.5 }));
  g.add(cable);                                                      // the lift cable from her ring
  // the lamps' cones of light in the water (volumetric look: additive, soft rim, drifting noise)
  const cones = lamps.map((l) => {
    const L = 13, geo = new THREE.ConeGeometry(Math.tan(0.4) * L, L, 48, 8, true).translate(0, -L / 2, 0);
    const m = new THREE.Mesh(geo, beamMat(0.8));
    m.position.copy(l.at);
    const dir = new THREE.Vector3(l.at.x * 0.4, -2.5, l.at.z + 8).sub(l.at).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    m.visible = false; n.add(m);
    return m;
  });
  g.userData = { lamps, model: n, cones };
  return g;
}

const soft2 = (rgb) => canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

/** Everything that lives down there (the South Caspian at ~950 m: sparse — sprats, a sturgeon, comb jellies;
 *  no corals, no tropical jellyfish); update(dt, T, D, thrusting) every frame of the dive. */
function createLife(deep, lampPos) {
  const jellies = [];
  for (let i = 0; i < 6; i++) {           // mnemiopsis drifting a metre or two above the silt
    const c = ctenophore(0.12 + hash(i, 25) * 0.08);
    const a = hash(i, 21) * 6.28, d = 3 + hash(i, 22) * 14;
    c.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); c.userData.y0 = 0.8 + hash(i, 23) * 2.0; c.userData.ph = hash(i, 24) * 6;
    deep.add(c); jellies.push(c);
  }
  // a sturgeon gliding slowly near the bottom: long body, pointed snout, rows of bony scutes, a shark-like tail
  const sturgeon = new THREE.Group();
  {
    const back = std({ color: 0x4a4f44, roughness: 0.55, metalness: 0.15 }), belly = std({ color: 0xb8b2a2, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, -0.85], [0.03, -0.8], [0.06, -0.65], [0.1, -0.35], [0.12, 0], [0.11, 0.3], [0.08, 0.55], [0.04, 0.72], [0, 0.8]].map(([a, b]) => new THREE.Vector2(a, b)), 20), back);
    body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.8); sturgeon.add(body);
    const under = new THREE.Mesh(new THREE.LatheGeometry([[0, -0.6], [0.08, -0.3], [0.1, 0], [0.09, 0.3], [0, 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 16), belly);
    under.rotation.x = Math.PI / 2; under.scale.set(0.95, 1, 0.6); under.position.y = -0.03; sturgeon.add(under);
    for (let k = 0; k < 9; k++) { const sc = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 4), belly); sc.position.set(0, 0.105 - Math.abs(k - 4) * 0.004, -0.5 + k * 0.11); sturgeon.add(sc); }
    const tailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.06, -0.32), new THREE.Vector2(0.02, -0.28), new THREE.Vector2(-0.12, -0.18)]);
    const tail = new THREE.Mesh(new THREE.ExtrudeGeometry(tailShape, { depth: 0.01, bevelEnabled: false }).rotateY(Math.PI / 2), back);
    tail.position.set(0, 0.02, -0.78); tail.rotation.x = -0.4; sturgeon.add(tail);
    for (const sx of [-1, 1]) { const fin = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), back); fin.scale.set(1, 0.12, 0.6); fin.position.set(sx * 0.12, -0.05, 0.42); fin.rotation.z = sx * 0.4; sturgeon.add(fin); }
    for (const sx of [-0.02, 0.02]) { const bar = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.05, 4), belly); bar.position.set(sx, -0.05, 0.68); bar.rotation.x = Math.PI; sturgeon.add(bar); }   // the barbels
    sturgeon.scale.setScalar(1.25);
    sturgeon.userData = { a: 0, tail };
    deep.add(sturgeon);
  }
  // silt clouds from the thrusters, plankton that sparks when the vehicle moves, a school of fish
  const siltTex = soft2("140,132,112"), silt = [];
  for (let i = 0; i < 46; i++) {
    const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: siltTex, transparent: true, depthWrite: false, opacity: 0 }));
    p.userData.life = -1; deep.add(p); silt.push(p);
  }
  let siltNext = 0;
  const PK = 700, pk = new Float32Array(PK * 3);
  for (let i = 0; i < PK; i++) pk.set([(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 12], i * 3);
  const pkGeo = new THREE.BufferGeometry(); pkGeo.setAttribute("position", new THREE.BufferAttribute(pk, 3));
  const plankton = new THREE.Points(pkGeo, new THREE.PointsMaterial({ color: new THREE.Color(0x7fe9ff).multiplyScalar(2), size: 0.07, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  plankton.frustumCulled = false; deep.add(plankton);
  const school = { c: new THREE.Vector3(7, 0, -5), a: 0, fish: [] };
  {
    const fm = std({ color: 0xdce6ec, metalness: 0.95, roughness: 0.18 }), fg = new THREE.ConeGeometry(0.022, 0.12, 6); fg.rotateX(-Math.PI / 2);   // Caspian sprats (kilka)
    for (let i = 0; i < 46; i++) {
      const f = new THREE.Mesh(fg, fm);
      f.userData = { o: new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.4), ph: Math.random() * 6 };
      deep.add(f); school.fish.push(f);
    }
  }
  const v = new THREE.Vector3();
  return {
    update(dt, T, D, thrusting) {
      for (const c of jellies) {
        const u = c.userData;
        c.position.y = bedH(c.position.x, c.position.z) + u.y0 + Math.sin(T * 0.35 + u.ph) * 0.4;
        c.rotation.y += dt * 0.15; c.rotation.z = Math.sin(T * 0.5 + u.ph) * 0.2;
        const near = Math.hypot(c.position.x - D.x, c.position.z - D.z);
        u.mat.uniforms.uT.value = T + u.ph; u.mat.uniforms.uLit.value = clamp(1.4 - near / 6, 0.12, 1);
      }
      {
        const sd = sturgeon.userData; sd.a += dt * 0.035;
        const x = Math.cos(sd.a) * 12, z = Math.sin(sd.a) * 9 - 3;
        sturgeon.position.set(x, bedH(x, z) + 0.55, z);
        sturgeon.rotation.y = -sd.a + Math.PI;            // heading along the circle
        sd.tail.rotation.y = Math.sin(T * 2.2) * 0.35;
      }
      if (thrusting && T > siltNext) {
        siltNext = T + 0.09;
        const p = silt.find((q) => q.userData.life < 0);
        if (p) {
          const fx = -Math.sin(D.yaw), fz = -Math.cos(D.yaw), x = D.x - fx * 0.9 + (Math.random() - 0.5) * 1.2, z = D.z - fz * 0.9 + (Math.random() - 0.5) * 1.2;
          p.position.set(x, bedH(x, z) + 0.25, z); p.userData.life = 0; p.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.06, (Math.random() - 0.5) * 0.3);
        }
      }
      for (const p of silt) {
        if (p.userData.life < 0) continue;
        p.userData.life += dt;
        const L = p.userData.life / 6;
        if (L >= 1) { p.userData.life = -1; p.material.opacity = 0; continue; }
        p.position.addScaledVector(p.userData.v, dt); p.userData.v.multiplyScalar(Math.exp(-0.4 * dt));
        const sc = 0.5 + L * 3.4; p.scale.set(sc, sc * 0.7, 1);
        p.material.opacity = 0.34 * (1 - L) * Math.min(1, p.userData.life * 2.5);
      }
      const sp = Math.hypot(D.vx || 0, D.vz || 0);
      plankton.material.opacity += (clamp(sp * 0.55 + Math.abs(D.turn || 0) * 0.35, 0, 0.85) - plankton.material.opacity) * Math.min(1, dt * 3);
      for (let i = 0; i < pk.length; i += 3) {
        pk[i + 1] += Math.sin(T + i) * dt * 0.02;
        for (let a = 0; a < 3; a++) {
          const c = a === 0 ? D.x : a === 1 ? D.y : D.z, h = a === 1 ? 3 : 6, d = pk[i + a] - c;
          if (d > h) pk[i + a] -= 2 * h; else if (d < -h) pk[i + a] += 2 * h;
        }
      }
      pkGeo.attributes.position.needsUpdate = true;
      school.a += dt * 0.22;
      const tgt = v.set(Math.cos(school.a) * 8, 0, Math.sin(school.a) * 8 - 4); tgt.y = bedH(tgt.x, tgt.z) + 2.6;
      const ax = school.c.x - D.x, az = school.c.z - D.z, ad = Math.hypot(ax, az) || 1;
      if (ad < 5) { const k = (dt * 3.2 * (5 - ad)) / 5 / ad; school.c.x += ax * k; school.c.z += az * k; }   // they flee from Nerpa
      else school.c.lerp(tgt, Math.min(1, dt * 0.3));
      school.c.y += (bedH(school.c.x, school.c.z) + 2.6 - school.c.y) * Math.min(1, dt);
      const heading = school.a + Math.PI / 2;
      for (const f of school.fish) {
        const o = f.userData.o;
        f.position.set(school.c.x + o.x + Math.sin(T * 1.3 + f.userData.ph) * 0.2, school.c.y + o.y + Math.sin(T * 2 + f.userData.ph) * 0.08, school.c.z + o.z + Math.cos(T * 1.1 + f.userData.ph) * 0.2);
        f.rotation.y = ad < 5 ? Math.atan2(ax, az) + Math.PI : -heading;
      }
    },
  };
}

const rbox = (w, h, d, r = 0.03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
/** Aircraft skin: aluminium with rows of rivets and panel seams in a normal map; an optional livery stripe
 *  (fictional: teal on white, no real airline). */
function aluSkin({ stripe = false, base = "#c9ced1", seed = 1 } = {}) {
  const S = 512;
  const hc = document.createElement("canvas"); hc.width = hc.height = S;
  const hg = hc.getContext("2d");
  hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  hg.fillStyle = "#585858"; for (const y of [0, S / 2]) hg.fillRect(0, y, S, 3); for (const x of [0, S / 3, (2 * S) / 3]) hg.fillRect(x, 0, 3, S);
  for (const y of [10, S / 2 + 10, S / 2 - 8, S - 8]) for (let x = 6; x < S; x += 14) { const gr = hg.createRadialGradient(x, y, 0, x, y, 3.5); gr.addColorStop(0, "#d8d8d8"); gr.addColorStop(1, "rgba(128,128,128,0)"); hg.fillStyle = gr; hg.fillRect(x - 4, y - 4, 8, 8); }
  const d = hg.getImageData(0, 0, S, S).data, out = new Uint8ClampedArray(d.length);
  const H = (x, y) => d[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 3, dy = (H(x, y + 1) - H(x, y - 1)) * 3, l = Math.hypot(dx, dy, 1), k = (y * S + x) * 4;
    out[k] = (-dx / l * 0.5 + 0.5) * 255; out[k + 1] = (dy / l * 0.5 + 0.5) * 255; out[k + 2] = (1 / l * 0.5 + 0.5) * 255; out[k + 3] = 255;
  }
  const nc = document.createElement("canvas"); nc.width = nc.height = S; nc.getContext("2d").putImageData(new ImageData(out, S, S), 0, 0);
  const normalMap = new THREE.CanvasTexture(nc);
  const map = canvasTexture(S, S, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(60,60,55,${hash(i, seed) * 0.08})`; g.fillRect(hash(i, seed + 1) * w, hash(i, seed + 2) * h, 2, 2); }
    if (stripe) { g.fillStyle = "#1f7a86"; g.fillRect(0, h * 0.58, w, h * 0.12); g.fillStyle = "#e8b04a"; g.fillRect(0, h * 0.72, w, h * 0.025); }
    for (let i = 0; i < 18; i++) { g.strokeStyle = `rgba(90,85,75,${0.15 + hash(i, seed + 3) * 0.2})`; g.lineWidth = 1 + hash(i, seed + 4) * 2; g.beginPath(); const x = hash(i, seed + 5) * w, y = hash(i, seed + 6) * h; g.moveTo(x, y); g.lineTo(x + (hash(i, seed + 7) - 0.5) * 140, y + (hash(i, seed + 8) - 0.5) * 30); g.stroke(); }
  });
  return { map, normalMap };
}
/** A torn plate: a noisy outline extruded thin with a bevel (aircraft skin ripped off the frame). */
function tornPlate(w, h, seed, depth = 0.025) {
  const pts = [], N = 26;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a);
    const sq = Math.pow(Math.abs(c), 0.35) * Math.sign(c), sz = Math.pow(Math.abs(s2), 0.35) * Math.sign(s2);   // squarish
    const jag = 1 - 0.18 * hash(k, seed) - (k % 3 === 0 ? 0.12 * hash(k, seed + 9) : 0);
    pts.push(new THREE.Vector2(sq * w / 2 * jag, sz * h / 2 * jag));
  }
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv, pp = geo.attributes.position;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, pp.getX(k) / w + 0.5, pp.getZ(k) / h + 0.5);
  return geo;
}

export function createDive(view) {
  const camera = view.camera;
  const deep = new THREE.Scene();
  deep.background = new THREE.Color(0x010a10);
  deep.fog = new THREE.FogExp2(0x02161f, 0.082);
  const hemi = new THREE.HemisphereLight(0x0d4257, 0x000000, 0.6);
  deep.add(hemi);
  const top = new THREE.DirectionalLight(0x3f86a8, 0);
  top.position.set(0, 40, 0);
  deep.add(top);
  // the descent film is "shot" from a companion camera with its own small light: a soft fill on Nerpa's flank
  const fill = new THREE.PointLight(0xbfdcff, 0, 14, 2);
  deep.add(fill);
  const snow = marineSnow();
  snow.mat.uniforms.uPR.value = view.renderer.getPixelRatio();
  deep.add(snow.points);
  // bubbles share the snow's searchlight uniforms: they sparkle in the same cones
  const shareCones = (b) => { for (const k of ["uLP", "uLD", "uLP2", "uLD2", "uCos", "uOn", "uOn2"]) b.mat.uniforms[k] = snow.mat.uniforms[k]; b.mat.uniforms.uPR.value = view.renderer.getPixelRatio(); deep.add(b.points); return b; };
  const trail = shareCones(bubbleTrail({ count: 700, rate: 80, life: 5, spread: 0.35 }));      // from Nerpa's hull and thrusters in the film

  // ---- the surface shot
  const surf = new THREE.Group();
  surf.visible = false;
  deep.add(surf);
  const nerpa = realNerpa(view.mainScene.environment);
  nerpa.visible = false; deep.add(nerpa);
  // the surface from below (shot 3): Snell's window — inside a cone of ~48.6 deg the sky shows, bright and broken
  // by the ripples; outside it the surface is a dark mirror
  const surfPlane = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSurf: { value: 74 }, uOrg: { value: new THREE.Vector2() } },
    vertexShader: "varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      uniform float uT; uniform vec3 uCam; uniform float uSurf; uniform vec2 uOrg; varying vec2 vP;
      float hh(vec2 p) { return sin(p.x * 0.9 + uT * 1.3) * sin(p.y * 0.8 - uT * 1.1) + 0.5 * sin(p.x * 2.1 - uT * 2.0 + p.y * 1.7); }
      void main() {
        vec2 w = vP + uOrg;
        float depth = max(0.5, uSurf - uCam.y);
        float rr = length(w - uCam.xz) / depth;                       // tan of the angle from straight up
        float rip = 0.5 + 0.5 * hh(w * 0.7);
        float win = 1.0 - smoothstep(1.02, 1.18, rr + (rip - 0.5) * 0.12);
        vec3 sky = mix(vec3(0.3, 0.46, 0.55), vec3(0.55, 0.7, 0.77), rip);
        vec3 mirror = vec3(0.01, 0.05, 0.075) + vec3(0.03, 0.08, 0.1) * rip;
        vec3 c = mix(mirror, sky, win);
        c += vec3(0.9, 0.97, 1.0) * pow(rip, 8.0) * win * 0.6;          // glitter of the swell in the window
        c += vec3(0.5, 0.7, 0.8) * exp(-pow((rr - 1.1) / 0.05, 2.0)) * 0.35;   // the bright rim of the window
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  surfPlane.rotation.x = Math.PI / 2; surfPlane.position.y = 14;
  surf.add(surfPlane);
  // caustics near the surface: the light through the swell, projected as a moving bright net (shots 3, < 50 m)
  const causticTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const x = hash(i, 71) * w, y = hash(i, 72) * h, r = 10 + hash(i, 73) * 22;
      g.strokeStyle = `rgba(255,255,255,${0.25 + hash(i, 74) * 0.35})`; g.lineWidth = 1.5 + hash(i, 75) * 2.5;
      g.beginPath();
      for (let k = 0; k <= 7; k++) { const a = (k / 7) * Math.PI * 2, rr = r * (0.8 + hash(i * 7 + k, 76) * 0.4); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.stroke();
    }
  });
  causticTex.wrapS = causticTex.wrapT = THREE.RepeatWrapping;
  const caustic = new THREE.SpotLight(0xcfeeff, 0, 40, 0.75, 0.4, 0.6);
  caustic.map = causticTex; caustic.castShadow = true; caustic.shadow.mapSize.set(512, 512);
  caustic.position.set(0, 22, 0); caustic.target.position.set(0, 0, 0);
  surf.add(caustic, caustic.target);
  // the underside of «Tulpar» at the surface: her hull, the propeller turning, the rudder
  const hullUnder = new THREE.Group(); surf.add(hullUnder);
  {
    const shape = new THREE.Shape(HULL.map(([x, z]) => new THREE.Vector2(x, z)));
    const hg = new THREE.ExtrudeGeometry(shape, { depth: 3.4, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 4, curveSegments: 12 });
    hg.rotateX(Math.PI / 2);
    const hm = new THREE.Mesh(hg, std({ color: 0x8a8a82, roughness: 0.8, metalness: 0.1 }));     // a fouled, weathered bottom: grey in the blue-green light
    hm.position.y = 14.2; hullUnder.add(hm);
    const keel = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.15, -14), new THREE.Vector2(0.15, -14), new THREE.Vector2(0.15, 26), new THREE.Vector2(-0.15, 26)]),
      { depth: 0.5, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 }).rotateX(Math.PI / 2), hm.material);
    keel.position.y = 14.2 - 3.6; hullUnder.add(keel);
    const prop = new THREE.Group(); prop.position.set(0, 14.2 - 2.5, -15.7); hullUnder.add(prop);      // aft of the stern (it ends at z -15)
    const bronze = std({ color: 0x8a6a3a, metalness: 0.85, roughness: 0.35 });
    prop.add(new THREE.Mesh(new THREE.LatheGeometry([[0, -0.3], [0.22, -0.25], [0.25, 0.2], [0.1, 0.4], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 20).rotateX(Math.PI / 2), bronze));
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8), bronze);
      bl.scale.set(1, 0.18, 0.06); bl.position.set(Math.cos((i * Math.PI) / 2) * 0.6, Math.sin((i * Math.PI) / 2) * 0.6, 0);
      bl.rotation.z = (i * Math.PI) / 2; bl.rotation.x = 0.4; prop.add(bl);
    }
    const rudder = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(1.0, -2.0), new THREE.Vector2(0, -2.2)]),
      { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).rotateY(Math.PI / 2), hm.material);
    rudder.position.set(-0.06, 14.2 - 1.2, -16.5); hullUnder.add(rudder);
    hullUnder.userData.prop = prop;
    hullUnder.position.set(-3.6, 0, 18.2);       // her stern right over the spot where Nerpa went in: the propeller in Snell's window
  }
  // a Caspian seal near the surface (only in these shots, CLAUDE.md 23.3-G)
  const seal = new THREE.Group(); surf.add(seal);
  {
    const fur = std({ color: 0x5a564e, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0, -0.6], [0.12, -0.52], [0.2, -0.3], [0.22, 0], [0.18, 0.3], [0.1, 0.48], [0.07, 0.56], [0, 0.6]].map(([a, b]) => new THREE.Vector2(a, b)), 20), fur);
    body.rotation.x = Math.PI / 2; seal.add(body);
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), fur); f.scale.set(1, 0.2, 0.6); f.position.set(sx * 0.2, -0.05, 0.25); f.rotation.z = sx * 0.5; seal.add(f); }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6), fur); tail.scale.set(1.2, 0.15, 0.6); tail.position.z = -0.62; seal.add(tail);
    seal.userData.tail = tail;
  }
  // mnemiopsis comb jellies that drift past the camera in the twilight zone (shot 4)
  const combs = [ctenophore(0.16), ctenophore(0.11), ctenophore(0.13)];
  combs.forEach((c) => { c.visible = false; deep.add(c); });
  // silt thrown up when the skids touch the bottom (shot 5)
  const puffTex = soft2("150,140,118"), puffs = [];
  for (let i = 0; i < 40; i++) { const pf = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 })); pf.userData.life = -1; deep.add(pf); puffs.push(pf); }
  function puffBurst(x, z) {
    for (const pf of puffs) {
      const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.2;
      pf.position.set(x + Math.cos(a) * r, bedH(x, z) + 0.1, z + Math.sin(a) * r);
      pf.userData.life = 0; pf.userData.v = new THREE.Vector3(Math.cos(a) * (0.5 + Math.random()), 0.15 + Math.random() * 0.4, Math.sin(a) * (0.5 + Math.random()));
    }
  }
  function stepPuffs(dt) {
    for (const pf of puffs) {
      if (pf.userData.life < 0) continue;
      pf.userData.life += dt;
      const L = pf.userData.life / 5;
      if (L >= 1) { pf.userData.life = -1; pf.material.opacity = 0; continue; }
      pf.position.addScaledVector(pf.userData.v, dt); pf.userData.v.multiplyScalar(Math.exp(-0.7 * dt));
      const sc = 0.6 + L * 3.0; pf.scale.set(sc, sc * 0.7, 1);
      pf.material.opacity = 0.5 * (1 - L) * Math.min(1, pf.userData.life * 3);
    }
  }
  // the depth counter over the film (shots 3-5)
  const depthBox = document.createElement("div");
  depthBox.className = "cine-depth"; depthBox.hidden = true;
  depthBox.innerHTML = `<small>${t("ck_depth")}</small><b>0000</b>`;
  document.body.append(depthBox);
  const setDepth = (m) => { depthBox.querySelector("b").textContent = String(Math.round(Math.max(0, m))).padStart(4, "0"); };
  const shaftTex = canvasTexture(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(200,232,242,.6)"); gr.addColorStop(1, "rgba(200,232,242,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const gx = g.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, "rgba(0,0,0,1)"); gx.addColorStop(0.5, "rgba(0,0,0,0)"); gx.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out"; g.fillStyle = gx; g.fillRect(0, 0, w, h);
  });
  const shafts = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + Math.random() * 2.6, 34), new THREE.MeshBasicMaterial({
      map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3, side: THREE.DoubleSide, fog: false }));
    m.position.set((Math.random() - 0.5) * 16, -3, (Math.random() - 0.5) * 16 - 2);
    m.rotation.y = Math.random() * 3; m.rotation.z = (Math.random() - 0.5) * 0.25; m.userData.ph = Math.random() * 6;
    surf.add(m); shafts.push(m);
  }

  // ---- the seabed of the South Caspian Basin, ~950 m (CLAUDE.md 22.1, 23.3-G): grey-brown silt over sand with
  // ripples (a 300 x 300 heightfield; CC0 textures "Coast Sand 02" from Poly Haven in web/assets/seabed), ~200 rocks
  // with silt settled on their tops, scattered cockle shells, a mud volcano breathing a column of gas bubbles
  const bedGroup = new THREE.Group();
  deep.add(bedGroup);
  // ONE silt shader for everything on the bottom (23.3-G): where the world normal looks up (y > ~0.6) the surface
  // fades into silt with a patchy noise, matte and non-metallic; under water every colour is a little muted
  // (the red falls off with distance in the water pass, view.js). Works for instanced meshes too.
  const siltShader = (mat, hex = 0x756d5f, amount = 0.85, tri = null, mute = 0.14) => {
    if (tri) { mat.map = tri.map; mat.normalMap = tri.normalMap; mat.roughnessMap = tri.roughnessMap; }   // (defines USE_MAP etc.; sampled triplanar below)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSilt = { value: new THREE.Color(hex) }; sh.uniforms.uSiltK = { value: amount }; sh.uniforms.uMute = { value: mute };
      if (tri) {
        sh.uniforms.uTriScale = { value: tri.scale };
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vTriN;")
          .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
            #ifdef USE_INSTANCING
              vTriN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
            #else
              vTriN = normalize(mat3(modelMatrix) * objectNormal);
            #endif`);
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
            varying vec3 vTriN; uniform float uTriScale;
            vec3 triW() { vec3 w = pow(abs(normalize(vTriN)), vec3(4.0)); return w / (w.x + w.y + w.z); }`)
          .replace("#include <map_fragment>", `{
              vec3 w = triW(); vec3 p = vSiltW * uTriScale;
              vec4 tc = texture2D(map, p.zy) * w.x + texture2D(map, p.xz) * w.y + texture2D(map, p.xy) * w.z;
              diffuseColor *= tc;
            }`)
          .replace("#include <roughnessmap_fragment>", `float roughnessFactor = roughness;
            { vec3 w = triW(); vec3 p = vSiltW * uTriScale;
              roughnessFactor *= (texture2D(roughnessMap, p.zy) * w.x + texture2D(roughnessMap, p.xz) * w.y + texture2D(roughnessMap, p.xy) * w.z).g; }`)
          .replace("#include <normal_fragment_maps>", `{
              vec3 w = triW(); vec3 p = vSiltW * uTriScale; vec3 N = normalize(vTriN);
              vec3 tx = texture2D(normalMap, p.zy).xyz * 2.0 - 1.0, ty = texture2D(normalMap, p.xz).xyz * 2.0 - 1.0, tz = texture2D(normalMap, p.xy).xyz * 2.0 - 1.0;
              // whiteout blend per axis, in world space
              vec3 nx = vec3(0.0, tx.yx * normalScale.yx) + vec3(N.x, 0.0, 0.0);
              vec3 ny = vec3(ty.x * normalScale.x, 0.0, ty.y * normalScale.y) + vec3(0.0, N.y, 0.0);
              vec3 nz = vec3(tz.xy * normalScale, 0.0) + vec3(0.0, 0.0, N.z);
              vec3 wn = normalize(nx.zyx * vec3(sign(N.x), 1.0, 1.0) * w.x + ny * w.y + nz * w.z + N * 0.5);
              normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
            }
            #include <normal_fragment_maps_disabled>`)
          .replace("#include <normal_fragment_maps_disabled>", "");
      }
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSiltW;")
        .replace("#include <project_vertex>", `#include <project_vertex>
          vec4 siltW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            siltW = instanceMatrix * siltW;
          #endif
          vSiltW = (modelMatrix * siltW).xyz;`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
          varying vec3 vSiltW; uniform vec3 uSilt; uniform float uSiltK; uniform float uMute;
          float sH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float sN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(sH(i), sH(i + vec2(1, 0)), f.x), mix(sH(i + vec2(0, 1)), sH(i + vec2(1, 1)), f.x), f.y); }`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          {
            vec3 wn = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
            float n = sN(vSiltW.xz * 5.0) * 0.6 + sN(vSiltW.xz * 21.0 + 3.0) * 0.4;
            float k = smoothstep(0.42 + 0.3 * n, 0.85 + 0.1 * n, wn.y) * uSiltK;
            diffuseColor.rgb = mix(diffuseColor.rgb, uSilt * (0.82 + 0.36 * n), k);
            float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), uMute);
            roughnessFactor = mix(roughnessFactor, 1.0, k);
            metalnessFactor = mix(metalnessFactor, 0.0, k);
          }`);
    };
    mat.customProgramCacheKey = () => (tri ? "silt-tri" : "silt");
    return mat;
  };
  const siltOnTop = siltShader;
  const bigRocks = [];
  {
    const g = new THREE.PlaneGeometry(64, 64, 300, 300).rotateX(-Math.PI / 2);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setY(i, bedH(pa.getX(i), pa.getZ(i)));
    g.computeVertexNormals();
    const loader = new THREE.TextureLoader();
    const tex = (f, srgb) => { const t2 = loader.load(`assets/seabed/${f}`); t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.repeat.set(16, 16); t2.anisotropy = 8; if (srgb) t2.colorSpace = THREE.SRGBColorSpace; return t2; };
    const bed = new THREE.Mesh(g, std({ map: tex("coast_sand_02_diff_1k.jpg", true), normalMap: tex("coast_sand_02_nor_gl_1k.jpg"), roughnessMap: tex("coast_sand_02_rough_1k.jpg"),
                                        normalScale: new THREE.Vector2(1.2, 1.2), color: 0x9a9384, roughness: 1 }));      // tinted to grey-brown silt
    bed.receiveShadow = true; bedGroup.add(bed);
    // rocks (23.3-G): 6 shapes from a detail-4 icosahedron, displaced 25-40 % by 3D fbm plus ridged noise (sharp
    // edges), the base flattened; the CC0 "Rock Face" texture (Poly Haven) mapped triplanar, silt on the tops.
    // Sizes follow a power law — a lot of gravel, few boulders; all sunk 20-40 % into the silt and darker than it.
    const rtex = (f, srgb) => { const t2 = loader.load(`assets/rock/${f}`); t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.anisotropy = 8; if (srgb) t2.colorSpace = THREE.SRGBColorSpace; return t2; };
    const rockM = siltShader(std({ color: 0xa8a296, roughness: 1, normalScale: new THREE.Vector2(1.6, 1.6) }), 0x756d5f, 0.9,
      { map: rtex("rock_face_diff_1k.jpg", true), normalMap: rtex("rock_face_nor_gl_1k.jpg"), roughnessMap: rtex("rock_face_rough_1k.jpg"), scale: 0.9 });
    const simplex = new SimplexNoise({ random: (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })() });
    const fbm3 = (x, y, z) => simplex.noise3d(x, y, z) * 0.5 + simplex.noise3d(x * 2.1, y * 2.1, z * 2.1) * 0.25 + simplex.noise3d(x * 4.3, y * 4.3, z * 4.3) * 0.125;
    const ridged = (x, y, z) => { let r = 0, a = 0.5, f = 1; for (let o = 0; o < 3; o++) { r += a * (1 - Math.abs(simplex.noise3d(x * f, y * f, z * f))) ** 2; a *= 0.5; f *= 2.2; } return r; };
    const variants = [], PER = 72;
    bigRocks.length = 0;
    for (let v = 0; v < 6; v++) {
      let rg = new THREE.IcosahedronGeometry(1, 4); rg.deleteAttribute("normal"); rg.deleteAttribute("uv"); rg = mergeVertices(rg);   // welded: smooth, not faceted
      const rp = rg.attributes.position, tmp = new THREE.Vector3(), o = v * 7.3, amt = 0.25 + (v % 3) * 0.075;
      for (let i = 0; i < rp.count; i++) {
        tmp.fromBufferAttribute(rp, i);
        const n = fbm3(tmp.x * 1.1 + o, tmp.y * 1.1, tmp.z * 1.1 - o) * 1.6 + (ridged(tmp.x * 1.7 - o, tmp.y * 1.7, tmp.z * 1.7 + o) - 0.45) * 1.5;
        tmp.multiplyScalar(1 + amt * n);
        tmp.y *= 0.55 + (v % 2) * 0.2;
        if (tmp.y < -0.15) tmp.y = -0.15 + (tmp.y + 0.15) * 0.25;                  // a flattened base
        rp.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      rg.computeVertexNormals();
      variants.push(new THREE.InstancedMesh(rg, rockM, PER));
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    variants.forEach((im, v) => {
      for (let i = 0; i < im.count; i++) {
        const a = hash(i + v * 90, 11) * 6.28, d = 2.2 + Math.pow(hash(i + v * 90, 12), 0.8) * 28;
        const cl = hash(i, v + 30) < 0.5 ? 1.3 * hash(i, v + 31) : 0;                // gravel lies in loose clusters
        const x = Math.cos(a) * d + cl * Math.cos(i), z = Math.sin(a) * d + cl * Math.sin(i);
        const size = 0.035 + Math.pow(hash(i + v * 90, 13), 4.5) * 1.25;              // power law: mostly pebbles
        q.setFromEuler(new THREE.Euler((hash(i, v + 14) - 0.5) * 0.5, hash(i, v + 15) * 6.28, (hash(i, v + 16) - 0.5) * 0.5));
        sc.set(size * (0.8 + hash(i, v + 17) * 0.5), size, size * (0.8 + hash(i, v + 18) * 0.5));
        pos.set(x, bedH(x, z) - size * (0.2 + hash(i, v + 19) * 0.2) * 0.7, z);    // sunk 20-40 % of its height
        im.setMatrixAt(i, m4.compose(pos, q, sc));
        if (size > 0.55 && d < 14) bigRocks.push([x, z, size]);
      }
      im.castShadow = im.receiveShadow = true; bedGroup.add(im);
    });
    // cockle shells (Cerastoderma glaucum, common on the Caspian bed): small ribbed valves, 2-4 cm, in clusters;
    // the radial ribs are a normal map, colours vary from cream to brown and grey
    const RS = 128;
    const ribH = (u) => 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 22);
    const ribNormal = (() => {
      const c = document.createElement("canvas"); c.width = c.height = RS; const g = c.getContext("2d"), img = g.createImageData(RS, RS);
      for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
        const dx = (ribH((x + 1) / RS) - ribH((x - 1) / RS)) * 3.2, growth = Math.sin(y * 0.9) * 0.15, l = Math.hypot(dx, growth, 1), k = (y * RS + x) * 4;
        img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (growth / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const tx = new THREE.CanvasTexture(c); tx.wrapS = THREE.RepeatWrapping; return tx;
    })();
    const ribTex = canvasTexture(RS, 64, (c, w, h) => { c.fillStyle = "#d9d0bd"; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 6) { c.fillStyle = `rgba(110,90,66,${0.12 + 0.18 * Math.random()})`; c.fillRect(0, y, w, 2); }       // growth bands
      for (let x = 0; x < w; x += w / 22) { c.fillStyle = "rgba(255,250,235,.25)"; c.fillRect(x, 0, 1.5, h); } });
    const shellGeo = new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    { const sp = shellGeo.attributes.position; for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); sp.setZ(i, sp.getZ(i) * (1 - 0.18 * y) - 0.15 * y * y); } }   // the umbo leans back: a cockle, not a dome
    shellGeo.scale(0.022, 0.012, 0.02); shellGeo.computeVertexNormals();
    const shells = new THREE.InstancedMesh(shellGeo, std({ map: ribTex, normalMap: ribNormal, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.7, side: THREE.DoubleSide }), 900);
    const shellCols = [0xf0e6d2, 0xd8c3a0, 0xb79b78, 0x9c9488, 0xe8dcc4].map((h) => new THREE.Color(h));
    for (let i = 0; i < shells.count; i++) {
      const patch = Math.floor(hash(i, 81) * 26), pa2 = hash(patch, 82) * 6.28, pd = 2.5 + hash(patch, 83) * 22;
      const rr = Math.pow(hash(i, 84), 1.6) * 0.7, ra = hash(i, 85) * 6.28;
      const x = Math.cos(pa2) * pd + Math.cos(ra) * rr, z = Math.sin(pa2) * pd + Math.sin(ra) * rr;
      const up = hash(i, 88) < 0.35;                                       // some lie open side up
      q.setFromEuler(new THREE.Euler((hash(i, 86) - 0.5) * 0.7 + (up ? Math.PI : 0), hash(i, 87) * 6.28, (hash(i, 90) - 0.5) * 0.5));
      const ss = 0.7 + hash(i, 89) * 0.8;
      shells.setMatrixAt(i, m4.compose(pos.set(x, bedH(x, z) + (up ? 0.011 * ss : 0.002), z), q, sc.set(ss, ss, ss)));
      shells.setColorAt(i, shellCols[i % shellCols.length]);
    }
    shells.receiveShadow = true; bedGroup.add(shells);
  }
  // the mud volcano: a low cone of grey mud with a crater, gas bubbles rising from it in a column
  const MV = new THREE.Vector3(3.5, 0, -10.5);
  const bubbleCol = (() => {
    const mud = siltOnTop(std({ color: 0x5a554a, roughness: 1 }), 0x7a7262);
    const cone = new THREE.Mesh(new THREE.LatheGeometry([[0, 1.05], [0.3, 1.1], [0.55, 1.55], [0.75, 1.62], [1.0, 1.45], [1.8, 0.95], [2.8, 0.45], [4.0, 0.08], [4.6, -0.3]].map(([a, b]) => new THREE.Vector2(a, b)), 64), mud);   // a cone with a crater
    MV.y = bedH(MV.x, MV.z); cone.position.copy(MV); cone.receiveShadow = true; bedGroup.add(cone);
    const gas = bubbleTrail({ count: 160, rate: 9, life: 16, speed: 0.8, spread: 0.12 });
    gas.at = new THREE.Vector3(MV.x, MV.y + 1.15, MV.z);
    return gas;
  })();
  shareCones(bubbleCol);
  bubbleCol.mat.uniforms.uAmb.value = 0.12;
  // the searchlight of Nerpa and its visible cone of light in the water
  const spot = new THREE.SpotLight(0xe2f4ff, 0, 34, 0.42, 0.6, 2);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005;
  deep.add(spot, spot.target);
  const CH = 11, coneGeo = new THREE.ConeGeometry(Math.tan(0.42) * CH, CH, 40, 1, true);
  coneGeo.translate(0, -CH / 2, 0); coneGeo.rotateX(-Math.PI / 2);
  const cone = new THREE.Mesh(coneGeo, beamMat(1.25, new THREE.Vector3(0, 0, 1)));               // volumetric, with drifting murk (23.3-V)
  cone.visible = false;
  deep.add(cone);

  // silt settles on the upward faces of everything on the bottom
  const siltMat = (m, hex = 0x756d5f) => siltShader(m, hex, 0.65);
  // the flight recorder, as real ones: orange, white reflective bands, "FLIGHT RECORDER — DO NOT OPEN", the
  // underwater locator beacon (a cylinder with a blinking light) on the front, a handle, the mounting tray
  const recorder = new THREE.Group();
  let box = recorder;                   // the dive's main find: the recorder, or a story find (act I: the flap)
  {
    const orange = siltShader(std({ color: 0xff4f00, roughness: 0.5, metalness: 0 }), 0x8a7f6c, 0.4, null, 0);      // international orange, a thin film of silt on top
    const white = siltShader(std({ color: 0xd9d9d2, roughness: 0.45, metalness: 0 }), 0x8a7f6c, 0.4);
    const dark = std({ color: 0x2a2d30, roughness: 0.5, metalness: 0.6 });
    const body = new THREE.Mesh(rbox(0.5, 0.26, 0.34, 0.035), orange); body.position.y = 0.17; recorder.add(body);
    for (const x of [-0.17, 0.17]) { const band = new THREE.Mesh(rbox(0.05, 0.268, 0.348, 0.03), white); band.position.set(x, 0.17, 0); recorder.add(band); }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.15), new THREE.MeshStandardMaterial({ roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2,
      map: canvasTexture(512, 300, (c, w, h) => {
        c.fillStyle = "#ff4f00"; c.fillRect(0, 0, w, h);
        c.fillStyle = "#151515"; c.textAlign = "center";
        c.font = "800 50px Onest, sans-serif"; c.fillText("FLIGHT RECORDER", w / 2, 80);
        c.font = "700 40px Onest, sans-serif"; c.fillText("DO NOT OPEN", w / 2, 140);
        c.font = "600 30px Onest, sans-serif"; c.fillText("ENREGISTREUR DE VOL · NE PAS OUVRIR", w / 2, 192);
        c.font = "800 44px PT Mono, monospace"; c.fillText("AQ-271", w / 2, 258);
      }) }));
    label.position.set(0, 0.17, 0.171); recorder.add(label);
    const label2 = label.clone(); label2.rotation.y = Math.PI; label2.position.z = -0.171; recorder.add(label2);
    const tray = new THREE.Mesh(rbox(0.58, 0.04, 0.4, 0.015), siltMat(dark)); tray.position.y = 0.02; recorder.add(tray);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.12, 0.3, 0), new THREE.Vector3(-0.1, 0.36, 0), new THREE.Vector3(0.1, 0.36, 0), new THREE.Vector3(0.12, 0.3, 0)]), 12, 0.012, 6), dark);
    recorder.add(handle);
    const ulb = new THREE.Mesh(new THREE.LatheGeometry([[0, -0.15], [0.045, -0.145], [0.05, -0.12], [0.05, 0.11], [0.045, 0.14], [0.02, 0.15], [0, 0.15]].map(([a, b]) => new THREE.Vector2(a, b)), 20), std({ color: 0x8e9296, metalness: 0.9, roughness: 0.3 }));
    ulb.rotation.z = Math.PI / 2; ulb.position.set(0.4, 0.12, 0); recorder.add(ulb);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(5) }));
    led.position.set(0.56, 0.12, 0); recorder.add(led);
    const ll = new THREE.PointLight(0xff3020, 0, 3.5, 2); ll.position.copy(led.position); recorder.add(ll);
    recorder.scale.setScalar(1.15);
    recorder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    recorder.userData = { led, ll };
  }
  recorder.visible = false;
  deep.add(recorder);
  // act I's find (CLAUDE.md 17.4, story.json act1_dive_flap): a whole flap with the flight number, no scorch marks
  const flapFind = new THREE.Group();
  {
    const sk = aluSkin({ seed: 31 });
    const plate = new THREE.Mesh(tornPlate(1.9, 0.9, 7, 0.06), siltMat(std({ map: sk.map, normalMap: sk.normalMap, roughness: 0.38, metalness: 0.7 })));
    flapFind.add(plate);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2,
      map: canvasTexture(512, 160, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = "#1d2228"; c.font = "800 120px Onest, sans-serif"; c.textAlign = "center"; c.fillText("AQ-271", w / 2, 125); }) }));
    num.rotation.x = -Math.PI / 2; num.position.set(0, 0.075, 0.05); flapFind.add(num);
    const wire = std({ color: 0x222222, roughness: 0.6 });
    for (let k = 0; k < 3; k++) flapFind.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.9, 0.03, 0.2 + k * 0.05), new THREE.Vector3(-1.5, 0.22 + k * 0.05, 0.6), new THREE.Vector3(-2.3, 0.0, 0.25 + k * 0.1)]), 20, 0.018, 6), wire));
    flapFind.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  flapFind.visible = false;
  deep.add(flapFind);
  // the manipulator arm, a child of the camera during the search (it reaches out to grab)
  const claw = new THREE.Group();
  {
    // dark materials: the searchlight sits half a metre away and would blow them out to white
    const steel = std({ color: 0x2c3034, metalness: 0.9, roughness: 0.45 }), yel = std({ color: 0x5a4210, roughness: 0.55, metalness: 0.4 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.8), yel); arm.position.z = -0.4; claw.add(arm);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 14), steel); wrist.rotation.x = Math.PI / 2; wrist.position.z = -0.82; claw.add(wrist);
    const fL = new THREE.Group(), fR = new THREE.Group(); fL.position.set(-0.04, 0, -0.86); fR.position.set(0.04, 0, -0.86); claw.add(fL, fR);
    for (const [f, sgn] of [[fL, -1], [fR, 1]]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.22), steel); a.position.set(sgn * 0.05, 0, -0.1); a.rotation.y = sgn * 0.35; f.add(a); }
    claw.userData = { fL, fR };
  }
  const CLAW_REST = new THREE.Vector3(0.42, -0.62, -0.1);
  // wreckage (aircraft parts only, never people), 23.3-G: aluminium skin with rivet rows and torn edges, a fuselage
  // section with ribs and windows, a row of seats with oxygen masks hanging, the flap with cable bundles; around
  // them a suitcase, a yellow life vest, an overhead bin, a wire bundle. Silt on all the tops. Fictional livery.
  const debris = [];
  const props = [];
  {
    const skinA = aluSkin({ stripe: true, base: "#e7eaeb", seed: 11 }), skinB = aluSkin({ seed: 21 });
    const alu = siltMat(std({ map: skinB.map, normalMap: skinB.normalMap, roughness: 0.36, metalness: 0.72, side: THREE.DoubleSide }));
    const livery = siltMat(std({ map: skinA.map, normalMap: skinA.normalMap, roughness: 0.34, metalness: 0.5, side: THREE.DoubleSide }));
    const fab = siltMat(std({ color: 0x2d4a7a, roughness: 0.9 })), frameM = siltMat(std({ color: 0x9aa2a8, metalness: 0.8, roughness: 0.4 }));
    const yellow = std({ color: 0xffc21a, roughness: 0.6 }), wireM = std({ color: 0x202020, roughness: 0.6 });
    const mk = (fn, key) => { const g = new THREE.Group(); fn(g); g.userData.key = key; g.visible = false; g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); deep.add(g); debris.push(g); };
    // a big piece of skin with the livery stripe
    mk((g) => { const pl = new THREE.Mesh(tornPlate(3.2, 1.4, 3, 0.03), livery); pl.rotation.z = 0.06; g.add(pl);
      const bend = new THREE.Mesh(tornPlate(1.1, 0.8, 5, 0.03), alu); bend.position.set(1.7, 0.18, 0.2); bend.rotation.z = -0.5; g.add(bend); }, "dv_wing");
    // a fuselage section: a bent shell with frames and a row of windows
    mk((g) => {
      const R = 1.5, shell = new THREE.Shape();
      shell.absarc(0, 0, R + 0.04, 0.15, Math.PI * 0.85, false); shell.absarc(0, 0, R, Math.PI * 0.85, 0.15, true);
      const sg = new THREE.ExtrudeGeometry(shell, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 32 });
      const uv = sg.attributes.uv, pp = sg.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, Math.atan2(pp.getY(k), pp.getX(k)) / 2.2, pp.getZ(k) / 2.2);
      const sh = new THREE.Mesh(sg, livery); sh.position.z = -1.1; g.add(sh);
      for (let k = 0; k < 4; k++) { const fr = new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.035, 6, 32, Math.PI * 0.7), frameM); fr.rotation.z = 0.15 + Math.PI * 0.075; fr.position.z = -1 + k * 0.66; g.add(fr); }
      for (let k = 0; k < 4; k++) { const a = Math.PI * 0.3, w = new THREE.Mesh(new THREE.CircleGeometry(0.12, 18), std({ color: 0x0b1418, roughness: 0.15, metalness: 0.6 })); w.scale.y = 1.4;
        w.position.set(Math.cos(a) * (R + 0.05), Math.sin(a) * (R + 0.05), -0.9 + k * 0.55); w.lookAt(w.position.clone().multiplyScalar(2)); g.add(w); }
      g.rotation.x = 0;
      g.children.forEach((c) => { c.position.y -= R * 0.55; });
    }, "dv_fuselage");
    // a row of three economy seats (23.3-G): woven fabric with the fictional airline's pattern, headrests with
    // covers, armrests, seat-back pockets, lap belts with buckles hanging loose; the end seat is broken — its back
    // snapped forward and sideways, its headrest torn off; an oxygen mask on its hose lies beside the row
    mk((g) => {
      const W = 512, weave = (c, w, h) => { for (let y = 0; y < h; y += 2) for (let x = (y / 2) % 2 ? 0 : 2; x < w; x += 4) { c.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`; c.fillRect(x, y, 2, 2); } };
      const fabMap = canvasTexture(W, W, (c, w, h) => {
        c.fillStyle = "#18264a"; c.fillRect(0, 0, w, h);
        c.strokeStyle = "rgba(47,160,170,.5)"; c.lineWidth = 6;                    // the airline's teal wave, repeating
        for (let y = 40; y < h; y += 96) { c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, y + Math.sin(x / w * Math.PI * 4) * 14); c.stroke(); }
        c.fillStyle = "rgba(232,176,74,.5)"; for (let y = 88; y < h; y += 96) for (let x = 32; x < w; x += 64) { c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); }
        weave(c, w, h);
      });
      fabMap.wrapS = fabMap.wrapT = THREE.RepeatWrapping;
      const fabNor = (() => {
        const S2 = 128, c = document.createElement("canvas"); c.width = c.height = S2; const x2 = c.getContext("2d"), img = x2.createImageData(S2, S2);
        for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {         // a basket weave: threads alternate over and under
          const cell = ((x >> 2) + (y >> 2)) % 2, fx = (x % 4) / 4 - 0.4, fy = (y % 4) / 4 - 0.4;
          const nx = cell ? fx * 0.9 : 0, ny = cell ? 0 : fy * 0.9, l = Math.hypot(nx, ny, 1), k = (y * S2 + x) * 4;
          img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
        }
        x2.putImageData(img, 0, 0); const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(10, 10); return tx;
      })();
      const fab = siltMat(std({ map: fabMap, normalMap: fabNor, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 }));
      const cover = siltMat(std({ map: canvasTexture(256, 128, (c, w, h) => {
        c.fillStyle = "#e9e4d8"; c.fillRect(0, 0, w, h); c.fillStyle = "#2fa0aa"; c.fillRect(0, h - 22, w, 10);
        c.fillStyle = "#22355a"; c.font = "800 44px Onest, sans-serif"; c.textAlign = "center"; c.fillText("AQ", w / 2, h / 2 + 8); weave(c, w, h);
      }), roughness: 0.9 }));
      const plastic = siltMat(std({ color: 0x8f9396, roughness: 0.55 })), darkFab = siltMat(std({ color: 0x1a2236, roughness: 0.95 }));
      const metal = siltMat(std({ color: 0x7d8286, metalness: 0.8, roughness: 0.5 })), strap = std({ color: 0x3a3f46, roughness: 0.85 });
      const ribbon = (pts, w) => {        // a flat strap along a curve
        const cur = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), N = 24, pos = [], idx = [];
        for (let k = 0; k <= N; k++) { const p = cur.getPoint(k / N), tn = cur.getTangent(k / N), side = new THREE.Vector3(1, 0, 0).sub(tn.clone().multiplyScalar(tn.x)).normalize().multiplyScalar(w / 2);
          pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
          if (k < N) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
      };
      const seat = (x, broken) => {
        const s = new THREE.Group(); s.position.x = x; g.add(s);
        const cush = new THREE.Mesh(rbox(0.46, 0.13, 0.48, 0.05, 4), fab); cush.position.set(0, 0.44, 0.02); s.add(cush);
        const back = new THREE.Group(); back.position.set(0, 0.5, -0.22); s.add(back);
        const bf = new THREE.Mesh(rbox(0.46, 0.68, 0.11, 0.05, 4), fab); bf.position.set(0, 0.34, 0); back.add(bf);
        const shell = new THREE.Mesh(rbox(0.47, 0.7, 0.035, 0.015, 2), plastic); shell.position.set(0, 0.34, -0.07); back.add(shell);
        const pocket = new THREE.Mesh(rbox(0.36, 0.24, 0.025, 0.01, 2), darkFab); pocket.position.set(0, 0.16, -0.095); back.add(pocket);
        const band = new THREE.Mesh(rbox(0.36, 0.02, 0.03, 0.008, 1), strap); band.position.set(0, 0.28, -0.1); back.add(band);
        const card = new THREE.Mesh(rbox(0.16, 0.12, 0.004, 0.002, 1), std({ color: 0xe8e2d0, roughness: 0.8 })); card.position.set(0.07, 0.3, -0.1); card.rotation.z = 0.1; back.add(card);
        const tray = new THREE.Mesh(rbox(0.06, 0.03, 0.02, 0.008, 1), plastic); tray.position.set(0, 0.5, -0.1); back.add(tray);   // the tray-table latch
        if (!broken) {
          const head = new THREE.Mesh(rbox(0.38, 0.19, 0.1, 0.05, 4), fab); head.position.set(0, 0.77, 0.01); back.add(head);
          const cv = new THREE.Mesh(rbox(0.39, 0.16, 0.105, 0.04, 3), cover); cv.position.set(0, 0.78, 0.012); cv.scale.set(1, 1, 1.02); back.add(cv);
          back.rotation.x = -0.2;
        } else {
          back.rotation.set(0.75, 0, 0.32);                 // snapped forward and sideways at the recline joint
          const hinge = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12, Math.PI * 1.3), metal); hinge.position.set(0.23, 0.5, -0.22); hinge.rotation.y = Math.PI / 2; s.add(hinge);
          const head = new THREE.Mesh(rbox(0.38, 0.19, 0.1, 0.05, 4), fab); head.position.set(0.55, 0.06, 0.45); head.rotation.set(0.2, 0.9, 1.4); s.add(head);   // the headrest torn off, in the silt
        }
        for (const sx of [-0.12, 0.12]) {                    // lap belt halves, hanging loose off the cushion, with buckles
          const lx = sx * 1.6;
          s.add(new THREE.Mesh(ribbon([[lx, 0.47, -0.16], [lx * 0.9, 0.52, 0.0], [lx * 0.7, 0.5, 0.2], [lx * 0.75, 0.3, 0.3], [lx * 0.8, 0.05, 0.36]], 0.045), strap));
          const bk = new THREE.Mesh(rbox(0.06, 0.012, 0.08, 0.005, 1), metal); bk.position.set(lx * 0.8, 0.04, 0.4); bk.rotation.y = sx * 2; s.add(bk);
        }
        const legs = [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.14], [0.18, 0.14]];
        for (const [lx, lz] of legs) s.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(lx, 0.38, lz), new THREE.Vector3(lx * 1.1, 0, lz + (broken && lx > 0 ? 0.12 : 0))), 1, 0.018, 6), metal));
        return s;
      };
      seat(-0.56, false); seat(0, false); const b = seat(0.56, true); b.rotation.z = -0.1;
      for (const x of [-0.84, -0.28, 0.28]) {             // armrests with their supports
        const arm = new THREE.Mesh(rbox(0.055, 0.06, 0.44, 0.02, 2), plastic); arm.position.set(x, 0.66, -0.02); g.add(arm);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(x, 0.63, -0.18), new THREE.Vector3(x, 0.45, -0.2)), 1, 0.014, 6), metal));
      }
      for (const z of [-0.12, 0.14]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-0.8, 0.36, z), new THREE.Vector3(0.75, 0.36, z)), 1, 0.022, 8), metal));   // the seat track beams
      // the oxygen mask on its hose, beside the row
      const yellowM = siltMat(std({ color: 0xffc21a, roughness: 0.55 }));
      const mask = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0.004], [0.06, 0.035], [0.05, 0.06], [0.03, 0.065]].map(([a2, b2]) => new THREE.Vector2(a2, b2)), 18), yellowM);
      mask.position.set(1.05, 0.03, 0.45); mask.rotation.set(-1.3, 0, 0.3); g.add(mask);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(1.05, 0.06, 0.4), new THREE.Vector3(1.2, 0.03, 0.15), new THREE.Vector3(1.0, 0.02, -0.15), new THREE.Vector3(1.15, 0.04, -0.45)]), 24, 0.008, 6), std({ color: 0xd8e4ea, roughness: 0.3, transparent: true, opacity: 0.75 })));
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.003, 4, 20), strap).translateX(1.05).translateY(0.05).translateZ(0.5));   // its elastic band
      const bag = new THREE.Mesh(rbox(0.07, 0.05, 0.1, 0.02, 2), std({ color: 0xe0e4e2, roughness: 0.4, transparent: true, opacity: 0.6 })); bag.position.set(1.15, 0.03, -0.48); g.add(bag);
      g.children.forEach((c) => { c.position.y -= 0.16; });        // settled: the legs half in the silt
      g.rotation.z = 0.06;
    }, "dv_seats");
    // the flap with torn cable bundles
    mk((g) => {
      g.add(new THREE.Mesh(tornPlate(1.4, 0.6, 17, 0.05), alu));
      for (let k = 0; k < 4; k++) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6, 0.03, 0.05 * k), new THREE.Vector3(-1.3, 0.25 + 0.04 * k, 0.5 - 0.05 * k), new THREE.Vector3(-2.2, 0.0, 0.2 + 0.08 * k)]), 20, 0.014 + 0.004 * k, 6), k === 2 ? std({ color: 0xb8432f, roughness: 0.6 }) : wireM));
    }, "dv_flap");
    // the small things that lie around the debris and the box
    const mkProp = (fn) => { const g = new THREE.Group(); fn(g); g.visible = false; g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); deep.add(g); props.push(g); };
    mkProp((g) => { g.add(new THREE.Mesh(rbox(0.66, 0.24, 0.44, 0.06), siltMat(std({ color: 0x5a2a33, roughness: 0.5 }))));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.1, 0.12, -0.22), new THREE.Vector3(-0.08, 0.12, -0.28), new THREE.Vector3(0.08, 0.12, -0.28), new THREE.Vector3(0.1, 0.12, -0.22)]), 10, 0.014, 6), wireM));
      for (const z of [-0.12, 0.12]) { const zip = new THREE.Mesh(rbox(0.67, 0.012, 0.012, 0.004), frameM); zip.position.set(0, 0.0, z); g.add(zip); } });
    mkProp((g) => { const vest = std({ color: 0xffc21a, roughness: 0.55 });
      for (const sx of [-0.18, 0.18]) { const half = new THREE.Mesh(rbox(0.3, 0.1, 0.5, 0.05), vest); half.position.x = sx; half.rotation.y = sx * 0.6; g.add(half); }
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 16, Math.PI), vest); collar.rotation.x = -Math.PI / 2; collar.position.z = -0.25; g.add(collar);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, 0.05, 0.1), new THREE.Vector3(0, 0.06, 0.32), new THREE.Vector3(0.35, 0.05, 0.15)]), 12, 0.01, 4), std({ color: 0x1b1b1b }))); });
    mkProp((g) => { const bin = new THREE.Mesh(rbox(1.2, 0.36, 0.5, 0.06), siltMat(std({ color: 0xd6d8d6, roughness: 0.5 }))); g.add(bin);
      const lid = new THREE.Mesh(rbox(1.2, 0.04, 0.48, 0.02), siltMat(std({ color: 0xc8cbc9, roughness: 0.5 }))); lid.position.set(0, 0.33, 0.32); lid.rotation.x = -0.9; g.add(lid); });
    mkProp((g) => { for (let k = 0; k < 7; k++) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.8, 0.02, k * 0.025), new THREE.Vector3(-0.2, 0.12 + Math.sin(k) * 0.05, 0.1 + k * 0.02), new THREE.Vector3(0.5, 0.02, -0.05 + k * 0.03), new THREE.Vector3(1.0, 0.1, 0.1)]), 24, 0.008, 4), k % 3 ? wireM : std({ color: 0x2f6aa0, roughness: 0.5 }))); });
  }
  // ---- deep-sea life (CLAUDE.md v3.1, 19 p. 7)
  const life = createLife(deep, () => spot.position);

  // ---- the cockpit and the controls
  const cockpit = createCockpit(document.getElementById("ui").parentElement, {
    onSurface: () => surfaceNow(),
    onKey: (k, on) => { if (k === "sp" && on) sonarPing(); keys[k] = on; },
  });
  const keys = {};
  const KMAP = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r", KeyE: "e", Space: "sp" };
  addEventListener("keydown", (e) => {
    if (mode !== "dive" && mode !== "descent") return;
    if (e.code === "KeyQ") { surfaceNow(); return; }
    const k = KMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (k === "sp" && !keys.sp && mode === "dive") sonarPing();
    keys[k] = true;
  });
  addEventListener("keyup", (e) => { const k = KMAP[e.code]; if (k) keys[k] = false; });
  let mx = 0, my = 0;
  addEventListener("pointermove", (e) => {
    mx = clamp((e.clientX - innerWidth / 2) / (innerWidth * 0.32), -1, 1);
    my = clamp((e.clientY - innerHeight * cockpit.centreY) / (innerHeight * 0.34), -1, 1);
  });

  let mode = "off", T = 0, D = {}, finish = null;
  const COVN = (() => { let n = 0; for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) if (Math.hypot(i, j) * 2 <= SEARCH_R) n++; return n; })();
  const aimDir = new THREE.Vector3();

  function setup(sceneInfo) {
    const O2 = sceneInfo.o2 ?? O2_MAX;
    D = { x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0, turn: 0, o2: O2, max: O2, found: false, grabT: 0, cov: new Set(), pingCD: 0,
          pingerT: 0.6, seen: new Set(), creakT: 4, heartT: 0, tether: 0, shake: 0, desc: 0, t0: 0, tick: 0,
          hasBox: !!sceneInfo.box || !!sceneInfo.find, find: sceneInfo.find || null, hasDebris: !!sceneInfo.debris,
          debrisSeen: false, anyDebris: false, cine: null, fdOff: 0, fdRange: "", fdBars: 0, far: null, track: [[0, 0]], marks: [], buoys: [], task: sceneInfo.task || null, onEvent: sceneInfo.onEvent || (() => {}) };
    box = D.find ? flapFind : recorder;
    recorder.visible = flapFind.visible = false;
    for (const k in keys) keys[k] = false;
    const a = (Math.random() - 0.5) * 2.8, d = 14 + Math.random() * 3;
    const bx = -Math.sin(a) * d, bz = -Math.cos(a) * d;
    box.visible = D.hasBox;
    D.far = !D.hasBox && D.hasDebris ? { x: -Math.sin(a) * 60, z: -Math.cos(a) * 60 } : null;     // the box lies in the next cell, that way
    if (box.parent !== deep) deep.attach(box);
    box.position.set(bx, bedH(bx, bz) + 0.02, bz); box.rotation.set(0.08, Math.atan2(-bx, -bz) + (Math.random() - 0.5) * 0.6, -0.1);   // the label towards where Nerpa comes from
    // the trail of debris (22.3 p. 2): all four pieces lie in a line from the landing spot to the find, a little
    // to either side, as they fell when the tail broke up; with debris only the line runs off towards the next cell
    const along = D.hasBox ? [0.22, 0.42, 0.62, 0.8].map((f) => f * d) : [4, 8.5, 13, 17.5];
    debris.forEach((g, i) => {
      g.visible = D.hasDebris || D.hasBox;
      const side = (i % 2 ? 1 : -1) * (0.4 + Math.random() * 0.9), r = along[i] + (Math.random() - 0.5) * 0.8;
      const px = -Math.sin(a) * r + Math.cos(a) * side, pz = -Math.cos(a) * r - Math.sin(a) * side;
      g.position.set(px, bedH(px, pz) + 0.08, pz);               // half settled, one edge up: not swallowed by the ripples
      g.rotation.set((Math.random() - 0.5) * 0.35, Math.random() * 6, 0.12 + Math.random() * 0.2);
    });
    // the small things: near the box (or the debris), as if they fell out of the same section
    props.forEach((g, i) => {
      g.visible = D.hasBox || D.hasDebris;
      const near = D.hasBox ? { x: bx, z: bz } : debris[i % debris.length].position;
      const aa = Math.random() * Math.PI * 2, dd = 1.6 + Math.random() * 3.2, px = near.x + Math.cos(aa) * dd, pz = near.z + Math.sin(aa) * dd;
      g.position.set(px, bedH(px, pz) + 0.02, pz); g.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * 6, (Math.random() - 0.5) * 0.2);
    });
    cockpit.set({ o2: D.o2, max: D.max, fog: 0, low: false, depth: 0 });
    cockpit.tasks(D.hasBox ? ["dv_task_trail", "dv_task_find"] : D.hasDebris ? ["dv_task_trail"] : []);
  }

  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  /** Where the finder hears a beacon: the main find, or (debris only) far beyond the trail; null on an empty bed. */
  function beaconSource() {
    if (box.visible) return { x: box.position.x, y: box.position.y, z: box.position.z, far: false };
    if (D.hasDebris && D.far) return { x: D.far.x, y: D.y, z: D.far.z, far: true };
    return null;
  }

  function sonarPing() {
    if (mode !== "dive" || D.pingCD > 0) return;
    D.pingCD = 1.8; D.o2 -= 3; sfx.sonar();
    cockpit.ping(D.x, D.z, T);
    // the echoes stay on the dive map: the find a ring, each piece of debris a square (22.3 p. 3)
    const items = [...(box.visible ? [{ o: box, s: 1 }] : []), ...debris.filter((g) => g.visible).map((o) => ({ o, s: 0.55 }))];
    for (const { o, s } of items) {
      const dd = Math.hypot(o.position.x - D.x, o.position.z - D.z);
      if (dd > 28 || D.marks.some((m) => m.o === o)) continue;
      D.marks.push({ o, x: o.position.x, z: o.position.z, s, t: T + (dd / 28) * 1.2 });
    }
  }
  /** What the sonar screen draws (the dive map). */
  const scopeMap = () => ({ x: D.x, z: D.z, yaw: D.yaw, track: D.track, cov: D.cov, zone: SEARCH_R, tether: TETHER, marks: D.marks, buoys: D.buoys });

  async function descend(quick = false) {
    mode = "descent";
    D.y = bedH(0, 0) + (quick ? 2.6 : 22);
    top.intensity = 1.8; top.color.set(0x3f86a8);
    deep.fog.color.set(0x02161f); deep.fog.density = 0.082; deep.background.set(0x010a10);
    snow.mat.uniforms.uAmb.value = 0.16; snow.mat.uniforms.uOn.value = 1;
    spot.intensity = 0; cone.visible = false; D.desc = 1;
    cockpit.show(); document.body.classList.add("diving");
    sfx.underwater(true);
    if (!quick) cockpit.msg(t("dv_descent", { m: String(BED_M) }), 2600);
    if (quick) { spot.intensity = SPOT_I; cone.visible = true; top.intensity = 0; }      // the film showed the way down
    else setTimeout(() => { sfx.clack(); spot.intensity = SPOT_I; cone.visible = true; cockpit.msg(t("dv_light"), 1600); }, 1500);
    const y0 = D.y, y1 = bedH(0, 0) + 1.8;
    await anim(quick ? 1.2 : 5.5, (k) => {
      D.y = y0 + (y1 - y0) * ease(k); top.intensity = 1.8 * (1 - k);
      D.shake = 0.03 * (1 - k) + (k > 0.92 ? (1 - k) * 0.4 : 0); D.desc = 1 - k;
      cockpit.set({ depth: BED_M - (D.y - bedH(0, 0)) * 9 - (1 - k) * 700 });
      if (Math.random() < 0.02) sfx.bubbles(2);
    });
    D.shake = 0; D.desc = 0;
    sfx.creak(); sfx.thud();
    cockpit.msg(D.task ?? t("dv_bottom"), 3600);              // a story dive: its task from the briefing
    mode = "dive"; D.t0 = T; cockpit.live(true);
    D.onEvent("start"); cockpit.pulseFinder();            // Dana: "the needle of the finder — swim where it points"
    setTimeout(() => cockpit.hideHelp(), 9000);
  }

  function update(dt) {
    const fwd = (keys.f ? 1 : 0) - (keys.b ? 0.6 : 0), turn = (keys.l ? 1 : 0) - (keys.r ? 1 : 0);
    D.turn += (turn - D.turn) * Math.min(1, dt * 4);
    D.yaw += D.turn * 0.95 * dt;
    if (Math.abs(mx) > 0.74) D.yaw -= Math.sign(mx) * (Math.abs(mx) - 0.74) * 1.7 * dt;     // mouse at the edge turns too
    const fx = -Math.sin(D.yaw), fz = -Math.cos(D.yaw);
    D.vx += fx * fwd * 2.5 * dt; D.vz += fz * fwd * 2.5 * dt;
    const damp = Math.exp(-1.4 * dt); D.vx *= damp; D.vz *= damp;
    D.x += D.vx * dt; D.z += D.vz * dt;
    const rr = Math.hypot(D.x, D.z);
    if (rr > TETHER) {
      D.x *= TETHER / rr; D.z *= TETHER / rr; D.vx *= -0.3; D.vz *= -0.3;
      if (T > D.tether) { cockpit.msg(t("dv_tether")); D.tether = T + 5; }
    }
    D.y += (bedH(D.x, D.z) + 1.8 - D.y) * Math.min(1, dt * 1.8);
    const last = D.track[D.track.length - 1];
    if (Math.hypot(D.x - last[0], D.z - last[1]) > 0.6) D.track.push([D.x, D.z]);     // the own track on the dive map
    sfx.thrust(Math.abs(fwd) + Math.abs(turn) * 0.5);
    D.o2 -= dt; D.pingCD -= dt;
    if ((D.tick += dt) > 0.25) {
      D.tick = 0;
      cockpit.set({ o2: D.o2, max: D.max, fog: clamp((16 - D.o2) / 16, 0, 0.85), depth: BED_M - bedH(D.x, D.z) * 9, low: D.o2 < 12 });
    }
    if (D.o2 < 12 && (D.heartT -= dt) <= 0) { D.heartT = 0.85; sfx.heart(); }
    if ((D.creakT -= dt) <= 0) { D.creakT = 6 + Math.random() * 7; sfx.creak(); }
    // where the light points: what is seen, what can be grabbed, how much seabed is covered
    const aimYaw = D.yaw - mx * 0.62, aimPitch = clamp(-0.36 - my * 0.55, -1.1, 0.25);
    aimDir.set(-Math.sin(aimYaw) * Math.cos(aimPitch), Math.sin(aimPitch), -Math.cos(aimYaw) * Math.cos(aimPitch));
    const bp = box.position, dx = bp.x - D.x, dy = bp.y - D.y, dz = bp.z - D.z, dist = Math.hypot(dx, dy, dz);
    const dot = (dx * aimDir.x + dy * aimDir.y + dz * aimDir.z) / Math.max(0.001, dist);
    if (box.visible && !D.found && dist < 8.5 && dot > Math.cos(0.46)) { D.found = true; D.cine = 0; sfx.chord(); cockpit.tick(1); }
    for (const g of debris) {
      if (!g.visible || D.seen.has(g)) continue;
      const ex = g.position.x - D.x, ez = g.position.z - D.z, ey = g.position.y - D.y, ed = Math.hypot(ex, ey, ez);
      if (ed < 8 && (ex * aimDir.x + ey * aimDir.y + ez * aimDir.z) / ed > Math.cos(0.5)) {
        D.seen.add(g); if (D.hasDebris) D.debrisSeen = true; sfx.seen();
        D.cap = { id: cockpit.msg(t(g.userData.key), 4000), of: g };         // the caption of a find: 4 s, or until the next one
        if (!D.anyDebris) { D.anyDebris = true; D.onEvent("first_debris"); cockpit.tick(0); }      // Dana's line and the tick
      }
    }
    if (D.cap) {        // ... and it never hangs over something else: gone as soon as its find leaves the view
      const g = D.cap.of, ex = g.position.x - D.x, ez = g.position.z - D.z, ey = g.position.y - D.y, ed = Math.hypot(ex, ey, ez);
      if (ed > 11 || (ex * aimDir.x + ey * aimDir.y + ez * aimDir.z) / ed < Math.cos(0.85)) { cockpit.clearMsg(D.cap.id); D.cap = null; }
    }
    const canGrab = D.found && D.cine === null && dist < 3.3 && dot > Math.cos(0.7);
    if (canGrab) {
      if (keys.e) { D.grabT += dt; if (D.grabT >= 1.3) { grab(); return; } } else D.grabT = Math.max(0, D.grabT - dt * 2);
    } else D.grabT = 0;
    cockpit.prompt(canGrab, D.grabT / 1.3);
    if (aimPitch < -0.12) {
      for (const tt of [3, 5, 7]) for (const sd of [-1.5, 0, 1.5]) {
        const px = D.x - Math.sin(aimYaw) * tt + Math.cos(aimYaw) * sd, pz = D.z - Math.cos(aimYaw) * tt - Math.sin(aimYaw) * sd;
        if (Math.hypot(px, pz) <= SEARCH_R) D.cov.add(`${Math.round(px / 2)},${Math.round(pz / 2)}`);
      }
    }
    // the beacon pinger and the direction finder (22.3 p. 1). The ping is louder when close and comes from the
    // beacon's side (StereoPanner). The needle points to the beacon from the bow, and it is as honest as a real
    // hydroacoustic finder: far off the bearing wanders by up to +-25 deg, close by +-3 deg. Without the box here
    // the finder hears only the faint beacon of the next cell, beyond the trail of debris; on an empty bed nothing.
    const src = beaconSource(), sdx = src ? src.x - D.x : 0, sdz = src ? src.z - D.z : 0, sd = src ? Math.hypot(sdx, src.y - D.y, sdz) : 0;
    const trueRel = src ? wrapA(Math.atan2(-sdx, -sdz) - D.yaw) : 0;        // radians, + = to the left of the bow
    if ((D.pingerT -= dt) <= 0) {
      D.pingerT = 1;
      let vol = 0.04, pan = 0;
      if (src) {
        vol = src.far ? 0.12 : clamp(1.15 - sd / 26, 0.08, 1);
        pan = -Math.sin(wrapA(Math.atan2(-sdx, -sdz) - (D.yaw - mx * 0.36)));
        const amp = src.far ? 35 : 3 + 22 * clamp((sd - 3) / 13, 0, 1);    // deg
        D.fdOff = D.fdOff * 0.35 + (Math.random() * 2 - 1) * amp * 0.65 * 1.4;
        D.fdOff = clamp(D.fdOff, -amp, amp);
        const est = sd * (1 + (Math.random() * 2 - 1) * amp / 160), step = est > 10 ? 5 : 1;
        D.fdRange = src.far ? t("ck_finder_far", { m: "50" }) : t("ck_finder_dist", { m: String(Math.max(1, Math.round(est / step) * step)) });
        D.fdBars = src.far ? 1 : clamp(Math.ceil(vol * 5), 1, 5);
      }
      sfx.pinger(vol, pan); cockpit.pinger(src ? vol : 0.05);
      cockpit.finder({ bearing: src ? (-trueRel * 180) / Math.PI + D.fdOff : null, bars: src ? D.fdBars : 0, range: src ? D.fdRange : t("ck_finder_none") });
    } else cockpit.aim(src ? (-trueRel * 180) / Math.PI + D.fdOff : null);
    cockpit.set({ heading: D.yaw - mx * 0.36 });
    if (D.o2 <= 0) oxygenOut();
  }

  function placeCamera() {
    const lookYaw = D.yaw - mx * 0.36, lookPitch = clamp(-0.3 - my * 0.42, -0.9, 0.3), sh = D.shake || 0;
    camera.position.set(D.x + (Math.random() - 0.5) * sh, D.y + Math.sin(T * 1.25) * 0.035 + (Math.random() - 0.5) * sh, D.z + (Math.random() - 0.5) * sh);
    camera.rotation.set(lookPitch, lookYaw, Math.sin(T * 0.7) * 0.012 - (D.turn || 0) * 0.035);
    const aimYaw = D.yaw - mx * 0.62, aimPitch = clamp(-0.36 - my * 0.55, -1.1, 0.25);
    aimDir.set(-Math.sin(aimYaw) * Math.cos(aimPitch), Math.sin(aimPitch), -Math.cos(aimYaw) * Math.cos(aimPitch));
    spot.position.set(D.x + 0.25 * Math.cos(D.yaw), D.y - 0.35, D.z - 0.25 * Math.sin(D.yaw));
    if (D.cine !== null && D.cine !== undefined) {
      // the find (21.1 p. 8): the beam slowly passes along the orange casing, the camera turns to it
      const k = clamp(D.cine / CINE_S, 0, 1);
      const to = box.position.clone().sub(spot.position);
      const side = new THREE.Vector3(-to.z, 0, to.x).normalize();
      aimDir.copy(to).addScaledVector(side, Math.cos(k * Math.PI) * 0.9).normalize();
      const want = Math.atan2(-(box.position.x - D.x), -(box.position.z - D.z));
      camera.rotation.y += Math.atan2(Math.sin(want - camera.rotation.y), Math.cos(want - camera.rotation.y)) * ease(k);
      camera.rotation.x += (Math.atan2(box.position.y - D.y, Math.hypot(box.position.x - D.x, box.position.z - D.z)) - camera.rotation.x) * ease(k);
    }
    spot.target.position.copy(spot.position).addScaledVector(aimDir, 10);
    // the camera's exposure: close to the box the lamp is dimmed, as an auto-iris would, so the orange stays orange
    if (spot.intensity > 0 && mode === "dive") spot.intensity = SPOT_I * (box.visible ? clamp(spot.position.distanceTo(box.position) / 6, 0.26, 1) : 1);
    cone.position.copy(spot.position); cone.lookAt(spot.target.position);
    snow.mat.uniforms.uLP.value.copy(spot.position); snow.mat.uniforms.uLD.value.copy(aimDir);
    const flare = D.cine !== null && D.cine !== undefined && D.cine > CINE_S * 0.5;      // the beacon LED flashes during the find
    const on = flare ? Math.sin(T * 14) > 0 : Math.sin(T * 6) > 0.6;
    if (box.userData.led) { box.userData.led.visible = on; box.userData.ll.intensity = on ? (flare ? 12 : 4) : 0; }
  }

  function end(found) {
    if (mode === "ending" || mode === "off") return;
    mode = "ending"; cockpit.live(false); cockpit.prompt(false); sfx.thrust(0);
    return found;
  }
  async function ascend(dur = 3.2) {
    sfx.bubbles(10);
    const y0 = D.y;
    await anim(dur, (k) => { D.y = y0 + ease(k) * 9; top.intensity = k * 1.5; D.shake = 0.02 * Math.sin(k * Math.PI); });
    D.shake = 0;
  }
  async function surfaceNow() {
    if (mode !== "dive") return;
    end(false); sfx.clack(); cockpit.msg(t("dv_surface_cmd"), 2400);
    await sleep(700); await ascend(3.0);
    finish({ found: false });
  }
  async function oxygenOut() {
    end(false); sfx.alarm(); cockpit.msg(t("dv_o2_out"), 3000);
    await sleep(1200); await ascend();
    finish({ found: false });
  }
  async function grab() {
    end(true); sfx.claw();
    // the arm reaches out to the box, the fingers close, the box comes in close to the porthole
    const tgt = camera.worldToLocal(box.position.clone());
    const p0 = claw.position.clone(), p1 = new THREE.Vector3(clamp(tgt.x, -0.4, 0.5), clamp(tgt.y + 0.1, -0.7, 0.1), Math.max(tgt.z + 0.95, -2.6));
    await anim(1.0, (k) => { claw.position.lerpVectors(p0, p1, ease(k)); claw.userData.fL.rotation.y = 0.5 * k; claw.userData.fR.rotation.y = -0.5 * k; });
    camera.attach(box);
    await anim(0.4, (k) => { claw.userData.fL.rotation.y = 0.5 - 0.45 * k; claw.userData.fR.rotation.y = -0.5 + 0.45 * k; });
    sfx.found(); cockpit.msg(t(D.find ? "dv_got_find" : "dv_got_box"), 3000);
    const c0 = claw.position.clone(), b0 = box.position.clone(), c1 = new THREE.Vector3(0.25, -0.42, -1.1);
    anim(1.2, (k) => { claw.position.lerpVectors(c0, c1, ease(k)); box.position.copy(b0).add(c1.clone().sub(c0).multiplyScalar(ease(k))); });
    await sleep(900);
    await ascend();
    finish({ found: true });
  }

  let rise = 0;
  view.onFrame((dt, time) => {
    if (!active) return;
    const cine = mode === "dive" && D.cine !== null && D.cine !== undefined;
    if (cine) {
      D.cine += dt;                                          // real seconds
      if (D.cine >= CINE_S) { D.cine = null; D.cap = { id: cockpit.msg(t(D.find ? "dv_seen_find" : "dv_seen_box"), 4000), of: box }; }
    }
    dt *= cine ? 0.5 : 1;                                    // slow motion 0.5x while the beam finds the box
    T += dt;
    if (mode === "dive" && !cine) update(dt);
    else if (cine) { D.o2 -= dt; }
    if (mode === "dive" || mode === "descent" || mode === "ending") {
      placeCamera(); cockpit.drawScope(T, scopeMap()); cockpit.stepFinder(dt, T);
      life.update(dt, T, D, mode === "dive" && (keys.f || keys.b));
    }
    rise = mode === "descent" ? D.desc * 3.5 : 0;
    snow.mat.uniforms.uStreak.value = clamp(Math.hypot(D.vx || 0, D.vz || 0) * 0.5 + (D.desc || 0), 0, 1);
    snow.update(dt, time, camera, rise);
    surfPlane.material.uniforms.uT.value = time;
    beamUniforms.uT.value = time;
    bubbleCol.update(dt, time, (v) => v.copy(bubbleCol.at).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)));
    if (mode === "dive") stepPuffs(dt);
  });
  let active = false;

  /**
   * The first-person search. sceneInfo = {box, debris} from Python. fadeIn() reveals the screen.
   * Resolves {found, coverage, debrisSeen} when the bathyscaphe is back at the surface (screen dark).
   */
  async function search(sceneInfo, fadeIn, fadeOut, { quick = false } = {}) {
    active = true;
    view.useScene(deep);
    surf.visible = false;
    camera.rotation.order = "YXZ";
    camera.fov = 42; camera.updateProjectionMatrix();
    setup(sceneInfo);
    deep.add(camera);                                         // so the arm (its child) is drawn
    camera.add(claw); claw.position.copy(CLAW_REST); claw.rotation.set(-0.15, 0, 0);
    claw.userData.fL.rotation.y = claw.userData.fR.rotation.y = 0;
    cockpit.show();
    view.setWater(true, { cy: cockpit.centreY, r: cockpit.radius });
    placeCamera();
    const done = new Promise((r) => { finish = r; });
    nerpa.visible = false;
    await fadeIn();
    descend(quick);
    const res = await done;
    await fadeOut(res.found);
    view.setWater(false);
    if (box.parent !== deep) deep.attach(box);
    box.visible = false;
    camera.remove(claw); deep.remove(camera);
    cockpit.hide(); document.body.classList.remove("diving");
    sfx.underwater(false);
    mode = "off";
    return { found: res.found, find: res.found ? D.find : null, coverage: D.cov.size / COVN, debrisSeen: D.debrisSeen, seconds: T - D.t0, o2Left: Math.max(0, D.o2) };
  }

  /**
   * Shots 3-5 of the descent (CLAUDE.md 23.3-B). durs = [shot 3, shot 4, shot 5] seconds; skip() -> true when the
   * player pressed Space (the rest is cut short). Ends with Nerpa resting on the seabed, the camera beside her.
   */
  async function cinematic(durs, skip, sounds = {}) {
    active = true;
    view.useScene(deep);
    camera.rotation.order = "XYZ"; camera.fov = 52; camera.updateProjectionMatrix();
    nerpa.visible = true; depthBox.hidden = false;
    const model = nerpa.userData.model.userData;
    let lampOn = 0;
    const lampsOn = (on) => { lampOn = on ? 1 : 0; glare(); nerpa.userData.cones.forEach((c) => { c.visible = on; }); };
    const glare = () => model.lampGlare(lampOn, camera.position);
    lampsOn(false);
    const shot = (dur, fn) => new Promise((res) => {
      const t0 = performance.now(); let last = t0;
      const step = () => {
        const now = performance.now(), k = Math.min(1, (now - t0) / 1000 / dur);
        fn(k, Math.min(0.05, (now - last) / 1000), now / 1000); last = now;
        if (k >= 1 || skip()) res(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const tmpV = new THREE.Vector3();
    const Y0 = 60, Y0_SURF = Y0 + 14;
    // bubbles from the thrusters and the vents on top of the fairing
    const emitHull = (v) => {
      const props = model.props, r = Math.random();
      if (surf.visible && r < 0.25) { hullUnder.userData.prop.getWorldPosition(v); v.x += (Math.random() - 0.5) * 1.2; v.y += (Math.random() - 0.5) * 1.2; v.z -= Math.random() * 2; return v; }   // the ship's propeller wash
      if (r < 0.7) props[Math.floor(Math.random() * props.length)].getWorldPosition(v);
      else v.set((Math.random() - 0.5) * 1.6, 2.0, -0.6 + Math.random() * 1.2).applyMatrix4(nerpa.userData.model.matrixWorld);
      return v;
    };
    trail.clear(); trail.mat.uniforms.uSurf.value = Y0_SURF; trail.mat.uniforms.uAmb.value = 1.1;
    const snowToLamp = () => {        // the flakes glow in Nerpa's lamp cone
      const [l1, l2] = nerpa.userData.lamps, u = snow.mat.uniforms, mw = nerpa.userData.model.matrixWorld;
      nerpa.updateMatrixWorld(true);
      const qn = nerpa.userData.model.getWorldQuaternion(new THREE.Quaternion());
      u.uLP.value.copy(l1.at).applyMatrix4(mw); u.uLP2.value.copy(l2.at).applyMatrix4(mw);
      u.uLD.value.set(0, -0.3, 1).applyQuaternion(qn).normalize(); u.uLD2.value.copy(u.uLD.value);
      u.uOn2.value = u.uOn.value;
    };

    // ---- shot 3: from under the surface looking up — Snell's window, Tulpar's hull, Nerpa sinks past, a seal
    surf.position.set(0, Y0, 0); surf.visible = true;
    surfPlane.material.uniforms.uSurf.value = Y0 + 14; surfPlane.material.uniforms.uOrg.value.set(0, 0);
    deep.fog.color.set(0x0b3c50); deep.fog.density = 0.022; deep.background.set(0x0c4762);
    top.color.set(0x8fc4dc); top.intensity = 3.6;
    hemi.color.set(0x3a8fa8); hemi.groundColor.set(0x2f7f90); hemi.intensity = 2.6;      // near the surface light scatters from every side
    snow.mat.uniforms.uOn.value = 0; snow.mat.uniforms.uOn2.value = 0; snow.mat.uniforms.uAmb.value = 0.55;
    sounds.under?.();
    await shot(durs[0], (k, dt, time) => {
      const e = ease(k);
      nerpa.position.set(0.3, Y0 + 12.8 - e * 10.5, 0.2); nerpa.rotation.set(0, 0.4 + k * 0.5, Math.sin(k * 7) * 0.04);
      camera.position.set(3.2, Y0 + 4.0 - k * 1.5, 5.0);
      camera.lookAt(nerpa.position.x - 0.6 - (1 - e) * 1.2, nerpa.position.y + 1.2 + (1 - k) * 2.5, nerpa.position.z + (1 - e) * 1.0);   // first the stern and her propeller, then Nerpa
      surfPlane.material.uniforms.uCam.value.copy(camera.position);
      hullUnder.userData.prop.rotation.z += dt * 3;
      seal.position.set(-7 + k * 13, Y0 + 12.2 + Math.sin(k * 6) * 0.15, -3 + k * 2); seal.rotation.set(0, Math.PI / 2 - 0.3, Math.sin(time * 6) * 0.15);
      seal.userData.tail.rotation.y = Math.sin(time * 8) * 0.5;
      for (const m of shafts) m.material.opacity = 0.3 + 0.2 * Math.sin(time * 0.8 + m.userData.ph);
      caustic.intensity = 90 * (1 - k * 0.6); causticTex.offset.set(Math.sin(time * 0.31) * 0.2 + time * 0.03, Math.cos(time * 0.27) * 0.2);
      trail.update(dt, time, emitHull, k < 0.12 ? 6 : 1);          // the ballast vents: a burst of air as she goes under
      model.update(dt, time, 0.4);
      setDepth(k * 12);
    });
    surf.visible = false; caustic.intensity = 0;
    hemi.color.set(0x0d4257); hemi.groundColor.set(0x000000); hemi.intensity = 0.6;

    // ---- shot 4: the twilight zone — blue to black, the depth races, comb jellies; the lamps click on at ~200 m
    trail.mat.uniforms.uSurf.value = 1e6; trail.mat.uniforms.uAmb.value = 0.25;
    const H = 400, deepCol = new THREE.Color(), c0 = new THREE.Color(0x0a3550), c1 = new THREE.Color(0x03141f), c2 = new THREE.Color(0x010508);
    let lit = false;
    combs.forEach((c, i) => { c.visible = true; c.userData.ph = i * 1.7; });
    await shot(durs[1], (k, dt, time) => {
      const depth = 12 + 918 * Math.pow(k, 1.7);
      setDepth(depth);
      deepCol.copy(c0).lerp(c1, Math.min(1, k * 1.6)).lerp(c2, Math.max(0, (k - 0.6) / 0.4));
      deep.background.copy(deepCol); deep.fog.color.copy(deepCol); deep.fog.density = 0.03 + k * 0.05;
      top.intensity = 1.4 * Math.max(0, 1 - k * 2.2);
      snow.mat.uniforms.uAmb.value = 0.4 * (1 - k) + 0.16;
      const ny = H - k * 30;
      nerpa.position.set(0, ny, 0); nerpa.rotation.set(0, 0.9 + k * 0.4, Math.sin(time * 0.9) * 0.03);
      // three-quarters from the front: the beams cross the frame instead of shining into the lens
      const ry = 0.9 + k * 0.4, orbit = ry + 1.05 - k * 0.25;
      camera.position.set(Math.sin(orbit) * 5.8, ny - 0.1, Math.cos(orbit) * 5.8);
      camera.lookAt(Math.sin(ry) * 0.7, ny - 0.35, Math.cos(ry) * 0.7);
      fill.position.copy(camera.position).add(new THREE.Vector3(0, 1.2, 0)); fill.intensity = lit ? 11 : 3;
      if (!lit && depth >= 200) { lit = true; lampsOn(true); snow.mat.uniforms.uOn.value = 1; sounds.lights?.(); }
      if (lit) snowToLamp();
      combs.forEach((c, i) => {
        const f = (k - 0.35 - i * 0.12) / 0.5;
        c.visible = f > 0 && f < 1;
        camera.getWorldDirection(tmpV);
        const side = new THREE.Vector3().crossVectors(tmpV, new THREE.Vector3(0, 1, 0)).normalize();
        c.position.copy(camera.position).addScaledVector(tmpV, 0.9 + i * 0.35).addScaledVector(side, (f - 0.5) * 1.6 * (i % 2 ? -1 : 1)).add(new THREE.Vector3(0, -0.15 + i * 0.12, 0));
        c.rotation.set(Math.sin(time + i) * 0.3, time * 0.2 + i, 0.2);
        c.userData.mat.uniforms.uT.value = time + c.userData.ph; c.userData.mat.uniforms.uLit.value = lit ? 1 : 0.15;
      });
      if (Math.random() < 0.01) sounds.creak?.();
      model.update(dt, time, 0.3); glare(); trail.update(dt, time, k < 0.7 ? emitHull : null);
    });
    combs.forEach((c) => { c.visible = false; });

    // ---- shot 5: the seabed comes up in the light; the skids touch, a cloud of silt; then into the cockpit
    if (!lit) { lampsOn(true); snow.mat.uniforms.uOn.value = 1; }
    deep.fog.color.set(0x02161f); deep.fog.density = 0.07; deep.background.set(0x010a10); top.intensity = 0;
    snow.mat.uniforms.uAmb.value = 0.16;
    const bed = bedH(0, 0);
    let landed = false;
    await shot(durs[2], (k, dt, time) => {
      setDepth(930 + 20 * Math.min(1, k / 0.8));
      const kk = Math.min(1, k / 0.8), e = 1 - Math.pow(1 - kk, 2.2);
      const ny = bed + 1.05 + 9 * (1 - e);
      nerpa.position.set(0, ny + (landed ? Math.sin((k - 0.8) * 30) * 0.03 * (1 - k) : 0), 0); nerpa.rotation.set(0, 1.25, 0);
      camera.position.set(3.6, bed + 0.75, 4.4);
      camera.lookAt(0, ny - 0.2, 0);
      fill.position.set(3.6, bed + 2.2, 4.4); fill.intensity = 5;
      snowToLamp();
      if (!landed && kk >= 1) { landed = true; puffBurst(0, 0); sounds.thud?.(); }
      stepPuffs(dt);
      model.update(dt, time, landed ? 0.05 : 0.2); glare(); trail.update(dt, time, null);
    });
    if (!landed) { nerpa.position.set(0, bed + 1.05, 0); puffBurst(0, 0); }
    fill.intensity = 0; trail.clear(); snow.mat.uniforms.uOn2.value = 0;
    depthBox.hidden = true;
  }

  /** Back to the table scene. */
  function leave() {
    active = false;
    surf.visible = false; nerpa.visible = false; depthBox.hidden = true;
    camera.rotation.order = "XYZ";
    view.useScene(null);
    view.refit();
  }

  /** Test hook (Playwright): park Nerpa 2.6 units in front of the box, looking at it. */
  function debugFaceBox() {
    if (mode !== "dive" || !box.visible) return false;
    const a = Math.atan2(box.position.x - D.x, box.position.z - D.z);
    D.x = box.position.x - Math.sin(a) * 2.6; D.z = box.position.z - Math.cos(a) * 2.6;
    D.yaw = Math.atan2(-(box.position.x - D.x), -(box.position.z - D.z)); D.vx = D.vz = 0; mx = 0; my = 0.35;
    return true;
  }

  /** Test hook (screenshots): put Nerpa at x, z looking along yaw; my = how far down the light and the eyes look. */
  function debugLook(x, z, yaw, lookDown = 0.35) {
    if (mode !== "dive") return false;
    D.x = x; D.z = z; D.yaw = yaw; D.vx = D.vz = 0; mx = 0; my = lookDown; D.y = bedH(x, z) + 1.8;
    return true;
  }
  /** Test hook: where the dive's main find and the debris lie. */
  const debugWhere = () => ({ box: box.visible ? box.position.toArray() : null, debris: debris.filter((g) => g.visible).map((g) => g.position.toArray()),
                             keys: debris.filter((g) => g.visible).map((g) => g.userData.key), rocks: bigRocks.slice().sort((a, b) => b[2] - a[2]).slice(0, 4) });
  return { deep, cinematic, search, leave, debugFaceBox, debugLook, debugWhere, stepPuffs };
}
