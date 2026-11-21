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
export const bedH = (x, z) => (fbm(x * 0.07 + 3.1, z * 0.07 + 1.7) - 0.5) * 3.4 + Math.sin(x * 0.9 + z * 0.35) * 0.06 + Math.sin(x * 0.37 - z * 0.83) * 0.05;
const BED_M = 950, O2_MAX = 60, SEARCH_R = 17, TETHER = 24, CINE_S = 2;

const std = (o) => new THREE.MeshStandardMaterial(o);
const soft = canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

/** "Marine snow": points that glow only inside the searchlight cone (plus a faint ambient). */
export function marineSnow(count = 2800) {
  const pos = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 28, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 28], i * 3);
    size[i] = 0.5 + Math.random() * Math.random() * 2.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aS", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uLP: { value: new THREE.Vector3() }, uLD: { value: new THREE.Vector3(0, 0, -1) }, uCos: { value: Math.cos(0.44) },
                uPR: { value: 1 }, uAmb: { value: 0.045 }, uOn: { value: 1 }, uStreak: { value: 0 } },
    vertexShader: /* glsl */`
      uniform vec3 uLP; uniform vec3 uLD; uniform float uCos; uniform float uPR; uniform float uAmb; uniform float uOn;
      attribute float aS; varying float vB; varying float vBok;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 d = wp.xyz - uLP; float dist = max(length(d), 0.001); float c = dot(d / dist, uLD);
        float cone = smoothstep(uCos - 0.05, uCos + 0.08, c) / (1.0 + dist * dist * 0.05) * uOn;
        vec4 mv = viewMatrix * wp; float z = max(0.25, -mv.z);
        vB = (uAmb + cone * 1.8) * exp(-z * 0.06);
        vBok = 1.0 - smoothstep(0.35, 1.4, z);                // right at the porthole: out of focus
        vB *= 1.0 - vBok * 0.7;
        gl_PointSize = aS * uPR * (7.0 / z) * (1.0 + vBok * 2.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uStreak; varying float vB; varying float vBok;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        p.y *= 1.0 - uStreak * 0.75 * (1.0 - vBok);           // moving fast: flakes stretch into short streaks
        float r = length(p);
        float a = mix(smoothstep(0.5, 0.05, r), smoothstep(0.5, 0.38, r) * 0.55 + smoothstep(0.5, 0.0, r) * 0.25, vBok);   // bokeh: a soft disc with a brighter rim
        gl_FragColor = vec4(vec3(0.82, 0.91, 0.93) * vB, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points, mat,
    /** Keep flakes around the camera; rise = extra drift upwards (descending fast). */
    update(dt, time, cam, rise = 0) {
      const p = pos;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] += dt * (0.06 + rise); p[i] += Math.sin(time * 0.3 + i) * dt * 0.02;
        for (let a = 0; a < 3; a++) {
          const c = a === 0 ? cam.x : a === 1 ? cam.y : cam.z, h = a === 1 ? 7 : 14, v = p[i + a] - c;
          if (v > h) p[i + a] -= 2 * h; else if (v < -h) p[i + a] += 2 * h;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** A volumetric beam: additive, soft at the rim, fading with distance, with slowly drifting particles of murk. */
const beamUniforms = { uT: { value: 0 } };
function beamMat(k = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: beamUniforms.uT, uK: { value: k } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main() { vUv = uv; vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uT; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main() {
        float edge = pow(abs(dot(vN, vV)), 1.7);
        float along = clamp(vUv.y, 0.0, 1.0);                       // 1 at the lamp, 0 at the far end
        float murk = 0.65 + 0.7 * n3(vL * 1.3 + vec3(0.0, uT * 0.25, uT * 0.1));
        float a = 0.09 * uK * pow(along, 1.4) * edge * murk;
        gl_FragColor = vec4(0.72, 0.9, 1.0, a);
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
function realNerpa() {
  const g = new THREE.Group();
  const n = createNerpa({ lights: true });
  n.position.y = -1.05;                               // the group's origin: the middle of the vehicle
  g.add(n);
  const lamps = n.userData.lamps;
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 1.75, 0.72), new THREE.Vector3(0, 41.7, 0.72)), 1, 0.02, 6), std({ color: 0x111111, metalness: 0.5, roughness: 0.5 }));
  g.add(cable);                                                      // the lift cable from her ring
  // a column of bubbles from the vents
  const N = 240, bp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) bp.set([(Math.random() - 0.5) * 2.2, 1 + Math.random() * 13, (Math.random() - 0.5) * 2.2], i * 3);
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
  const bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ map: soft, color: 0xcfefff, size: 0.14, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  bubbles.frustumCulled = false; g.add(bubbles);
  // the lamps' cones of light in the water (volumetric look: additive, soft rim, drifting noise)
  const cones = lamps.map((l) => {
    const L = 9, geo = new THREE.ConeGeometry(Math.tan(0.4) * L, L, 48, 1, true).translate(0, -L / 2, 0);
    const m = new THREE.Mesh(geo, beamMat(0.55));
    m.position.copy(l.at);
    const dir = new THREE.Vector3(l.at.x * 0.4, -2.5, l.at.z + 8).sub(l.at).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    m.visible = false; n.add(m);
    return m;
  });
  g.userData = { lamps, bp, bg, model: n, cones };
  return g;
}

const soft2 = (rgb) => canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

/** A deep-sea jellyfish: red bell that pulses, waving tentacles, a blue bioluminescent "wheel" when lit up. */
function jelly(r, col) {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(new THREE.SphereGeometry(r, 44, 22, 0, Math.PI * 2, 0, Math.PI * 0.56), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uPh: { value: Math.random() * 6 }, uR: { value: r }, uCol: { value: new THREE.Color(col).multiplyScalar(3.2) }, uGlow: { value: 0 }, uLP: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      uniform float uT; uniform float uPh; uniform float uR; varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vW;
      void main() {
        vec3 p = position; float h = 1.0 - clamp(p.y / uR, 0.0, 1.0); float pulse = sin(uT * 1.7 + uPh);
        p.xz *= 1.0 + 0.14 * pulse * h * h; p.y *= 1.0 - 0.1 * pulse; vL = p;
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w;
        vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uGlow; uniform vec3 uLP; uniform float uT; uniform float uR; varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vW;
      void main() {
        float fr = pow(1.0 - abs(dot(vN, vV)), 2.0); float dl = length(vW - uLP); float lit = 1.7 / (1.0 + dl * dl * 0.03);
        float rings = 0.65 + 0.35 * sin(vL.y / uR * 28.0); vec3 c = uCol * ((0.12 + fr * 1.15) * lit * rings + 0.18 + fr * 0.25);   // + a faint glow of its own
        float ang = atan(vL.z, vL.x);
        float wheel = pow(0.5 + 0.5 * sin(ang * 8.0 - uT * 9.0), 6.0) * smoothstep(0.0, 0.35, 1.0 - vL.y / uR);
        c += vec3(0.22, 0.62, 1.0) * uGlow * (wheel * 1.7 + fr * 0.45) * 3.0;
        float a = clamp((0.07 + fr * 0.6) * (lit * 0.9 + uGlow + 0.35), 0.0, 1.0);
        c = clamp(c, 0.0, 3.0);                                   // bright but bounded: no NaN/Inf into the bloom
        if (c.r != c.r || a != a) discard;
        gl_FragColor = vec4(c, a);
      }`,
  }));
  g.add(bell);
  const bright = new THREE.Color(col).multiplyScalar(2.6);         // linear light: deep reds need a boost
  const gm = new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const tr = new THREE.Mesh(new THREE.TorusGeometry(r * 0.3, r * 0.06, 6, 16, Math.PI * 0.7), gm);
    tr.rotation.x = Math.PI / 2; tr.rotation.z = (i * Math.PI) / 2; tr.position.y = r * 0.35; g.add(tr);
  }
  const tents = [];
  for (let i = 0; i < 18; i++) {
    const pos = new Float32Array(15 * 3), geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: bright, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    ln.frustumCulled = false; g.add(ln);
    tents.push({ pos, geo, a: (i / 18) * Math.PI * 2, L: r * (2.2 + Math.random() * 2.8) });
  }
  const arms = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * r * 0.15, -r * 0.8, Math.sin(a) * r * 0.15), new THREE.Vector3(Math.cos(a) * r * 0.3, -r * 1.8, Math.sin(a) * r * 0.3)]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, 16, r * 0.05, 6), new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(m); arms.push(m);
  }
  g.userData = { bell, tents, arms, r, ph: Math.random() * 6, y0: 2.4, glow: 0 };
  return g;
}

