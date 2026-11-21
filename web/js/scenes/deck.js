// The deck of «Tulpar» at night (CLAUDE.md 23.2): a real place to walk on, not a backdrop.
//   - the stern: an open working deck with the A-frame (how vehicles are really launched), Nerpa on her
//     cradle under it, the winch drum with its cable, coils of rope, life rings, Murat's workshop container,
//     rails, a lifeboat on davits, deck floodlights;
//   - the bow: the bridge (wheelhouse) with glowing consoles and the VHF radio, the radar antenna turning
//     on the mast, the binoculars on a bracket outside, a searchlight;
//   - between them: the companionway down to the cabin;
//   - a living sea: waves with foam and a moon path, the ship rolls +-3 deg, spray at the bow, lights on the
//     horizon; to the south the crash site: patrol boats, a helicopter with a searchlight, a kerosene
//     slick and debris afloat in the light, 1.4 km off (seen through the binoculars: show, don't tell).
// Units are metres. Ship-local axes: x to starboard, y up, z to the bow; the bow points south (+z of the
// world), so "look south" means "look over the bow". No bare boxes or cylinders: rounded boxes, lathes and
// tubes with seams and wear (CLAUDE.md 23, "forbidden from now on").
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { canvasTexture, rng } from "../view.js";
import { steelPanel, watertightDoor } from "./materials.js";
import { createNerpa } from "./nerpa.js";
import { t } from "../i18n.js";

const std = (o) => new THREE.MeshStandardMaterial(o);
const rbox = (w, h, d, r = 0.04, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
function mesh(geo, mat, { cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
function at(o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; return o; }
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const tube = (pts, r, seg = 24, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, 8, closed);

// ------------------------------------------------------------------ the hull outline (ship-local)
const STERN = -15, BODY = 14, BOW = 30;
function outline(half, stern, body, bow, n = 14) {
  const pts = [[-half, stern], [half, stern], [half, body]];
  for (let i = 1; i <= n; i++) { const k = i / n; pts.push([half * Math.pow(1 - k * k, 0.7), body + (bow - body) * k]); }
  for (let i = n - 1; i >= 1; i--) { const k = i / n; pts.push([-half * Math.pow(1 - k * k, 0.7), body + (bow - body) * k]); }
  pts.push([-half, body]);
  return pts;
}
export const HULL = outline(5, STERN, BODY, BOW);
const WALK = outline(4.42, STERN + 0.6, BODY, BOW - 1.4);

// ------------------------------------------------------------------ procedural textures
function noiseCanvas(g, w, h, r, n, a, col = "0,0,0") {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${col},${r() * a})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
}
/** Painted steel deck: grey-green non-slip paint, welded plates, scuffs, rust at the seams. */
function deckMaterial() {
  const r = rng(11);
  const draw = (g, w, h, rough) => {
    g.fillStyle = rough ? "#c8c8c8" : "#56625a"; g.fillRect(0, 0, w, h);
    noiseCanvas(g, w, h, r, 26000, rough ? 0.25 : 0.12, rough ? "255,255,255" : "0,0,0");
    noiseCanvas(g, w, h, r, 9000, rough ? 0.2 : 0.07, rough ? "40,40,40" : "200,210,190");
    g.strokeStyle = rough ? "#888" : "rgba(25,28,24,.75)"; g.lineWidth = 3;
    for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += h / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    if (!rough) for (let i = 0; i < 26; i++) {                      // rust bleeding from the seams
      const x = Math.round(r() * 4) * w / 4, y = r() * h, len = 20 + r() * 70;
      const gr = g.createLinearGradient(x, y, x + 8, y + len);
      gr.addColorStop(0, "rgba(120,62,28,.55)"); gr.addColorStop(1, "rgba(120,62,28,0)");
      g.fillStyle = gr; g.fillRect(x - 3, y, 6 + r() * 6, len);
    }
    if (!rough) for (let i = 0; i < 40; i++) {                      // scuffs where boots and cables go
      g.strokeStyle = `rgba(160,170,160,${0.08 + r() * 0.12})`; g.lineWidth = 1 + r() * 3;
      g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 40); g.stroke();
    }
  };
  const map = canvasTexture(512, 512, (g, w, h) => draw(g, w, h, false));
  const rough = canvasTexture(512, 512, (g, w, h) => draw(g, w, h, true), false);
  for (const tx of [map, rough]) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(2.5, 9); }
  return std({ map, roughnessMap: rough, bumpMap: rough, bumpScale: 0.6, roughness: 1, metalness: 0.15 });
}
/** Ship paint with panel seams, streaks and worn edges. */
function paint(hex, { seams = 1.6, streaks = 0.5, repeat = [1, 1], seed = 3 } = {}) {
  const r = rng(seed);
  const c = new THREE.Color(hex);
  const base = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
  const map = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    noiseCanvas(g, w, h, r, 5000, 0.07);
    noiseCanvas(g, w, h, r, 2500, 0.06, "255,255,255");
    g.strokeStyle = "rgba(0,0,0,.28)"; g.lineWidth = seams;
    for (let x = 0; x <= w; x += w / 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (let i = 0; i < 18 * streaks; i++) {
      const x = r() * w, y = r() * h * 0.6, len = 30 + r() * 120;
      const gr = g.createLinearGradient(x, y, x, y + len);
      gr.addColorStop(0, "rgba(90,50,25,.35)"); gr.addColorStop(1, "rgba(90,50,25,0)");
      g.fillStyle = gr; g.fillRect(x, y, 1.5 + r() * 2.5, len);
    }
  });
  const rough = canvasTexture(256, 256, (g, w, h) => { g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, w, h); noiseCanvas(g, w, h, r, 6000, 0.3, "255,255,255"); noiseCanvas(g, w, h, r, 3000, 0.3); }, false);
  for (const tx of [map, rough]) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(...repeat); }
  return std({ map, roughnessMap: rough, roughness: 0.85, metalness: 0.25 });
}
/** A soft round sprite (halos, lights far away). */
const SOFT = canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
function glowSprite(hex, size, mult = 3) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: new THREE.Color(hex).multiplyScalar(mult), transparent: true,
                                                         depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(size);
  return s;
}
const emissive = (hex, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });

// ------------------------------------------------------------------ the sea
const WAVES = [  // direction (x, z), wavelength m, amplitude m, speed
  [0.8, 0.6, 38, 0.32, 1.0], [-0.3, 1.0, 21, 0.18, 1.0], [0.95, -0.3, 11, 0.09, 1.0], [0.2, 0.98, 6.2, 0.05, 1.0],
];
function createSea(moonDir) {
  // a polar grid: fine near the ship, coarse at the horizon (no swimming detail where it matters)
  const RINGS = 90, SEGS = 160, R0 = 0.8, RMAX = 5000;
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  const grow = Math.pow(RMAX / R0, 1 / (RINGS - 1));
  for (let i = 0; i < RINGS; i++) {
    const rr = R0 * Math.pow(grow, i);
    for (let j = 0; j < SEGS; j++) { const a = (j / SEGS) * Math.PI * 2; pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr); }
  }
  for (let j = 0; j < SEGS; j++) idx.push(0, 1 + ((j + 1) % SEGS), 1 + j);
  for (let i = 0; i < RINGS - 1; i++) for (let j = 0; j < SEGS; j++) {
    const a = 1 + i * SEGS + j, b = 1 + i * SEGS + ((j + 1) % SEGS), c = a + SEGS, d = b + SEGS;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const waveGLSL = WAVES.map(([dx, dz, L, A, s], i) => {
    const l = Math.hypot(dx, dz), k = (2 * Math.PI) / L, w = Math.sqrt(9.8 * k) * s;
    return `{ vec2 d = vec2(${(dx / l).toFixed(4)}, ${(dz / l).toFixed(4)}); float ph = dot(d, p) * ${k.toFixed(5)} - t * ${w.toFixed(5)};
      h += ${A.toFixed(4)} * sin(ph); g += ${(A * k).toFixed(5)} * cos(ph) * d; }`;
  }).join("\n");
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMoon: { value: moonDir.clone() }, uFogCol: { value: new THREE.Color(0x0b1626) }, uPools: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
                uHull: { value: new THREE.Vector4(0, 0, 5.2, 0) }, uHullZ: { value: new THREE.Vector2(STERN, BOW) } },
    vertexShader: /* glsl */`
      uniform float uTime; varying vec3 vW; varying float vH;
      void waves(vec2 p, float t, out float h, out vec2 g) { h = 0.0; g = vec2(0.0); ${waveGLSL} }
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float h; vec2 g; waves(w.xz, uTime, h, g);
        float fade = 1.0 - smoothstep(600.0, 2500.0, length(w.xz - cameraPosition.xz));
        w.y += h * fade; vW = w.xyz; vH = h;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uMoon; uniform vec3 uFogCol; uniform vec4 uHull; uniform vec2 uHullZ; uniform vec4 uPools[4];
      varying vec3 vW; varying float vH;
      void waves(vec2 p, float t, out float h, out vec2 g) { h = 0.0; g = vec2(0.0); ${waveGLSL} }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float dist = length(vW.xz - cameraPosition.xz);
        float h; vec2 g; waves(vW.xz, uTime, h, g);
        // small ripples, fading with distance (no shimmer at the horizon)
        float rf = 1.0 - smoothstep(30.0, 400.0, dist);
        vec2 q = vW.xz * 1.7 + vec2(uTime * 0.6, uTime * 0.4);
        g += rf * 0.16 * vec2(vn(q) - vn(q + vec2(0.13, 0.0)), vn(q) - vn(q + vec2(0.0, 0.13))) / 0.13 * 0.08;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(vec3(0.028, 0.05, 0.09), vec3(0.09, 0.13, 0.2), pow(1.0 - max(r.y, 0.0), 3.0));
        vec3 deep = vec3(0.006, 0.02, 0.035) + vec3(0.0, 0.02, 0.025) * clamp(vH + 0.3, 0.0, 1.0);
        vec3 col = mix(deep, sky, fres);
        float spec = pow(max(dot(r, uMoon), 0.0), 220.0);
        float glint = pow(max(dot(r, uMoon), 0.0), 28.0);
        col += vec3(0.85, 0.9, 1.0) * (spec * 6.0 + glint * 0.18) ;
        // foam: crests and the water pushed along the hull
        float crest = smoothstep(0.32, 0.55, h + (vn(vW.xz * 0.35 + uTime * 0.05) - 0.5) * 0.3);
        vec2 hp = vW.xz - uHull.xy;
        float hx = abs(hp.x) - uHull.z * (hp.y > 14.0 ? pow(max(0.0, 1.0 - pow((hp.y - 14.0) / 16.0, 2.0)), 0.7) : 1.0);
        float inZ = step(uHullZ.x - 2.0, hp.y) * step(hp.y, uHullZ.y + 1.5);
        float wake = inZ * (1.0 - smoothstep(0.0, 2.6, max(hx, 0.0))) * smoothstep(-0.2, 0.3, hx + 0.6);
        float stern = smoothstep(uHullZ.x, uHullZ.x - 40.0, hp.y) * (1.0 - smoothstep(4.0, 9.0 + (uHullZ.x - hp.y) * 0.15, abs(hp.x)));
        float foamN = vn(vW.xz * 2.3 + uTime * 0.3) * vn(vW.xz * 5.1 - uTime * 0.2);
        float foam = clamp(crest * 0.35 + wake * 0.9 + stern * 0.55, 0.0, 1.0) * smoothstep(0.12, 0.5, foamN);
        col = mix(col, vec3(0.42, 0.47, 0.5), foam * (1.0 - smoothstep(60.0, 300.0, dist)));
        // searchlight pools: the lit swell and the glitter of the light on it
        for (int i = 0; i < 4; i++) {
          vec2 d = vW.xz - uPools[i].xy; float f = uPools[i].w * exp(-dot(d, d) / (uPools[i].z * uPools[i].z));
          float gl = pow(max(dot(n, normalize(vec3(0.0, 1.0, 0.0) + v)), 0.0), 90.0);
          col += f * (vec3(0.16, 0.18, 0.2) * (0.6 + 0.4 * crest) + vec3(1.0, 1.0, 0.97) * gl * 3.0);
        }
        // into the night haze at the horizon
        col = mix(col, uFogCol, smoothstep(300.0, 4500.0, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sea = new THREE.Mesh(geo, mat);
  sea.frustumCulled = false;
  return sea;
}
/** The same waves in JS: the height of the sea at a point (for things that float). */
export function seaHeight(x, z, t) {
  let h = 0;
  for (const [dx, dz, L, A, s] of WAVES) {
    const l = Math.hypot(dx, dz), k = (2 * Math.PI) / L, w = Math.sqrt(9.8 * k) * s;
    h += A * Math.sin(((dx / l) * x + (dz / l) * z) * k - t * w);
  }
  return h;
}

function createSky(moonDir) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMoon: { value: moonDir } },
    vertexShader: "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      uniform vec3 uMoon; varying vec3 vD;
      void main() {
        float up = max(vD.y, 0.0);
        vec3 col = mix(vec3(0.045, 0.075, 0.12), vec3(0.008, 0.016, 0.04), pow(up, 0.45));
        col += vec3(0.05, 0.065, 0.09) * pow(max(dot(vD, uMoon), 0.0), 18.0);
        col = mix(col, vec3(0.04, 0.07, 0.115), 1.0 - smoothstep(-0.02, 0.06, vD.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  dome.frustumCulled = false;
  g.add(dome);
  const r = rng(42), N = 2200, sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = r(), v = 0.03 + Math.pow(r(), 0.8) * 0.97, a = u * Math.PI * 2, y = v, rr = Math.sqrt(1 - y * y);
    sp.set([Math.cos(a) * rr * 5500, y * 5500, Math.sin(a) * rr * 5500], i * 3);
    const b = 0.35 + Math.pow(r(), 3) * 2.2, tint = r();
    sc.set([b * (0.85 + tint * 0.15), b * 0.92, b * (1.05 - tint * 0.1)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, map: SOFT, transparent: true,
                                                                 depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  stars.frustumCulled = false;
  g.add(stars);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshBasicMaterial({ fog: false,
    map: canvasTexture(256, 256, (c, w, h) => {
      const rr = rng(7);
      c.fillStyle = "#f2efe4"; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.fill();
      for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(150,150,140,${0.12 + rr() * 0.2})`; c.beginPath(); c.arc(40 + rr() * 176, 40 + rr() * 176, 6 + rr() * 26, 0, 7); c.fill(); }
    }), color: new THREE.Color(1, 1, 1).multiplyScalar(2.2), transparent: true }));
  moon.position.copy(moonDir).multiplyScalar(5200);
  moon.lookAt(0, 0, 0);
  g.add(moon);
  const halo = glowSprite(0xaec4ff, 900, 0.5);
  halo.position.copy(moon.position);
  g.add(halo);
  return g;
}

