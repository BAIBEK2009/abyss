// The navigator's table: paper chart with the probability relief, reef islands, lighthouse,
// both ships, the rival's target, dotted routes, dive marks, sonar rings, desk props and the lamp
// (CLAUDE.md v3, 3 / 4.4). Only drawing: positions, plans and beliefs come from the Python state.
//
// Information on the chart by default is kept to two layers:
//   our chosen course (ink dots) and the rival's target (one red line + one ghost ship).
// The officers' advice route, the forecast ghost and tool zones appear only on hover (M6 UI).
import * as THREE from "three";
import { createRelief, BASE_Y } from "./relief.js";
import { canvasTexture, deg, rng } from "../view.js";
import { t } from "../strings.js";

const MARGIN_X = 0.95, MARGIN_Z = 1.45;                 // paper around the 10x10 grid
const PAPER_W = 10 + 2 * MARGIN_X, PAPER_D = 10 + 2 * MARGIN_Z;
const SEC_PER_HOUR = 0.16;                               // playback speed of the shared clock

const COLORS = { ink: 0x2B2A33, brass: 0xB8893B, red: 0xC2412D, teal: 0x2F7D86, yellow: 0xF2B632, rival: 0xD9573B };

/** Map point (u, v) in cell units (0..10) -> world (x, z). Cell (x, y) centre = (x + .5, y + .5). */
const toWorld = (u, v) => new THREE.Vector3(u - 5, 0, v - 5);
const centre = ([x, y]) => [x + 0.5, y + 0.5];

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ textures
/** Fine, crisp wood grain (tiled), with planks. */
function woodTexture() {
  const tex = canvasTexture(2048, 2048, (g, w, h) => {
    const r = rng(7), planks = 8;
    for (let p = 0; p < planks; p++) {                 // each plank its own tone
      const tone = 0.85 + r() * 0.3;
      g.fillStyle = `rgb(${Math.round(92 * tone)},${Math.round(60 * tone)},${Math.round(38 * tone)})`;
      g.fillRect(0, (p * h) / planks, w, h / planks);
    }
    for (let i = 0; i < 1600; i++) {                   // many thin, sharp grain lines
      const y0 = r() * h, amp = 1 + r() * 4, f = 0.002 + r() * 0.01;
      const dark = r() < 0.65;
      g.strokeStyle = dark ? `rgba(34,18,8,${0.10 + r() * 0.22})` : `rgba(170,120,78,${0.05 + r() * 0.12})`;
      g.lineWidth = 0.5 + r() * 1.3;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin(x * f + i) * amp + Math.sin(x * f * 4.3 + i * 1.7) * amp * 0.25;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 14; i++) {                     // knots
      const x = r() * w, y = r() * h;
      for (let k = 7; k > 0; k--) {
        g.strokeStyle = `rgba(35,18,8,${0.06 + 0.035 * k})`; g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(x, y, 5 + k * 7, 2 + k * 2.4, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    for (let p = 1; p < planks; p++) { g.fillStyle = "rgba(14,7,2,0.85)"; g.fillRect(0, (p * h) / planks - 1, w, 3); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = 16;
  return tex;
}

/** Chart paper (margins): grain, stains, folds and the ink frame — no text (text is HTML). */
function paperTexture() {
  const W = 2048, H = Math.round(2048 * PAPER_D / PAPER_W);
  return canvasTexture(W, H, (g) => {
    const r = rng(11), u = W / PAPER_W;
    g.fillStyle = "#EDE2CA"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) {
      const x = r() * W, y = r() * H, rad = 90 + r() * 300;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(175,135,80,${0.07 + r() * 0.09})`);
      grd.addColorStop(1, "rgba(175,135,80,0)");
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 50000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(110,85,50,${r() * 0.07})` : `rgba(255,252,240,${r() * 0.1})`;
      g.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1 + r() * 1.5);
    }
    for (const [x, y, k] of [[0, 0, -0.04], [W / 2, 0, 0.05], [0, H / 2, 0.05], [W / 2, H / 2, -0.03]]) {
      g.fillStyle = k > 0 ? `rgba(255,250,235,${k})` : `rgba(90,65,35,${-k})`;
      g.fillRect(x, y, W / 2, H / 2);
    }
    g.strokeStyle = "rgba(95,70,40,0.45)"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.strokeStyle = "rgba(43,42,51,0.85)";
    g.lineWidth = 6; g.strokeRect(MARGIN_X * u, MARGIN_Z * u, 10 * u, 10 * u);
    g.lineWidth = 2; g.strokeRect(MARGIN_X * u - 14, MARGIN_Z * u - 14, 10 * u + 28, 10 * u + 28);
    const edge = g.createRadialGradient(W / 2, H / 2, W * 0.4, W / 2, H / 2, W * 0.78);
    edge.addColorStop(0, "rgba(150,115,70,0)"); edge.addColorStop(1, "rgba(140,100,55,0.32)");
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
  });
}

// ------------------------------------------------------------------ ships: painted wooden figurines
const lacquer = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25, ...extra });

function roundedBox(w, h, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, z = -d / 2;
  s.moveTo(x + r, z); s.lineTo(x + w - r, z); s.quadraticCurveTo(x + w, z, x + w, z + r);
  s.lineTo(x + w, z + d - r); s.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
  s.lineTo(x + r, z + d); s.quadraticCurveTo(x, z + d, x, z + d - r);
  s.lineTo(x, z + r); s.quadraticCurveTo(x, z, x + r, z);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h - 0.03, bevelEnabled: true, bevelSize: 0.015,
                                             bevelThickness: 0.015, bevelSegments: 3, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.015, 0);
  return geo;
}

/** kind = "aurora" (yellow, bathyscaphe "Nerpa" on the stern A-frame) | "rival" (red). */
function shipModel(kind, ghost = false) {
  const aurora = kind === "aurora";
  const g = new THREE.Group();
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0xe0402a, emissive: 0xc2412d, emissiveIntensity: 0.9,
                                                    transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.6 });
  const m = (color, extra) => (ghost ? ghostMat : lacquer(color, extra));

  // hull: a rounded bow, flat stern, generous bevel (turned wood look)
  const hs = new THREE.Shape();
  hs.moveTo(-0.34, -0.14); hs.lineTo(0.12, -0.14);
  hs.quadraticCurveTo(0.36, -0.13, 0.42, 0); hs.quadraticCurveTo(0.36, 0.13, 0.12, 0.14);
  hs.lineTo(-0.34, 0.14); hs.quadraticCurveTo(-0.38, 0.14, -0.38, 0.1); hs.lineTo(-0.38, -0.1);
  hs.quadraticCurveTo(-0.38, -0.14, -0.34, -0.14);
  const hullGeo = new THREE.ExtrudeGeometry(hs, { depth: 0.09, bevelEnabled: true, bevelSize: 0.035,
                                                   bevelThickness: 0.035, bevelSegments: 4, curveSegments: 10 });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, 0.035, 0);
  g.add(mesh(hullGeo, m(aurora ? COLORS.yellow : COLORS.rival), !ghost));
  // painted waterline stripe
  const stripe = mesh(hullGeo.clone(), m(aurora ? 0x23415e : 0xF1EBDD), false);
  stripe.scale.set(1.02, 0.18, 1.06);
  stripe.position.y = 0.012;
  g.add(stripe);
  // wooden deck
  const deck = mesh(roundedBox(0.58, 0.02, 0.22, 0.06), m(0xC8A46E, { clearcoat: 0.3 }), !ghost);
  deck.position.set(-0.04, 0.155, 0);
  g.add(deck);
  // cabin with painted windows
  const cabin = mesh(roundedBox(0.2, 0.15, 0.19, 0.04), m(0xF4EFE4), !ghost);
  cabin.position.set(0.05, 0.17, 0);
  g.add(cabin);
  if (!ghost) {
    const glass = lacquer(0x2a3f55, { roughness: 0.2 });
    for (const z of [-0.096, 0.096]) {
      const w = mesh(new THREE.BoxGeometry(0.13, 0.04, 0.006), glass, false);
      w.position.set(0.05, 0.27, z);
      g.add(w);
    }
    const front = mesh(new THREE.BoxGeometry(0.006, 0.04, 0.12), glass, false);
    front.position.set(0.152, 0.27, 0);
    g.add(front);
  }
  // funnel / mast with a blinking light
  const funnel = mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.11, 16), m(aurora ? 0x23415e : 0x2B2A33), !ghost);
  funnel.position.set(0.0, 0.38, 0);
  g.add(funnel);
  let light = null;
  if (!ghost) {
    light = mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshStandardMaterial({
      color: 0xff4a3a, emissive: 0xff2a1a, emissiveIntensity: 1.2 }), false);
    light.position.set(0.0, 0.45, 0);
    g.add(light);
  }
  if (aurora) {                                      // A-frame + the yellow bathyscaphe "Nerpa"
    for (const z of [-0.085, 0.085]) {
      const leg = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.26, 8), m(0x2B2A33), !ghost);
      leg.position.set(-0.33, 0.27, z);
      leg.rotation.z = deg(-16);
      g.add(leg);
    }
    const bar = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.18, 8), m(0x2B2A33), !ghost);
    bar.rotation.x = deg(90);
    bar.position.set(-0.365, 0.395, 0);
    g.add(bar);
    const nerpa = mesh(new THREE.SphereGeometry(0.065, 20, 14), m(COLORS.yellow), !ghost);
    nerpa.position.set(-0.4, 0.29, 0);
    g.add(nerpa);
    if (!ghost) {
      const eye = mesh(new THREE.CircleGeometry(0.028, 16), lacquer(0x1d2a33, { roughness: 0.1 }), false);
      eye.position.set(-0.4, 0.29, 0.066);
      g.add(eye);
    }
  } else {                                           // the rival's crane
    const post = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8), m(0x2B2A33), !ghost);
    post.position.set(-0.24, 0.25, 0);
    const boom = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8), m(0x2B2A33), !ghost);
    boom.position.set(-0.3, 0.33, 0);
    boom.rotation.z = deg(70);
    g.add(post, boom);
  }
  g.scale.setScalar(ghost ? 1.5 : 1.45);
  return { group: g, light };
}

