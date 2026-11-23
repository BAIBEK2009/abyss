// A totally enclosed lifeboat as real ships carry them on davits: a double-ended GRP hull with a keel and sheer,
// a canopy dome over all of it, windows, a top hatch and a side door, the helmsman's cupola, a black rubbing
// strake round the gunwale, release hooks fore and aft and the ship's name on both sides. Smooth surfaces only
// (lofted from sections, no facets). Local frame: z along the boat (bow +z), y up, the gunwale amidships at y 0.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { canvasTexture } from "../view.js";
import { decalGeometry } from "./decal.js";

const L = 5.6, B = 2.0, D = 0.85, H = 1.0;          // length, beam, depth below the gunwale, canopy height (m)
const halfW = (s) => (B / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.2)), 0.55);
const sheer = (s) => 0.12 * s * s;
const depth = (s) => D * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 5)), 0.4);
const canopyH = (s) => H * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.6)), 0.6);

/** A smooth surface from a grid: fn(u, v, out) for u, v in [0, 1]. */
function loft(nu, nv, fn) {
  const pos = [], idx = [], p = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { fn(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const hullAt = (u, v, out) => {            // v: port gunwale -> keel -> starboard gunwale
  const s = 2 * u - 1, t = (v - 0.5) * Math.PI, sn = Math.sin(t);
  return out.set(halfW(s) * Math.sign(sn) * Math.pow(Math.abs(sn), 0.7), sheer(s) - depth(s) * Math.pow(Math.abs(Math.cos(t)), 1.3), (u - 0.5) * L);
};
const canopyAt = (u, v, out) => {          // v: port gunwale -> over the top -> starboard gunwale
  const s = 2 * u - 1, t = (v - 0.5) * Math.PI, sn = Math.sin(t);
  return out.set(halfW(s) * 0.97 * sn, sheer(s) + canopyH(s) * Math.pow(Math.abs(Math.cos(t)), 0.75), (u - 0.5) * L);
};

export function lifeboat({ name = "" } = {}) {
  const g = new THREE.Group();
  const grp = new THREE.MeshPhysicalMaterial({ color: 0xff5f10, roughness: 0.4, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1216, roughness: 0.06, metalness: 0.1, clearcoat: 1 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xece8de, roughness: 0.45, clearcoat: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.85, roughness: 0.35 });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };

  const hull = add(loft(72, 28, hullAt), grp);
  hull.material.side = THREE.DoubleSide;
  const canopy = add(loft(72, 28, canopyAt), grp);
  // the keel along the bottom, the rubbing strake round the gunwale
  const keelPts = [], strake = [];
  for (let i = 0; i <= 40; i++) { const u = 0.03 + (i / 40) * 0.94, s = 2 * u - 1; keelPts.push(new THREE.Vector3(0, sheer(s) - depth(s) - 0.03, (u - 0.5) * L)); }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(keelPts), 60, 0.045, 8), grp);
  for (let i = 0; i <= 80; i++) { const u = i / 80, s = 2 * u - 1; strake.push(new THREE.Vector3(halfW(s) + 0.02, sheer(s) - 0.02, (u - 0.5) * L)); }
  for (let i = 79; i > 0; i--) { const u = i / 80, s = 2 * u - 1; strake.push(new THREE.Vector3(-halfW(s) - 0.02, sheer(s) - 0.02, (u - 0.5) * L)); }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strake, true), 240, 0.055, 8, true), rubber);

  // things on the canopy, set along its normal at (u, t)
  const p = new THREE.Vector3(), q = new THREE.Vector3(), nrm = new THREE.Vector3();
  const onCanopy = (u, v, geo, mat, lift = 0) => {
    canopyAt(u, v, p);
    canopyAt(u, v + 0.01, q); const dv = q.clone().sub(p);
    canopyAt(u + 0.01, v, q); const du = q.clone().sub(p);
    nrm.crossVectors(du, dv).normalize();
    if (nrm.dot(p.clone().setZ(0).setY(p.y - sheer(2 * u - 1) + 0.3)) < 0) nrm.negate();
    const m = add(geo, mat);
    m.position.copy(p).addScaledVector(nrm, lift);
    m.lookAt(m.position.clone().add(nrm));
    return m;
  };
  const win = new RoundedBoxGeometry(0.34, 0.2, 0.05, 2, 0.06);
  for (const v of [0.2, 0.8]) for (const u of [0.3, 0.38, 0.46, 0.54, 0.62, 0.7]) onCanopy(u, v, win, glass, 0.005);
  // the top hatch and the side door (inboard, port side), each in a white frame
  onCanopy(0.6, 0.5, new RoundedBoxGeometry(0.62, 0.62, 0.07, 3, 0.12), white, 0.0);
  onCanopy(0.6, 0.5, new RoundedBoxGeometry(0.5, 0.5, 0.08, 3, 0.1), grp, 0.02);
  onCanopy(0.47, 0.13, new RoundedBoxGeometry(0.7, 0.55, 0.06, 3, 0.12), white, 0.0);
  onCanopy(0.47, 0.13, new RoundedBoxGeometry(0.58, 0.44, 0.07, 3, 0.1), grp, 0.02);
  // the helmsman's cupola aft: a small round tower with a ring of windows
  const cup = new THREE.Group(); g.add(cup);
  { const s = 2 * 0.3 - 1; cup.position.set(0, sheer(s) + canopyH(s) - 0.05, (0.3 - 0.5) * L); }
  const tower = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.34, 0], [0.34, 0.26], [0.3, 0.34], [0.16, 0.4], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 32), grp);
  tower.castShadow = true; cup.add(tower);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.11, 32, 1, true), glass); ring.position.y = 0.17; cup.add(ring);
  // release hooks fore and aft (where the falls take her)
  const hookAt = [];
  for (const u of [0.18, 0.82]) {
    const s = 2 * u - 1, y = sheer(s) + canopyH(s);
    const h = new THREE.Group(); h.position.set(0, y, (u - 0.5) * L); g.add(h);
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.08, 0.3, 2, 0.03), steel); h.add(base);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 20, Math.PI * 1.4), steel); hook.position.y = 0.13; hook.rotation.y = Math.PI / 2; h.add(hook);
    hookAt.push(h.position.clone().setY(y + 0.2));
  }
  // the name on both sides of the canopy, projected onto its curve
  if (name) {
    const mat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4,
      map: canvasTexture(1024, 192, (c, w, h2) => {
        c.clearRect(0, 0, w, h2); c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "middle";
        c.font = "800 140px Onest, sans-serif";
        const k = Math.min(1, (w - 40) / c.measureText(name).width);
        c.font = `800 ${Math.floor(140 * k)}px Onest, sans-serif`;
        c.fillText(name, w / 2, h2 / 2 + 6);
      }) });
    canopy.updateMatrixWorld(true);
    for (const sx of [1, -1]) {
      const geo = decalGeometry(canopy, new THREE.Vector3(sx * 0.85, 0.36, 1.2), new THREE.Euler(0, sx * Math.PI / 2, 0), new THREE.Vector3(1.45, 0.3, 1.2));
      const m = new THREE.Mesh(geo, mat); g.add(m);
    }
  }
  g.userData.hooks = hookAt;          // local points the falls hang from
  return g;
}
