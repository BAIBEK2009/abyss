// Entry point: fonts -> state from Python -> the navigator's table with the probability relief.
// M5: the map only. The table UI (officers, action tags, radio) comes in M6; until then a few
// temporary keys let you watch the map work (N = one move by the officers' advice, C = accept clue).
import { createView } from "./view.js";
import { createMap } from "./scenes/map.js";
import { api } from "./api.js";
import { setLang, t } from "./strings.js";

const $ = (id) => document.getElementById(id);

async function loadFonts() {
  const sample = "ABCDEFGHIJ 0123456789 Квадрат поиска Ёё −·";
  await Promise.all(['400 20px "Prata"', '700 20px "Caveat"', '400 16px "Manrope"', '700 16px "Manrope"',
                     '400 16px "PT Mono"'].map((f) => document.fonts.load(f, sample)));
}

/** Camera per screen: the map sits to the left (the officers' panel will be on the right). */
function aimCamera(view, w, h) {
  const r = view.rig;
  if (w / h >= 1.15) { r.target.set(2.2, 0, 0.1); r.dist = 31.5; r.tilt = 40; r.hfov = 31; }
  else { r.target.set(0, 0, 0.3); r.dist = 44; r.tilt = 52; r.hfov = 34; }   // narrow screens / phones
}

async function start() {
  await loadFonts();
  let state;
  try {
    state = await api.state();
  } catch {
    $("status").textContent = "Сервер не отвечает — запусти python main.py";
    $("status").hidden = false;
    return;
  }
  setLang(new URLSearchParams(location.search).get("lang") || state.lang);

  const view = createView($("scene"));
  view.onResize((w, h) => aimCamera(view, w, h));
  const map = createMap(view, state);
  view.start();

  // ---- temporary M5 controls (replaced by the table UI in M6)
  let busy = false, target = null;
  const hint = $("devhint");
  hint.textContent = t("dev_hint");
  hint.hidden = false;

  async function step() {
    if (busy || state.status !== "playing") return;
    busy = true;
    map.target(null); map.setRoute("ours", null); target = null;
    try {
      for (const c of state.clues) state = (await api.clue(c.id, true)).state;
      const before = state;
      const res = await api.act(state.advice.advice.action);
      await map.play(res.events, before);
      state = res.state;
      map.setState(state);
    } finally { busy = false; }
  }

  view.renderer.domElement.addEventListener("mousemove", (e) => map.hover(map.cellAt(e.clientX, e.clientY)));
  view.renderer.domElement.addEventListener("mouseleave", () => map.hover(null));
  view.renderer.domElement.addEventListener("click", async (e) => {
    const cell = map.cellAt(e.clientX, e.clientY);
    if (busy || !cell) return;
    if (target && target[0] === cell[0] && target[1] === cell[1]) {
      target = null; map.target(null); map.setRoute("ours", null); return;
    }
    target = cell;
    map.target(cell);
    try {
      const pv = await api.preview({ type: "go", target: cell, tool: "sonar" });
      map.setRoute("ours", pv.path.length > 1 ? pv.path : null);   // only our course: forecasts come with the M6 tags
    } catch { map.setRoute("ours", null); }
  });
  window.addEventListener("keydown", async (e) => {
    const k = e.key.toLowerCase();
    if (k === "n" || k === "т") step();
    if ((k === "c" || k === "с") && state.clues.length && !busy) {
      const res = await api.clue(state.clues[0].id, true);
      state = res.state;
      map.setState(state, { animate: true });
    }
  });

  window.__abyss = { state: () => state, busy: () => busy, cellScreen: map.cellScreen };
}

start();