// ------------------------------------------------------------------ chart objects
/** The rival's target: a small red flag on a pole, planted in a corner of the cell. */
function flagModel() {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 8), lacquer(0x2B2A33));
  pole.position.y = 0.31;
  const knob = mesh(new THREE.SphereGeometry(0.024, 10, 8), lacquer(0xD9C27A));
  knob.position.y = 0.63;
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.3, -0.08), new THREE.Vector2(0, -0.17)]);
  const cloth = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0xD23A26, roughness: 0.6, side: THREE.DoubleSide }));
  cloth.position.set(0.012, 0.6, -0.004);
  const foot = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 14), lacquer(0x2B2A33));
  foot.position.y = 0.015;
  g.add(pole, knob, cloth, foot);
  return { group: g, cloth };
}

/** Red dashed outline of a ship lying on the chart (where the rival will be after a hovered action). */
function dashedShip() {
  const pts = [[-0.36, -0.15], [0.14, -0.15], [0.42, 0], [0.14, 0.15], [-0.36, 0.15]];
  const geo = new THREE.BoxGeometry(1, 0.01, 1);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xC2412D }), 64);
  const tmp = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dashes = Math.max(2, Math.round(len / 0.07));
    for (let d = 0; d < dashes; d++) {
      const t0 = d / dashes, t1 = t0 + 0.55 / dashes;
      const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0;
      const x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
      tmp.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      tmp.scale.set(Math.hypot(x1 - x0, z1 - z0), 1, 0.022);
      tmp.rotation.set(0, Math.atan2(-(z1 - z0), x1 - x0), 0);
      tmp.updateMatrix(); m.setMatrixAt(n++, tmp.matrix);
    }
  }
  m.count = n;
  m.frustumCulled = false;
  const g = new THREE.Group();
  g.add(m);
  g.scale.setScalar(1.45);
  return { group: g };
}

