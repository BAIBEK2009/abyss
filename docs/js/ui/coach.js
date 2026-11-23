// Tutorial (CLAUDE.md v3, 11): 5 steps, dimmed screen with a highlighted area, a card with
// "Next" / "Skip" and a "2 of 5" counter. Shown on the first visit; the "Hints" button replays it.
import { el } from "./fmt.js";
import { t } from "../i18n.js";

const KEY = "abyss.coachDone";
const store = {
  get() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } },
  set() { try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ } },
};

/** steps: [{ title, text, rect: () => DOMRect-like {left, top, width, height} }] */
export function createCoach(root, steps) {
  const layer = el("div", "coach");
  layer.hidden = true;
  const hole = el("div", "coach-hole");
  const card = el("div", "coach-card");
  layer.append(hole, card);
  root.append(layer);
  let i = 0;

  function place() {
    const r = steps[i].rect();
    const pad = 10;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`,
                                width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    // the card goes next to the highlight, inside the window
    const w = 340, h = card.offsetHeight || 170;
    let x = r.left + r.width + 24, y = r.top;
    if (x + w > innerWidth - 12) x = r.left - w - 24;
    if (x < 12) { x = Math.min(innerWidth - w - 12, Math.max(12, r.left)); y = r.top + r.height + 20; }
    if (y + h > innerHeight - 12) y = Math.max(12, r.top - h - 20);
    card.style.left = `${x}px`; card.style.top = `${Math.max(12, y)}px`;
  }

  function show() {
    const s = steps[i];
    const last = i === steps.length - 1;
    card.innerHTML = `<div class="coach-count">${t("coach_count", { n: i + 1, total: steps.length })}</div>
      <h3>${s.title}</h3><p>${s.text}</p>
      <div class="coach-buttons"><button class="coach-next" data-id="coach-next">${t(last ? "coach_done" : "coach_next")}</button>
      <button class="coach-skip" data-id="coach-skip">${t("coach_skip")}</button></div>`;
    card.querySelector(".coach-next").onclick = () => { if (last) stop(); else { i++; show(); } };
    card.querySelector(".coach-skip").onclick = stop;
    layer.hidden = false;
    requestAnimationFrame(place);
  }
  function stop() { layer.hidden = true; store.set(); }
  window.addEventListener("resize", () => { if (!layer.hidden) place(); });
  window.addEventListener("keydown", (e) => {       // E / Enter: "Next" (A2)
    if (layer.hidden || e.repeat || !["KeyE", "Enter"].includes(e.code) || document.body.classList.contains("menu-open")) return;
    e.preventDefault(); e.stopPropagation(); layer.querySelector(".coach-next")?.click();
  }, true);

  return {
    start() { i = 0; show(); },
    startIfFirstTime() { if (!store.get()) { i = 0; show(); } },
    get open() { return !layer.hidden; },
  };
}
