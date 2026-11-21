// The cockpit of "Nerpa-2" around the porthole (CLAUDE.md v3.1, 19 p. 4-5): a porthole with a brass
// ring, bolts and condensation; a nixie depth gauge, the oxygen dial, the heading tape, the green
// sonar screen, the pinger LED, a help card, "Surface (Q)", messages and the "hold E" prompt.
// On touch screens the same actions are on-screen buttons.
import { el } from "./fmt.js";
import { t } from "../i18n.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function o2Dial(sec, max) {
  const R0 = 46, cx = 60, cy = 60, a0 = -225, span = 270, frac = clamp(sec / max, 0, 1);
  let ticks = "";
  for (let i = 0; i <= 12; i++) {
    const a = ((a0 + (span * i) / 12) * Math.PI) / 180, big = i % 3 === 0;
    ticks += `<line x1="${cx + Math.cos(a) * (R0 - 2)}" y1="${cy + Math.sin(a) * (R0 - 2)}" x2="${cx + Math.cos(a) * (R0 - (big ? 9 : 5))}" y2="${cy + Math.sin(a) * (R0 - (big ? 9 : 5))}" stroke="#d9e6e9" stroke-width="${big ? 1.8 : 1}"/>`;
  }
  const arc = (f0, f1, col, w) => {
    const s = ((a0 + span * f0) * Math.PI) / 180, e = ((a0 + span * f1) * Math.PI) / 180, r = R0 - 4;
    return `<path d="M${cx + Math.cos(s) * r} ${cy + Math.sin(s) * r}A${r} ${r} 0 ${(f1 - f0) * span > 180 ? 1 : 0} 1 ${cx + Math.cos(e) * r} ${cy + Math.sin(e) * r}" stroke="${col}" stroke-width="${w}" fill="none"/>`;
  };
  const ang = ((a0 + span * frac) * Math.PI) / 180, low = sec < 12;
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="o2b" cx="35%" cy="30%"><stop offset="0" stop-color="#9aa3a8"/><stop offset=".6" stop-color="#3a4044"/><stop offset="1" stop-color="#15181a"/></radialGradient></defs>
    <circle cx="60" cy="60" r="58" fill="url(#o2b)"/><circle cx="60" cy="60" r="51" fill="#0b1012"/>${arc(0, 0.2, "#c2412d", 5)}${frac > 0.001 ? arc(0, frac, low ? "#ff6a4a" : "#7fe0a6", 2.5) : ""}${ticks}
    <text x="60" y="44" text-anchor="middle" font-family="PT Mono" font-size="10" fill="#aab4b8">O₂</text>
    <text x="60" y="88" text-anchor="middle" font-family="PT Mono" font-size="17" fill="${low ? "#ff8a6a" : "#e7f6f9"}">0:${String(Math.max(0, Math.ceil(sec))).padStart(2, "0")}</text>
    <path d="M${cx - Math.cos(ang) * 8} ${cy - Math.sin(ang) * 8}L${cx + Math.cos(ang) * (R0 - 8)} ${cy + Math.sin(ang) * (R0 - 8)}" stroke="#ffb35c" stroke-width="2.6" stroke-linecap="round"/><circle cx="60" cy="60" r="4.5" fill="#9aa3a8"/></svg>`;
}

export function createCockpit(root, handlers) {
  const ck = el("div", "cockpit");
  ck.innerHTML = `
    <div class="ck-panel"></div><div class="ck-ring"></div><div class="ck-glass"></div><canvas class="ck-drops"></canvas>
    <div class="ck-hdg"><div class="ck-tape"></div><i></i></div>
    <div class="ck-col l">
      <div class="ck-lbl">${t("ck_depth")}</div><div class="ck-nixie">0000</div>
      <div class="ck-led"><i></i>${t("ck_pinger")}</div>
      <div class="ck-lbl ck-hint">${t("ck_pinger_hint")}</div>
    </div>
    <div class="ck-col r">
      <div class="ck-o2"></div>
      <canvas class="ck-scope" width="400" height="400"></canvas>
      <div class="ck-lbl">${t("ck_sonar")}</div>
    </div>
    <button class="ck-surf" data-id="surface">${t("ck_surface")} <b>Q</b></button>
    <div class="ck-plate">${t("ck_plate")}</div>
    <div class="ck-msg"></div>
    <div class="ck-prompt"><span class="pr"></span><b>${t("ck_grab")}</b></div>
    <div class="ck-help"><h5>${t("ck_help_title")}</h5>
      <div><b>W</b><b>S</b> ${t("ck_help_ws")}</div><div><b>A</b><b>D</b> ${t("ck_help_ad")}</div>
      <div><b>${t("ck_mouse")}</b> ${t("ck_help_mouse")}</div><div><b>${t("ck_space")}</b> ${t("ck_help_space")}</div>
      <div><b>E</b> ${t("ck_help_e")}</div><div><b>Q</b> ${t("ck_help_q")}</div>
      <div class="ck-help-note">${t("ck_help_note")}</div></div>
    <div class="ck-touch">
      <button data-k="l" aria-label="${t("ck_left")}">◀</button><button data-k="f" aria-label="${t("ck_fwd")}">▲</button><button data-k="r" aria-label="${t("ck_right")}">▶</button>
      <button data-k="sp">${t("ck_sonar_btn")}</button><button data-k="b" aria-label="${t("ck_back")}">▼</button><button data-k="e">${t("ck_grab_btn")}</button>
    </div>`;
  root.append(ck);
  const $ = (s) => ck.querySelector(s);
  const scope = $(".ck-scope"), sg = scope.getContext("2d");
  let R = 300, CY = 0.46, msgId = 0;
  $(".ck-surf").addEventListener("click", () => handlers.onSurface());
  ck.querySelectorAll(".ck-touch button").forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); handlers.onKey(k, true); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => handlers.onKey(k, false));
  });

  function layout() {
    const narrow = innerWidth < 1100 || innerWidth / innerHeight < 1.3;
    ck.classList.toggle("narrow", narrow);
    CY = narrow ? 0.4 : 0.46;
    R = Math.round(narrow ? Math.min(innerHeight * 0.31, innerWidth * 0.43) : Math.min(innerHeight * 0.4, innerWidth * 0.25));
    const cy = innerHeight * CY, cx = innerWidth / 2;
    ck.style.setProperty("--R", `${R}px`);
    const mask = `radial-gradient(circle ${R}px at 50% ${CY * 100}%, transparent ${R - 1}px, #000 ${R}px)`;
    $(".ck-panel").style.webkitMaskImage = mask; $(".ck-panel").style.maskImage = mask;
    for (const s of [".ck-ring", ".ck-glass", ".ck-drops"]) Object.assign($(s).style, { left: `${cx - R}px`, top: `${cy - R}px`, width: `${2 * R}px`, height: `${2 * R}px` });
    $(".ck-hdg").style.top = `${Math.max(10, cy - R - 62)}px`;
    $(".ck-plate").style.top = `${Math.min(innerHeight - 40, cy + R + 92)}px`;
    $(".ck-surf").style.top = `${cy + R + 34}px`;
    $(".ck-msg").style.top = `${cy + R * 0.55}px`;
    $(".ck-prompt").style.top = `${cy + R * 0.3}px`;
    ck.querySelectorAll(".ck-bolt, .ck-rivet").forEach((e) => e.remove());
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, b = el("div", "ck-bolt");
      Object.assign(b.style, { left: `${cx + Math.cos(a) * (R + 16)}px`, top: `${cy + Math.sin(a) * (R + 16)}px` });
      ck.append(b);
    }
    for (let i = 0; i < 14; i++) for (const y of [18, innerHeight - 18]) {
      const r = el("div", "ck-rivet");
      Object.assign(r.style, { left: `${(innerWidth * (i + 0.5)) / 14}px`, top: `${y}px` });
      ck.append(r);
    }
    const dc = $(".ck-drops"); dc.width = dc.height = 2 * R;
    const g = dc.getContext("2d");
    for (let i = 0; i < 70; i++) {                         // condensation droplets near the rim
      const a = Math.random() * Math.PI * 2, r = R * (0.72 + Math.random() * 0.27), x = R + Math.cos(a) * r, y = R + Math.sin(a) * r, s = 2 + Math.random() * 6;
      const gr = g.createRadialGradient(x - s * 0.3, y - s * 0.3, 0, x, y, s);
      gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(0.6, "rgba(180,220,230,.12)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    const dirs = { 0: t("ck_n"), 90: t("ck_e"), 180: t("ck_s"), 270: t("ck_w") };
    let tp = "";
    for (let k = -2; k < 26; k++) { const d = (((k * 15) % 360) + 360) % 360; tp += `<span>${dirs[d] ?? d}</span>`; }
    $(".ck-tape").innerHTML = tp;
  }
  addEventListener("resize", () => { if (ck.classList.contains("on")) layout(); });

  let blips = [], scopeT = -9;
  return {
    el: ck,
    get centreY() { return CY; },
    get radius() { return R; },
    show() { layout(); ck.classList.add("on"); $(".ck-help").style.opacity = 1; },
    hide() { ck.classList.remove("on", "live", "low"); },
    live(on) { ck.classList.toggle("live", on); },
    hideHelp() { $(".ck-help").style.opacity = 0; },
    msg(text, ms = 3200) {
      const m = $(".ck-msg"); m.textContent = text; m.classList.add("on");
      const id = ++msgId; setTimeout(() => { if (id === msgId) m.classList.remove("on"); }, ms);
    },
    set({ o2, max, depth, heading, fog, low }) {
      if (o2 !== undefined) $(".ck-o2").innerHTML = o2Dial(o2, max);
      if (depth !== undefined) $(".ck-nixie").textContent = String(Math.max(0, Math.round(depth))).padStart(4, "0");
      if (heading !== undefined) $(".ck-tape").style.transform = `translateX(${160 - ((((-heading * 180) / Math.PI) % 360 + 360) % 360 + 30) / 15 * 40 - 20}px)`;
      if (fog !== undefined) $(".ck-glass").style.setProperty("--fog", fog.toFixed(2));
      if (low !== undefined) ck.classList.toggle("low", low);
    },
    pinger(vol) {
      const led = $(".ck-led i");
      led.style.background = `rgba(255,${80 + vol * 60},40,${0.3 + vol * 0.7})`;
      led.style.boxShadow = `0 0 ${6 + vol * 14}px rgba(255,90,40,${vol})`;
      setTimeout(() => { led.style.background = ""; led.style.boxShadow = ""; }, 140);
    },
    prompt(on, p = 0) { const pr = $(".ck-prompt"); pr.classList.toggle("on", on); pr.style.setProperty("--p", p.toFixed(3)); },
    /** A sonar ping: blips = [{rel (radians, + = left), r (0..1), s (size)}], drawn as the sweep passes. */
    ping(b, now) { blips = b; scopeT = now; },
    drawScope(now) {
      const W = scope.width, c = W / 2, Rr = W / 2 - 10, g = sg;
      g.fillStyle = "rgba(2,14,6,.35)"; g.fillRect(0, 0, W, W);
      g.strokeStyle = "rgba(110,255,150,.18)"; g.lineWidth = 2;
      for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(c, c, Rr * r, 0, 7); g.stroke(); }
      g.beginPath(); g.moveTo(c, c - Rr); g.lineTo(c, c + Rr); g.moveTo(c - Rr, c); g.lineTo(c + Rr, c); g.stroke();
      const age = now - scopeT;
      if (age < 1.2) {
        const a = -Math.PI / 2 + (age / 1.2) * Math.PI * 2;
        g.strokeStyle = "rgba(140,255,170,.75)"; g.lineWidth = 4;
        g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * Rr, c + Math.sin(a) * Rr); g.stroke();
      }
      for (const b of blips) {
        const sweepA = ((-b.rel + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
        if (age <= sweepA * 1.2) continue;
        const life = clamp(1 - (age - sweepA * 1.2) / 5, 0, 1);
        if (life <= 0) continue;
        const x = c - Math.sin(b.rel) * b.r * Rr, y = c - Math.cos(b.rel) * b.r * Rr;
        g.fillStyle = `rgba(150,255,180,${life * b.s})`; g.beginPath(); g.arc(x, y, b.s > 0.9 ? 9 : 6, 0, 7); g.fill();
      }
      g.fillStyle = "#ffb35c"; g.beginPath(); g.moveTo(c, c - 9); g.lineTo(c - 6, c + 6); g.lineTo(c + 6, c + 6); g.fill();
    },
  };
}
