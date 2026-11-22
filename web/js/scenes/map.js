// The captain's chart table (CLAUDE.md v3.1, 18): a watercolour nautical chart pinned to a walnut
// table with brass tacks, amber tracing-paper relief, two detailed ships with paper name tags,
// threads for routes (ours blue, the rival's red dashes), Vera's gold pin and the rival's red flag,
// a turning lighthouse at the base, a steaming mug, dividers, a pencil and a magnifier.
// Only drawing: positions, plans and beliefs come from the Python state.
//
// Information on the chart by default: our chosen course (blue thread), Vera's gold pin and the
// rival's course + target (red dashed thread + red flag). The advice route (brass thread), the
// rival's forecast outline and tool zones appear only on hover (table UI).
import * as THREE from "three";
import { createKalka, withOverlay } from "./kalka.js";
import { drawChart, CH0, CHS } from "./chart.js";
import { canvasTexture, deg, rng } from "../view.js";
import { walnut, brass, glass, paperFibres, contactShadow } from "./materials.js";
import { t } from "../i18n.js";
import { anim, ease, sleep } from "../anim.js";

const SEC_PER_HOUR = 0.16;                               // playback speed of the shared clock
const COLORS = { red: 0xC2412D, teal: 0x2F7D86, navy: 0x1f3550, rivalRed: 0xb8432f };

/** Map point (u, v) in cell units (0..10) -> world (x, z). Cell (x, y) centre = (x + .5, y + .5). */
const toWorld = (u, v) => new THREE.Vector3(u - 5, 0, v - 5);
const centre = ([x, y]) => [x + 0.5, y + 0.5];
const std = (o) => new THREE.MeshStandardMaterial(o);

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}
const soft = (rgb) => canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

// ------------------------------------------------------------------ the table
// ------------------------------------------------------------------ ships (bow towards +x)
function hullShape(L, B) {
  const s = new THREE.Shape();
  s.moveTo(-B * 0.46, L * 0.5); s.lineTo(B * 0.46, L * 0.5); s.lineTo(B * 0.5, -L * 0.05);
  s.bezierCurveTo(B * 0.48, -L * 0.3, B * 0.2, -L * 0.46, 0, -L * 0.55);
  s.bezierCurveTo(-B * 0.2, -L * 0.46, -B * 0.48, -L * 0.3, -B * 0.5, -L * 0.05);
  s.lineTo(-B * 0.46, L * 0.5);
  return s;
}
let deckTex, wakeTex, tridentTex;
function shipTextures() {
  deckTex ??= canvasTexture(256, 256, (g, w) => {
    g.fillStyle = "#b48a5c"; g.fillRect(0, 0, w, w);
    const r = rng(3);
    for (let i = 0; i < w; i += 8) {
      g.fillStyle = `rgba(60,35,15,${0.25 + r() * 0.2})`; g.fillRect(i, 0, 1, w);
      g.fillStyle = `rgba(255,230,190,${r() * 0.12})`; g.fillRect(i + 2, 0, 3, w);
    }
  });
  wakeTex ??= canvasTexture(256, 512, (g, w, h) => {
    const r = rng(5);
    for (let i = 0; i < 900; i++) {
      const tt = r(), sp = tt * 0.42, side = r() < 0.5 ? -1 : 1;
      const x = w / 2 + side * sp * w * (0.6 + r() * 0.5), y = tt * h;
      g.fillStyle = `rgba(255,255,255,${(1 - tt) * 0.5 * r()})`;
      g.beginPath(); g.arc(x, y, 1 + r() * 3 * (1 - tt), 0, 7); g.fill();
    }
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(w * 0.44, 0, w * 0.12, h * 0.6);
  });
  tridentTex ??= canvasTexture(128, 128, (c, w) => {
    c.fillStyle = "#b8432f"; c.fillRect(0, 0, w, w);
    c.strokeStyle = "#f3efe6"; c.lineWidth = 9; c.beginPath();
    c.moveTo(64, 20); c.lineTo(64, 108); c.moveTo(34, 26); c.lineTo(34, 56); c.quadraticCurveTo(64, 80, 94, 56); c.lineTo(94, 26); c.stroke();
  });
}

/**
 * "aurora": orange hull, white house with windows, funnel, lifeboats, stern crane with the yellow
 * bathyscaphe "Nerpa". "rival": black hull, red superstructure, cranes, a red trident on the funnel.
 */
