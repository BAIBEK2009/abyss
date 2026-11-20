// Objects on the table: toy submarine, paper boat (base), brass instruments, pencil.
// Everything is procedural geometry — no external 3D models.
import * as THREE from "three";
import { cellToWorld, PALETTE, MAP_MARGIN } from "./scene.js";

const deg = THREE.MathUtils.degToRad;
export const CHART_TOP_Y = 0.04;   // top surface of the paper chart

const MAT = {
  brass: new THREE.MeshStandardMaterial({ color: PALETTE.brass, metalness: 0.85, roughness: 0.32 }),
  darkBrass: new THREE.MeshStandardMaterial({ color: 0x7a5a28, metalness: 0.8, roughness: 0.45 }),
  paper: new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.9 }),
  // the paper boat is folded from a sheet of blue-grey chart paper, so it stands out on the map
  paperFold: new THREE.MeshStandardMaterial({ color: 0xb9cdd6, roughness: 0.85, flatShading: true }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.6 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x5b2a1e, roughness: 0.75 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1d2a33, metalness: 0.2, roughness: 0.08 }),
  glassClear: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.05 }),
  redPencil: new THREE.MeshStandardMaterial({ color: 0xc2412d, roughness: 0.6 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.5 }),
};

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ toy submarine
export function createSub(color = PALETTE.subYellow) {
  const plastic = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.05 });
  const g = new THREE.Group();
  const body = new THREE.Group();   // bobs and tilts; `g` is positioned on the map
  g.add(body);

  const hull = mesh(new THREE.CapsuleGeometry(0.15, 0.42, 8, 18), plastic);
  hull.rotation.z = deg(90);
  body.add(hull);

  const tower = mesh(new THREE.CapsuleGeometry(0.065, 0.1, 6, 12), plastic);
  tower.scale.set(1.25, 1, 0.75);
  tower.position.set(0.03, 0.17, 0);
  body.add(tower);

  const scope = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), MAT.darkBrass);
  scope.position.set(0.05, 0.3, 0);
  body.add(scope);
  const scopeTop = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8), MAT.darkBrass);
  scopeTop.rotation.z = deg(90);
  scopeTop.position.set(0.075, 0.38, 0);
  body.add(scopeTop);

  for (const side of [1, -1]) {      // portholes on both sides
    for (const x of [-0.12, 0.05]) {
      const ring = mesh(new THREE.TorusGeometry(0.045, 0.013, 8, 20), MAT.brass, false);
      ring.position.set(x, 0.02, side * 0.142);
      body.add(ring);
      const glass = mesh(new THREE.CircleGeometry(0.042, 20), MAT.glass, false);
      glass.position.set(x, 0.02, side * 0.144);
      if (side < 0) glass.rotation.y = Math.PI;
      body.add(glass);
    }
  }

  const finGeo = new THREE.BoxGeometry(0.12, 0.012, 0.16);
  for (const z of [0.1, -0.1]) {
    const fin = mesh(finGeo, plastic);
    fin.position.set(-0.3, 0, z);
    body.add(fin);
  }
  const rudder = mesh(new THREE.BoxGeometry(0.1, 0.14, 0.012), plastic);
  rudder.position.set(-0.32, 0.06, 0);
  body.add(rudder);

  const prop = new THREE.Group();     // propeller spins around the hull axis
  prop.position.set(-0.38, 0, 0);
  const hub = mesh(new THREE.ConeGeometry(0.035, 0.07, 10), MAT.brass);
  hub.rotation.z = deg(90);
  prop.add(hub);
  for (let i = 0; i < 3; i++) {
    const blade = mesh(new THREE.BoxGeometry(0.012, 0.11, 0.04), MAT.brass);
    blade.position.y = 0.05;
    const arm = new THREE.Group();
    arm.rotation.x = (i * Math.PI * 2) / 3;
    blade.rotation.y = deg(25);
    arm.add(blade);
    prop.add(arm);
  }
  body.add(prop);

  const HULL_Y = 0.19;  // resting on the chart
  body.position.y = HULL_Y;
  g.scale.setScalar(1.2);

  function update(t) {
    body.position.y = HULL_Y + Math.sin(t * 1.6) * 0.012;
    body.rotation.z = Math.sin(t * 1.1) * deg(2.5);
    body.rotation.x = Math.sin(t * 0.9 + 1) * deg(1.5);
    prop.rotation.x = t * 1.2;
  }
  return { group: g, update };
}

