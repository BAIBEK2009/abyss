// Entry point: fonts -> state from Python -> the navigator's table (map + table UI).
import { createView } from "./view.js";
import { createMap } from "./scenes/map.js";
import { createTable } from "./table.js";
import { api } from "./api.js";
import { setLang } from "./strings.js";

const $ = (id) => document.getElementById(id);

async function loadFonts() {
  const sample = "ABCDEFGHIJ 0123456789 Квадрат поиска Ёё −·«»";
  await Promise.all(['400 20px "Prata"', '700 20px "Caveat"', '400 20px "Caveat"', '400 16px "Manrope"',
                     '700 16px "Manrope"', '400 16px "PT Mono"'].map((f) => document.fonts.load(f, sample)));
}

/** Camera per screen: the chart sits to the left, the officers' panel is on the right. */
function aimCamera(view, w, h) {
  const r = view.rig;
  if (w / h >= 1.15) { r.target.set(2.2, 0, 1.15); r.dist = 31.5; r.tilt = 40; r.hfov = 31; }   // chart up: tags below
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

  window.__abyss = { state: () => table.state, busy: () => table.busy, cellScreen: map.cellScreen };
}

start();
