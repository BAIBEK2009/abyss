// «Nerpa-2», the deep-sea vehicle of «Tulpar» (CLAUDE.md 23.3-A): one model for the deck, the descent and the
// seabed. After the Triton 3300/3: the big acrylic sphere (~1.6 m) in front is the vehicle — the pilot sits in
// it, lit by the console screens and the cabin light; behind it one smooth yellow syntactic-foam fairing wraps
// the sphere from the back and the sides (no separate "torpedoes"); ducted thrusters on the rear corners; the
// lamps on the front crossbar; an orange hatch tower with the lift ring on top; tubular skids under it all.
// Clean glossy paint; the wear is only scuffed edges, panel seams and bolts. The name (i18n nerpa_plate) and
// the flag of Kazakhstan are large on the fairing's flank. No bare Box or Cylinder anywhere.
// Local axes: y up from the bottom of the skids, the sphere towards +z.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { decalGeometry } from "./decal.js";
import { canvasTexture, rng } from "../view.js";
import { t } from "../i18n.js";

const rbox = (w, h, d, r = 0.03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const tube = (pts, r, seg = 24, rs = 10) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, rs, false);
const line = (a, b, r) => new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b)), 1, r, 8, false);

/** Clean glossy paint: panel seams in a normal map, scuffs only along the panel edges. */
function glossPaint(hex, seed, { clear = 0.8, rough = 0.26, scale = 1 } = {}) {
  const r = rng(seed), S = 512;
  const hc = document.createElement("canvas"); hc.width = hc.height = S;
  const hg = hc.getContext("2d");
  hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  hg.fillStyle = "#4a4a4a"; hg.fillRect(0, 0, S, 4); hg.fillRect(0, 0, 4, S);            // the seams at the tile edges
  const d = hg.getImageData(0, 0, S, S).data, out = new Uint8ClampedArray(d.length);
  const H = (x, y) => d[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.5, dy = (H(x, y + 1) - H(x, y - 1)) * 2.5, l = Math.hypot(dx, dy, 1), k = (y * S + x) * 4;
    out[k] = (-dx / l * 0.5 + 0.5) * 255; out[k + 1] = (dy / l * 0.5 + 0.5) * 255; out[k + 2] = (1 / l * 0.5 + 0.5) * 255; out[k + 3] = 255;
  }
  const nc = document.createElement("canvas"); nc.width = nc.height = S; nc.getContext("2d").putImageData(new ImageData(out, S, S), 0, 0);
  const normalMap = new THREE.CanvasTexture(nc);
  const base = new THREE.Color(hex);
  const css = `rgb(${(base.r * 255) | 0},${(base.g * 255) | 0},${(base.b * 255) | 0})`;
  const map = canvasTexture(S, S, (g, w, h) => {
    g.fillStyle = css; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {           // scuffs: short pale strokes hugging the panel edges only
      const along = r() * w, off = 4 + r() * 12, len = 10 + r() * 50, vert = r() < 0.5;
      g.strokeStyle = `rgba(250,248,240,${0.12 + r() * 0.2})`; g.lineWidth = 1 + r() * 1.6;
      g.beginPath();
      if (vert) { g.moveTo(off, along); g.lineTo(off + (r() - 0.5) * 4, along + len); } else { g.moveTo(along, off); g.lineTo(along + len, off + (r() - 0.5) * 4); }
      g.stroke();
    }
  });
  const roughMap = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = "#6a6a6a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#b4b4b4"; g.fillRect(0, 0, w, 5); g.fillRect(0, 0, 5, h);          // the edges are less glossy
  }, false);
  for (const tx of [normalMap, map, roughMap]) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(scale, scale); }
  return new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: roughMap, roughness: rough,
                                          metalness: 0.05, clearcoat: clear, clearcoatRoughness: 0.12 });
}

function decal(w, h, draw) {
  return new THREE.MeshStandardMaterial({ map: canvasTexture(w, h, draw), transparent: true, roughness: 0.3, metalness: 0.05,
                                          polygonOffset: true, polygonOffsetFactor: -4 });
}

const SOFT = canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

