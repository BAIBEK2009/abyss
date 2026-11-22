// The captain's cabin, lived in (C2): walnut wainscot to 0.9 m with a rail, a rug with a Kazakh ornament, the
// bunk with a check blanket and a shelf over it, a bookshelf with pilot books and a restraint strap, the brass
// clock, barometer and thermometer, the Kazakhstan pennant, the captain's jacket and cap on a hook, a swivel
// chair, a green-shaded desk lamp, brass trim and drawers on the chart table, instruments and papers on it,
// a cable tray on a beam, the evacuation plan. Every form has rounded edges. Units: 12 per metre.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { canvasTexture, rng } from "../view.js";
import { walnut, brass } from "./materials.js";
import { t } from "../i18n.js";

const std = (o) => new THREE.MeshStandardMaterial(o);
const rbox = (w, h, d, r = 0.2) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.05, h / 2.05, d / 2.05));
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
const at = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

/** Vertical walnut boards with chamfered joints (the wainscot). */
function boardsTex() {
  return canvasTexture(512, 256, (g, w, h) => {
    const r = rng(41);
    g.fillStyle = "#4a2c18"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) {
      const shade = 0.85 + r() * 0.3;
      g.fillStyle = `rgb(${Math.round(92 * shade)},${Math.round(56 * shade)},${Math.round(32 * shade)})`; g.fillRect(x + 3, 0, 58, h);
      for (let k = 0; k < 26; k++) { g.strokeStyle = `rgba(30,15,6,${0.12 + r() * 0.2})`; g.lineWidth = 1 + r() * 1.5; g.beginPath();
        const x0 = x + 6 + r() * 52; g.moveTo(x0, 0); g.bezierCurveTo(x0 + r() * 8 - 4, h * 0.3, x0 + r() * 8 - 4, h * 0.7, x0 + r() * 6 - 3, h); g.stroke(); }
      g.fillStyle = "#1c0f06"; g.fillRect(x, 0, 3, h);
      g.fillStyle = "rgba(255,220,170,.18)"; g.fillRect(x + 3, 0, 2, h);
    }
  });
}

/** A Kazakh ornament (koshkar muiz — ram's horns) in muted reds and beiges. */
function rugTex() {
  return canvasTexture(1024, 768, (g, w, h) => {
    g.fillStyle = "#7a2a22"; g.fillRect(0, 0, w, h);
    const band = (m, col) => { g.strokeStyle = col; g.lineWidth = 14; g.strokeRect(m, m, w - 2 * m, h - 2 * m); };
    band(26, "#d9c49a"); band(58, "#3a2420"); band(92, "#c9a66b");
    const horn = (x, y, s, rot, col) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = col; g.lineWidth = s * 0.16; g.lineCap = "round";
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(0, 0); g.bezierCurveTo(sx * s * 0.1, -s * 0.5, sx * s * 0.9, -s * 0.5, sx * s * 0.75, 0);
        g.bezierCurveTo(sx * s * 0.62, s * 0.3, sx * s * 0.3, s * 0.15, sx * s * 0.38, -s * 0.05); g.stroke(); }
      g.restore();
    };
    for (let x = 150; x < w - 120; x += 90) { horn(x, 40, 34, 0, "#7a2a22"); horn(x, h - 40, 34, Math.PI, "#7a2a22"); }
    g.fillStyle = "#e3d2ac"; g.fillRect(150, 150, w - 300, h - 300);
    g.fillStyle = "#8c3329"; g.fillRect(180, 180, w - 360, h - 360);
    for (const [cx, cy] of [[w / 2, h / 2], [w * 0.3, h / 2], [w * 0.7, h / 2]]) {
      g.save(); g.translate(cx, cy); g.fillStyle = "#e3d2ac";
      g.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.lineTo(Math.cos(a) * 110, Math.sin(a) * 110); } g.closePath(); g.fill(); g.restore();
      for (let i = 0; i < 4; i++) horn(cx + Math.cos(i * Math.PI / 2) * 46, cy + Math.sin(i * Math.PI / 2) * 46, 40, i * Math.PI / 2 + Math.PI / 2, "#5a1e18");
    }
    const r = rng(7); g.fillStyle = "rgba(0,0,0,.06)";
    for (let i = 0; i < 9000; i++) g.fillRect(r() * w, r() * h, 2, 2);          // the weave
  });
}

