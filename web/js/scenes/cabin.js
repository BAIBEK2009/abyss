// The captain's cabin around the chart table (CLAUDE.md v3.1, 21.1 p. 6; v3 4.3): the table does not
// hang in emptiness. Plank floor and walls, ceiling beams, two portholes with the night sea and the
// moon, a green radio on a cabinet, the ship's wheel and a chart of the Caspian on the walls,
// a barrel, the brass lamp over the table with dust floating in its light.
// Scale: the chart sheet (12 units) is about a metre, so the room is about 5 x 5.5 m.
// The walls are light-grey painted steel with welded seams and rivets (a ship, not a log cabin); the floor
// stays wooden; the light inside is warm, the moon through the portholes cold.
import * as THREE from "three";
import { canvasTexture, rng } from "../view.js";
import { walnut, brass, glass, steelPanel } from "./materials.js";
import { t } from "../i18n.js";

export const FLOOR_Y = -10;
const CEIL_Y = 18, X0 = -30, X1 = 30, Z0 = -38, Z1 = 30;

const std = (o) => new THREE.MeshStandardMaterial(o);
function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

/** Night sea through a porthole: sky, moon with a halo, moonlit path on the waves. */
function nightSea(seed) {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(seed);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, "#050a18"); sky.addColorStop(1, "#1b2c4a");
    g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.55);
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.8})`; g.fillRect(r() * w, r() * h * 0.5, 1.4, 1.4); }
    const mx = w * (0.3 + r() * 0.4), my = h * 0.2;
    const halo = g.createRadialGradient(mx, my, 0, mx, my, 120);
    halo.addColorStop(0, "rgba(220,230,255,.55)"); halo.addColorStop(1, "rgba(220,230,255,0)");
    g.fillStyle = halo; g.fillRect(0, 0, w, h);
    g.fillStyle = "#f4f1e6"; g.beginPath(); g.arc(mx, my, 22, 0, 7); g.fill();
    const sea = g.createLinearGradient(0, h * 0.55, 0, h);
    sea.addColorStop(0, "#0e1c30"); sea.addColorStop(1, "#04080f");
    g.fillStyle = sea; g.fillRect(0, h * 0.55, w, h * 0.45);
    for (let i = 0; i < 520; i++) {                         // the moon path on the waves
      const y = h * 0.56 + Math.pow(r(), 1.6) * h * 0.44, spread = 10 + (y - h * 0.55) * 0.7;
      const x = mx + (r() - 0.5) * spread * 2;
      g.fillStyle = `rgba(210,225,255,${0.25 + r() * 0.5})`; g.fillRect(x, y, 4 + r() * 12, 1.4);
    }
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
  const steelWall = steelPanel({ color: "#c6c9c8", seed: 23 });
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
  for (const [x, seed] of [[-13, 3], [13, 9]]) {
    const y = 6.5, z = Z0 + 0.05;
    const view = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48), new THREE.MeshBasicMaterial({ map: nightSea(seed), toneMapped: true }));
    view.material.color.setScalar(1.6);
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
    const glow = new THREE.PointLight(0x8fb0ff, 6, 22, 1.6);      // cold moonlight falling in
    glow.position.set(x, y, z + 3); group.add(glow);
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

  // the ship's wheel on the left wall, the Caspian chart on the right wall, a barrel
  {
    const wheel = new THREE.Group();
    const wood = std({ color: 0x5a3820, roughness: 0.6 });
    wheel.add(mesh(new THREE.TorusGeometry(3.2, 0.32, 12, 48), wood));
    wheel.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.8, 20).rotateX(Math.PI / 2), ringMat));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = mesh(new THREE.CylinderGeometry(0.16, 0.2, 8.2, 8), wood);
      spoke.rotation.z = a; wheel.add(spoke);
    }
    wheel.position.set(X0 + 0.9, 5, -12); wheel.rotation.y = Math.PI / 2;
    group.add(wheel);
    const chartW = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), std({ map: caspianChart(), roughness: 0.9 }));
    chartW.position.set(X1 - 0.1, 5, -14); chartW.rotation.y = -Math.PI / 2; group.add(chartW);
    const barrel = new THREE.Group();
    const staves = mesh(new THREE.CylinderGeometry(3, 3, 8, 24), std({ color: 0x6a4428, roughness: 0.75 }));
    barrel.add(staves);
    for (const y of [-2.8, 2.8]) { const band = mesh(new THREE.TorusGeometry(3.05, 0.18, 8, 32).rotateX(Math.PI / 2), std({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 })); band.position.y = y; barrel.add(band); }
    barrel.position.set(X1 - 5, FLOOR_Y + 4, Z0 + 6); group.add(barrel);
  }

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
      g.fillStyle = "#f4fff6"; g.font = "800 62px Onest, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(t("sign_exit"), w / 2, h / 2 + 3);
      g.strokeStyle = "#f4fff6"; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    });
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.06), new THREE.MeshBasicMaterial({ map: signTex, color: new THREE.Color(1, 1, 1).multiplyScalar(1.5) }));
    signM.position.set(SX, FLOOR_Y + 25.1, Z1 - 1.5); signM.rotation.y = Math.PI; stairs.add(signM);
    const fe = new THREE.Group(); fe.position.set(SX - 9, FLOOR_Y + 5, Z1 - 1.3); fe.scale.setScalar(12); stairs.add(fe);
    const red = std({ color: 0xc8231b, roughness: 0.35, metalness: 0.2 }), blackM = std({ color: 0x1c1c1c, metalness: 0.6, roughness: 0.4 });
    fe.add(mesh(new THREE.LatheGeometry([[0, 0], [0.075, 0], [0.085, 0.02], [0.085, 0.5], [0.07, 0.56], [0.03, 0.6], [0, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), 24), red));
    const valve = mesh(new THREE.LatheGeometry([[0.025, 0], [0.025, 0.06], [0.012, 0.08], [0, 0.08]].map(([x, y]) => new THREE.Vector2(x, y)), 12), blackM); valve.position.y = 0.6; fe.add(valve);
    const hose = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.02, 0.66, 0.02], [0.1, 0.62, -0.06], [0.11, 0.3, -0.07], [0.08, 0.15, -0.06]].map((q) => new THREE.Vector3(...q))), 20, 0.012, 6), blackM); fe.add(hose);
    group.add(stairs);
  }

  // the brass lamp over the table; the scene's spotlight sits in its bulb
  const lamp = new THREE.Group();
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
  const proxy = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat); m.position.set(x, y, z); group.add(m); return m; };
  const M = 12, q = new THREE.Quaternion(), e = new THREE.Euler();
  const space = {
    scale: M, eye: 1.65, step: "wood",
    poly: [[-2.35, -3.0], [2.35, -3.0], [2.35, 2.36], [-2.35, 2.36]],
    colliders: [[-1.25, -1.02, 1.17, 0.94], [-2.55, -3.25, -1.72, -2.72], [1.82, -2.95, 2.36, -2.4],
                [-2.55, -0.42, -2.36, -0.25], [2.36, -0.42, 2.55, -0.25], [1.05, 2.0, 1.15, 2.6], [2.05, 2.0, 2.15, 2.6]],
    floor: [floor],
    toWorld: (x, y, z, out) => out.set(x, FLOOR_Y + y, z),
    toLocal: (w, out) => out.set(w.x, w.y - FLOOR_Y, w.z),
    orient: (yaw, pitch, out) => out.setFromEuler(e.set(pitch, yaw + Math.PI, 0, "YXZ")),
  };
  const things = {
    table: { show: [], hit: proxy(28, 3, 22.6, -0.5, 0, -0.5), stand: [0.0, 1.5], look: [0.0, 0.85, 0.2] },
    stairs_up: { show: [stairs], hit: proxy(11, 22, 4, 19, FLOOR_Y + 11, Z1 - 2.5), stand: [1.58, 1.95], look: [1.58, 1.4, 2.5] },
  };

  return {
    group, space, things,
    /** First person: where the captain stands coming down the stairs / getting up from the table. */
    spawn: { stairs: { x: 1.58, z: 1.85, yaw: Math.PI, pitch: -0.12 }, table: { x: 0.0, z: 1.45, yaw: Math.PI, pitch: -0.45 } },
    /** Where the camera stands when the captain gets up from the table: a view of the whole cabin. */
    standPose: { target: new THREE.Vector3(1, 2.5, -10), dist: 41, tilt: 15, yaw: 20 },
    update(dt, time, sway) {
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