// ------------------------------------------------------------------ small props
function lifeRing(label) {
  const tex = canvasTexture(1024, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#f4f1ea" : "#e8601c"; g.fillRect((i * w) / 8, 0, w / 8 + 1, h); }
    g.fillStyle = "#1c1c1c"; g.font = "700 30px Onest, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const x of [0.25, 0.75]) g.fillText(label, w * x, h / 2 + 1);
  });
  const ring = mesh(new THREE.TorusGeometry(0.32, 0.075, 16, 48), std({ map: tex, roughness: 0.6 }));
  const rope = mesh(new THREE.TorusGeometry(0.32, 0.012, 6, 64), std({ color: 0xe9e2cf, roughness: 0.9 }));
  rope.scale.set(1.18, 1.18, 1);
  const g = new THREE.Group(); g.add(ring, rope);
  return g;
}
function ropeCoil(r0 = 0.25, turns = 7, thick = 0.03, color = 0x8a7a55) {
  const pts = [];
  for (let i = 0; i <= turns * 40; i++) {
    const a = (i / 40) * Math.PI * 2, rr = r0 + (i / (turns * 40)) * turns * thick * 2.1;
    pts.push(new THREE.Vector3(Math.cos(a) * rr, thick + Math.sin(i * 0.9) * 0.004 + (i % 80 < 40 ? 0 : 0.002), Math.sin(a) * rr));
  }
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 60, thick, 6), std({ color, roughness: 0.95 }));
}
function bollard(m) {
  const g = new THREE.Group();
  for (const dx of [-0.22, 0.22]) g.add(at(mesh(lathe([[0, 0], [0.13, 0], [0.13, 0.02], [0.1, 0.05], [0.1, 0.32], [0.14, 0.36], [0.14, 0.39], [0, 0.4]]), m), dx, 0, 0));
  g.add(mesh(rbox(0.7, 0.05, 0.3, 0.02), m));
  return g;
}
/** Marine binoculars 7x50, about 18 cm: two barrels with wide objective bells, the hinge bridge with the
 *  focus wheel, rubber eyecups, the strap. Lies with the eyepieces towards -z. */
function binocularsModel() {
  const g = new THREE.Group();
  const armour = std({ color: 0x1d2124, roughness: 0.82 });                     // rubber armour
  const metal = std({ color: 0x3a3f43, metalness: 0.75, roughness: 0.32 });
  const lensM = new THREE.MeshPhysicalMaterial({ color: 0x10303f, metalness: 0.2, roughness: 0.04, clearcoat: 1, emissive: 0x06222c, emissiveIntensity: 0.8 });
  const eyeM = std({ color: 0x0c0d0e, roughness: 0.9 });
  for (const sx of [-0.042, 0.042]) {
    // barrel along z: eyepiece (z = -0.09) -> prism housing -> objective bell (z = +0.09)
    const barrel = mesh(lathe([[0, -0.092], [0.014, -0.092], [0.016, -0.088], [0.017, -0.06], [0.024, -0.05], [0.026, -0.02],
                               [0.025, 0.03], [0.029, 0.05], [0.032, 0.085], [0.031, 0.092], [0, 0.092]], 28), armour);
    barrel.rotation.x = Math.PI / 2; barrel.position.x = sx; g.add(barrel);
    const ring = mesh(new THREE.TorusGeometry(0.03, 0.0025, 8, 28), metal); ring.position.set(sx, 0, 0.091); g.add(ring);
    const lens = mesh(new THREE.CircleGeometry(0.028, 24), lensM); lens.position.set(sx, 0, 0.0925); g.add(lens);
    const cup = mesh(lathe([[0.012, 0], [0.019, 0], [0.021, -0.006], [0.021, -0.022], [0.017, -0.026], [0.012, -0.024]], 20), eyeM);
    cup.rotation.x = Math.PI / 2; cup.position.set(sx, 0, -0.092); g.add(cup);
    // the prism bulge (the classic Porro shoulder)
    const prism = mesh(rbox(0.034, 0.03, 0.055, 0.011), armour); prism.position.set(sx * 1.32, 0.006, -0.03); g.add(prism);
    for (const z of [-0.07, 0.06]) { const lug = mesh(lathe([[0.004, 0], [0.004, 0.008], [0, 0.008]], 8), metal); lug.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2; lug.position.set(sx * 1.75, 0.005, z); g.add(lug); }
  }
  // the hinge bridge between the barrels and the focus wheel on it
  for (const z of [-0.045, 0.035]) { const br = mesh(rbox(0.06, 0.016, 0.022, 0.006), metal); br.position.set(0, 0.012, z); g.add(br); }
  const hinge = mesh(lathe([[0.007, -0.06], [0.007, 0.05], [0, 0.05]], 14), metal); hinge.rotation.x = Math.PI / 2; hinge.position.set(0, 0.014, 0); g.add(hinge);
  const knurl = canvasTexture(64, 16, (c, w, h) => { for (let x = 0; x < w; x += 4) { c.fillStyle = x % 8 ? "#555" : "#222"; c.fillRect(x, 0, 4, h); } });
  const wheel = mesh(lathe([[0.006, -0.008], [0.011, -0.008], [0.012, -0.006], [0.012, 0.006], [0.011, 0.008], [0.006, 0.008]], 24), std({ map: knurl, metalness: 0.6, roughness: 0.4 }));
  wheel.rotation.z = Math.PI / 2; wheel.position.set(0, 0.03, -0.055); g.add(wheel);
  // the neck strap lying in a loose loop on the shelf
  g.add(mesh(tube([[-0.074, 0.005, -0.07], [-0.11, -0.012, -0.11], [-0.07, -0.018, -0.17], [0.03, -0.018, -0.19], [0.1, -0.016, -0.13], [0.074, 0.005, -0.07]], 0.0035, 48), std({ color: 0x2c2722, roughness: 0.9 })));
  g.add(mesh(tube([[-0.074, 0.005, 0.06], [-0.1, -0.012, 0.1], [-0.05, -0.018, 0.16]], 0.0035, 16), std({ color: 0x2c2722, roughness: 0.9 })));
  return g;
}

