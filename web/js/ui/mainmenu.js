// The main menu (B6, B7): Continue (the game on the server, or the save in localStorage), New game,
// Demo for the defence, the language. Enter / E takes the first button. Resolves with the state to play.
import { el } from "./fmt.js";
import { api, readSave, clearSave } from "../api.js";
import { t, getLang, LANGS, saveLang } from "../i18n.js";

export function mainMenu(state, selfNames = {}) {
  const local = readSave();
  const onServer = (state.save?.log?.length ?? 0) > 0 && state.campaign && state.status === "playing";
  const canLoad = !onServer && local && local.log.length > 0;
  return new Promise((resolve) => {
    const box = el("div", "main-menu");
    box.innerHTML = `<div class="mm-in">
      <h1>ABYSS</h1><p class="mm-sub">${t("mm_sub")}</p>
      <div class="mm-btns">
        ${onServer || canLoad ? `<button class="mm-btn main" data-id="mm-continue">${t("mm_continue")}</button>` : ""}
        <button class="mm-btn ${onServer || canLoad ? "" : "main"}" data-id="mm-new">${t("mm_new")}</button>
        <button class="mm-btn demo" data-id="mm-demo">${t("mm_demo")}<small>${t("mm_demo_sub")}</small></button>
      </div>
      <div class="mm-langs">${LANGS.map((l) => `<button data-lang="${l}" class="${l === getLang() ? "on" : ""}" lang="${l}">${selfNames[l] ?? l}</button>`).join("")}</div>
      <small class="mm-note"></small></div>`;
    document.body.append(box);
    const note = box.querySelector(".mm-note");
    const done = (st) => { removeEventListener("keydown", onKey, true); box.classList.add("out"); setTimeout(() => box.remove(), 500); resolve(st); };
    const go = async (id) => {
      if (id === "mm-continue") {
        if (onServer) return done(state);
        try { return done(await api.load(local)); } catch {
          clearSave(); note.textContent = t("mm_old_save");          // an old version's save: dropped, not crashed on
          box.querySelector("[data-id=mm-continue]")?.remove();
          return;
        }
      }
      if (id === "mm-new") { clearSave(); return done(await api.newCampaign(false)); }
      if (id === "mm-demo") { clearSave(); return done(await api.newCampaign(true)); }
    };
    box.querySelectorAll(".mm-btn").forEach((b) => b.addEventListener("click", () => go(b.dataset.id)));
    box.querySelectorAll(".mm-langs button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.lang === getLang()) return;
      saveLang(b.dataset.lang);
      const url = new URL(location.href); url.searchParams.delete("lang"); location.replace(url);
    }));
    const onKey = (e) => {
      if (!["Enter", "KeyE", "Space"].includes(e.code) || e.repeat) return;
      e.preventDefault(); e.stopPropagation();
      go(box.querySelector(".mm-btn.main")?.dataset.id);
    };
    addEventListener("keydown", onKey, true);
  });
}
