// "Who is who" (CLAUDE.md v3.1, 18): on the first launch and from the caption button — who the
// Aurora is, who Poseidon-2 is and what it wants, what the hills and the gold pin mean, the goal.
import { el } from "./fmt.js";
import { t } from "../i18n.js";

const KEY = "abyss.introDone";
const store = {
  get() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } },
  set() { try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ } },
};

export function createIntro(root, { onClose } = {}) {
  const back = el("div", "intro");
  back.hidden = true;
  const rows = [["#f29a1c", "who_you"], ["#b8432f", "who_rival"], ["#e0a83a", "who_hills"], ["#2f7d86", "who_goal"]];
  back.innerHTML = `<div class="ib" role="dialog" aria-modal="true"><h2>${t("who_title")}</h2><p class="sub">${t("who_sub")}</p>
    ${rows.map(([c, k]) => `<div class="ir"><i style="background:${c}"></i><div>${t(k)}</div></div>`).join("")}
    <button class="go" data-id="who-go">${t("who_go")}</button></div>`;
  root.append(back);
  let first = false;
  // E / Enter / Space close it too (A2: a key on an open window always does something)
  addEventListener("keydown", (e) => {
    if (back.hidden || e.repeat || !["KeyE", "Enter", "Space"].includes(e.code) || document.body.classList.contains("menu-open")) return;
    e.preventDefault(); e.stopPropagation(); back.querySelector(".go").click();
  }, true);
  back.querySelector(".go").addEventListener("click", () => {
    back.hidden = true;
    store.set();
    onClose?.(first);
    first = false;
  });
  return {
    show() { back.hidden = false; },
    showIfFirstTime() { if (store.get()) return false; first = true; back.hidden = false; return true; },
    get open() { return !back.hidden; },
  };
}
