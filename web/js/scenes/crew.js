// The crew of «Tulpar» in 3D (fix 4): people made in code in the game's paper-craft style — rounded torso, head with
// a simple face, arms and legs on joints — with poses driven per frame: idle (breathing, weight shift), walk,
// work (hands at the winch), wipe (wiping the hands), binoculars, type (at a laptop, sitting), signal (arm signals).
// The head turns to the player within 3 m (+-60 degrees, smoothly). Units: metres; scale for the cabin's 12/m.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const std = (o) => new THREE.MeshStandardMaterial(o);
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.05, h / 2.05, d / 2.05));
const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
function mesh(g, m) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; }

const LOOKS = {
  deck: { coat: 0xe2701c, trousers: 0x2b2f36, hat: "helmet", hatCol: 0xf1f1ec },
  officer: { coat: 0x1d2a44, trousers: 0x161d2e, hat: "none" },
  murat: { coat: 0xe2701c, trousers: 0x2b2f36, hat: "knit", hatCol: 0x6b2a22, hair: 0xd9d6cf, moustache: true, skin: 0xc48f68 },
  erlan: { coat: 0x1d2a44, trousers: 0x161d2e, hat: "none", hair: 0x16110f, beard: true, epaulettes: true, skin: 0xd6a37c },
  dana: { coat: 0x2f6f78, trousers: 0x23262c, hat: "none", hair: 0x1c1514, bun: true, glasses: true, skin: 0xe3b48f },
  sailor: { coat: 0xe2701c, trousers: 0x2b2f36, hat: "helmet", hatCol: 0xf1f1ec, hair: 0x1a1412, skin: 0xd2a07a },
};