// ------------------------------------------------------------------ paper boat (the base ship)
export function createShip(flagColor = PALETTE.redPencil) {
  const g = new THREE.Group();
  const hullShape = new THREE.Shape([
    new THREE.Vector2(-0.46, 0.16), new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0),
    new THREE.Vector2(0.46, 0.16), new THREE.Vector2(0.18, 0.16), new THREE.Vector2(0, 0.08),
    new THREE.Vector2(-0.18, 0.16),
  ]);
  const hull = mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 0.3, bevelEnabled: false }), MAT.paperFold);
  hull.position.z = -0.15;
  g.add(hull);
  const sailShape = new THREE.Shape([
    new THREE.Vector2(-0.24, 0.1), new THREE.Vector2(0.24, 0.1), new THREE.Vector2(0, 0.5),
  ]);
  const sail = mesh(new THREE.ExtrudeGeometry(sailShape, { depth: 0.16, bevelEnabled: false }), MAT.paperFold);
  sail.scale.z = 0.12;
  sail.position.z = -0.01;
  g.add(sail);
  const mast = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), MAT.ink);
  mast.position.set(0, 0.6, 0);
  g.add(mast);
  const flag = mesh(new THREE.PlaneGeometry(0.12, 0.07), new THREE.MeshStandardMaterial({
    color: flagColor, roughness: 0.7, side: THREE.DoubleSide }));
  flag.position.set(0.065, 0.67, 0);
  g.add(flag);
  g.position.y = 0.04;
  g.scale.setScalar(1.35);
  return { group: g, update: (t) => { flag.rotation.y = Math.sin(t * 2.3) * 0.25; } };
}

// ------------------------------------------------------------------ instruments
/** Brass fuel gauge on a little stand, face tilted toward the captain. */
export function createFuelGauge() {
  const g = new THREE.Group();
  const R = 1.15;
  const face = canvasTex(512, 512, (c, w) => {
    c.fillStyle = "#EFE6D2"; c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); c.fill();
    const cx = w / 2, cy = w / 2;
    const a0 = deg(-210), a1 = deg(30);    // 0 % -> 100 % sweep (canvas angles)
    // red zone below 30 % (the MDP threshold)
    c.strokeStyle = "rgba(194,65,45,0.85)"; c.lineWidth = 26;
    c.beginPath(); c.arc(cx, cy, w * 0.36, a0, a0 + (a1 - a0) * 0.3); c.stroke();
    c.strokeStyle = "#2B2A33";
    for (let i = 0; i <= 20; i++) {
      const a = a0 + ((a1 - a0) * i) / 20;
      const long = i % 5 === 0;
      c.lineWidth = long ? 7 : 3;
      const r1 = w * (long ? 0.31 : 0.35), r2 = w * 0.42;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); c.stroke();
    }
    // a small fuel-drop pictogram instead of text
    c.fillStyle = "#4E7A8A";
    c.beginPath(); c.moveTo(cx, cy + w * 0.1); c.quadraticCurveTo(cx + w * 0.08, cy + w * 0.2, cx, cy + w * 0.24);
    c.quadraticCurveTo(cx - w * 0.08, cy + w * 0.2, cx, cy + w * 0.1); c.fill();
  });

  const dial = new THREE.Group();      // everything that tilts toward the camera
  dial.rotation.x = deg(-58);
  dial.position.set(0, 1.0, 0);
  g.add(dial);
  const housing = mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.15, 0.3, 48), MAT.brass);
  housing.rotation.x = deg(90);
  dial.add(housing);
  const faceMesh = mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: face, roughness: 0.8 }), false);
  faceMesh.position.z = 0.152;
  dial.add(faceMesh);
  const bezel = mesh(new THREE.TorusGeometry(R + 0.06, 0.07, 12, 48), MAT.brass);
  bezel.position.z = 0.16;
  dial.add(bezel);
  const glass = mesh(new THREE.CircleGeometry(R, 48), MAT.glassClear, false);
  glass.position.z = 0.2;
  dial.add(glass);

  const needle = new THREE.Group();
  needle.position.z = 0.17;
  const blade = mesh(new THREE.BoxGeometry(0.05, R * 0.82, 0.02), MAT.redPencil, false);
  blade.position.y = R * 0.36;
  needle.add(blade);
  const cap = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 20), MAT.brass, false);
  cap.rotation.x = deg(90);
  needle.add(cap);
  dial.add(needle);

  const stand = mesh(new THREE.BoxGeometry(1.0, 0.9, 0.5), MAT.darkWood);
  stand.position.set(0, 0.45, -0.35);
  g.add(stand);
  const foot = mesh(new THREE.BoxGeometry(2.0, 0.14, 1.5), MAT.darkWood);
  foot.position.set(0, 0.07, 0);
  g.add(foot);

  let fuel = 100, shown = 100;
  return {
    group: g,
    anchorBelow: new THREE.Vector3(0, 0.1, 0.9),
    setFuel(f) { fuel = f; },
    update() {
      shown += (fuel - shown) * 0.12;
      // 0 % at -120°, 100 % at +120° (clockwise from the top)
      needle.rotation.z = -deg(-120 + 240 * Math.max(0, Math.min(1, shown / 100)));
    },
  };
}