/** Everything that lives down there; update(dt, T, D, thrusting) every frame of the dive. */
function createLife(deep, lampPos) {
  const jellies = [];
  for (let i = 0; i < 7; i++) {
    const j = jelly(0.2 + hash(i, 25) * 0.32, i % 3 === 2 ? 0xa04ae0 : 0xff2a44);   // bright: deep reds are near black in linear light
    const a = hash(i, 21) * 6.28, d = 4 + hash(i, 22) * 15;
    j.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); j.userData.y0 = 1.0 + hash(i, 23) * 2.2;          // low enough to drift through the view
    deep.add(j); jellies.push(j);
  }
  const crawlers = [];
  {
    const star = std({ color: 0xd9cbb5, roughness: 0.8 });
    const cuc = new THREE.MeshStandardMaterial({ color: 0xe3a7af, roughness: 0.35, transparent: true, opacity: 0.9, emissive: 0x2a0a10 });
    const glassy = new THREE.MeshStandardMaterial({ color: 0xe9eef0, roughness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const dark = std({ color: 0x3a3f44, roughness: 0.6, metalness: 0.2 });
    for (let i = 0; i < 34; i++) {                        // brittle stars: five thin wavy arms
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.018, 10), star));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + hash(i, k) * 0.3, bend = (hash(k, i) - 0.5) * 1.6, pts = [];
        for (let q = 0; q <= 6; q++) { const f = q / 6, aa = a + bend * f * f; pts.push(new THREE.Vector3(Math.cos(aa) * (0.04 + f * 0.3), 0, Math.sin(aa) * (0.04 + f * 0.3))); }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.009, 4), star));
      }
      const a = hash(i, 31) * 6.28, d = 1.5 + hash(i, 32) * 22, x = Math.cos(a) * d, z = Math.sin(a) * d;
      g.position.set(x, bedH(x, z) + 0.012, z); g.rotation.y = hash(i, 33) * 6; deep.add(g);
    }
    for (let i = 0; i < 12; i++) {                        // sea cucumbers that slowly crawl
      const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), cuc);
      body.scale.set(0.07, 0.055, 0.19); body.castShadow = true; g.add(body);
      for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 5), cuc); l.position.set((k % 2 ? 1 : -1) * 0.05, -0.045, -0.12 + Math.floor(k / 2) * 0.12); l.rotation.x = Math.PI; g.add(l); }
      for (let k = 0; k < 4; k++) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.08, 5), cuc); pp.position.set((k % 2 ? 1 : -1) * 0.025, 0.07, -0.1 + Math.floor(k / 2) * 0.05); pp.rotation.x = -0.4; g.add(pp); }
      const a = hash(i, 41) * 6.28, d = 2 + hash(i, 42) * 20; g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      g.rotation.y = hash(i, 43) * 6; g.userData.sp = 0.02 + hash(i, 44) * 0.03; deep.add(g); crawlers.push(g);
    }
    for (let i = 0; i < 7; i++) {                         // glass sponges
      const pts = [];
      for (let q = 0; q <= 8; q++) { const f = q / 8; pts.push(new THREE.Vector2(0.06 + Math.sin(f * 2.6) * 0.12 + f * 0.05, f * 0.9)); }
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 18), glassy), new THREE.Mesh(new THREE.LatheGeometry(pts, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.22 })));
      const a = hash(i, 51) * 6.28, d = 3 + hash(i, 52) * 18, x = Math.cos(a) * d, z = Math.sin(a) * d;
      g.position.set(x, bedH(x, z) - 0.02, z); g.rotation.z = (hash(i, 53) - 0.5) * 0.3; deep.add(g);
    }
    for (let i = 0; i < 5; i++) {                         // tripod fish standing on three long fins
      const g = new THREE.Group(), body = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 8), dark);
      body.rotation.x = -Math.PI / 2; body.position.y = 0.32; g.add(body);
      for (const [dx, dz] of [[-0.03, 0.06], [0.03, 0.06], [0, -0.12]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.34, 4), dark);
        leg.position.set(dx, 0.16, dz); leg.rotation.x = dz > 0 ? -0.2 : 0.3; g.add(leg);
      }
      const a = hash(i, 61) * 6.28, d = 3 + hash(i, 62) * 18, x = Math.cos(a) * d, z = Math.sin(a) * d;
      g.position.set(x, bedH(x, z), z); g.rotation.y = hash(i, 63) * 6; deep.add(g);
    }
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
    const fm = std({ color: 0xc9d4da, metalness: 0.85, roughness: 0.3 }), fg = new THREE.ConeGeometry(0.045, 0.22, 6); fg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const f = new THREE.Mesh(fg, fm);
      f.userData = { o: new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.4), ph: Math.random() * 6 };
      deep.add(f); school.fish.push(f);
    }
  }
  const v = new THREE.Vector3();
  return {
    update(dt, T, D, thrusting) {
      for (const j of jellies) {
        const u = j.userData, un = u.bell.material.uniforms;
        un.uT.value = T; un.uLP.value.copy(lampPos());
        const near = Math.hypot(j.position.x - D.x, j.position.z - D.z) < 7;
        u.glow += ((near ? 1 : 0) - u.glow) * Math.min(1, dt * 1.4); un.uGlow.value = u.glow;
        const pulse = Math.sin(T * 1.7 + un.uPh.value);
        j.position.y = bedH(j.position.x, j.position.z) + u.y0 + Math.sin(T * 0.35 + u.ph) * 0.5;
        for (const tt of u.tents) {
          const rr = u.r * 0.95 * (1 + 0.1 * pulse);
          for (let s = 0; s < 15; s++) {
            const f = s / 14, sw = Math.sin(T * 1.3 + f * 5 + tt.a * 3) * 0.25 * f * u.r;
            tt.pos[s * 3] = Math.cos(tt.a) * rr * (1 - f * 0.3) + sw;
            tt.pos[s * 3 + 1] = -u.r * 0.19 - f * tt.L;
            tt.pos[s * 3 + 2] = Math.sin(tt.a) * rr * (1 - f * 0.3) + Math.cos(T * 1.1 + f * 4 + tt.a) * 0.2 * f * u.r;
          }
          tt.geo.attributes.position.needsUpdate = true;
        }
        u.arms.forEach((m, i) => { m.rotation.y = Math.sin(T * 0.5 + i) * 0.3; m.rotation.x = Math.sin(T * 0.7 + i) * 0.12; });
        j.rotation.y += dt * 0.05;
      }
      for (const c of crawlers) {
        c.position.x -= Math.sin(c.rotation.y) * c.userData.sp * dt; c.position.z -= Math.cos(c.rotation.y) * c.userData.sp * dt;
        c.rotation.y += Math.sin(T * 0.1 + c.userData.sp * 100) * dt * 0.05;
        c.position.y = bedH(c.position.x, c.position.z) + 0.05;
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

export function createDive(view) {
  const camera = view.camera;
  const deep = new THREE.Scene();
  deep.background = new THREE.Color(0x010a10);
  deep.fog = new THREE.FogExp2(0x02161f, 0.082);
  deep.add(new THREE.HemisphereLight(0x0d4257, 0x000000, 0.6));
  const top = new THREE.DirectionalLight(0x3f86a8, 0);
  top.position.set(0, 40, 0);
  deep.add(top);
  const snow = marineSnow();
  snow.mat.uniforms.uPR.value = view.renderer.getPixelRatio();
  deep.add(snow.points);

  // ---- the surface shot
  const surf = new THREE.Group();
  surf.visible = false;
  deep.add(surf);
  const nerpa = realNerpa();
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
        vec3 sky = mix(vec3(0.42, 0.62, 0.72), vec3(0.75, 0.88, 0.93), rip);
        vec3 mirror = vec3(0.01, 0.05, 0.075) + vec3(0.03, 0.08, 0.1) * rip;
        vec3 c = mix(mirror, sky, win);
        c += vec3(0.9, 0.97, 1.0) * pow(rip, 8.0) * win * 0.9;          // glitter of the swell in the window
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
    const hm = new THREE.Mesh(hg, std({ color: 0x1c2a30, roughness: 0.8, metalness: 0.2 }));
    hm.position.y = 14.2; hullUnder.add(hm);
    const keel = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.15, -14), new THREE.Vector2(0.15, -14), new THREE.Vector2(0.15, 26), new THREE.Vector2(-0.15, 26)]),
      { depth: 0.5, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 }).rotateX(Math.PI / 2), hm.material);
    keel.position.y = 14.2 - 3.6; hullUnder.add(keel);
    const prop = new THREE.Group(); prop.position.set(0, 14.2 - 2.4, -14.2); hullUnder.add(prop);
    const bronze = std({ color: 0x8a6a3a, metalness: 0.85, roughness: 0.35 });
    prop.add(new THREE.Mesh(new THREE.LatheGeometry([[0, -0.3], [0.22, -0.25], [0.25, 0.2], [0.1, 0.4], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 20).rotateX(Math.PI / 2), bronze));
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8), bronze);
      bl.scale.set(1, 0.18, 0.06); bl.position.set(Math.cos((i * Math.PI) / 2) * 0.6, Math.sin((i * Math.PI) / 2) * 0.6, 0);
      bl.rotation.z = (i * Math.PI) / 2; bl.rotation.x = 0.4; prop.add(bl);
    }
    const rudder = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(1.0, -2.0), new THREE.Vector2(0, -2.2)]),
      { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).rotateY(Math.PI / 2), hm.material);
    rudder.position.set(-0.06, 14.2 - 1.4, -15.0); hullUnder.add(rudder);
    hullUnder.userData.prop = prop;
    hullUnder.position.set(-6.5, 0, 19);         // her stern off to one side, over the spot where Nerpa went in
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

  // ---- the seabed of the South Caspian Basin, ~950 m (CLAUDE.md 22.1)
  const bedGroup = new THREE.Group();
  deep.add(bedGroup);
  {
    const g = new THREE.PlaneGeometry(90, 90, 230, 230).rotateX(-Math.PI / 2);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setY(i, bedH(pa.getX(i), pa.getZ(i)));
    g.computeVertexNormals();
    const sand = canvasTexture(512, 512, (c, w) => {
      c.fillStyle = "#80796a"; c.fillRect(0, 0, w, w);
      for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${hash(i, 1) < 0.5 ? "30,28,22" : "210,205,185"},${hash(i, 2) * 0.13})`; c.fillRect(hash(i, 3) * w, hash(i, 4) * w, 2, 2); }
      c.strokeStyle = "rgba(40,36,28,.18)"; c.lineWidth = 3;
      for (let y = 0; y < w; y += 18) { c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, y + Math.sin(x * 0.05 + y) * 4); c.stroke(); }
    });
    sand.wrapS = sand.wrapT = THREE.RepeatWrapping; sand.repeat.set(22, 22);
    // micro-relief of the sand: ripples as a normal map
    const N = 256, nc = document.createElement("canvas"); nc.width = nc.height = N;
    const ng = nc.getContext("2d"), img = ng.createImageData(N, N), H = new Float32Array(N * N);
    const waves = [];
    for (let i = 0; i < 16; i++) waves.push([1 + Math.floor(hash(i, 5) * 8), Math.floor(hash(i, 6) * 9) - 4, hash(i, 7) * 6.28, 0.3 + hash(i, 8)]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let h = 0;
      for (const [fx, fy, ph, a] of waves) h += (a * Math.sin((6.2832 * (fx * x + fy * y)) / N + ph)) / (fx + Math.abs(fy));
      H[y * N + x] = h + (hash(x, y) - 0.5) * 0.5;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = H[y * N + ((x + 1) % N)] - H[y * N + ((x + N - 1) % N)], hy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x];
      const nx = -hx * 1.4, ny = -hy * 1.4, l = Math.hypot(nx, ny, 1), k = (y * N + x) * 4;
      img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    ng.putImageData(img, 0, 0);
    const sandN = new THREE.CanvasTexture(nc); sandN.wrapS = sandN.wrapT = THREE.RepeatWrapping; sandN.repeat.set(30, 30);
    const bed = new THREE.Mesh(g, std({ map: sand, normalMap: sandN, normalScale: new THREE.Vector2(1.1, 1.1), color: 0xaaa38c, roughness: 1 }));
    bed.receiveShadow = true; bedGroup.add(bed);
    const rockM = std({ color: 0x3e433e, roughness: 1, flatShading: true });
    for (let i = 0; i < 70; i++) {
      const a = hash(i, 11) * 6.28, d = 3 + hash(i, 12) * 34, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + hash(i, 13) * 1.1, 1), rockM);
      m.position.set(x, bedH(x, z) - 0.15, z); m.scale.y = 0.4 + hash(i, 14) * 0.5; m.rotation.y = hash(i, 15) * 6;
      m.castShadow = m.receiveShadow = true; bedGroup.add(m);
    }
  }
  // the searchlight of Nerpa and its visible cone of light in the water
  const spot = new THREE.SpotLight(0xe2f4ff, 0, 30, 0.42, 0.5, 1.2);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005;
  deep.add(spot, spot.target);
  const CH = 11, coneGeo = new THREE.ConeGeometry(Math.tan(0.42) * CH, CH, 40, 1, true);
  coneGeo.translate(0, -CH / 2, 0); coneGeo.rotateX(-Math.PI / 2);
  const cone = new THREE.Mesh(coneGeo, beamMat(1.25));               // volumetric, with drifting murk (23.3-V)
  cone.visible = false;
  deep.add(cone);

  // the flight recorder: orange casing with a label and a blinking beacon
  const recorder = new THREE.Group();
  let box = recorder;                   // the dive's main find: the recorder, or a story find (act I: the flap)
  {
    const label = canvasTexture(512, 256, (c, w, h) => {
      c.fillStyle = "#e8692b"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#f3efe6"; c.fillRect(0, 34, w, 22); c.fillRect(0, h - 56, w, 22);
      c.fillStyle = "#1b1b1b"; c.font = "700 38px Onest, sans-serif"; c.textAlign = "center";
      c.fillText(t("box_label1"), w / 2, 122); c.font = "600 30px Onest, sans-serif"; c.fillText(t("box_label2"), w / 2, 168);
    });
    const side = std({ color: 0xe8692b, roughness: 0.45, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.46), [side, side, side, side, std({ map: label, roughness: 0.45 }), side]);
    body.castShadow = true; recorder.add(body);
    const ulb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 16), std({ color: 0x8e9296, metalness: 0.9, roughness: 0.3 }));
    ulb.rotation.z = Math.PI / 2; ulb.position.set(0.46, -0.08, 0); recorder.add(ulb);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(5) }));
    led.position.set(0.63, -0.08, 0); recorder.add(led);
    const ll = new THREE.PointLight(0xff3020, 0, 3.5, 2); ll.position.copy(led.position); recorder.add(ll);
    recorder.userData = { led, ll };
  }
  recorder.visible = false;
  deep.add(recorder);
  // act I's find (CLAUDE.md 17.4, story.json act1_dive_flap): a whole flap with the flight number, no scorch marks
  const flapFind = new THREE.Group();
  {
    const plate = canvasTexture(512, 256, (c, w, h) => {
      c.fillStyle = "#c4c9cd"; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { c.fillStyle = "rgba(90,100,108,.35)"; c.fillRect(0, i * h / 9, w, 2); }
      c.fillStyle = "#b8432f"; c.fillRect(0, h - 46, w, 22);
      c.fillStyle = "#1d2228"; c.font = "800 92px Onest, sans-serif"; c.textAlign = "center"; c.fillText("AQ-271", w / 2, 132);
    });
    const alu = std({ color: 0xc4c9cd, roughness: 0.38, metalness: 0.7 });
    const top = std({ map: plate, roughness: 0.4, metalness: 0.55 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.95), [alu, alu, top, alu, alu, alu]);
    slab.castShadow = true; flapFind.add(slab);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.9, 0, 0.2), new THREE.Vector3(-1.6, 0.25, 0.7), new THREE.Vector3(-2.5, 0, 0.3)]);
    flapFind.add(new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.03, 6), std({ color: 0x222222, roughness: 0.6 })));
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
  // wreckage (aircraft parts only, never people)
  const debris = [];
  {
    const alu = std({ color: 0xc4c9cd, roughness: 0.35, metalness: 0.75 }), fab = std({ color: 0x2d4a7a, roughness: 0.9 }), red = std({ color: 0xb8432f, roughness: 0.5 });
    const mk = (fn, key) => { const g = new THREE.Group(); fn(g); g.userData.key = key; g.visible = false; g.traverse((o) => { o.castShadow = true; }); deep.add(g); debris.push(g); };
    mk((g) => { g.add(new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 1.3), alu)); const st = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.085, 0.18), red); st.position.z = 0.4; g.add(st); }, "dv_wing");
    mk((g) => {
      g.add(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 8, 30, Math.PI * 0.8), alu));
      for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.6), alu); const a = (i / 4) * Math.PI * 0.8; rib.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, -0.8); g.add(rib); }
    }, "dv_fuselage");
    mk((g) => {
      for (let i = 0; i < 3; i++) {
        const seat = new THREE.Group(); seat.position.x = i * 0.55 - 0.55;
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.5), fab), b = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.7, 0.1), fab);
        b.position.set(0, 0.35, -0.22); seat.add(a, b); g.add(seat);
      }
    }, "dv_seats");
    mk((g) => {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.55), alu));
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6, 0, 0), new THREE.Vector3(-1.4, 0.3, 0.6), new THREE.Vector3(-2.4, 0, 0.2)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.03, 6), std({ color: 0x222222, roughness: 0.6 })));
    }, "dv_flap");
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
          debrisSeen: false, anyDebris: false, cine: null, task: sceneInfo.task || null, onEvent: sceneInfo.onEvent || (() => {}) };
    box = D.find ? flapFind : recorder;
    recorder.visible = flapFind.visible = false;
    for (const k in keys) keys[k] = false;
    const a = (Math.random() - 0.5) * 2.0, d = 11 + Math.random() * 5;
    const bx = -Math.sin(a) * d, bz = -Math.cos(a) * d;
    box.visible = D.hasBox;
    if (box.parent !== deep) deep.attach(box);
    box.position.set(bx, bedH(bx, bz) + 0.1, bz); box.rotation.set(0.18, Math.random() * 6, -0.22);
    // with the box: two pieces lie along the way to it; with debris only: all four, scattered
    const fr = [0.3, 0.48, 0.66, 0.84];
    debris.forEach((g, i) => {
      g.visible = D.hasDebris || (D.hasBox && i % 2 === 1);
      const side = (i % 2 ? 1 : -1) * (1.6 + Math.random() * 1.6);
      let px, pz;
      if (D.hasDebris) { const aa = Math.random() * Math.PI * 2, dd = 5 + Math.random() * 10; px = Math.cos(aa) * dd; pz = Math.sin(aa) * dd; }
      else { px = bx * fr[i] + Math.cos(a) * side; pz = bz * fr[i] - Math.sin(a) * side; }
      g.position.set(px, bedH(px, pz) - 0.02, pz);
      g.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 6, (Math.random() - 0.5) * 0.3);
    });
    cockpit.set({ o2: D.o2, max: D.max, fog: 0, low: false, depth: 0 });
  }

  function sonarPing() {
    if (mode !== "dive" || D.pingCD > 0) return;
    D.pingCD = 1.8; D.o2 -= 3; sfx.sonar();
    const items = [...(box.visible ? [{ o: box, s: 1 }] : []), ...debris.filter((g) => g.visible).map((o) => ({ o, s: 0.55 }))];
    cockpit.ping(items.map(({ o, s }) => {
      const dx = o.position.x - D.x, dz = o.position.z - D.z;
      let rel = Math.atan2(-dx, -dz) - D.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      return { rel, r: clamp(Math.hypot(dx, dz) / 28, 0, 1), s };
    }).filter((b) => b.r < 1), T);
  }

  async function descend(quick = false) {
    mode = "descent";
    D.y = bedH(0, 0) + (quick ? 2.6 : 22);
    top.intensity = 1.8; top.color.set(0x3f86a8);
    deep.fog.color.set(0x02161f); deep.fog.density = 0.082; deep.background.set(0x010a10);
    snow.mat.uniforms.uAmb.value = 0.045; snow.mat.uniforms.uOn.value = 1;
    spot.intensity = 0; cone.visible = false; D.desc = 1;
    cockpit.show(); document.body.classList.add("diving");
    sfx.underwater(true);
    if (!quick) cockpit.msg(t("dv_descent", { m: String(BED_M) }), 2600);
    if (quick) { spot.intensity = 60; cone.visible = true; top.intensity = 0; }      // the film showed the way down
    else setTimeout(() => { sfx.clack(); spot.intensity = 60; cone.visible = true; cockpit.msg(t("dv_light"), 1600); }, 1500);
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
    D.onEvent("start");
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
    if (box.visible && !D.found && dist < 8.5 && dot > Math.cos(0.46)) { D.found = true; D.cine = 0; sfx.chord(); }
    for (const g of debris) {
      if (!g.visible || D.seen.has(g)) continue;
      const ex = g.position.x - D.x, ez = g.position.z - D.z, ey = g.position.y - D.y, ed = Math.hypot(ex, ey, ez);
      if (ed < 8 && (ex * aimDir.x + ey * aimDir.y + ez * aimDir.z) / ed > Math.cos(0.5)) {
        D.seen.add(g); if (D.hasDebris) D.debrisSeen = true; sfx.seen(); cockpit.msg(t(g.userData.key), 3400);
        if (!D.anyDebris) { D.anyDebris = true; D.onEvent("first_debris"); }
      }
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
    // the beacon pinger: louder when close, from the box's side; without the box here only a faint far ping
    if ((D.pingerT -= dt) <= 0) {
      D.pingerT = 1;
      let vol = 0.06, pan = 0;
      if (box.visible) {
        vol = clamp(1.15 - dist / 26, 0.06, 1);
        let rel = Math.atan2(-dx, -dz) - (D.yaw - mx * 0.36); rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        pan = -Math.sin(rel);
      }
      sfx.pinger(vol, pan); cockpit.pinger(vol);
    }
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
      if (D.cine >= CINE_S) { D.cine = null; cockpit.msg(t(D.find ? "dv_seen_find" : "dv_seen_box"), 3800); }
    }
    dt *= cine ? 0.5 : 1;                                    // slow motion 0.5x while the beam finds the box
    T += dt;
    if (mode === "dive" && !cine) update(dt);
    else if (cine) { D.o2 -= dt; }
    if (mode === "dive" || mode === "descent" || mode === "ending") {
      placeCamera(); cockpit.drawScope(T);
      life.update(dt, T, D, mode === "dive" && (keys.f || keys.b));
    }
    rise = mode === "descent" ? D.desc * 3.5 : 0;
    snow.mat.uniforms.uStreak.value = clamp(Math.hypot(D.vx || 0, D.vz || 0) * 0.5 + (D.desc || 0), 0, 1);
    snow.update(dt, time, camera.position, rise);
    surfPlane.material.uniforms.uT.value = time;
    beamUniforms.uT.value = time;
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
    const lampsOn = (on) => { nerpa.userData.lamps.forEach((l) => { l.glow.material.opacity = on ? 0.9 : 0; l.sl.intensity = on ? 32 : 0; }); nerpa.userData.cones.forEach((c) => { c.visible = on; }); };
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
    const snowToLamp = () => {        // the flakes glow in Nerpa's lamp cone
      const l = nerpa.userData.lamps[0];
      nerpa.updateMatrixWorld(true);
      snow.mat.uniforms.uLP.value.copy(l.at).applyMatrix4(nerpa.userData.model.matrixWorld);
      snow.mat.uniforms.uLD.value.set(0, -0.3, 1).applyQuaternion(nerpa.userData.model.getWorldQuaternion(new THREE.Quaternion())).normalize();
    };

    // ---- shot 3: from under the surface looking up — Snell's window, Tulpar's hull, Nerpa sinks past, a seal
    const Y0 = 60;
    surf.position.set(0, Y0, 0); surf.visible = true;
    surfPlane.material.uniforms.uSurf.value = Y0 + 14; surfPlane.material.uniforms.uOrg.value.set(0, 0);
    deep.fog.color.set(0x0b3c50); deep.fog.density = 0.022; deep.background.set(0x0c4762);
    top.color.set(0x8fc4dc); top.intensity = 3.6;
    snow.mat.uniforms.uOn.value = 0; snow.mat.uniforms.uAmb.value = 0.32;
    sounds.under?.();
    await shot(durs[0], (k, dt, time) => {
      const e = ease(k);
      nerpa.position.set(0.3, Y0 + 12.8 - e * 10.5, 0.2); nerpa.rotation.set(0, 0.4 + k * 0.5, Math.sin(k * 7) * 0.04);
      camera.position.set(3.2, Y0 + 4.0 - k * 1.5, 5.0);
      camera.lookAt(nerpa.position.x - 0.6, nerpa.position.y + 1.2 + (1 - k) * 2.5, nerpa.position.z);
      surfPlane.material.uniforms.uCam.value.copy(camera.position);
      hullUnder.userData.prop.rotation.z += dt * 3;
      seal.position.set(-7 + k * 13, Y0 + 12.2 + Math.sin(k * 6) * 0.15, -3 + k * 2); seal.rotation.set(0, Math.PI / 2 - 0.3, Math.sin(time * 6) * 0.15);
      seal.userData.tail.rotation.y = Math.sin(time * 8) * 0.5;
      for (const m of shafts) m.material.opacity = 0.3 + 0.2 * Math.sin(time * 0.8 + m.userData.ph);
      caustic.intensity = 90 * (1 - k * 0.6); causticTex.offset.set(Math.sin(time * 0.31) * 0.2 + time * 0.03, Math.cos(time * 0.27) * 0.2);
      const bp = nerpa.userData.bp;
      for (let i = 1; i < bp.length; i += 3) { bp[i] += dt * 3.6; if (bp[i] > 14) bp[i] = 1; }
      nerpa.userData.bg.attributes.position.needsUpdate = true;
      model.update(dt, time, 0.4);
      setDepth(k * 12);
    });
    surf.visible = false; caustic.intensity = 0;

    // ---- shot 4: the twilight zone — blue to black, the depth races, comb jellies; the lamps click on at ~200 m
    const H = 400, deepCol = new THREE.Color(), c0 = new THREE.Color(0x0a3550), c1 = new THREE.Color(0x03141f), c2 = new THREE.Color(0x010508);
    let lit = false;
    combs.forEach((c, i) => { c.visible = true; c.userData.ph = i * 1.7; });
    await shot(durs[1], (k, dt, time) => {
      const depth = 12 + 918 * Math.pow(k, 1.7);
      setDepth(depth);
      deepCol.copy(c0).lerp(c1, Math.min(1, k * 1.6)).lerp(c2, Math.max(0, (k - 0.6) / 0.4));
      deep.background.copy(deepCol); deep.fog.color.copy(deepCol); deep.fog.density = 0.03 + k * 0.05;
      top.intensity = 1.4 * Math.max(0, 1 - k * 2.2);
      snow.mat.uniforms.uAmb.value = 0.24 * (1 - k) + 0.04;
      const ny = H - k * 30;
      nerpa.position.set(0, ny, 0); nerpa.rotation.set(0, 0.9 + k * 0.4, Math.sin(time * 0.9) * 0.03);
      const orbit = 0.9 + k * 0.5;
      camera.position.set(Math.sin(orbit) * 4.6, ny - 0.9, Math.cos(orbit) * 4.6);
      camera.lookAt(0, ny + 0.2, 0);
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
      model.update(dt, time, 0.3);
    });
    combs.forEach((c) => { c.visible = false; });

    // ---- shot 5: the seabed comes up in the light; the skids touch, a cloud of silt; then into the cockpit
    if (!lit) { lampsOn(true); snow.mat.uniforms.uOn.value = 1; }
    deep.fog.color.set(0x02161f); deep.fog.density = 0.07; deep.background.set(0x010a10); top.intensity = 0;
    snow.mat.uniforms.uAmb.value = 0.045;
    const bed = bedH(0, 0);
    let landed = false;
    await shot(durs[2], (k, dt, time) => {
      setDepth(930 + 20 * Math.min(1, k / 0.8));
      const kk = Math.min(1, k / 0.8), e = 1 - Math.pow(1 - kk, 2.2);
      const ny = bed + 1.05 + 9 * (1 - e);
      nerpa.position.set(0, ny + (landed ? Math.sin((k - 0.8) * 30) * 0.03 * (1 - k) : 0), 0); nerpa.rotation.set(0, 1.25, 0);
      camera.position.set(3.6, bed + 0.75, 4.4);
      camera.lookAt(0, ny - 0.2, 0);
      snowToLamp();
      if (!landed && kk >= 1) { landed = true; puffBurst(0, 0); sounds.thud?.(); }
      stepPuffs(dt);
      model.update(dt, time, landed ? 0.05 : 0.2);
    });
    if (!landed) { nerpa.position.set(0, bed + 1.05, 0); puffBurst(0, 0); }
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

  return { deep, cinematic, search, leave, debugFaceBox, stepPuffs };
}
