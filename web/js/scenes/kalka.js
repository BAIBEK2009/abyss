// The probability relief as amber tracing paper (CLAUDE.md v3.1, 18 + 21.1 p. 5).
//
// The belief P (10x10) becomes a smooth field p(u, v) (smoothstep-bilinear between cell centres,
// exact at every centre). Eight sheets of tracing paper are cut along fixed probability levels:
//   LEVELS = 1.8, 2.6, 3.5, 4.5, 6, 9, 16, 30 %   (the two top sheets are gold: "time to dive")
// Every sheet is a flat plane whose outline is computed in the fragment shader from one field
// texture, so a new belief costs one texture upload. Under each sheet lies a dark copy half a
// sheet lower (the cardboard thickness); along the edge runs a light rim.
// The shader also draws, on whatever surface is on top: hover, target frame, tool zones, the
// rival's marching frame, sonar rings, dive marks and the last-signal cross (shared with the chart).
//
// A Bayes update looks physical: sheets lift one after another (80 ms apart) with a tiny tilt,
// change their outline in the air and settle back.
import * as THREE from "three";

export const LEVELS = [0.018, 0.026, 0.035, 0.045, 0.06, 0.09, 0.16, 0.30];
export const NL = LEVELS.length;
export const LH = 0.085;           // world units between sheets (8 sheets ≈ 0.7 of a cell)
export const LY0 = 0.03;           // the first sheet floats just above the chart
const FN = 160;                    // field texture resolution (10 cells)
const SHEET_GAP_S = 0.08, SHEET_S = 0.65;

const smooth = (t) => t * t * (3 - 2 * t);

/** p at map point (u, v) in [0, 10]: smoothstep-bilinear between cell centres. */
export function sampleP(P, u, v) {
  const n = P.length;
  const fx = Math.min(n - 1, Math.max(0, u - 0.5)), fy = Math.min(n - 1, Math.max(0, v - 0.5));
  const x0 = Math.min(n - 2, Math.floor(fx)), y0 = Math.min(n - 2, Math.floor(fy));
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = P[y0][x0], b = P[y0][x0 + 1], c = P[y0 + 1][x0], d = P[y0 + 1][x0 + 1];
  let p = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  const edge = Math.min(u, 10 - u, v, 10 - v);          // sheets end a little inside the chart
  return p * Math.min(1, Math.max(0, edge / 0.3));
}

function fieldOf(P) {
  const f = new Float32Array(FN * FN);
  for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) f[j * FN + i] = sampleP(P, ((i + 0.5) / FN) * 10, ((j + 0.5) / FN) * 10);
  return f;
}