/** Brass compass: the AI hint instrument. */
export function createCompass() {
  const g = new THREE.Group();
  const R = 0.85;
  const rose = canvasTex(512, 512, (c, w) => {
    const cx = w / 2;
    c.fillStyle = "#EFE6D2"; c.beginPath(); c.arc(cx, cx, cx, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(43,42,51,0.6)"; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cx, w * 0.42, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2, r1 = w * (i % 8 === 0 ? 0.33 : 0.38);
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      c.lineTo(cx + Math.cos(a) * w * 0.42, cx + Math.sin(a) * w * 0.42); c.stroke();
    }
    for (let i = 0; i < 8; i++) {           // 8-point star
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, len = w * (i % 2 ? 0.2 : 0.32);
      c.fillStyle = i % 2 ? "rgba(78,122,138,0.7)" : "rgba(43,42,51,0.85)";
      c.beginPath(); c.moveTo(cx, cx);
      c.lineTo(cx + Math.cos(a - 0.18) * w * 0.07, cx + Math.sin(a - 0.18) * w * 0.07);
      c.lineTo(cx + Math.cos(a) * len, cx + Math.sin(a) * len);
      c.lineTo(cx + Math.cos(a + 0.18) * w * 0.07, cx + Math.sin(a + 0.18) * w * 0.07);
      c.closePath(); c.fill();
    }
  });
  const body = mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.16, 0.28, 48), MAT.brass);
  body.position.y = 0.14;
  g.add(body);
  const face = mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: rose, roughness: 0.8 }), false);
  face.rotation.x = deg(-90);
  face.position.y = 0.285;
  g.add(face);
  const ring = mesh(new THREE.TorusGeometry(R + 0.05, 0.06, 12, 48), MAT.brass);
  ring.rotation.x = deg(90);
  ring.position.y = 0.3;
  g.add(ring);
  const needle = new THREE.Group();
  needle.position.y = 0.31;
  const north = mesh(new THREE.ConeGeometry(0.07, R * 0.75, 4), MAT.redPencil, false);
  north.rotation.x = deg(-90); north.position.z = -R * 0.37; north.scale.y = 1;
  const south = mesh(new THREE.ConeGeometry(0.07, R * 0.75, 4), MAT.ink, false);
  south.rotation.x = deg(90); south.position.z = R * 0.37;
  needle.add(north, south);
  g.add(needle);
  return {
    group: g,
    objects: [body, face, ring],
    anchorBelow: new THREE.Vector3(0, 0.05, R + 0.25),
    update(t) { needle.rotation.y = Math.sin(t * 0.7) * deg(4); },  // a living needle
  };
}