/** Tartan for the blanket. */
function tartanTex() {
  return canvasTexture(256, 256, (g, w) => {
    g.fillStyle = "#283a5a"; g.fillRect(0, 0, w, w);
    for (const [c, a, step, wd] of [["#8c2b26", 0.55, 64, 18], ["#1d2a3e", 0.6, 32, 6], ["#c9a646", 0.5, 64, 3]]) {
      g.globalAlpha = a; g.fillStyle = c;
      for (let x = 0; x < w; x += step) { g.fillRect(x, 0, wd, w); g.fillRect(0, x, w, wd); }
    }
    g.globalAlpha = 1;
  });
}

function dialTex(kind) {
  return canvasTexture(256, 256, (g, w) => {
    g.fillStyle = "#f3ead6"; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    g.strokeStyle = "#2b2a33"; g.fillStyle = "#2b2a33"; g.textAlign = "center"; g.textBaseline = "middle";
    if (kind === "clock") {
      g.font = "700 26px Prata, serif";
      for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; g.fillText(String(i), 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); }
      for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; g.lineWidth = i % 5 ? 1.5 : 4; g.beginPath(); g.moveTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.lineTo(128 + Math.cos(a) * (i % 5 ? 106 : 100), 128 + Math.sin(a) * (i % 5 ? 106 : 100)); g.stroke(); }
      g.lineWidth = 7; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 48, 128 - 26); g.stroke();        // 02:40 — the prologue's hour
      g.lineWidth = 4; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 30, 128 + 70); g.stroke();
    } else {
      g.font = "700 17px Onest, sans-serif";
      const words = [t("baro_storm"), t("baro_rain"), t("baro_change"), t("baro_fair")];
      words.forEach((wd, i) => { const a = Math.PI * (0.8 + i * 0.47); g.fillText(wd, 128 + Math.cos(a) * 78, 128 + Math.sin(a) * 78); });
      for (let i = 0; i <= 40; i++) { const a = Math.PI * (0.75 + i / 40 * 1.5); g.lineWidth = i % 5 ? 1.5 : 3; g.beginPath(); g.moveTo(128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114); g.lineTo(128 + Math.cos(a) * 102, 128 + Math.sin(a) * 102); g.stroke(); }
      g.lineWidth = 4; g.strokeStyle = "#8e2a1a"; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(Math.PI * 1.15) * 96, 128 + Math.sin(Math.PI * 1.15) * 96); g.stroke();
    }
    g.fillStyle = "#2b2a33"; g.beginPath(); g.arc(128, 128, 8, 0, 7); g.fill();
  });
}

function spineTex(label, col, seed) {
  return canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    const r = rng(seed); g.fillStyle = "rgba(0,0,0,.18)"; for (let i = 0; i < 200; i++) g.fillRect(r() * w, r() * h, 1, 2);
    g.fillStyle = "#f0e6cc"; g.fillRect(8, 30, w - 16, 150);
    g.save(); g.translate(w / 2, 105); g.rotate(-Math.PI / 2); g.fillStyle = "#23222b"; g.font = "700 15px Onest, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(label, 0, 0, 140); g.restore();
    g.fillStyle = "#e8b04a"; g.fillRect(8, 200, w - 16, 6);
  });
}