// ---------------------------------------------------------------- shared overlay (chart + sheets)
export const OVERLAY_DECL = /* glsl */`
varying vec3 vWorldMap;
uniform sampler2D uCells;      // 10x10: r = reef, g = dive mark (1..4)/4
uniform vec2 uHover, uTarget;
uniform vec3 uZone, uRivalZone, uBand;
uniform vec2 uSignal;
uniform float uTime;
uniform vec4 uRings[4];
uniform vec3 uRingColor[4];
float ovHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ovNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ovHash(i), ovHash(i + vec2(1, 0)), u.x), mix(ovHash(i + vec2(0, 1)), ovHash(i + vec2(1, 1)), u.x), u.y);
}
float aaLine(float d, float w, float px) { return 1.0 - smoothstep(w, w + px, d); }
float frameOf(vec2 m, vec2 lo, vec2 hi, float w, float px) {
  vec2 c = (lo + hi) * 0.5, r = (hi - lo) * 0.5;
  vec2 q = abs(m - c) - r; float outside = max(q.x, q.y);
  return (1.0 - smoothstep(0.0, px, outside)) * (1.0 - smoothstep(w, w + px, -outside));
}
float insideRect(vec2 m, vec2 lo, vec2 hi) { return step(lo.x, m.x) * step(m.x, hi.x) * step(lo.y, m.y) * step(m.y, hi.y); }
vec3 overlay(vec3 col, vec2 m) {
  if (m.x < 0.0 || m.y < 0.0 || m.x > 10.0 || m.y > 10.0) return col;
  vec2 cell = floor(m), lc = fract(m) - 0.5;
  float px = fwidth(m.x) * 1.2;
  // sRGB design colours -> linear (the shader works in linear light)
  vec3 INK = pow(vec3(0.17, 0.165, 0.2), vec3(2.2)), RED = pow(vec3(0.76, 0.25, 0.18), vec3(2.2));
  vec3 TEAL = pow(vec3(0.18, 0.49, 0.53), vec3(2.2)), GOLD = pow(vec3(0.89, 0.65, 0.21), vec3(2.2));
  vec4 cd = texture2D(uCells, (cell + 0.5) / 10.0);
  // dive marks: 1 ours "nothing" (cross), 2 ours debris (circle + shard), 3/4 the same in red for the rival
  float mark = floor(cd.g * 4.0 + 0.5);
  if (mark > 0.5) {
    vec3 mc = mark > 2.5 ? RED : INK; float k = 0.0;
    if (mark == 1.0 || mark == 3.0) {
      float dx = min(abs(lc.x - lc.y), abs(lc.x + lc.y)) * 0.7071;
      k = aaLine(dx, 0.024, px) * step(max(abs(lc.x), abs(lc.y)), 0.26);
    } else {
      k = aaLine(abs(length(lc) - 0.26), 0.02, px);
      if (mark == 2.0) k = max(k, step(abs(lc.x - 0.02) + abs(lc.y) * 1.8, 0.09));
    }
    col = mix(col, mc, k * 0.85);
  }
  // last signal: red cross in a dashed circle
  vec2 sd = m - uSignal;
  float cr = min(abs(sd.x - sd.y), abs(sd.x + sd.y)) * 0.7071;
  float sig = aaLine(cr, 0.026, px) * step(max(abs(sd.x), abs(sd.y)), 0.19);
  float dash = step(0.5, fract(atan(sd.y, sd.x) * 12.0 / 6.2832));
  sig = max(sig, aaLine(abs(length(sd) - 0.34), 0.014, px) * dash);
  col = mix(col, RED, sig * 0.9);
  // radio strip of the coast guard (shown while the radio is open)
  if (uBand.z > 0.5) {
    vec2 lo = uBand.z < 1.5 ? vec2(uBand.x, 0.0) : vec2(0.0, uBand.x);
    vec2 hi = uBand.z < 1.5 ? vec2(uBand.y, 10.0) : vec2(10.0, uBand.y);
    float march = step(0.5, fract((m.x + m.y) * 2.0 - uTime * 0.6));
    col = mix(col, TEAL, insideRect(m, lo, hi) * 0.16);
    col = mix(col, TEAL, frameOf(m, lo, hi, 0.04, px) * march);
  }
  if (cell == uHover) col = mix(col, vec3(1.0, 0.98, 0.92), 0.26);
  if (uZone.z > 0.5) {
    float r = uZone.z < 1.5 ? 1.0 : 0.0;
    vec2 lo = uZone.xy - r, hi = uZone.xy + 1.0 + r;
    vec3 zc = uZone.z < 1.5 ? TEAL : GOLD;
    col = mix(col, zc, insideRect(m, lo, hi) * 0.18);
    col = mix(col, zc, frameOf(m, lo, hi, 0.05, px) * 0.95);
  }
  if (uRivalZone.z > 0.5) {
    float r = uRivalZone.z < 1.5 ? 1.0 : 0.0;
    vec2 lo = uRivalZone.xy - r, hi = uRivalZone.xy + 1.0 + r;
    float march = step(0.5, fract((m.x + m.y) * 2.2 - uTime * 0.9));
    col = mix(col, RED, frameOf(m, lo, hi, 0.055, px) * march * 0.95);
    col = mix(col, RED, insideRect(m, lo, hi) * 0.07);
  }
  if (uTarget.x > -0.5) col = mix(col, RED, frameOf(m, uTarget, uTarget + 1.0, 0.065, px));
  for (int i = 0; i < 4; i++) {
    vec4 rg = uRings[i];
    if (rg.w > 0.0) col = mix(col, uRingColor[i], aaLine(abs(length(m - rg.xy) - rg.z), 0.035, px * 1.5) * rg.w);
  }
  return col;
}
`;

