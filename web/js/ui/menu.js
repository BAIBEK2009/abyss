// The pause menu (Esc, or the "Menu" button): continue, the language (CLAUDE.md 23.1:
// Esc -> Til / Yazyk / Language), a new game. Changing the language reloads the page; the game itself
// lives in the Python server, so nothing is lost.
import { el } from "./fmt.js";
import { clock } from "../clock.js";
import { duck } from "../audio.js";
import { t, getLang, LANGS, saveLang } from "../i18n.js";

export function createMenu({ onNewGame, sfx = {}, selfNames = {} }) {
  const box = el("div", "menu-screen");
  box.hidden = true;
  box.innerHTML = `<div class="menu-in" role="dialog" aria-modal="true">
    <h2>${t("menu_title")}</h2>
    <button class="menu-btn menu-continue" data-id="menu-continue">${t("menu_continue")}</button>
    <section><h3>${t("menu_lang")}</h3>
      <div class="menu-langs">${LANGS.map((l) => `<button class="menu-lang${l === getLang() ? " on" : ""}" data-lang="${l}" lang="${l}">${selfNames[l] ?? l}</button>`).join("")}</div>
      <small>${t("menu_lang_note")}</small></section>
    <button class="menu-btn menu-new" data-id="menu-new">${t("menu_new")}</button>
    <small class="menu-key">${t("menu_key")}</small>
  </div>`;
  document.body.append(box);

  let open = false, openedAt = 0;
  function show(on) {
    if (on === open) return;
    open = on;
    clock.pause(on); duck(on);                 // one clock: oxygen, hours, the rival, films stand still (A1)
    if (on) { openedAt = performance.now(); if (document.pointerLockElement) document.exitPointerLock(); }
    else dispatchEvent(new CustomEvent("abyss:menu-closed"));
    sfx.click?.();
    box.hidden = !on;
    document.body.classList.toggle("menu-open", on);
    if (on) box.querySelector(".menu-continue").focus({ preventScroll: true });
  }
  box.addEventListener("click", (e) => { if (e.target === box) show(false); });
  box.querySelector(".menu-continue").addEventListener("click", () => show(false));
  box.querySelectorAll(".menu-lang").forEach((b) => b.addEventListener("click", () => {
    const l = b.dataset.lang;
    if (l === getLang()) return show(false);
    saveLang(l);
    const url = new URL(location.href);
    url.searchParams.delete("lang");          // ?lang= would win over the new choice
    location.replace(url);
  }));
  box.querySelector(".menu-new").addEventListener("click", async () => {
    if (!confirm(t("menu_new_confirm"))) return;
    await onNewGame?.();
    location.reload();
  });
  addEventListener("abyss:menu", () => show(!open));
  addEventListener("abyss:menu-open", () => show(true));      // Esc freed the cursor in first person
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.repeat) return;
    if (!open && document.querySelector(".lang-screen")) return;
    if (document.pointerLockElement) return;                  // the browser frees the cursor -> abyss:menu-open
    if (open && performance.now() - openedAt < 400) return;  // the same Esc that just opened it
    e.preventDefault();
    show(!open);
  });
  return { show, get open() { return open; } };
}
