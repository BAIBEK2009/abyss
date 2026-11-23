// Caspian life under water (fix 2): a seal near the surface, a school of sprats in the twilight zone, a sturgeon
// near the bottom (a rare encounter), gobies lying on the silt that dart away from the light.
// Bodies are lofts along a spline; swimming is a bend in the vertex shader (a sine from head to tail).
import * as THREE from "three";
import { canvasTexture, rng } from "../view.js";

/** Bend a material's vertices: x += amp * sin(z * k - t * w) * (tail weight); uniforms on mat.userData.bend. */
function bendMaterial(mat, { amp = 0.06, k = 4, w = 6, axis = 1, head = 0.5, instanced = false } = {}) {
  const u = { uT: { value: 0 }, uAmp: { value: amp }, uK: { value: k }, uW: { value: w }, uHead: { value: head } };
  mat.userData.bend = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = "uniform float uT, uAmp, uK, uW, uHead;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      float ph = ${instanced ? "float(gl_InstanceID) * 1.37" : "0.0"};
      float tw = 1.0 - smoothstep(-${axis.toFixed(2)}, uHead, transformed.z);    // the head stays, the tail swings
      transformed.x += uAmp * tw * sin(transformed.z * uK - uT * uW + ph);`);
  };
  return mat;
}
const loft = (profile, seg = 18) => new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);

function spottedTex(base, spot, n, seed) {
  return canvasTexture(256, 256, (g, w) => {
    const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, w);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,255,255,.18)"); gr.addColorStop(0.5, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(255,255,255,.18)");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);                                   // a lighter belly (the lathe's u wraps round)
    for (let i = 0; i < n; i++) { g.fillStyle = spot; g.globalAlpha = 0.35 + r() * 0.5; g.beginPath(); g.ellipse(r() * w, r() * w, 2 + r() * 6, 1.5 + r() * 4, r() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  });
}

// ------------------------------------------------------------------ the seal (1.3 m)
export function makeSeal() {
  const g = new THREE.Group();
  const fur = bendMaterial(new THREE.MeshStandardMaterial({ map: spottedTex("#8d9196", "#3d3f44", 160, 11), roughness: 0.45, metalness: 0.05 }), { amp: 0.09, k: 3.2, w: 5, head: 0.25, axis: 0.65 });
  const body = new THREE.Mesh(loft([[0, -0.65], [0.06, -0.6], [0.13, -0.42], [0.2, -0.15], [0.22, 0.05], [0.19, 0.28], [0.13, 0.44], [0.1, 0.52], [0.08, 0.6], [0.03, 0.66], [0, 0.67]], 22), fur);
  g.add(body);
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.08, metalness: 0.3 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), dark); eye.position.set(sx * 0.075, 0.05, 0.56); g.add(eye);
    for (let k = 0; k < 3; k++) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.12, 3), new THREE.MeshBasicMaterial({ color: 0xd8d4c8 }));
      wh.position.set(sx * 0.07, -0.01 - k * 0.012, 0.63); wh.rotation.z = sx * (1.3 + k * 0.12); g.add(wh);
    }
    const front = new THREE.Mesh(loft([[0, -0.1], [0.03, -0.06], [0.035, 0.05], [0, 0.11]], 8), fur);
    front.scale.set(1, 0.35, 1); front.position.set(sx * 0.2, -0.07, 0.28); front.rotation.set(0.3, sx * 0.9, 0); g.add(front); g.userData[sx < 0 ? "fl" : "fr"] = front;
  }
  const hind = new THREE.Group(); hind.position.z = -0.64; g.add(hind);
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(loft([[0, 0], [0.05, -0.05], [0.06, -0.14], [0, -0.2]], 8), fur); f.scale.set(1.3, 0.25, 1); f.position.x = sx * 0.05; f.rotation.y = sx * 0.25; hind.add(f); }
  g.userData.hind = hind; g.userData.mat = fur;
  g.userData.update = (t) => {
    fur.userData.bend.uT.value = t;
    hind.rotation.y = Math.sin(t * 5) * 0.4;
    g.userData.fl.rotation.x = 0.3 + Math.sin(t * 2.5) * 0.25; g.userData.fr.rotation.x = 0.3 + Math.sin(t * 2.5 + 0.5) * 0.25;
  };
  g.userData.nose = new THREE.Vector3(0, 0.02, 0.66);
  return g;
}

// ------------------------------------------------------------------ sprats: a flocking school (InstancedMesh)
export function makeSprats(n = 200) {
  const geo = loft([[0, -0.05], [0.004, -0.04], [0.009, -0.01], [0.01, 0.015], [0.007, 0.035], [0, 0.045]], 8);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.045, 0, 0.012, -0.065, 0, -0.012, -0.065], 3));
  tail.setAttribute("normal", new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  tail.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 1, 1, 0], 2));
  const merged = mergeTwo(geo, tail);
  const mat = bendMaterial(new THREE.MeshStandardMaterial({ color: 0xc9d3da, metalness: 1, roughness: 0.22, side: THREE.DoubleSide }), { amp: 0.012, k: 70, w: 22, head: 0.02, axis: 0.06, instanced: true });
  const mesh = new THREE.InstancedMesh(merged, mat, n);
  mesh.frustumCulled = false;
  const r = rng(5), P = [], V = [];
  for (let i = 0; i < n; i++) { P.push(new THREE.Vector3((r() - 0.5) * 3, (r() - 0.5) * 1.2, (r() - 0.5) * 3)); V.push(new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize().multiplyScalar(0.8)); }
  const centre = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3(), sc = new THREE.Vector3(1.6, 1.6, 1.6);
  /** home: the point the school circles; avoid: a point to flee (the vehicle); dt: seconds. */
  let last = null;
  mesh.userData.update = (dt, t, home, avoid) => {
    mat.userData.bend.uT.value = t;
    if (last) { const dy = home.y - last.y; if (Math.abs(dy) < 5) for (const p of P) p.y += dy; }       // the school sinks with the camera
    last = home.clone();
    centre.set(0, 0, 0); for (const p of P) centre.add(p); centre.multiplyScalar(1 / n);
    const goal = tmp.set(home.x + Math.cos(t * 0.25) * 2.5, home.y + Math.sin(t * 0.4) * 0.6, home.z + Math.sin(t * 0.25) * 2.5);
    for (let i = 0; i < n; i++) {
      const p = P[i], v = V[i];
      const acc = new THREE.Vector3().subVectors(goal, p).multiplyScalar(0.5);                         // cohesion to the moving goal
      for (let s = 0; s < 6; s++) {                                                                   // separation + alignment, sampled
        const j = (i + 1 + ((s * 37 + Math.floor(t * 3)) % (n - 1))) % n, d = p.distanceTo(P[j]);
        if (d < 0.12) acc.addScaledVector(new THREE.Vector3().subVectors(p, P[j]), (0.12 - d) * 40);
        acc.addScaledVector(V[j], 0.08);
      }
      if (avoid) { const d = p.distanceTo(avoid); if (d < 3) acc.addScaledVector(new THREE.Vector3().subVectors(p, avoid).normalize(), (3 - d) * 6); }
      v.addScaledVector(acc, dt); const sp = v.length(); if (sp > 1.6) v.multiplyScalar(1.6 / sp); if (sp < 0.5) v.multiplyScalar(0.5 / sp);
      p.addScaledVector(v, dt);
      q.setFromUnitVectors(z, tmp.copy(v).normalize());
      m.compose(p, q, sc); mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  mesh.userData.place = (at) => { last = null; for (const p of P) p.add(at); };
  return mesh;
}
function mergeTwo(a, b) {
  a = a.index ? a.toNonIndexed() : a; b = b.index ? b.toNonIndexed() : b;
  const g = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "uv"]) {
    const A = a.attributes[k].array, B = b.attributes[k].array, out = new Float32Array(A.length + B.length);
    out.set(A); out.set(B, A.length); g.setAttribute(k, new THREE.BufferAttribute(out, a.attributes[k].itemSize));
  }
  return g;
}

// ------------------------------------------------------------------ the sturgeon (1.8 m, a rare encounter)
export function makeSturgeon() {
  const g = new THREE.Group();
  const skin = bendMaterial(new THREE.MeshStandardMaterial({ map: spottedTex("#4f4a3e", "#2b2820", 60, 23), roughness: 0.55, metalness: 0.1 }), { amp: 0.12, k: 3.5, w: 2.4, head: 0.3, axis: 0.9 });
  const body = new THREE.Mesh(loft([[0, -0.85], [0.03, -0.8], [0.06, -0.6], [0.11, -0.3], [0.13, 0], [0.12, 0.3], [0.08, 0.55], [0.045, 0.72], [0.02, 0.86], [0, 0.92]], 18), skin);
  body.scale.set(1, 0.85, 1); g.add(body);
  // five rows of light bony scutes (instanced), the barbels under the snout, a heterocercal tail (upper lobe longer)
  const scuteMat = bendMaterial(new THREE.MeshStandardMaterial({ color: 0xcfc6ae, roughness: 0.5 }), { amp: 0.12, k: 3.5, w: 2.4, head: 0.3, axis: 0.9, instanced: false });
  const rows = [[0, 0.112], [0.085, 0.065], [-0.085, 0.065], [0.11, -0.03], [-0.11, -0.03]], pts = [];
  for (const [x, y] of rows) for (let k = 0; k < 13; k++) { const zz = -0.6 + k * 0.1; const taper = Math.max(0.35, 1 - Math.abs(zz) * 0.7); pts.push([x * taper, y * taper, zz]); }
  const sc = new THREE.InstancedMesh(new THREE.ConeGeometry(0.012, 0.03, 5), scuteMat, pts.length);
  const m4 = new THREE.Matrix4(); pts.forEach((p, i) => sc.setMatrixAt(i, m4.makeTranslation(...p))); g.add(sc);
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.06, 4), scuteMat); b.position.set(-0.03 + k * 0.02, -0.05, 0.7); g.add(b); }
  const ts = new THREE.Shape(); ts.moveTo(0, 0); ts.lineTo(0.05, 0.28); ts.lineTo(-0.02, 0.06); ts.lineTo(0.02, -0.14); ts.lineTo(-0.03, -0.02);
  const tail = new THREE.Mesh(new THREE.ShapeGeometry(ts), new THREE.MeshStandardMaterial({ color: 0x3f3a30, roughness: 0.6, side: THREE.DoubleSide }));
  tail.rotation.y = Math.PI / 2; tail.position.z = -0.84; g.add(tail);
  for (const sx of [-1, 1]) { const fin = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8, 0, Math.PI), skin); fin.position.set(sx * 0.12, -0.05, 0.4); fin.rotation.set(Math.PI / 2, 0, sx * 0.5); g.add(fin); }
  g.userData.update = (t) => { skin.userData.bend.uT.value = t; scuteMat.userData.bend.uT.value = t; tail.rotation.x = Math.sin(t * 2.4 - 2) * 0.35; };
  return g;
}

// ------------------------------------------------------------------ gobies on the silt
export function makeGobies(n = 16) {
  const geo = loft([[0, -0.05], [0.006, -0.04], [0.012, -0.01], [0.016, 0.02], [0.013, 0.04], [0, 0.05]], 8);
  geo.scale(1, 0.75, 1);
  const mat = new THREE.MeshStandardMaterial({ map: spottedTex("#8a7a5e", "#3a2e1e", 220, 31), roughness: 0.7 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const r = rng(9), F = [];
  for (let i = 0; i < n; i++) F.push({ p: new THREE.Vector3(), yaw: r() * 6.28, dart: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), s: 1.2 + r() * 1.2 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
  /** spots: bed positions [{x,z,y}]; scatter around the landing spot */
  mesh.userData.place = (pos) => { F.forEach((f, i) => f.p.copy(pos[i % pos.length])); };
  mesh.userData.first = () => F[0].p.toArray();
  /** near: the vehicle position; lit(p) -> true when in the searchlight; puff(x,y,z) throws silt */
  mesh.userData.update = (dt, near, lit, puff, bedH) => {
    F.forEach((f, i) => {
      if (f.dart <= 0 && (f.p.distanceTo(near) < 2 || lit(f.p))) {
        f.dart = 0.35; f.from.copy(f.p);
        const a = f.yaw + (Math.random() - 0.5) * 2, d = 0.5 + Math.random() * 0.5;
        f.to.set(f.p.x + Math.sin(a) * d, 0, f.p.z + Math.cos(a) * d); f.to.y = bedH(f.to.x, f.to.z) + 0.012; f.yaw = a;
        puff?.(f.p.x, f.p.y, f.p.z);
      }
      if (f.dart > 0) { f.dart -= dt; const k = 1 - Math.max(0, f.dart) / 0.35; f.p.lerpVectors(f.from, f.to, k); f.p.y += Math.sin(k * Math.PI) * 0.12; }
      q.setFromEuler(e.set(0, f.yaw, 0)); sc.setScalar(f.s);
      m.compose(f.p, q, sc); mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return mesh;
}