function lighthouse() {
  const g = new THREE.Group();
  const white = lacquer(0xF4EFE4), red = lacquer(COLORS.red);
  const rock = mesh(new THREE.DodecahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: 0x8d877c, roughness: 0.9, flatShading: true }));
  rock.scale.set(1.3, 0.45, 1.2);
  g.add(rock);
  const tower = mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.42, 20), white);
  tower.position.y = 0.25;
  g.add(tower);
  for (const y of [0.15, 0.31]) {
    const band = mesh(new THREE.CylinderGeometry(0.081 - y * 0.06, 0.084 - y * 0.06, 0.055, 20), red);
    band.position.y = y;
    g.add(band);
  }
  const lamp = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 14), new THREE.MeshStandardMaterial({
    color: 0xffe2a0, emissive: 0xffc060, emissiveIntensity: 1.4 }), false);
  lamp.position.y = 0.49;
  const cap = mesh(new THREE.ConeGeometry(0.065, 0.07, 14), red);
  cap.position.y = 0.555;
  g.add(lamp, cap);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });   // no long shadow across the chart
  g.scale.setScalar(0.85);
  return g;
}

/** A small stony island on a reef cell (the shoreline itself is drawn by the relief shader). */
function island(cell, seed) {
  const g = new THREE.Group();
  const r = rng(seed);
  const [u, v] = centre(cell);
  const n = 4 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const tone = 0.48 + r() * 0.12;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(tone, tone * 0.96, tone * 0.9),
                                                 roughness: 0.92, flatShading: true });
    const s = mesh(new THREE.DodecahedronGeometry(0.075 + r() * 0.06, 0), mat);
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.08 + r() * 0.12;
    s.position.copy(toWorld(u + Math.cos(a) * d, v + Math.sin(a) * d));
    s.scale.set(1, 0.55 + r() * 0.5, 1);
    s.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(s);
  }
  g.position.y = BASE_Y + 0.015;
  return g;
}