// ------------------------------------------------------------------ the scene
export function createDeck(view, { lifeLabel = "" } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1626, 0.00042);
  {   // soft reflections for the acrylic sphere, the glossy paint, steel and glass (a dim room, so the night stays night)
    const pm = new THREE.PMREMGenerator(view.renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.22;
  }
  const moonDir = new THREE.Vector3(-0.38, 0.33, 0.86).normalize();     // south-south-west, low: the moon path runs to the crash site
  scene.add(createSky(moonDir));
  const sea = createSea(moonDir);
  scene.add(sea);
  scene.add(new THREE.HemisphereLight(0x3c4656, 0x0c0e10, 0.42));     // cold night fill, no violet cast
  const moonLight = new THREE.DirectionalLight(0x9db4ff, 0.65);
  moonLight.position.copy(moonDir).multiplyScalar(100);
  scene.add(moonLight);

  // ---------------- the ship
  const ship = new THREE.Group();
  scene.add(ship);
  const DECK_Y = 1.6;                 // freeboard above the mean sea level
  const hullPaint = paint(0xd2541c, { seams: 1.2, streaks: 1, repeat: [6, 1], seed: 5 });
  const whitePaint = paint(0xe9e6de, { seams: 1.5, streaks: 0.7, repeat: [2, 1], seed: 6 });
  const greyPaint = paint(0x8c9298, { seams: 1.4, streaks: 0.6, seed: 8 });
  const steel = std({ color: 0xa8b0b6, metalness: 0.8, roughness: 0.38 });
  const darkSteel = std({ color: 0x2b3034, metalness: 0.6, roughness: 0.5 });
  const yellowPaint = paint(0xe2b23a, { seams: 1, streaks: 0.6, seed: 9 });
  const rubber = std({ color: 0x151515, roughness: 0.95 });
  const houseSteel = steelPanel({ color: "#c8cbca", seed: 19 });     // light-grey painted steel, seams and rivets
  const steelFor = (w, h) => houseSteel.userData.forSize(w, h);

  const shape = new THREE.Shape(HULL.map(([x, z]) => new THREE.Vector2(x, z)));
  const deckGeo = new THREE.ShapeGeometry(shape, 12).rotateX(Math.PI / 2);
  const deckUV = deckGeo.attributes.uv; for (let i = 0; i < deckUV.count; i++) deckUV.setXY(i, (deckGeo.attributes.position.getX(i) + 5) / 10, (deckGeo.attributes.position.getZ(i) - STERN) / 45);
  const deckMat = deckMaterial(); deckMat.side = THREE.DoubleSide;
  const deck = mesh(deckGeo, deckMat, { cast: false });
  deck.position.y = 0.001;
  ship.add(deck);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 4.2, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3, curveSegments: 14 });
  hullGeo.rotateX(Math.PI / 2);
  const hull = mesh(hullGeo, hullPaint, { cast: false });
  hull.position.y = -0.14;           // its bevelled top cap stays under the deck plates
  ship.add(hull);
  // bulwark cap and the rails: posts every 1.5 m, three tubes, the stern left open between the A-frame legs
  const railPts = HULL.filter(([, z]) => z > STERN + 0.01).map(([x, z]) => [x * 0.985, z]);
  const sides = [railPts.filter(([x]) => x >= 0).sort((a, b) => a[1] - b[1]), railPts.filter(([x]) => x <= 0).sort((a, b) => a[1] - b[1])];
  for (const side of sides) {
    const s = side[0][0] > 0 ? 1 : -1;
    const path = [[s * 4.92, STERN + 0.15], ...side.filter(([x]) => Math.abs(x) > 0.05), [0, BOW - 0.3]];
    for (const y of [0.18, 0.62, 1.05]) ship.add(mesh(tube(path.map(([x, z]) => [x, y, z]), y > 1 ? 0.03 : 0.022, 80), steel, { cast: false }));
    ship.add(mesh(tube(path.map(([x, z]) => [x, 0.09, z]), 0.07, 80), hullPaint, { cast: false }));
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, z0] = path[i], [x1, z1] = path[i + 1], n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.5));
      for (let k = 0; k < n; k++) { const f = k / n; ship.add(at(mesh(lathe([[0.03, 0], [0.025, 0.05], [0.022, 1.05], [0.03, 1.08], [0, 1.09]], 10), steel, { cast: false }), x0 + (x1 - x0) * f, 0, z0 + (z1 - z0) * f)); }
    }
  }
  // stern: a chain between the A-frame legs and the stern roller
  ship.add(mesh(tube([[-3.2, 0.95, STERN + 0.3], [0, 0.72, STERN + 0.3], [3.2, 0.95, STERN + 0.3]], 0.025, 24), std({ color: 0xcfa64a, metalness: 0.7, roughness: 0.4 })));
  const roller = mesh(lathe([[0.18, -2.2], [0.22, -2.1], [0.22, 2.1], [0.18, 2.2]], 24), rubber); roller.rotation.z = Math.PI / 2; roller.position.set(0, 0.18, STERN + 0.12); ship.add(roller);

  // ---------------- the wheelhouse (the bridge), the bow end of the ship
  const HX = 3.2, HZ0 = 3, HZ1 = 12, HH = 2.9;
  const house = new THREE.Group(); ship.add(house);
  const wallPiece = (w, h, d, x, y, z) => { const m = mesh(rbox(w, h, d, 0.05), steelFor(Math.max(w, d), h)); m.position.set(x, y, z); house.add(m); return m; };
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb8c8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, emissive: 0x3a2a10, emissiveIntensity: 0.25 });
  const pane = (w, h, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat); p.position.set(x, y, z); p.rotation.y = ry; house.add(p); };
  // a wall along x at z (windows: [[x0, x1], ...]) or along z at x
  function wallX(z, x0, x1, wins, door = null) {
    const sill = 1.05, lint = 2.15, T = 0.16;
    wallPiece(x1 - x0, sill, T, (x0 + x1) / 2, sill / 2, z);
    wallPiece(x1 - x0, HH - lint, T, (x0 + x1) / 2, (HH + lint) / 2, z);
    let cur = x0;
    const holes = [...wins.map((w) => [...w, "w"]), ...(door ? [[...door, "d"]] : [])].sort((a, b) => a[0] - b[0]);
    for (const [a, b, kind] of holes) {
      if (a > cur) wallPiece(a - cur, lint - sill, T, (a + cur) / 2, (sill + lint) / 2, z);
      if (kind === "w") pane(b - a, lint - sill, (a + b) / 2, (sill + lint) / 2, z, 0);
      cur = b;
    }
    if (x1 > cur) wallPiece(x1 - cur, lint - sill, T, (x1 + cur) / 2, (sill + lint) / 2, z);
    if (door) { // the door hole runs down to the deck: remove the sill under it
      house.children.filter((c) => c.position.z === z && c.position.y === sill / 2).forEach((c) => house.remove(c));
      wallPiece(door[0] - x0, sill, T, (x0 + door[0]) / 2, sill / 2, z);
      wallPiece(x1 - door[1], sill, T, (x1 + door[1]) / 2, sill / 2, z);
      const coaming = mesh(rbox(door[1] - door[0] + 0.1, 0.32, 0.24, 0.06), greyPaint); coaming.position.set((door[0] + door[1]) / 2, 0.16, z); house.add(coaming);   // a high door sill: one steps over it
    }
  }
  function wallZ(x, z0, z1, wins) {
    const sill = 1.05, lint = 2.15, T = 0.16;
    const piece = (len, h, zc, y) => { const m = mesh(rbox(T, h, len, 0.05), steelFor(len, h)); m.position.set(x, y, zc); house.add(m); };
    piece(z1 - z0, sill, (z0 + z1) / 2, sill / 2);
    piece(z1 - z0, HH - lint, (z0 + z1) / 2, (HH + lint) / 2);
    let cur = z0;
    for (const [a, b] of wins) {
      if (a > cur) piece(a - cur, lint - sill, (a + cur) / 2, (sill + lint) / 2);
      pane(b - a, lint - sill, x, (sill + lint) / 2, (a + b) / 2, Math.PI / 2);
      cur = b;
    }
    if (z1 > cur) piece(z1 - cur, lint - sill, (z1 + cur) / 2, (sill + lint) / 2);
  }
  wallX(HZ1, -HX, HX, [[-2.9, -1.75], [-1.6, -0.45], [-0.3, 0.85], [1.0, 2.15], [2.3, 2.9]]);   // the front: windows over the bow
  wallX(HZ0, -HX, HX, [[-2.6, -1.6], [1.6, 2.6]], [-0.6, 0.6]);                               // the back: the door
  wallZ(-HX, HZ0, HZ1, [[4.2, 5.8], [6.4, 8.0], [8.6, 10.6]]);
  wallZ(HX, HZ0, HZ1, [[4.2, 5.8], [6.4, 8.0], [8.6, 10.6]]);
  { const ent = watertightDoor({ w: 1.12, h: 1.95, open: 1.75, frame: false }); ent.position.set(0, 1.04, HZ0 - 0.12); ent.rotation.y = Math.PI; house.add(ent); }
  const roof = mesh(rbox(2 * HX + 0.6, 0.22, HZ1 - HZ0 + 0.6, 0.08), steelFor(6.8, 9.6)); roof.position.set(0, HH + 0.1, (HZ0 + HZ1) / 2); house.add(roof);
  const ceiling = mesh(new THREE.PlaneGeometry(2 * HX - 0.2, HZ1 - HZ0 - 0.2).rotateX(Math.PI / 2), steelFor(6.2, 8.8), { cast: false }); ceiling.position.set(0, HH - 0.01, (HZ0 + HZ1) / 2); house.add(ceiling);
  const visor = mesh(rbox(2 * HX + 0.8, 0.08, 0.7, 0.03), whitePaint); visor.position.set(0, HH - 0.12, HZ1 + 0.38); visor.rotation.x = -0.15; house.add(visor);
  // inside: the console under the front windows (radar, chart plotter, engine gauges), the helm, the chair
  const consoleG = new THREE.Group(); house.add(consoleG);
  const cbody = mesh(rbox(6.0, 1.0, 0.75, 0.06), darkSteel); cbody.position.set(0, 0.5, HZ1 - 0.55); consoleG.add(cbody);
  const ctop = mesh(rbox(6.0, 0.06, 0.6, 0.02), std({ color: 0x1a1c1e, roughness: 0.6 })); ctop.position.set(0, 1.04, HZ1 - 0.62); ctop.rotation.x = 0.35; consoleG.add(ctop);
  const screenTex = (kind) => canvasTexture(256, 192, (g, w, h) => {
    g.fillStyle = "#020806"; g.fillRect(0, 0, w, h);
    if (kind === "radar") {
      g.strokeStyle = "#1f8f4a"; g.lineWidth = 1.5;
      for (const r of [25, 50, 75, 90]) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); }
      g.fillStyle = "#4dff8c"; const rr = rng(4); for (let i = 0; i < 40; i++) g.fillRect(w / 2 + (rr() - 0.5) * 170, h / 2 + 30 + rr() * 60, 2, 2);
      g.fillStyle = "#c8ff6a"; g.fillRect(w / 2 - 3, h / 2 + 70, 6, 4); g.fillRect(w / 2 + 40, h / 2 + 75, 5, 3);
    } else if (kind === "chart") {
      g.fillStyle = "#0b2a44"; g.fillRect(0, 0, w, h); g.fillStyle = "#3b6a52"; g.beginPath(); g.moveTo(0, 0); g.lineTo(90, 0); g.lineTo(60, 80); g.lineTo(0, 120); g.fill();
      g.strokeStyle = "#e85a3a"; g.setLineDash([5, 4]); g.lineWidth = 2; g.beginPath(); g.moveTo(140, 40); g.lineTo(150, 170); g.stroke();
      g.setLineDash([]); g.fillStyle = "#ffd36a"; g.beginPath(); g.arc(140, 110, 5, 0, 7); g.fill();
    } else {
      g.fillStyle = "#1a1408"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) { const cx = 35 + i * 62; g.strokeStyle = "#ffb347"; g.lineWidth = 2; g.beginPath(); g.arc(cx, 90, 24, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(cx, 90); g.lineTo(cx + Math.cos(-2 + i * 0.4) * 20, 90 + Math.sin(-2 + i * 0.4) * 20); g.stroke(); }
    }
  });
  for (const [x, kind] of [[-1.5, "chart"], [0, "radar"], [1.5, "gauges"]]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), new THREE.MeshBasicMaterial({ map: screenTex(kind), color: new THREE.Color(1, 1, 1).multiplyScalar(1.6) }));
    s.position.set(x, 1.4, HZ1 - 0.42); s.rotation.y = Math.PI; s.rotation.x = 0.25; consoleG.add(s);
    const bez = mesh(rbox(1.0, 0.72, 0.08, 0.03), darkSteel); bez.position.set(x, 1.4, HZ1 - 0.38); bez.rotation.x = -0.25; consoleG.add(bez);
  }
  const helm = new THREE.Group();
  helm.add(mesh(new THREE.TorusGeometry(0.26, 0.022, 10, 36), std({ color: 0x5a3820, roughness: 0.5 })));
  for (let i = 0; i < 6; i++) { const s = mesh(rbox(0.02, 0.5, 0.02, 0.008), steel); s.rotation.z = (i / 6) * Math.PI; helm.add(s); }
  helm.position.set(0, 1.25, HZ1 - 1.0); helm.rotation.x = -0.5; consoleG.add(helm);
  const chair = new THREE.Group();
  chair.add(at(mesh(lathe([[0.25, 0], [0.04, 0.05], [0.04, 0.55], [0, 0.56]], 16), steel), 0, 0, 0));
  chair.add(at(mesh(rbox(0.55, 0.12, 0.5, 0.05), rubber), 0, 0.62, 0));
  chair.add(at(mesh(rbox(0.52, 0.6, 0.1, 0.05), rubber), 0, 0.98, -0.25));
  chair.position.set(0.9, 0, HZ1 - 2.0); house.add(chair);
  // the VHF radio: a set on the left of the console, its scale glows green; a red light blinks on a call
  const radio = new THREE.Group();
  radio.add(mesh(rbox(0.46, 0.2, 0.3, 0.03), std({ color: 0x23272b, metalness: 0.4, roughness: 0.5 })));
  const scale = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.07), emissive(0x9fe08a, 2.6)); scale.position.set(-0.05, 0.02, -0.152); scale.rotation.y = Math.PI; radio.add(scale);
  for (const dx of [0.12, 0.18]) { const k = mesh(lathe([[0.022, 0], [0.022, 0.03], [0, 0.03]], 14), steel); k.rotation.x = -Math.PI / 2; k.position.set(dx, 0, -0.15); radio.add(k); }
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), emissive(0xff3020, 5)); led.position.set(0.15, 0.065, -0.152); led.rotation.y = Math.PI; radio.add(led);
  const ledGlow = glowSprite(0xff3a20, 0.18, 2); ledGlow.position.copy(led.position); radio.add(ledGlow);
  const handset = mesh(rbox(0.07, 0.2, 0.05, 0.02), std({ color: 0x16181a, roughness: 0.6 })); handset.position.set(-0.3, 0.02, -0.12); handset.rotation.z = 0.15; radio.add(handset);
  radio.add(mesh(tube([[-0.3, -0.07, -0.12], [-0.28, -0.25, -0.1], [-0.2, -0.3, -0.05], [-0.1, -0.12, 0]], 0.006, 30), rubber));
  radio.position.set(-2.25, 1.22, HZ1 - 0.6); radio.rotation.x = -0.1;
  house.add(radio);
  const radioLight = new THREE.PointLight(0x9fe08a, 0.6, 3, 1.5); radioLight.position.set(-2.25, 1.6, HZ1 - 1.0); house.add(radioLight);
  const screenLight = new THREE.PointLight(0x7fd8ff, 0.8, 5, 1.5); screenLight.position.set(0, 1.6, HZ1 - 1.2); house.add(screenLight);
  // inside: a corridor from the door to the bridge (cabin doors either side), warm ceiling lamps,
  // the exit sign over the door, a fire extinguisher on its bracket
  const CZ = 7.0, CX = 0.8;                       // the corridor runs from the door (z = HZ0) to z = CZ
  for (const sx of [-1, 1]) {
    const len = CZ - HZ0 - 0.16;
    const part = mesh(rbox(0.12, HH - 0.02, len, 0.04), steelFor(len, HH)); part.position.set(sx * CX, HH / 2, HZ0 + 0.08 + len / 2); house.add(part);
    const jamb = mesh(rbox(0.16, HH, 0.16, 0.04), greyPaint); jamb.position.set(sx * CX, HH / 2, CZ); house.add(jamb);
    const door = watertightDoor({ w: 0.78, h: 1.85 });          // a watertight cabin door: rounded corners, dog levers
    door.position.set(sx * (CX - 0.07), 0.98, HZ0 + 1.9); door.rotation.y = -sx * Math.PI / 2; house.add(door);
  }
  const lampsAt = [[0, HZ0 + 1.2], [0, HZ0 + 3.2], [-1.6, HZ1 - 2.2], [1.6, HZ1 - 2.2]];
  for (const [x, z] of lampsAt) {
    const base = mesh(lathe([[0, 0], [0.16, 0], [0.17, -0.03], [0.14, -0.08], [0, -0.09]], 20), greyPaint); base.position.set(x, HH - 0.01, z); house.add(base);
    const glassL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), emissive(0xffd29a, 3.2)); glassL.position.set(x, HH - 0.05, z); house.add(glassL);
    const cage = mesh(new THREE.TorusGeometry(0.135, 0.008, 6, 24), greyPaint); cage.rotation.x = Math.PI / 2; cage.position.set(x, HH - 0.1, z); house.add(cage);
    const pl = new THREE.PointLight(0xffc98c, 2.6, 6, 1.4); pl.position.set(x, HH - 0.25, z); house.add(pl);
  }
  {   // the exit sign over the door, inside: a green lit box with the bilingual exit sign of Kazakhstan (i18n sign_exit)
    const sign = new THREE.Group(); sign.position.set(0, 2.42, HZ0 + 0.12); house.add(sign);
    sign.add(mesh(rbox(0.48, 0.18, 0.06, 0.02), greyPaint));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.15), new THREE.MeshBasicMaterial({ map: canvasTexture(512, 176, (g, w, h) => {
      g.fillStyle = "#0b8a3e"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#f4fff6"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "800 62px Onest, sans-serif";
      const fit = Math.min(1, (w - 70) / g.measureText(t("sign_exit")).width);   // the whole text inside the frame
      g.font = `800 ${Math.floor(62 * fit)}px Onest, sans-serif`;
      g.fillText(t("sign_exit"), w / 2, h / 2 + 3);
      g.strokeStyle = "#f4fff6"; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    }), color: new THREE.Color(1, 1, 1).multiplyScalar(1.6) }));
    face.position.z = 0.032; sign.add(face);
    sign.add(at(glowSprite(0x2aff7a, 0.7, 0.6), 0, 0, 0.06));
  }
  {   // a fire extinguisher on the corridor wall
    const fe = new THREE.Group(); fe.position.set(-CX + 0.16, 0.42, HZ0 + 0.8); house.add(fe);
    const red = std({ color: 0xc8231b, roughness: 0.35, metalness: 0.2 });
    fe.add(mesh(lathe([[0, 0], [0.075, 0], [0.085, 0.02], [0.085, 0.5], [0.07, 0.56], [0.03, 0.6], [0, 0.6]], 24), red));
    fe.add(at(mesh(lathe([[0.025, 0], [0.025, 0.06], [0.012, 0.08], [0, 0.08]], 12), std({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.4 })), 0, 0.6, 0));
    fe.add(at(mesh(rbox(0.14, 0.03, 0.03, 0.01), std({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.4 })), 0.04, 0.68, 0));
    fe.add(mesh(tube([[0.02, 0.66, 0.02], [0.1, 0.62, 0.06], [0.11, 0.3, 0.07], [0.08, 0.15, 0.06]], 0.012, 20), rubber));
    fe.add(at(mesh(new THREE.PlaneGeometry(0.1, 0.16), std({ color: 0xf0ece0, roughness: 0.8 })), 0, 0.3, 0.087));
    const bracket = mesh(new THREE.TorusGeometry(0.088, 0.008, 6, 24), steel); bracket.rotation.x = Math.PI / 2; bracket.position.y = 0.35; fe.add(bracket);
    fe.rotation.y = Math.PI / 2;
  }
  // the mast with the radar antenna turning, the masthead light and the red light on top
  const mast = new THREE.Group(); mast.position.set(0, HH + 0.2, 7);
  mast.add(mesh(lathe([[0.12, 0], [0.11, 3.0], [0.07, 4.4], [0, 4.45]], 16), whitePaint));
  const yard = mesh(rbox(2.4, 0.08, 0.1, 0.03), whitePaint); yard.position.y = 2.6; mast.add(yard);
  const radar = new THREE.Group(); radar.position.y = 3.25;
  radar.add(mesh(lathe([[0.18, 0], [0.18, 0.22], [0.1, 0.26], [0, 0.26]], 18), darkSteel));
  const ant = mesh(rbox(2.6, 0.14, 0.24, 0.05), std({ color: 0xe8e8e2, roughness: 0.5 })); ant.position.y = 0.36; radar.add(ant);
  mast.add(radar);
  const topLight = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), emissive(0xff2a1a, 6)); topLight.position.y = 4.5; mast.add(topLight);
  const topHalo = glowSprite(0xff3a2a, 1.4, 2); topHalo.position.y = 4.5; mast.add(topHalo);
  for (const sx of [-1.15, 1.15]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), emissive(sx < 0 ? 0xff3020 : 0x30ff60, 4)); l.position.set(sx, 2.66, 0); mast.add(l);
    const h = glowSprite(sx < 0 ? 0xff3020 : 0x30ff60, 0.8, 1.5); h.position.copy(l.position); mast.add(h);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), emissive(0xfff2d0, 5)); head.position.y = 2.2; head.position.z = 0.15; mast.add(head);
  mast.add(at(glowSprite(0xfff0c8, 1.1, 1.6), 0, 2.2, 0.15));
  ship.add(mast);
  // the searchlight on the roof
  const search = new THREE.Group(); search.position.set(2.5, HH + 0.35, HZ1 - 0.4);
  search.add(mesh(lathe([[0, -0.2], [0.16, -0.18], [0.2, 0.05], [0.22, 0.25], [0, 0.25]], 20), darkSteel));
  const sglass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), emissive(0xfff3d8, 6)); sglass.position.y = 0.26; sglass.rotation.x = -Math.PI / 2; search.add(sglass);
  ship.add(search);

  for (const sx of [-1.15, 1.15]) {
    const cage = mesh(lathe([[0, 0], [0.09, 0], [0.1, 0.06], [0.08, 0.16], [0, 0.17]], 14), darkSteel); cage.rotation.x = -Math.PI / 2; cage.position.set(sx, 2.2, HZ0 - 0.09); ship.add(cage);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), emissive(0xffcf8a, 5)); bulb.position.set(sx, 2.2, HZ0 - 0.2); ship.add(bulb);
    ship.add(at(glowSprite(0xffc880, 1.0, 1.3), sx, 2.2, HZ0 - 0.25));
    const pl = new THREE.PointLight(0xffc27a, 5, 9, 1.5); pl.position.set(sx, 2.15, HZ0 - 0.6); ship.add(pl);
  }
  // ---------------- between the bridge and the working deck: the companionway down to the cabin
  const comp = new THREE.Group(); comp.position.set(-2.2, 0, 1.15); ship.add(comp);
  comp.add(at(mesh(rbox(1.25, 1.15, 1.7, 0.08), whitePaint), 0, 0.575, 0.15));
  const compDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), std({ color: 0x050403, roughness: 1 })); compDoor.position.set(0, 0.52, -0.705); compDoor.rotation.y = Math.PI; comp.add(compDoor);
  for (let i = 0; i < 4; i++) comp.add(at(mesh(rbox(0.74, 0.04, 0.22, 0.015), greyPaint), 0, 0.42 - i * 0.12, -0.55 + i * 0.22));
  for (const sx of [-0.55, 0.55]) comp.add(mesh(tube([[sx, 0.2, -1.2], [sx, 1.0, -1.15], [sx, 1.15, -0.8]], 0.022, 12), steel));
  const compLamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), emissive(0xffc070, 5)); compLamp.position.set(0, 1.08, -0.72); comp.add(compLamp);
  comp.add(at(glowSprite(0xffb860, 0.9, 1.2), 0, 1.08, -0.75));
  const compLight = new THREE.PointLight(0xffb060, 1.4, 4, 1.6); compLight.position.set(0, 1.0, -1.3); comp.add(compLight);

  // ---------------- the working deck (stern): A-frame, Nerpa on her cradle, winch, container, rope, rings
  const aframe = new THREE.Group(); aframe.position.set(0, 0, STERN + 0.9); ship.add(aframe);
  const AF_H = 6.6, AF_LEAN = -0.18;
  for (const sx of [-3.35, 3.35]) {
    const leg = new THREE.Group(); leg.position.set(sx, 0, 0); leg.rotation.x = AF_LEAN; aframe.add(leg);
    leg.add(at(mesh(rbox(0.36, AF_H, 0.42, 0.07), yellowPaint), 0, AF_H / 2, 0));
    leg.add(at(mesh(rbox(0.7, 0.3, 0.8, 0.06), darkSteel), 0, 0.15, 0));
    const ram = mesh(lathe([[0.11, 0], [0.11, 1.9], [0.05, 1.95], [0.05, 3.2], [0, 3.2]], 16), steel);
    ram.position.set(sx * 0.93, 0.25, 3.0); ram.rotation.x = -1.02 ; aframe.add(ram);
  }
  const cross = mesh(rbox(7.1, 0.42, 0.42, 0.08), yellowPaint);
  cross.position.set(0, AF_H * Math.cos(AF_LEAN) - 0.1, AF_H * Math.sin(AF_LEAN)); aframe.add(cross);
  const sheave = new THREE.Group(); sheave.position.set(0, cross.position.y - 0.45, cross.position.z); aframe.add(sheave);
  sheave.add(mesh(rbox(0.3, 0.55, 0.45, 0.06), darkSteel));
  const wheelS = mesh(lathe([[0.2, -0.06], [0.22, -0.05], [0.22, 0.05], [0.2, 0.06], [0.15, 0], [0.2, -0.06]], 20), steel); wheelS.rotation.z = Math.PI / 2; wheelS.position.y = -0.2; sheave.add(wheelS);
  for (const sx of [-2.6, 2.6]) {     // working lights on the crossbar
    const l = mesh(rbox(0.32, 0.22, 0.18, 0.04), darkSteel); l.position.set(sx, cross.position.y - 0.2, cross.position.z + 0.25); aframe.add(l);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), emissive(0xfff0d0, 5)); gl.position.set(sx, cross.position.y - 0.2, cross.position.z + 0.345); aframe.add(gl);
    aframe.add(at(glowSprite(0xffe8c0, 1.4, 1.2), sx, cross.position.y - 0.2, cross.position.z + 0.4));
  }
  const nerpa = createNerpa();                        // the same model as in the descent and on the seabed (23.3-A)
  nerpa.position.set(0.6, 0.68, -10.2);                // her sphere faces the bow: the crane lifts her by the ring and swings her aft
  {   // work lights on her: one from the A-frame crossbar, one from the container roof
    const w1 = new THREE.SpotLight(0xfff4e6, 60, 14, 0.5, 0.6, 1.2); w1.position.set(0.4, 6.2, -14.6); w1.target.position.set(0.6, 1.3, -10.0); ship.add(w1, w1.target);
    const w2 = new THREE.SpotLight(0xfff0dc, 30, 10, 0.55, 0.6, 1.3); w2.position.set(-1.9, 2.9, -8.4); w2.target.position.set(0.6, 1.0, -9.0); ship.add(w2, w2.target);
    ship.add(at(mesh(rbox(0.3, 0.2, 0.2, 0.04), darkSteel), -1.95, 2.72, -8.4));
    ship.add(at(glowSprite(0xfff0dc, 0.8, 1.2), -1.9, 2.66, -8.25));
  }
  ship.add(nerpa);
  const cradle = new THREE.Group(); cradle.position.set(0.6, 0, -10.2); ship.add(cradle);
  for (const sx of [-0.95, 0.95]) for (const z of [-1.2, 1.2]) {
    cradle.add(at(mesh(rbox(0.16, 0.62, 0.16, 0.04), greyPaint), sx, 0.31, z));
    cradle.add(at(mesh(rbox(0.32, 0.08, 0.36, 0.03), rubber), sx, 0.64, z));
  }
  for (const sx of [-0.95, 0.95]) cradle.add(at(mesh(rbox(0.14, 0.12, 2.7, 0.04), greyPaint), sx, 0.12, 0));
  for (const z of [-1.2, 1.2]) cradle.add(at(mesh(rbox(2.0, 0.12, 0.14, 0.04), greyPaint), 0, 0.12, z));
  // the lift cable from the sheave to the eye on Nerpa's back (slack, swinging a little)
  ship.updateMatrixWorld(true);
  const cablePts = () => {
    const top = new THREE.Vector3(0, sheave.position.y - 0.4, sheave.position.z).add(aframe.position);
    const eyeP = nerpa.localToWorld(nerpa.userData.eye.clone().add(new THREE.Vector3(0, 0.1, 0)));
    return [top, top.clone().lerp(eyeP, 0.5).add(new THREE.Vector3(0, -0.25, 0)), eyeP];
  };
  const cable = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts()), 16, 0.016, 6), std({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 }));
  ship.add(cable);
  // the winch: a drum with the cable wound on, flanges, a frame and the motor
  const winch = new THREE.Group(); winch.position.set(3.35, 0, -4.4); ship.add(winch);
  const drumTex = canvasTexture(64, 256, (g, w, h) => { g.fillStyle = "#3a3a3a"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { g.fillStyle = y % 8 ? "#5a5a5a" : "#262626"; g.fillRect(0, y, w, 2); } });
  drumTex.wrapS = drumTex.wrapT = THREE.RepeatWrapping;
  const drum = mesh(lathe([[0.34, -0.5], [0.34, 0.5]], 32), std({ map: drumTex, metalness: 0.7, roughness: 0.4 })); drum.rotation.z = Math.PI / 2; drum.position.y = 0.75; winch.add(drum);
  for (const sx of [-0.52, 0.52]) {
    const fl = mesh(lathe([[0.1, -0.03], [0.55, -0.03], [0.56, 0], [0.55, 0.03], [0.1, 0.03]], 32), yellowPaint); fl.rotation.z = Math.PI / 2; fl.position.set(sx, 0.75, 0); winch.add(fl);
    winch.add(at(mesh(rbox(0.12, 0.85, 0.9, 0.04), greyPaint), sx * 1.18, 0.42, 0));
  }
  winch.add(at(mesh(rbox(1.5, 0.12, 1.1, 0.04), greyPaint), 0, 0.06, 0));
  const motor = mesh(lathe([[0, -0.3], [0.2, -0.3], [0.22, -0.25], [0.22, 0.25], [0.2, 0.3], [0, 0.3]], 20), std({ color: 0x2f5a7a, metalness: 0.4, roughness: 0.5 }));
  motor.rotation.z = Math.PI / 2; motor.position.set(0.95, 0.45, -0.3); winch.add(motor);
  {
    const wireMat = std({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 });
    const legTop = new THREE.Vector3(3.1, AF_H * Math.cos(AF_LEAN) - 0.3, STERN + 0.9 + AF_H * Math.sin(AF_LEAN));
    const pts = [new THREE.Vector3(3.35, 1.08, -4.4), new THREE.Vector3(3.15, 0.45, STERN + 1.3), legTop,
                 new THREE.Vector3(0.25, legTop.y, legTop.z)];
    for (let i = 0; i < pts.length - 1; i++) ship.add(mesh(new THREE.TubeGeometry(new THREE.LineCurve3(pts[i], pts[i + 1]), 1, 0.014, 6), wireMat));
  }
  // Murat's workshop: a 20-foot container against the port rail, corrugated walls, doors to the stern
  const corr = canvasTexture(256, 64, (g, w, h) => { for (let x = 0; x < w; x += 8) { const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, "#777"); gr.addColorStop(0.5, "#fff"); gr.addColorStop(1, "#777"); g.fillStyle = gr; g.fillRect(x, 0, 8, h); } }, false);
  corr.wrapS = corr.wrapT = THREE.RepeatWrapping; corr.repeat.set(4, 1);
  const contPaint = paint(0x3d6b8a, { seams: 0.5, streaks: 1.5, seed: 31 }); contPaint.bumpMap = corr; contPaint.bumpScale = 2.5;
  const cont = new THREE.Group(); cont.position.set(-3.08, 0, -6.0); ship.add(cont);
  cont.add(at(mesh(rbox(2.44, 2.6, 6.06, 0.05), contPaint), 0, 1.3, 0));
  for (const [x, z] of [[-1.17, -2.98], [1.17, -2.98], [-1.17, 2.98], [1.17, 2.98]]) cont.add(at(mesh(rbox(0.16, 2.62, 0.16, 0.03), darkSteel), x, 1.31, z));
  for (const sx of [-0.62, 0.62]) {
    cont.add(at(mesh(rbox(1.16, 2.36, 0.04, 0.02), contPaint), sx, 1.3, -3.04));
    for (const dx of [-0.28, 0.28]) cont.add(mesh(tube([[sx + dx, 0.15, -3.1], [sx + dx, 2.45, -3.1]], 0.02, 2), steel));
  }
  const contLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), emissive(0xffc470, 4)); contLamp.position.set(0, 2.5, -3.15); cont.add(contLamp);
  cont.add(at(glowSprite(0xffb860, 0.9, 1.2), 0, 2.5, -3.2));
  const contLight = new THREE.PointLight(0xffb060, 2.2, 5, 1.6); contLight.position.set(0, 2.3, -3.6); cont.add(contLight);
  // coils of rope, bollards, life rings «TULPAR · AQTAU» on the rails
  for (const [x, z, r0, tn] of [[-1.4, -13.1, 0.22, 7], [2.6, -12.7, 0.2, 6], [-1.2, -1.2, 0.18, 6]]) ship.add(at(ropeCoil(r0, tn), x, 0, z));
  for (const [x, z] of [[-4.2, -12.5], [4.2, -12.5], [-3.9, 16.5], [3.9, 16.5], [-2.5, 24], [2.5, 24]]) ship.add(at(bollard(darkSteel), x, 0, z, Math.PI / 2));
  for (const [x, z] of [[4.86, -1.0], [-4.86, -1.6], [4.86, -11.6], [-4.86, -11.4]]) {
    const ringG = lifeRing(lifeLabel);
    ringG.position.set(x, 0.86, z); ringG.rotation.y = Math.PI / 2;
    ship.add(ringG);
  }
  // a lifeboat on davits outboard of the bridge (starboard)
  const boat = new THREE.Group(); boat.position.set(6.1, 1.6, 7.2); ship.add(boat);
  const bhull = mesh(lathe([[0, -2.6], [0.55, -2.3], [0.8, -1.5], [0.85, 0], [0.8, 1.5], [0.55, 2.3], [0, 2.6]], 28), paint(0xe8601c, { seed: 41 }));
  bhull.rotation.x = Math.PI / 2; bhull.scale.set(1, 1, 0.75); boat.add(bhull);
  const bcap = mesh(rbox(1.3, 0.5, 3.6, 0.22, 3), whitePaint); bcap.position.y = 0.55; boat.add(bcap);
  for (const z of [-1.8, 1.8]) ship.add(mesh(tube([[4.7, 0, 7.2 + z], [4.75, 2.6, 7.2 + z], [5.6, 3.2, 7.2 + z], [6.1, 2.5, 7.2 + z]], 0.07, 16), greyPaint));
  // deck floodlights on the bridge's back edge, shining on the working deck
  const floods = [];
  for (const sx of [-2.6, 2.6]) {
    const l = mesh(rbox(0.4, 0.28, 0.22, 0.05), darkSteel); l.position.set(sx, HH + 0.05, HZ0 - 0.2); l.rotation.x = 0.6; ship.add(l);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), emissive(0xffe8c0, 5)); gl.position.set(sx, HH - 0.02, HZ0 - 0.32); gl.rotation.x = 0.6 + Math.PI; ship.add(gl);
    ship.add(at(glowSprite(0xffe0b0, 1.6, 1.0), sx, HH - 0.05, HZ0 - 0.4));
    const sl = new THREE.SpotLight(0xffe8cc, 34, 26, 0.75, 0.6, 1.4);
    sl.position.set(sx, HH - 0.1, HZ0 - 0.4); sl.target.position.set(sx * 0.3, 0, -9); ship.add(sl, sl.target);
    floods.push(sl);
  }
  floods[0].castShadow = true; floods[0].shadow.mapSize.set(2048, 2048); floods[0].shadow.bias = -0.0004; floods[0].shadow.camera.near = 0.5; floods[0].shadow.camera.far = 30;
  // the bow: a windlass with the anchor chain and a light on the bow mast
  const winds = new THREE.Group(); winds.position.set(0, 0, 21); ship.add(winds);
  for (const sx of [-0.7, 0.7]) { const d = mesh(lathe([[0.25, -0.2], [0.3, -0.18], [0.3, 0.18], [0.25, 0.2]], 20), darkSteel); d.rotation.z = Math.PI / 2; d.position.set(sx, 0.4, 0); winds.add(d); }
  winds.add(at(mesh(rbox(1.0, 0.45, 0.7, 0.06), greyPaint), 0, 0.25, 0));
  ship.add(mesh(lathe([[0.07, 0], [0.06, 3.6], [0, 3.62]], 12), whitePaint).translateZ(27));
  ship.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), emissive(0xfff2d0, 5)), 0, 3.65, 27));
  ship.add(at(glowSprite(0xfff0c8, 1.2, 1.4), 0, 3.65, 27));
  // the binoculars on a bracket outside the bridge's front starboard corner
  // the bridge wing: a teak shelf with a lip on the front starboard corner, the binoculars on it, a lamp over it
  const binoBracket = new THREE.Group(); binoBracket.position.set(HX + 0.3, 1.1, HZ1 - 0.2); ship.add(binoBracket);
  const teak = std({ color: 0x8a5a32, roughness: 0.55, map: canvasTexture(128, 32, (c, w, h) => { const rr = rng(88); c.fillStyle = "#8a5a32"; c.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(60,35,15,${0.15 + rr() * 0.25})`; c.beginPath(); const y = rr() * h; c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + rr() * 4 - 2, w * 0.6, y + rr() * 4 - 2, w, y + rr() * 3 - 1.5); c.stroke(); } }) });
  binoBracket.add(at(mesh(rbox(0.44, 0.035, 0.34, 0.012), teak), 0, 0, 0));
  binoBracket.add(at(mesh(rbox(0.44, 0.035, 0.02, 0.008), teak), 0, 0.03, 0.16));
  binoBracket.add(at(mesh(rbox(0.02, 0.035, 0.34, 0.008), teak), 0.21, 0.03, 0));
  for (const z of [-0.12, 0.12]) binoBracket.add(mesh(tube([[-0.2, -0.02, z], [-0.05, -0.17, z], [-0.21, -0.3, z]], 0.012, 12), darkSteel));
  const binos = binocularsModel(); binos.position.set(0.01, 0.034, 0); binos.rotation.y = -0.5; binoBracket.add(binos);
  const shade = mesh(lathe([[0.02, 0], [0.1, -0.08], [0.11, -0.1], [0, -0.1]], 20), greyPaint); shade.position.set(0, 0.62, 0); binoBracket.add(shade);
  binoBracket.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), emissive(0xffd8a0, 4)), 0, 0.53, 0));
  binoBracket.add(mesh(tube([[0, 0.62, 0], [-0.08, 0.72, 0], [-0.2, 0.74, 0]], 0.01, 8), greyPaint));
  const binoLamp = new THREE.SpotLight(0xffd8a0, 2.2, 3, 0.9, 0.6, 1.4); binoLamp.position.set(HX + 0.3, 1.62, HZ1 - 0.2); binoLamp.target.position.set(HX + 0.3, 1.0, HZ1 - 0.2); ship.add(binoLamp, binoLamp.target);

  // spray at the bow
  const SPN = 400, spp = new Float32Array(SPN * 3), spv = new Float32Array(SPN * 3), spl = new Float32Array(SPN);
  const spg = new THREE.BufferGeometry(); spg.setAttribute("position", new THREE.BufferAttribute(spp, 3));
  const spray = new THREE.Points(spg, new THREE.PointsMaterial({ map: SOFT, color: 0x9fb4c4, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false }));
  spray.frustumCulled = false; ship.add(spray);
  for (let i = 0; i < SPN; i++) { spl[i] = -1; spp[i * 3 + 1] = -100; }
  let sprayT = 2;

  // ---------------- lights on the horizon (other ships, an oil platform far to the east)
  const horizon = new THREE.Group(); scene.add(horizon);
  const hr = rng(13);
  for (let i = 0; i < 9; i++) {
    const a = -0.6 + hr() * 4.4, d = 3500 + hr() * 1500;
    const s = glowSprite(i % 3 ? 0xfff0d0 : 0xff6040, 26 + hr() * 20, 1.4); s.position.set(Math.sin(a) * d, 4, -Math.cos(a) * d); horizon.add(s);
  }
  const rig = new THREE.Group(); rig.position.set(4200, 0, -800); horizon.add(rig);
  for (let i = 0; i < 7; i++) rig.add(at(glowSprite(0xffc070, 30, 1.2), (i % 3) * 25 - 25, 20 + Math.floor(i / 3) * 18, 0));
  rig.add(at(glowSprite(0xff7a30, 60, 2), 0, 90, 0));            // the gas flare

  // ---------------- the crash site to the south, 1 km off (world coordinates; the ship stays at the origin)
  // Seen through the binoculars it fills the frame: the helicopter hovering with its searchlight, the pool of
  // light crawling over the swell, three patrol boats with their own searchlights, the kerosene slick that
  // shows its rainbow only where a beam falls on it, debris rocking in the light.
  const south = new THREE.Group(); scene.add(south);
  const C = new THREE.Vector3(30, 0, 1000);
  function beamMaterial(hex, k) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uCol: { value: new THREE.Color(hex) }, uK: { value: k } },
      vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      // brighter in the core, soft at the rim, fading near the lamp and growing towards the water
      fragmentShader: "uniform vec3 uCol; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { float core = pow(abs(dot(vN, vV)), 2.2); float along = smoothstep(0.0, 0.25, 1.0 - vUv.y) * (0.45 + 0.55 * (1.0 - vUv.y)); gl_FragColor = vec4(uCol * uK * core * along, 1.0); }",
    });
  }
  function aimCone(cone, from, to, radius) {
    const d = to.clone().sub(from), len = d.length();
    cone.position.copy(from); cone.scale.set(radius, len, radius);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
  }
  const coneGeo = new THREE.ConeGeometry(1, 1, 48, 1, true).translate(0, -0.5, 0);    // apex at the lamp (y = 0), base at y = -1
  // the pools of light on the water (the sea shader brightens the waves and makes them glitter in them)
  const pools = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
  sea.material.uniforms.uPools = { value: pools };

  function patrolBoat(seed) {
    const b = new THREE.Group();
    const hullP = paint(0x56616c, { seed }), cabP = paint(0xdcdcd4, { seed: seed + 1 });
    const h = mesh(lathe([[0, -9], [1.6, -7.5], [2.4, -3], [2.5, 3], [2.0, 8], [0, 10]], 24), hullP, { cast: false });
    h.rotation.x = Math.PI / 2; h.scale.set(1, 1, 0.45); h.position.y = 0.3; b.add(h);
    b.add(at(mesh(rbox(3.2, 2.2, 5.2, 0.35), cabP, { cast: false }), 0, 2.1, -1.2));
    b.add(at(mesh(rbox(2.6, 0.9, 2.2, 0.25), cabP, { cast: false }), 0, 3.6, -0.4));
    b.add(at(mesh(lathe([[0.1, 0], [0.08, 3.4], [0, 3.42]], 10), cabP, { cast: false }), 0, 4.0, -0.4));
    b.add(at(glowSprite(0xfff4dc, 1.6, 3.0), 0, 7.4, -0.4));                 // masthead, white
    b.add(at(glowSprite(0xff2a20, 1.9, 3.4), -1.7, 3.3, 0.3));               // port, red
    b.add(at(glowSprite(0x20ff60, 1.9, 3.4), 1.7, 3.3, 0.3));                // starboard, green
    const strobe = glowSprite(0x3a6cff, 3.6, 4.0); strobe.position.set(0, 4.7, -0.4); b.add(strobe);
    const lamp = new THREE.Object3D(); lamp.position.set(0, 4.3, 0.8); b.add(lamp);
    b.add(at(glowSprite(0xfff6e6, 1.2, 3.0), 0, 4.3, 0.9));
    b.userData = { strobe, lamp, seed };
    return b;
  }
  const boats = [[-62, 12, 1.2, 51], [58, -20, -1.9, 53], [22, 75, 2.6, 55]].map(([dx, dz, ry, seed]) => {
    const b = patrolBoat(seed); b.position.set(C.x + dx, 0, C.z + dz); b.rotation.y = ry; south.add(b);
    const beam = new THREE.Mesh(coneGeo, beamMaterial(0xe8eeff, 0.075)); south.add(beam);
    b.userData.beam = beam;
    return b;
  });
  // the helicopter: a silhouette with blinking red and white lights, rotor discs, skids
  const heli = new THREE.Group(); heli.scale.setScalar(1.6); south.add(heli);     // x1.6: a readable silhouette at 1 km
  const heliPaint = paint(0x2f3c48, { seed: 61 });
  heli.add(mesh(lathe([[0, -2.4], [0.9, -2.1], [1.25, -1.0], [1.3, 0.6], [1.0, 1.6], [0.45, 2.3], [0, 2.4]], 22), heliPaint, { cast: false }).rotateX(-Math.PI / 2));
  heli.add(at(mesh(lathe([[0.28, 0], [0.2, 3.0], [0.12, 5.2], [0, 5.3]], 14), heliPaint, { cast: false }).rotateX(-Math.PI / 2), 0, 0.3, 2.0));
  heli.add(at(mesh(rbox(0.12, 1.6, 1.0, 0.05), heliPaint, { cast: false }), 0, 1.0, 7.0));
  const tailRotor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0x0a0d10, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  tailRotor.rotation.y = Math.PI / 2; tailRotor.position.set(0.15, 1.0, 7.2); heli.add(tailRotor);
  heli.add(at(new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fc0d8, transparent: true, opacity: 0.35 })).rotateX(-Math.PI / 2), 0, 0.1, -1.6));
  for (const sx of [-0.9, 0.9]) heli.add(mesh(tube([[sx, -1.6, -2.0], [sx, -1.65, 0], [sx, -1.6, 1.8], [sx, -1.3, 2.2]], 0.07, 12), darkSteel));
  const rotor = new THREE.Group(); rotor.position.y = 1.5; heli.add(rotor);
  rotor.add(new THREE.Mesh(new THREE.CircleGeometry(5.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0d10, transparent: true, opacity: 0.22, side: THREE.DoubleSide })));
  for (let k = 0; k < 4; k++) { const bl = mesh(rbox(5.4, 0.04, 0.32, 0.02), darkSteel, { cast: false }); bl.position.x = 2.8; const arm = new THREE.Group(); arm.rotation.y = (k * Math.PI) / 2; arm.add(bl); rotor.add(arm); }
  const heliRed = glowSprite(0xff2a1a, 1.4, 3.4); heliRed.position.y = 1.85; heli.add(heliRed);
  const heliRed2 = glowSprite(0xff2a1a, 1.0, 3.4); heliRed2.position.set(0, -1.4, 0); heli.add(heliRed2);
  const heliWhite = glowSprite(0xffffff, 1.6, 3.6); heliWhite.position.set(0, 1.9, 7.2); heli.add(heliWhite);
  const heliLamp = new THREE.Object3D(); heliLamp.position.set(0, -1.5, -1.6); heli.add(heliLamp);
  heli.add(at(glowSprite(0xfffaf0, 1.4, 3.5), 0, -1.6, -1.7));
  const heliBeam = new THREE.Mesh(coneGeo, beamMaterial(0xf4f6ff, 0.34)); south.add(heliBeam);
  const heliFill = new THREE.PointLight(0xc8d4e8, 30, 25, 1.2); heli.add(heliFill); heliFill.position.set(0, -4, 2);   // its own beam lights its belly
  const heliSpot = new THREE.SpotLight(0xfaf8ff, 70, 0, 0.42, 0.5, 0); scene.add(heliSpot, heliSpot.target);
  const poolSprite = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: SOFT, color: new THREE.Color(0xeef2ff).multiplyScalar(0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  south.add(poolSprite);
  // the kerosene slick: an irregular film next to the boats; a rainbow only where a beam falls on it
  const slick = new THREE.Mesh(new THREE.PlaneGeometry(190, 130, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uPools: { value: pools } },
    vertexShader: "varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec4 uPools[4]; varying vec2 vUv; varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float n = vn(vUv * 4.0 + 3.1) * 0.55 + vn(vUv * 11.0) * 0.3 + vn(vUv * 27.0) * 0.15;
        float blob = 1.0 - smoothstep(0.32, 0.62, length(p * vec2(1.0, 1.3)) + (n - 0.5) * 1.1 + (vn(vUv * 40.0) - 0.5) * 0.12);
        float lit = 0.0;
        for (int i = 0; i < 4; i++) { vec2 d = vW.xz - uPools[i].xy; lit += uPools[i].w * exp(-dot(d, d) / (uPools[i].z * uPools[i].z)); }
        float film = vn(vUv * 7.0 + vec2(uTime * 0.015, 0.0)) * 5.0 + n * 3.0;
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (film + vec3(0.0, 0.33, 0.67)));
        vec3 col = vec3(0.012, 0.016, 0.02) + rainbow * min(lit, 1.6) * 1.6;          // dark, flat water outside the light
        gl_FragColor = vec4(col, blob * (0.5 + 0.5 * min(lit, 1.0)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  slick.position.set(C.x - 2, 0.06, C.z + 2); slick.scale.setScalar(0.45); south.add(slick);       // under the beam's path
  // debris rocking in the light: a row of seats, an orange life jacket, a suitcase, a piece of fuselage skin
  const debris = [];
  // larger than life (x2.2): at 1 km a metre is a dozen pixels even at 16x
  const addDebris = (g, dx, dz, tilt) => { g.scale.setScalar(2.2); g.userData.base = new THREE.Vector3(C.x + dx, 0, C.z + dz); g.userData.tilt = tilt; south.add(g); debris.push(g); return g; };
  {
    const seatRow = new THREE.Group();
    const blue = std({ color: 0x7aa6e6, roughness: 0.6, emissive: 0x0a1424 }), cover = std({ color: 0xffffff, roughness: 0.7 }), frameM = std({ color: 0xd0d6da, metalness: 0.7, roughness: 0.3 });
    for (const sx of [-0.56, 0, 0.56]) {
      seatRow.add(at(mesh(rbox(0.5, 0.14, 0.52, 0.06), blue, { cast: false }), sx, 0, 0));
      const back = mesh(rbox(0.5, 0.72, 0.13, 0.06), blue, { cast: false }); back.position.set(sx, 0.28, -0.3); back.rotation.x = -1.15; seatRow.add(back);
      const head = mesh(rbox(0.42, 0.04, 0.2, 0.015), cover, { cast: false }); head.position.set(sx, 0.5, -0.62); head.rotation.x = -1.15; seatRow.add(head);
    }
    for (const sx of [-0.83, -0.28, 0.28, 0.83]) seatRow.add(at(mesh(rbox(0.05, 0.08, 0.5, 0.02), frameM, { cast: false }), sx, 0.1, 0));
    addDebris(seatRow, -4, 2, 0.12);
    const vest = new THREE.Group();
    const orange = std({ color: 0xff7a1a, roughness: 0.5, emissive: 0x5a1c00 });
    for (const sx of [-0.2, 0.2]) vest.add(at(mesh(rbox(0.34, 0.12, 0.55, 0.06), orange, { cast: false }), sx, 0, 0));
    vest.add(at(mesh(rbox(0.36, 0.1, 0.18, 0.05), orange, { cast: false }), 0, 0.02, -0.3));
    for (const z of [-0.1, 0.12]) vest.add(at(mesh(rbox(0.74, 0.125, 0.04, 0.01), std({ color: 0xdfe6ea, metalness: 0.6, roughness: 0.2 }), { cast: false }), 0, 0.005, z));
    addDebris(vest, 5, -3, 0.25);
    const suitcase = new THREE.Group();
    suitcase.add(mesh(rbox(0.7, 0.26, 0.48, 0.06), std({ color: 0xc23a4c, roughness: 0.45, emissive: 0x200508 }), { cast: false }));
    suitcase.add(mesh(tube([[-0.12, 0.13, -0.24], [-0.1, 0.13, -0.3], [0.1, 0.13, -0.3], [0.12, 0.13, -0.24]], 0.015, 10), std({ color: 0x222222 }), { cast: false }));
    addDebris(suitcase, 2, 5, 0.18);
    const skin = canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = "#e8ebec"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#1f7a86"; g.fillRect(0, h * 0.55, w, h * 0.16);            // a fictional livery stripe
      g.fillStyle = "rgba(60,60,60,.6)"; for (let x = 8; x < w; x += 14) for (const y of [8, h - 10]) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
      g.strokeStyle = "rgba(40,40,40,.4)"; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    });
    const jag = new THREE.Shape(); const rj = rng(91);
    const pts = []; for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; const rr = 1 + (rj() - 0.5) * 0.5; pts.push([Math.cos(a) * 1.6 * rr, Math.sin(a) * 0.9 * rr]); }
    jag.moveTo(...pts[0]); pts.slice(1).forEach((q) => jag.lineTo(...q)); jag.closePath();
    const skinGeo = new THREE.ExtrudeGeometry(jag, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }).rotateX(-Math.PI / 2);
    const uv = skinGeo.attributes.uv, pp = skinGeo.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, (pp.getX(k) + 1.8) / 3.6, (pp.getZ(k) + 1.1) / 2.2);
    const panel = mesh(skinGeo, std({ map: skin, metalness: 0.35, roughness: 0.3, side: THREE.DoubleSide, emissive: 0x161a1c }), { cast: false });
    const pg = new THREE.Group(); pg.add(panel); addDebris(pg, -7, -3, 0.08);
  }

  // ---------------- colliders, walk area, interactables (ship-local, metres)
  const colliders = [
    [-HX - 0.1, HZ0 - 0.12, -0.62, HZ0 + 0.12], [0.62, HZ0 - 0.12, HX + 0.1, HZ0 + 0.12],      // the back wall either side of the door
    [-HX - 0.12, HZ0, -HX + 0.12, HZ1], [HX - 0.12, HZ0, HX + 0.12, HZ1],                      // side walls
    [-HX, HZ1 - 0.15, HX, HZ1 + 0.15], [-3.05, HZ1 - 1.0, 3.05, HZ1],                          // front wall, console
    [3.28, HZ1 - 0.37, 3.72, HZ1 - 0.03],                                                       // the binoculars shelf
    [0.65, HZ1 - 2.3, 1.15, HZ1 - 1.75],                                                        // the chair
    [-0.92, HZ0, -0.68, 7.08], [0.68, HZ0, 0.92, 7.08],                                         // the corridor walls
    [-2.85, 0.25, -1.55, 2.05],                                                                 // the companionway
    [-0.45, -11.65, 1.65, -8.75],                                                               // Nerpa on her cradle
    [2.55, -5.0, 4.4, -3.8],                                                                    // the winch
    [-4.4, -9.1, -1.82, -2.9],                                                                  // the container
    [-3.75, -14.6, -2.95, -13.6], [2.95, -14.6, 3.75, -13.6],                                    // A-frame feet
    [-1.75, -13.45, -1.05, -12.75], [2.3, -13.0, 2.9, -12.4], [-1.45, -1.45, -0.95, -0.95],      // rope coils
    [-0.6, 20.6, 0.6, 21.4],                                                                    // the windlass
    [-4.5, -12.8, -3.9, -12.2], [3.9, -12.8, 4.5, -12.2], [-4.2, 16.2, -3.6, 16.8], [3.6, 16.2, 4.2, 16.8],   // bollards
  ];
  const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  function proxy(w, h, d, x, y, z) { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat); p.position.set(x, y, z); ship.add(p); return p; }
  const objects = {
    radio: { show: [radio], hit: proxy(0.8, 0.6, 0.6, -2.25, 1.25, HZ1 - 0.75), stand: [-2.1, HZ1 - 1.55], look: [-2.25, 1.2, HZ1 - 0.6] },
    binoculars: { show: [binos], hit: proxy(0.5, 0.4, 0.5, HX + 0.3, 1.15, HZ1 - 0.2), stand: [HX + 0.8, HZ1 + 0.5], look: [HX + 0.3, 1.13, HZ1 - 0.2] },
    stairs: { show: [comp], hit: proxy(1.4, 1.4, 1.9, -2.2, 0.7, 1.3), stand: [-2.2, -0.35], look: [-2.2, 0.6, 0.45] },
    nerpa: { show: [nerpa, cradle], hit: proxy(2.9, 2.6, 4.0, 0.6, 1.4, -10.2), stand: [0.6, -7.5], look: [0.6, 1.5, -9.6] },
    workshop: { show: [cont], hit: proxy(2.6, 2.7, 6.2, -3.08, 1.3, -6.0), stand: [-1.2, -9.6], look: [-3.08, 1.3, -9.0] },
  };

  // ---------------- motion: the roll of the ship and everything that lives
  const tmp = new THREE.Vector3();
  let roll = 0, pitch = 0, heave = 0;
  let radioCall = false;
  function update(dt, time) {
    sea.material.uniforms.uTime.value = time;
    slick.material.uniforms.uTime.value = time;
    // the ship rolls +-3 deg, pitches a little and heaves with the swell (CLAUDE.md 23.2)
    roll = THREE.MathUtils.degToRad(3) * (0.72 * Math.sin(time * 0.52) + 0.28 * Math.sin(time * 0.91 + 1.3));
    pitch = THREE.MathUtils.degToRad(1.1) * Math.sin(time * 0.37 + 0.6);
    heave = 0.22 * Math.sin(time * 0.47) + 0.08 * Math.sin(time * 1.1 + 2);
    ship.position.set(0, DECK_Y + heave, 0);
    ship.rotation.set(pitch, 0, roll, "ZXY");
    ship.updateMatrixWorld(true);
    radar.rotation.y = time * 2.4;
    nerpa.userData.update(dt, time, 0);
    topLight.material.color.setScalar(0).add(new THREE.Color(0xff2a1a).multiplyScalar(Math.sin(time * 3) > 0.2 ? 6 : 0.6));
    topHalo.material.opacity = Math.sin(time * 3) > 0.2 ? 1 : 0.15;
    const blink = radioCall ? (Math.sin(time * 9) > 0 ? 1 : 0.1) : 0.12;
    led.material.color.setRGB(5 * blink, 0.6 * blink, 0.4 * blink);
    ledGlow.material.opacity = radioCall ? blink : 0;
    // spray: a burst at the bow when it dips into a swell
    sprayT -= dt;
    if (sprayT < 0) {
      sprayT = 2.5 + Math.random() * 3.5;
      let n = 0;
      for (let i = 0; i < SPN && n < 90; i++) if (spl[i] < 0) {
        const s = Math.random() < 0.5 ? -1 : 1;
        spp.set([s * (1.5 + Math.random() * 2.5), -0.8, 24 + Math.random() * 4], i * 3);
        spv.set([s * (1 + Math.random() * 2), 3 + Math.random() * 3.5, -0.5 + Math.random()], i * 3);
        spl[i] = 1.2 + Math.random() * 0.6; n++;
      }
    }
    for (let i = 0; i < SPN; i++) if (spl[i] >= 0) {
      spl[i] -= dt; spv[i * 3 + 1] -= 9.8 * dt;
      for (let k = 0; k < 3; k++) spp[i * 3 + k] += spv[i * 3 + k] * dt;
      if (spl[i] < 0) spp[i * 3 + 1] = -100;
    }
    spg.attributes.position.needsUpdate = true;
    // the crash site: the helicopter hovers and its pool of light crawls over the swell
    const poolAt = tmp.set(C.x + Math.sin(time * 0.06) * 7, 0, C.z + Math.cos(time * 0.045) * 5);
    heli.position.set(C.x - 4 + Math.sin(time * 0.11) * 5, 30 + Math.sin(time * 0.4) * 1.0, C.z - 16 + Math.cos(time * 0.09) * 4);
    heli.rotation.set(0, Math.PI / 2 + Math.sin(time * 0.05) * 0.25, 0.05);      // side-on to the ship: the tail boom reads
    rotor.rotation.y = time * 28; tailRotor.rotation.x = time * 40;
    heliRed.material.opacity = Math.sin(time * 4.2) > 0.4 ? 1 : 0.06;
    heliRed2.material.opacity = Math.sin(time * 4.2 + 1.5) > 0.4 ? 1 : 0.06;
    heliWhite.material.opacity = (time * 1.1) % 1 < 0.07 ? 1 : 0;
    const lampW = heliLamp.getWorldPosition(new THREE.Vector3());
    const water = poolAt.clone(); water.y = seaHeight(water.x, water.z, time);
    aimCone(heliBeam, lampW, water, 6.5);
    heliSpot.position.copy(lampW); heliSpot.target.position.copy(water);
    poolSprite.position.set(water.x, water.y + 0.3, water.z); poolSprite.scale.setScalar(9 + Math.sin(time * 1.3) * 0.4);
    pools[0].set(water.x, water.z, 7, 1.0);
    boats.forEach((b, k) => {
      const sd = b.userData.seed;
      b.position.y = seaHeight(b.position.x, b.position.z, time) * 0.6;
      b.rotation.z = Math.sin(time * 0.7 + sd) * 0.05;
      b.userData.strobe.material.opacity = ((time * 1.6 + k * 0.37) % 1 < 0.08 || (time * 1.6 + k * 0.37) % 1 > 0.16 && (time * 1.6 + k * 0.37) % 1 < 0.24) ? 1 : 0;   // a double flash
      const target = new THREE.Vector3(C.x + Math.sin(time * 0.2 + sd) * 10, 0, C.z + Math.cos(time * 0.17 + sd) * 8);
      target.y = seaHeight(target.x, target.z, time);
      aimCone(b.userData.beam, b.userData.lamp.getWorldPosition(new THREE.Vector3()), target, 3.2);
      pools[k + 1].set(target.x, target.z, 4.5, 0.55);
    });
    for (const g of debris) {
      const bp = g.userData.base, tl = g.userData.tilt;
      g.position.set(bp.x, seaHeight(bp.x, bp.z, time) + 0.06, bp.z);
      g.rotation.set(Math.sin(time * 0.8 + bp.x) * tl, bp.z * 0.3 + Math.sin(time * 0.1 + bp.x) * 0.3, Math.cos(time * 0.7 + bp.z) * tl);
    }
    sea.material.uniforms.uHull.value.set(0, 0, 5.2, 0);
  }
  update(0, 0);

  const local = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  return {
    scene, ship, objects, update,
    /** The first-person space (fp.js): metres, ship-local, the camera rolls with the ship. */
    space: {
      scale: 1, eye: 1.65, poly: WALK, colliders, step: "metal",
      floor: [deck],
      toWorld(x, y, z, out) { return out.copy(local.set(x, y, z)).applyMatrix4(ship.matrixWorld); },
      orient(yaw, pitchV, out) {
        e.set(pitchV, yaw + Math.PI, 0, "YXZ");
        return out.copy(ship.quaternion).multiply(q.setFromEuler(e));
      },
      toLocal(world, out) { return out.copy(world).applyMatrix4(tmpInv.copy(ship.matrixWorld).invert()); },
    },
    /** World points the binoculars can find: the helicopter and the boats, the slick and the debris. */
    targets: {
      rescue: () => [heli.position, ...boats.map((b) => b.position)],
      wreck: () => [debris[0].position, debris[1].position, slick.position],
      seat: debris[0].position, heli: heli.position, slick: slick.position,
    },
    set radioCalling(on) { radioCall = on; },
    spawn: { x: 0.2, z: -6.6, yaw: 0 },
  };
}
const tmpInv = new THREE.Matrix4();