/** Patch a standard/physical material so its top surface gets the overlay (vWorldMap = map units). */
export function withOverlay(material, uniforms, extraDecl = "", body = "") {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "varying vec3 vWorldMap;\n" + shader.vertexShader.replace("#include <worldpos_vertex>",
      "#include <worldpos_vertex>\n  vWorldMap = vec3((modelMatrix * vec4(transformed, 1.0)).xz + 5.0, (modelMatrix * vec4(transformed, 1.0)).y);");
    shader.fragmentShader = OVERLAY_DECL + extraDecl + shader.fragmentShader.replace("#include <color_fragment>",
      "#include <color_fragment>\n" + body + "\n  diffuseColor.rgb = overlay(diffuseColor.rgb, vWorldMap.xy);");
  };
  material.customProgramCacheKey = () => "overlay" + extraDecl.length + body.length;
  return material;
}

// ---------------------------------------------------------------- sheets
const SHEET_DECL = /* glsl */`
uniform sampler2D uFieldA, uFieldB;
uniform float uMix, uTh, uEdge, uGold;
uniform vec3 uTint;
float fieldAt(vec2 m) { vec2 uv = m / 10.0; return mix(texture2D(uFieldA, uv).r, texture2D(uFieldB, uv).r, uMix); }
float cutNoise(vec2 m) { return (ovNoise(m * 6.0) - 0.5) * 0.05 + (ovNoise(m * 21.0) - 0.5) * 0.02; }
`;
const SHEET_BODY = /* glsl */`
  vec2 sm = vWorldMap.xy;
  float pf = fieldAt(sm);
  float th = uTh * (1.0 + cutNoise(sm));                   // a hand-cut, slightly wavy outline
  float e = 0.02;
  vec2 gp = vec2(fieldAt(sm + vec2(e, 0.0)) - fieldAt(sm - vec2(e, 0.0)), fieldAt(sm + vec2(0.0, e)) - fieldAt(sm - vec2(0.0, e))) / (2.0 * e);
  float d = (pf - th) / max(length(gp), 1e-4);              // map distance inside the outline
  float pxd = fwidth(sm.x);
  if (d < -pxd) discard;
  float cover = smoothstep(-pxd, pxd, d);                   // alpha-to-coverage: a smooth cut edge
  vec3 c = uTint * (0.94 + 0.07 * ovNoise(sm * 45.0) + 0.03 * ovHash(floor(sm * 300.0)));    // paper fibres
  if (uEdge < 0.5) {
    c = mix(c, vec3(1.0, 0.965, 0.88), (1.0 - smoothstep(0.0, 0.028, d)) * 0.55);          // light rim
    c *= 1.0 - 0.08 * smoothstep(0.028, 0.04, d) * (1.0 - smoothstep(0.05, 0.08, d));      // soft step after it
  }
  diffuseColor.rgb = c;
  diffuseColor.a = cover;
`;

function rampColor(k) {
  const t = (k - 1) / (NL - 1);
  const a = [242, 212, 150], b = [234, 166, 70], c = [212, 128, 26];
  const m = t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4;
  const p = t < 0.6 ? a : b, q = t < 0.6 ? b : c;
  return new THREE.Color(...p.map((v, i) => (v + (q[i] - v) * m) / 255)).convertSRGBToLinear();
}

