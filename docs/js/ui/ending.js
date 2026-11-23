// The endings (CLAUDE.md 17.7, B4 / C13): a newspaper page on the table — the masthead, the date, the
// headline from story.json (endings[id].clipping), columns of body text (unreadable grey lines), a photo
// taken from the game itself, then Aigerim's last words on the radio. Buttons: play again, to the menu.
import { el } from "./fmt.js";
import { story, who } from "../story.js";
import { sfx } from "../audio.js";
import { t } from "../i18n.js";

const PHOTO = { investigators: "photo_recorders", public: "photo_recorders", sell: "photo_ship", lost: "photo_poseidon" };

/** id: investigators | public | sell | lost; photo: a data URL (a frame of the game) or null. */
export function showEnding(id, { photo = null, mystery = [], onAgain, onMenu } = {}) {
  const e = story()?.endings?.[id] ?? {};
  const aig = who("aigerim");
  const slots = story()?.mystery?.slots ?? [];
  const back = el("div", "ending");
  const lines = (n, seed) => Array.from({ length: n }, (_, i) => `<i style="width:${72 + ((i * 37 + seed * 13) % 28)}%"></i>`).join("");
  back.innerHTML = `
    <div class="paper" role="dialog" aria-modal="true">
      <header><small>${t("paper_issue")}</small><h1>${t("paper_name")}</h1><small>${t("paper_date")}</small></header>
      <div class="rule"></div>
      <span class="stamp">${e.title ?? ""}</span>
      <h2>${e.clipping ?? ""}</h2>
      <div class="cols">
        <div class="col">${lines(9, 1)}</div>
        <figure>${photo ? `<img src="${photo}" alt="">` : `<div class="ph"></div>`}<figcaption>${t(PHOTO[id] ?? "photo_ship")}</figcaption></figure>
        <div class="col">${lines(12, 2)}<b class="sub"></b>${lines(6, 3)}</div>
      </div>
      <div class="board">${slots.map((s) => `<span class="${mystery.includes(s.id) ? "on" : ""}">${mystery.includes(s.id) ? s.title : "?"}</span>`).join("")}</div>
    </div>
    <div class="radio-end"><small>${aig ? `${aig.name} · ${aig.role}` : ""}</small><p>${e.aigerim ?? ""}</p>
      <div class="end-btns"><button data-id="end-again">${t("end_again")}</button><button data-id="end-menu">${t("end_menu")}</button></div></div>`;
  document.body.append(back);
  document.body.classList.add("ending-open");
  sfx.paper?.();
  requestAnimationFrame(() => back.classList.add("on"));
  setTimeout(() => { back.classList.add("talk"); sfx.radio?.(); }, 3200);
  back.querySelector("[data-id=end-again]").addEventListener("click", () => onAgain?.());
  back.querySelector("[data-id=end-menu]").addEventListener("click", () => onMenu?.());
  return back;
}
