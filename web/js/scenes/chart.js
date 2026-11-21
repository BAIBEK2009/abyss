// The nautical chart under the tracing paper (CLAUDE.md v3.1, 18), drawn once into a canvas:
// watercolour sea (turquoise shallows, blue deeps), isobaths with depth labels, soundings,
// sandy reef islets with a double shoreline, place names in serif italics, a compass rose,
// a latitude band on the frame, a scale bar, current arrows and pencil notes of a working chart.
// The chart is printed paper, so its words live in the texture; all interface text stays HTML.
import { chartLandmarks } from "../places.js";
import { getLang } from "../strings.js";

export const CH0 = -1.05, CHS = 12.1;        // chart sheet in map units: [-1.05, 11.05]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) ** 2 / (2 * sx * sx) + (y - cy) ** 2 / (2 * sy * sy)));

/** Sea depth 0..1 (shallow..deep) at map point (x, y): shallows around reefs and the base. */
export function depthAt(x, y, reefs) {
  let d = 0.5 + 0.2 * Math.sin(x * 0.55 + y * 0.25) + 0.14 * Math.sin(y * 0.7 - x * 0.3 + 1.3) + 0.1 * (fbm(x * 0.6, y * 0.6) - 0.5) * 2;
  d += 0.3 * g2(x, y, 6.6, 6.2, 2.4, 1.5) + 0.15 * g2(x, y, 2, 7.2, 1.6, 1.2);
  for (const [rx, ry] of reefs) d -= 0.6 * g2(x, y, rx + 0.5, ry + 0.5, 0.65, 0.65);
  d -= 0.5 * g2(x, y, 0.5, 9.5, 0.9, 0.9);
  return clamp(d, 0, 1);
}
export const metres = (d) => Math.round(2400 + d * 1300);

const TEXT = {
  ru: { title: "Северная Атлантика", sub: "район поиска рейса AQ-271 · глубины в метрах", sheet: "лист 7", miles: "20 морских миль",
        legend: "калька: нижний лист — 2 %, золотые — от 16 %", base: "База", north: "С",
        checked: "проверено 19.11 — пусто", seen: "«Посейдон» замечен 13:50", current: "течение 1,5 уз",
        signal: "последний сигнал 02:14", fuel: "заправка" },
  en: { title: "North Atlantic", sub: "search area of flight AQ-271 · depths in metres", sheet: "sheet 7", miles: "20 nautical miles",
        legend: "tracing paper: lowest sheet — 2 %, gold — from 16 %", base: "Base", north: "N",
        checked: "checked 19.11 — empty", seen: "Poseidon seen 13:50", current: "current 1.5 kn",
        signal: "last signal 02:14", fuel: "refuel" },
};

