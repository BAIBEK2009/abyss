// The deck of «Tulpar» at night (CLAUDE.md 23.2): a real place to walk on, not a backdrop.
//   - the stern: an open working deck with the A-frame (how vehicles are really launched), Nerpa on her
//     cradle under it, the winch drum with its cable, coils of rope, life rings, Murat's workshop container,
//     rails, a lifeboat on davits, deck floodlights;
//   - the bow: the bridge (wheelhouse) with glowing consoles and the VHF radio, the radar antenna turning
//     on the mast, the binoculars on a bracket outside, a searchlight;
//   - between them: the companionway down to the cabin;
//   - a living sea: waves with foam and a moon path, the ship rolls +-3 deg, spray at the bow, lights on the
//     horizon; to the south the crash site: patrol boats, a helicopter with a searchlight, a kerosene
//     slick and a seat afloat (seen through the binoculars: show, don't tell).
// Units are metres. Ship-local axes: x to starboard, y up, z to the bow; the bow points south (+z of the
// world), so "look south" means "look over the bow". No bare boxes or cylinders: rounded boxes, lathes and
// tubes with seams and wear (CLAUDE.md 23, "forbidden from now on").
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { canvasTexture, rng } from "../view.js";
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
    uniforms: { uTime: { value: 0 }, uMoon: { value: moonDir.clone() }, uFogCol: { value: new THREE.Color(0x0b1626) },
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
      uniform float uTime; uniform vec3 uMoon; uniform vec3 uFogCol; uniform vec4 uHull; uniform vec2 uHullZ;
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
function binocularsModel() {
  const g = new THREE.Group();
  const rub = std({ color: 0x16181a, roughness: 0.85 }), met = std({ color: 0x2a2d30, metalness: 0.7, roughness: 0.35 });
  const lens = std({ color: 0x1b3b4a, metalness: 0.9, roughness: 0.05, emissive: 0x0a1a22 });
  for (const sx of [-0.045, 0.045]) {
    const b = mesh(lathe([[0, 0], [0.027, 0], [0.03, 0.02], [0.03, 0.09], [0.036, 0.11], [0.036, 0.17], [0.032, 0.18], [0, 0.18]], 20), rub);
    b.rotation.x = Math.PI / 2; b.position.set(sx, 0, -0.09); g.add(b);
    const l = mesh(new THREE.CircleGeometry(0.03, 20), lens); l.position.set(sx, 0, 0.091); g.add(l);
  }
  g.add(mesh(rbox(0.07, 0.022, 0.06, 0.008), met));
  const strap = mesh(tube([[-0.07, 0, -0.06], [-0.09, -0.08, -0.02], [0, -0.13, 0], [0.09, -0.08, -0.02], [0.07, 0, -0.06]], 0.006, 30), std({ color: 0x2c2a26 }));
  g.add(strap);
  return g;
}

/** Interim Nerpa on deck (the detailed vehicle of 23.3-A comes in M12c): rounded foam buoyancy, an
 *  orange sail with a hatch, an acrylic dome, ducted thrusters, folded arms, tubular skids, the lift eye. */
function deckNerpa() {
  const g = new THREE.Group();
  const foam = paint(0xf2c94c, { seams: 2, streaks: 0.3, seed: 21 });
  const white = paint(0xece7da, { seams: 1.4, streaks: 0.2, seed: 22 });
  const orange = paint(0xe8601c, { seams: 1.2, streaks: 0.4, seed: 23 });
  const steel = std({ color: 0x9aa2a8, metalness: 0.85, roughness: 0.35 });
  const dark = std({ color: 0x22262a, metalness: 0.5, roughness: 0.5 });
  // the pressure hull seen as a long rounded body under the foam
  const body = mesh(lathe([[0, -1.95], [0.22, -1.9], [0.5, -1.65], [0.74, -1.25], [0.84, -0.8], [0.86, 0.8], [0.8, 1.25], [0.55, 1.5], [0, 1.58]], 36), white);
  body.rotation.x = Math.PI / 2; body.position.y = 1.15; g.add(body);
  const float = mesh(rbox(1.9, 0.62, 2.9, 0.22, 4), foam); float.position.set(0, 2.05, -0.15); g.add(float);
  for (const sx of [-0.62, 0.62]) {      // battery pods along the stern, a frame with the tail fin
    const pod = mesh(lathe([[0, -0.55], [0.16, -0.5], [0.19, -0.35], [0.19, 0.35], [0.16, 0.5], [0, 0.55]], 18), dark);
    pod.rotation.x = Math.PI / 2; pod.position.set(sx, 0.62, -1.35); g.add(pod);
  }
  const fin = mesh(rbox(0.06, 0.7, 0.55, 0.025), orange); fin.position.set(0, 1.85, -1.75); g.add(fin);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), emissive(0xeaf6ff, 5)); strobe.position.set(0, 2.25, -1.8); g.add(strobe);
  const ant = mesh(lathe([[0.012, 0], [0.008, 0.6], [0, 0.61]], 8), steel); ant.position.set(0.5, 2.36, -1.0); g.add(ant);
  const sail = mesh(rbox(0.7, 0.55, 1.0, 0.16, 3), orange); sail.position.set(0, 2.6, 0.15); g.add(sail);
  const hatch = mesh(lathe([[0, 0], [0.27, 0], [0.28, 0.05], [0.24, 0.09], [0, 0.1]], 24), steel); hatch.position.set(0, 2.88, 0.15); g.add(hatch);
  const eye = mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 20), steel); eye.position.set(0, 3.0, -0.25); g.add(eye);
  // the acrylic dome at the bow (+z) with the pilot's seat and a glowing screen inside
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 36, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe8f2, roughness: 0.04, metalness: 0, transmission: 0.85, thickness: 0.1, ior: 1.49, transparent: true, opacity: 0.45 }));
  dome.rotation.x = Math.PI / 2; dome.position.set(0, 1.15, 1.45); g.add(dome);
  const seat = mesh(rbox(0.38, 0.4, 0.34, 0.08), dark); seat.position.set(0, 1.0, 1.25); g.add(seat);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.16), emissive(0x6fe0c0, 2.2)); scr.position.set(0, 1.25, 1.62); scr.rotation.x = -0.4; g.add(scr);
  const ring = mesh(new THREE.TorusGeometry(0.7, 0.05, 10, 40), steel); ring.position.set(0, 1.15, 1.45); g.add(ring);
  // ducted thrusters
  for (const [x, y, z, ry] of [[-1.05, 1.0, -1.1, 0], [1.05, 1.0, -1.1, 0], [-1.05, 1.0, 0.9, 0], [1.05, 1.0, 0.9, 0]]) {
    const duct = mesh(lathe([[0.2, -0.16], [0.24, -0.15], [0.25, 0], [0.24, 0.15], [0.2, 0.16], [0.21, 0], [0.2, -0.16]], 24), dark);
    duct.rotation.x = Math.PI / 2; at(duct, x, y, z, ry); g.add(duct);
    const prop = mesh(rbox(0.36, 0.03, 0.06, 0.012), steel); prop.position.set(x, y, z); prop.rotation.z = (x + z) * 2; g.add(prop);
  }
  // folded manipulators and the sample basket
  for (const sx of [-0.45, 0.45]) {
    const a1 = mesh(rbox(0.1, 0.1, 0.55, 0.035), steel); a1.position.set(sx, 0.55, 1.45); a1.rotation.x = 0.5; g.add(a1);
    const a2 = mesh(rbox(0.09, 0.09, 0.45, 0.03), steel); a2.position.set(sx, 0.38, 1.72); a2.rotation.x = -0.7; g.add(a2);
  }
  const basket = mesh(rbox(1.1, 0.22, 0.45, 0.04), std({ color: 0x3a3f44, metalness: 0.6, roughness: 0.5, wireframe: false })); basket.position.set(0, 0.32, 1.95); g.add(basket);
  // lights
  for (const sx of [-0.62, 0.62]) {
    const l = mesh(lathe([[0, 0], [0.09, 0], [0.11, 0.08], [0.11, 0.16], [0, 0.16]], 18), steel); l.rotation.x = Math.PI / 2; l.position.set(sx, 1.75, 1.2); g.add(l);
  }
  // tubular skids and ballast
  for (const sx of [-0.85, 0.85]) {
    g.add(mesh(tube([[sx, 0.12, -1.7], [sx, 0.08, -1.2], [sx, 0.08, 1.4], [sx, 0.2, 1.95]], 0.05, 20), steel));
    for (const z of [-1.0, 1.0]) g.add(mesh(tube([[sx, 0.1, z], [sx * 0.9, 0.6, z]], 0.035, 4), steel));
    const ball = mesh(rbox(0.22, 0.18, 0.9, 0.05), dark); ball.position.set(sx * 0.7, 0.32, -0.2); g.add(ball);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), std({ roughness: 0.5, map: canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = "#f2c94c"; c.fillRect(0, 0, w, h); c.fillStyle = "#1b1b1b"; c.font = "800 40px Onest, sans-serif"; c.textAlign = "center"; c.fillText(t("nerpa_plate"), w / 2, 46);
  }) }));
  plate.position.set(0.96, 2.1, 0.3); plate.rotation.y = Math.PI / 2; g.add(plate);
  return g;
}

