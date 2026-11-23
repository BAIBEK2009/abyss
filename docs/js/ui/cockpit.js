// The cockpit of "Nerpa-2" around the porthole (CLAUDE.md v3.1, 19 p. 4-5): a porthole with a brass
// ring, bolts and condensation; a nixie depth gauge, the oxygen dial, the heading tape, the green
// sonar screen, the pinger LED, a help card, "Surface (Q)", messages and the "hold E" prompt.
// On touch screens the same actions are on-screen buttons.
import { el } from "./fmt.js";
import { t } from "../i18n.js";
import { CHECK } from "./goal.js";
import { sfx } from "../audio.js";

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

// The beacon direction finder (22.3 p. 1): a brass dial, the bow at the top, a needle that points to the beacon
// relative to the nose of the bathyscaphe; the pinger LED on the bezel. Below it: the signal bars and the range.
function finderDial() {
  let ticks = "";
  for (let i = 0; i < 24; i++) {
    const a = (i * 15 - 90) * Math.PI / 180, big = i % 6 === 0, r0 = 62, r1 = big ? 52 : 57;
    ticks += `<line x1="${80 + Math.cos(a) * r0}" y1="${80 + Math.sin(a) * r0}" x2="${80 + Math.cos(a) * r1}" y2="${80 + Math.sin(a) * r1}" stroke="#d9cfa8" stroke-width="${big ? 2.2 : 1}" opacity="${big ? 0.95 : 0.6}"/>`;
  }
  return `<svg viewBox="0 0 160 160" aria-hidden="true"><defs>
      <radialGradient id="fdb" cx="34%" cy="28%"><stop offset="0" stop-color="#f6dc9a"/><stop offset=".45" stop-color="#b8893b"/><stop offset=".85" stop-color="#5e4116"/><stop offset="1" stop-color="#2a1c08"/></radialGradient>
      <radialGradient id="fdf" cx="50%" cy="40%"><stop offset="0" stop-color="#14201c"/><stop offset="1" stop-color="#050908"/></radialGradient>
      <radialGradient id="fdg" cx="38%" cy="26%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="80" cy="80" r="79" fill="url(#fdb)"/><circle cx="80" cy="80" r="71" fill="none" stroke="#3b2a10" stroke-width="2"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => { const a = (i * 60 + 30) * Math.PI / 180; return `<circle cx="${80 + Math.cos(a) * 75}" cy="${80 + Math.sin(a) * 75}" r="2.2" fill="#3b2a10"/><circle cx="${80 + Math.cos(a) * 75 - 0.6}" cy="${80 + Math.sin(a) * 75 - 0.6}" r="1" fill="#f0d898"/>`; }).join("")}
    <circle cx="80" cy="80" r="68" fill="url(#fdf)"/>${ticks}
    <path d="M80 13l-6 10h12z" fill="#ffb35c"/>
    <text x="80" y="36" text-anchor="middle" font-family="PT Mono" font-size="8" fill="#d9cfa8">${t("ck_finder_bow")}</text>
    <path d="M80 66c5 0 7 5 7 12v14c0 3-3 5-7 5s-7-2-7-5V78c0-7 2-12 7-12z" fill="none" stroke="#6f8f86" stroke-width="1.4" opacity=".7"/>
    <g class="ck-needle"><path d="M80 18 L85.5 80 L80 92 L74.5 80Z" fill="#ff6a3a"/><path d="M80 18 L85.5 80 L80 80Z" fill="#ffb07a"/>
      <path d="M80 92 L83 112 L77 112Z" fill="#8a9aa0"/></g>
    <circle cx="80" cy="80" r="6" fill="url(#fdb)" stroke="#2a1c08"/>
    <circle class="ck-fd-led" cx="122" cy="34" r="5" fill="#3a1010" stroke="#2a1c08"/>
    <circle cx="80" cy="80" r="68" fill="url(#fdg)"/></svg>`;
}