/** Old ship radio: wooden box, brass grille, warm dial window, antenna, a paper tape. */
export function createRadio() {
  const g = new THREE.Group();
  const W = 2.5, H = 1.55, D = 1.3;
  const box = mesh(new THREE.BoxGeometry(W, H, D), MAT.darkWood);
  box.position.y = H / 2;
  g.add(box);
  const grilleTex = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = "#8a6a32"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#2a1a0c";
    for (let y = 18; y < h; y += 22) for (let x = 18; x < w; x += 22) {
      c.beginPath(); c.arc(x + ((y / 22) % 2) * 11, y, 6, 0, Math.PI * 2); c.fill();
    }
  });
  const grille = mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshStandardMaterial({
    map: grilleTex, metalness: 0.6, roughness: 0.45 }), false);
  grille.position.set(-0.45, H * 0.52, D / 2 + 0.005);
  g.add(grille);
  const window_ = mesh(new THREE.PlaneGeometry(0.75, 0.3), new THREE.MeshStandardMaterial({
    color: 0xffc98a, emissive: 0xffa040, emissiveIntensity: 0.9, roughness: 0.3 }), false);
  window_.position.set(0.72, H * 0.68, D / 2 + 0.005);
  g.add(window_);
  const frame = mesh(new THREE.BoxGeometry(0.85, 0.4, 0.04), MAT.brass);
  frame.position.set(0.72, H * 0.68, D / 2 - 0.005);
  g.add(frame);
  for (const x of [0.5, 0.95]) {
    const knob = mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 24), MAT.brass);
    knob.rotation.x = deg(90);
    knob.position.set(x, H * 0.3, D / 2 + 0.06);
    g.add(knob);
  }
  const ant = mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.5, 8), MAT.brass);
  ant.position.set(W / 2 - 0.25, H + 0.7, -D / 4);
  ant.rotation.z = deg(-12);
  g.add(ant);
  const tip = mesh(new THREE.SphereGeometry(0.06, 12, 8), MAT.redPencil);
  tip.position.set(W / 2 - 0.25 + Math.sin(deg(12)) * 0.75, H + 1.43, -D / 4);
  g.add(tip);
  // paper tape: out of a slot at the front, curling down and along the table
  const tape = mesh(new THREE.PlaneGeometry(0.7, 2.2), MAT.paper, false);
  tape.rotation.x = deg(-90);
  tape.position.set(-0.3, 0.015, D / 2 + 1.1);
  g.add(tape);
  const slot = mesh(new THREE.BoxGeometry(0.8, 0.06, 0.06), MAT.ink, false);
  slot.position.set(-0.3, 0.12, D / 2 + 0.01);
  g.add(slot);
  return { group: g, anchorTape: new THREE.Vector3(-0.5, 0.02, D / 2 + 1.2) };
}

/** Closed logbook (opens in the professor's mode). */
export function createJournal() {
  const g = new THREE.Group();
  const W = 2.0, T = 0.34, L = 2.7;
  const cover = mesh(new THREE.BoxGeometry(W, 0.05, L), MAT.leather);
  cover.position.y = T - 0.025;
  const back = cover.clone();
  back.position.y = 0.025;
  const pages = mesh(new THREE.BoxGeometry(W - 0.12, T - 0.08, L - 0.12), MAT.paper);
  pages.position.set(0.04, T / 2, 0);
  const spine = mesh(new THREE.BoxGeometry(0.1, T, L), MAT.leather);
  spine.position.set(-W / 2 + 0.05, T / 2, 0);
  g.add(cover, back, pages, spine);
  for (const [x, z] of [[W / 2 - 0.12, L / 2 - 0.12], [W / 2 - 0.12, -L / 2 + 0.12]]) {
    const corner = mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), MAT.brass);
    corner.position.set(x, T - 0.02, z);
    g.add(corner);
  }
  const ribbon = mesh(new THREE.BoxGeometry(0.08, 0.01, 0.5), MAT.redPencil, false);
  ribbon.position.set(0.3, 0.01, L / 2 + 0.2);
  g.add(ribbon);
  const label = mesh(new THREE.PlaneGeometry(1.0, 0.5), MAT.paper, false);
  label.rotation.x = deg(-90);
  label.position.set(0.05, T + 0.002, -0.35);
  g.add(label);
  g.rotation.y = deg(-8);
  return { group: g, anchorBelow: new THREE.Vector3(0, 0.05, L / 2 + 0.25) };
}