// ------------------------------------------------------------------ the scene
export function createDeck(view, { lifeLabel = "" } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1626, 0.00042);
  const moonDir = new THREE.Vector3(-0.38, 0.33, 0.86).normalize();     // south-south-west, low: the moon path runs to the crash site
  scene.add(createSky(moonDir));
  const sea = createSea(moonDir);
  scene.add(sea);
  scene.add(new THREE.HemisphereLight(0x51648c, 0x0b0f14, 0.55));
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
  const wallPiece = (w, h, d, x, y, z) => { const m = mesh(rbox(w, h, d, 0.05), whitePaint); m.position.set(x, y, z); house.add(m); return m; };
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
      const coaming = mesh(rbox(door[1] - door[0] + 0.1, 0.12, 0.22, 0.04), greyPaint); coaming.position.set((door[0] + door[1]) / 2, 0.06, z); house.add(coaming);
    }
  }
  function wallZ(x, z0, z1, wins) {
    const sill = 1.05, lint = 2.15, T = 0.16;
    const piece = (len, h, zc, y) => { const m = mesh(rbox(T, h, len, 0.05), whitePaint); m.position.set(x, y, zc); house.add(m); };
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
  const roof = mesh(rbox(2 * HX + 0.6, 0.22, HZ1 - HZ0 + 0.6, 0.08), whitePaint); roof.position.set(0, HH + 0.1, (HZ0 + HZ1) / 2); house.add(roof);
  const ceiling = mesh(new THREE.PlaneGeometry(2 * HX - 0.2, HZ1 - HZ0 - 0.2).rotateX(Math.PI / 2), std({ color: 0x3c3e40, roughness: 0.9 }), { cast: false }); ceiling.position.set(0, HH - 0.01, (HZ0 + HZ1) / 2); house.add(ceiling);
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
  // the bridge at night: dim red light (keeps the eyes used to the dark) and the screens' glow
  const redLight = new THREE.PointLight(0xff4a3a, 1.6, 9, 1.4); redLight.position.set(0, 2.6, (HZ0 + HZ1) / 2); house.add(redLight);
  const screenLight = new THREE.PointLight(0x7fd8ff, 1.2, 5, 1.5); screenLight.position.set(0, 1.6, HZ1 - 1.2); house.add(screenLight);
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
  // the searchlight on the roof, its beam on the water over the bow (it finds the seat)
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
  const nerpa = deckNerpa();
  nerpa.position.set(0.6, 0.62, -10.2); nerpa.rotation.y = Math.PI;      // her dome faces the stern, ready to go over
  ship.add(nerpa);
  const cradle = new THREE.Group(); cradle.position.set(0.6, 0, -10.2); ship.add(cradle);
  for (const sx of [-0.95, 0.95]) for (const z of [-1.2, 1.2]) {
    cradle.add(at(mesh(rbox(0.16, 0.62, 0.16, 0.04), greyPaint), sx, 0.31, z));
    cradle.add(at(mesh(rbox(0.32, 0.08, 0.36, 0.03), rubber), sx, 0.64, z));
  }
  for (const sx of [-0.95, 0.95]) cradle.add(at(mesh(rbox(0.14, 0.12, 2.7, 0.04), greyPaint), sx, 0.12, 0));
  for (const z of [-1.2, 1.2]) cradle.add(at(mesh(rbox(2.0, 0.12, 0.14, 0.04), greyPaint), 0, 0.12, z));
  // the lift cable from the sheave to the eye on Nerpa's back (slack, swinging a little)
  const cablePts = () => {
    const top = new THREE.Vector3(0, sheave.position.y - 0.4, sheave.position.z).add(aframe.position);
    const eyeP = new THREE.Vector3(0.6, 0.62 + 3.0, -10.2 + 0.25);
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
    const sl = new THREE.SpotLight(0xffd8a8, 26, 26, 0.75, 0.6, 1.4);
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
  const binoBracket = new THREE.Group(); binoBracket.position.set(HX + 0.32, 1.12, HZ1 + 0.25); ship.add(binoBracket);
  binoBracket.add(at(mesh(rbox(0.42, 0.04, 0.3, 0.015), darkSteel), 0, 0, 0));
  binoBracket.add(at(mesh(rbox(0.04, 0.3, 0.3, 0.015), darkSteel), -0.21, -0.14, 0));
  const binos = binocularsModel(); binos.position.set(0.02, 0.05, 0); binos.rotation.y = 0.4; binoBracket.add(binos);
  const binoLamp = new THREE.PointLight(0xffd8a0, 0.9, 2.2, 1.6); binoLamp.position.set(HX + 0.2, 1.9, HZ1 + 0.5); ship.add(binoLamp);

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

  // ---------------- the crash site to the south (world coordinates; the ship stays near the origin)
  const south = new THREE.Group(); scene.add(south);
  function patrolBoat(seed) {
    const b = new THREE.Group();
    const h = mesh(lathe([[0, -9], [1.6, -7.5], [2.4, -3], [2.5, 3], [2.0, 8], [0, 10]], 20), paint(0x4a5560, { seed }), { cast: false });
    h.rotation.x = Math.PI / 2; h.scale.set(1, 1, 0.45); h.position.y = 0.3; b.add(h);
    b.add(at(mesh(rbox(3, 2.2, 5, 0.3), paint(0xd8d8d0, { seed: seed + 1 }), { cast: false }), 0, 2.1, -1));
    b.add(at(glowSprite(0xfff4dc, 7, 2.2), 0, 5.5, 0));
    b.add(at(glowSprite(0xff2a20, 4, 2.2), -2.4, 2, 2));
    b.add(at(glowSprite(0x20ff60, 4, 2.2), 2.4, 2, 2));
    const strobe = glowSprite(0x3a6cff, 10, 3); strobe.position.y = 4.4; b.add(strobe);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 60, 20, 1, true), beamMaterial(0xdfe8ff, 0.07));
    beam.geometry.translate(0, -30, 0); beam.position.set(0, 3.5, 4); beam.rotation.x = -1.35; b.add(beam);
    b.userData = { strobe, beam, seed };
    return b;
  }
  function beamMaterial(hex, k) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uCol: { value: new THREE.Color(hex) }, uK: { value: k } },
      vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform vec3 uCol; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { float edge = pow(abs(dot(vN, vV)), 1.5); float along = pow(vUv.y, 1.6); gl_FragColor = vec4(uCol * uK * edge * along * 4.0, 1.0); }",
    });
  }
  const boats = [[-320, 1520, 0.4, 51], [260, 1880, -0.8, 53], [640, 1300, 2.0, 55]].map(([x, z, ry, seed]) => {
    const b = patrolBoat(seed); b.position.set(x, 0, z); b.rotation.y = ry; south.add(b); return b;
  });
  // the helicopter circles low with its searchlight on the water
  const heli = new THREE.Group(); south.add(heli);
  const hbody = mesh(lathe([[0, -3.2], [0.9, -2.6], [1.3, -1], [1.3, 1.2], [0.7, 2.6], [0.25, 6], [0, 6.2]], 18), paint(0x2c3a46, { seed: 61 }), { cast: false });
  hbody.rotation.x = -Math.PI / 2; heli.add(hbody);
  const rotor = new THREE.Mesh(new THREE.CircleGeometry(6.5, 32), new THREE.MeshBasicMaterial({ color: 0x0a0d10, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  rotor.rotation.x = -Math.PI / 2; rotor.position.y = 1.6; heli.add(rotor);
  const heliRed = glowSprite(0xff2a1a, 5, 3); heliRed.position.y = 1.4; heli.add(heliRed);
  const heliWhite = glowSprite(0xfff4e0, 4, 2.4); heliWhite.position.set(0, -1.2, -3); heli.add(heliWhite);
  const heliBeam = new THREE.Mesh(new THREE.ConeGeometry(14, 1, 24, 1, true), beamMaterial(0xf4f6ff, 0.11));
  heliBeam.geometry.translate(0, -0.5, 0); south.add(heliBeam);
  const poolMat = new THREE.MeshBasicMaterial({ map: SOFT, color: new THREE.Color(0xdfe8ff).multiplyScalar(0.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat); south.add(pool);
  // the kerosene slick: a thin film with rainbow colours where the moonlight falls on it
  const slick = new THREE.Mesh(new THREE.PlaneGeometry(260, 180, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uMoon: { value: moonDir } },
    vertexShader: "varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uMoon; varying vec2 vUv; varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float n = vn(vUv * 5.0 + uTime * 0.01) * 0.6 + vn(vUv * 13.0) * 0.4;
        float blob = 1.0 - smoothstep(0.55, 0.95, length(p * vec2(1.0, 1.25)) + (n - 0.5) * 0.6);
        float film = vn(vUv * 9.0 + vec2(uTime * 0.02, 0.0)) * 6.0 + length(p) * 4.0;
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (film + vec3(0.0, 0.33, 0.67)));
        vec3 v = normalize(cameraPosition - vW);
        vec3 r = reflect(-v, vec3(0.0, 1.0, 0.0));
        float lit = 0.25 + 1.8 * pow(max(dot(r, uMoon), 0.0), 6.0);
        gl_FragColor = vec4(rainbow * lit * 0.55 + vec3(0.04, 0.05, 0.06), blob * 0.85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  slick.position.set(-60, 0.05, 560); south.add(slick);
  // a row of passenger seats afloat, close enough to make out with the binoculars, in our searchlight's pool
  const seat = new THREE.Group(); south.add(seat);
  const blue = std({ color: 0x4a7fc8, roughness: 0.7 }), cover = std({ color: 0xf2efe6, roughness: 0.8 });
  const frameM = std({ color: 0xb8c0c6, metalness: 0.8, roughness: 0.35 });
  for (const sx of [-0.56, 0, 0.56]) {
    seat.add(at(mesh(rbox(0.5, 0.14, 0.52, 0.06), blue), sx, 0, 0));
    const back = mesh(rbox(0.5, 0.72, 0.13, 0.06), blue); back.position.set(sx, 0.28, -0.3); back.rotation.x = -1.15; seat.add(back);
    const head = mesh(rbox(0.42, 0.04, 0.2, 0.015), cover); head.position.set(sx, 0.5, -0.62); head.rotation.x = -1.15; seat.add(head);
  }
  for (const sx of [-0.83, -0.28, 0.28, 0.83]) seat.add(at(mesh(rbox(0.05, 0.08, 0.5, 0.02), frameM), sx, 0.1, 0));
  seat.add(at(mesh(rbox(1.7, 0.06, 0.08, 0.02), frameM), 0, -0.06, 0.15));
  const SEAT_AT = new THREE.Vector3(18, 0, 150);
  seat.position.copy(SEAT_AT);
  const seatLight = new THREE.SpotLight(0xfff4e0, 9000, 400, 0.035, 0.5, 1.2); scene.add(seatLight, seatLight.target);
  const ourPool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat.clone()); ourPool.material.color.setRGB(0.55, 0.52, 0.46); scene.add(ourPool);

  // ---------------- colliders, walk area, interactables (ship-local, metres)
  const colliders = [
    [-HX - 0.1, HZ0 - 0.12, -0.62, HZ0 + 0.12], [0.62, HZ0 - 0.12, HX + 0.1, HZ0 + 0.12],      // the back wall either side of the door
    [-HX - 0.12, HZ0, -HX + 0.12, HZ1], [HX - 0.12, HZ0, HX + 0.12, HZ1],                      // side walls
    [-HX, HZ1 - 0.15, HX, HZ1 + 0.15], [-3.05, HZ1 - 1.0, 3.05, HZ1],                          // front wall, console
    [0.65, HZ1 - 2.3, 1.15, HZ1 - 1.75],                                                        // the chair
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
    binoculars: { show: [binoBracket], hit: proxy(0.6, 0.5, 0.6, HX + 0.32, 1.15, HZ1 + 0.25), stand: [HX + 0.55, HZ1 + 1.3], look: [HX + 0.32, 1.15, HZ1 + 0.25] },
    stairs: { show: [comp], hit: proxy(1.4, 1.4, 1.9, -2.2, 0.7, 1.3), stand: [-2.2, -0.35], look: [-2.2, 0.6, 0.45] },
    nerpa: { show: [nerpa, cradle], hit: proxy(2.6, 3.2, 4.2, 0.6, 1.6, -10.2), stand: [0.6, -7.4], look: [0.6, 1.8, -10.2] },
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
    // the crash site
    for (const b of boats) {
      const s = b.userData.seed;
      b.position.y = seaHeight(b.position.x, b.position.z, time) * 0.6;
      b.rotation.z = Math.sin(time * 0.7 + s) * 0.05;
      b.userData.strobe.material.opacity = (Math.sin(time * 7 + s) > 0.6) ? 1 : 0;
      b.userData.beam.rotation.z = Math.sin(time * 0.3 + s) * 0.6;
    }
    const ha = time * 0.09;
    heli.position.set(80 + Math.cos(ha) * 170, 95 + Math.sin(time * 0.4) * 4, 1050 + Math.sin(ha) * 120);
    heli.rotation.y = -ha;
    heli.rotation.z = 0.12;
    rotor.rotation.z = time * 30;
    heliRed.material.opacity = Math.sin(time * 4) > 0.3 ? 1 : 0.1;
    const spot = tmp.set(heli.position.x + Math.cos(time * 0.23) * 35, 0.2, heli.position.z + 40 + Math.sin(time * 0.31) * 30);
    const hb = heliBeam;
    hb.position.copy(heli.position).add(new THREE.Vector3(0, -1.5, 0));
    const dir = spot.clone().sub(hb.position); const len = dir.length();
    hb.scale.set(1, len, 1);
    hb.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    pool.position.copy(spot); pool.scale.setScalar(36);
    // the floating seat and our searchlight on it
    seat.position.y = seaHeight(SEAT_AT.x, SEAT_AT.z, time) + 0.05;
    seat.rotation.set(Math.sin(time * 0.8) * 0.15, 0.6 + Math.sin(time * 0.13) * 0.2, Math.cos(time * 0.7) * 0.12);
    const from = search.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0));
    const aim = SEAT_AT.clone().add(new THREE.Vector3(Math.sin(time * 0.21) * 1.2, 0, Math.cos(time * 0.17) * 1.2));
    ourPool.position.set(aim.x, 0.15 + seaHeight(aim.x, aim.z, time), aim.z); ourPool.scale.setScalar(9);
    seatLight.position.copy(from); seatLight.target.position.copy(aim);
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
    /** World points the binoculars can find: the helicopter and the boats, the slick and the seat. */
    targets: {
      rescue: () => [heli.position, ...boats.map((b) => b.position)],
      wreck: () => [SEAT_AT, slick.position],
      seat: SEAT_AT, heli: heli.position, slick: slick.position,
    },
    set radioCalling(on) { radioCall = on; },
    spawn: { x: 0.2, z: -6.6, yaw: 0 },
  };
}
const tmpInv = new THREE.Matrix4();
