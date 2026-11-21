// Entry point: fonts -> state from Python -> the navigator's table (map + table UI).
import { createView } from "./view.js";
import { createMap } from "./scenes/map.js";
import { createCabin } from "./scenes/cabin.js";
import { createDive } from "./scenes/dive.js";
import { createTable } from "./table.js";
import { api } from "./api.js";
import { setLang } from "./strings.js";
import { loadStory } from "./story.js";

const $ = (id) => document.getElementById(id);

async function loadFonts() {
  // the sample touches every subset (latin, cyrillic, cyrillic-ext with the Kazakh letters),
  // so canvas labels never draw before their font is in (CLAUDE.md 23.1)
  const sample = "ABCDEFGHIJ 0123456789 Ёё Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі −·«»";
  const faces = ['400 20px "Prata"', '700 20px "Caveat"', '400 20px "Caveat"', '400 16px "PT Mono"',
    '400 16px "Onest"', '500 16px "Onest"', '600 16px "Onest"', '700 16px "Onest"', '800 16px "Onest"',
    'italic 700 20px "Cormorant Garamond"', 'italic 600 20px "Cormorant Garamond"', 'italic 500 20px "Cormorant Garamond"',
    '700 20px "Cormorant Garamond"', '600 20px "Cormorant Garamond"'];
  await Promise.all(faces.map((f) => document.fonts.load(f, sample)));
}

/** Camera per screen (CLAUDE.md v3.1, 18). */
function aimCamera(view, w, h) {
  const r = view.rig;
  // a 32° vertical lens, 41° above the horizon (the reference table view); far enough to fit the chart
  const a = w / h, narrow = w < 980;
  // the target sits nearer than the chart centre: the chart rises in the frame, so its lower edge
  // (the base, the ships) stays clear of the hanging tags and the dock at the bottom of the screen
  r.target.set(0.45, 0, narrow ? 3.1 : 2.35);
  r.tilt = 48; r.yaw = 0;
  r.dist = Math.max(narrow ? 18.5 : 18.8, 8.3 / (Math.tan((16 * Math.PI) / 180) * a));
  r.hfov = (2 * Math.atan(Math.tan((16 * Math.PI) / 180) * a) * 180) / Math.PI;
}

async function start() {
  await loadFonts();
  let state;
  try {
    [state] = await Promise.all([api.state(), loadStory()]);
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
  const dive = createDive(view);
  const table = createTable(view, map, state, { cabin, dive });
  view.start();
  // the opening shot: the whole cabin first, then the camera glides down to the chart table
  const prologue = state.campaign?.act === "prologue";     // the story moves the camera itself
  if (!prologue && !new URLSearchParams(location.search).has("nointro")) {
    document.body.classList.add("standing");            // the interface waits until the camera is at the table
    view.flyFrom(cabin.standPose, 0.75);
    setTimeout(() => document.body.classList.remove("standing"), 2600);
  }

  window.__abyss = { table, state: () => table.state, busy: () => table.busy, cellScreen: map.cellScreen, faceBox: dive.debugFaceBox };
}

start();