function evacTex() {
  return canvasTexture(384, 256, (g, w, h) => {
    g.fillStyle = "#f6f3ea"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1b7a3e"; g.fillRect(0, 0, w, 40);
    g.fillStyle = "#fff"; g.font = "800 20px Onest, sans-serif"; g.textAlign = "center"; g.fillText(t("evac_title"), w / 2, 27, w - 20);
    g.strokeStyle = "#2b2a33"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(40, 220); g.quadraticCurveTo(30, 130, 80, 70); g.lineTo(300, 70); g.quadraticCurveTo(360, 140, 300, 220); g.closePath(); g.stroke();
    g.lineWidth = 1.5; for (const x of [130, 190, 250]) { g.beginPath(); g.moveTo(x, 70); g.lineTo(x, 220); g.stroke(); }
    g.fillStyle = "#1b7a3e"; g.strokeStyle = "#1b7a3e"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(160, 190); g.lineTo(160, 110); g.lineTo(230, 110); g.stroke();
    g.beginPath(); g.moveTo(244, 110); g.lineTo(226, 98); g.lineTo(226, 122); g.fill();
    g.fillStyle = "#c2412d"; g.beginPath(); g.arc(160, 190, 9, 0, 7); g.fill();
  });
}

function pennantTex() {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = "#00afca"; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h / 2); g.lineTo(0, h); g.closePath(); g.fill();
    g.fillStyle = "#fec50c";
    g.beginPath(); g.arc(150, h / 2, 40, 0, 7); g.fill();
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(150 + Math.cos(a) * 48, h / 2 + Math.sin(a) * 48);
      g.lineTo(150 + Math.cos(a + 0.08) * 66, h / 2 + Math.sin(a + 0.08) * 66); g.lineTo(150 + Math.cos(a - 0.08) * 66, h / 2 + Math.sin(a - 0.08) * 66); g.fill(); }
    g.beginPath(); g.moveTo(90, h / 2 + 86); g.quadraticCurveTo(150, h / 2 + 60, 210, h / 2 + 86); g.quadraticCurveTo(150, h / 2 + 74, 90, h / 2 + 86); g.fill();   // the steppe eagle's wings (simplified)
    for (let y = 18; y < h - 10; y += 26) { g.fillRect(14, y, 10, 12); }      // the ornament along the hoist
  });
}

/**
 * Builds everything into `group`. room = {X0, X1, Z0, Z1, FLOOR_Y, CEIL_Y}. Returns {colliders (metres), lamp}.
 */
/** Static meshes of a group, merged by material (one draw call per material, shadows too). */
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), drop = [];
  const skip = new Set();
  group.traverse((o) => { if (o.userData.noMerge) o.traverse((c) => skip.add(c)); });
  group.traverse((o) => {
    if (skip.has(o) || !o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) return;
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? "s" : "");
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(g); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const { mat, cast, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = cast; m.receiveShadow = true; group.add(m);
  }
}

