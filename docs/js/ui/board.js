// The evidence board "What happened to AQ-271" (CLAUDE.md 17.2, 22.4, B5): six frames on cork, a polaroid of
// each find (an illustration drawn here), its title and text from story.json, red threads between the finds
// that explain each other. Empty frames show a question mark. Opened from the cabin wall or the table.
import { el } from "./fmt.js";
import { story } from "../story.js";
import { sfx } from "../audio.js";
import { t } from "../i18n.js";

// which finds explain each other: not an explosion -> a landing on water -> the false speed -> they knew,
// the false speed -> the last minutes, the client of «Poseidon» -> they knew
export const THREADS = [[1, 2], [2, 4], [4, 5], [4, 6], [3, 6]];

/** Small illustrations of the finds (SVG, in the warm engraving style of the chart). */
export const photo = (id) => ({
  1: `<rect width="200" height="150" fill="#1d3a44"/><path d="M20 112 L60 70 L170 58 L182 92 L40 124Z" fill="#c9cfd2" stroke="#2a2f33" stroke-width="2"/>
      <path d="M60 70 L58 118 M95 66 L94 114 M130 62 L132 108" stroke="#8a9296" stroke-width="1.5"/><text x="98" y="100" font-family="Onest" font-weight="800" font-size="20" fill="#1d2228" transform="rotate(-6 98 100)">AQ-271</text>
      <path d="M20 112 q-10 6 -18 2 M24 116 q-6 10 -16 12" stroke="#222" stroke-width="2" fill="none"/>`,
  2: `<rect width="200" height="150" fill="#1b3640"/><path d="M30 120 L90 112 L120 40 L150 36 L140 112 L190 118 L190 130 L30 132Z" fill="#d7dcdf" stroke="#2a2f33" stroke-width="2"/>
      <path d="M126 44 L142 42 L136 104 L122 106Z" fill="#2f9aa3"/><path d="M30 120 l-12 -8 m12 14 l-14 4" stroke="#333" stroke-width="2"/><path d="M0 134 H200 V150 H0Z" fill="#5a5444"/>`,
  3: `<rect width="200" height="150" fill="#e9e1cc"/><rect x="16" y="40" width="168" height="70" fill="#f6f1e2" stroke="#b9ad8c"/>
      <g font-family="PT Mono" font-size="11" fill="#2b2a33">${t("board_tele").split("|").map((l, i) => `<text x="24" y="${60 + i * 18}">${l}</text>`).join("")}</g>
      <circle cx="170" cy="40" r="7" fill="#c2412d"/>`,
  4: `<rect width="200" height="150" fill="#f3ecd8"/><path d="M14 20 V130 H190" stroke="#2b2a33" stroke-width="1.5" fill="none"/>
      <path d="M14 46 C60 44 90 46 110 48 C120 50 124 96 134 112 C150 120 170 122 190 124" stroke="#c2412d" stroke-width="3" fill="none"/>
      <path d="M112 20 V130" stroke="#2b2a33" stroke-dasharray="4 4"/><text x="116" y="32" font-family="Onest" font-weight="800" font-size="11" fill="#2b2a33" textLength="74" lengthAdjust="spacingAndGlyphs">AUTOPILOT OFF</text>`,
  5: `<rect width="200" height="150" fill="#05080a"/><path d="M0 75 ${Array.from({ length: 40 }, (_, i) => `L${i * 5 + 5} ${75 + Math.round(Math.sin(i * 1.7) * (i < 32 ? 26 * Math.abs(Math.sin(i * 0.4)) : 2))}`).join(" ")}" stroke="#7fe0a0" stroke-width="2" fill="none"/>`,
  6: `<rect width="200" height="150" fill="#6a4b2c"/><rect x="30" y="18" width="140" height="118" fill="#efe6d2" stroke="#3a2a1a"/>
      <g stroke="#9a907a"><path d="M42 40 H158 M42 54 H158 M42 68 H140 M42 96 H158 M42 110 H120"/></g><rect x="40" y="76" width="120" height="12" fill="#ffd54a88"/>
      <g transform="rotate(-14 130 112)"><rect x="96" y="96" width="70" height="26" fill="none" stroke="#c2412d" stroke-width="3"/><text x="101" y="114" font-family="Onest" font-weight="800" font-size="12" fill="#c2412d" textLength="60" lengthAdjust="spacingAndGlyphs">${t("board_postponed")}</text></g>`,
})[id] ?? "";

export function createBoard() {
  const back = el("div", "board-back");
  back.hidden = true;
  document.body.append(back);
  let open = false;
  function close() { open = false; back.hidden = true; sfx.paper?.(); removeEventListener("keydown", onKey, true); }
  const onKey = (e) => {
    if (!["Escape", "KeyE", "Enter"].includes(e.code) || e.repeat) return;
    e.preventDefault(); e.stopPropagation(); close();
  };
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest(".board-close")) close(); });

  /** found: the slot ids found so far. */
  function show(found = []) {
    const S = story()?.mystery;
    const slots = S?.slots ?? [];
    back.innerHTML = `<div class="cork" role="dialog" aria-modal="true">
      <h2>${S?.title ?? ""}</h2><small class="board-sub">${t("board_sub", { n: found.length, total: slots.length })}</small>
      <svg class="threads" viewBox="0 0 1000 620" preserveAspectRatio="none"></svg>
      <div class="frames">${slots.map((s, i) => {
        const on = found.includes(s.id);
        return `<figure class="frame ${on ? "on" : ""}" data-slot="${s.id}" style="--r:${[-2, 1.5, -1, 2, -1.5, 1][i] ?? 0}deg">
          <span class="pin"></span>
          <div class="pol">${on ? `<svg viewBox="0 0 200 150">${photo(s.id)}</svg>` : `<b>?</b>`}</div>
          <figcaption><b>${s.id}. ${on ? s.title : t("board_unknown")}</b>${on ? `<span>${s.text}</span>` : ""}</figcaption></figure>`;
      }).join("")}</div>
      <button class="board-close" data-id="board-close">${t("board_close")}</button></div>`;
    back.hidden = false; open = true;
    sfx.paper?.();
    addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => drawThreads(found));
  }
  function drawThreads(found) {
    const svg = back.querySelector(".threads"), cork = back.querySelector(".cork");
    if (!svg || !cork) return;
    const cr = cork.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${cr.width} ${cr.height}`);
    const pinAt = (id) => {
      const p = back.querySelector(`.frame[data-slot="${id}"] .pin`)?.getBoundingClientRect();
      return p ? [p.left + p.width / 2 - cr.left, p.top + p.height / 2 - cr.top] : null;
    };
    svg.innerHTML = THREADS.filter(([a, b]) => found.includes(a) && found.includes(b)).map(([a, b]) => {
      const A = pinAt(a), B = pinAt(b);
      if (!A || !B) return "";
      const mx = (A[0] + B[0]) / 2, my = Math.max(A[1], B[1]) + 26;       // a thread sags a little
      return `<path d="M${A[0]} ${A[1]} Q${mx} ${my} ${B[0]} ${B[1]}" />`;
    }).join("");
  }
  addEventListener("resize", () => { if (open) drawThreads([...back.querySelectorAll(".frame.on")].map((f) => +f.dataset.slot)); });
  return { show, close, get open() { return open; } };
}
