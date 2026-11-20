// Table, paper chart, lamp, camera, post-processing. Only drawing here — no game logic.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { HorizontalTiltShiftShader } from "three/addons/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/addons/shaders/VerticalTiltShiftShader.js";

export const PALETTE = {
  paper: 0xEFE6D2, paperShade: 0xD9CBAE, paperDeep: 0xBFAE8C,
  ink: "#2B2A33", seaInk: "#4E7A8A", pencil: "#5B5B66", redPencil: "#C2412D",
  wood: 0x5A3B26, brass: 0xB8893B, lamp: 0xFFD9A0, subYellow: 0xF2B632, aiRed: 0xD9573B,
  gold: 0xE8B04A,
};

export const MAP_CELLS = 10;   // world units: 1 cell = 1 unit
export const MAP_MARGIN = 0.9; // paper margin around the grid (for A–J / 1–10 labels)
export const MAP_SIDE = MAP_CELLS + 2 * MAP_MARGIN;

/** Cell (x, y) -> world position of its centre. Row 1 is far from the camera, row 10 is near. */
export function cellToWorld(x, y, h = 0) {
  return new THREE.Vector3(x - MAP_CELLS / 2 + 0.5, h, y - MAP_CELLS / 2 + 0.5);
}

/** Small deterministic random: the hand-made look is the same every launch. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function woodTexture() {
  const c = document.createElement("canvas");
  c.width = 2048; c.height = 1024;
  const g = c.getContext("2d");
  g.fillStyle = "#5A3B26";
  g.fillRect(0, 0, c.width, c.height);
  const r = rng(7);
  const planks = 7;
  for (let p = 0; p < planks; p++) {          // each plank a slightly different tone
    g.fillStyle = `rgba(${r() < 0.5 ? "30,15,6" : "120,80,48"},${0.06 + r() * 0.10})`;
    g.fillRect(0, (p * c.height) / planks, c.width, c.height / planks);
  }
  for (let i = 0; i < 420; i++) {             // long wavy grain lines
    const y0 = r() * c.height;
    const amp = 2 + r() * 7;
    const freq = 0.002 + r() * 0.006;
    g.strokeStyle = r() < 0.6 ? `rgba(38,20,10,${0.08 + r() * 0.16})` : `rgba(150,105,66,${0.04 + r() * 0.09})`;
    g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 10) {
      const y = y0 + Math.sin(x * freq + i) * amp + Math.sin(x * freq * 3.1 + i * 0.7) * amp * 0.3;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 9; i++) {               // a few knots
    const x = r() * c.width, y = r() * c.height;
    for (let k = 6; k > 0; k--) {
      g.strokeStyle = `rgba(35,18,8,${0.08 + 0.03 * k})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x, y, 6 + k * 6, 3 + k * 2.2, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  for (let p = 1; p < planks; p++) {          // gaps between planks
    g.fillStyle = "rgba(15,7,2,0.75)";
    g.fillRect(0, (p * c.height) / planks - 1, c.width, 3);
  }
  return canvasTexture(c);
}

/** The paper chart: grid, hatching, isobaths, labels A–J / 1–10, reefs, last-signal cross. */
function chartTexture(state) {
  const px = 2048;
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  const u = px / MAP_SIDE;                         // pixels per world unit
  const ox = MAP_MARGIN * u, oy = MAP_MARGIN * u;  // grid origin in pixels
  const W = MAP_CELLS * u;
  const r = rng(11);

  // paper: warm base, tea stains, fibre grain, foxing spots, folds, darker worn edge
  g.fillStyle = "#EDE2CA";
  g.fillRect(0, 0, px, px);
  for (let i = 0; i < 22; i++) {                      // large soft stains
    const x = r() * px, y = r() * px, rad = 90 + r() * 320;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(175,135,80,${0.08 + r() * 0.10})`);
    grd.addColorStop(0.7, `rgba(175,135,80,${0.04 + r() * 0.04})`);
    grd.addColorStop(1, "rgba(185,150,95,0)");
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 3; i++) {                       // a couple of cup / water rings
    const x = r() * px, y = r() * px, rad = 70 + r() * 90;
    g.strokeStyle = `rgba(150,110,60,${0.10 + r() * 0.06})`;
    g.lineWidth = 3 + r() * 4;
    g.beginPath(); g.arc(x, y, rad, r() * 6, r() * 6 + 4.5 + r() * 1.5); g.stroke();
  }
  for (let i = 0; i < 60000; i++) {                   // fibre grain
    const d = r();
    g.fillStyle = d < 0.5 ? `rgba(110,85,50,${r() * 0.07})` : `rgba(255,252,240,${r() * 0.10})`;
    g.fillRect(r() * px, r() * px, 1 + r() * 2.5, 1 + r() * 1.5);
  }
  for (let i = 0; i < 40; i++) {                      // foxing: small brown spots
    g.fillStyle = `rgba(140,95,45,${0.08 + r() * 0.12})`;
    g.beginPath(); g.arc(r() * px, r() * px, 2 + r() * 6, 0, Math.PI * 2); g.fill();
  }
  // folds: the chart was folded in four — each panel is lit a little differently,
  // with a dark crease line and a bright ridge next to it
  const half = px / 2;
  const panels = [[0, 0, -0.045], [half, 0, 0.05], [0, half, 0.06], [half, half, -0.035]];
  for (const [x, y, k] of panels) {
    g.fillStyle = k > 0 ? `rgba(255,250,235,${k})` : `rgba(90,65,35,${-k})`;
    g.fillRect(x, y, half, half);
  }
  for (const vertical of [true, false]) {
    for (const [w, col] of [[12, "rgba(255,250,235,0.55)"], [4, "rgba(95,70,40,0.55)"]]) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath();
      if (vertical) { g.moveTo(half + (w > 5 ? 5 : 0), 0); g.lineTo(half + (w > 5 ? 5 : 0), px); }
      else { g.moveTo(0, half + (w > 5 ? 5 : 0)); g.lineTo(px, half + (w > 5 ? 5 : 0)); }
      g.stroke();
    }
  }
  const edge = g.createRadialGradient(px / 2, px / 2, px * 0.40, px / 2, px / 2, px * 0.75);
  edge.addColorStop(0, "rgba(150,115,70,0)");
  edge.addColorStop(1, "rgba(140,100,55,0.32)");
  g.fillStyle = edge; g.fillRect(0, 0, px, px);

  g.save();
  g.beginPath(); g.rect(ox, oy, W, W); g.clip();   // sea decoration stays inside the grid

  // sea hatching (fine diagonal strokes)
  g.strokeStyle = "rgba(78,122,138,0.09)";
  g.lineWidth = 1.2;
  for (let d = -W; d < W; d += 16) {
    g.beginPath(); g.moveTo(ox + d, oy); g.lineTo(ox + d + W, oy + W); g.stroke();
  }
  // isobaths: contour lines around the deep trench near the last signal
  const [sx, sy] = state.signal;
  g.strokeStyle = "rgba(78,122,138,0.28)";
  g.lineWidth = 2;
  for (let k = 1; k <= 9; k++) {
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.04) {
      const rad = k * 0.75 * u * (1 + 0.09 * Math.sin(a * 3 + k) + 0.05 * Math.sin(a * 5 - k));
      const x = ox + (sx + 0.5) * u + Math.cos(a) * rad * 1.1;
      const y = oy + (sy + 0.5) * u + Math.sin(a) * rad;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  // depth soundings (decor), away from reefs
  g.fillStyle = "rgba(78,122,138,0.55)";
  g.font = `400 ${Math.round(u * 0.17)}px Manrope, sans-serif`;
  const reefSet = new Set(state.reefs.map(([x, y]) => `${x},${y}`));
  const used = new Set();
  for (let i = 0; i < 60 && used.size < 18; i++) {
    const cx = Math.floor(r() * MAP_CELLS), cy = Math.floor(r() * MAP_CELLS);
    const key = `${cx},${cy}`;
    const depth = Math.round(800 + r() * 3400);
    if (reefSet.has(key) || used.has(key) || (cx === sx && cy === sy)) continue;
    used.add(key);
    g.fillText(String(depth), ox + (cx + 0.12) * u, oy + (cy + 0.9) * u);
  }
  g.restore();

  // grid
  g.strokeStyle = "rgba(43,42,51,0.5)";
  g.lineWidth = 2;
  for (let i = 0; i <= MAP_CELLS; i++) {
    g.beginPath(); g.moveTo(ox + i * u, oy); g.lineTo(ox + i * u, oy + W); g.stroke();
    g.beginPath(); g.moveTo(ox, oy + i * u); g.lineTo(ox + W, oy + i * u); g.stroke();
  }
  g.strokeStyle = "rgba(43,42,51,0.85)";
  g.lineWidth = 5;
  g.strokeRect(ox, oy, W, W);
  g.lineWidth = 1.5;
  g.strokeRect(ox - 10, oy - 10, W + 20, W + 20);

  // labels A–J along the top, 1–10 down the left, handwritten in ink
  g.fillStyle = "#2B2A33";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${Math.round(u * 0.52)}px Caveat, cursive`;
  for (let i = 0; i < MAP_CELLS; i++) {
    g.fillText(state.cols[i], ox + (i + 0.5) * u, oy - MAP_MARGIN * u * 0.5);
    g.fillText(String(i + 1), ox - MAP_MARGIN * u * 0.5, oy + (i + 0.5) * u);
  }

  // reefs: inked rock outline with cross-hatching
  for (const [x, y] of state.reefs) {
    const cx = ox + (x + 0.5) * u, cy = oy + (y + 0.5) * u;
    g.fillStyle = "rgba(91,91,102,0.20)";
    g.strokeStyle = "rgba(43,42,51,0.8)";
    g.lineWidth = 3;
    g.beginPath();
    const n = 11;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = u * (0.36 + 0.07 * r());
      const px_ = cx + Math.cos(a) * rr, py_ = cy + Math.sin(a) * rr * 0.88;
      k === 0 ? g.moveTo(px_, py_) : g.lineTo(px_, py_);
    }
    g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 1.4;
    for (let k = 0; k < 5; k++) {
      const dx = (k - 2) * u * 0.11;
      g.beginPath(); g.moveTo(cx + dx - u * 0.1, cy + u * 0.18); g.lineTo(cx + dx + u * 0.1, cy - u * 0.18); g.stroke();
    }
  }

  // last signal: red pencil cross, drawn twice for a hand-made stroke
  const scx = ox + (sx + 0.5) * u, scy = oy + (sy + 0.5) * u, k = u * 0.26;
  g.strokeStyle = "rgba(194,65,45,0.9)";
  g.lineCap = "round";
  for (const [w, j] of [[7, 0], [3, 3]]) {
    g.lineWidth = w;
    g.beginPath(); g.moveTo(scx - k + j, scy - k); g.lineTo(scx + k, scy + k - j); g.stroke();
    g.beginPath(); g.moveTo(scx + k - j, scy - k); g.lineTo(scx - k, scy + k + j); g.stroke();
  }
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(scx, scy, u * 0.4, 0.3, Math.PI * 2 - 0.2); g.stroke();

  return canvasTexture(c);
}