export function cabinProps(outer, room) {
  const group = new THREE.Group();
  const { X0, X1, Z0, Z1, FLOOR_Y: F, CEIL_Y } = room;
  const brassM = brass();
  const wood = walnut([1, 1]); wood.color.set(0x7a5034);
  const darkWood = std({ color: 0x3a2214, roughness: 0.55 });

  // ---- the wainscot: vertical walnut boards to 0.9 m and a rail on top (all four walls, not across the stairs)
  const WH = 10.8, boards = boardsTex(); boards.wrapS = THREE.RepeatWrapping;
  const wainMat = (len) => { const tx = boards.clone(); tx.needsUpdate = true; tx.wrapS = THREE.RepeatWrapping; tx.repeat.set(len / 12, 1); return std({ map: tx, roughness: 0.55, metalness: 0.02 }); };
  const runs = [
    [X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X0, Z1, 12, Z1], [X0, Z0, X0, Z1],
  ];
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const inward = new THREE.Vector3(-cx, 0, -cz).dot(n) > 0 ? 1 : -1;
    const panel = mesh(rbox(len, WH, 0.36, 0.08), wainMat(len), false);
    at(panel, cx + n.x * inward * 0.2, F + WH / 2, cz + n.z * inward * 0.2, ry); group.add(panel);
    const rail = mesh(rbox(len, 0.5, 0.75, 0.2), darkWood, false);
    at(rail, cx + n.x * inward * 0.36, F + WH + 0.2, cz + n.z * inward * 0.36, ry); group.add(rail);
    const skirt = mesh(rbox(len, 0.9, 0.5, 0.15), darkWood, false);
    at(skirt, cx + n.x * inward * 0.32, F + 0.45, cz + n.z * inward * 0.32, ry); group.add(skirt);
  }

  // ---- the rug under the table
  const rug = mesh(new THREE.PlaneGeometry(40, 30).rotateX(-Math.PI / 2), std({ map: rugTex(), roughness: 1 }), false);
  rug.position.set(-0.5, F + 0.06, -0.5); group.add(rug);

  // ---- the bunk on the right wall (a lee board, mattress, check blanket, pillow), a shelf over it, a reading light
  {
    const bx0 = X1 - 10.5, bz0 = Z0 + 5, bz1 = Z0 + 29, cx = (bx0 + X1) / 2, cz = (bz0 + bz1) / 2, len = bz1 - bz0;
    group.add(at(mesh(rbox(10.5, 4.2, len, 0.3), wood), cx, F + 2.1, cz));                                   // the base with drawers
    for (const z of [cz - len / 4, cz + len / 4]) {
      group.add(at(mesh(rbox(0.3, 3, len / 2 - 1.2, 0.12), darkWood), bx0 - 0.05, F + 2.1, z));
      group.add(at(mesh(rbox(0.3, 0.5, 3, 0.2), brassM), bx0 - 0.3, F + 2.4, z));
    }
    group.add(at(mesh(rbox(10, 1.8, len - 0.6, 0.7), std({ color: 0xe9e2d0, roughness: 0.95 })), cx, F + 5.1, cz));   // mattress
    const blanket = mesh(rbox(10.4, 0.6, len * 0.66, 0.28), std({ map: tartanTex(), roughness: 0.98 }));
    blanket.material.map.wrapS = blanket.material.map.wrapT = THREE.RepeatWrapping; blanket.material.map.repeat.set(2, 3);
    group.add(at(blanket, cx - 0.1, F + 6.05, bz1 - len * 0.33 - 0.3));
    group.add(at(mesh(rbox(10.6, 0.7, 2.6, 0.3), std({ color: 0xece6d6, roughness: 0.95 })), cx - 0.1, F + 6.1, bz1 - len * 0.66 - 0.6));   // the sheet folded back
    const pillow = mesh(rbox(6.5, 1.6, 3.8, 0.75), std({ color: 0xf2eee4, roughness: 0.95 })); pillow.rotation.z = 0.08;
    group.add(at(pillow, cx + 0.6, F + 6.6, bz0 + 2.8));
    group.add(at(mesh(rbox(0.6, 3.2, len - 9, 0.25), wood), bx0 + 0.3, F + 6.8, cz + 3.5));                   // the lee board against the roll
    // the shelf over the bunk with books
    group.add(at(mesh(rbox(3, 0.5, len - 4, 0.15), wood), X1 - 1.5, F + 22.5 - 10, cz));
    const r = rng(17);
    for (let z = bz0 + 3, k = 0; z < bz1 - 3; k++) {
      const th = 0.7 + r() * 0.6, hh = 2.4 + r() * 0.9;
      group.add(at(mesh(rbox(2.4, hh, th, 0.08), std({ color: [0x6b2a20, 0x2a3f5a, 0x3b4a2a, 0x5a4428][k % 4], roughness: 0.7 })), X1 - 1.6, F + 12.75 + hh / 2, z + th / 2));
      z += th + 0.08;
      if (k === 6) z += 3;
    }
    // the reading light (a brass sconce, warm glass)
    const sc = new THREE.Group();
    sc.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 16).rotateZ(Math.PI / 2), brassM));
    const arm = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-1.2, 0.6, 0), new THREE.Vector3(-1.8, 0.2, 0)]), 10, 0.12, 6), brassM);
    sc.add(arm);
    const shade = mesh(new THREE.LatheGeometry([[0.1, 0], [0.9, -0.2], [1.1, -1.2], [0.2, -1.1]].map(([a, b]) => new THREE.Vector2(a, b)), 16), brassM);
    shade.position.set(-1.8, 0.4, 0); sc.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(3) }));
    bulb.position.set(-1.8, -0.5, 0); sc.add(bulb);
    sc.position.set(X1 - 0.3, F + 10.5, bz0 + 7); group.add(sc);
  }

  // ---- the bookshelf: pilot books and binders on the right wall by the door, a strap across each shelf
  {
    const sx = X1 - 1.7, z0 = Z1 - 21, w = 13, hgt = 19;
    group.add(at(mesh(rbox(3.4, hgt, 0.5, 0.15), wood), sx, F + hgt / 2, z0));
    group.add(at(mesh(rbox(3.4, hgt, 0.5, 0.15), wood), sx, F + hgt / 2, z0 + w));
    group.add(at(mesh(rbox(0.3, hgt, w, 0.1), darkWood), X1 - 0.15, F + hgt / 2, z0 + w / 2));
    const labels = [t("shelf_pilot"), t("shelf_log"), t("shelf_tables"), t("shelf_charts"), t("shelf_signals"), t("shelf_rules")];
    const r = rng(23);
    for (let s = 0; s < 4; s++) {
      const y = F + 1 + s * 4.6;
      group.add(at(mesh(rbox(3.4, 0.45, w, 0.12), wood), sx, y, z0 + w / 2));
      if (s === 3) { group.add(at(mesh(rbox(2.8, 2.2, 6, 0.15), std({ color: 0x8a7a5a, roughness: 0.9 })), sx, y + 1.35, z0 + 4)); continue; }   // a box of charts
      for (let z = z0 + 0.6, k = 0; z < z0 + w - 1.4; k++) {
        const th = s === 0 ? 1.1 : 0.55 + r() * 0.5, hh = s === 0 ? 3.6 : 2.6 + r() * 1;
        const col = s === 0 ? ["#1f3d6b", "#7a2620", "#2f5a35"][k % 3] : ["#5a3a24", "#2a2a33", "#6b5a3a", "#3a4a5a"][k % 4];
        const m = s === 0 ? [std({ color: col, roughness: 0.6 }), std({ color: col, roughness: 0.6 }), std({ color: col }), std({ color: col }), std({ color: col }), std({ map: spineTex(labels[k % labels.length], col, k + 3), roughness: 0.6 })]
          : std({ color: col, roughness: 0.7 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, hh, th), m); b.castShadow = true;
        b.rotation.y = -Math.PI / 2;
        at(b, sx - 0.2, y + 0.23 + hh / 2, z + th / 2, s === 0 ? -Math.PI / 2 : 0); group.add(b);
        z += th + 0.06;
      }
      group.add(at(mesh(rbox(0.15, 0.5, w - 0.4, 0.07), std({ color: 0x8e2a1a, roughness: 0.8 })), sx - 1.75, y + 2.2, z0 + w / 2));   // the strap against the roll
    }
  }

  // ---- the brass clock, barometer and thermometer on the left wall (where the wheel was)
  {
    const face = (kind, z, y) => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.7, 40).rotateZ(Math.PI / 2), brassM));
      const d = new THREE.Mesh(new THREE.CircleGeometry(1.95, 40), std({ map: dialTex(kind), roughness: 0.5 })); d.rotation.y = Math.PI / 2; d.position.x = 0.36; g.add(d);
      const gl = new THREE.Mesh(new THREE.CircleGeometry(1.95, 40), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.12, clearcoat: 1 }));
      gl.rotation.y = Math.PI / 2; gl.position.x = 0.5; g.add(gl);
      const ring = mesh(new THREE.TorusGeometry(2.1, 0.22, 10, 40), brassM); ring.rotation.y = Math.PI / 2; ring.position.x = 0.45; g.add(ring);
      g.position.set(X0 + 0.7, y, z); group.add(g);
    };
    face("clock", -20, 10.2);
    face("baro", -10, 10.2);
    const th = new THREE.Group();
    th.add(mesh(rbox(0.4, 5, 1.1, 0.2), brassM));
    const tubeM = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.8, 8), std({ color: 0xf2f0ea, roughness: 0.2 })); tubeM.position.x = 0.3; th.add(tubeM);
    const merc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xc2412d })); merc.position.set(0.36, -1, 0); th.add(merc);
    th.position.set(X0 + 0.6, 10, -15); group.add(th);
  }

  // ---- the Kazakhstan pennant on the left wall, near the door
  {
    const pen = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5, 10, 2), std({ map: pennantTex(), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.8 }));
    const p = pen.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin((x + 3.5) * 0.9) * 0.18); p.setY(i, p.getY(i) - (x + 3.5) * 0.12); }
    pen.geometry.computeVertexNormals();
    pen.rotation.y = Math.PI / 2; pen.position.set(X0 + 0.5, 12.5, 20); group.add(pen);
    group.add(at(mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8), brassM), X0 + 0.6, 12.5, 16.4));
  }

  // ---- the captain's jacket and cap on a hook by the door (near wall)
  {
    const hx = -14, hz = Z1 - 0.6;
    group.add(at(mesh(rbox(3.2, 0.7, 0.4, 0.15), darkWood), hx, 9.6, hz + 0.3));
    for (const dx of [-0.9, 0.9]) group.add(at(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.2, -0.8), new THREE.Vector3(0, 0.7, -1.0)]), 8, 0.1, 6), brassM), hx + dx, 9.5, hz));
    const navy = std({ color: 0x1c2638, roughness: 0.85 });
    const jacket = new THREE.Group();
    const body = mesh(new THREE.LatheGeometry([[0, 0], [2.2, 0.1], [2.5, 2], [2.3, 5], [2.6, 7.2], [1.0, 7.7], [0, 7.8]].map(([a, b]) => new THREE.Vector2(a, b)), 20), navy);
    body.scale.z = 0.45; jacket.add(body);
    for (const sx of [-1, 1]) { const sl = mesh(new THREE.CylinderGeometry(0.75, 0.9, 6.2, 10), navy); sl.position.set(sx * 2.5, 4.1, 0.1); sl.rotation.z = sx * 0.12; jacket.add(sl); }
    for (let k = 0; k < 4; k++) for (const sx of [-0.6, 0.6]) { const b = mesh(new THREE.SphereGeometry(0.16, 8, 6), brassM); b.position.set(sx, 5.6 - k * 1.3, 1.1); jacket.add(b); }
    for (const sx of [-1, 1]) { const ep = mesh(rbox(1.5, 0.15, 0.9, 0.06), std({ color: 0xc9a646, metalness: 0.7, roughness: 0.35 })); ep.position.set(sx * 1.9, 7.45, 0); jacket.add(ep); }
    jacket.position.set(hx - 0.9, 1.5, hz - 1.2); group.add(jacket);
    const cap = new THREE.Group();
    cap.add(mesh(new THREE.CylinderGeometry(1.25, 1.05, 0.9, 20), std({ color: 0xf1efe8, roughness: 0.7 })));
    const band = mesh(new THREE.CylinderGeometry(1.07, 1.07, 0.5, 20), std({ color: 0x15161a, roughness: 0.6 })); band.position.y = -0.55; cap.add(band);
    const visor = mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.08, 20, 1, false, -0.9, 1.8), std({ color: 0x0c0c0e, roughness: 0.25 })); visor.position.set(0, -0.78, 0.35); cap.add(visor);
    const badge = mesh(new THREE.SphereGeometry(0.22, 8, 6), brassM); badge.position.set(0, -0.5, 1.07); cap.add(badge);
    cap.position.set(hx + 0.9, 9.4, hz - 1.0); cap.rotation.x = -0.25; group.add(cap);
  }

  // ---- the swivel chair at the left side of the table (five-star base, gas post, leather seat and back)
  {
    const ch = new THREE.Group(), leather = std({ color: 0x5a2e1a, roughness: 0.55 }), chrome = std({ color: 0x8a9096, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 5; i++) { const leg = mesh(rbox(3.2, 0.35, 0.55, 0.15), chrome); leg.rotation.y = i / 5 * Math.PI * 2; leg.position.y = 0.6; leg.translateX(1.6); ch.add(leg);
      const wh = mesh(new THREE.SphereGeometry(0.32, 8, 6), darkWood); wh.position.set(Math.cos(-i / 5 * Math.PI * 2) * 3.1, 0.3, Math.sin(-i / 5 * Math.PI * 2) * 3.1); ch.add(wh); }
    ch.add(at(mesh(new THREE.CylinderGeometry(0.35, 0.45, 4.2, 12), chrome), 0, 2.8, 0));
    ch.add(at(mesh(rbox(5.2, 1.1, 5.0, 0.45), leather), 0, 5.2, 0));
    const back = mesh(rbox(5.0, 5.8, 0.9, 0.4), leather); back.position.set(0, 8.4, 2.4); back.rotation.x = -0.12; ch.add(back);
    for (const sx of [-1, 1]) ch.add(at(mesh(rbox(0.6, 0.5, 3.6, 0.2), leather), sx * 2.8, 6.9, 0.4));
    ch.position.set(-20.5, F, -1.5); ch.rotation.y = -Math.PI / 2 + 0.35; group.add(ch);
  }

  // ---- the chart table: brass trim on the edges, three drawers with brass pulls on the near side
  {
    const x0 = -15, x1 = 14, z0 = -12, z1 = 11;
    group.add(at(mesh(rbox(x1 - x0 + 0.4, 0.35, 0.35, 0.12), brassM), (x0 + x1) / 2, 0.02, z1 + 0.05));
    group.add(at(mesh(rbox(x1 - x0 + 0.4, 0.35, 0.35, 0.12), brassM), (x0 + x1) / 2, 0.02, z0 - 0.05));
    group.add(at(mesh(rbox(0.35, 0.35, z1 - z0, 0.12), brassM), x0 - 0.05, 0.02, (z0 + z1) / 2));
    group.add(at(mesh(rbox(0.35, 0.35, z1 - z0, 0.12), brassM), x1 + 0.05, 0.02, (z0 + z1) / 2));
    for (let k = 0; k < 3; k++) {
      const cx = x0 + (x1 - x0) * (k + 0.5) / 3;
      group.add(at(mesh(rbox(8.6, 2.2, 0.4, 0.12), darkWood), cx, -2.4, z1 + 0.1));
      group.add(at(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-0.8, 0, 0.45), new THREE.Vector3(0.8, 0, 0.45), new THREE.Vector3(1, 0, 0)]), 10, 0.13, 6), brassM), cx, -2.4, z1 + 0.3));
    }
    // on the table: a parallel ruler, the binoculars case, papers under a brass weight, a green-shaded lamp
    const ruler = new THREE.Group(), acr = new THREE.MeshPhysicalMaterial({ color: 0x9ab0a8, roughness: 0.15, transparent: true, opacity: 0.55, clearcoat: 1 });
    for (const dz of [-0.7, 0.7]) ruler.add(at(mesh(rbox(8, 0.12, 1.1, 0.05), acr), 0, 0.08, dz));
    for (const dx of [-2.5, 2.5]) ruler.add(at(mesh(rbox(0.25, 0.1, 2.0, 0.05), brassM), dx, 0.18, 0));
    ruler.position.set(-11.5, 0, 8.4); ruler.rotation.y = 0.2; group.add(ruler);
    const case_ = new THREE.Group(), leather2 = std({ color: 0x4a2a18, roughness: 0.6 });
    case_.add(at(mesh(rbox(3.6, 2.4, 2.0, 0.5), leather2), 0, 1.2, 0));
    case_.add(at(mesh(rbox(3.7, 0.5, 2.1, 0.25), leather2), 0, 2.4, 0));
    case_.add(at(mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 24, Math.PI), leather2), 0, 2.4, 0));
    case_.position.set(11.5, 0, 8.6); case_.rotation.y = -0.4; case_.scale.setScalar(0.62); group.add(case_);
    const paper = std({ color: 0xf1ead8, roughness: 0.95 });
    for (let k = 0; k < 4; k++) group.add(at(mesh(new THREE.BoxGeometry(5.4, 0.04, 7), paper), -11.8 + k * 0.15, 0.03 + k * 0.045, -7.5 + k * 0.1, 0.1 - k * 0.06));
    const weight = mesh(new THREE.LatheGeometry([[0, 0], [0.9, 0], [1.0, 0.25], [0.7, 0.6], [0.3, 0.9], [0.32, 1.3], [0, 1.4]].map(([a, b]) => new THREE.Vector2(a, b)), 20), brassM);
    weight.position.set(-11.2, 0.22, -6.8); group.add(weight);
    // the desk lamp with a green glass shade
    const lamp = new THREE.Group();
    lamp.add(mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 20), brassM));
    lamp.add(at(mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 8), brassM), 0, 1.75, 0));
    const shade = mesh(new THREE.CylinderGeometry(0.9, 1.4, 1.2, 24, 1, true, 0, Math.PI * 2).rotateX(0), std({ color: 0x1d6b3e, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide, emissive: 0x0a3a1a, emissiveIntensity: 0.6 }));
    shade.position.set(0.6, 3.5, 0); shade.rotation.z = 1.3; lamp.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd08a).multiplyScalar(3) }));
    bulb.position.set(0.9, 3.4, 0); lamp.add(bulb);
    lamp.position.set(12, 0.17, -9); lamp.rotation.y = 2.4; group.add(lamp);
    const lampLight = new THREE.PointLight(0xffc070, 14, 18, 1.6); lampLight.position.set(11, 3.4, -8.2); group.add(lampLight);
  }

  // ---- a cable tray along a ceiling beam, three cables in it
  {
    const tray = mesh(rbox(1.6, 0.35, Z1 - Z0 - 4, 0.1), std({ color: 0x9aa0a4, metalness: 0.7, roughness: 0.45 }));
    tray.position.set(-8, CEIL_Y - 1.2, (Z0 + Z1) / 2); group.add(tray);
    for (let k = 0; k < 3; k++) {
      const c = mesh(new THREE.CylinderGeometry(0.16, 0.16, Z1 - Z0 - 5, 8).rotateX(Math.PI / 2), std({ color: [0x1b1b1b, 0x2a3f5a, 0x7a2620][k], roughness: 0.6 }));
      c.position.set(-8.5 + k * 0.5, CEIL_Y - 0.95, (Z0 + Z1) / 2); group.add(c);
    }
  }

  // ---- the evacuation plan by the door (near wall)
  {
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.5), std({ map: evacTex(), roughness: 0.4 }));
    plan.rotation.y = Math.PI; plan.position.set(6, 8, Z1 - 0.25); group.add(plan);
    group.add(at(mesh(rbox(5.6, 3.9, 0.2, 0.08), darkWood), 6, 8, Z1 - 0.1));
  }

  // everything above is static: one mesh per material (lights stay as they are)
  mergeByMaterial(group);
  outer.add(group);
  return {
    // walking colliders in metres: the bunk, the bookshelf, the chair
    colliders: [[(X1 - 11) / 12, (Z0 + 4.5) / 12, X1 / 12, (Z0 + 29.5) / 12], [(X1 - 3.6) / 12, (Z1 - 21.5) / 12, X1 / 12, (Z1 - 7.5) / 12], [-2.0, -0.45, -1.45, 0.2]],
  };
}