/** Icon painted on a button cap: sonar waves, a box on a rope, a paper boat. */
function iconTexture(bg, fg, kind) {
  return canvasTex(256, 256, (c, w) => {
    const m = w / 2;
    c.fillStyle = bg; c.fillRect(0, 0, w, w);
    c.strokeStyle = fg; c.fillStyle = fg;
    c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = 13;
    if (kind === "sonar") {
      c.beginPath(); c.arc(m, m, 14, 0, Math.PI * 2); c.fill();
      for (const r of [40, 66, 92]) {
        for (const a of [0, Math.PI]) {
          c.globalAlpha = 1 - (r - 40) / 160;
          c.beginPath(); c.arc(m, m, r, a - 0.75, a + 0.75); c.stroke();
        }
      }
      c.globalAlpha = 1;
    } else if (kind === "lift") {
      c.beginPath(); c.moveTo(m, 22); c.lineTo(m, 92); c.stroke();              // rope
      c.beginPath(); c.arc(m - 14, 104, 14, -0.2, Math.PI * 0.95); c.stroke();  // hook
      c.strokeRect(m - 52, 122, 104, 86);                                        // box
      c.beginPath(); c.moveTo(m - 52, 165); c.lineTo(m + 52, 165); c.stroke();   // strap
      c.beginPath(); c.moveTo(m - 30, 122); c.lineTo(m, 92); c.lineTo(m + 30, 122); c.stroke();
    } else {
      c.beginPath();                                                             // paper boat
      c.moveTo(40, 150); c.lineTo(216, 150); c.lineTo(182, 196); c.lineTo(74, 196); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(m - 6, 140); c.lineTo(m - 6, 50); c.lineTo(m + 62, 140); c.closePath(); c.fill();
      c.lineWidth = 7;
      c.beginPath(); c.moveTo(m - 6, 50); c.lineTo(m - 6, 34); c.stroke();
    }
  });
}

/** Wooden panel with three brass push-buttons (sonar check, lift, return). */
export function createPanel() {
  const g = new THREE.Group();
  const board = mesh(new THREE.BoxGeometry(10.2, 0.32, 1.5), MAT.darkWood);
  board.position.y = 0.16;
  g.add(board);
  const plate = mesh(new THREE.BoxGeometry(9.8, 0.04, 1.1), MAT.darkBrass);
  plate.position.y = 0.34;
  g.add(plate);
  const caps = [["#4E7A8A", "#EFE6D2", "sonar"], ["#C2412D", "#EFE6D2", "lift"], ["#E6DCC4", "#2B2A33", "ship"]];
  const xs = [-3.3, 0, 3.3];
  const buttons = xs.map((x, i) => {
    const bezel = mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.16, 32), MAT.brass);
    bezel.position.set(x, 0.42, 0);
    const [bg, fg, icon] = caps[i];
    const side = new THREE.MeshStandardMaterial({ color: bg, roughness: 0.45, metalness: 0.1 });
    const top = new THREE.MeshStandardMaterial({ map: iconTexture(bg, fg, icon), roughness: 0.45, metalness: 0.1 });
    const cap = mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.16, 32), [side, top, side]);
    cap.rotation.y = Math.PI / 2;   // so the icon stands upright for the captain
    cap.position.set(x, 0.55, 0);
    g.add(bezel, cap);
    let pressT = -1;
    return {
      cap, objects: [cap, bezel], anchorBelow: new THREE.Vector3(x, 0.3, 0.85),
      press() { pressT = 0; },
      glow(on) {                       // warm light in the cap: the MDP advises this button
        for (const m of [side, top]) { m.emissive.set(on ? 0xff9a3c : 0x000000); m.emissiveIntensity = on ? 0.55 : 0; }
      },
      update(dt) {
        if (pressT < 0) return;
        pressT += dt;
        const k = Math.min(1, pressT / 0.3);
        cap.position.y = 0.55 - 0.07 * Math.sin(k * Math.PI);
        if (k >= 1) pressT = -1;
      },
    };
  });
  return { group: g, buttons, update: (t, dt) => buttons.forEach((b) => b.update(dt)) };
}

/** A pencil lying on the chart. */
export function createPencil() {
  const g = new THREE.Group();
  const wood = mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 6), new THREE.MeshStandardMaterial({
    color: 0x3f5f4a, roughness: 0.55 }));
  wood.rotation.z = deg(90);
  const tipWood = mesh(new THREE.ConeGeometry(0.07, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.8 }));
  tipWood.rotation.z = deg(-90);
  tipWood.position.x = 1.65;
  const lead = mesh(new THREE.ConeGeometry(0.025, 0.09, 6), MAT.ink);
  lead.rotation.z = deg(-90);
  lead.position.x = 1.84;
  const band = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 12), MAT.brass);
  band.rotation.z = deg(90);
  band.position.x = -1.55;
  const eraser = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xd98a7a, roughness: 0.9 }));
  eraser.rotation.z = deg(90);
  eraser.position.x = -1.72;
  g.add(wood, tipWood, lead, band, eraser);
  g.position.y = 0.07;
  return { group: g };
}

/** Where the paper boat of a base sits: on the chart margin just below its cell. */
export function shipPlace(cell) {
  const p = cellToWorld(cell[0], cell[1]);
  p.z += 0.5 + MAP_MARGIN / 2;
  return p;
}