// ------------------------------------------------------------------ desk props
function pendantLamp() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xB8893B, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide });
  const cord = mesh(new THREE.CylinderGeometry(0.02, 0.02, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1612 }), false);
  cord.position.y = 4.6;
  const shade = mesh(new THREE.ConeGeometry(1.0, 0.9, 40, 1, true), brass, false);
  shade.position.y = 0.2;
  const inner = mesh(new THREE.ConeGeometry(0.97, 0.88, 40, 1, true), new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc880, emissiveIntensity: 0.9, side: THREE.BackSide }), false);
  inner.position.y = 0.2;
  const cap = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 20), brass, false);
  cap.position.y = 0.7;
  const bulb = mesh(new THREE.SphereGeometry(0.22, 20, 14), new THREE.MeshStandardMaterial({
    color: 0xfff1d0, emissive: 0xffd590, emissiveIntensity: 3 }), false);
  bulb.position.y = -0.12;
  // soft glow around the bulb (additive sprite): the lamp reads as "on"
  const glowTex = canvasTexture(256, 256, (c, w) => {
    const grd = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, "rgba(255,225,170,0.9)"); grd.addColorStop(0.18, "rgba(255,200,130,0.35)"); grd.addColorStop(0.5, "rgba(255,190,110,0.08)");
    grd.addColorStop(1, "rgba(255,180,100,0)");
    c.fillStyle = grd; c.fillRect(0, 0, w, w);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending,
                                                           depthWrite: false, transparent: true }));
  glow.scale.setScalar(2.3);
  glow.position.y = -0.2;
  g.add(cord, shade, inner, cap, bulb, glow);
  return { group: g, bulbOffset: new THREE.Vector3(0, -0.12, 0) };
}

function mug() {
  const g = new THREE.Group();
  const enamel = lacquer(0x2C4A6B, { side: THREE.DoubleSide }), white = lacquer(0xF1ECE2);
  const body = mesh(new THREE.CylinderGeometry(0.42, 0.4, 0.95, 32, 1, true), enamel);
  body.position.y = 0.475;
  const bottom = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 32), enamel);
  bottom.position.y = 0.02;
  const rim = mesh(new THREE.TorusGeometry(0.42, 0.025, 10, 40), white);
  rim.rotation.x = deg(90); rim.position.y = 0.95;
  const coffee = mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshStandardMaterial({ color: 0x2a160b, roughness: 0.15 }), false);
  coffee.rotation.x = deg(-90); coffee.position.y = 0.8;
  const handle = mesh(new THREE.TorusGeometry(0.22, 0.05, 12, 24, Math.PI * 1.25), enamel);
  handle.position.set(0.47, 0.5, 0); handle.rotation.z = deg(-112);
  g.add(body, bottom, rim, coffee, handle);
  return g;
}

function compassProp() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xB8893B, metalness: 0.85, roughness: 0.3 });
  const R = 0.62;
  const body = mesh(new THREE.CylinderGeometry(R + 0.08, R + 0.11, 0.22, 48), brass);
  body.position.y = 0.11;
  const rose = canvasTexture(512, 512, (c, w) => {
    const cx = w / 2;
    c.fillStyle = "#EFE6D2"; c.beginPath(); c.arc(cx, cx, cx, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(43,42,51,0.6)"; c.lineWidth = 3;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2, r1 = w * (i % 8 === 0 ? 0.33 : 0.39);
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      c.lineTo(cx + Math.cos(a) * w * 0.44, cx + Math.sin(a) * w * 0.44); c.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, len = w * (i % 2 ? 0.2 : 0.33);
      c.fillStyle = i % 2 ? "rgba(47,125,134,0.75)" : "rgba(43,42,51,0.85)";
      c.beginPath(); c.moveTo(cx, cx);
      c.lineTo(cx + Math.cos(a - 0.2) * w * 0.07, cx + Math.sin(a - 0.2) * w * 0.07);
      c.lineTo(cx + Math.cos(a) * len, cx + Math.sin(a) * len);
      c.lineTo(cx + Math.cos(a + 0.2) * w * 0.07, cx + Math.sin(a + 0.2) * w * 0.07);
      c.closePath(); c.fill();
    }
  });
  const face = mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: rose, roughness: 0.7 }), false);
  face.rotation.x = deg(-90); face.position.y = 0.222;
  const ring = mesh(new THREE.TorusGeometry(R + 0.04, 0.045, 12, 48), brass);
  ring.rotation.x = deg(90); ring.position.y = 0.23;
  const needle = mesh(new THREE.ConeGeometry(0.05, R * 1.3, 4), new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 0.5 }), false);
  needle.rotation.x = deg(-90); needle.position.y = 0.24;
  g.add(body, face, ring, needle);
  return g;
}