function shipModel(kind) {
  shipTextures();
  const aurora = kind === "aurora";
  let bathy = null, cable = null;
  const o = aurora
    ? { hull: 0xf29a1c, bottom: 0x7a2a1c, house: 0xf4f1ea, funnel: 0xf4f1ea, band: 0xe9a63a }
    : { hull: 0x1d1f24, bottom: 0x7a1c14, house: 0x9a2a20, funnel: 0x1d1f24, band: 0xd9573b };
  const outer = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.y = -Math.PI / 2;                // modelled with the bow towards -z: turned to +x
  outer.add(g);
  const L = 1.15, B = 0.4, hs = hullShape(L, B);
  const ex = (d, c, y, sc = 1, r = 0.5, m = 0.1) => {
    const geo = new THREE.ExtrudeGeometry(hs, { depth: d, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 18 });
    geo.rotateX(-Math.PI / 2);
    const m_ = mesh(geo, std({ color: c, roughness: r, metalness: m }));
    m_.position.y = y; m_.scale.set(sc, 1, sc);
    g.add(m_);
    return m_;
  };
  ex(0.07, o.bottom, 0.0, 0.97, 0.6);
  ex(0.075, o.hull, 0.07, 1, 0.42);
  ex(0.012, 0xf3efe6, 0.145, 1.005, 0.5);
  const dk = new THREE.Mesh(new THREE.ShapeGeometry(hs, 18), std({ map: deckTex, roughness: 0.7 }));
  dk.rotation.x = -Math.PI / 2; dk.position.y = 0.162; dk.scale.set(0.93, 0.93, 1); dk.receiveShadow = true;
  g.add(dk);
  const white = std({ color: o.house, roughness: 0.45 });
  const windows = std({ color: 0x15161b, roughness: 0.25, metalness: 0.4, emissive: 0xffb860, emissiveIntensity: 0.35 });
  const bx = (w, h, d, m, x, y, z) => { const b = mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  bx(0.27, 0.12, 0.34, white, 0, 0.23, -0.06); bx(0.275, 0.03, 0.345, windows, 0, 0.25, -0.06);
  bx(0.22, 0.09, 0.2, white, 0, 0.335, -0.1); bx(0.225, 0.025, 0.205, windows, 0, 0.345, -0.1);
  bx(0.25, 0.015, 0.23, std({ color: 0x2b2a33, roughness: 0.6 }), 0, 0.385, -0.1);
  const fun = mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 20), std({ color: o.funnel, roughness: 0.5 }));
  fun.position.set(0, 0.45, 0.07); g.add(fun);
  const band = mesh(new THREE.CylinderGeometry(0.047, 0.05, 0.035, 20), std({ color: o.band, roughness: 0.5 }), false);
  band.position.set(0, 0.48, 0.07); g.add(band);
  const mast = mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.32, 8), std({ color: 0x2b2a33 }));
  mast.position.set(0, 0.54, -0.16); g.add(mast);
  bx(0.14, 0.008, 0.008, std({ color: 0x2b2a33 }), 0, 0.6, -0.16);
  // mast lights with a small halo (port red, starboard green, white top)
  const glowTex = soft("255,255,255");
  const lights = [];
  for (const [x, c] of [[-0.07, 0xff3b2a], [0.07, 0x3bff6a], [0, 0xfff2d0]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6) }));   // HDR: blooms
    l.position.set(x, x ? 0.6 : 0.7, -0.16); g.add(l);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    halo.scale.set(0.075, 0.075, 1); halo.position.copy(l.position); g.add(halo);
    lights.push(halo);
  }
  for (const s of [-1, 1]) {                 // lifeboats
    const lb = mesh(new THREE.SphereGeometry(1, 16, 10), std({ color: 0xff7a1a, roughness: 0.5 }));
    lb.scale.set(0.032, 0.028, 0.085); lb.position.set(s * 0.16, 0.29, -0.04); g.add(lb);
  }
  if (aurora) {                               // stern A-frame crane with the bathyscaphe
    const fm = std({ color: 0xf2b632, roughness: 0.45, metalness: 0.3 });
    for (const s of [-1, 1]) { const leg = bx(0.018, 0.22, 0.018, fm, s * 0.13, 0.27, 0.47); leg.rotation.x = 0.25; }
    bx(0.28, 0.02, 0.02, fm, 0, 0.38, 0.5);
    bathy = new THREE.Group();                 // "Nerpa" hangs on the A-frame and can be lowered
    bathy.position.set(0, 0.27, 0.53); g.add(bathy);
    bathy.add(mesh(new THREE.SphereGeometry(0.07, 20, 14), std({ color: 0xf2b632, roughness: 0.35, metalness: 0.25 })));
    const pw = mesh(new THREE.SphereGeometry(0.03, 12, 8), std({ color: 0x0f2f38, roughness: 0.1, metalness: 0.6, emissive: 0x0a3a44 }), false);
    pw.position.set(0, 0, -0.06); bathy.add(pw);
    cable = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 5), std({ color: 0x1a1a1a }));
    cable.geometry.translate(0, -0.5, 0);      // hangs down from the A-frame top
    cable.position.set(0, 0.38, 0.52); cable.scale.y = 0.05; g.add(cable);
  } else {                                    // cranes, cargo, trident logo
    const cm = std({ color: 0xb8432f, roughness: 0.5, metalness: 0.3 });
    for (const z of [0.18, 0.36]) {
      bx(0.02, 0.2, 0.02, cm, 0.12, 0.26, z);
      const boom = bx(0.02, 0.02, 0.32, cm, 0.04, 0.36, z - 0.08); boom.rotation.x = -0.5; boom.rotation.y = 0.4;
    }
    bx(0.12, 0.06, 0.1, std({ color: 0x3c5a73, roughness: 0.6 }), -0.08, 0.2, 0.3);
    bx(0.12, 0.06, 0.1, std({ color: 0x8a6a3a, roughness: 0.6 }), -0.08, 0.26, 0.3);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshBasicMaterial({ map: tridentTex }));
    logo.position.set(0, 0.46, 0.07 + 0.056); g.add(logo);
  }
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.4), new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false, opacity: 0.8 }));
  wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.012, L * 0.5 + 0.68); g.add(wake);
  const shade = contactShadow(1.7, 0.75, 0.75);             // soft contact shadow under the hull
  shade.position.y = 0.006;
  outer.add(shade);
  outer.scale.setScalar(1.1);
  return { group: outer, lights, wake, funnelTop: new THREE.Vector3(0, 0.56, 0.07), body: g, bathy, cable };
}