/** A person ~1.75 m tall. kind: a key of LOOKS. Returns a group with .userData.pose(name, t, dt) and .userData.look(worldPoint|null). */
export function makePerson(kind = "deck") {
  const L = { skin: 0xd6a37c, hair: 0x1a1412, ...LOOKS.deck, ...LOOKS[kind] };
  const coat = std({ color: L.coat, roughness: 0.8 }), trou = std({ color: L.trousers, roughness: 0.85 }), skin = std({ color: L.skin, roughness: 0.65 });
  const hairM = std({ color: L.hair, roughness: 0.8 }), boots = std({ color: 0x1a1a1c, roughness: 0.6 }), refl = std({ color: 0xd8d8d0, roughness: 0.4, emissive: 0x333330 });
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  hips.add(mesh(rbox(0.34, 0.2, 0.22, 0.08), trou));
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  const torso = mesh(rbox(0.42, 0.56, 0.24, 0.1), coat); torso.position.y = 0.3; spine.add(torso);
  if (L.coat === 0xe2701c) for (const y of [0.18, 0.4]) { const b = mesh(rbox(0.43, 0.035, 0.245, 0.015), refl); b.position.y = y; spine.add(b); }   // reflective bands
  if (L.epaulettes) for (const sx of [-1, 1]) { const e = mesh(rbox(0.1, 0.02, 0.07, 0.01), std({ color: 0xc9a646, metalness: 0.7, roughness: 0.35 })); e.position.set(sx * 0.17, 0.59, 0); spine.add(e); }
  const neck = new THREE.Group(); neck.position.y = 0.6; spine.add(neck);
  neck.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 10), skin));
  const head = new THREE.Group(); head.position.y = 0.06; neck.add(head);
  const face = mesh(new THREE.SphereGeometry(0.105, 18, 14), skin); face.scale.set(0.92, 1.1, 1); face.position.y = 0.1; head.add(face);
  const eyeM = std({ color: 0x1a1210, roughness: 0.3 });
  for (const sx of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.011, 8, 6), eyeM); e.scale.set(1.3, 0.6, 0.6); e.position.set(sx * 0.037, 0.12, 0.094); head.add(e); }
  const nose = mesh(new THREE.ConeGeometry(0.014, 0.03, 6), skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.095, 0.11); head.add(nose);
  const hairCap = mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hairCap.position.y = 0.12; hairCap.rotation.x = -0.25; head.add(hairCap);
  if (L.bun) { const bun = mesh(new THREE.SphereGeometry(0.045, 10, 8), hairM); bun.position.set(0, 0.2, -0.08); head.add(bun); }
  if (L.moustache) { const m = mesh(rbox(0.07, 0.016, 0.02, 0.008), std({ color: L.hair, roughness: 0.9 })); m.position.set(0, 0.07, 0.105); head.add(m); }
  if (L.beard) { const b = mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), hairM); b.position.set(0, 0.07, 0.03); b.scale.set(1.1, 0.9, 1.1); head.add(b); }
  if (L.glasses) { const g = mesh(new THREE.TorusGeometry(0.018, 0.003, 4, 12), std({ color: 0x333338, metalness: 0.6 })); for (const sx of [-1, 1]) { const c = g.clone(); c.position.set(sx * 0.037, 0.12, 0.103); head.add(c); } }
  if (L.hat === "helmet") { const h = mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: L.hatCol, roughness: 0.35 })); h.position.y = 0.15; head.add(h);
    const brim = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 16), std({ color: L.hatCol, roughness: 0.35 })); brim.position.y = 0.15; head.add(brim); }
  if (L.hat === "knit") { const h = mesh(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), std({ color: L.hatCol, roughness: 0.95 })); h.position.y = 0.14; head.add(h); }
  const limb = (parent, x, y, upper, lower, mat, handMat) => {
    const j1 = new THREE.Group(); j1.position.set(x, y, 0); parent.add(j1);
    const u = mesh(capsule(0.05, upper), mat); u.position.y = -upper / 2 - 0.02; j1.add(u);
    const j2 = new THREE.Group(); j2.position.y = -upper - 0.04; j1.add(j2);
    const l = mesh(capsule(0.045, lower), mat); l.position.y = -lower / 2 - 0.02; j2.add(l);
    const end = mesh(handMat === boots ? rbox(0.1, 0.07, 0.24, 0.03) : new THREE.SphereGeometry(0.045, 10, 8), handMat);
    end.position.set(0, -lower - 0.06, handMat === boots ? 0.05 : 0); j2.add(end);
    return [j1, j2];
  };
  const [shL, elL] = limb(spine, -0.27, 0.56, 0.24, 0.22, coat, skin), [shR, elR] = limb(spine, 0.27, 0.56, 0.24, 0.22, coat, skin);
  const [hpL, knL] = limb(hips, -0.1, -0.05, 0.38, 0.38, trou, boots), [hpR, knR] = limb(hips, 0.1, -0.05, 0.38, 0.38, trou, boots);
  let lookYaw = 0, lookPitch = 0;
  const tmp = new THREE.Vector3(), inv = new THREE.Matrix4();
  root.userData.look = (world) => {
    let ty = 0, tp = 0;
    if (world) {
      root.updateMatrixWorld(); inv.copy(head.parent.matrixWorld).invert(); tmp.copy(world).applyMatrix4(inv);
      const d = Math.hypot(tmp.x, tmp.z);
      if (d * root.userData.metres < 3) { ty = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.05, 1.05); tp = THREE.MathUtils.clamp(Math.atan2(tmp.y - 0.12, d), -0.4, 0.4); }
    }
    lookYaw += (ty - lookYaw) * 0.08; lookPitch += (-tp - lookPitch) * 0.08;
    head.rotation.set(lookPitch, lookYaw, 0);
  };
  root.userData.metres = 1;
  /** Poses: idle | walk | work | wipe | bino | type | signal | sit */
  root.userData.pose = (name, t) => {
    const br = Math.sin(t * 1.8) * 0.02;
    spine.rotation.set(br, 0, 0); hips.position.y = 0.95; hips.rotation.set(0, 0, 0);
    for (const j of [shL, shR, elL, elR, hpL, hpR, knL, knR]) j.rotation.set(0, 0, 0);
    shL.rotation.z = 0.08; shR.rotation.z = -0.08; elL.rotation.x = -0.15; elR.rotation.x = -0.15;
    if (name === "walk") {
      const s = Math.sin(t * 5.2);
      hpL.rotation.x = s * 0.5; hpR.rotation.x = -s * 0.5; knL.rotation.x = Math.max(0, -s) * 0.7; knR.rotation.x = Math.max(0, s) * 0.7;
      shL.rotation.x = -s * 0.4; shR.rotation.x = s * 0.4; hips.position.y = 0.95 + Math.abs(Math.cos(t * 5.2)) * 0.03;
    } else if (name === "idle") {
      hips.rotation.z = Math.sin(t * 0.4) * 0.03; shL.rotation.x = Math.sin(t * 0.7) * 0.05;
    } else if (name === "work") {
      spine.rotation.x = 0.35; shL.rotation.x = -1.0 + Math.sin(t * 2.2) * 0.25; shR.rotation.x = -1.0 - Math.sin(t * 2.2) * 0.25; elL.rotation.x = -0.9; elR.rotation.x = -0.9;
    } else if (name === "wipe") {
      shL.rotation.x = -0.7; shR.rotation.x = -0.7; elL.rotation.x = -1.4; elR.rotation.x = -1.4; shL.rotation.z = 0.5 + Math.sin(t * 9) * 0.15; shR.rotation.z = -0.5 + Math.sin(t * 9 + 1) * 0.15;
    } else if (name === "bino") {
      shL.rotation.x = -1.7; shR.rotation.x = -1.7; elL.rotation.x = -1.9; elR.rotation.x = -1.9; shL.rotation.z = -0.35; shR.rotation.z = 0.35;
    } else if (name === "signal") {
      shR.rotation.z = -2.6 + Math.sin(t * 3) * 0.4; elR.rotation.z = -0.3; shL.rotation.z = 1.2 + Math.sin(t * 3 + 1.5) * 0.3;
    } else if (name === "sit" || name === "type") {
      hips.position.y = 0.5; hpL.rotation.x = -1.5; hpR.rotation.x = -1.5; knL.rotation.x = 1.5; knR.rotation.x = 1.5;
      if (name === "type") { spine.rotation.x = 0.15; shL.rotation.x = -0.9; shR.rotation.x = -0.9; elL.rotation.x = -0.6 + Math.sin(t * 14) * 0.08; elR.rotation.x = -0.6 + Math.sin(t * 13 + 1) * 0.08; }
    }
  };
  root.traverse((o) => { if (o.isMesh && o !== torso) o.castShadow = false; });       // one shadow caster per person
  root.userData.pose("idle", 0);
  return root;
}

/** Walk a loop of waypoints [[x, z], ...] at speed m/s, idling `pause` seconds at each one. */
export function patrol(person, pts, { speed = 0.9, pause = 3 } = {}) {
  let i = 0, wait = 0, pos = new THREE.Vector2(...pts[0]);
  return (dt, t) => {
    if (wait > 0) { wait -= dt; person.userData.pose("idle", t); return; }
    const to = new THREE.Vector2(...pts[(i + 1) % pts.length]), d = to.clone().sub(pos), L = d.length();
    if (L < 0.05) { i = (i + 1) % pts.length; wait = pause; return; }
    pos.addScaledVector(d, Math.min(1, (speed * dt) / L));
    person.position.x = pos.x; person.position.z = pos.y;
    const yaw = Math.atan2(d.x, d.y); person.rotation.y += Math.atan2(Math.sin(yaw - person.rotation.y), Math.cos(yaw - person.rotation.y)) * Math.min(1, dt * 6);
    person.userData.pose("walk", t);
  };
}