/** Drafting dividers (циркуль): two brass legs with steel points, opened a little. */
function dividers() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xC69A4A, metalness: 0.85, roughness: 0.28 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xbfc3c7, metalness: 0.9, roughness: 0.25 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    const bar = mesh(new THREE.BoxGeometry(2.0, 0.05, 0.09), brass);
    bar.position.x = 1.0;
    const tip = mesh(new THREE.ConeGeometry(0.035, 0.32, 10), steel);
    tip.rotation.z = deg(-90); tip.position.x = 2.15;
    leg.add(bar, tip);
    leg.rotation.y = deg(s * 11);
    g.add(leg);
  }
  const hinge = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20), brass);
  const knob = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12), brass);
  knob.position.y = 0.08;
  g.add(hinge, knob);
  g.position.y = 0.05;
  return g;
}

function pencil() {
  const g = new THREE.Group();
  const wood = mesh(new THREE.CylinderGeometry(0.075, 0.075, 3.0, 6), lacquer(0x3f5f4a));
  wood.rotation.z = deg(90);
  const tipWood = mesh(new THREE.ConeGeometry(0.075, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.8 }));
  tipWood.rotation.z = deg(-90); tipWood.position.x = 1.66;
  const lead = mesh(new THREE.ConeGeometry(0.026, 0.09, 6), new THREE.MeshStandardMaterial({ color: 0x2b2a33 }));
  lead.rotation.z = deg(-90); lead.position.x = 1.86;
  const band = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0xB8893B, metalness: 0.8, roughness: 0.3 }));
  band.rotation.z = deg(90); band.position.x = -1.55;
  const eraser = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 14), new THREE.MeshStandardMaterial({ color: 0xd98a7a, roughness: 0.9 }));
  eraser.rotation.z = deg(90); eraser.position.x = -1.72;
  g.add(wood, tipWood, lead, band, eraser);
  g.position.y = 0.075;
  return g;
}

