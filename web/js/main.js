// Entry point: fonts -> state from Python -> the navigator's table (map + table UI).
import { createView } from "./view.js";
import { createMap } from "./scenes/map.js";
import { createTable } from "./table.js";
import { api } from "./api.js";
import { setLang, t } from "./strings.js";

const $ = (id) => document.getElementById(id);

async function loadFonts() {
  const sample = "ABCDEFGHIJ 0123456789 Квадрат поиска Ёё −·«»";
  await Promise.all(['400 20px "Prata"', '700 20px "Caveat"', '400 20px "Caveat"', '400 16px "Manrope"',
                     '700 16px "Manrope"', '400 16px "PT Mono"'].map((f) => document.fonts.load(f, sample)));
}

/** Camera per screen: the chart sits to the left, the officers' panel is on the right. */
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
  const table = createTable(view, map, state);
  view.start();

  // ---- until the action tags (M6 part 2): click a cell = our course; C = accept a radio clue
  let target = null;
  const hint = $("devhint");
  hint.textContent = t("dev_hint");
  hint.hidden = false;
  view.renderer.domElement.addEventListener("mousemove", (e) => map.hover(map.cellAt(e.clientX, e.clientY)));
  view.renderer.domElement.addEventListener("mouseleave", () => map.hover(null));
  view.renderer.domElement.addEventListener("click", async (e) => {
    const cell = map.cellAt(e.clientX, e.clientY);
    if (table.busy || !cell) return;
    if (target && target[0] === cell[0] && target[1] === cell[1]) {
      target = null; map.target(null); map.setRoute("ours", null); return;
    }
    target = cell;
    map.target(cell);
    try {
      const pv = await api.preview({ type: "go", target: cell, tool: "sonar" });
      map.setRoute("ours", pv.path.length > 1 ? pv.path : null);
    } catch { map.setRoute("ours", null); }
  });
  window.addEventListener("keydown", async (e) => {
    const k = e.key.toLowerCase();
    if ((k === "c" || k === "с") && table.state.clues.length && !table.busy) await table.acceptClues();
  });

  window.__abyss = { state: () => table.state, busy: () => table.busy, cellScreen: map.cellScreen };
}

start();
