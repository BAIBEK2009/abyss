// The navigator's table: paper chart with the probability relief, reefs, lighthouse, both ships,
// the rival's ghost and intention, dotted routes, dive marks, sonar rings (CLAUDE.md v3, 3 / 4.4).
// Only drawing: positions, plans and beliefs all come from the Python state.
import * as THREE from "three";
import { createRelief, BASE_Y } from "./relief.js";
import { canvasTexture, deg, rng } from "../view.js";
import { t } from "../strings.js";

const MARGIN_X = 0.95, MARGIN_Z = 1.45;                 // paper around the 10x10 grid
const PAPER_W = 10 + 2 * MARGIN_X, PAPER_D = 10 + 2 * MARGIN_Z;
const SEC_PER_HOUR = 0.16;                               // playback speed of the shared clock

const COLORS = { ink: 0x2B2A33, brass: 0xB8893B, red: 0xC2412D, teal: 0x2F7D86, yellow: 0xF2B632, rival: 0xD9573B };

/** Map point (u, v) in cell units (0..10) -> world (x, z). Cell (x, y) centre = (x + .5, y + .5). */
const toWorld = (u, v) => new THREE.Vector3(u - 5, 0, v - 5);
const centre = ([x, y]) => [x + 0.5, y + 0.5];

// ------------------------------------------------------------------ materials & textures
function woodTexture() {
  return canvasTexture(2048, 1024, (g, w, h) => {
    g.fillStyle = "#5A3B26"; g.fillRect(0, 0, w, h);
    const r = rng(7), planks = 7;
    for (let p = 0; p < planks; p++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "30,15,6" : "120,80,48"},${0.06 + r() * 0.1})`;
      g.fillRect(0, (p * h) / planks, w, h / planks);
    }
    for (let i = 0; i < 420; i++) {
      const y0 = r() * h, amp = 2 + r() * 7, f = 0.002 + r() * 0.006;
      g.strokeStyle = r() < 0.6 ? `rgba(38,20,10,${0.08 + r() * 0.16})` : `rgba(150,105,66,${0.04 + r() * 0.09})`;
      g.lineWidth = 0.6 + r() * 2.4;
      g.beginPath();
      for (let x = 0; x <= w; x += 10) {
        const y = y0 + Math.sin(x * f + i) * amp;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let p = 1; p < planks; p++) { g.fillStyle = "rgba(15,7,2,0.75)"; g.fillRect(0, (p * h) / planks - 1, w, 3); }
  });
}

/** Chart paper (margins): grain, stains, folds and the ink frame — no text (text is HTML). */
function paperTexture() {
  const W = 2048, H = Math.round(2048 * PAPER_D / PAPER_W);
  return canvasTexture(W, H, (g) => {
    const r = rng(11), u = W / PAPER_W;
    g.fillStyle = "#EDE2CA"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) {
      const x = r() * W, y = r() * H, rad = 90 + r() * 300;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(175,135,80,${0.07 + r() * 0.09})`);
      grd.addColorStop(1, "rgba(175,135,80,0)");
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 50000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(110,85,50,${r() * 0.07})` : `rgba(255,252,240,${r() * 0.1})`;
      g.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1 + r() * 1.5);
    }
    for (const [x, y, k] of [[0, 0, -0.04], [W / 2, 0, 0.05], [0, H / 2, 0.05], [W / 2, H / 2, -0.03]]) {
      g.fillStyle = k > 0 ? `rgba(255,250,235,${k})` : `rgba(90,65,35,${-k})`;
      g.fillRect(x, y, W / 2, H / 2);
    }
    g.strokeStyle = "rgba(95,70,40,0.5)"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    // ink frame around the grid (double line, like a printed chart)
    g.strokeStyle = "rgba(43,42,51,0.85)";
    g.lineWidth = 6; g.strokeRect(MARGIN_X * u, MARGIN_Z * u, 10 * u, 10 * u);
    g.lineWidth = 2; g.strokeRect(MARGIN_X * u - 14, MARGIN_Z * u - 14, 10 * u + 28, 10 * u + 28);
    const edge = g.createRadialGradient(W / 2, H / 2, W * 0.4, W / 2, H / 2, W * 0.78);
    edge.addColorStop(0, "rgba(150,115,70,0)"); edge.addColorStop(1, "rgba(140,100,55,0.32)");
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
  });
}

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ ships
/** Toy ship. kind = "aurora" (yellow, bathyscaphe "Nerpa" on the stern A-frame) | "rival" (red). */
function shipModel(kind, ghost = false) {
  const yellow = kind === "aurora";
  const g = new THREE.Group();
  // the ghost: a see-through red copy, bright enough to read at a glance
  const mk = (color, opts = {}) => ghost
    ? new THREE.MeshStandardMaterial({ color: 0xe0402a, emissive: 0xc2412d, emissiveIntensity: 0.9,
                                       transparent: true, opacity: 0.72, depthWrite: false, roughness: 0.6 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts });
  const hullShape = new THREE.Shape([
    new THREE.Vector2(-0.36, -0.13), new THREE.Vector2(0.18, -0.13), new THREE.Vector2(0.4, 0),
    new THREE.Vector2(0.18, 0.13), new THREE.Vector2(-0.36, 0.13)]);
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 0.11, bevelEnabled: true, bevelSize: 0.015,
                                                          bevelThickness: 0.015, bevelSegments: 2 });
  hullGeo.rotateX(-Math.PI / 2);
  const hull = mesh(hullGeo, mk(yellow ? COLORS.yellow : COLORS.rival), !ghost);
  g.add(hull);
  const deck = mesh(new THREE.BoxGeometry(0.5, 0.012, 0.2), mk(yellow ? 0xE9D7A8 : 0xEAE2D6), !ghost);
  deck.position.set(-0.06, 0.125, 0);
  g.add(deck);
  const cabin = mesh(new THREE.BoxGeometry(0.18, 0.13, 0.17), mk(0xF3EEE2), !ghost);
  cabin.position.set(0.04, 0.2, 0);
  g.add(cabin);
  if (!ghost) {
    const win = mesh(new THREE.BoxGeometry(0.02, 0.04, 0.13),
      new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffa040, emissiveIntensity: 0.8 }), false);
    win.position.set(0.135, 0.22, 0);
    g.add(win);
  }
  const mast = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 6), mk(0x2B2A33), !ghost);
  mast.position.set(0.06, 0.39, 0);
  g.add(mast);
  let light = null;
  if (!ghost) {
    light = mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshStandardMaterial({
      color: 0xff4a3a, emissive: 0xff2a1a, emissiveIntensity: 1.2 }), false);
    light.position.set(0.06, 0.54, 0);
    g.add(light);
  }
  if (yellow) {                                      // A-frame with the bathyscaphe "Nerpa"
    for (const z of [-0.08, 0.08]) {
      const leg = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6), mk(0x2B2A33), !ghost);
      leg.position.set(-0.33, 0.24, z);
      leg.rotation.z = deg(-18);
      g.add(leg);
    }
    const bar = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.17, 6), mk(0x2B2A33), !ghost);
    bar.rotation.x = deg(90);
    bar.position.set(-0.37, 0.35, 0);
    g.add(bar);
    const nerpa = mesh(new THREE.SphereGeometry(0.06, 16, 12), mk(COLORS.yellow, { roughness: 0.35 }), !ghost);
    nerpa.position.set(-0.4, 0.26, 0);
    g.add(nerpa);
    if (!ghost) {
      const eye = mesh(new THREE.CircleGeometry(0.025, 14), new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.1 }), false);
      eye.position.set(-0.4, 0.26, 0.061);
      g.add(eye);
    }
  } else {                                           // the rival's crane
    const crane = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3), mk(0x2B2A33), !ghost);
    crane.position.set(-0.26, 0.24, 0);
    crane.rotation.x = deg(30);
    g.add(crane);
  }
  g.scale.setScalar(ghost ? 1.25 : 1.05);
  return { group: g, light };
}

function lighthouse() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xF4EFE4, roughness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 0.6 });
  const tower = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.42, 16), white);
  tower.position.y = 0.21;
  g.add(tower);
  for (const y of [0.1, 0.26]) {
    const band = mesh(new THREE.CylinderGeometry(0.083 - y * 0.06, 0.088 - y * 0.06, 0.06, 16), red);
    band.position.y = y;
    g.add(band);
  }
  const lamp = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 12), new THREE.MeshStandardMaterial({
    color: 0xffe2a0, emissive: 0xffc060, emissiveIntensity: 1.4 }), false);
  lamp.position.y = 0.46;
  const cap = mesh(new THREE.ConeGeometry(0.07, 0.07, 12), red);
  cap.position.y = 0.53;
  g.add(lamp, cap);
  return g;
}

function stones(cell, seed) {
  const g = new THREE.Group();
  const r = rng(seed);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b8a86, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.DodecahedronGeometry(0.07 + r() * 0.05, 0), mat);
    s.scale.y = 0.6 + r() * 0.4;
    const [u, v] = centre(cell);
    s.position.copy(toWorld(u + (r() - 0.5) * 0.5, v + (r() - 0.5) * 0.5));
    s.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(s);
  }
  return g;
}

// ------------------------------------------------------------------ the map scene
export function createMap(view, state) {
  const { scene, pin } = view;
  const root = new THREE.Group();
  scene.add(root);

  const table = mesh(new THREE.BoxGeometry(44, 1, 30), new THREE.MeshStandardMaterial({
    map: woodTexture(), roughness: 0.72 }));
  table.position.set(0, -0.5, 1.5);
  root.add(table);
  const paperSide = new THREE.MeshStandardMaterial({ color: 0xD9CBAE, roughness: 0.95 });
  const chart = mesh(new THREE.BoxGeometry(PAPER_W, 0.04, PAPER_D), [paperSide, paperSide,
    new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.92 }), paperSide, paperSide, paperSide], false);
  chart.position.y = 0.02;
  root.add(chart);

  const relief = createRelief(root, state.P, state.reefs, state.signal);
  relief.setMarks(state.probes, state.rival?.probes);
  state.reefs.forEach((c, i) => root.add(stones(c, 100 + i)));
  const light = lighthouse();
  light.position.copy(toWorld(state.base[0] + 0.22, state.base[1] + 0.25));
  root.add(light);

  // ---- labels around the chart (HTML): A–J top and bottom, 1–10 left and right
  for (let i = 0; i < 10; i++) {
    for (const v of [-MARGIN_X * 0.48, 10 + MARGIN_X * 0.48]) {
      const el = document.createElement("div"); el.className = "map-label"; el.textContent = state.cols[i];
      pin(el, toWorld(i + 0.5, v));
    }
    for (const u of [-MARGIN_X * 0.48, 10 + MARGIN_X * 0.48]) {
      const el = document.createElement("div"); el.className = "map-label"; el.textContent = String(i + 1);
      pin(el, toWorld(u, i + 0.5));
    }
  }
  const caption = document.createElement("div");
  caption.className = "map-caption"; caption.textContent = t("map_caption");
  pin(caption, toWorld(5, -MARGIN_Z * 0.78));
  const legend = document.createElement("div");
  legend.className = "map-legend"; legend.textContent = t("map_legend");
  pin(legend, toWorld(5, 10 + MARGIN_Z * 0.78));
  const north = document.createElement("div");
  north.className = "map-north"; north.innerHTML = `<span class="arrow"></span>${t("north")}`;
  pin(north, toWorld(10 + MARGIN_X * 0.45, -MARGIN_Z * 0.72));

  // ---- ships and the rival's ghost
  const aurora = shipModel("aurora");
  root.add(aurora.group);
  const rival = shipModel("rival");
  root.add(rival.group);
  const ghost = shipModel("rival", true);
  root.add(ghost.group);
  const forecastGhost = shipModel("rival", true);       // where the rival will be after a hovered action
  root.add(forecastGhost.group);
  forecastGhost.group.visible = false;

  const ships = {
    you: { obj: aurora, u: 0, v: 0, heading: deg(20), bob: 0 },
    rival: { obj: rival, u: 0, v: 0, heading: deg(160), bob: 1.7 },
  };
  function placeShip(s, cell) { [s.u, s.v] = centre(cell); }
  placeShip(ships.you, state.pos);
  placeShip(ships.rival, state.rival ? state.rival.pos : [9, 9]);

  // ---- dotted routes: ours in ink, the officers' advice in brass, the rival in red
  function dots(color, max = 400) {
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), max);
    m.count = 0; m.castShadow = true; m.frustumCulled = false;
    root.add(m);
    return { mesh: m, path: null };
  }
  const routes = { ours: dots(COLORS.ink), advice: dots(COLORS.brass), rival: dots(COLORS.red) };
  const tmp = new THREE.Object3D();
  function drawRoute(r) {
    const m = r.mesh;
    if (!r.path || r.path.length < 2) { m.count = 0; return; }
    let n = 0;
    for (let i = 0; i + 1 < r.path.length; i++) {
      const [u0, v0] = centre(r.path[i]), [u1, v1] = centre(r.path[i + 1]);
      const steps = 4;
      for (let s = i === 0 ? 1 : 0; s < steps; s++) {
        const k = s / steps, u = u0 + (u1 - u0) * k, v = v0 + (v1 - v0) * k;
        tmp.position.copy(toWorld(u, v)).setY(relief.heightAt(u, v) + 0.012);
        tmp.updateMatrix();
        m.setMatrixAt(n++, tmp.matrix);
      }
    }
    const [ue, ve] = centre(r.path[r.path.length - 1]);      // a bigger dot at the destination
    tmp.position.copy(toWorld(ue, ve)).setY(relief.heightAt(ue, ve) + 0.012);
    tmp.scale.setScalar(1.8); tmp.updateMatrix(); m.setMatrixAt(n++, tmp.matrix); tmp.scale.setScalar(1);
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }
  function setRoute(kind, path) { routes[kind].path = path; drawRoute(routes[kind]); }

  // ---- bubbles over a dive
  const bubbles = [];
  const bubbleGeo = new THREE.SphereGeometry(0.03, 8, 6);
  function bubbleBurst(cell, color) {
    const [u, v] = centre(cell);
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(bubbleGeo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.2 }));
      b.position.copy(toWorld(u + (Math.random() - 0.5) * 0.5, v + (Math.random() - 0.5) * 0.5)).setY(relief.heightAt(u, v));
      b.userData = { vy: 0.25 + Math.random() * 0.35, t: -Math.random() * 1.2 };
      root.add(b);
      bubbles.push(b);
    }
  }

  // ---- plans: the rival's intention (ghost, red dots, marching frame) + the officers' advice
  function showPlans(st) {
    const plan = st.rival?.plan;
    if (plan && st.status === "playing") {
      setRoute("rival", plan.path.length > 1 ? plan.path : null);
      relief.rivalZone(plan.target, plan.tool);
      ghost.group.visible = plan.path.length > 1;              // no ghost if it is already there
      const [u, v] = centre(plan.target);
      ghost.group.position.copy(toWorld(u, v)).setY(relief.heightAt(u, v));
      ghost.group.rotation.y = ships.rival.heading;
    } else {
      setRoute("rival", null); relief.rivalZone(null); ghost.group.visible = false;
    }
    const adv = st.advice?.advice?.action;
    setRoute("advice", adv?.type === "go" && st.advice.lev.path.length > 1 ? st.advice.lev.path : null);
  }

  // ---- state & playback
  let shown = state;
  function setState(st, { animate = false } = {}) {
    shown = st;
    const p = relief.setBelief(st.P, animate);
    relief.setMarks(st.probes, st.rival?.probes);
    if (!playing) {
      placeShip(ships.you, st.pos);
      if (st.rival) placeShip(ships.rival, st.rival.pos);
    }
    showPlans(st);
    return p;
  }

  /** Play the events of one action on the shared clock: both ships sail at the same time. */
  let playing = false;
  async function play(events, before) {
    playing = true;
    setRoute("advice", null);
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
        moments.push({ t: e.t, fn: () => relief.ring(e.cell, who === "rival" ? COLORS.red : COLORS.teal) });
      } else if (e.type === "dive") {
        moments.push({ t: e.t, fn: () => bubbleBurst(e.cell, who === "rival" ? 0xff8a70 : 0xfff2b0) });
      } else if (e.type === "belief") {
        moments.push({ t: e.t, fn: () => { relief.setBelief(e.P, true); } });
      }
    }
    const tEnd = Math.max(t0, ...events.map((e) => e.t ?? t0));
    await new Promise((done) => {
      let tau = t0;
      const fired = new Set();
      const tick = (dt) => {
        tau = Math.min(tEnd, tau + dt / SEC_PER_HOUR);
        for (const who of ["you", "rival"]) {
          const seg = segs[who].find((s) => tau >= s.t0 && tau <= s.t1) ||
                      [...segs[who]].reverse().find((s) => tau > s.t1);
          if (!seg) continue;
          const k = tau >= seg.t1 ? 1 : (tau - seg.t0) / (seg.t1 - seg.t0);
          const [u0, v0] = centre(seg.from), [u1, v1] = centre(seg.to);
          ships[who].u = u0 + (u1 - u0) * k; ships[who].v = v0 + (v1 - v0) * k;
          if (u1 !== u0 || v1 !== v0) ships[who].heading = Math.atan2(-(v1 - v0), u1 - u0);
        }
        moments.forEach((m, i) => { if (!fired.has(i) && tau >= m.t) { fired.add(i); m.fn(); } });
        if (tau >= tEnd) { tickers.delete(tick); setTimeout(done, 1600); }   // let the relief settle
      };
      tickers.add(tick);
    });
    playing = false;
  }
  const tickers = new Set();

  // ---- per frame
  view.onFrame((dt, time) => {
    for (const fn of [...tickers]) fn(dt);
    relief.update(dt, time);
    // two ships in one cell: move them apart to opposite corners so both stay visible
    const close = shown.rival && Math.hypot(ships.you.u - ships.rival.u, ships.you.v - ships.rival.v) < 0.6;
    for (const [name, s] of Object.entries(ships)) {
      const g = s.obj.group;
      const off = close ? (name === "you" ? -0.22 : 0.22) : 0;
      const u = s.u + off, v = s.v + off;
      const h = relief.heightAt(u, v);
      g.position.copy(toWorld(u, v)).setY(h + Math.sin(time * 1.6 + s.bob) * 0.008);
      const r = g.rotation;
      r.y += Math.atan2(Math.sin(s.heading - r.y), Math.cos(s.heading - r.y)) * Math.min(1, dt * 6);
      r.z = Math.sin(time * 1.1 + s.bob) * deg(2);
      if (s.obj.light) s.obj.light.material.emissiveIntensity = (Math.sin(time * 3 + s.bob) > 0.2) ? 1.6 : 0.2;
      if (name === "rival") rival.group.visible = !!shown.rival;
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.userData.t += dt;
      if (b.userData.t < 0) { b.visible = false; continue; }
      b.visible = true;
      b.position.y += b.userData.vy * dt;
      b.material.opacity = Math.max(0, 0.85 - b.userData.t * 0.5);
      if (b.userData.t > 1.7) { root.remove(b); b.material.dispose(); bubbles.splice(i, 1); }
    }
    for (const r of Object.values(routes)) if (r.path) drawRoute(r);    // dots follow the flowing relief
  });

  // ---- picking: which cell is under the mouse
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function cellAt(clientX, clientY) {
    const rect = view.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    const hit = ray.intersectObject(relief.mesh)[0];
    if (!hit) return null;
    const x = Math.floor(hit.point.x + 5), y = Math.floor(hit.point.z + 5);
    return x >= 0 && y >= 0 && x < 10 && y < 10 ? [x, y] : null;
  }

  function showForecast(cell) {
    forecastGhost.group.visible = !!cell;
    if (!cell) return;
    const [u, v] = centre(cell);
    forecastGhost.group.position.copy(toWorld(u, v)).setY(relief.heightAt(u, v));
  }

  showPlans(state);
  return {
    setState, play, cellAt, setRoute, showForecast,
    hover: relief.hover, target: relief.target, zone: relief.zone,
    cellScreen: (x, y) => { const [u, v] = centre([x, y]); return view.toScreen(toWorld(u, v).setY(relief.heightAt(u, v))); },
  };
}

export { BASE_Y };
