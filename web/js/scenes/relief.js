// The probability relief: a paper terrain whose height is the belief P (CLAUDE.md v3, 3).
//
// Heights (CPU, 200x200 vertices):
//   p(u, v)   smoothstep-bilinear between cell centres: exactly P at the centre of every cell
//   L(p)      layers: 1 % per layer up to 30 %, then 1 layer per 5 %
//   terraces  each layer rises in its last 22 % (soft paper steps)
//   height    = terraces * T, T = 0.5 / 30 (30 layers = half a cell, a peak never hides neighbours)
// Everything else is drawn by the fragment shader directly on the relief: ink contour lines
// (every 5th thicker), alternating layer tone, paper grain, pencil grid, gold above 50 %,
// reef hatching, dive marks, the last-signal cross, highlights and sonar rings.
import * as THREE from "three";

export const N = 200;                 // vertices per side
export const LAYER_T = 0.5 / 30;      // world units per layer
export const BASE_Y = 0.046;          // a hair above the paper chart (0.04): no z-fighting
const MORPH_S = 1.5;                  // the relief flows to a new belief in 1.5 s

/** Probability -> layers: 1 % per layer up to 30 %, then one layer per 5 %. */
export function layersOf(p) {
  return p <= 0.3 ? p * 100 : 30 + (p - 0.3) * 20;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** p at map point (u, v), u, v in [0, 10]: smoothstep-bilinear between cell centres. */
function sampleP(P, u, v) {
  const n = P.length;
  const fx = Math.min(n - 1, Math.max(0, u - 0.5)), fy = Math.min(n - 1, Math.max(0, v - 0.5));
  const x0 = Math.min(n - 2, Math.floor(fx)), y0 = Math.min(n - 2, Math.floor(fy));
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = P[y0][x0], b = P[y0][x0 + 1], c = P[y0 + 1][x0], d = P[y0 + 1][x0 + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Terraced height in layers: whole layers stay flat, the next one rises in its last 22 %. */
function terrace(L) {
  const n = Math.floor(L), f = L - n;
  const s = f <= 0.78 ? 0 : smooth((f - 0.78) / 0.22);
  return n + s;
}

function field(P) {
  const h = new Float32Array(N * N), L = new Float32Array(N * N), p = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const pv = sampleP(P, (i / (N - 1)) * 10, (j / (N - 1)) * 10);
      p[k] = pv;
      L[k] = layersOf(pv);
      h[k] = terrace(L[k]) * LAYER_T;
    }
  }
  return { h, L, p };
}

const COLORS = {
  paper: new THREE.Color(0xEFE6D2), sea: new THREE.Color(0xE9E1CB), deep: new THREE.Color(0xC9B791),
  ink: new THREE.Color(0x2B2A33), pencil: new THREE.Color(0x6A6A74), gold: new THREE.Color(0xE8B04A),
  teal: new THREE.Color(0x2F7D86), red: new THREE.Color(0xC2412D), brass: new THREE.Color(0xB8893B),
};

const VERT_DECL = /* glsl */`
attribute float aLayer;
attribute float aP;
varying float vLayer;
varying float vP;
varying vec2 vMap;
`;

const FRAG_DECL = /* glsl */`
varying float vLayer;
varying float vP;
varying vec2 vMap;
uniform sampler2D uCells;      // 10x10: r = reef, g = dive mark (1..4)/4
uniform vec2 uHover;           // cell under the cursor (-1 = none)
uniform vec2 uTarget;          // chosen target cell: red frame
uniform vec3 uZone;            // tool zone: xy cell, z = 1 sonar 3x3 (teal), 2 dive 1x1 (gold)
uniform vec3 uRivalZone;       // rival intention: same, red marching dashes
uniform vec2 uSignal;          // last-signal point (map units)
uniform float uTime;
uniform vec4 uRings[4];        // x, y, radius, alpha
uniform vec3 uRingColor[4];
uniform vec3 uPaper, uSea, uDeep, uInk, uPencil, uGold, uTeal, uRed;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// anti-aliased line: d = distance to the line, w = half width (both in the same units)
float aaLine(float d, float w, float px) { return 1.0 - smoothstep(w, w + px, d); }

// square frame around a cell rectangle [lo, hi] (map units), inner width w
float frameOf(vec2 lo, vec2 hi, float w) {
  vec2 c = (lo + hi) * 0.5, r = (hi - lo) * 0.5;
  vec2 q = abs(vMap - c) - r;
  float outside = max(q.x, q.y);
  float px = fwidth(vMap.x) * 1.2;
  return (1.0 - smoothstep(0.0, px, outside)) * (1.0 - smoothstep(w, w + px, -outside));
}
float insideRect(vec2 lo, vec2 hi) {
  return step(lo.x, vMap.x) * step(vMap.x, hi.x) * step(lo.y, vMap.y) * step(vMap.y, hi.y);
}
`;

const FRAG_BODY = /* glsl */`
{
  float L = vLayer;
  float n = floor(L + 1e-4);
  vec2 cell = floor(vMap);
  vec2 lc = fract(vMap) - 0.5;          // position inside the cell, -0.5..0.5
  float pxm = fwidth(vMap.x);           // one screen pixel in map units

  // paper: flat sea below the first layer, then darker foot -> lighter top, alternating tone
  vec3 col = uSea;
  if (L >= 1.0) {
    col = mix(uDeep, uPaper, clamp((n - 1.0) / 7.0, 0.0, 1.0));
    col *= mod(n, 2.0) < 0.5 ? 0.93 : 1.0;
  }
  col *= 0.95 + 0.07 * vnoise(vMap * 70.0) + 0.03 * vnoise(vMap * 9.0);      // paper grain

  // pencil grid on every cell border
  vec2 g = abs(fract(vMap + 0.5) - 0.5);
  float grid = max(aaLine(g.x, 0.008, pxm), aaLine(g.y, 0.008, pxm));
  col = mix(col, uPencil, grid * 0.45);

  // ink contour lines at every whole layer; every 5th is thicker (like a topo map)
  if (L > 0.6) {
    float d = abs(fract(L + 0.5) - 0.5);
    float wl = fwidth(L);
    float major = abs(mod(floor(L + 0.5), 5.0)) < 0.5 ? 1.0 : 0.0;
    float line = aaLine(d, wl * mix(0.55, 1.25, major), wl * 0.9);
    col = mix(col, uInk, line * mix(0.6, 0.85, major));
  }

  // gold where the belief is above 50 %
  col = mix(col, uGold, smoothstep(0.5, 0.53, vP) * 0.8);

  // reefs: diagonal pencil hatching
  vec4 cellData = texture2D(uCells, (cell + 0.5) / 10.0);
  if (cellData.r > 0.5) {
    float hd = abs(fract((vMap.x + vMap.y) * 7.0) - 0.5) / 7.0;
    float hatch = aaLine(hd, 0.012, pxm) * step(max(abs(lc.x), abs(lc.y)), 0.46);
    col = mix(col, uPencil, hatch * 0.75);
  }

  // dive marks: 1 our "nothing" (pencil cross), 2 our debris (circle + shard),
  //             3 rival "nothing" (red cross), 4 rival debris (red circle)
  float mark = floor(cellData.g * 4.0 + 0.5);
  if (mark > 0.5) {
    vec3 mc = mark > 2.5 ? uRed : uInk;
    float m = 0.0;
    if (mark == 1.0 || mark == 3.0) {
      float dx = min(abs(lc.x - lc.y), abs(lc.x + lc.y)) * 0.7071;
      m = aaLine(dx, 0.022, pxm) * step(max(abs(lc.x), abs(lc.y)), 0.28);
    } else {
      m = aaLine(abs(length(lc) - 0.27), 0.02, pxm);
      if (mark == 2.0) {
        vec2 s = lc - vec2(0.02, 0.0);
        m = max(m, step(abs(s.x) + abs(s.y) * 1.8, 0.09));             // the shard
      }
    }
    col = mix(col, mc, m * 0.9);
  }

  // last signal: red cross in a dashed circle
  vec2 sd = vMap - uSignal;
  float cross = min(abs(sd.x - sd.y), abs(sd.x + sd.y)) * 0.7071;
  float sig = aaLine(cross, 0.026, pxm) * step(max(abs(sd.x), abs(sd.y)), 0.2);
  float ang = atan(sd.y, sd.x);
  float dash = step(0.5, fract(ang * 12.0 / 6.2832));
  sig = max(sig, aaLine(abs(length(sd) - 0.36), 0.016, pxm) * dash);
  col = mix(col, uRed, sig * 0.95);

  // highlights drawn on the relief itself
  if (cell == uHover) col = mix(col, vec3(1.0), 0.28);
  if (uZone.z > 0.5) {
    float r = uZone.z < 1.5 ? 1.0 : 0.0;
    vec2 lo = uZone.xy - r, hi = uZone.xy + 1.0 + r;
    vec3 zc = uZone.z < 1.5 ? uTeal : uGold;
    col = mix(col, zc, insideRect(lo, hi) * 0.18);
    col = mix(col, zc, frameOf(lo, hi, 0.05) * 0.95);
  }
  if (uRivalZone.z > 0.5) {
    float r = uRivalZone.z < 1.5 ? 1.0 : 0.0;
    vec2 lo = uRivalZone.xy - r, hi = uRivalZone.xy + 1.0 + r;
    float march = step(0.5, fract((vMap.x + vMap.y) * 2.2 - uTime * 0.9));   // running dashes
    col = mix(col, uRed, frameOf(lo, hi, 0.055) * march * 0.95);
    col = mix(col, uRed, insideRect(lo, hi) * 0.07);
  }
  if (uTarget.x > -0.5) col = mix(col, uRed, frameOf(uTarget, uTarget + 1.0, 0.07));

  // expanding sonar rings (ours teal, the rival's red)
  for (int i = 0; i < 4; i++) {
    vec4 rg = uRings[i];
    if (rg.w > 0.0) {
      float dr = abs(length(vMap - rg.xy) - rg.z);
      col = mix(col, uRingColor[i], aaLine(dr, 0.035, pxm * 1.5) * rg.w);
    }
  }

  diffuseColor.rgb *= col;
}
`;

export function createRelief(scene, rows, reefs, signal) {
  const geo = new THREE.PlaneGeometry(10, 10, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);                       // XY plane -> lying on the table (XZ)
  const count = N * N;
  geo.setAttribute("aLayer", new THREE.BufferAttribute(new Float32Array(count), 1));
  geo.setAttribute("aP", new THREE.BufferAttribute(new Float32Array(count), 1));

  // per-cell data texture: reefs and dive marks
  const cellData = new Uint8Array(10 * 10 * 4);
  const cells = new THREE.DataTexture(cellData, 10, 10, THREE.RGBAFormat);
  cells.magFilter = cells.minFilter = THREE.NearestFilter;
  for (const [x, y] of reefs) cellData[(y * 10 + x) * 4] = 255;
  cells.needsUpdate = true;

  const uniforms = {
    uCells: { value: cells },
    uHover: { value: new THREE.Vector2(-9, -9) },
    uTarget: { value: new THREE.Vector2(-9, -9) },
    uZone: { value: new THREE.Vector3(0, 0, 0) },
    uRivalZone: { value: new THREE.Vector3(0, 0, 0) },
    uSignal: { value: new THREE.Vector2(signal[0], signal[1]) },
    uTime: { value: 0 },
    uRings: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
    uRingColor: { value: [0, 1, 2, 3].map(() => new THREE.Color(0x2F7D86)) },
    uPaper: { value: COLORS.paper }, uSea: { value: COLORS.sea }, uDeep: { value: COLORS.deep },
    uInk: { value: COLORS.ink }, uPencil: { value: COLORS.pencil }, uGold: { value: COLORS.gold },
    uTeal: { value: COLORS.teal }, uRed: { value: COLORS.red },
  };

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  vLayer = aLayer; vP = aP; vMap = position.xz + 5.0;");
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace(
      "#include <color_fragment>", "#include <color_fragment>\n" + FRAG_BODY);
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = BASE_Y;
  mesh.receiveShadow = true;
  mesh.castShadow = false;     // the low paper steps self-shadow into stripes; ships and stones cast
  scene.add(mesh);

  // current (shown) arrays and the morph between two beliefs
  let cur = field(rows), from = null, to = null, morphT = 1;
  const listeners = [];

  function apply(f) {
    const pos = geo.attributes.position, la = geo.attributes.aLayer, pa = geo.attributes.aP;
    for (let k = 0; k < count; k++) {
      pos.setY(k, f.h[k]);
      la.setX(k, f.L[k]);
      pa.setX(k, f.p[k]);
    }
    pos.needsUpdate = la.needsUpdate = pa.needsUpdate = true;
    geo.computeVertexNormals();
    for (const fn of listeners) fn();
  }
  apply(cur);

  let resolveMorph = null;
  function setBelief(newRows, animate = true) {
    to = field(newRows);
    if (!animate) { cur = to; morphT = 1; apply(cur); return Promise.resolve(); }
    from = { h: cur.h.slice(), L: cur.L.slice(), p: cur.p.slice() };
    morphT = 0;
    return new Promise((r) => { resolveMorph?.(); resolveMorph = r; });
  }

  const ringState = [0, 1, 2, 3].map(() => null);
  function ring(cell, color, dur = 1.4) {
    const i = ringState.findIndex((r) => r === null);
    const slot = i < 0 ? 0 : i;
    ringState[slot] = { x: cell[0] + 0.5, y: cell[1] + 0.5, t: 0, dur };
    uniforms.uRingColor.value[slot].set(color);
  }

  function update(dt, time) {
    uniforms.uTime.value = time;
    if (morphT < 1) {
      morphT = Math.min(1, morphT + dt / MORPH_S);
      const e = smooth(morphT);
      const h = new Float32Array(count), L = new Float32Array(count), p = new Float32Array(count);
      for (let k = 0; k < count; k++) {
        h[k] = from.h[k] + (to.h[k] - from.h[k]) * e;
        L[k] = from.L[k] + (to.L[k] - from.L[k]) * e;
        p[k] = from.p[k] + (to.p[k] - from.p[k]) * e;
      }
      cur = { h, L, p };
      apply(cur);
      if (morphT >= 1) { cur = to; resolveMorph?.(); resolveMorph = null; }
    }
    ringState.forEach((r, i) => {
      const u = uniforms.uRings.value[i];
      if (!r) { u.w = 0; return; }
      r.t += dt;
      const k = r.t / r.dur;
      u.set(r.x, r.y, 0.15 + k * 1.75, Math.max(0, 1 - k));
      if (k >= 1) ringState[i] = null;
    });
  }

  /** Height of the shown relief at map point (u, v) (bilinear on the vertex grid). */
  function heightAt(u, v) {
    const fx = Math.min(N - 1.001, Math.max(0, (u / 10) * (N - 1)));
    const fy = Math.min(N - 1.001, Math.max(0, (v / 10) * (N - 1)));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const H = cur.h;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return BASE_Y + (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  /** Dive marks from the probes of both ships. */
  function setMarks(probes, rivalProbes) {
    for (let k = 0; k < 100; k++) cellData[k * 4 + 1] = 0;
    const put = (p, rival) => {
      if (p.kind !== "dive" || p.result === "box") return;
      const code = (rival ? 2 : 0) + (p.result === "debris" ? 2 : 1);
      cellData[(p.cell[1] * 10 + p.cell[0]) * 4 + 1] = Math.round((code / 4) * 255);
    };
    for (const p of rivalProbes || []) put(p, true);
    for (const p of probes || []) put(p, false);       // ours on top
    cells.needsUpdate = true;
  }

  const set = (u, v) => (cell) => (cell ? u.value.set(cell[0], cell[1]) : u.value.set(-9, -9));
  return {
    mesh, update, setBelief, heightAt, setMarks, ring,
    onChange: (fn) => listeners.push(fn),
    hover: set(uniforms.uHover), target: set(uniforms.uTarget),
    zone(cell, tool) { uniforms.uZone.value.set(cell ? cell[0] : 0, cell ? cell[1] : 0, !cell ? 0 : tool === "dive" ? 2 : 1); },
    rivalZone(cell, tool) { uniforms.uRivalZone.value.set(cell ? cell[0] : 0, cell ? cell[1] : 0, !cell ? 0 : tool === "dive" ? 2 : 1); },
  };
}
