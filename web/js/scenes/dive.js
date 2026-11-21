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
import { t } from "../strings.js";
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
const O2_MAX = 60, SEARCH_R = 17, TETHER = 24;

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
      attribute float aS; varying float vB;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 d = wp.xyz - uLP; float dist = max(length(d), 0.001); float c = dot(d / dist, uLD);
        float cone = smoothstep(uCos - 0.05, uCos + 0.08, c) / (1.0 + dist * dist * 0.05) * uOn;
        vec4 mv = viewMatrix * wp; float z = max(0.25, -mv.z);
        vB = (uAmb + cone * 1.8) * exp(-z * 0.06);
        gl_PointSize = aS * uPR * (7.0 / z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uStreak; varying float vB;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        p.y *= 1.0 - uStreak * 0.75;                       // moving fast: flakes stretch into short streaks
        float a = smoothstep(0.5, 0.05, length(p));
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

/** The real "Nerpa-2" at full size. */
function realNerpa() {
  const g = new THREE.Group();
  const yel = std({ color: 0xf2b632, roughness: 0.4, metalness: 0.25 });
  const steel = std({ color: 0x9aa2a8, metalness: 0.85, roughness: 0.35 });
  const glassM = std({ color: 0x0c2a33, roughness: 0.05, metalness: 0.6, emissive: 0x0a3a44 });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 40, 28), yel));
  const port = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), glassM);
  port.position.set(0, 0.05, -0.95); port.scale.z = 0.5; g.add(port);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 10, 30), steel);
  ring.position.set(0, 0.05, -1.02); g.add(ring);
  for (const sx of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 20), std({ color: 0xe8e2d4, roughness: 0.5 }));
    tank.rotation.x = Math.PI / 2; tank.position.set(sx * 1.2, -0.75, 0); g.add(tank);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), steel); leg.position.set(x * 1.05, -0.6, z * 0.9); g.add(leg);
  }
  const skid = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.2), steel); skid.position.y = -1.4; g.add(skid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 20), yel); top.position.y = 1.15; g.add(top);
  const nm = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = "#f2b632"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#1b1b1b"; c.font = "700 40px Manrope, sans-serif"; c.textAlign = "center"; c.fillText(t("nerpa_plate"), w / 2, 46);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), std({ map: nm, roughness: 0.5 }));
  plate.position.set(0.62, 0.5, -0.86); plate.rotation.y = 0.6; g.add(plate);
  const lamps = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.22, 14), steel);
    l.rotation.x = Math.PI / 2; l.position.set(sx * 0.7, -0.35, -1.05); g.add(l);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: new THREE.Color(0xdff2ff).multiplyScalar(4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.setScalar(1.3); glow.position.set(sx * 0.7, -0.35, -1.2); g.add(glow);
    const sl = new THREE.SpotLight(0xdff2ff, 0, 18, 0.45, 0.5, 1.3);
    sl.position.copy(glow.position); sl.target.position.set(sx * 0.7, -3, -8); g.add(sl, sl.target);
    lamps.push({ glow, sl });
  }
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 40, 5), std({ color: 0x111111 }));
  cable.position.y = 21.3; g.add(cable);
  // a column of bubbles from the vents
  const N = 240, bp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) bp.set([(Math.random() - 0.5) * 2.2, 1 + Math.random() * 13, (Math.random() - 0.5) * 2.2], i * 3);
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
  const bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ map: soft, color: 0xcfefff, size: 0.14, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  bubbles.frustumCulled = false; g.add(bubbles);
  g.userData = { lamps, bp, bg };
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
  surf.add(nerpa);
  const surfPlane = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, uniforms: { uT: { value: 0 } },
    vertexShader: "varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      uniform float uT; varying vec2 vP;
      float hh(vec2 p) { return sin(p.x * 0.9 + uT * 1.3) * sin(p.y * 0.8 - uT * 1.1) + 0.5 * sin(p.x * 2.1 - uT * 2.0 + p.y * 1.7); }
      void main() {
        float r = length(vP); float flood = exp(-r * r * 0.0035); float rip = 0.5 + 0.5 * hh(vP * 0.6);
        vec3 c = mix(vec3(0.015, 0.07, 0.1), vec3(0.5, 0.72, 0.78), flood * (0.5 + 0.5 * rip));
        c += vec3(0.9, 0.96, 1.0) * pow(rip, 6.0) * flood * 0.7;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  surfPlane.rotation.x = Math.PI / 2; surfPlane.position.y = 14;
  surf.add(surfPlane);
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

  // ---- the seabed at 3 400 m
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
  const cone = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
      void main() { vH = position.z / ${CH.toFixed(1)}; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vH; varying vec3 vN; varying vec3 vV;
      void main() { float edge = pow(abs(dot(vN, vV)), 1.6); float a = 0.085 * pow(1.0 - vH, 1.7) * edge; gl_FragColor = vec4(0.72, 0.9, 1.0, a); }`,
  }));
  cone.visible = false;
  deep.add(cone);

  // the flight recorder: orange casing with a label and a blinking beacon
  const box = new THREE.Group();
  {
    const label = canvasTexture(512, 256, (c, w, h) => {
      c.fillStyle = "#e8692b"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#f3efe6"; c.fillRect(0, 34, w, 22); c.fillRect(0, h - 56, w, 22);
      c.fillStyle = "#1b1b1b"; c.font = "700 38px Manrope, sans-serif"; c.textAlign = "center";
      c.fillText(t("box_label1"), w / 2, 122); c.font = "600 30px Manrope, sans-serif"; c.fillText(t("box_label2"), w / 2, 168);
    });
    const side = std({ color: 0xe8692b, roughness: 0.45, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.46), [side, side, side, side, std({ map: label, roughness: 0.45 }), side]);
    body.castShadow = true; box.add(body);
    const ulb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 16), std({ color: 0x8e9296, metalness: 0.9, roughness: 0.3 }));
    ulb.rotation.z = Math.PI / 2; ulb.position.set(0.46, -0.08, 0); box.add(ulb);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(5) }));
    led.position.set(0.63, -0.08, 0); box.add(led);
    const ll = new THREE.PointLight(0xff3020, 0, 3.5, 2); ll.position.copy(led.position); box.add(ll);
    box.userData = { led, ll };
  }
  box.visible = false;
  deep.add(box);
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
    D = { x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0, turn: 0, o2: O2_MAX, found: false, grabT: 0, cov: new Set(), pingCD: 0,
          pingerT: 0.6, seen: new Set(), creakT: 4, heartT: 0, tether: 0, shake: 0, desc: 0, t0: 0, tick: 0,
          hasBox: !!sceneInfo.box, hasDebris: !!sceneInfo.debris, debrisSeen: false };
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
    cockpit.set({ o2: D.o2, max: O2_MAX, fog: 0, low: false, depth: 0 });
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

  async function descend() {
    mode = "descent";
    D.y = bedH(0, 0) + 22;
    top.intensity = 1.8; top.color.set(0x3f86a8);
    deep.fog.color.set(0x02161f); deep.fog.density = 0.082; deep.background.set(0x010a10);
    snow.mat.uniforms.uAmb.value = 0.045; snow.mat.uniforms.uOn.value = 1;
    spot.intensity = 0; cone.visible = false; D.desc = 1;
    cockpit.show(); document.body.classList.add("diving");
    sfx.underwater(true);
    cockpit.msg(t("dv_descent", { m: "3 400" }), 2600);
    setTimeout(() => { sfx.clack(); spot.intensity = 60; cone.visible = true; cockpit.msg(t("dv_light"), 1600); }, 1500);
    const y0 = D.y, y1 = bedH(0, 0) + 1.8;
    await anim(5.5, (k) => {
      D.y = y0 + (y1 - y0) * ease(k); top.intensity = 1.8 * (1 - k);
      D.shake = 0.03 * (1 - k) + (k > 0.92 ? (1 - k) * 0.4 : 0); D.desc = 1 - k;
      cockpit.set({ depth: 3400 - (D.y - bedH(0, 0)) * 9 - (1 - k) * 2400 });
      if (Math.random() < 0.02) sfx.bubbles(2);
    });
    D.shake = 0; D.desc = 0;
    sfx.creak(); sfx.thud();
    cockpit.msg(t("dv_bottom"), 3600);
    mode = "dive"; D.t0 = T; cockpit.live(true);
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
      cockpit.set({ o2: D.o2, max: O2_MAX, fog: clamp((16 - D.o2) / 16, 0, 0.85), depth: 3400 - bedH(D.x, D.z) * 9, low: D.o2 < 12 });
    }
    if (D.o2 < 12 && (D.heartT -= dt) <= 0) { D.heartT = 0.85; sfx.heart(); }
    if ((D.creakT -= dt) <= 0) { D.creakT = 6 + Math.random() * 7; sfx.creak(); }
    // where the light points: what is seen, what can be grabbed, how much seabed is covered
    const aimYaw = D.yaw - mx * 0.62, aimPitch = clamp(-0.36 - my * 0.55, -1.1, 0.25);
    aimDir.set(-Math.sin(aimYaw) * Math.cos(aimPitch), Math.sin(aimPitch), -Math.cos(aimYaw) * Math.cos(aimPitch));
    const bp = box.position, dx = bp.x - D.x, dy = bp.y - D.y, dz = bp.z - D.z, dist = Math.hypot(dx, dy, dz);
    const dot = (dx * aimDir.x + dy * aimDir.y + dz * aimDir.z) / Math.max(0.001, dist);
    if (box.visible && !D.found && dist < 8.5 && dot > Math.cos(0.46)) { D.found = true; sfx.seen(); cockpit.msg(t("dv_seen_box"), 3800); }
    for (const g of debris) {
      if (!g.visible || D.seen.has(g)) continue;
      const ex = g.position.x - D.x, ez = g.position.z - D.z, ey = g.position.y - D.y, ed = Math.hypot(ex, ey, ez);
      if (ed < 8 && (ex * aimDir.x + ey * aimDir.y + ez * aimDir.z) / ed > Math.cos(0.5)) {
        D.seen.add(g); if (D.hasDebris) D.debrisSeen = true; sfx.seen(); cockpit.msg(t(g.userData.key), 3400);
      }
    }
    const canGrab = D.found && dist < 3.3 && dot > Math.cos(0.7);
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
    spot.target.position.copy(spot.position).addScaledVector(aimDir, 10);
    cone.position.copy(spot.position); cone.lookAt(spot.target.position);
    snow.mat.uniforms.uLP.value.copy(spot.position); snow.mat.uniforms.uLD.value.copy(aimDir);
    const on = Math.sin(T * 6) > 0.6; box.userData.led.visible = on; box.userData.ll.intensity = on ? 4 : 0;
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
    camera.attach(box);
    const b0 = box.position.clone(), b1 = new THREE.Vector3(0.25, -0.42, -1.1);
    await anim(1.2, (k) => box.position.lerpVectors(b0, b1, ease(k)));
    sfx.found(); cockpit.msg(t("dv_got_box"), 3000);
    await ascend();
    finish({ found: true });
  }

  let rise = 0;
  view.onFrame((dt, time) => {
    if (!active) return;
    T += dt;
    if (mode === "dive") update(dt);
    if (mode === "dive" || mode === "descent" || mode === "ending") {
      placeCamera(); cockpit.drawScope(T);
      life.update(dt, T, D, mode === "dive" && (keys.f || keys.b));
    }
    rise = mode === "descent" ? D.desc * 3.5 : 0;
    snow.mat.uniforms.uStreak.value = clamp(Math.hypot(D.vx || 0, D.vz || 0) * 0.5 + (D.desc || 0), 0, 1);
    snow.update(dt, time, camera.position, rise);
    surfPlane.material.uniforms.uT.value = time;
  });
  let active = false;

  /**
   * The first-person search. sceneInfo = {box, debris} from Python. fadeIn() reveals the screen.
   * Resolves {found, coverage, debrisSeen} when the bathyscaphe is back at the surface (screen dark).
   */
  async function search(sceneInfo, fadeIn, fadeOut) {
    active = true;
    view.useScene(deep);
    surf.visible = false;
    camera.rotation.order = "YXZ";
    camera.fov = 42; camera.updateProjectionMatrix();
    setup(sceneInfo);
    placeCamera();
    const done = new Promise((r) => { finish = r; });
    await fadeIn();
    descend();
    const res = await done;
    await fadeOut();
    if (box.parent !== deep) deep.attach(box);
    cockpit.hide(); document.body.classList.remove("diving");
    sfx.underwater(false);
    mode = "off";
    return { found: res.found, coverage: D.cov.size / COVN, debrisSeen: D.debrisSeen, seconds: T - D.t0, o2Left: Math.max(0, D.o2) };
  }

  /** Part 1: the real Nerpa sinks past the camera; resolves when the screen is dark again. */
  async function surfaceShot(fadeIn) {
    active = true;
    view.useScene(deep);
    const Y0 = 60;
    surf.position.set(0, Y0, 0); surf.visible = true;
    deep.fog.color.set(0x0b2c3c); deep.fog.density = 0.026; deep.background.set(0x08283a);
    top.color.set(0x7fb8d8); top.intensity = 3.4;
    snow.mat.uniforms.uOn.value = 0; snow.mat.uniforms.uAmb.value = 0.3;
    nerpa.position.set(0, 11, 0); nerpa.rotation.set(0, 0.5, 0);
    nerpa.userData.lamps.forEach((l) => { l.glow.material.opacity = 0; l.sl.intensity = 0; });
    const camAt = (k) => {
      camera.position.set(4.6 - k * 1.3, Y0 - 1 - k * 9.5, 7 - k * 2);
      camera.lookAt(nerpa.position.x, Y0 + nerpa.position.y - 0.3, nerpa.position.z);
    };
    camAt(0);
    await fadeIn();
    let lit = false;
    await anim(7.5, (k) => {
      nerpa.position.y = 11 - ease(k) * 24; nerpa.rotation.y = 0.5 + k * 0.6; nerpa.rotation.z = Math.sin(k * 6) * 0.04;
      camAt(k);
      for (const m of shafts) m.material.opacity = (0.25 + 0.2 * Math.sin(performance.now() / 1250 + m.userData.ph)) * (1 - k * 0.7);
      top.intensity = 3.4 * (1 - k * 0.85); deep.fog.density = 0.026 + k * 0.035;
      snow.mat.uniforms.uAmb.value = 0.3 * (1 - k) + 0.045;
      if (!lit && k > 0.3) { lit = true; nerpa.userData.lamps.forEach((l) => { l.glow.material.opacity = 0.9; l.sl.intensity = 30; }); }
      const bp = nerpa.userData.bp;
      for (let i = 1; i < bp.length; i += 3) { bp[i] += 0.06; if (bp[i] > 14) bp[i] = 1; }
      nerpa.userData.bg.attributes.position.needsUpdate = true;
    });
  }

  /** Back to the table scene. */
  function leave() {
    active = false;
    surf.visible = false;
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

  return { deep, surfaceShot, search, leave, debugFaceBox };
}