/** Red dashed outline of a ship lying on the chart (where the rival will be after a hovered action). */
function dashedShip() {
  const pts = [[-0.5, -0.2], [0.2, -0.2], [0.6, 0], [0.2, 0.2], [-0.5, 0.2]];
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.012, 1), new THREE.MeshBasicMaterial({ color: COLORS.red }), 64);
  const tmp = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dashes = Math.max(2, Math.round(len / 0.09));
    for (let d = 0; d < dashes; d++) {
      const t0 = d / dashes, t1 = t0 + 0.55 / dashes;
      const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
      tmp.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      tmp.scale.set(Math.hypot(x1 - x0, z1 - z0), 1, 0.03);
      tmp.rotation.set(0, Math.atan2(-(z1 - z0), x1 - x0), 0);
      tmp.updateMatrix(); m.setMatrixAt(n++, tmp.matrix);
    }
  }
  m.count = n; m.frustumCulled = false;
  const g = new THREE.Group(); g.add(m);
  return { group: g };
}

/** A pin stuck into the chart: steel needle, round head (metal or plastic). */
function pinModel(head, metal, h = 0.78, headScale = 1) {
  const g = new THREE.Group();
  const n = mesh(new THREE.CylinderGeometry(0.012, 0.006, h, 8), std({ color: 0xcfd3d6, metalness: 0.9, roughness: 0.3 }));
  n.position.y = h / 2; g.add(n);
  const s = mesh(new THREE.SphereGeometry(0.1, 24, 16), metal ? brass(head) : new THREE.MeshPhysicalMaterial({ color: head, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
  s.position.y = h; s.scale.setScalar(headScale); g.add(s);
  if (h > 0.3) { const sh = contactShadow(0.3, 0.3, 0.6); sh.position.y = 0.004; g.add(sh); }
  return g;
}
function flagPin() {
  const g = pinModel(COLORS.rivalRed, 0, 0.7);
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(0.42, -0.11); fs.lineTo(0, -0.24); fs.lineTo(0, 0);
  const cloth = mesh(new THREE.ShapeGeometry(fs), std({ color: COLORS.rivalRed, roughness: 0.6, side: THREE.DoubleSide }));
  cloth.position.set(0.01, 0.66, 0);
  g.add(cloth);
  return { group: g, cloth };
}

function lighthouse() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const c = mesh(new THREE.CylinderGeometry(0.1 - i * 0.01, 0.11 - i * 0.01, 0.11, 18), std({ color: i % 2 ? 0xa8392a : 0xf2ede2, roughness: 0.5 }));
    c.position.y = 0.06 + i * 0.11; g.add(c);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2a8).multiplyScalar(6) }));
  lamp.position.y = 0.53; g.add(lamp);
  const cap = mesh(new THREE.ConeGeometry(0.075, 0.08, 14), std({ color: 0xa8392a, roughness: 0.5 }));
  cap.position.y = 0.6; g.add(cap);
  return g;
}

// ------------------------------------------------------------------ desk props
function mug() {
  const g = new THREE.Group();
  const cer = std({ color: 0xece4d2, roughness: 0.35, side: THREE.DoubleSide });
  const cup = mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.85, 40, 1, true), cer); cup.position.y = 0.425; g.add(cup);
  const bot = mesh(new THREE.CircleGeometry(0.38, 32), cer); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.01; g.add(bot);
  const cof = mesh(new THREE.CircleGeometry(0.4, 32), std({ color: 0x1a0d06, roughness: 0.15 }), false); cof.rotation.x = -Math.PI / 2; cof.position.y = 0.72; g.add(cof);
  const hd = mesh(new THREE.TorusGeometry(0.2, 0.05, 10, 24, Math.PI), cer); hd.position.set(0.45, 0.45, 0); hd.rotation.z = -Math.PI / 2; g.add(hd);
  return g;
}
const brassMat = () => brass();
function dividers() {
  const g = new THREE.Group(), brass = brassMat();
  for (const a of [-0.06, 0.06]) {
    const leg = mesh(new THREE.BoxGeometry(0.05, 0.025, 2.0), brass); leg.position.set(0, 0.01, -1.0);
    const pv = new THREE.Group(); pv.rotation.y = a; pv.add(leg); g.add(pv);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 18), brass));
  return g;
}
function pencil() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), std({ color: 0x2f5a3c, roughness: 0.5 })); body.rotation.z = Math.PI / 2; g.add(body);
  const tip = mesh(new THREE.ConeGeometry(0.07, 0.3, 6), std({ color: 0xd9b98a, roughness: 0.8 })); tip.rotation.z = -Math.PI / 2; tip.position.x = 1.45; g.add(tip);
  return g;
}
function magnifier() {
  const g = new THREE.Group(), brass = brassMat();
  const rim = mesh(new THREE.TorusGeometry(0.62, 0.05, 12, 48), brass); rim.rotation.x = Math.PI / 2; g.add(rim);
  const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 48), glass());
  gl.rotation.x = -Math.PI / 2; g.add(gl);
  const h = mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 14), std({ color: 0x3a2214, roughness: 0.5 })); h.rotation.z = Math.PI / 2; h.position.x = 1.2; g.add(h);
  return g;
}