export function createCockpit(root, handlers) {
  const ck = el("div", "cockpit");
  ck.innerHTML = `
    <div class="ck-panel"></div><div class="ck-ring"></div><div class="ck-glass"></div><canvas class="ck-drops"></canvas>
    <div class="ck-hdg"><div class="ck-tape"></div><i></i></div>
    <div class="ck-col l">
      <div class="ck-lbl">${t("ck_depth")}</div><div class="ck-nixie">0000</div>
      <div class="ck-finder" data-id="finder">${finderDial()}
        <div class="ck-fd-read"><span class="ck-bars"><i></i><i></i><i></i><i></i><i></i></span><b class="ck-fd-dist">${t("ck_finder_none")}</b></div>
        <div class="ck-lbl">${t("ck_finder")}</div></div>
    </div>
    <div class="ck-col r">
      <div class="ck-o2"></div>
      <canvas class="ck-scope" width="400" height="400"></canvas>
      <div class="ck-lbl">${t("ck_sonar")}</div>
    </div>
    <button class="ck-surf" data-id="surface">${t("ck_surface")} <b>Q</b></button>
    <div class="ck-plate">${t("ck_plate")}</div>
    <div class="ck-tasks"><div class="ck-tasks-h">${t("dv_tasks")}</div><ul class="goal-tasks"></ul></div>
    <div class="ck-msg"></div>
    <div class="ck-prompt"><span class="pr"></span><b>${t("ck_grab")}</b></div>
    <div class="ck-help"><h5>${t("ck_help_title")}</h5>
      <p>${t("ck_help_finder")}</p><p>${t("ck_help_trail")}</p><p>${t("ck_help_map")}</p>
      <div class="ck-keys"><div><b>W</b><b>S</b> ${t("ck_help_ws")}</div><div><b>A</b><b>D</b> ${t("ck_help_ad")}</div>
      <div><b>${t("ck_mouse")}</b> ${t("ck_help_mouse")}</div><div><b>${t("ck_space")}</b> ${t("ck_help_space")}</div>
      <div><b>E</b> ${t("ck_help_e")}</div><div><b>Q</b> ${t("ck_help_q")}</div></div></div>
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
  // while the help card is up, the right column (O2, the sonar map) steps down below it if they would overlap
  let helpUp = false;
  function fitHelp() {
    const col = $(".ck-col.r"), help = $(".ck-help");
    if (!helpUp || getComputedStyle(help).display === "none") { col.style.marginTop = "0px"; return; }
    const shift = parseFloat(getComputedStyle(col).marginTop) || 0, h = help.getBoundingClientRect(), c = col.getBoundingClientRect();
    const top = c.top - shift, bottom = c.bottom - shift;
    col.style.marginTop = `${Math.max(0, Math.min(h.bottom + 12 - top, innerHeight - 14 - bottom))}px`;
  }
  new ResizeObserver(fitHelp).observe($(".ck-help"));

  let ping = { x: 0, z: 0, t: -9 };
  // the needle: a spring towards the bearing (deg, + = right of the bow), with overshoot
  const fd = { a: 0, v: 0, want: 0, on: false };
  const needle = $(".ck-needle"), led = $(".ck-fd-led"), bars = [...ck.querySelectorAll(".ck-bars i")], dist = $(".ck-fd-dist");
  return {
    el: ck,
    get centreY() { return CY; },
    get radius() { return R; },
    /** Where the finder's needle points now (deg from the bow, + = right). */
    get bearing() { return Math.round((((fd.a % 360) + 540) % 360) - 180); },
    show() {
      layout(); ck.classList.add("on"); $(".ck-help").style.opacity = 1; helpUp = true;
      fitHelp();
    },
    hide() { ck.classList.remove("on", "live", "low"); },
    live(on) { ck.classList.toggle("live", on); },
    hideHelp() { $(".ck-help").style.opacity = 0; helpUp = false; fitHelp(); },
    /** A subtitle for ms; returns its id (a newer one replaces it). */
    msg(text, ms = 3200) {
      const m = $(".ck-msg"); m.textContent = text; m.classList.add("on");
      const id = ++msgId; setTimeout(() => { if (id === msgId) m.classList.remove("on"); }, ms);
      return id;
    },
    /** Take the subtitle down now, if it is still this one. */
    clearMsg(id) { if (id === msgId) $(".ck-msg").classList.remove("on"); },
    set({ o2, max, depth, heading, fog, low }) {
      if (o2 !== undefined) $(".ck-o2").innerHTML = o2Dial(o2, max);
      if (depth !== undefined) $(".ck-nixie").textContent = String(Math.max(0, Math.round(depth))).padStart(4, "0");
      if (heading !== undefined) $(".ck-tape").style.transform = `translateX(${160 - ((((-heading * 180) / Math.PI) % 360 + 360) % 360 + 30) / 15 * 40 - 20}px)`;
      if (fog !== undefined) $(".ck-glass").style.setProperty("--fog", fog.toFixed(2));
      if (low !== undefined) ck.classList.toggle("low", low);
    },
    /** The pinger LED on the finder's bezel: one flash per ping, brighter when the signal is strong. */
    pinger(vol) {
      led.setAttribute("fill", `rgb(255,${90 + vol * 80},${40 + vol * 30})`);
      led.style.filter = `drop-shadow(0 0 ${3 + vol * 7}px rgba(255,90,40,${0.4 + vol * 0.6}))`;
      setTimeout(() => { led.setAttribute("fill", "#3a1010"); led.style.filter = ""; }, 150);
    },
    /** The finder's reading: bearing (deg from the bow, + = right) or null without a signal; bars 0..5; range text. */
    finder({ bearing, bars: n, range }) {
      this.aim(bearing);
      bars.forEach((b, i) => b.classList.toggle("on", i < n));
      dist.textContent = range;
      ck.querySelector(".ck-finder").classList.toggle("dead", !fd.on);
    },
    /** Every frame: where the needle should point (the bow turns, the needle follows at once). */
    aim(bearing) {
      fd.on = bearing !== null && bearing !== undefined;
      if (fd.on) fd.want = fd.a + ((((bearing - fd.a) % 360) + 540) % 360) - 180;    // the shortest way round
    },
    stepFinder(dt, now) {
      if (!fd.on) fd.want = Math.sin(now * 0.31) * 70 + Math.sin(now * 0.83) * 25;     // no signal: the needle hunts
      fd.v += ((fd.want - fd.a) * 38 - fd.v * 7.5) * Math.min(dt, 0.05);
      fd.a += fd.v * Math.min(dt, 0.05);
      needle.setAttribute("transform", `rotate(${fd.a.toFixed(2)} 80 80)`);
    },
    /** The dive's own checklist (22.3 p. 2): keys of i18n lines; [] hides it. */
    tasks(keys) {
      const box = $(".ck-tasks"); box.hidden = !keys.length;
      box.querySelector("ul").replaceChildren(...keys.map((k) => el("li", "", `${CHECK}<span>${t(k)}</span>`)));
    },
    tick(i) {
      const li = $(".ck-tasks ul").children[i];
      if (!li || li.classList.contains("done")) return;
      li.classList.add("done", "just"); sfx.tick?.();
      setTimeout(() => li.classList.remove("just"), 1400);
    },
    /** A short pulse round the finder (Dana points at it). */
    pulseFinder() { const f = ck.querySelector(".ck-finder"); f.classList.remove("pulse"); void f.offsetWidth; f.classList.add("pulse"); },
    prompt(on, p = 0) { const pr = $(".ck-prompt"); pr.classList.toggle("on", on); pr.style.setProperty("--p", p.toFixed(3)); },
    /** A sonar ping from (x, z) at time now: the ring runs out to 28 m and shows the marks as it passes them. */
    ping(x, z, now) { ping = { x, z, t: now }; },
    /**
     * The sonar screen is the map of the dive (22.3 p. 3), seen from above, north up, centred on the landing spot:
     * the covered seabed shaded, the search zone, the own track, the buoys, the marks found by pings, Nerpa.
     * m = {x, z, yaw, track: [[x, z]], cov: Set("i,j" of 2 m cells), zone, tether, marks: [{x, z, s, t}], buoys: [[x, z]]}
     */
    drawScope(now, m) {
      const W = scope.width, c = W / 2, Rr = W / 2 - 10, g = sg, k = Rr / m.tether;
      const X = (x) => c + x * k, Y = (z) => c + z * k;
      g.fillStyle = "#03110a"; g.fillRect(0, 0, W, W);
      g.save(); g.beginPath(); g.arc(c, c, Rr, 0, 7); g.clip();
      g.fillStyle = "rgba(110,255,150,.17)";                   // the seabed the searchlight has covered
      for (const key of m.cov) { const [i, j] = key.split(",").map(Number); g.fillRect(X(i * 2 - 1), Y(j * 2 - 1), 2 * k + 0.5, 2 * k + 0.5); }
      g.strokeStyle = "rgba(110,255,150,.10)"; g.lineWidth = 1;   // a 5 m grid
      for (let v = -25; v <= 25; v += 5) { g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), W); g.moveTo(0, Y(v)); g.lineTo(W, Y(v)); g.stroke(); }
      g.setLineDash([10, 8]); g.strokeStyle = "rgba(150,255,180,.6)"; g.lineWidth = 2.5;   // the search zone
      g.beginPath(); g.arc(c, c, m.zone * k, 0, 7); g.stroke(); g.setLineDash([]);
      g.strokeStyle = "rgba(150,255,180,.9)"; g.lineWidth = 2;  // the landing spot
      g.beginPath(); g.moveTo(c - 7, c); g.lineTo(c + 7, c); g.moveTo(c, c - 7); g.lineTo(c, c + 7); g.stroke();
      if (m.track.length > 1) {                                 // the own track
        g.strokeStyle = "rgba(255,190,110,.85)"; g.lineWidth = 3; g.lineJoin = "round"; g.beginPath();
        m.track.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
        g.lineTo(X(m.x), Y(m.z)); g.stroke();
      }
      const blink = Math.sin(now * 5) > 0;
      for (const [x, z] of m.buoys) {                           // the transponder buoys
        g.fillStyle = blink ? "#ff9a3c" : "#a8541c"; g.beginPath();
        g.moveTo(X(x), Y(z) - 8); g.lineTo(X(x) + 7, Y(z)); g.lineTo(X(x), Y(z) + 8); g.lineTo(X(x) - 7, Y(z)); g.fill();
      }
      const age = now - ping.t, ringR = (age / 1.2) * 28;
      if (age < 1.4) {                                          // the ping ring
        g.strokeStyle = `rgba(160,255,190,${0.8 * (1 - age / 1.4)})`; g.lineWidth = 4;
        g.beginPath(); g.arc(X(ping.x), Y(ping.z), ringR * k, 0, 7); g.stroke();
      }
      for (const mk of m.marks) {                               // what the pings found: they stay on the map
        if (now < mk.t) continue;
        const fresh = clamp(1 - (now - mk.t) / 1.5, 0, 1), x = X(mk.x), y = Y(mk.z);
        g.fillStyle = `rgba(170,255,195,${0.75 + fresh * 0.25})`;
        if (mk.s > 0.9) { g.lineWidth = 3; g.strokeStyle = g.fillStyle; g.beginPath(); g.arc(x, y, 11 + fresh * 8, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
        else { g.fillRect(x - 5 - fresh * 3, y - 5 - fresh * 3, 10 + fresh * 6, 10 + fresh * 6); }
      }
      g.restore();
      g.save(); g.translate(X(m.x), Y(m.z)); g.rotate(-m.yaw);   // Nerpa: the bow points along -z at yaw 0 (north)
      g.fillStyle = "#ffb35c"; g.strokeStyle = "#1a0c02"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -13); g.lineTo(-8, 9); g.lineTo(8, 9); g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.strokeStyle = "rgba(110,255,150,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(c, c, Rr, 0, 7); g.stroke();
      g.fillStyle = "#9fe0b0"; g.font = "bold 22px PT Mono, monospace"; g.textAlign = "center"; g.fillText(t("ck_n"), c, 32);
    },
  };
}
