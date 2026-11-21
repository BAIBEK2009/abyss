// «Nerpa-2», the deep-sea vehicle of «Tulpar» (CLAUDE.md 23.3-A): one model for the deck, the descent and the
// view from the seabed. Built after the layout of the Triton 3300/3 (an acrylic sphere in the middle, syntactic
// foam pontoons either side, ~3.2 m long, ~2 m high) with details of WHOI's Alvin (an orange sail with the
// hatch, two manipulators on swing arms, the sample basket in front, a light bar over the viewport).
//   - rounded shapes only (lathes, tubes, rounded boxes, extrusions): no bare Box or Cylinder;
//   - wear: chipped paint, scratches, grime; the name (i18n nerpa_plate) and a small flag;
//   - ~140 parts: the static ones merged by material into 13 meshes; thrusters, lamps and the dome stay separate.
// Local axes: y up from the bottom of the skids, the bow (the sphere) towards +z.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { canvasTexture, rng } from "../view.js";
import { t } from "../i18n.js";

const rbox = (w, h, d, r = 0.03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const tube = (pts, r, seg = 24, rs = 10) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, rs, false);

/** Painted surface with wear: chipped edges showing primer, scratches, grime streaks; plus its roughness. */
function wornPaint(hex, seed, { chips = 1, streaks = 1, metal = 0.15, rough = 0.55 } = {}) {
  const r = rng(seed), base = new THREE.Color(hex);
  const css = `rgb(${(base.r * 255) | 0},${(base.g * 255) | 0},${(base.b * 255) | 0})`;
  const map = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = css; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.04})`; g.fillRect(r() * w, r() * h, 2, 2); }
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2, 2); }
    for (let i = 0; i < 70 * chips; i++) {                      // chips: primer grey with a dark rim
      const x = r() * w, y = r() * h, rr = 1.5 + r() * 6 * chips;
      g.fillStyle = "rgba(40,40,40,.5)"; g.beginPath(); g.ellipse(x, y, rr + 1, rr * 0.7 + 1, r() * 3, 0, 7); g.fill();
      g.fillStyle = "rgba(170,172,168,.9)"; g.beginPath(); g.ellipse(x, y, rr, rr * 0.7, r() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 60; i++) {                             // scratches
      g.strokeStyle = `rgba(230,230,225,${0.12 + r() * 0.25})`; g.lineWidth = 0.6 + r();
      g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 30); g.stroke();
    }
    for (let i = 0; i < 24 * streaks; i++) {                   // grime and rust streaks running down
      const x = r() * w, y = r() * h * 0.7, len = 40 + r() * 140;
      const gr = g.createLinearGradient(x, y, x, y + len); gr.addColorStop(0, "rgba(90,60,30,.32)"); gr.addColorStop(1, "rgba(90,60,30,0)");
      g.fillStyle = gr; g.fillRect(x, y, 1.5 + r() * 3, len);
    }
  });
  const roughMap = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.2})`; g.fillRect(r() * w, r() * h, 2, 2); }
  }, false);
  return new THREE.MeshStandardMaterial({ map, roughnessMap: roughMap, roughness: rough, metalness: metal });
}

