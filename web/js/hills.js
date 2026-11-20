// Paper hills: the belief map as a laser-cut topographic model.
// Layer k (k = 1..30) is a sheet of paper covering the area where P >= k %, so
// 1 layer = 1 % and you can count the layers under any cell to read its probability.
// Outlines come from marching squares over a smoothed grid (contours.js).
import * as THREE from "three";
import { cellToWorld, MAP_CELLS, PALETTE } from "./scene.js";
import { smoothField, contourLoops, nestLoops, chaikin } from "./contours.js";

export const LAYER_P = 0.01;      // probability per paper layer
export const MAX_LAYERS = 30;
const T = 0.5 / MAX_LAYERS;       // sheet thickness: 30 sheets = half a cell, a peak never hides its neighbours
const BEVEL = 0.003;              // rounded paper edge
const CHART_TOP = 0.04;
const HALF = MAP_CELLS / 2;

const deep = new THREE.Color(PALETTE.paperDeep);
const light = new THREE.Color(PALETTE.paper);
const gold = new THREE.Color(PALETTE.gold);

/** Number of layers under a cell centre with probability p. */
export function layersAt(p) {
  return Math.min(MAX_LAYERS, Math.floor(p / LAYER_P + 1e-9));
}

/** Paper grain used as a bump map on every sheet (tiles once per cell). */
function grainTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const img = g.createImageData(256, 256);
  let s = 12345;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = 118 + ((s >>> 24) % 22);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Grid lines printed on every sheet, aligned with the chart cells (UV = map units). */
function gridTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(43,42,51,0.32)";
  g.fillRect(0, 0, 256, 3); g.fillRect(0, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Top/side materials of layer k: darker at the foot, lighter toward the top,
 *  alternating tone, darker sides — so every sheet reads separately. */
function layerMaterials(k, isGold, tex) {
  const top = new THREE.Color().copy(deep).multiplyScalar(0.92).lerp(light, Math.min(1, (k - 1) / 6));
  if (k % 2 === 0) top.multiplyScalar(0.9);
  if (isGold) top.copy(gold);
  const side = top.clone().multiplyScalar(0.5);
  return [
    new THREE.MeshStandardMaterial({ color: top, map: tex.grid, roughness: 0.9, bumpMap: tex.grain, bumpScale: 0.6 }),
    new THREE.MeshStandardMaterial({ color: side, roughness: 0.95 }),
  ];
}

const toWorld = ([u, v]) => [Math.min(MAP_CELLS, Math.max(0, u)) - HALF, Math.min(MAP_CELLS, Math.max(0, v)) - HALF];

export function createHills(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const tex = { grain: grainTexture(), grid: gridTexture() };
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2b2a33, transparent: true, opacity: 0.7 });
  const matCache = new Map();          // "k:gold" -> [top, side] — reused across rebuilds
  const listeners = [];                // called after every rebuild (sub, marks follow the relief)
  let P = null;                        // the belief currently SHOWN (may be mid-animation)
  let shown = true;                    // V toggles the hills

  const materials = (k, isGold) => {
    const key = `${k}:${isGold}`;
    if (!matCache.has(key)) matCache.set(key, layerMaterials(k, isGold, tex));
    return matCache.get(key);
  };

  function clear() {
    for (const obj of [...group.children]) {
      obj.geometry.dispose();
      group.remove(obj);
    }
  }

  /** Rebuild the whole relief from a belief map P[y][x] (rows from the server). */
  function build(rows) {
    P = rows;
    clear();
    const field = smoothField(rows);
    const maxP = Math.max(...rows.flat());
    const top = layersAt(maxP);
    for (let k = 1; k <= top; k++) {
      const loops = contourLoops(field, k * LAYER_P).map(chaikin);
      const shapes = nestLoops(loops).map(({ outer, holes }) => {
        // shape plane = (x, -z) so that rotating -90° about X lays it on the table
        const shape = new THREE.Shape(outer.map(toWorld).map(([x, z]) => new THREE.Vector2(x, -z)));
        for (const h of holes) {
          shape.holes.push(new THREE.Path(h.map(toWorld).map(([x, z]) => new THREE.Vector2(x, -z))));
        }
        return shape;
      });
      if (!shapes.length) continue;

      const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: T - 2 * BEVEL - 0.001, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL,
        bevelSegments: 2, curveSegments: 1,
      });
      const sheet = new THREE.Mesh(geo, materials(k, maxP > 0.5 && k === top));
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.y = CHART_TOP + (k - 1) * T + BEVEL;
      sheet.castShadow = sheet.receiveShadow = true;
      group.add(sheet);

      // thin dark line along the cut edge of the sheet
      const pts = [];
      const y = CHART_TOP + k * T + 0.0008;   // just above the sheet top (no z-fighting)
      for (const loop of loops) {
        for (let i = 0; i < loop.length; i++) {
          const [x1, z1] = toWorld(loop[i]), [x2, z2] = toWorld(loop[(i + 1) % loop.length]);
          pts.push(x1, y, z1, x2, y, z2);
        }
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      group.add(new THREE.LineSegments(lineGeo, edgeMat));
    }
    placeSignal();
    for (const fn of listeners) fn();
  }

  /** Height of the relief top above cell (x, y). 0 layers when the hills are hidden. */
  function heightAt(x, y) {
    return CHART_TOP + (shown && P ? T * layersAt(P[y][x]) : 0);
  }

  /** World point on top of the relief above cell (x, y) — for pinning marks and tags. */
  function topOf(x, y) {
    return cellToWorld(x, y, heightAt(x, y));
  }

  /** Move from the shown belief to `rows` in a few steps over `ms`:
   *  sheets are added / removed one by one, like paper being laid or lifted. */
  let anim = 0;
  function animateTo(rows, ms = 400, steps = 6) {
    const from = P, id = ++anim;
    if (!from) { build(rows); return Promise.resolve(); }
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        if (id !== anim) return resolve();      // a newer animation took over
        i++;
        const t = i / steps;
        build(i >= steps ? rows : rows.map((r, y) => r.map((v, x) => from[y][x] + (v - from[y][x]) * t)));
        if (i >= steps) resolve(); else setTimeout(tick, ms / steps);
      };
      tick();
    });
  }

  function setShown(v) {
    shown = v;
    group.visible = v;
    placeSignal();
    for (const fn of listeners) fn();
  }

  // Red-pencil cross for the last signal, lying on top of whatever hill grows there.
  let signalMark = null, signalCell = null;
  function markSignal(cell) {
    if (!signalMark) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      g.strokeStyle = "rgba(194,65,45,0.95)";
      g.lineCap = "round";
      for (const [w, j] of [[16, 0], [7, 6]]) {
        g.lineWidth = w;
        g.beginPath(); g.moveTo(60 + j, 60); g.lineTo(196, 196 - j); g.stroke();
        g.beginPath(); g.moveTo(196 - j, 60); g.lineTo(60, 196 + j); g.stroke();
      }
      g.lineWidth = 6;
      g.beginPath(); g.arc(128, 128, 100, 0.3, Math.PI * 2 - 0.2); g.stroke();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      signalMark = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8),
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false }));
      signalMark.rotation.x = -Math.PI / 2;
      signalMark.receiveShadow = true;
      scene.add(signalMark);
    }
    signalCell = cell;
    placeSignal();
  }
  function placeSignal() {
    if (!signalMark) return;
    signalMark.position.copy(topOf(...signalCell)).add(new THREE.Vector3(0, 0.004, 0));
  }

  return {
    group, topOf, heightAt, markSignal, animateTo, setShown,
    setBelief: build,
    isShown: () => shown,
    onChange: (fn) => listeners.push(fn),
  };
}