// ------------------------------------------------------------------ the map scene
export function createMap(view, state) {
  const { scene, pin } = view;
  const root = new THREE.Group();
  scene.add(root);

  const table = mesh(new THREE.BoxGeometry(60, 1, 40), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62 }));
  table.position.set(0, -0.5, -2);
  root.add(table);
  const paperSide = new THREE.MeshStandardMaterial({ color: 0xD9CBAE, roughness: 0.95 });
  const chart = mesh(new THREE.BoxGeometry(PAPER_W, 0.04, PAPER_D), [paperSide, paperSide,
    new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.92 }), paperSide, paperSide, paperSide], false);
  chart.position.y = 0.02;
  root.add(chart);

  // the lamp hangs beyond the far edge of the chart, low and to the left: visible at the top of the frame
  const lamp = pendantLamp();
  const LAMP = new THREE.Vector3(-3.2, 3.15, -8.2);
  lamp.group.position.copy(LAMP);
  root.add(lamp.group);
  // the key light shines from the lamp's direction but higher up, so its warm pool sits on the chart;
  // the low raking light of the paper-sheet shadows is done by the relief shader (relief.setLight)
  view.placeLamp(new THREE.Vector3(-5.2, 11.5, -10.5), new THREE.Vector3(0.8, 0, 1.4));

  const relief = createRelief(root, state.P, state.reefs, state.signal);
  relief.setMarks(state.probes, state.rival?.probes);
  relief.setLight(new THREE.Vector2(LAMP.x, LAMP.z));            // map-space direction to the lamp
  state.reefs.forEach((c, i) => root.add(island(c, 100 + i)));
  const light = lighthouse();
  // the base: a small lighthouse inside A10 (top-left corner of the cell) with an HTML label
  const baseSpot = [state.base[0] + 0.2, state.base[1] + 0.22];
  light.position.copy(toWorld(...baseSpot)).setY(BASE_Y);
  const baseLabel = document.createElement("div");
  baseLabel.className = "map-base"; baseLabel.textContent = t("base");
  pin(baseLabel, toWorld(baseSpot[0], baseSpot[1] - 0.05).setY(0.75));
  root.add(light);

  // desk props around the chart (kept off the right side, where the officers' panel will be)
  const props = [
    [mug(), [-7.7, 0, -6.6], 0],
    [compassProp(), [-7.6, 0, 4.0], 0],
    [dividers(), [6.6, 0, -7.6], deg(-24)],
    [pencil(), [1.2, 0, 7.6], deg(6)],
  ];
  for (const [obj, p, ry] of props) { obj.position.set(p[0], p[1], p[2]); obj.rotation.y = ry; root.add(obj); }

  // ---- labels around the chart (HTML): A–J top and bottom, 1–10 left and right
  for (let i = 0; i < 10; i++) {
    for (const v of [-MARGIN_X * 0.48, 10 + MARGIN_X * 0.48]) {
      const el = document.createElement("div"); el.className = "map-label"; el.textContent = state.cols[i];
      pin(el, toWorld(i + 0.5, v));
    }
    for (const u of [-MARGIN_X * 0.48, 10 + MARGIN_X * 0.48]) {
      const el = document.createElement("div"); el.className = "map-label"; el.textContent = String(i + 1);
      pin(el, toWorld(u, i + 0.5));
    }
  }
  const caption = document.createElement("div");
  caption.className = "map-caption"; caption.textContent = t("map_caption");
  pin(caption, toWorld(5, -MARGIN_Z * 0.78));
  const legend = document.createElement("div");
  legend.className = "map-legend"; legend.textContent = t("map_legend");
  pin(legend, toWorld(5, 10 + MARGIN_Z * 0.78));
  const north = document.createElement("div");
  north.className = "map-north"; north.innerHTML = `<span class="arrow"></span>${t("north")}`;
  pin(north, toWorld(10 + MARGIN_X * 0.45, -MARGIN_Z * 0.72));

  // ---- ships and ghosts
  const aurora = shipModel("aurora");
  const rival = shipModel("rival");
  const flag = flagModel();                            // the rival's target: a red flag in the cell corner
  const forecastGhost = dashedShip();                  // where it will be after a hovered action
  forecastGhost.group.visible = false;
  root.add(aurora.group, rival.group, flag.group, forecastGhost.group);

  const ships = {
    you: { obj: aurora, u: 0, v: 0, heading: deg(20), bob: 0 },
    rival: { obj: rival, u: 0, v: 0, heading: deg(160), bob: 1.7 },
  };
  const placeShip = (s, cell) => { [s.u, s.v] = centre(cell); };
  placeShip(ships.you, state.pos);
  placeShip(ships.rival, state.rival ? state.rival.pos : [9, 9]);

  // ---- routes: ours = ink dots, the officers' advice = brass dots (hover only), the rival = one red line
  function dots(color, max = 400) {
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 }), max);
    m.count = 0; m.castShadow = true; m.frustumCulled = false;
    root.add(m);
    return { mesh: m, path: null, line: false };
  }
  function line(color, max = 200) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.012, 1),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), max);
    m.count = 0; m.castShadow = true; m.frustumCulled = false;
    root.add(m);
    return { mesh: m, path: null, line: true };
  }
  const routes = { ours: dots(COLORS.ink), advice: dots(COLORS.brass), rival: line(COLORS.red) };
  const tmp = new THREE.Object3D();
  function drawRoute(r) {
    const m = r.mesh;
    if (!r.path || r.path.length < 2) { m.count = 0; return; }
    let n = 0;
    for (let i = 0; i + 1 < r.path.length; i++) {
      const [u0, v0] = centre(r.path[i]), [u1, v1] = centre(r.path[i + 1]);
      const steps = 4;
      if (r.line) {                                        // continuous segments, just over the relief
        for (let s = 0; s < steps; s++) {
          const ua = u0 + (u1 - u0) * (s / steps), va = v0 + (v1 - v0) * (s / steps);
          const ub = u0 + (u1 - u0) * ((s + 1) / steps), vb = v0 + (v1 - v0) * ((s + 1) / steps);
          const a = toWorld(ua, va).setY(relief.heightAt(ua, va) + 0.02);
          const b = toWorld(ub, vb).setY(relief.heightAt(ub, vb) + 0.02);
          tmp.position.copy(a).add(b).multiplyScalar(0.5);
          tmp.scale.set(a.distanceTo(b) + 0.03, 1, 0.055);
          tmp.rotation.set(0, Math.atan2(-(b.z - a.z), b.x - a.x), 0);
          tmp.updateMatrix(); m.setMatrixAt(n++, tmp.matrix);
        }
      } else {
        for (let s = i === 0 ? 1 : 0; s < steps; s++) {
          const k = s / steps, u = u0 + (u1 - u0) * k, v = v0 + (v1 - v0) * k;
          tmp.position.copy(toWorld(u, v)).setY(relief.heightAt(u, v) + 0.014);
          tmp.scale.set(1, 1, 1); tmp.rotation.set(0, 0, 0);
          tmp.updateMatrix(); m.setMatrixAt(n++, tmp.matrix);
        }
      }
    }
    if (!r.line) {                                         // a bigger dot at the destination
      const [ue, ve] = centre(r.path[r.path.length - 1]);
      tmp.position.copy(toWorld(ue, ve)).setY(relief.heightAt(ue, ve) + 0.014);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(1.8); tmp.updateMatrix(); m.setMatrixAt(n++, tmp.matrix); tmp.scale.setScalar(1);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }
  function setRoute(kind, path) { routes[kind].path = path; drawRoute(routes[kind]); }

  // ---- bubbles over a dive
  const bubbles = [];
  const bubbleGeo = new THREE.SphereGeometry(0.03, 8, 6);
  function bubbleBurst(cell, color) {
    const [u, v] = centre(cell);
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(bubbleGeo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.2 }));
      b.position.copy(toWorld(u + (Math.random() - 0.5) * 0.5, v + (Math.random() - 0.5) * 0.5)).setY(relief.heightAt(u, v));
      b.userData = { vy: 0.25 + Math.random() * 0.35, t: -Math.random() * 1.2 };
      root.add(b);
      bubbles.push(b);
    }
  }

  // ---- the rival's target (always) and the officers' advice (only while hovering "Accept advice")
  let adviceShown = false;
  function showPlans(st) {
    const plan = st.rival?.plan;
    if (plan && st.status === "playing" && plan.path.length > 1) {
      setRoute("rival", plan.path);
      flag.group.visible = true;
      // planted in the cell's top-right corner: the top of the hill stays visible
      const u = plan.target[0] + 0.8, v = plan.target[1] + 0.2;
      flag.group.position.copy(toWorld(u, v)).setY(relief.heightAt(u, v));
    } else {
      setRoute("rival", null); flag.group.visible = false;
    }
    const adv = st.advice?.advice?.action;
    setRoute("advice", adviceShown && adv?.type === "go" && st.advice.lev.path.length > 1 ? st.advice.lev.path : null);
  }

  // ---- state & playback
  let shown = state;
  let playing = false;
  function setState(st, { animate = false } = {}) {
    shown = st;
    const p = relief.setBelief(st.P, animate);
    relief.setMarks(st.probes, st.rival?.probes);
    if (!playing) {
      placeShip(ships.you, st.pos);
      if (st.rival) placeShip(ships.rival, st.rival.pos);
    }
    showPlans(st);
    return p;
  }

  /** Play the events of one action on the shared clock: both ships sail at the same time. */
  const tickers = new Set();
  async function play(events, before) {
    playing = true;
    const t0 = before.hours;
    const segs = { you: [], rival: [] };
    const last = { you: { t: t0, cell: before.pos }, rival: { t: t0, cell: before.rival?.pos || [9, 9] } };
    const moments = [];
    for (const e of events) {
      const who = e.rival ? "rival" : "you";
      if (e.type === "move") {
        const dur = who === "rival" ? 1.5 : 1;
        segs[who].push({ t0: Math.max(last[who].t, e.t - dur), t1: e.t, from: last[who].cell, to: e.cell });
        last[who] = { t: e.t, cell: e.cell };
      } else if (e.type === "tow") {
        moments.push({ t: e.t, fn: () => { placeShip(ships.you, e.cell); last.you = { t: e.t, cell: e.cell }; } });
      } else if (e.type === "sonar") {
        moments.push({ t: e.t, fn: () => relief.ring(e.cell, who === "rival" ? COLORS.red : COLORS.teal) });
      } else if (e.type === "dive") {
        moments.push({ t: e.t, fn: () => bubbleBurst(e.cell, who === "rival" ? 0xff8a70 : 0xfff2b0) });
      } else if (e.type === "belief") {
        moments.push({ t: e.t, fn: () => { relief.setBelief(e.P, true); } });
      }
    }
    const tEnd = Math.max(t0, ...events.map((e) => e.t ?? t0));
    await new Promise((done) => {
      let tau = t0;
      const fired = new Set();
      const tick = (dt) => {
        tau = Math.min(tEnd, tau + dt / SEC_PER_HOUR);
        for (const who of ["you", "rival"]) {
          const seg = segs[who].find((s) => tau >= s.t0 && tau <= s.t1) || [...segs[who]].reverse().find((s) => tau > s.t1);
          if (!seg) continue;
          const k = tau >= seg.t1 ? 1 : (tau - seg.t0) / (seg.t1 - seg.t0);
          const [u0, v0] = centre(seg.from), [u1, v1] = centre(seg.to);
          ships[who].u = u0 + (u1 - u0) * k; ships[who].v = v0 + (v1 - v0) * k;
          if (u1 !== u0 || v1 !== v0) ships[who].heading = Math.atan2(-(v1 - v0), u1 - u0);
        }
        moments.forEach((m, i) => { if (!fired.has(i) && tau >= m.t) { fired.add(i); m.fn(); } });
        if (tau >= tEnd) { tickers.delete(tick); setTimeout(done, 1600); }   // let the relief settle
      };
      tickers.add(tick);
    });
    playing = false;
  }

  // ---- per frame
  view.onFrame((dt, time, sway) => {
    for (const fn of [...tickers]) fn(dt);
    relief.update(dt, time);
    lamp.group.position.set(LAMP.x + sway.x, LAMP.y, LAMP.z + sway.z);
    // two ships in one cell: move them apart so both stay visible
    const close = shown.rival && Math.hypot(ships.you.u - ships.rival.u, ships.you.v - ships.rival.v) < 0.6;
    const atBase = Math.hypot(ships.you.u - (shown.base[0] + 0.5), ships.you.v - (shown.base[1] + 0.5)) < 0.3;
    for (const [name, s] of Object.entries(ships)) {
      const g = s.obj.group;
      const off = close ? (name === "you" ? -0.24 : 0.24) : 0;
      const shift = name === "you" && atBase && !close ? 0.16 : 0;      // leave room for the lighthouse
      const u = s.u + off + shift, v = s.v + off + shift * 0.6;
      g.position.copy(toWorld(u, v)).setY(relief.heightAt(u, v) + Math.sin(time * 1.6 + s.bob) * 0.008);
      const r = g.rotation;
      r.y += Math.atan2(Math.sin(s.heading - r.y), Math.cos(s.heading - r.y)) * Math.min(1, dt * 6);
      r.z = Math.sin(time * 1.1 + s.bob) * deg(2);
      if (s.obj.light) s.obj.light.material.emissiveIntensity = (Math.sin(time * 3 + s.bob) > 0.2) ? 1.6 : 0.2;
    }
    rival.group.visible = !!shown.rival;
    flag.cloth.rotation.y = Math.sin(time * 2.4) * 0.22;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.userData.t += dt;
      if (b.userData.t < 0) { b.visible = false; continue; }
      b.visible = true;
      b.position.y += b.userData.vy * dt;
      b.material.opacity = Math.max(0, 0.85 - b.userData.t * 0.5);
      if (b.userData.t > 1.7) { root.remove(b); b.material.dispose(); bubbles.splice(i, 1); }
    }
    for (const r of Object.values(routes)) if (r.path) drawRoute(r);     // routes follow the flowing relief
  });

  // ---- picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function cellAt(clientX, clientY) {
    const rect = view.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    const hit = ray.intersectObject(relief.mesh)[0];
    if (!hit) return null;
    const x = Math.floor(hit.point.x + 5), y = Math.floor(hit.point.z + 5);
    return x >= 0 && y >= 0 && x < 10 && y < 10 ? [x, y] : null;
  }

  showPlans(state);
  return {
    setState, play, cellAt, setRoute,
    hover: relief.hover, target: relief.target,
    /** Hover-only layers for the M6 UI. */
    showAdvice(on) { adviceShown = on; showPlans(shown); },
    showForecast(cell) {
      forecastGhost.group.visible = !!cell;
      if (!cell) return;
      const [u, v] = centre(cell);
      forecastGhost.group.position.copy(toWorld(u, v)).setY(relief.heightAt(u, v) + 0.02);
    },
    showZone(cell, tool) { relief.zone(cell, tool); },
    /** A golden ring that runs out from a cell (an officer points at something). */
    pulse(cell, color = 0xE3A635) { relief.ring(cell, color, 1.6); },
    showRivalZone(on) {
      const plan = shown.rival?.plan;
      relief.rivalZone(on && plan ? plan.target : null, plan?.tool);
    },
    cellScreen: (x, y) => { const [u, v] = centre([x, y]); return view.toScreen(toWorld(u, v).setY(relief.heightAt(u, v))); },
  };
}
