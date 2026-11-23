// The online build (GitHub Pages, docs/): there is no server, so the same Python files (core/*.py,
// core/router.py) run in the browser in Pyodide. Only api.js imports this file, and only when the page
// says <meta name="abyss-backend" content="pyodide"> (tools/build_web.py puts it there). No game logic
// here: every /api/* call goes to core.router.Session.handle, exactly as server.py does.
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const LANGS = ["kk", "ru", "en"];

let ready = null;

function pickLang() {
  const q = new URLSearchParams(location.search).get("lang");
  if (LANGS.includes(q)) return q;
  try { const s = localStorage.getItem("abyss.lang"); if (LANGS.includes(s)) return s; } catch { /* blocked */ }
  return null;
}

/** The loading screen: the text comes from i18n/*.json (key "loading_python"); before the player has
 *  chosen a language, all three lines are shown. */
async function loadingScreen() {
  const box = document.createElement("div");
  box.className = "py-loading";
  box.innerHTML = '<div class="py-loading-card"><div class="py-loading-text"></div>' +
    '<div class="py-loading-bar"><i></i></div><div class="py-loading-note"></div></div>';
  document.body.appendChild(box);
  const bar = box.querySelector("i");
  const lang = pickLang();
  const tables = await Promise.all((lang ? [lang] : LANGS).map((l) =>
    fetch(`i18n/${l}.json`).then((r) => r.json()).catch(() => ({}))));
  box.querySelector(".py-loading-text").innerHTML = tables.map((d) => `<div>${d.loading_python || "Python…"}</div>`).join("");
  let shown = 0, goal = 0;
  const tick = setInterval(() => {             // the bar creeps towards the next goal, never jumps back
    shown += Math.max(0.15, (goal - shown) * 0.08);
    shown = Math.min(shown, goal);
    bar.style.width = `${shown.toFixed(1)}%`;
  }, 50);
  return {
    to(p) { goal = Math.max(goal, p); },
    fail(err) {
      clearInterval(tick);
      box.classList.add("failed");
      box.querySelector(".py-loading-note").textContent =
        tables.map((d) => d.loading_python_failed || "").filter(Boolean).join(" · ") + ` (${err?.message || err})`;
    },
    done() {
      goal = 100; shown = 100; bar.style.width = "100%";
      clearInterval(tick);
      box.classList.add("off");
      setTimeout(() => box.remove(), 450);
    },
  };
}

async function boot() {
  const screen = await loadingScreen();
  try {
    screen.to(12);
    const { loadPyodide } = await import(`${PYODIDE}pyodide.mjs`);
    screen.to(70);                                       // the runtime itself is the long part
    const [py, manifest] = await Promise.all([
      loadPyodide({ indexURL: PYODIDE }),
      fetch("py/manifest.json").then((r) => r.json()),
    ]);
    screen.to(82);
    // the same layout as the repository: core/*.py next to web/data/story*.json (core/campaign.py reads them)
    py.FS.mkdirTree("/abyss/core");
    py.FS.mkdirTree("/abyss/web/data");
    await Promise.all(manifest.files.map(async ([src, dst]) => {
      const r = await fetch(src);
      if (!r.ok) throw new Error(`${src}: ${r.status}`);
      py.FS.writeFile(`/abyss/${dst}`, new Uint8Array(await r.arrayBuffer()));
    }));
    screen.to(94);
    const qs = new URLSearchParams(location.search);
    py.globals.set("_demo", qs.has("demo"));
    py.globals.set("_lang", pickLang() || "ru");
    py.runPython(`
import sys
sys.path.insert(0, "/abyss")
sys.dont_write_bytecode = True
from core.router import Session, handle_json
_session = Session(lang=_lang, demo=bool(_demo))
`);
    const handle = py.globals.get("handle_json");
    const session = py.globals.get("_session");
    screen.done();
    window.__abyssPy = py;                               // tools (tests) poke the game through this
    return (method, path, body, query) => JSON.parse(handle(session, method, path, JSON.stringify(body ?? {}), JSON.stringify(query ?? {})));
  } catch (err) {
    screen.fail(err);
    throw err;
  }
}

/** fetch() for /api/* without a server: {status, data}. */
export async function pyCall(url, body) {
  ready ??= boot();
  const run = await ready;
  const u = new URL(url, location.href);
  const query = Object.fromEntries(u.searchParams.entries());
  return run(body === undefined ? "GET" : "POST", u.pathname.replace(/^.*(\/api\/)/, "$1"), body, query);
}

/** Start loading Python at once (the language screen and fonts load meanwhile). */
export function warmUp() { ready ??= boot(); ready.catch(() => {}); }