export function createKalka(root, rows, reefs, signal) {
  const cellData = new Uint8Array(10 * 10 * 4);
  const cells = new THREE.DataTexture(cellData, 10, 10, THREE.RGBAFormat);
  cells.magFilter = cells.minFilter = THREE.NearestFilter;
  for (const [x, y] of reefs) cellData[(y * 10 + x) * 4] = 255;
  cells.needsUpdate = true;

  const makeField = () => {
    const t = new THREE.DataTexture(new Float32Array(FN * FN), FN, FN, THREE.RedFormat, THREE.FloatType);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  const texA = makeField(), texB = makeField();
  let fA = fieldOf(rows), fB = fA;
  texA.image.data.set(fA); texA.needsUpdate = true;
  texB.image.data.set(fB); texB.needsUpdate = true;

  // uniforms shared by every surface with the overlay (chart + sheets)
  const shared = {
    uCells: { value: cells },
    uHover: { value: new THREE.Vector2(-9, -9) },
    uTarget: { value: new THREE.Vector2(-9, -9) },
    uZone: { value: new THREE.Vector3() },
    uRivalZone: { value: new THREE.Vector3() },
    uBand: { value: new THREE.Vector3() },
    uSignal: { value: new THREE.Vector2(signal[0], signal[1]) },
    uTime: { value: 0 },
    uRings: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    uRingColor: { value: [0, 1, 2, 3].map(() => new THREE.Color(0x2F7D86)) },
  };

  const group = new THREE.Group();
  root.add(group);
  const sheets = [];
  const geo = new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2);
  for (let k = 1; k <= NL; k++) {
    const gold = k >= NL - 1;
    const own = {
      uFieldA: { value: texA }, uFieldB: { value: texB }, uMix: { value: 0 },
      uTh: { value: LEVELS[k - 1] }, uEdge: { value: 0 }, uGold: { value: gold ? 1 : 0 }, uTint: { value: rampColor(k) },
    };
    const mk = (edge) => {
      const u = { ...shared, ...own, uEdge: { value: edge ? 1 : 0 }, uTint: { value: edge ? own.uTint.value.clone().multiplyScalar(0.42) : own.uTint.value } };
      const mat = new THREE.MeshStandardMaterial({ roughness: gold && !edge ? 0.38 : 0.86, metalness: gold && !edge ? 0.45 : 0, alphaToCoverage: true });
      withOverlay(mat, u, SHEET_DECL, SHEET_BODY);
      mat.customProgramCacheKey = () => "sheet";
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, u);
        shader.vertexShader = "varying vec3 vWorldMap;\n" + shader.vertexShader.replace("#include <project_vertex>",
          "#include <project_vertex>\n  vWorldMap = vec3((modelMatrix * vec4(transformed, 1.0)).xz + 5.0, 0.0);");
        shader.fragmentShader = OVERLAY_DECL + SHEET_DECL + shader.fragmentShader.replace("void main() {",
          "void main() {\n  { vec2 sm = vWorldMap.xy; float th = uTh * (1.0 + cutNoise(sm)); if (fieldAt(sm) < th) discard; }");
      };
      depth.customProgramCacheKey = () => "sheet-depth";
      const m = new THREE.Mesh(geo, mat);
      m.customDepthMaterial = depth;
      m.receiveShadow = true;
      m.castShadow = !edge;
      m.renderOrder = k - (edge ? 0.5 : 0);
      return { mesh: m, u };
    };
    const top = mk(false), under = mk(true);
    const holder = new THREE.Group();
    holder.add(top.mesh, under.mesh);
    top.mesh.position.y = 0;
    under.mesh.position.y = -LH * 0.5;
    holder.position.set(0, LY0 + k * LH, 0);
    group.add(holder);
    sheets.push({ k, holder, own, mix: 0, anim: null });
  }

  const listeners = [];
  let pending = null;

  /** Field at map point (u, v) as currently shown by sheet k (its own mix). */
  function fieldAt(u, v, mix) {
    const fx = Math.min(FN - 1.001, Math.max(0, (u / 10) * FN - 0.5)), fy = Math.min(FN - 1.001, Math.max(0, (v / 10) * FN - 0.5));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const at = (F) => {
      const a = F[j * FN + i], b = F[j * FN + i + 1], c = F[(j + 1) * FN + i], d = F[(j + 1) * FN + i + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const a = at(fA);
    return mix <= 0 ? a : a + (at(fB) - a) * mix;
  }
  /** Height of the top sheet over map point (u, v). */
  function heightAt(u, v) {
    let top = 0;
    for (const s of sheets) if (fieldAt(u, v, s.mix) >= LEVELS[s.k - 1]) top = s.k;
    if (!top) return 0.04;
    return sheets[top - 1].holder.position.y + 0.006;
  }

  function setBelief(newRows, animate = true) {
    // finish a running morph first: B becomes the shown field
    if (pending) { finishAll(); }
    fA = fB === fA ? fA : fB;
    texA.image.data.set(fA); texA.needsUpdate = true;
    fB = fieldOf(newRows);
    texB.image.data.set(fB); texB.needsUpdate = true;
    if (!animate) { fA = fB; texA.image.data.set(fA); texA.needsUpdate = true; for (const s of sheets) setMix(s, 0); listeners.forEach((f) => f()); return Promise.resolve(); }
    sheets.forEach((s, i) => { setMix(s, 0); s.anim = { t: -i * SHEET_GAP_S }; });
    return new Promise((resolve) => { pending = resolve; });
  }
  function setMix(s, m) { s.mix = m; s.own.uMix.value = m; }
  function finishAll() {
    for (const s of sheets) { s.anim = null; s.holder.position.y = LY0 + s.k * LH; s.holder.rotation.set(0, 0, 0); setMix(s, 1); }
    fA = fB; texA.image.data.set(fA); texA.needsUpdate = true;
    for (const s of sheets) setMix(s, 0);
    const r = pending; pending = null; r?.();
    listeners.forEach((f) => f());
  }

  const ringState = [0, 1, 2, 3].map(() => null);
  function ring(cell, color, dur = 1.4) {
    const i = ringState.findIndex((r) => r === null);
    const slot = i < 0 ? 0 : i;
    ringState[slot] = { x: cell[0] + 0.5, y: cell[1] + 0.5, t: 0, dur };
    shared.uRingColor.value[slot].set(color);
  }

  function update(dt, time) {
    shared.uTime.value = time;
    if (pending) {
      let running = false;
      for (const s of sheets) {
        if (!s.anim) continue;
        s.anim.t += dt;
        const k = Math.min(1, Math.max(0, s.anim.t / SHEET_S));
        if (k < 1) running = true;
        const lift = Math.sin(Math.PI * k);
        s.holder.position.y = LY0 + s.k * LH + lift * (0.22 + s.k * 0.015);
        s.holder.rotation.z = lift * 0.012 * (s.k % 2 ? 1 : -1);
        s.holder.rotation.x = lift * 0.008;
        setMix(s, smooth(Math.min(1, Math.max(0, (k - 0.25) / 0.5))));
      }
      if (!running) finishAll();
    }
    ringState.forEach((r, i) => {
      const u = shared.uRings.value[i];
      if (!r) { u.w = 0; return; }
      r.t += dt;
      const k = r.t / r.dur;
      u.set(r.x, r.y, 0.15 + k * 1.75, Math.max(0, 1 - k));
      if (k >= 1) ringState[i] = null;
    });
  }

  function setMarks(probes, rivalProbes) {
    for (let k = 0; k < 100; k++) cellData[k * 4 + 1] = 0;
    const put = (p, rival) => {
      if (p.kind !== "dive" || p.result === "box") return;
      const code = (rival ? 2 : 0) + (p.result === "debris" ? 2 : 1);
      cellData[(p.cell[1] * 10 + p.cell[0]) * 4 + 1] = Math.round((code / 4) * 255);
    };
    for (const p of rivalProbes || []) put(p, true);
    for (const p of probes || []) put(p, false);
    cells.needsUpdate = true;
  }

  /** The map cell under a ray: the highest sheet whose outline contains the hit, else the chart. */
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function pick(ray) {
    for (let i = sheets.length - 1; i >= -1; i--) {
      const y = i >= 0 ? sheets[i].holder.position.y : 0.04;
      plane.constant = -y;
      if (!ray.intersectPlane(plane, hit)) continue;
      const u = hit.x + 5, v = hit.z + 5;
      if (i >= 0 && fieldAt(u, v, sheets[i].mix) < LEVELS[i]) continue;
      if (u < 0 || v < 0 || u >= 10 || v >= 10) return null;
      return [Math.floor(u), Math.floor(v)];
    }
    return null;
  }

  const set = (u) => (cell) => (cell ? u.value.set(cell[0], cell[1]) : u.value.set(-9, -9));
  return {
    group, shared, update, setBelief, heightAt, setMarks, ring, pick,
    onChange: (fn) => listeners.push(fn),
    hover: set(shared.uHover), target: set(shared.uTarget),
    zone(cell, tool) { shared.uZone.value.set(cell ? cell[0] : 0, cell ? cell[1] : 0, !cell ? 0 : tool === "dive" ? 2 : 1); },
    rivalZone(cell, tool) { shared.uRivalZone.value.set(cell ? cell[0] : 0, cell ? cell[1] : 0, !cell ? 0 : tool === "dive" ? 2 : 1); },
    /** Coast-guard strip: axis "col" (x from..to) or "row" (y from..to), inclusive cell indices. */
    band(axis, from, to) { shared.uBand.value.set(axis ? from : 0, axis ? to + 1 : 0, !axis ? 0 : axis === "col" ? 1 : 2); },
  };
}
