// The captain's cabin around the chart table (CLAUDE.md v3.1, 21.1 p. 6; v3 4.3): the table does not
// hang in emptiness. Plank floor and walls, ceiling beams, two portholes with the night sea and the
// moon, a green radio on a cabinet, the ship's wheel and a chart of the Caspian on the walls,
// a barrel, the brass lamp over the table with dust floating in its light.
// Scale: the chart sheet (12 units) is about a metre, so the room is about 5 x 5.5 m.
// The walls are light-grey painted steel with welded seams and rivets (a ship, not a log cabin); the floor
// stays wooden; the light inside is warm, the moon through the portholes cold.
import * as THREE from "three";
import { canvasTexture, rng } from "../view.js";
import { walnut, brass, glass, steelPanel, watertightDoor } from "./materials.js";
import { t } from "../i18n.js";
import { cabinProps, mergeByMaterial } from "./cabin_props.js";
import { makePerson } from "./crew.js";
import { W as WX } from "../weather.js";      // (W is the cabin width below)

export const FLOOR_Y = -10;
const CEIL_Y = 18, X0 = -30, X1 = 30, Z0 = -38, Z1 = 30;

const std = (o) => new THREE.MeshStandardMaterial(o);
function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

/** The sea through a porthole, alive with the weather (weather.js): the sky with clouds and the moon or the dawn,
 *  the horizon rolling with the ship, the swell with whitecaps, lightning, rain running down the glass. */
const portholeUniforms = { uT: { value: 0 }, uSeed: { value: 0 }, uCloud: { value: 0.1 }, uRain: { value: 0 }, uFlash: { value: 0 },
  uAmp: { value: 1 }, uFog: { value: 0 }, uSun: { value: 0 }, uMoon: { value: 1 }, uRoll: { value: 0 }, uFogCol: { value: new THREE.Color() } };
function portholeMaterial(seed) {
  const u = { ...portholeUniforms, uSeed: { value: seed } };
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      uniform float uT, uSeed, uCloud, uRain, uFlash, uAmp, uFog, uSun, uMoon, uRoll; uniform vec3 uFogCol; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
      void main() {
        vec2 p = vUv - 0.5;
        // rain on the glass: drops that run down and smear what is behind them
        float drops = 0.0; vec2 off = vec2(0.0);
        if (uRain > 0.01) {
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            vec2 g = vec2(p.x * (9.0 + fi * 4.0), p.y * 3.0 + uT * (0.25 + fi * 0.12) + hash(vec2(floor(p.x * (9.0 + fi * 4.0)), fi)) * 7.0);
            vec2 c = fract(g) - 0.5; float on = step(0.72, hash(floor(g) + fi));
            float head = smoothstep(0.12, 0.05, length(c * vec2(1.0, 2.4) + vec2(0.0, 0.12)));       // a drop ...
            float trail = smoothstep(0.035, 0.0, abs(c.x)) * smoothstep(-0.1, 0.45, c.y) * 0.35;     // ... and its wet trail above
            drops += (head + trail) * on; off += c * head * on * 0.05;
          }
          drops *= uRain; off *= uRain;
        }
        vec2 q = p + off;
        float a = uRoll; q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
        float hor = 0.02 + sin(uT * 0.5 + uSeed) * 0.015 * uAmp;
        vec3 col;
        if (q.y > hor) {          // the sky
          float up = (q.y - hor) * 2.0;
          col = mix(vec3(0.1, 0.17, 0.3), vec3(0.02, 0.04, 0.1), up);
          vec2 mp = vec2(0.12 * sin(uSeed), 0.28);
          col += vec3(0.9, 0.92, 1.0) * (smoothstep(0.045, 0.04, length(q - mp)) + 0.25 * exp(-length(q - mp) * 9.0)) * uMoon;
          col = mix(col, mix(vec3(1.0, 0.6, 0.35), vec3(0.45, 0.55, 0.75), up), uSun);
          float n = fbm(q * vec2(4.0, 9.0) + vec2(uT * 0.02, 0.0) + uSeed);
          float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud * 0.5, n + uCloud * 0.3);
          col = mix(col, uFogCol * 1.5 + vec3(0.6, 0.65, 0.75) * uFlash * (0.6 + n), cov);
        } else {                  // the sea
          float d = (hor - q.y) * 6.0 + 0.05;
          float w = fbm(vec2(q.x * 14.0 / d + uT * 0.4, 1.0 / d * 3.0 + uT * 0.6) + uSeed);
          col = mix(vec3(0.02, 0.05, 0.09), vec3(0.06, 0.1, 0.16), w);
          col = mix(col, vec3(0.5, 0.55, 0.6), smoothstep(0.62, 0.8, w) * smoothstep(1.2, 2.2, uAmp));      // whitecaps
          col += vec3(0.8, 0.85, 0.95) * pow(w, 6.0) * uMoon * 0.6 * smoothstep(0.2, 0.0, abs(q.x - 0.12 * sin(uSeed)));
          col = mix(col, vec3(0.8, 0.45, 0.25) * 0.5, uSun * 0.6);
          col += vec3(0.4, 0.45, 0.55) * uFlash * 0.4;
        }
        col = mix(col, uFogCol * 1.4, uFog * (0.6 + 0.4 * smoothstep(0.0, 0.2, abs(q.y - hor))));
        col += vec3(0.16, 0.19, 0.22) * drops;
        col *= 1.0 + uFlash * 1.5;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
