// Materials with procedural maps (CLAUDE.md v3.1, 21.1 p. 3): walnut with albedo + normal + roughness
// and fine scratches, worn brass (MeshPhysicalMaterial, metalness 1, roughness map), glass with
// transmission and clearcoat, paper fibres as a normal map, soft contact-shadow blobs.
// Everything is drawn in canvases at start-up: no texture files, works offline.
import * as THREE from "three";
import { rng } from "../view.js";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Height canvas (grey, 0..255) -> tangent-space normal map. */
function normalFromHeight(hc, strength = 2) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext("2d").getImageData(0, 0, w, h).data;
  const out = canvas(w, h), og = out.getContext("2d"), img = og.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const k = (y * w + x) * 4;
    img.data[k] = (-dx / len * 0.5 + 0.5) * 255;
    img.data[k + 1] = (dy / len * 0.5 + 0.5) * 255;
    img.data[k + 2] = (1 / len * 0.5 + 0.5) * 255;
    img.data[k + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

function tex(c, srgb, repeat) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** Walnut planks: albedo, normal and roughness from one set of strokes (grain, knots, scratches). */
export function walnut(repeat = [3, 2]) {
  const S = 1024, r = rng(7), planks = 8;
  const alb = canvas(S, S), ag = alb.getContext("2d");
  const hgt = canvas(S, S), hg = hgt.getContext("2d");
  const rough = canvas(S, S), rg = rough.getContext("2d");
  hg.fillStyle = "#808080"; hg.fillRect(0, 0, S, S);
  rg.fillStyle = "rgb(150,150,150)"; rg.fillRect(0, 0, S, S);           // ~0.6 roughness, lacquered
  for (let p = 0; p < planks; p++) {
    const tone = 0.85 + r() * 0.3;
    ag.fillStyle = `rgb(${Math.round(84 * tone)},${Math.round(53 * tone)},${Math.round(33 * tone)})`;
    ag.fillRect(0, (p * S) / planks, S, S / planks);
  }
  for (let i = 0; i < 900; i++) {                                         // grain lines
    const y0 = r() * S, amp = 0.5 + r() * 2, f = 0.004 + r() * 0.02, dark = r() < 0.65, lw = 0.4 + r() * 0.9;
    const path = (g) => {
      g.beginPath();
      for (let x = 0; x <= S; x += 6) {
        const y = y0 + Math.sin(x * f + i) * amp + Math.sin(x * f * 4.3 + i * 1.7) * amp * 0.25;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
    };
    ag.strokeStyle = dark ? `rgba(34,18,8,${0.10 + r() * 0.22})` : `rgba(170,120,78,${0.05 + r() * 0.12})`;
    ag.lineWidth = lw; path(ag); ag.stroke();
    if (dark) { hg.strokeStyle = `rgba(40,40,40,${0.25 + r() * 0.3})`; hg.lineWidth = lw * 1.4; path(hg); hg.stroke(); }
  }
  for (let i = 0; i < 9; i++) {                                           // knots
    const x = r() * S, y = r() * S;
    for (let k = 6; k > 0; k--) {
      ag.strokeStyle = `rgba(35,18,8,${0.06 + 0.035 * k})`; ag.lineWidth = 1;
      ag.beginPath(); ag.ellipse(x, y, 3 + k * 4, 1 + k * 1.4, 0, 0, Math.PI * 2); ag.stroke();
      hg.strokeStyle = `rgba(60,60,60,${0.1 + 0.03 * k})`; hg.lineWidth = 1.2;
      hg.beginPath(); hg.ellipse(x, y, 3 + k * 4, 1 + k * 1.4, 0, 0, Math.PI * 2); hg.stroke();
    }
  }
  for (let p = 1; p < planks; p++) {                                      // plank seams
    const y = (p * S) / planks;
    ag.fillStyle = "rgba(14,7,2,0.85)"; ag.fillRect(0, y - 1, S, 2);
    hg.fillStyle = "#202020"; hg.fillRect(0, y - 1.5, S, 3);
    rg.fillStyle = "rgb(220,220,220)"; rg.fillRect(0, y - 1.5, S, 3);
  }
  for (let i = 0; i < 160; i++) {                                         // fine scratches: matt, slightly sunk
    const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.5 + (r() < 0.5 ? 0 : Math.PI), len = 20 + r() * 110;
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    rg.strokeStyle = `rgba(235,235,235,${0.3 + r() * 0.4})`; rg.lineWidth = 0.8;
    rg.beginPath(); rg.moveTo(x, y); rg.lineTo(x1, y1); rg.stroke();
    hg.strokeStyle = "rgba(70,70,70,0.5)"; hg.lineWidth = 0.7;
    hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x1, y1); hg.stroke();
    ag.strokeStyle = "rgba(190,150,110,0.10)"; ag.lineWidth = 0.7;
    ag.beginPath(); ag.moveTo(x, y); ag.lineTo(x1, y1); ag.stroke();
  }
  return new THREE.MeshStandardMaterial({
    map: tex(alb, true, repeat), normalMap: tex(normalFromHeight(hgt, 3), false, repeat), normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: tex(rough, false, repeat), roughness: 1, metalness: 0,
  });
}

let brassRough = null;
/** Worn brass: metalness 1, a roughness map with rubbed-bright spots and darker grime. */
export function brass(color = 0xc39447) {
  if (!brassRough) {
    const S = 256, c = canvas(S, S), g = c.getContext("2d"), r = rng(19);
    g.fillStyle = "rgb(90,90,90)"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = r() * S, y = r() * S, rad = 4 + r() * 26, v = r() < 0.5 ? 40 : 160;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${v},${v},${v},${0.25 + r() * 0.3})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    brassRough = tex(c, false, [2, 2]);
  }
  return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.55, roughnessMap: brassRough, clearcoat: 0.2, clearcoatRoughness: 0.4 });
}

/** Glass of a lens or a dial: transmissive, a little clear coat. */
export function glass() {
  return new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.08, ior: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 1 });
}

let fibres = null;
/** Normal map of paper fibres (tiled). */
export function paperFibres(repeat = [6, 6]) {
  if (!fibres) {
    const S = 512, c = canvas(S, S), g = c.getContext("2d"), r = rng(23);
    g.fillStyle = "#808080"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI, len = 4 + r() * 22, v = r() < 0.5 ? 100 : 160;
      g.strokeStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.35})`; g.lineWidth = 0.6 + r() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    fibres = normalFromHeight(c, 1.6);
  }
  return tex(fibres, false, repeat);
}

let blob = null;
/** Soft round shadow texture for contact shadows under ships and pins. */
export function blobTexture() {
  if (!blob) {
    const S = 128, c = canvas(S, S), g = c.getContext("2d");
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(0.45, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    blob = new THREE.CanvasTexture(c);
  }
  return blob;
}

/** A flat contact-shadow quad (w x d) lying just above the surface under an object. */
export function contactShadow(w, d, opacity = 0.7) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, depthWrite: false, opacity, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}