function decal(w, h, draw) {
  const m = new THREE.MeshStandardMaterial({ map: canvasTexture(w, h, draw), transparent: true, roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
  return m;
}

const SOFT = canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

/**
 * opts.lights: real SpotLights in the lamps (the descent and the seabed); on the deck only glowing glass.
 * Returns a Group; userData: { lamps: [{glow, sl}], props, strobe, eye (the lift ring, local), update(dt, time), meshCount }.
 */
export function createNerpa({ lights = false } = {}) {
  const root = new THREE.Group();
  const parts = new THREE.Group();          // static parts, merged by material at the end
  root.add(parts);
  let count = 0;
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = parts) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parent.add(m); count++;
    return m;
  };

  // ---------------- materials
  const foam = wornPaint(0xffd94a, 31, { chips: 1.2 });                  // syntactic foam, yellow
  const foamWhite = wornPaint(0xeeeae0, 32, { chips: 0.8 });
  const orange = wornPaint(0xf06a1e, 33, { chips: 1, metal: 0.2 });    // the sail, international orange
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9b1b7, metalness: 0.85, roughness: 0.32 });
  const dark = wornPaint(0x2c3136, 34, { chips: 0.5, streaks: 0.4, metal: 0.45, rough: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.4, metalness: 0.3 });
  const seatM = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.8 });
  const glassLamp = new THREE.MeshPhysicalMaterial({ color: 0x5d7480, emissive: 0xcfe8ff, emissiveIntensity: 0.06, roughness: 0.04, metalness: 0.2, clearcoat: 1 });
  const ledM = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, emissive: 0xeaf6ff, emissiveIntensity: 0.3, roughness: 0.2 });
  const screenM = new THREE.MeshBasicMaterial({ map: canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = "#03110e"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#3ee0a8"; g.lineWidth = 2; for (const rr of [20, 40, 58]) { g.beginPath(); g.arc(64, 64, rr, 0, 7); g.stroke(); }
    g.fillStyle = "#ffcf5a"; g.font = "700 26px PT Mono, monospace"; g.fillText("0947", 140, 52);
    g.fillStyle = "#3ee0a8"; g.fillRect(140, 70, 90, 8); g.fillRect(140, 88, 60, 8);
  }), color: new THREE.Color(1, 1, 1).multiplyScalar(1.6), side: THREE.DoubleSide });

  // ---------------- the acrylic sphere (the pilot's viewport), its steel equator ring and bolts
  const SC = new THREE.Vector3(0, 1.05, 0.5), SR = 0.74;
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0xe8f6fb, roughness: 0.02, metalness: 0, transmission: 0.92, thickness: 0.12, ior: 1.49,
                                                   transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SR, 48, 32), acrylic);
  dome.position.copy(SC); dome.renderOrder = 2; root.add(dome);
  add(new THREE.TorusGeometry(SR + 0.02, 0.045, 12, 64), steel, SC.x, SC.y, SC.z, Math.PI / 2);
  // bolts on the equator ring: instanced
  const boltGeo = lathe([[0, 0], [0.011, 0], [0.011, 0.007], [0.007, 0.012], [0, 0.013]], 6);
  const bolts = new THREE.InstancedMesh(boltGeo, steel, 40);
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    bq.setFromUnitVectors(up, dir);
    bm.compose(SC.clone().addScaledVector(dir, SR + 0.055).add(new THREE.Vector3(0, 0.03, 0)), bq, new THREE.Vector3(1, 1, 1));
    bolts.setMatrixAt(i, bm);
  }
  root.add(bolts);
  // inside: the pilot's seat, the console with glowing screens, the joystick
  add(rbox(0.48, 0.1, 0.46, 0.04), seatM, 0, 0.62, 0.42);
  add(rbox(0.46, 0.56, 0.09, 0.04), seatM, 0, 0.92, 0.18, -0.2);
  add(rbox(0.26, 0.14, 0.08, 0.04), seatM, 0, 1.28, 0.12, -0.2);
  add(rbox(0.86, 0.08, 0.3, 0.03), dark, 0, 0.78, 0.92, 0.35);
  const scr = add(new THREE.PlaneGeometry(0.34, 0.17), screenM, -0.18, 0.86, 0.86, -0.55, 0, 0, root);
  scr.rotation.order = "YXZ"; count--;
  const scr2 = add(new THREE.PlaneGeometry(0.34, 0.17), screenM, 0.2, 0.86, 0.86, -0.55, 0, 0, root); count--; scr2.rotation.order = "YXZ";
  add(lathe([[0.012, 0], [0.012, 0.12], [0.022, 0.14], [0.02, 0.17], [0, 0.18]], 12), black, 0.2, 0.62, 0.62);

  // ---------------- the foam pontoons either side, white end caps, battery pods and ballast under them
  for (const sx of [-1, 1]) {
    const x = sx * 1.12;
    add(lathe([[0, -1.5], [0.18, -1.47], [0.3, -1.38], [0.36, -1.2], [0.37, 0.9], [0.35, 1.15], [0.28, 1.33], [0.15, 1.43], [0, 1.46]], 36), foam, x, 1.05, 0, Math.PI / 2);
    add(lathe([[0, -0.08], [0.25, -0.06], [0.36, 0], [0.365, 0.05], [0, 0.05]], 36), foamWhite, x, 1.05, 1.22, Math.PI / 2);
    add(new THREE.TorusGeometry(0.372, 0.018, 8, 40), dark, x, 1.05, 1.1);          // band clamps
    add(new THREE.TorusGeometry(0.372, 0.018, 8, 40), dark, x, 1.05, -0.9);
    add(lathe([[0, -0.85], [0.12, -0.83], [0.17, -0.7], [0.17, 0.7], [0.12, 0.83], [0, 0.85]], 20), dark, sx * 0.98, 0.46, -0.25, Math.PI / 2);   // battery pod
    add(rbox(0.26, 0.16, 0.42, 0.05), black, sx * 0.62, 0.3, 0.95);                    // drop weights
    add(rbox(0.26, 0.16, 0.42, 0.05), black, sx * 0.62, 0.3, -1.1);
  }
  // ---------------- the top: foam block, the orange sail with the hatch and the lift ring
  add(rbox(2.0, 0.44, 1.7, 0.18), foam, 0, 1.68, -0.68);
  add(rbox(0.82, 0.56, 0.98, 0.2), orange, 0, 2.16, -0.72);
  add(lathe([[0, 0], [0.3, 0], [0.31, 0.04], [0.28, 0.08], [0.2, 0.1], [0, 0.11]], 32), steel, 0, 2.44, -0.72);
  add(rbox(0.1, 0.06, 0.12, 0.02), steel, 0.24, 2.5, -0.72);                           // the hatch hinge
  add(lathe([[0.03, 0], [0.03, 0.1], [0, 0.1]], 12), steel, 0, 2.53, -0.72);
  add(new THREE.TorusGeometry(0.1, 0.028, 10, 28), steel, 0, 2.7, -0.72);               // the lift ring (the crane hooks here)
  add(new THREE.SphereGeometry(0.11, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, 2.44, -0.28);   // the sonar dome on the sail
  add(lathe([[0.012, 0], [0.008, 0.7], [0, 0.71]], 8), steel, 0.3, 2.44, -1.08);        // the antenna
  // ---------------- the frame: tubes from the pontoons to the sphere ring, the skids
  for (const sx of [-1, 1]) {
    add(tube([[sx * 1.0, 1.0, 1.0], [sx * 0.85, 1.0, 0.85], [sx * SR, SC.y, SC.z + 0.05]], 0.035, 12), steel);
    add(tube([[sx * 1.0, 1.05, -0.3], [sx * 0.6, 0.92, -0.05], [sx * 0.55, 0.62, 0.15]], 0.035, 12), steel);
    add(tube([[sx * 0.78, 0.07, -1.55], [sx * 0.78, 0.05, -1.1], [sx * 0.78, 0.05, 1.1], [sx * 0.74, 0.14, 1.55], [sx * 0.66, 0.32, 1.72]], 0.05, 32), steel);
    for (const z of [-1.0, 0.0, 0.95]) add(tube([[sx * 0.78, 0.08, z], [sx * 0.86, 0.45, z], [sx * 1.06, 0.72, z]], 0.032, 8), steel);
  }
  add(tube([[-0.78, 0.08, -1.4], [0, 0.1, -1.42], [0.78, 0.08, -1.4]], 0.03, 8), steel);
  // ---------------- the light bar over the sphere and the two lamps on swing arms
  add(tube([[-0.98, 1.66, 0.62], [-0.5, 1.92, 0.9], [0.5, 1.92, 0.9], [0.98, 1.66, 0.62]], 0.03, 24), steel);
  for (const x of [-0.5, -0.17, 0.17, 0.5]) {
    add(rbox(0.22, 0.08, 0.07, 0.025), dark, x, 1.94, 0.95, -0.4);
    add(new THREE.PlaneGeometry(0.18, 0.05), ledM, x, 1.92, 0.99, -0.4);
  }
  const lampSpots = [];
  for (const sx of [-1, 1]) {
    add(tube([[sx * 1.1, 1.0, 1.2], [sx * 1.08, 0.82, 1.38], [sx * 0.98, 0.72, 1.48]], 0.03, 10), steel);
    add(lathe([[0, -0.14], [0.08, -0.13], [0.1, -0.06], [0.11, 0.06], [0.1, 0.08], [0, 0.08]], 22), dark, sx * 0.98, 0.72, 1.55, Math.PI / 2);
    add(new THREE.CircleGeometry(0.085, 22), glassLamp, sx * 0.98, 0.72, 1.632);
    add(new THREE.TorusGeometry(0.092, 0.012, 8, 28), steel, sx * 0.98, 0.72, 1.635);
    add(lathe([[0, 0], [0.04, 0], [0.03, 0.025], [0, 0.03]], 16), steel, sx * 0.98, 0.72, 1.6, Math.PI / 2);   // the reflector's centre
    lampSpots.push(new THREE.Vector3(sx * 0.98, 0.72, 1.66));
  }
  // ---------------- the manipulators, folded on their swing arms, and the sample basket
  for (const sx of [-1, 1]) {
    const bx = sx * 0.5;
    add(lathe([[0, -0.07], [0.07, -0.06], [0.075, 0.06], [0, 0.07]], 16), dark, bx, 0.42, 1.22, 0, 0, Math.PI / 2);   // shoulder
    add(rbox(0.09, 0.09, 0.5, 0.03), steel, bx, 0.5, 1.45, -0.35);                                                    // upper arm
    add(lathe([[0, -0.05], [0.05, -0.04], [0.05, 0.04], [0, 0.05]], 14), dark, bx, 0.6, 1.67, 0, 0, Math.PI / 2);       // elbow
    add(rbox(0.075, 0.075, 0.42, 0.025), steel, bx, 0.48, 1.55, 0.6);                                                 // forearm, folded back
    add(lathe([[0.03, 0], [0.04, 0.03], [0.04, 0.08], [0.03, 0.1]], 12), dark, bx, 0.36, 1.42, -Math.PI / 2 - 0.6);   // wrist
    for (const j of [-1, 1]) add(rbox(0.02, 0.03, 0.13, 0.008), black, bx + j * 0.025, 0.33, 1.33, 0.5, j * 0.18);     // the jaws
    add(tube([[bx, 0.42, 1.22], [bx * 0.7, 0.6, 1.0], [bx * 0.6, 0.85, 0.95]], 0.012, 12), rubber);                     // the hydraulic hose
  }
  const gridTex = canvasTexture(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = "#cfd3d5"; g.lineWidth = 5;
    for (let x = 2; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 2; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  gridTex.generateMipmaps = false; gridTex.minFilter = THREE.LinearFilter;      // mipmaps would eat the thin wires
  const netM = new THREE.MeshStandardMaterial({ map: gridTex, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 });
  const BX = 0.62, BY0 = 0.12, BY1 = 0.44, BZ0 = 1.62, BZ1 = 2.02;
  const edges = [[-BX, BY0, BZ0, BX, BY0, BZ0], [-BX, BY0, BZ1, BX, BY0, BZ1], [-BX, BY1, BZ1, BX, BY1, BZ1], [-BX, BY1, BZ0, BX, BY1, BZ0],
                 [-BX, BY0, BZ0, -BX, BY0, BZ1], [BX, BY0, BZ0, BX, BY0, BZ1], [-BX, BY1, BZ0, -BX, BY1, BZ1], [BX, BY1, BZ0, BX, BY1, BZ1],
                 [-BX, BY0, BZ0, -BX, BY1, BZ0], [BX, BY0, BZ0, BX, BY1, BZ0], [-BX, BY0, BZ1, -BX, BY1, BZ1], [BX, BY0, BZ1, BX, BY1, BZ1]];
  for (const [x0, y0, z0, x1, y1, z1] of edges) add(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)), 1, 0.018, 6), steel);
  add(new THREE.PlaneGeometry(BX * 2, BY1 - BY0), netM, 0, (BY0 + BY1) / 2, BZ1);
  add(new THREE.PlaneGeometry(BZ1 - BZ0, BY1 - BY0), netM, -BX, (BY0 + BY1) / 2, (BZ0 + BZ1) / 2, 0, Math.PI / 2);
  add(new THREE.PlaneGeometry(BZ1 - BZ0, BY1 - BY0), netM, BX, (BY0 + BY1) / 2, (BZ0 + BZ1) / 2, 0, Math.PI / 2);
  add(new THREE.PlaneGeometry(BX * 2, BZ1 - BZ0), netM, 0, BY0, (BZ0 + BZ1) / 2, -Math.PI / 2);
  add(tube([[-0.66, 0.12, 1.62], [-0.7, 0.1, 1.2]], 0.02, 2), steel); add(tube([[0.66, 0.12, 1.62], [0.7, 0.1, 1.2]], 0.02, 2), steel);
  // ---------------- the camera on its pan-tilt bracket, the strobe
  add(rbox(0.08, 0.16, 0.08, 0.02), dark, 0.62, 2.0, 0.55);
  add(rbox(0.16, 0.12, 0.22, 0.04), dark, 0.62, 2.12, 0.58);
  add(lathe([[0.035, 0], [0.045, 0.02], [0.045, 0.06], [0, 0.06]], 16), black, 0.62, 2.12, 0.69, Math.PI / 2);
  add(lathe([[0.04, 0], [0.04, 0.05], [0, 0.05]], 12), black, -0.3, 2.44, -1.12);

  // ---------------- decals: the name on both sides of the foam, the flag of Kazakhstan on the sail
  const nameM = decal(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#16181a"; g.font = "800 92px Onest, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(t("nerpa_plate"), w / 2, h / 2 + 4);
  });
  add(new THREE.PlaneGeometry(1.1, 0.27), nameM, -1.003, 1.68, -0.68, 0, -Math.PI / 2);
  add(new THREE.PlaneGeometry(1.1, 0.27), nameM, 1.003, 1.68, -0.68, 0, Math.PI / 2);
  const flagM = decal(192, 96, (g, w, h) => {
    g.fillStyle = "#00afca"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fec50c";
    for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 15, h * 0.42 + Math.sin(a) * 15); g.lineTo(w / 2 + Math.cos(a + 0.1) * 23, h * 0.42 + Math.sin(a + 0.1) * 23); g.lineTo(w / 2 + Math.cos(a + 0.2) * 15, h * 0.42 + Math.sin(a + 0.2) * 15); g.fill(); }
    g.beginPath(); g.arc(w / 2, h * 0.42, 13, 0, 7); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 34, h * 0.74); g.quadraticCurveTo(w / 2, h * 0.6, w / 2 + 34, h * 0.74); g.quadraticCurveTo(w / 2, h * 0.67, w / 2 - 34, h * 0.74); g.fill();
    for (let y = 6; y < h - 4; y += 12) { g.fillRect(10, y, 7, 6); g.fillRect(19, y + 3, 4, 4); }
  });
  add(new THREE.PlaneGeometry(0.3, 0.15), flagM, -0.413, 2.24, -0.6, 0, -Math.PI / 2);
  add(new THREE.PlaneGeometry(0.3, 0.15), flagM, 0.413, 2.24, -0.6, 0, Math.PI / 2);

  // ---------------- moving parts: the ducted thrusters (propellers turn), the strobe, the lamps
  const props = [];
  function thruster(x, y, z, axis) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    if (axis === "y") g.rotation.x = -Math.PI / 2; else if (axis === "x") g.rotation.y = Math.PI / 2;
    root.add(g);
    const duct = new THREE.Mesh(lathe([[0.17, -0.12], [0.205, -0.115], [0.215, -0.04], [0.21, 0.08], [0.19, 0.12], [0.175, 0.1], [0.17, -0.12]], 32), dark);
    duct.rotation.x = Math.PI / 2; g.add(duct);
    const hub = new THREE.Mesh(lathe([[0, -0.09], [0.04, -0.07], [0.045, 0.04], [0.02, 0.08], [0, 0.09]], 16), steel); hub.rotation.x = Math.PI / 2; g.add(hub);
    const prop = new THREE.Group(); g.add(prop);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(rbox(0.14, 0.012, 0.06, 0.006, 2), steel); b.position.x = 0.09; const arm = new THREE.Group(); arm.rotation.z = (k / 3) * Math.PI * 2; b.rotation.x = 0.5; arm.add(b); prop.add(arm); }
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.008, 6, 32), steel); guard.position.z = -0.12; g.add(guard);
    for (let k = 0; k < 2; k++) { const s = new THREE.Mesh(rbox(0.38, 0.012, 0.012, 0.005, 1), steel); s.position.z = -0.12; s.rotation.z = (k * Math.PI) / 2; g.add(s); }
    const strut = new THREE.Mesh(rbox(0.06, 0.06, 0.2, 0.02), dark); strut.position.set(0, 0.22, 0); g.add(strut);
    count += 9;
    props.push(prop);
  }
  thruster(-1.12, 1.05, -1.72, "z"); thruster(1.12, 1.05, -1.72, "z");      // aft, main propulsion
  thruster(-1.12, 1.47, -0.2, "y"); thruster(1.12, 1.47, -0.2, "y");        // vertical, on the pontoons
  thruster(0, 2.14, -1.32, "x");                                             // lateral, in the sail (as on Alvin)
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf6ff).multiplyScalar(5) }));
  strobe.position.set(-0.3, 2.5, -1.12); root.add(strobe);
  const strobeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: 0xeaf6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  strobeGlow.scale.setScalar(0.5); strobeGlow.position.copy(strobe.position); root.add(strobeGlow);
  const lamps = lampSpots.map((p) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: new THREE.Color(0xdff2ff).multiplyScalar(4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.setScalar(1.1); glow.position.copy(p); root.add(glow);
    let sl = null;
    if (lights) { sl = new THREE.SpotLight(0xdff2ff, 0, 18, 0.45, 0.5, 1.3); sl.position.copy(p); sl.target.position.set(p.x * 0.5, -3, p.z + 8); root.add(sl, sl.target); }
    else sl = { intensity: 0 };
    return { glow, sl };
  });

  // ---------------- merge the static parts by material (13 draw calls instead of ~100)
  parts.updateMatrixWorld(true);
  const buckets = new Map();
  for (const m of [...parts.children]) {
    let g = m.geometry.clone().applyMatrix4(m.matrix);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(g);
    parts.remove(m);
  }
  for (const [mat, list] of buckets) {
    const merged = new THREE.Mesh(mergeGeometries(list), mat);
    merged.castShadow = true; merged.receiveShadow = true;
    parts.add(merged);
  }
  root.traverse((o) => { if (o.isMesh && o !== dome) { o.castShadow = true; o.receiveShadow = true; } });

  let strobeT = 0;
  root.userData = {
    lamps, props, strobe, meshCount: count, drawCalls: parts.children.length,
    eye: new THREE.Vector3(0, 2.72, -0.72),
    /** Turn the propellers (speed 0..1) and blink the strobe. */
    update(dt, time, spin = 0.15) {
      for (const p of props) p.rotation.z += dt * (2 + spin * 40);
      strobeT = time % 1.6;
      const on = strobeT < 0.06;
      strobe.material.color.setScalar(on ? 5 : 0.4);
      strobeGlow.material.opacity = on ? 1 : 0;
    },
  };
  return root;
}