/** Puffs of smoke or steam: sprites rising from a point given by `source(vector)`. */
function emitter(parent, puffTex, color, n, source) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: 0 }));
    p.userData.life = 3 + (i / n) * 3; p.userData.vx = 0;
    parent.add(p); parts.push(p);
  }
  return {
    update(dt, rise, drift, size, alpha, life) {
      for (const p of parts) {
        p.userData.life += dt;
        if (p.userData.life > life) { p.userData.life -= life; source(p.position); p.userData.vx = (Math.random() - 0.5) * 0.06; }
        const k = p.userData.life / life;
        p.position.y += dt * rise; p.position.x += dt * (drift + p.userData.vx); p.position.z += dt * drift * 0.3;
        const sc = size[0] + k * size[1];
        p.scale.set(sc, sc, 1);
        p.material.opacity = (1 - k) * alpha * Math.min(1, k * 6);
      }
    },
  };
}

// ------------------------------------------------------------------ the scene
export function createMap(view, state) {
  const { scene, pin } = view;
  const root = new THREE.Group();
  scene.add(root);

  const tableMat = walnut([3, 2.4]);
  tableMat.color.set(0xd8c8b8);                               // a darker, older walnut
  const table = mesh(new THREE.BoxGeometry(29, 1.2, 23), tableMat);
  table.position.set(-0.5, -0.6, -0.5);
  root.add(table);

  const kalka = createKalka(root, state.P, state.reefs, state.signal);
  kalka.setMarks(state.probes, state.rival?.probes);

  // the nautical chart (a sheet of paper on the table) with the shared overlay on its face
  const chartTex = canvasTexture(2048, 2048, (g, W) => drawChart(g, W, { reefs: state.reefs, signal: state.signal }));
  chartTex.anisotropy = view.renderer.capabilities.getMaxAnisotropy();
  // a real sheet: fibre normal map, edges curling up a little, a soft shadow under it
  const faceMat = withOverlay(new THREE.MeshStandardMaterial({ map: chartTex, roughness: 0.93, normalMap: paperFibres([7, 7]),
                                                              normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide }), kalka.shared);
  const sheetGeo = new THREE.PlaneGeometry(CHS, CHS, 120, 120).rotateX(-Math.PI / 2);
  {
    const pos = sheetGeo.attributes.position, half = CHS / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.min(half - Math.abs(x), half - Math.abs(z));               // distance to the nearest edge
      const corner = Math.max(0, 1 - Math.hypot(half - Math.abs(x), half - Math.abs(z)) / 1.2);
      const curl = Math.pow(Math.max(0, 1 - d / 0.55), 2.2) * 0.07 + corner * corner * 0.09;
      pos.setY(i, 0.014 + curl);
    }
    sheetGeo.computeVertexNormals();
  }
  const chart = mesh(sheetGeo, faceMat);
  chart.position.set(CH0 + CHS / 2 - 5, 0, CH0 + CHS / 2 - 5);
  root.add(chart);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(CHS + 1.2, CHS + 1.2), new THREE.MeshBasicMaterial({
    map: canvasTexture(256, 256, (g, w) => { g.filter = "blur(14px)"; g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(26, 26, w - 52, w - 52); }),
    transparent: true, depthWrite: false }));
  under.rotation.x = -Math.PI / 2;
  under.position.set(chart.position.x + 0.12, 0.002, chart.position.z + 0.16);
  root.add(under);
  // brass tacks in the corners
  for (const [u, v] of [[CH0 + 0.3, CH0 + 0.3], [CH0 + CHS - 0.3, CH0 + 0.3], [CH0 + 0.3, CH0 + CHS - 0.3], [CH0 + CHS - 0.3, CH0 + CHS - 0.3]]) {
    const tack = pinModel(0xc39447, 0.9, 0.05);
    tack.children[1].scale.set(1.1, 0.45, 1.1);
    tack.position.copy(toWorld(u, v));
    root.add(tack);
  }
  // stones on the reefs
  {
    const rock = std({ color: 0x7b7468, roughness: 0.95, flatShading: true });
    const r = rng(41);
    state.reefs.forEach(([x, y]) => {
      for (let q = 0; q < 3; q++) {
        const m = mesh(new THREE.DodecahedronGeometry(0.09 + r() * 0.1, 0), rock);
        m.position.copy(toWorld(x + 0.5 + (r() - 0.5) * 0.32, y + 0.5 + (r() - 0.5) * 0.28)).setY(0.04);
        m.scale.y = 0.55 + r() * 0.5;
        m.rotation.set(r() * 3, r() * 3, 0);
        root.add(m);
      }
    });
  }

  // light: the warm lamp from above-left (soft shadows); the cold moonlight is set by the view
  view.placeLamp(new THREE.Vector3(-1.2, 15, -1.8), new THREE.Vector3(0.2, 0, 0.4));

  // the base: a lighthouse whose beam turns over the chart
  const baseSpot = [state.base[0] + 0.5, state.base[1] + 0.3];
  const light = lighthouse();
  light.position.copy(toWorld(...baseSpot));
  root.add(light);
  const whiteSoft = soft("255,255,255"), puffTex = soft("236,230,220");
  const beamPivot = new THREE.Group();
  beamPivot.position.copy(toWorld(...baseSpot)).setY(0.56);
  root.add(beamPivot);
  const beamTex = canvasTexture(256, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "rgba(255,236,190,.95)"); gr.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, h / 2 - 3); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(0, h / 2 + 3); g.closePath(); g.fill();
  });
  const tiltG = new THREE.Group(); tiltG.rotation.z = -0.16; beamPivot.add(tiltG);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.45), new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.13, color: 0xffd9a0 }));
  beam.rotation.x = -Math.PI / 2; beam.position.x = 1.15; tiltG.add(beam);
  const lhGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: whiteSoft, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lhGlow.scale.set(0.45, 0.45, 1);
  lhGlow.position.copy(toWorld(...baseSpot)).setY(0.56);
  root.add(lhGlow);
  const sweep = new THREE.SpotLight(0xffe0b0, 4.7, 8, 0.15, 0.6, 1.4);
  sweep.position.copy(toWorld(...baseSpot)).setY(0.6);
  root.add(sweep, sweep.target);

  // desk props
  const props = [
    [mug(), [-7.1, 0, -7.0], 0],
    [dividers(), [5.2, 0.03, -5.35], 0.6],
    [pencil(), [7.1, 0.07, 1.6], 1.25],
    [magnifier(), [-9.4, 0.05, 2.6], -0.5],
  ];
  for (const [obj, p, ry] of props) { obj.position.set(p[0], p[1], p[2]); obj.rotation.y = ry; root.add(obj); }
  const steam = emitter(root, puffTex, 0xffffff, 10, (v) => v.set(-7.1 + (Math.random() - 0.5) * 0.2, 0.9, -7.0 + (Math.random() - 0.5) * 0.2));

  // ---- ships, name tags, flag, gold pin, forecast outline
  const aurora = shipModel("aurora");
  const rival = shipModel("rival");
  const flag = flagPin();
  const goldPin = pinModel(0xe0a83a, 0.9, 1.0, 1.45);
  const forecastGhost = dashedShip();
  forecastGhost.group.visible = false;
  root.add(aurora.group, rival.group, flag.group, goldPin, forecastGhost.group);
  const smokes = [
    emitter(root, puffTex, 0xdcd6ca, 16, (v) => aurora.body.localToWorld(v.copy(aurora.funnelTop))),
    emitter(root, puffTex, 0x5e5c5c, 16, (v) => rival.body.localToWorld(v.copy(rival.funnelTop))),
  ];
  // ---- act II: the storm front over the chart (17.5) — low dark clouds over the storm cells, faint ones where
  // it will be in 6 hours with a pencil note; act II's decoy buoy (an orange spar buoy with a blinking light)
  // paper-craft storm clouds: three flattened balls each, opaque, casting their shadow on the chart
  const storm = new THREE.Group(); root.add(storm);
  const stormPuffs = [];
  const cloudMat = std({ color: 0x59606b, roughness: 0.95 }), cloudMatLight = std({ color: 0x9aa1aa, roughness: 0.95 });
  const ball = new THREE.SphereGeometry(0.32, 14, 10);
  for (let i = 0; i < 46; i++) {
    const sp = new THREE.Group();
    for (const [x, z, r] of [[-0.18, 0.02, 1], [0.16, -0.05, 1.15], [0.02, 0.14, 0.85]]) {
      const m = mesh(ball, cloudMat); m.position.set(x, 0, z); m.scale.set(r, r * 0.55, r); sp.add(m);
    }
    sp.userData = { ph: Math.random() * 6.28, dz: Math.random() - 0.5, s: 0.85 + Math.random() * 0.35, k: 0, goal: 0, home: new THREE.Vector3(), light: false };
    sp.visible = false;
    storm.add(sp); stormPuffs.push(sp);
  }
  const stormNote = document.createElement("div");
  stormNote.className = "storm-note"; stormNote.hidden = true;
  const stormAnchor = new THREE.Vector3();
  pin(stormNote, stormAnchor, "at");
  function setStorm(info) {
    const now = info?.cells ?? [], next = (info?.next ?? []).filter(([x, y]) => !now.some((c) => c[0] === x && c[1] === y));
    const cells = [...now.map((c) => [c, 1]), ...next.map((c) => [c, 0.5])];
    stormPuffs.forEach((sp, i) => {
      const it = cells[i];
      sp.userData.goal = it ? it[1] : 0;
      if (it) {
        const [u, v] = centre(it[0]); sp.userData.home.copy(toWorld(u + sp.userData.dz * 0.3, v + sp.userData.dz * 0.25));
        const light = it[1] < 1;
        if (light !== sp.userData.light) { sp.userData.light = light; sp.children.forEach((m) => { m.material = light ? cloudMatLight : cloudMat; }); }
      }
    });
    stormNote.hidden = !next.length;
    if (next.length) {
      const [u, v] = centre(next[Math.floor(next.length / 2)]);
      stormAnchor.copy(toWorld(u, v)).setY(1.4);
      stormNote.textContent = t("storm_note", { h: info.in });
    }
  }
  const decoy = new THREE.Group();
  {
    const body = mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0.02], [0.1, 0.12], [0.06, 0.32], [0.02, 0.52], [0, 0.54]].map(([a, b]) => new THREE.Vector2(a, b)), 18),
      std({ color: 0xff6a1a, roughness: 0.5 }));
    const band = mesh(new THREE.CylinderGeometry(0.083, 0.095, 0.05, 18), std({ color: 0xf2f2ea, roughness: 0.4 }));
    band.position.y = 0.18;
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft("255,190,90"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lamp.position.y = 0.6; lamp.scale.setScalar(0.5);
    decoy.add(body, band, lamp); decoy.userData.lamp = lamp; decoy.visible = false;
    root.add(decoy);
  }
  function setDecoy(cell) {
    decoy.visible = Array.isArray(cell);
    if (!decoy.visible) return;
    const [u, v] = centre(cell);
    decoy.position.copy(toWorld(u + 0.28, v - 0.28)).setY(kalka.heightAt(u + 0.28, v - 0.28));
  }
  view.onFrame((dt, time) => {
    for (const sp of stormPuffs) {
      const d = sp.userData;
      d.k += (d.goal - d.k) * Math.min(1, dt * 1.2);
      sp.visible = d.k > 0.02;
      if (!sp.visible) continue;
      sp.position.set(d.home.x + Math.sin(time * 0.3 + d.ph) * 0.12, 1.5 + Math.sin(time * 0.5 + d.ph) * 0.06, d.home.z + Math.cos(time * 0.23 + d.ph) * 0.08);
      const k = d.k * d.s * 0.58; sp.scale.set(k, k * 0.8, k);
    }
    if (decoy.visible) decoy.userData.lamp.material.opacity = (time * 1.2) % 1 < 0.15 ? 1 : 0.15;
  });

  function nameTag(cls, name, sub) {
    const el = document.createElement("div");
    el.className = `ship-tag ${cls}`;
    el.innerHTML = `<b>${name}</b><span>${sub}</span>`;
    const anchor = new THREE.Vector3();
    pin(el, anchor, "above");
    return { el, anchor };
  }
  const tags = { you: nameTag("you", t("ship_aurora"), t("ship_aurora_sub")), rival: nameTag("rival", t("ship_rival"), t("ship_rival_sub")) };

  const ships = {
    you: { obj: aurora, u: 0, v: 0, heading: deg(20), bob: 0, moving: false },
    rival: { obj: rival, u: 0, v: 0, heading: deg(160), bob: 1.7, moving: false },
  };
  const placeShip = (s, cell) => { [s.u, s.v] = centre(cell); };
  placeShip(ships.you, state.pos);
  placeShip(ships.rival, state.rival ? state.rival.pos : [9, 9]);

  // ---- threads: ours = navy, the officers' advice = brass (hover only), the rival = red dashes
  const threads = {
    ours: { color: COLORS.navy, dashed: false, path: null, obj: null },
    advice: { color: 0xc39447, dashed: false, path: null, obj: null },
    rival: { color: COLORS.rivalRed, dashed: true, path: null, obj: null },
  };
  function threadCurve(path) {
    const pts = [];
    const cells = path.map(centre);
    for (let i = 0; i < cells.length - 1; i++) {
      const [a, b] = [cells[i], cells[i + 1]];
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12));
      for (let s = 0; s < n; s++) {
        const k = s / n, u = a[0] + (b[0] - a[0]) * k, v = a[1] + (b[1] - a[1]) * k;
        pts.push(toWorld(u, v).setY(kalka.heightAt(u, v) + 0.035));
      }
    }
    const e = cells[cells.length - 1];
    pts.push(toWorld(e[0], e[1]).setY(kalka.heightAt(e[0], e[1]) + 0.035));
    return new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.2);
  }
  function drawThread(th) {
    if (th.obj) { root.remove(th.obj); th.obj.traverse((o) => o.geometry?.dispose()); th.obj = null; }
    if (!th.path || th.path.length < 2) return;
    const curve = threadCurve(th.path), mat = std({ color: th.color, roughness: 0.7 }), grp = new THREE.Group();
    if (!th.dashed) {
      grp.add(mesh(new THREE.TubeGeometry(curve, Math.max(40, th.path.length * 24), 0.022, 6), mat));
    } else {
      const L = curve.getLength(), n = Math.floor(L / 0.24);
      for (let i = 0; i < n; i++) {
        const a = i / n, b = a + 0.55 / n;
        const sub = new THREE.CatmullRomCurve3([curve.getPointAt(a), curve.getPointAt((a + b) / 2), curve.getPointAt(Math.min(1, b))]);
        grp.add(mesh(new THREE.TubeGeometry(sub, 6, 0.02, 5), mat));
      }
    }
    th.obj = grp;
    root.add(grp);
  }
  function setRoute(kind, path) { threads[kind].path = path; drawThread(threads[kind]); }

  // ---- bubbles over a dive
  const bubbles = [];
  const bubbleGeo = new THREE.SphereGeometry(0.03, 8, 6);
  function bubbleBurst(cell, color) {
    const [u, v] = centre(cell);
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(bubbleGeo, std({ color, transparent: true, opacity: 0.85, roughness: 0.2 }));
      b.position.copy(toWorld(u + (Math.random() - 0.5) * 0.5, v + (Math.random() - 0.5) * 0.5)).setY(kalka.heightAt(u, v));
      b.userData = { vy: 0.25 + Math.random() * 0.35, t: -Math.random() * 1.2 };
      root.add(b);
      bubbles.push(b);
    }
  }

  // ---- the rival's course + flag (always), Vera's gold pin, the advice thread (hover only)
  let adviceShown = false;
  let shown = state;
  function placePins() {
    const plan = shown.rival?.plan;
    if (plan && shown.status === "playing") {
      flag.group.visible = true;
      const u = plan.target[0] + 0.86, v = plan.target[1] + 0.16;        // the far corner of the cell: never on the gold pin
      flag.group.position.copy(toWorld(u, v)).setY(kalka.heightAt(u, v));
    } else flag.group.visible = false;
    const vera = shown.advice?.vera?.target;
    goldPin.visible = !!vera && shown.status === "playing";
    if (vera) { const [u, v] = centre(vera); goldPin.position.copy(toWorld(u, v)).setY(kalka.heightAt(u, v) - 0.02); }
  }
  function showPlans(st) {
    const plan = st.rival?.plan;
    setRoute("rival", plan && st.status === "playing" && plan.path.length > 1 ? plan.path : null);
    const adv = st.advice?.advice?.action;
    setRoute("advice", adviceShown && adv?.type === "go" && st.advice.lev.path.length > 1 ? st.advice.lev.path : null);
    placePins();
  }
  kalka.onChange(() => { for (const th of Object.values(threads)) drawThread(th); placePins(); });

  // ---- state & playback
  let playing = false;
  function setState(st, { animate = false } = {}) {
    shown = st;
    const p = kalka.setBelief(st.P, animate);
    kalka.setMarks(st.probes, st.rival?.probes);
    if (!playing) {
      placeShip(ships.you, st.pos);
      if (st.rival) placeShip(ships.rival, st.rival.pos);
    }
    showPlans(st);
    setStorm(st.campaign?.storm);
    setDecoy(st.campaign?.decoy);
    return p;
  }

  /** Play the events of one action on the shared clock: both ships sail at the same time. */
  const tickers = new Set();
  async function play(events, before, { onEvent } = {}) {
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
        moments.push({ t: e.t, fn: () => kalka.ring(e.cell, who === "rival" ? COLORS.red : COLORS.teal) });
      } else if (e.type === "dive") {
        moments.push({ t: e.t, fn: () => bubbleBurst(e.cell, who === "rival" ? 0xff8a70 : 0xfff2b0) });
      } else if (e.type === "belief") {
        moments.push({ t: e.t, fn: () => { kalka.setBelief(e.P, true); } });
      }
      if (onEvent && (e.type === "msg" || e.type === "clue" || e.type === "end")) {
        moments.push({ t: e.t ?? t0, fn: () => onEvent(e) });
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
          ships[who].moving = k < 1;
          if (u1 !== u0 || v1 !== v0) ships[who].heading = Math.atan2(-(v1 - v0), u1 - u0);
        }
        moments.forEach((m, i) => { if (!fired.has(i) && tau >= m.t) { fired.add(i); m.fn(); } });
        if (tau >= tEnd) { tickers.delete(tick); ships.you.moving = ships.rival.moving = false; setTimeout(done, 1600); }
      };
      tickers.add(tick);
    });
    playing = false;
  }

  // ---- per frame
  view.onFrame((dt, time) => {
    for (const fn of [...tickers]) fn(dt);
    kalka.update(dt, time);
    // two ships in one cell: move them apart so both stay visible
    const close = shown.rival && Math.hypot(ships.you.u - ships.rival.u, ships.you.v - ships.rival.v) < 0.8;
    const atBase = Math.hypot(ships.you.u - (shown.base[0] + 0.5), ships.you.v - (shown.base[1] + 0.5)) < 0.3;
    for (const [name, s] of Object.entries(ships)) {
      const g = s.obj.group;
      const off = close ? (name === "you" ? -0.32 : 0.32) : 0;
      const shift = name === "you" && atBase && !close ? 0.9 : 0;          // leave room for the lighthouse
      const u = s.u + off + shift, v = s.v + off - shift * 0.25;
      g.position.copy(toWorld(u, v)).setY(kalka.heightAt(u, v) - 0.015 + Math.sin(time * 1.6 + s.bob) * 0.008);
      const r = g.rotation;
      r.y += Math.atan2(Math.sin(s.heading - r.y), Math.cos(s.heading - r.y)) * Math.min(1, dt * 6);
      r.z = Math.sin(time * 1.1 + s.bob) * deg(1.6);
      r.x = Math.sin(time * 0.9 + s.bob) * deg(1.0);
      s.obj.wake.material.opacity = s.moving ? 0.8 : 0.25;
      for (const h of s.obj.lights) h.material.opacity = 0.65 + 0.25 * Math.sin(time * 3 + s.bob);
      tags[name].anchor.copy(g.position).setY(g.position.y + 0.95);
      if (close) tags[name].anchor.x += name === "you" ? -0.45 : 0.45;       // two tags side by side
    }
    rival.group.visible = !!shown.rival;
    tags.rival.el.parentElement.style.display = shown.rival ? "" : "none";
    flag.cloth.rotation.y = Math.sin(time * 2.4) * 0.22;
    smokes[0].update(dt, 0.22, 0.1, [0.1, 0.5], 0.5, 3);
    smokes[1].update(dt, 0.2, 0.1, [0.1, 0.55], 0.65, 3);
    steam.update(dt, 0.3, 0.04, [0.15, 0.6], 0.22, 4);
    const th = time * 0.55;
    beamPivot.rotation.y = th;
    sweep.target.position.copy(beamPivot.position).add(new THREE.Vector3(Math.cos(th) * 4.5, -0.56, -Math.sin(th) * 4.5));
    lhGlow.material.opacity = 0.7 + 0.3 * Math.max(0, Math.cos(th - 0.9));
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.userData.t += dt;
      if (b.userData.t < 0) { b.visible = false; continue; }
      b.visible = true;
      b.position.y += b.userData.vy * dt;
      b.material.opacity = Math.max(0, 0.85 - b.userData.t * 0.5);
      if (b.userData.t > 1.7) { root.remove(b); b.material.dispose(); bubbles.splice(i, 1); }
    }
  });

  // ---- the launch of "Nerpa" (CLAUDE.md v3.1, 19 p. 1-2): the pin comes out, the crane lowers the
  // bathyscaphe, a splash with rings and droplets; the camera watches from a medium shot (>= 3 units)
  const fx = [];                                   // short-lived ripples and droplets
  function ripple(p, color, size, dur) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(p).setY(p.y + 0.01);
    root.add(m);
    fx.push({ m, t: 0, dur, update(k) { m.scale.setScalar(0.05 + k * size); m.material.opacity = 0.8 * (1 - k); } });
  }
  function droplets(p) {
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: whiteSoft, color: 0xe8f6ff, transparent: true, depthWrite: false }));
      d.scale.setScalar(0.035 + Math.random() * 0.03);
      d.position.copy(p);
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 0.7;
      const v = new THREE.Vector3(Math.cos(a) * sp * 0.6, 1.2 + Math.random() * 1.1, Math.sin(a) * sp * 0.6);
      root.add(d);
      fx.push({ m: d, t: 0, dur: 0.9, update(k, dt) { v.y -= 4.5 * dt; d.position.addScaledVector(v, dt); d.material.opacity = 1 - k; } });
    }
  }
  const nerpaWorld = (v) => aurora.bathy.getWorldPosition(v);
  async function launchNerpa() {
    const y0 = goldPin.position.y;
    await anim(0.8, (k) => { goldPin.position.y = y0 + ease(k) * 1.4; goldPin.scale.setScalar(1 - k * 0.999); });
    goldPin.visible = false;
    view.follow(nerpaWorld, { dist: 3.4, tilt: 18, yaw: 38, rate: 1.6 });
    await sleep(1300);
    await anim(1.8, (k) => { aurora.bathy.position.y = 0.27 - ease(k) * 0.3; aurora.cable.scale.y = 0.05 + ease(k) * 0.3; });
    const p = nerpaWorld(new THREE.Vector3());
    ripple(p, 0xffffff, 0.9, 1.6); ripple(p, 0xcfe9ef, 0.55, 1.2); droplets(p);
    await sleep(450);
    anim(1.3, (k) => { aurora.bathy.position.y = -0.03 - k * 0.25; aurora.bathy.scale.setScalar(1 - k * 0.7); aurora.cable.scale.y = 0.35 + k * 0.25; });
    await sleep(1000);
  }
  /** After the dive: Nerpa back on the A-frame, the camera back at the table, the gold pin back. */
  let recovered = null;
  function resetNerpa(found = false) {
    aurora.bathy.position.y = 0.27; aurora.bathy.scale.setScalar(1); aurora.cable.scale.y = 0.05;
    if (found && !recovered) {                  // the recorder lies on the deck by the house and blinks
      recovered = new THREE.Group();
      recovered.add(mesh(new THREE.BoxGeometry(0.13, 0.085, 0.1), std({ color: 0xe8692b, roughness: 0.45 })));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(6) }));
      led.position.set(0.075, 0, 0); recovered.add(led);
      const glow = new THREE.PointLight(0xffb060, 1.6, 2.5, 2); glow.position.y = 0.25; recovered.add(glow);
      recovered.position.set(0.12, 0.21, 0.22); recovered.userData.led = led;
      aurora.body.add(recovered);
    }
    goldPin.scale.setScalar(1);
    view.follow(null);
    placePins();
  }
  view.onFrame((dt, time) => {
    if (recovered) recovered.userData.led.visible = Math.sin(time * 5) > 0.3;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.update(k, dt);
      if (k >= 1) { root.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); }
    }
  });

  // ---- picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function cellAt(clientX, clientY) {
    const rect = view.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    return kalka.pick(ray.ray);
  }

  showPlans(state); setStorm(state.campaign?.storm); setDecoy(state.campaign?.decoy);
  return {
    setState, play, cellAt, setRoute,
    hover: kalka.hover, target: kalka.target,
    launchNerpa, resetNerpa,
    /** World point of our ship (the cinema camera follows it). */
    shipPoint: (v) => v.copy(aurora.group.position),
    showAdvice(on) { adviceShown = on; showPlans(shown); },
    showForecast(cell) {
      forecastGhost.group.visible = !!cell;
      if (!cell) return;
      const [u, v] = centre(cell);
      forecastGhost.group.position.copy(toWorld(u, v)).setY(kalka.heightAt(u, v) + 0.02);
    },
    showZone(cell, tool) { kalka.zone(cell, tool); },
    showBand(axis, from, to) { kalka.band(axis, from, to); },
    pulse(cell, color = 0xE3A635) { kalka.ring(cell, color, 1.6); },
    showRivalZone(on) {
      const plan = shown.rival?.plan;
      kalka.rivalZone(on && plan ? plan.target : null, plan?.tool);
    },
    cellScreen: (x, y) => { const [u, v] = centre([x, y]); return view.toScreen(toWorld(u, v).setY(kalka.heightAt(u, v))); },
  };
}