function caspianChart() {
  return canvasTexture(512, 360, (g, w, h) => {
    g.fillStyle = "#e6d6b0"; g.fillRect(0, 0, w, h);
    const r = rng(77);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(90,60,30,${r() * 0.06})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = "rgba(60,45,30,.35)"; g.lineWidth = 1;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); }
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); }
    // land all round, the Caspian Sea in the middle (CLAUDE.md 22.1): the flight path Astana -> Tbilisi
    g.fillStyle = "rgba(201,180,138,.85)"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#d9e2d6"; g.strokeStyle = "#5a4630"; g.lineWidth = 2;
    const sea = [[0.42, 0.06], [0.5, 0.1], [0.58, 0.16], [0.6, 0.27], [0.55, 0.33], [0.62, 0.42], [0.66, 0.55], [0.6, 0.6],
                 [0.62, 0.74], [0.6, 0.88], [0.52, 0.96], [0.44, 0.94], [0.42, 0.8], [0.38, 0.66], [0.43, 0.55], [0.4, 0.44],
                 [0.36, 0.33], [0.33, 0.2], [0.37, 0.1]];
    g.beginPath(); sea.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h))); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = "#a8392a"; g.lineWidth = 3; g.setLineDash([8, 6]);
    g.beginPath(); g.moveTo(0.92 * w, 0.08 * h); g.quadraticCurveTo(0.7 * w, 0.4 * h, 0.52 * w, 0.78 * h); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.arc(0.52 * w, 0.78 * h, 9, 0, 7); g.stroke();
    g.fillStyle = "#3a2c1c"; g.font = 'italic 700 26px "Cormorant Garamond", Georgia, serif'; g.textAlign = "center";
    g.fillText("Mare Caspium", w / 2, 34);
  });
}

