// Entry point: fonts -> state from Python -> the navigator's table (map + table UI).
import { createView } from "./view.js";
import { createMap } from "./scenes/map.js";
import { createCabin } from "./scenes/cabin.js";
import { createTable } from "./table.js";
import { api } from "./api.js";
import { setLang } from "./strings.js";

const $ = (id) => document.getElementById(id);

async function loadFonts() {
  const sample = "ABCDEFGHIJ 0123456789 Квадрат поиска Ёё −·«»";
  await Promise.all(['400 20px "Prata"', '700 20px "Caveat"', '400 20px "Caveat"', '400 16px "Manrope"',
                     '700 16px "Manrope"', '400 16px "PT Mono"', 'italic 700 20px "Cormorant Garamond"', 'italic 600 20px "Cormorant Garamond"', 'italic 500 20px "Cormorant Garamond"', '700 20px "Cormorant Garamond"'].map((f) => document.fonts.load(f, sample)));
}

/** Camera per screen (CLAUDE.md v3.1, 18). */
function aimCamera(view, w, h) {
  const r = view.rig;
  // a 32° vertical lens, 41° above the horizon (the reference table view); far enough to fit the chart
  const a = w / h, narrow = w < 980;
  // the target sits nearer than the chart centre: the chart rises in the frame, so its lower edge
  // (the base, the ships) stays clear of the hanging tags and the dock at the bottom of the screen
  r.target.set(0.45, 0, narrow ? 3.1 : 2.35);
  r.tilt = 48;
  r.dist = Math.max(narrow ? 18.5 : 18.8, 8.3 / (Math.tan((16 * Math.PI) / 180) * a));
  r.hfov = (2 * Math.atan(Math.tan((16 * Math.PI) / 180) * a) * 180) / Math.PI;
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
  const cabin = createCabin(view.scene);
  view.onFrame((dt, time, sway) => cabin.update(dt, time, sway));
  const map = createMap(view, state);
  const table = createTable(view, map, state, { cabin });
  view.start();
  // the opening shot: the whole cabin first, then the camera glides down to the chart table
  if (!new URLSearchParams(location.search).has("nointro")) {
    document.body.classList.add("standing");            // the interface waits until the camera is at the table
    view.flyFrom(cabin.standPose, 0.75);
    setTimeout(() => document.body.classList.remove("standing"), 2600);
  }

  window.__abyss = { state: () => table.state, busy: () => table.busy, cellScreen: map.cellScreen };
}

start();