/** Draw the chart into a W x W canvas context. signal = [u, v] of the last signal. */
export function drawChart(g, W, { reefs, signal }) {
  const L = TEXT[getLang()] || TEXT.ru;
  const S = W / CHS;
  const px = (u) => (u - CH0) / CHS * W;
  const serif = (weight, size, italic = true) => `${italic ? "italic " : ""}${weight} ${size}px "Cormorant Garamond", Georgia, serif`;
  const depth = (x, y) => depthAt(x, y, reefs);

  // paper with fibres
  g.fillStyle = "#efe4c9"; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 30000; i++) {
    const x = hash(i, 1) * W, y = hash(i, 2) * W;
    g.fillStyle = `rgba(${hash(i, 3) < 0.5 ? "90,70,40" : "255,250,235"},${hash(i, 4) * 0.06})`;
    g.fillRect(x, y, 2, 2);
  }

  // watercolour sea: six washes with darker pooled edges, soft ragged border
  const N = 460, sea = document.createElement("canvas");
  sea.width = sea.height = N;
  const sg = sea.getContext("2d"), img = sg.createImageData(N, N);
  const C = [[214, 237, 230], [166, 213, 214], [114, 177, 198], [72, 139, 172], [44, 99, 142], [26, 66, 105]];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N * 10, y = j / N * 10, dd = depth(x, y) * 5.999, b = Math.floor(dd), f = dd - b;
    const c0 = C[b], c1 = C[Math.min(5, b + 1)], tt = clamp((f - 0.72) / 0.28, 0, 1);
    const edge = (f > 0.8 && f < 0.97) ? 0.88 : (f < 0.06 ? 0.93 : 1);
    const nn = 0.9 + 0.14 * fbm(x * 3.1, y * 3.1);
    const e = Math.min(x, 10 - x, y, 10 - y), a = clamp((e + (fbm(x * 2, y * 2) - 0.5) * 0.5) / 0.28, 0, 1);
    const k = (j * N + i) * 4;
    for (let q = 0; q < 3; q++) img.data[k + q] = clamp((c0[q] * (1 - tt) + c1[q] * tt) * edge * nn, 0, 255);
    img.data[k + 3] = a * 235;
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingQuality = "high";
  g.drawImage(sea, px(0), px(0), 10 * S, 10 * S);

  // isobaths by marching squares, with depth labels
  {
    const GN = 140, vals = new Float32Array((GN + 1) * (GN + 1)), sc = 10 / GN;
    for (let j = 0; j <= GN; j++) for (let i = 0; i <= GN; i++) vals[j * (GN + 1) + i] = depth(i * sc, j * sc);
    for (const th of [0.3, 0.48, 0.66, 0.82]) {
      g.beginPath();
      const labs = [];
      for (let j = 1; j < GN - 1; j++) for (let i = 1; i < GN - 1; i++) {
        const a = vals[j * (GN + 1) + i], b = vals[j * (GN + 1) + i + 1], c = vals[(j + 1) * (GN + 1) + i + 1], d = vals[(j + 1) * (GN + 1) + i];
        const id = (a > th ? 8 : 0) | (b > th ? 4 : 0) | (c > th ? 2 : 0) | (d > th ? 1 : 0);
        if (id === 0 || id === 15) continue;
        const x0 = i * sc, y0 = j * sc, f = (p, q) => (th - p) / (q - p);
        const T = [x0 + sc * f(a, b), y0], R = [x0 + sc, y0 + sc * f(b, c)], B = [x0 + sc * f(d, c), y0 + sc], Lf = [x0, y0 + sc * f(a, d)];
        const segs = { 1: [[Lf, B]], 2: [[B, R]], 3: [[Lf, R]], 4: [[T, R]], 5: [[Lf, T], [B, R]], 6: [[T, B]], 7: [[Lf, T]],
                       8: [[Lf, T]], 9: [[T, B]], 10: [[Lf, B], [T, R]], 11: [[T, R]], 12: [[Lf, R]], 13: [[B, R]], 14: [[Lf, B]] }[id];
        for (const [p, q] of segs) { g.moveTo(px(p[0]), px(p[1])); g.lineTo(px(q[0]), px(q[1])); }
        if ((i * 7 + j * 13) % 211 === 0 && labs.every(([lx, ly]) => Math.hypot(lx - x0, ly - y0) > 2.2)) labs.push([x0, y0]);
      }
      g.strokeStyle = "rgba(24,52,84,.34)"; g.lineWidth = 1.4; g.stroke();
      g.fillStyle = "rgba(24,52,84,.7)"; g.font = serif(700, S * 0.15); g.textAlign = "center";
      for (const [lx, ly] of labs.slice(0, 4)) g.fillText(String(Math.round((2400 + th * 1300) / 100) * 100), px(lx), px(ly) + S * 0.05);
    }
  }

  // current arrows in the western basin
  g.strokeStyle = g.fillStyle = "rgba(24,52,84,.4)"; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const x = 0.7 + (i % 3) * 0.85 + (Math.floor(i / 3) % 2) * 0.4, y = 5.9 + Math.floor(i / 3) * 0.75, a = -0.35;
    const x1 = x + Math.cos(a) * 0.45, y1 = y + Math.sin(a) * 0.45;
    g.beginPath(); g.moveTo(px(x), px(y)); g.quadraticCurveTo(px(x + 0.22), px(y + 0.06), px(x1), px(y1)); g.stroke();
    g.beginPath(); g.moveTo(px(x1), px(y1)); g.lineTo(px(x1 - 0.1), px(y1 - 0.02)); g.lineTo(px(x1 - 0.05), px(y1 + 0.08)); g.closePath(); g.fill();
  }

  // faint grid of the search square + frame, ticks and the alternating latitude band
  g.strokeStyle = "rgba(35,34,43,.07)"; g.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    g.beginPath(); g.moveTo(px(i), px(0)); g.lineTo(px(i), px(10)); g.stroke();
    g.beginPath(); g.moveTo(px(0), px(i)); g.lineTo(px(10), px(i)); g.stroke();
  }
  g.strokeStyle = "#2b2a33"; g.lineWidth = 3; g.strokeRect(px(-0.12), px(-0.12), 10.24 * S, 10.24 * S);
  g.lineWidth = 1.2; g.strokeRect(px(-0.24), px(-0.24), 10.48 * S, 10.48 * S);
  for (let i = 0; i <= 50; i++) {
    const len = i % 5 ? 6 : 12, a = px(i / 5);
    g.lineWidth = 1; g.beginPath();
    g.moveTo(a, px(-0.12)); g.lineTo(a, px(-0.12) - len); g.moveTo(a, px(10.12)); g.lineTo(a, px(10.12) + len);
    g.moveTo(px(-0.12), a); g.lineTo(px(-0.12) - len, a); g.moveTo(px(10.12), a); g.lineTo(px(10.12) + len, a);
    g.stroke();
  }
  g.fillStyle = "#23222b";
  for (let i = 0; i < 52; i += 2) {
    const a0 = -0.24 + i * 0.2, w = Math.min(0.2, 10.24 - (a0 + 0.24));
    g.fillRect(px(a0 + 0.12), px(-0.24), w * S, 0.12 * S); g.fillRect(px(a0 + 0.12), px(10.12), w * S, 0.12 * S);
    g.fillRect(px(-0.24), px(a0 + 0.12), 0.12 * S, w * S); g.fillRect(px(10.12), px(a0 + 0.12), 0.12 * S, w * S);
  }

  // reefs: sandy islets with a double shoreline (dashed surf + solid coast)
  for (const [rx, ry] of reefs) {
    const cx = px(rx + 0.5), cy = px(ry + 0.5);
    for (const [rad, dash, col] of [[0.5, [6, 6], "rgba(31,53,80,.45)"], [0.42, [], "rgba(31,53,80,.55)"]]) {
      g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      for (let a = 0; a <= 6.3; a += 0.2) {
        const r = (rad + (vnoise(rx * 3 + Math.cos(a) * 1.5, ry * 3 + Math.sin(a) * 1.5) - 0.5) * 0.14) * S;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9);
      }
      g.closePath(); g.stroke();
    }
    g.setLineDash([]); g.fillStyle = "#e6d1a1"; g.strokeStyle = "#2b2a33"; g.lineWidth = 2.2; g.beginPath();
    for (let a = 0; a <= 6.3; a += 0.2) {
      const r = (0.3 + (vnoise(rx * 5 + Math.cos(a) * 2, ry * 5 + Math.sin(a) * 2) - 0.5) * 0.14) * S;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85);
    }
    g.closePath(); g.fill(); g.stroke();
  }

  const names = chartLandmarks();
  // soundings, kept clear of reefs, names, the rose and the signal
  g.fillStyle = "rgba(31,53,80,.62)"; g.font = serif(600, S * 0.16); g.textAlign = "center";
  for (let i = 0; i < 70; i++) {
    const x = 0.3 + hash(i, 3) * 9.4, y = 0.3 + hash(i, 7) * 9.4;
    if (reefs.some(([a, b]) => Math.hypot(x - a - 0.5, y - b - 0.5) < 0.7)) continue;
    if (names.some((n) => Math.abs(x - n.label[0]) < n.name.length * 0.07 + 0.3 && Math.abs(y - n.label[1] + 0.08) < 0.3)) continue;
    if (Math.hypot(x - 9.35, y - 0.85) < 0.8 || Math.hypot(x - signal[0], y - signal[1]) < 0.9) continue;
    g.fillText(String(metres(depth(x, y))), px(x), px(y));
  }
  // place names (the same words the interface uses)
  for (const n of names) {
    const [x, y, rot, sz] = n.label;
    g.save(); g.translate(px(x), px(y)); g.rotate(rot);
    g.fillStyle = n.area ? "rgba(31,53,80,.55)" : "#23222b";
    g.font = serif(700, S * sz); g.textAlign = "center";
    g.fillText(n.name, 0, 0);
    g.restore();
  }
  // base anchor
  const bx = px(0.5), by = px(9.5);
  g.strokeStyle = "#23222b"; g.lineWidth = 3; g.beginPath();
  g.arc(bx, by - S * 0.12, S * 0.05, 0, 7); g.moveTo(bx, by - S * 0.07); g.lineTo(bx, by + S * 0.18);
  g.moveTo(bx - S * 0.1, by - S * 0.02); g.lineTo(bx + S * 0.1, by - S * 0.02);
  g.moveTo(bx - S * 0.14, by + S * 0.08); g.quadraticCurveTo(bx, by + S * 0.26, bx + S * 0.14, by + S * 0.08); g.stroke();
  g.fillStyle = "#23222b"; g.font = serif(700, S * 0.25); g.textAlign = "left"; g.fillText(L.base, px(0.85), px(9.62));

  // compass rose
  {
    const rr = S * 0.5;
    g.save(); g.translate(px(9.35), px(0.85));
    g.strokeStyle = "rgba(35,34,43,.7)"; g.lineWidth = 1.2;
    g.beginPath(); g.arc(0, 0, rr, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, rr * 0.82, 0, 7); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, len = i % 2 ? rr * 0.55 : rr * 0.95;
      g.fillStyle = i % 2 ? "rgba(35,34,43,.5)" : (i === 6 ? "#a8392a" : "#23222b");
      g.beginPath(); g.moveTo(Math.cos(a) * len, Math.sin(a) * len);
      g.lineTo(Math.cos(a + 0.35) * rr * 0.14, Math.sin(a + 0.35) * rr * 0.14);
      g.lineTo(Math.cos(a - 0.35) * rr * 0.14, Math.sin(a - 0.35) * rr * 0.14); g.fill();
    }
    g.fillStyle = "#a8392a"; g.font = serif(700, S * 0.2, false); g.textAlign = "center"; g.fillText(L.north, 0, -rr - 6);
    g.restore();
  }

  // pencil notes of a working chart
  const note = (text, x, y, rot = 0, sz = 0.2) => {
    g.save(); g.translate(px(x), px(y)); g.rotate(rot);
    g.fillStyle = "rgba(66,60,72,.88)"; g.font = serif(600, S * sz); g.textAlign = "left"; g.fillText(text, 0, 0);
    g.restore();
  };
  note(L.checked, 0.35, 0.28, -0.04, 0.18);
  g.strokeStyle = "rgba(66,60,72,.8)"; g.lineWidth = 2.5;
  for (const [x, y] of [[0.5, 0.55], [0.95, 0.68], [1.4, 0.52]]) {
    g.beginPath(); g.moveTo(px(x - 0.08), px(y - 0.08)); g.lineTo(px(x + 0.08), px(y + 0.08));
    g.moveTo(px(x + 0.08), px(y - 0.08)); g.lineTo(px(x - 0.08), px(y + 0.08)); g.stroke();
  }
  note(L.seen, 7.95, 2.35, 0.04, 0.17);
  note(L.current, 0.62, 5.62, -0.05, 0.19);
  note(L.signal, signal[0] + 0.42, signal[1] - 0.12, 0, 0.16);
  note(L.fuel, 0.95, 9.88, 0, 0.17);

  // coffee ring on the margin
  g.strokeStyle = "rgba(120,78,40,.16)"; g.lineWidth = S * 0.06;
  g.beginPath(); g.arc(px(10.35), px(-0.55), S * 0.45, 0.4, 5.6); g.stroke();
  g.strokeStyle = "rgba(120,78,40,.08)"; g.lineWidth = S * 0.02;
  g.beginPath(); g.arc(px(10.35), px(-0.55), S * 0.52, 0.9, 4.7); g.stroke();

  // margins: title, scale bar, legend
  g.fillStyle = "#23222b"; g.textAlign = "left"; g.font = serif(700, S * 0.36); g.fillText(L.title, px(-0.2), px(-0.5));
  g.font = serif(500, S * 0.22); g.fillText(L.sub, px(3.55), px(-0.5));
  g.textAlign = "right"; g.fillText(L.sheet, px(10.2), px(-0.5));
  const y0 = px(10.62);
  g.textAlign = "left"; g.fillText("0", px(0) - 4, y0 + S * 0.22);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? "#efe4c9" : "#23222b"; g.fillRect(px(i * 0.5), y0, 0.5 * S, S * 0.06); }
  g.strokeStyle = "#23222b"; g.lineWidth = 1; g.strokeRect(px(0), y0, 2 * S, S * 0.06);
  g.fillStyle = "#23222b"; g.fillText(L.miles, px(2.1), y0 + S * 0.07);
  g.textAlign = "right"; g.fillText(L.legend, px(10.2), y0 + S * 0.22);
}