export function createCabin(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const W = X1 - X0, D = Z1 - Z0, H = CEIL_Y - FLOOR_Y;

  // floor, walls, ceiling: old planks
  const floorMat = walnut([4, 5]);
  floorMat.color.set(0x8a7464);
  const floor = mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat, false);
  floor.position.set((X0 + X1) / 2, FLOOR_Y, (Z0 + Z1) / 2);
  group.add(floor);
  const steelWall = steelPanel({ color: "#e8dfc8", seed: 23 });       // cream painted steel above the wainscot
  const wall = (w, x, z, ry) => {
    const m = mesh(new THREE.PlaneGeometry(w, H), steelWall.userData.forSize(w / 12, H / 12), false);
    m.position.set(x, FLOOR_Y + H / 2, z); m.rotation.y = ry;
    group.add(m);
  };
  wall(W, (X0 + X1) / 2, Z0, 0);
  wall(W, (X0 + X1) / 2, Z1, Math.PI);
  wall(D, X0, (Z0 + Z1) / 2, Math.PI / 2);
  wall(D, X1, (Z0 + Z1) / 2, -Math.PI / 2);
  const ceil = mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), steelWall.userData.forSize(W / 12, D / 12), false);
  ceil.position.set((X0 + X1) / 2, CEIL_Y, (Z0 + Z1) / 2);
  group.add(ceil);
  const beamMat = std({ color: 0x9a9fa2, roughness: 0.6, metalness: 0.4 });      // painted steel frames
  for (let z = Z0 + 8; z < Z1; z += 14) {                  // ceiling beams
    const b = mesh(new THREE.BoxGeometry(W, 1.6, 1.4), beamMat, false);
    b.position.set((X0 + X1) / 2, CEIL_Y - 0.8, z); group.add(b);
  }
  for (const x of [X0 + 0.7, X1 - 0.7]) for (const z of [Z0 + 0.7, -4, Z1 - 0.7]) {   // posts
    const p = mesh(new THREE.BoxGeometry(1.4, H, 1.4), beamMat, false);
    p.position.set(x, FLOOR_Y + H / 2, z); group.add(p);
  }

  // two portholes on the far wall: night sea and the moon behind thick glass in a bolted brass ring
  const ringMat = brass();
  const portGlows = [];
  for (const [x, seed] of [[-13, 3], [13, 9]]) {
    const y = 6.5, z = Z0 + 0.05;
    const view = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48), portholeMaterial(seed));
    view.position.set(x, y, z + 0.02); group.add(view);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48), glass());
    lens.position.set(x, y, z + 0.25); group.add(lens);
    const ring = mesh(new THREE.TorusGeometry(3.6, 0.45, 16, 64), ringMat);
    ring.position.set(x, y, z + 0.3); group.add(ring);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bolt = mesh(new THREE.SphereGeometry(0.22, 10, 8), ringMat);
      bolt.position.set(x + Math.cos(a) * 4.35, y + Math.sin(a) * 4.35, z + 0.25); group.add(bolt);
    }
    const glow = new THREE.PointLight(0xb4c8ec, 3, 22, 1.6);      // cool moonlight falling in (and the lightning), not violet
    glow.position.set(x, y, z + 3); group.add(glow); portGlows.push(glow);
  }

  // the green radio on a cabinet in the far-left corner (its scale glows)
  {
    const cab = mesh(new THREE.BoxGeometry(9, 9, 5), std({ color: 0x4a3020, roughness: 0.7 }));
    cab.position.set(X0 + 6, FLOOR_Y + 4.5, Z0 + 3.5); group.add(cab);
    const radio = mesh(new THREE.BoxGeometry(7, 4, 3.4), std({ color: 0x2f4a36, roughness: 0.5, metalness: 0.2 }));
    radio.position.set(X0 + 6, FLOOR_Y + 11, Z0 + 3.5); group.add(radio);
    const scale = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe08a).multiplyScalar(2.6) }));
    scale.position.set(X0 + 6, FLOOR_Y + 11.6, Z0 + 5.22); group.add(scale);
    for (const dx of [-2.2, 2.2]) {
      const knob = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 20), ringMat);
      knob.rotation.x = Math.PI / 2; knob.position.set(X0 + 6 + dx, FLOOR_Y + 10.1, Z0 + 5.3); group.add(knob);
    }
    const ant = mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), ringMat);
    ant.position.set(X0 + 8.8, FLOOR_Y + 16, Z0 + 3.5); ant.rotation.z = 0.3; group.add(ant);
    const lampR = new THREE.PointLight(0x9fe08a, 4, 14, 1.8);
    lampR.position.set(X0 + 6, FLOOR_Y + 12, Z0 + 7); group.add(lampR);
  }

  // the Caspian chart on the right wall, over the bunk, in a wooden frame (the wheel and the barrel are gone: C2)
  {
    const chartW = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), std({ map: caspianChart(), roughness: 0.9 }));
    chartW.position.set(X1 - 0.35, 8.6, -21); chartW.rotation.y = -Math.PI / 2; group.add(chartW);
    const fr = std({ color: 0x3a2214, roughness: 0.55 });
    for (const [w, h, y, z] of [[15, 0.6, 13.8, -21], [15, 0.6, 3.4, -21], [0.6, 11, 8.6, -28.2], [0.6, 11, 8.6, -13.8]]) {
      const m = mesh(new THREE.BoxGeometry(0.4, h, w === 15 ? 15 : 0.6), fr); m.position.set(X1 - 0.3, y, z); group.add(m);
    }
  }
  const props = cabinProps(group, { X0, X1, Z0, Z1, FLOOR_Y, CEIL_Y });

  // an oil lantern on the far wall between the portholes: a little warmth on the planks
  {
    const lan = new THREE.Group();
    lan.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 16), ringMat));
    const glassL = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.8, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb862).multiplyScalar(3.2) }));
    glassL.position.y = 1.1; lan.add(glassL);
    const top = mesh(new THREE.ConeGeometry(1.1, 0.9, 16), ringMat); top.position.y = 2.4; lan.add(top);
    const arm = mesh(new THREE.BoxGeometry(0.25, 0.25, 1.8), ringMat); arm.position.set(0, 2.9, -0.9); lan.add(arm);
    lan.position.set(0, 6.5, Z0 + 1.9);
    group.add(lan);
    const warm = new THREE.PointLight(0xffa850, 70, 46, 1.4);
    warm.position.set(0, 8, Z0 + 3.5);
    group.add(warm);
  }

  // the table's legs (the top is the map's table board)
  {
    const legMat = std({ color: 0x3a2416, roughness: 0.6 });
    for (const x of [-13.5, 12.5]) for (const z of [-10.8, 9.8]) {
      const leg = mesh(new THREE.BoxGeometry(1.6, -FLOOR_Y - 1.2, 1.6), legMat);
      leg.position.set(x, FLOOR_Y + (-FLOOR_Y - 1.2) / 2, z); group.add(leg);
    }
  }

  // the companionway up to the deck on the near wall (M12b): a door frame, steep steps into the night
  const stairs = new THREE.Group();
  {
    const SX = 19, frameMat = std({ color: 0x3a2618, roughness: 0.7 });
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(11, 22), std({ color: 0x050608, roughness: 1 }));
    dark.position.set(SX, FLOOR_Y + 11, Z1 - 0.05); dark.rotation.y = Math.PI; stairs.add(dark);
    for (const dx of [-6, 6]) { const j = mesh(new THREE.BoxGeometry(1.2, 23, 1.6), frameMat); j.position.set(SX + dx, FLOOR_Y + 11.5, Z1 - 0.6); stairs.add(j); }
    const lintel = mesh(new THREE.BoxGeometry(13.2, 1.4, 1.6), frameMat); lintel.position.set(SX, FLOOR_Y + 23, Z1 - 0.6); stairs.add(lintel);
    const stepMat = std({ color: 0x6a4a30, roughness: 0.75 });
    for (let i = 0; i < 7; i++) { const st = mesh(new THREE.BoxGeometry(10, 0.7, 3.2), stepMat); st.position.set(SX, FLOOR_Y + 1.6 + i * 3.0, Z1 - 7 + i * 1.0); stairs.add(st); }
    for (const dx of [-5.2, 5.2]) { const rail = mesh(new THREE.CylinderGeometry(0.25, 0.25, 26, 8), ringMat); rail.position.set(SX + dx, FLOOR_Y + 12, Z1 - 4); rail.rotation.x = -0.32; stairs.add(rail); }
    const lampD = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb862).multiplyScalar(3) }));
    lampD.position.set(SX, FLOOR_Y + 21, Z1 - 1.6); stairs.add(lampD);
    const lightD = new THREE.PointLight(0xffa850, 18, 28, 1.4); lightD.position.set(SX, FLOOR_Y + 19, Z1 - 4); stairs.add(lightD);
    // a high sill in the doorway, the exit sign over it, a fire extinguisher beside it
    const sillD = mesh(new THREE.BoxGeometry(11.6, 3.6, 1.8), std({ color: 0x7b8185, roughness: 0.6, metalness: 0.4 })); sillD.position.set(SX, FLOOR_Y + 1.8, Z1 - 0.9); stairs.add(sillD);
    const signTex = canvasTexture(512, 176, (g, w, h) => {
      g.fillStyle = "#0b8a3e"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#f4fff6"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "800 62px Onest, sans-serif";
      const fit = Math.min(1, (w - 70) / g.measureText(t("sign_exit")).width);
      g.font = `800 ${Math.floor(62 * fit)}px Onest, sans-serif`;
      g.fillText(t("sign_exit"), w / 2, h / 2 + 3);
      g.strokeStyle = "#f4fff6"; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    });
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.06), new THREE.MeshBasicMaterial({ map: signTex, color: new THREE.Color(1, 1, 1).multiplyScalar(1.5) }));
    signM.position.set(SX, FLOOR_Y + 25.1, Z1 - 1.5); signM.rotation.y = Math.PI; stairs.add(signM);
    const leaf = watertightDoor({ w: 0.9, h: 1.9, open: 1.6, frame: false });       // the watertight door, swung open against the wall
    leaf.scale.setScalar(12); leaf.position.set(SX + 5.6, FLOOR_Y + 11.6, Z1 - 0.8); leaf.rotation.y = Math.PI; stairs.add(leaf);
    const fe = new THREE.Group(); fe.position.set(SX - 9, FLOOR_Y + 5, Z1 - 1.3); fe.scale.setScalar(12); stairs.add(fe);
    const red = std({ color: 0xc8231b, roughness: 0.35, metalness: 0.2 }), blackM = std({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.4 });
    fe.add(mesh(new THREE.LatheGeometry([[0, 0], [0.075, 0], [0.085, 0.02], [0.085, 0.5], [0.07, 0.56], [0.03, 0.6], [0, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), 24), red));
    const valve = mesh(new THREE.LatheGeometry([[0.025, 0], [0.025, 0.06], [0.012, 0.08], [0, 0.08]].map(([x, y]) => new THREE.Vector2(x, y)), 12), blackM); valve.position.y = 0.6; fe.add(valve);
    const hose = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.02, 0.66, 0.02], [0.1, 0.62, -0.06], [0.11, 0.3, -0.07], [0.08, 0.15, -0.06]].map((q) => new THREE.Vector3(...q))), 20, 0.012, 6), blackM); fe.add(hose);
    group.add(stairs);
  }

  // the brass lamp over the table; the scene's spotlight sits in its bulb
  const lamp = new THREE.Group(); lamp.userData.noMerge = true;     // it swings
  {
    const cord = mesh(new THREE.CylinderGeometry(0.06, 0.06, CEIL_Y - 16.2, 6), std({ color: 0x1a1612 }), false);
    cord.position.y = (CEIL_Y - 16.2) / 2 + 1.2; lamp.add(cord);
    const shade = mesh(new THREE.ConeGeometry(2.2, 1.8, 40, 1, true), (() => { const m = brass(); m.side = THREE.DoubleSide; return m; })(), false);
    shade.position.y = 0.3; lamp.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(8) }));
    bulb.position.y = -0.35; lamp.add(bulb);
    lamp.position.set(-1.2, 15.35, -1.8);
    group.add(lamp);
  }

  // dust in the lamp's light
  const N = 420, pos = new Float32Array(N * 3), seeds = new Float32Array(N);
  const r = rng(5);
  for (let i = 0; i < N; i++) {
    const h = 0.15 + r() * 0.75, rad = (0.4 + h * 7) * Math.sqrt(r()), a = r() * Math.PI * 2;      // inside the light cone, above the table
    pos.set([-1.2 + Math.cos(a) * rad, 15 - h * 15, -1.8 + Math.sin(a) * rad], i * 3);
    seeds[i] = r() * 100;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dustTex = canvasTexture(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,240,210,1)"); gr.addColorStop(1, "rgba(255,240,210,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: dustTex, color: 0xffe2b0, size: 0.11, transparent: true, opacity: 0.32,
                                                                    depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false;
  group.add(dust);
  const base = pos.slice();

  // first person (M12b): metres; the chart sheet (12 units) is about a metre
  const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  // the evidence board on the left wall (B5): cork in a wooden frame, a polaroid per find, red threads
  const boardCanvas = document.createElement("canvas"); boardCanvas.width = 1024; boardCanvas.height = 704;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 8;
  {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 11.2, 16.2), walnut([1, 1]));
    frame.position.set(X0 + 0.35, 7.2, 8); frame.castShadow = true; frame.receiveShadow = true; group.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(15, 10.3), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9 }));
    face.rotation.y = Math.PI / 2; face.position.set(X0 + 0.68, 7.2, 8); face.receiveShadow = true; group.add(face);
  }
  function drawBoard(found = [], threads = []) {
    const c = boardCanvas.getContext("2d"), W = 1024, H = 704;
    const g = c.createRadialGradient(W * 0.3, H * 0.2, 40, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, "#c99c64"); g.addColorStop(1, "#8e6436"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const r = rng(9);
    for (let i = 0; i < 2600; i++) { c.fillStyle = r() < 0.5 ? "rgba(0,0,0,.12)" : "rgba(255,240,210,.1)"; c.fillRect(r() * W, r() * H, 2, 2); }
    const at = (id) => { const i = id - 1; return [130 + (i % 3) * 382, 150 + Math.floor(i / 3) * 360]; };
    c.strokeStyle = "#b8322a"; c.lineWidth = 4;
    for (const [a, b] of threads) {
      if (!found.includes(a) || !found.includes(b)) continue;
      const [x1, y1] = at(a), [x2, y2] = at(b);
      c.beginPath(); c.moveTo(x1, y1 - 120); c.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) - 80, x2, y2 - 120); c.stroke();
    }
    for (let id = 1; id <= 6; id++) {
      const [x, y] = at(id), on = found.includes(id);
      c.save(); c.translate(x, y); c.rotate([-0.04, 0.03, -0.02, 0.04, -0.03, 0.02][id - 1]);
      c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(-118, -128, 244, 270);
      c.fillStyle = "#f6f1e4"; c.fillRect(-122, -134, 244, 270);
      c.fillStyle = on ? ["#1d3a44", "#1b3640", "#e9e1cc", "#f3ecd8", "#05080a", "#6a4b2c"][id - 1] : "#3a3530";
      c.fillRect(-108, -120, 216, 170);
      c.fillStyle = on ? "#c2412d" : "#8a8170"; c.font = on ? "700 40px Caveat, cursive" : "400 90px Prata, serif"; c.textAlign = "center";
      c.fillText(on ? String(id) : "?", 0, on ? 112 : 0);
      c.fillStyle = "#b8322a"; c.beginPath(); c.arc(0, -126, 10, 0, 7); c.fill();
      c.restore();
    }
    boardTex.needsUpdate = true;
  }
  drawBoard();

  // fix 4: Dana at her laptop at the left side of the table (sitting, typing; turns to the captain)
  const dana = makePerson("dana"); dana.scale.setScalar(12); dana.position.set(-20.2, FLOOR_Y, -1.5); dana.rotation.y = Math.PI / 2;
  dana.userData.noMerge = true; group.add(dana);
  const laptop = new THREE.Group(); laptop.userData.noMerge = true;
  laptop.add(mesh(new THREE.BoxGeometry(3.6, 0.2, 2.6), std({ color: 0x2a2d33, roughness: 0.4, metalness: 0.5 })));
  const scr = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 0.12), std({ color: 0x1a1c20, emissive: 0x6fb8c8, emissiveIntensity: 0.6, roughness: 0.3 }));
  scr.position.set(0, 1.2, -1.25); scr.rotation.x = 0.25; laptop.add(scr);
  laptop.position.set(-12.6, 0.12, -1.5); laptop.rotation.y = Math.PI / 2; group.add(laptop);
  const proxy = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat); m.position.set(x, y, z); group.add(m); return m; };
  const M = 12, q = new THREE.Quaternion(), e = new THREE.Euler();
  const space = {
    scale: M, eye: 1.65, step: "wood",
    poly: [[-2.35, -3.0], [2.35, -3.0], [2.35, 2.36], [-2.35, 2.36]],
    colliders: [[-1.25, -1.02, 1.17, 0.94], [-2.55, -3.25, -1.72, -2.72],
                [-2.55, -0.42, -2.36, -0.25], [2.36, -0.42, 2.55, -0.25], [1.05, 2.0, 1.15, 2.6], [2.05, 2.0, 2.15, 2.6], ...props.colliders],
    floor: [floor],
    toWorld: (x, y, z, out) => out.set(x, FLOOR_Y + y, z),
    toLocal: (w, out) => out.set(w.x, w.y - FLOOR_Y, w.z),
    orient: (yaw, pitch, out) => out.setFromEuler(e.set(pitch, yaw + Math.PI, 0, "YXZ")),
  };
  const things = {
    table: { show: [], hit: proxy(28, 3, 22.6, -0.5, 0, -0.5), stand: [0.0, 1.5], look: [0.0, 0.85, 0.2] },
    stairs_up: { show: [stairs], hit: proxy(11, 22, 4, 19, FLOOR_Y + 11, Z1 - 2.5), stand: [1.58, 1.95], look: [1.58, 1.4, 2.5] },
    radio: { show: [], hit: proxy(8, 7, 5, X0 + 6, FLOOR_Y + 11, Z0 + 3.5), stand: [-1.55, -2.35], look: [-2.0, 0.95, -2.9] },
    dana: { show: [dana], hit: proxy(8, 16, 8, -20.2, FLOOR_Y + 8, -1.5), stand: [-1.3, 0.6], look: [-1.7, 1.2, -0.12] },
    board: { show: [], hit: proxy(1.5, 11, 16, X0 + 0.8, 6.2, 8), stand: [-1.75, 0.67], look: [-2.45, 1.35, 0.67] },
    porthole_l: { show: [], hit: proxy(8, 8, 1.5, -13, 6.5, Z0 + 0.6), stand: [-1.08, -2.5], look: [-1.08, 1.4, -3.1] },
    porthole_r: { show: [], hit: proxy(8, 8, 1.5, 13, 6.5, Z0 + 0.6), stand: [1.08, -2.5], look: [1.08, 1.4, -3.1] },
  };

  mergeByMaterial(group);           // the static cabin: one mesh per material (C2: draw calls)
  return {
    group, space, things, drawBoard,
    /** First person: where the captain stands coming down the stairs / getting up from the table. */
    spawn: { stairs: { x: 1.58, z: 1.85, yaw: Math.PI, pitch: -0.12 }, table: { x: 0.0, z: 1.45, yaw: Math.PI, pitch: -0.45 } },
    /** Where the camera stands when the captain gets up from the table: a view of the whole cabin. */
    standPose: { target: new THREE.Vector3(1, 2.5, -10), dist: 41, tilt: 15, yaw: 20 },
    update(dt, time, sway) {
      dana.userData.pose("type", time); dana.userData.look(scene.userData.eye ?? null);
      const pu = portholeUniforms;
      pu.uT.value = time; pu.uCloud.value = WX.cloud; pu.uRain.value = WX.rain; pu.uFlash.value = WX.flash; pu.uAmp.value = WX.amp;
      pu.uFog.value = WX.haze; pu.uSun.value = WX.sun; pu.uMoon.value = WX.moon; pu.uFogCol.value.copy(WX.fogCol);
      pu.uRoll.value = Math.sin(time * 0.52) * 0.05 * WX.roll;
      for (const g of portGlows) { g.intensity = 3 * (0.3 + 0.7 * WX.moon) + 10 * WX.sun + 60 * WX.flash; g.color.setRGB(0.72 + 0.28 * WX.sun, 0.79, 0.92 - 0.3 * WX.sun); }
      lamp.position.x = -1.2 + (sway?.x ?? 0);
      lamp.position.z = -1.8 + (sway?.z ?? 0);
      const p = dustGeo.attributes.position;
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        p.array[i * 3] = base[i * 3] + Math.sin(time * 0.13 + s) * 0.5;
        p.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.09 + s * 1.3) * 0.6;
        p.array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.11 + s) * 0.5;
      }
      p.needsUpdate = true;
    },
  };
}