/**
 * opts.lights: real SpotLights in the front lamps (the descent and the seabed); on the deck only lit glass.
 * Returns a Group; userData: { lamps: [{glow, sl, at}], props, strobe, eye, sphere, update(dt, time, spin), meshCount, drawCalls }.
 */
export function createNerpa({ lights = false, env = null, glass = "blend" } = {}) {
  const root = new THREE.Group();
  const parts = new THREE.Group();          // static parts, merged by material at the end
  const inside = new THREE.Group();         // the pilot's compartment (merged separately: it is seen through the acrylic)
  root.add(parts, inside);
  let count = 0;
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = parts) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parent.add(m); count++;
    return m;
  };

  // ---------------- materials
  const foam = glossPaint(0xffc414, 31, { scale: 1.4 });           // signal yellow-orange
  const orange = glossPaint(0xf0641c, 33, { scale: 2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4bcc2, metalness: 0.9, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f34, metalness: 0.5, roughness: 0.42 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.4, metalness: 0.3 });
  const seatM = new THREE.MeshStandardMaterial({ color: 0x24364f, roughness: 0.7 });
  const suit = new THREE.MeshStandardMaterial({ color: 0xd2582a, roughness: 0.75 });          // an orange coverall: it reads against the dark liner
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89b7b, roughness: 0.7 });
  const lampGlass = new THREE.MeshPhysicalMaterial({ color: 0x4d6470, emissive: 0xcfe8ff, emissiveIntensity: 0.05, roughness: 0.04, metalness: 0.2, clearcoat: 1 });
  const ledM = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, emissive: 0xeaf6ff, emissiveIntensity: 0.35, roughness: 0.2 });
  const screenTex = (kind) => canvasTexture(256, 160, (g, w, h) => {
    g.fillStyle = "#020c0b"; g.fillRect(0, 0, w, h);
    if (kind === 0) { g.strokeStyle = "#3ee0a8"; g.lineWidth = 3; for (const rr of [22, 44, 66]) { g.beginPath(); g.arc(w / 2, h - 6, rr, Math.PI, 0); g.stroke(); } g.fillStyle = "#c8ff6a"; g.fillRect(w / 2 + 20, h - 50, 8, 6); }
    else if (kind === 1) { g.fillStyle = "#ffcf5a"; g.font = "700 64px PT Mono, monospace"; g.textAlign = "center"; g.fillText("0947", w / 2, 92); g.fillStyle = "#3ee0a8"; g.fillRect(30, 118, 196, 10); }
    else { g.strokeStyle = "#7fd8ff"; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, 80 + Math.sin(x * 0.07) * 30 + Math.sin(x * 0.19) * 10); g.stroke(); }
  });
  const screens = [0, 1, 2].map((k) => new THREE.MeshBasicMaterial({ map: screenTex(k), color: new THREE.Color(1, 1, 1).multiplyScalar(1.8), side: THREE.DoubleSide }));

  // ---------------- the acrylic sphere: ~1.6 m, transparent, glossy; the pilot inside
  const SC = new THREE.Vector3(0, 1.15, 0.62), SR = 0.8;
  // clear acrylic; its own environment map gives the glints even in the black deep (no scene environment there).
  // Under water: real transmission (ior 1.49, a thin wall so the pilot is not smeared). On the deck (500+ draw
  // calls) transmission would render the whole ship twice, so the glass is blended there — it looks the same.
  const acrylic = glass === "transmission"
    ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transmission: 1, ior: 1.49, thickness: 0.03,
                                       clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, envMap: env, envMapIntensity: 0.45 })
    : new THREE.MeshPhysicalMaterial({ color: 0xeaf7ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, ior: 1.49,
                                       clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, envMap: env, envMapIntensity: 2.2 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(SR, 64, 40), acrylic);
  sphere.position.copy(SC); sphere.renderOrder = 2; root.add(sphere);
  add(new THREE.TorusGeometry(SR + 0.012, 0.035, 12, 72), steel, SC.x, SC.y - 0.02, SC.z, Math.PI / 2);   // the equator flange
  const boltGeo = lathe([[0, 0], [0.011, 0], [0.011, 0.007], [0.007, 0.012], [0, 0.013]], 6);
  const bolts = new THREE.InstancedMesh(boltGeo, steel, 48);
  {
    const bm = new THREE.Matrix4();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      bm.makeTranslation(SC.x + Math.cos(a) * (SR + 0.047), SC.y - 0.006, SC.z + Math.sin(a) * (SR + 0.047));
      bolts.setMatrixAt(i, bm);
    }
  }
  root.add(bolts);
  // inside: the seat, the pilot (a silhouette with a headset), the console with three screens, the cabin light
  // the cabin liner: the back half of the sphere's inside is dark grey padding, so the pilot reads against it
  const liner = new THREE.Mesh(new THREE.SphereGeometry(SR - 0.03, 48, 24, Math.PI * 0.94, Math.PI * 1.12, 0.12, Math.PI * 0.8),
    new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.85, side: THREE.DoubleSide }));
  liner.position.copy(SC); root.add(liner);                                    // phi pi..2pi is the back half (-z)
  add(rbox(0.5, 0.1, 0.48, 0.04), seatM, 0, 0.58, 0.52, 0, 0, 0, inside);
  add(rbox(0.48, 0.62, 0.1, 0.05), seatM, 0, 0.92, 0.26, -0.18, 0, 0, inside);
  add(rbox(0.36, 0.42, 0.24, 0.1), suit, 0, 0.9, 0.42, -0.12, 0, 0, inside);                 // the torso
  add(rbox(0.38, 0.14, 0.42, 0.06), suit, 0, 0.68, 0.62, 0, 0, 0, inside);                   // the thighs
  add(new THREE.SphereGeometry(0.1, 20, 14), skin, 0, 1.24, 0.47, 0, 0, 0, inside);            // the head
  add(new THREE.TorusGeometry(0.105, 0.012, 6, 20, Math.PI), black, 0, 1.27, 0.47, 0, Math.PI / 2, 0, inside);   // the headset
  for (const sx of [-1, 1]) add(tube([[sx * 0.17, 1.04, 0.42], [sx * 0.2, 0.88, 0.56], [sx * 0.12, 0.84, 0.74]], 0.035, 10), suit, 0, 0, 0, 0, 0, 0, inside);
  add(rbox(0.9, 0.08, 0.28, 0.03), dark, 0, 0.8, 0.98, 0.42, 0, 0, inside);
  [-0.3, 0, 0.3].forEach((x, k) => add(new THREE.PlaneGeometry(0.26, 0.16), screens[k], x, 0.9, 0.95, -0.5, x * -0.6, 0, inside));
  add(lathe([[0.012, 0], [0.012, 0.12], [0.022, 0.14], [0.02, 0.17], [0, 0.18]], 12), black, 0.12, 0.76, 0.78, 0, 0, 0, inside);
  const cabinGlow = new THREE.Mesh(new THREE.TorusGeometry(SR - 0.06, 0.012, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fdcff).multiplyScalar(1.6) }));
  cabinGlow.rotation.x = Math.PI / 2; cabinGlow.position.set(SC.x, SC.y - 0.42, SC.z); root.add(cabinGlow);   // a soft light strip low inside
  const cabinLight = new THREE.PointLight(0xffc98a, 2.6, 2.2, 1.4);      // warm: the pilot and the console read in the dark cabinLight.position.set(0, 1.1, 0.95); root.add(cabinLight);
  const screenLight = new THREE.PointLight(0x7fffd2, 0.5, 1.2, 1.5); screenLight.position.set(0, 0.95, 0.85); root.add(screenLight);

  // ---------------- the fairing: one streamlined body — seen from above a drop that narrows aft, its arms wrap the
  // sphere's back half only (the sphere stands out in front and is seen from the side); lower and rounder aft
  const FY = 0.64, FT = 0.3, FD = 0.7, FH = FD + 2 * FT;   // bottom, bevel, slab depth, full height
  const SS = THREE.MathUtils.smoothstep;
  /** y (0..FH, from the bottom of the body) after the shaping: lower and rounder aft, a crowned top. */
  const shapeY = (x, y, z) => {
    const zt = THREE.MathUtils.clamp((z + 1.85) / 2.6, 0, 1), hf = 0.66 + 0.34 * SS(zt, 0, 0.75), yc = FH / 2;
    return yc + (y - yc) * hf - (1 - hf) * 0.14 * SS(y, 0, FH) + 0.07 * Math.max(0, 1 - (x / 1.1) ** 2) * SS(y, yc, FH);
  };
  const fairTop = (x, z) => FY - FT + shapeY(x, FH, z);
  let fairing;
  {
    const s = new THREE.Shape(), zs = (z) => -z;
    const R = SR + 0.06, cy = zs(SC.z);
    const tipA = -0.12;                                      // the arms end just behind the sphere's equator
    const tx = Math.cos(tipA) * R, tz = SC.z + Math.sin(tipA) * R;
    s.moveTo(tx + 0.02, zs(tz));
    s.splineThru([[1.0, 0.28], [1.04, -0.35], [0.92, -1.05], [0.62, -1.62], [0.26, -1.86], [0, -1.9], [-0.26, -1.86], [-0.62, -1.62], [-0.92, -1.05], [-1.04, -0.35], [-1.0, 0.28], [-tx - 0.02, tz]]
      .map(([x, z]) => new THREE.Vector2(x, zs(z))));
    s.absarc(0, cy, R, Math.PI + tipA, -tipA, true);      // round the back of the sphere, left tip to the right
    s.closePath();
    let geo = new THREE.ExtrudeGeometry(s, { depth: FD, bevelEnabled: true, bevelThickness: FT, bevelSize: 0.2, bevelSegments: 8, curveSegments: 48 });
    geo.rotateX(-Math.PI / 2);                                // shape y -> -z; the extrusion -> +y
    geo.translate(0, FT, 0);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setY(i, shapeY(pa.getX(i), pa.getY(i), pa.getZ(i)) - FT);
    geo.deleteAttribute("uv"); geo.deleteAttribute("normal");
    geo = mergeVertices(geo, 1e-4); geo.computeVertexNormals();
    // planar UVs (top view) so the paint's seams run straight across the body
    const uvs = new Float32Array(geo.attributes.position.count * 2);
    for (let i = 0; i < geo.attributes.position.count; i++) { uvs[i * 2] = geo.attributes.position.getX(i) * 0.5; uvs[i * 2 + 1] = geo.attributes.position.getZ(i) * 0.5 + geo.attributes.position.getY(i) * 0.25; }
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    fairing = add(geo, foam, 0, FY, 0); fairing.updateMatrixWorld();
  }
  // grab rails along the top, lifting eyes on the shoulders
  for (const sx of [-1, 1]) {
    const pts = [0.15, -0.3, -0.75, -1.2].map((z) => [sx * 0.72, fairTop(0.72, z) + 0.09, z]);
    add(tube(pts, 0.016, 24, 8), steel);
    for (const [, y, z] of pts) add(line([sx * 0.72, y, z], [sx * 0.72, y - 0.12, z], 0.012), steel);
    add(new THREE.TorusGeometry(0.05, 0.014, 8, 20), steel, sx * 0.9, fairTop(0.9, -1.25) + 0.03, -1.25, 0, Math.PI / 2);
  }
  // ---------------- the hatch tower on the fairing's back, the lift ring, the antenna, the sonar dome
  const TY = fairTop(0, -0.78) - 0.02;
  add(rbox(0.72, 0.36, 0.78, 0.16), orange, 0, TY + 0.14, -0.78);
  add(lathe([[0, 0], [0.27, 0], [0.28, 0.04], [0.25, 0.08], [0.18, 0.1], [0, 0.11]], 32), steel, 0, TY + 0.32, -0.78);
  add(rbox(0.1, 0.06, 0.12, 0.02), steel, 0.22, TY + 0.38, -0.78);
  add(lathe([[0.03, 0], [0.03, 0.1], [0, 0.1]], 12), steel, 0, TY + 0.41, -0.78);
  add(new THREE.TorusGeometry(0.1, 0.028, 10, 28), steel, 0, TY + 0.58, -0.78);             // the lift ring (the crane hooks here)
  add(new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, fairTop(0, -0.3) - 0.02, -0.3);
  add(lathe([[0.012, 0], [0.008, 0.6], [0, 0.61]], 8), steel, 0.28, TY + 0.3, -1.12);
  // ---------------- under it: the frame, the skids, battery pods, drop weights
  for (const sx of [-1, 1]) {
    add(tube([[sx * 0.78, 0.07, -1.5], [sx * 0.78, 0.05, -1.1], [sx * 0.78, 0.05, 1.1], [sx * 0.74, 0.14, 1.5], [sx * 0.62, 0.34, 1.68]], 0.05, 32), steel);
    for (const z of [-1.1, -0.2, 0.75]) add(tube([[sx * 0.78, 0.08, z], [sx * 0.8, 0.3, z], [sx * 0.82, 0.48, z]], 0.032, 8), steel);
    add(lathe([[0, -0.6], [0.11, -0.58], [0.14, -0.48], [0.14, 0.48], [0.11, 0.58], [0, 0.6]], 18), dark, sx * 0.5, 0.36, -0.75, Math.PI / 2);
    add(rbox(0.24, 0.14, 0.36, 0.05), black, sx * 0.55, 0.28, 0.5);
  }
  add(line([-0.78, 0.09, -1.35], [0.78, 0.09, -1.35], 0.03), steel);
  // ---------------- the front crossbar with the lamps, the manipulators, the sample basket, the camera
  add(tube([[-1.02, 0.86, 0.95], [-0.9, 0.62, 1.32], [0.9, 0.62, 1.32], [1.02, 0.86, 0.95]], 0.04, 32), steel);
  const lampAt = [];
  for (const x of [-0.72, -0.26, 0.26, 0.72]) {
    const big = Math.abs(x) > 0.5, rad = big ? 0.085 : 0.055;
    add(lathe([[0, -0.12], [rad - 0.01, -0.11], [rad + 0.012, -0.05], [rad + 0.015, 0.05], [rad + 0.01, 0.065], [0, 0.065]], 22), dark, x, 0.62, 1.4, Math.PI / 2);
    add(new THREE.CircleGeometry(rad, 22), lampGlass, x, 0.62, 1.468);
    add(new THREE.TorusGeometry(rad + 0.006, 0.01, 8, 28), steel, x, 0.62, 1.47);
    if (big) lampAt.push(new THREE.Vector3(x, 0.62, 1.5));
  }
  for (const x of [-0.42, -0.14, 0.14, 0.42]) {          // the LED strip over the sphere
    add(rbox(0.2, 0.07, 0.07, 0.025), dark, x, 2.0, 0.92, -0.45);
    add(new THREE.PlaneGeometry(0.16, 0.045), ledM, x, 1.985, 0.96, -0.45);
  }
  add(tube([[-0.8, 1.7, 0.55], [-0.5, 2.0, 0.88], [0.5, 2.0, 0.88], [0.8, 1.7, 0.55]], 0.026, 24), steel);
  for (const sx of [-1, 1]) {                            // the manipulators, folded on their swing arms
    const bx = sx * 0.46;
    add(lathe([[0, -0.07], [0.07, -0.06], [0.075, 0.06], [0, 0.07]], 16), dark, bx, 0.44, 1.18, 0, 0, Math.PI / 2);
    add(rbox(0.09, 0.09, 0.46, 0.03), steel, bx, 0.48, 1.38, -0.3);
    add(lathe([[0, -0.05], [0.05, -0.04], [0.05, 0.04], [0, 0.05]], 14), dark, bx, 0.55, 1.6, 0, 0, Math.PI / 2);
    add(rbox(0.075, 0.075, 0.38, 0.025), steel, bx, 0.44, 1.5, 0.65);
    add(lathe([[0.03, 0], [0.04, 0.03], [0.04, 0.08], [0.03, 0.1]], 12), dark, bx, 0.33, 1.38, -Math.PI / 2 - 0.65);
    for (const j of [-1, 1]) add(rbox(0.02, 0.03, 0.12, 0.008), black, bx + j * 0.025, 0.3, 1.3, 0.5, j * 0.18);
    add(tube([[bx, 0.44, 1.18], [bx * 0.8, 0.55, 0.95], [bx * 0.9, 0.62, 0.7]], 0.012, 12), rubber);
  }
  const gridTex = canvasTexture(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = "#cfd3d5"; g.lineWidth = 5;
    for (let x = 2; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 2; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  gridTex.generateMipmaps = false; gridTex.minFilter = THREE.LinearFilter;
  const netM = new THREE.MeshStandardMaterial({ map: gridTex, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 });
  const BX = 0.58, BY0 = 0.1, BY1 = 0.4, BZ0 = 1.58, BZ1 = 1.96;
  const edges = [[-BX, BY0, BZ0, BX, BY0, BZ0], [-BX, BY0, BZ1, BX, BY0, BZ1], [-BX, BY1, BZ1, BX, BY1, BZ1], [-BX, BY1, BZ0, BX, BY1, BZ0],
                 [-BX, BY0, BZ0, -BX, BY0, BZ1], [BX, BY0, BZ0, BX, BY0, BZ1], [-BX, BY1, BZ0, -BX, BY1, BZ1], [BX, BY1, BZ0, BX, BY1, BZ1],
                 [-BX, BY0, BZ0, -BX, BY1, BZ0], [BX, BY0, BZ0, BX, BY1, BZ0], [-BX, BY0, BZ1, -BX, BY1, BZ1], [BX, BY0, BZ1, BX, BY1, BZ1]];
  for (const [x0, y0, z0, x1, y1, z1] of edges) add(line([x0, y0, z0], [x1, y1, z1], 0.017), steel);
  add(new THREE.PlaneGeometry(BX * 2, BY1 - BY0), netM, 0, (BY0 + BY1) / 2, BZ1);
  add(new THREE.PlaneGeometry(BZ1 - BZ0, BY1 - BY0), netM, -BX, (BY0 + BY1) / 2, (BZ0 + BZ1) / 2, 0, Math.PI / 2);
  add(new THREE.PlaneGeometry(BZ1 - BZ0, BY1 - BY0), netM, BX, (BY0 + BY1) / 2, (BZ0 + BZ1) / 2, 0, Math.PI / 2);
  add(new THREE.PlaneGeometry(BX * 2, BZ1 - BZ0), netM, 0, BY0, (BZ0 + BZ1) / 2, -Math.PI / 2);
  add(rbox(0.08, 0.16, 0.08, 0.02), dark, 0.62, 1.82, 0.5);                                      // the camera on its pan-tilt bracket
  add(rbox(0.16, 0.12, 0.22, 0.04), dark, 0.62, 1.94, 0.53);
  add(lathe([[0.035, 0], [0.045, 0.02], [0.045, 0.06], [0, 0.06]], 16), black, 0.62, 1.94, 0.64, Math.PI / 2);

  // ---------------- decals, large on both flanks: the name and the flag of Kazakhstan
  const nameM = decal(1024, 192, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#121416"; g.textAlign = "center"; g.textBaseline = "middle";
    const label = t("nerpa_plate");
    g.font = "800 150px Onest, sans-serif";
    const k = Math.min(1, (w - 40) / g.measureText(label).width);
    g.font = `800 ${Math.floor(150 * k)}px Onest, sans-serif`;
    g.fillText(label, w / 2, h / 2 + 6);
  });
  const flagM = decal(320, 160, (g, w, h) => {
    g.fillStyle = "#00afca"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fec50c";
    const cx = w * 0.55, cy = h * 0.42;
    for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24); g.lineTo(cx + Math.cos(a + 0.1) * 37, cy + Math.sin(a + 0.1) * 37); g.lineTo(cx + Math.cos(a + 0.2) * 24, cy + Math.sin(a + 0.2) * 24); g.fill(); }
    g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx - 56, h * 0.78); g.quadraticCurveTo(cx, h * 0.6, cx + 56, h * 0.78); g.quadraticCurveTo(cx, h * 0.69, cx - 56, h * 0.78); g.fill();
    for (let y = 8; y < h - 6; y += 18) { g.fillRect(16, y, 11, 9); g.fillRect(29, y + 4, 6, 6); }
  });
  const decalOn = (mat, x, y, z, w, h, sx) => {
    const g = decalGeometry(fairing, new THREE.Vector3(x, y, z), new THREE.Euler(0, sx * Math.PI / 2, 0), new THREE.Vector3(w, h, 0.6));
    add(g, mat);
  };
  const plate = (w, h, draw) => decal(w, h, draw);
  // a hatch panel with its screws, a vent grille, warning stickers, the hull number
  const hatchM = plate(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,40,10,.75)"; g.lineWidth = 5; g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 26); g.stroke();
    g.fillStyle = "rgba(90,90,90,.9)"; for (const [x, y] of [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34], [w / 2, 30], [w / 2, h - 30]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
    g.fillStyle = "rgba(40,40,40,.85)"; g.beginPath(); g.roundRect(w / 2 - 40, h / 2 - 12, 80, 24, 10); g.fill();
  });
  const ventM = plate(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(25,25,25,.9)"; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 20); g.fill();
    g.fillStyle = "rgba(170,170,170,.9)"; for (let x = 26; x < w - 20; x += 18) g.fillRect(x, 20, 7, h - 40);
  });
  const warnM = plate(256, 128, (g, w, h) => {
    g.fillStyle = "#f6d21a"; g.fillRect(0, 0, w, h);
    g.save(); g.beginPath(); g.rect(0, 0, w, 26); g.rect(0, h - 26, w, 26); g.clip();
    g.fillStyle = "#151515"; for (let x = -40; x < w + 40; x += 34) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 17, 0); g.lineTo(x + 17 - 26, h); g.lineTo(x - 26, h); g.fill(); }
    g.restore();
    g.fillStyle = "#151515"; g.font = "800 30px Onest, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("THRUSTER", w / 2, h / 2 - 2); g.font = "700 15px Onest, sans-serif"; g.fillText("KEEP CLEAR", w / 2, h / 2 + 22);
  });
  const liftM = plate(256, 96, (g, w, h) => {
    g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, w, h); g.fillStyle = "#f6d21a"; g.font = "800 36px Onest, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("NO STEP", w / 2, h / 2 + 2);
  });
  const numM = plate(384, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = "#121416"; g.font = "700 64px PT Mono, monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("TLP-02", w / 2, h / 2 + 4);
  });
  for (const sx of [-1, 1]) {
    // the name: about a quarter of the hull's length, the flag beside it
    decalOn(nameM, sx * 1.2, 1.07, -0.5, 0.95, 0.19, sx);
    decalOn(flagM, sx * 1.2, 1.08, sx > 0 ? 0.18 : 0.18, 0.3, 0.15, sx);
    decalOn(numM, sx * 1.2, 0.86, -0.42, 0.44, 0.11, sx);
    decalOn(hatchM, sx * 1.2, 0.98, -1.25, 0.34, 0.34, sx);
    decalOn(ventM, sx * 1.2, 0.84, -1.05, 0.3, 0.13, sx);
    decalOn(warnM, sx * 1.2, 1.2, -1.42, 0.22, 0.11, sx);
  }
  { // "NO STEP" on the top, read from the side
    const g = decalGeometry(fairing, new THREE.Vector3(0.5, 2.2, 0.0), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector3(0.3, 0.11, 1.6));
    add(g, liftM);
  }

  // ---------------- moving parts: the ducted thrusters on the rear corners, the strobe, the lamps
  const props = [];
  function thruster(x, y, z, axis) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    if (axis === "y") g.rotation.x = -Math.PI / 2;
    root.add(g);
    const duct = new THREE.Mesh(lathe([[0.17, -0.12], [0.205, -0.115], [0.215, -0.04], [0.21, 0.08], [0.19, 0.12], [0.175, 0.1], [0.17, -0.12]], 32), dark);
    duct.rotation.x = Math.PI / 2; g.add(duct);
    const hub = new THREE.Mesh(lathe([[0, -0.09], [0.04, -0.07], [0.045, 0.04], [0.02, 0.08], [0, 0.09]], 16), steel); hub.rotation.x = Math.PI / 2; g.add(hub);
    const prop = new THREE.Group(); g.add(prop);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(rbox(0.14, 0.012, 0.06, 0.006, 2), steel); b.position.x = 0.09; b.rotation.x = 0.5; const arm = new THREE.Group(); arm.rotation.z = (k / 3) * Math.PI * 2; arm.add(b); prop.add(arm); }
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.008, 6, 32), steel); guard.position.z = -0.12; g.add(guard);
    for (let k = 0; k < 2; k++) { const s = new THREE.Mesh(rbox(0.38, 0.012, 0.012, 0.005, 1), steel); s.position.z = -0.12; s.rotation.z = (k * Math.PI) / 2; g.add(s); }
    count += 9; props.push(prop);
  }
  thruster(-0.78, 0.98, -1.66, "z"); thruster(0.78, 0.98, -1.66, "z");      // main propulsion on short struts aft
  for (const sx of [-1, 1]) add(tube([[sx * 0.4, 0.98, -1.55], [sx * 0.58, 0.98, -1.62]], 0.035, 4, 10), dark);
  thruster(-0.62, fairTop(0.62, -1.42) + 0.1, -1.42, "y"); thruster(0.62, fairTop(0.62, -1.42) + 0.1, -1.42, "y");    // vertical, on top aft
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf6ff).multiplyScalar(5) }));
  strobe.position.set(-0.28, fairTop(0.28, -1.12) + 0.12, -1.12); root.add(strobe);
  const strobeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: 0xeaf6ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  strobeGlow.scale.setScalar(0.5); strobeGlow.position.copy(strobe.position); root.add(strobeGlow);
  // a lamp seen from the front: a small hot core and a faint wide halo (sprites: no bloom under water);
  // both fade when the lamp turns away from the camera, as real LED heads do
  const CORE = canvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.18, "rgba(255,255,255,.9)"); gr.addColorStop(0.32, "rgba(255,255,255,.2)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const HALO = canvasTexture(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(0.15, "rgba(255,255,255,.22)"); gr.addColorStop(0.45, "rgba(255,255,255,.06)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const lampDirL = new THREE.Vector3(0, -0.3, 1).normalize();       // the heads look ahead and a little down
  const lamps = lampAt.map((p) => {
    const sprite = (map, hex, sc) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(hex), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
      sp.scale.setScalar(sc); sp.position.copy(p).addScaledVector(lampDirL, 0.02); root.add(sp); return sp;
    };
    const glow = sprite(CORE, 0xf4fbff, 0.16), halo = sprite(HALO, 0xbfe2ff, 1.3);
    halo.renderOrder = glow.renderOrder = 3;
    let sl = { intensity: 0 };
    if (lights) {
      sl = new THREE.SpotLight(0xe4f3ff, 0, 34, 0.42, 0.6, 2);
      sl.position.copy(p); sl.target.position.set(p.x * 0.4, -2.5, p.z + 8); root.add(sl, sl.target);
    }
    return { glow, halo, sl, at: p, on: 0 };
  });
  const _lw = new THREE.Vector3(), _ld = new THREE.Vector3(), _q = new THREE.Quaternion();
  /** Lamps on (0..1) with the glare seen from camPos: brightest looking into them, a pin-prick from the side. */
  function lampGlare(on, camPos, power = 1) {
    root.updateMatrixWorld(); root.getWorldQuaternion(_q);
    _ld.copy(lampDirL).applyQuaternion(_q);
    for (const l of lamps) {
      l.on = on;
      l.glow.getWorldPosition(_lw);
      const f = camPos ? Math.max(0, _ld.dot(_lw.sub(camPos).negate().normalize())) : 1;     // 1 = looking straight in
      l.glow.material.opacity = on * (0.35 + 0.65 * f);
      l.halo.material.opacity = on * (0.04 + 0.5 * Math.pow(f, 3));
      l.halo.scale.setScalar(0.9 + 1.2 * Math.pow(f, 4));
      l.sl.intensity = on * 260 * power;
    }
  }

  // ---------------- merge the static parts by material
  function mergeGroup(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map();
    for (const m of [...group.children]) {
      let g = m.geometry.clone().applyMatrix4(m.matrix);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!buckets.has(m.material)) buckets.set(m.material, []);
      buckets.get(m.material).push(g);
      group.remove(m);
    }
    for (const [mat, list] of buckets) group.add(new THREE.Mesh(mergeGeometries(list), mat));
  }
  mergeGroup(parts); mergeGroup(inside);
  root.traverse((o) => { if (o.isMesh && o !== sphere) { o.castShadow = true; o.receiveShadow = true; } });

  let strobeT = 0;
  root.userData = {
    lamps, lampGlare, props, strobe, sphere, meshCount: count, drawCalls: parts.children.length + inside.children.length,
    eye: new THREE.Vector3(0, TY + 0.58, -0.78),
    /** Turn the propellers (spin 0..1) and blink the strobe. */
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
