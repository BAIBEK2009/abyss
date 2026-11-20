// Pencil and paper effects drawn on the chart: route, cell frame, sonar zone and wave,
// sonar marks, the found-box pin, the AI-hint "current". Only drawing — no game logic.
import * as THREE from "three";
import { cellToWorld, PALETTE } from "./scene.js";

const LIFT = 0.012;           // draw slightly above the relief top
const UP = new THREE.Vector3(0, 1, 0);

function canvasTex(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Flat strokes (thin quads) — readable pencil lines at any zoom, unlike 1-px GL lines. */
function strokeMesh(max, color, opacity = 0.9) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.renderOrder = 5;
  m.frustumCulled = false;
  return m;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();

/** Put stroke i from a to b (world points) with given width. */
function setStroke(mesh, i, a, b, width) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const len = a.distanceTo(b);
  tmpQ.setFromAxisAngle(UP, Math.atan2(-(b.z - a.z), b.x - a.x));
  tmpS.set(len, 1, width);
  tmpM.compose(mid, tmpQ, tmpS);
  mesh.setMatrixAt(i, tmpM);
}

export function createEffects(scene, hills) {
  const top = (x, y) => hills.topOf(x, y).add(new THREE.Vector3(0, LIFT, 0));

  // ---------------------------------------------------------------- pencil route (A* path)
  const route = strokeMesh(600, 0x4a4a55);
  scene.add(route);
  let routeCells = null, routeDashed = true, routeColor = 0x4a4a55;

  function drawRoute() {
    if (!routeCells) { route.count = 0; return; }
    let n = 0;
    for (let i = 0; i + 1 < routeCells.length; i++) {
      const a = top(...routeCells[i]), b = top(...routeCells[i + 1]);
      if (routeDashed) {                       // 3 dashes per cell
        for (let d = 0; d < 3; d++) {
          const t0 = d / 3 + 0.04, t1 = d / 3 + 0.22;
          setStroke(route, n++, a.clone().lerp(b, t0), a.clone().lerp(b, t1), 0.05);
        }
      } else {
        setStroke(route, n++, a, b.clone().add(b.clone().sub(a).multiplyScalar(0.03)), 0.05);
      }
    }
    route.count = n;
    route.material.color.set(routeColor);
    route.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- pencil frame around a cell
  const frame = strokeMesh(4, 0x2b2a33);
  scene.add(frame);
  let frameCell = null, frameColor = 0x2b2a33;
  function drawFrame() {
    if (!frameCell) { frame.count = 0; return; }
    const c = top(...frameCell), h = 0.47;
    const p = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dz]) => c.clone().add(new THREE.Vector3(dx, 0, dz)));
    for (let i = 0; i < 4; i++) setStroke(frame, i, p[i], p[(i + 1) % 4], 0.045);
    frame.count = 4;
    frame.material.color.set(frameColor);
    frame.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- dashed sonar zone
  const zone = strokeMesh(64, 0x4E7A8A, 0.95);
  scene.add(zone);
  let zoneCell = null;
  function drawZone() {
    if (!zoneCell) { zone.count = 0; return; }
    const c = top(...zoneCell), R = 1.45, N = 28;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = a0 + (Math.PI * 2 / N) * 0.55;
      setStroke(zone, i, c.clone().add(new THREE.Vector3(Math.cos(a0) * R, 0, Math.sin(a0) * R)),
                c.clone().add(new THREE.Vector3(Math.cos(a1) * R, 0, Math.sin(a1) * R)), 0.05);
    }
    zone.count = N;
    zone.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- sonar marks & lift crosses
  const markTex = {
    silence: canvasTex(128, (g, s) => {
      g.strokeStyle = "rgba(91,91,102,0.9)"; g.lineWidth = 8;
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.36, 0.2, Math.PI * 2 - 0.1); g.stroke();
    }),
    echo: canvasTex(128, (g, s) => {
      g.strokeStyle = "rgba(194,65,45,0.95)"; g.lineWidth = 10;
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "rgba(194,65,45,0.95)";
      g.beginPath(); g.arc(s / 2, s / 2, 9, 0, Math.PI * 2); g.fill();
    }),
    miss: canvasTex(128, (g, s) => {
      g.strokeStyle = "rgba(60,60,70,0.9)"; g.lineWidth = 9; g.lineCap = "round";
      g.beginPath(); g.moveTo(s * 0.25, s * 0.25); g.lineTo(s * 0.75, s * 0.75); g.stroke();
      g.beginPath(); g.moveTo(s * 0.75, s * 0.25); g.lineTo(s * 0.25, s * 0.75); g.stroke();
    }),
  };
  const markGeo = new THREE.PlaneGeometry(0.62, 0.62);
  markGeo.rotateX(-Math.PI / 2);
  const markMat = {};
  for (const k of Object.keys(markTex)) {
    markMat[k] = new THREE.MeshBasicMaterial({ map: markTex[k], transparent: true, depthWrite: false });
  }
  const marks = new THREE.Group();
  scene.add(marks);
  let markList = [];

  const MARKS_PER_CELL = 3;   // repeated checks in one cell: only the latest few, slightly offset
  function drawMarks() {
    marks.clear();
    const byCell = new Map();
    for (const m of markList) {
      const key = m.cell.join(",");
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(m);
    }
    for (const list of byCell.values()) list.slice(-MARKS_PER_CELL).forEach((m, i) => drawMark(m, i));
  }
  function drawMark(m, i) {
    const mesh = new THREE.Mesh(markGeo, markMat[m.type]);
    mesh.position.copy(top(...m.cell)).add(new THREE.Vector3(0.07 * i, 0.001 * i, -0.05 * i));
    mesh.rotation.y = ((m.cell[0] * 7 + m.cell[1] * 13 + i * 5) % 10 - 5) * 0.06;  // hand-drawn tilt
    mesh.renderOrder = 4;
    marks.add(mesh);
  }

  // ---------------------------------------------------------------- expanding sonar wave
  const waves = [];
  function sonarWave(cell, echo) {
    const geo = new THREE.RingGeometry(0.9, 1.0, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: echo ? PALETTE.redPencil : 0x4E7A8A, transparent: true,
                                              opacity: 0.85, depthWrite: false });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(top(...cell));
    ring.renderOrder = 6;
    scene.add(ring);
    waves.push({ ring, t: 0, dur: 1.1 });
  }

  // ---------------------------------------------------------------- pin with flag + rising box
  let found = null;
  function foundBox(cell) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xE8792B, roughness: 0.5 }));
    box.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.6 }));
    band.position.y = 0.04;
    box.add(band);
    const pin = new THREE.Group();
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.8, roughness: 0.3 }));
    needle.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.redPencil, roughness: 0.4 }));
    head.position.y = 1.12;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2),
      new THREE.MeshStandardMaterial({ color: PALETTE.redPencil, side: THREE.DoubleSide, roughness: 0.7 }));
    flag.position.set(0.18, 0.98, 0);
    pin.add(needle, head, flag);
    pin.position.set(0.32, 0, 0.1);
    for (const o of [needle, head, flag]) o.castShadow = true;
    g.add(box, pin);
    g.position.copy(top(...cell));
    scene.add(g);
    found = { g, box, pin, flag, t: 0 };
  }

  // ---------------------------------------------------------------- AI hint: a drifting current
  const N = 420;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  const pMat = new THREE.PointsMaterial({ color: 0x3d2a1a, size: 0.19, transparent: true, opacity: 0, depthWrite: false });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  particles.renderOrder = 7;
  scene.add(particles);
  let current = null;
  function hintCurrent(cell) {
    const target = top(...cell);
    const seeds = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
      seeds.push({ p: target.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.03, Math.sin(a) * r)),
                   swirl: (Math.random() - 0.5) * 1.6, speed: 0.6 + Math.random() * 0.9 });
    }
    current = { target, seeds, t: 0, dur: 4 };
  }

  // ---------------------------------------------------------------- per-frame update
  function update(dt) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.t += dt;
      const k = w.t / w.dur;
      w.ring.scale.setScalar(0.2 + k * 2.6);
      w.ring.material.opacity = 0.85 * (1 - k);
      if (k >= 1) { scene.remove(w.ring); w.ring.geometry.dispose(); w.ring.material.dispose(); waves.splice(i, 1); }
    }
    if (found) {
      found.t += dt;
      const k = Math.min(1, found.t / 1.6);
      found.box.position.y = -0.3 + 0.48 * (1 - Math.pow(1 - k, 3));   // rises out of the layers
      found.pin.position.y = Math.max(0, 0.9 * (1 - Math.min(1, found.t / 0.5)));  // pin pushed in
      found.flag.rotation.y = Math.sin(found.t * 3) * 0.25;
    }
    if (current) {
      current.t += dt;
      const pos = pGeo.attributes.position;
      for (let i = 0; i < N; i++) {
        const s = current.seeds[i];
        const to = current.target.clone().sub(s.p);
        const d = to.length();
        if (d < 0.25) {                               // arrived: respawn at the rim
          const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 4;
          s.p.copy(current.target).add(new THREE.Vector3(Math.cos(a) * r, 0.03, Math.sin(a) * r));
        } else {
          to.normalize();
          const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(s.swirl);
          s.p.addScaledVector(to.add(side).normalize(), s.speed * dt * (1 + 2 / (d + 0.5)));
        }
        pos.setXYZ(i, s.p.x, s.p.y + 0.02, s.p.z);
      }
      pos.needsUpdate = true;
      const fade = Math.min(1, current.t / 0.5, (current.dur - current.t) / 0.6);
      pMat.opacity = 0.85 * Math.max(0, fade);
      if (current.t >= current.dur) { current = null; pMat.opacity = 0; }
    }
  }

  // everything that lies on the relief follows it when the hills change
  hills.onChange(() => { drawRoute(); drawFrame(); drawZone(); drawMarks(); });

  return {
    update,
    showRoute(cells, { dashed = true, color = 0x4a4a55 } = {}) {
      routeCells = cells; routeDashed = dashed; routeColor = color; drawRoute();
    },
    hideRoute() { routeCells = null; drawRoute(); },
    frameCell(cell, color = 0x2b2a33) { frameCell = cell; frameColor = color; drawFrame(); },
    sonarZone(cell) { zoneCell = cell; drawZone(); },
    setMarks(list) { markList = list; drawMarks(); },
    sonarWave, foundBox, hintCurrent,
  };
}