/** Grey-scale relief of the chart paper (bump map): fibre grain and the two fold creases. */
function chartBump() {
  const px = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  const img = g.createImageData(px, px);
  const r = rng(5);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + r() * 26;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (const vertical of [true, false]) {          // a crease is a valley with soft shoulders
    for (const [w, col] of [[18, "rgba(150,150,150,0.5)"], [5, "rgba(40,40,40,0.9)"]]) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath();
      if (vertical) { g.moveTo(px / 2, 0); g.lineTo(px / 2, px); } else { g.moveTo(0, px / 2); g.lineTo(px, px / 2); }
      g.stroke();
    }
  }
  return new THREE.CanvasTexture(c);
}

export function createScene(canvas, state) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0905);
  scene.fog = new THREE.Fog(0x0e0905, 30, 52);

  // camera: 3/4 view from above, ~55° tilt
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  const target = new THREE.Vector3(0, 0, 0.9);
  const dist = 23.5, tilt = THREE.MathUtils.degToRad(45);   // lower view: hill heights read better
  camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist + target.z);
  camera.lookAt(target);

  // table
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(44, 1, 30),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.72, metalness: 0.0 }),
  );
  table.position.set(0, -0.5, 1.5);
  table.receiveShadow = true;
  scene.add(table);

  // paper chart (thin box so the paper edge is visible), laid on the table by hand
  const paperSide = new THREE.MeshStandardMaterial({ color: PALETTE.paperShade, roughness: 0.95 });
  const chart = new THREE.Mesh(
    new THREE.BoxGeometry(MAP_SIDE, 0.04, MAP_SIDE),
    [paperSide, paperSide,
     new THREE.MeshStandardMaterial({ map: chartTexture(state), roughness: 0.92, bumpMap: chartBump(), bumpScale: 2.0 }),
     paperSide, paperSide, paperSide],
  );
  chart.position.y = 0.02;
  chart.receiveShadow = true;
  scene.add(chart);

  // lights: warm desk lamp top-left with soft shadows + weak cool "porthole" fill from the right
  scene.add(new THREE.HemisphereLight(0xc9c2b5, 0x2a1a10, 0.22));
  const lamp = new THREE.SpotLight(PALETTE.lamp, 5.2, 0, THREE.MathUtils.degToRad(36), 0.85, 0);
  lamp.position.set(-10, 15, 0);
  lamp.target.position.set(0.5, 0, 1.0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0003;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.radius = 4;
  lamp.shadow.camera.near = 6;
  lamp.shadow.camera.far = 45;
  scene.add(lamp, lamp.target);
  const porthole = new THREE.DirectionalLight(0x9cc3d6, 0.3);
  porthole.position.set(14, 7, -6);
  scene.add(porthole);

  // post-processing: render -> tilt-shift blur (top and bottom of the frame) -> tone map + sRGB
  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const hBlur = new ShaderPass(HorizontalTiltShiftShader);
  const vBlur = new ShaderPass(VerticalTiltShiftShader);
  hBlur.uniforms.r.value = vBlur.uniforms.r.value = 0.5;   // focus line through the chart centre
  composer.addPass(hBlur);
  composer.addPass(vBlur);
  composer.addPass(new OutputPass());
  const BLUR = 1.1; // strength of the tilt-shift blur

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    hBlur.uniforms.h.value = BLUR / w;
    vBlur.uniforms.v.value = BLUR / h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  /** World point -> CSS pixel position (for HTML tags pinned to 3D objects). */
  function toScreen(v) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, visible: p.z < 1 };
  }

  return { renderer, scene, camera, composer, toScreen };
}
