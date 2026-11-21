// The language screen (CLAUDE.md 23.1): on the first launch three big cards, each language in its
// own words. No flags: a language is not a country. The choice goes to localStorage['abyss.lang'];
// later it is changed from the menu (Esc -> Language).
import { el } from "./fmt.js";

const ORDER = ["kk", "ru", "en"];

/** tables = {kk, ru, en} (all three i18n files). Resolves with the chosen code. */
export function pickLanguage(tables, sfx = {}) {
  return new Promise((resolve) => {
    const box = el("div", "lang-screen");
    const titles = ORDER.map((l) => `<span lang="${l}">${tables[l].lang_title}</span>`).join("<i>·</i>");
    box.innerHTML = `<div class="lang-in">
      <div class="lang-logo">ABYSS</div>
      <h1 class="lang-title">${titles}</h1>
      <div class="lang-cards">${ORDER.map((l, i) => `
        <button class="lang-card" data-lang="${l}" lang="${l}">
          <b>${tables[l].lang_self}</b><small>${tables[l].lang_pick}</small><kbd>${i + 1}</kbd>
        </button>`).join("")}
      </div>
      <p class="lang-note">${ORDER.map((l) => `<span lang="${l}">${tables[l].lang_note}</span>`).join("<br>")}</p>
    </div>`;
    document.body.append(box);
    requestAnimationFrame(() => box.classList.add("on"));
    const done = (l) => {
      removeEventListener("keydown", onKey);
      sfx.brass?.();
      box.classList.remove("on");
      setTimeout(() => box.remove(), 450);
      resolve(l);
    };
    const onKey = (e) => { const i = ["1", "2", "3"].indexOf(e.key); if (i >= 0) done(ORDER[i]); };
    addEventListener("keydown", onKey);
    box.querySelectorAll(".lang-card").forEach((b) => {
      b.addEventListener("click", () => done(b.dataset.lang));
      b.addEventListener("pointerenter", () => sfx.click?.());
    });
    box.querySelector(".lang-card").focus({ preventScroll: true });
  });
}
