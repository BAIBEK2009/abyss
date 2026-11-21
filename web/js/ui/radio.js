// Radio window for clues (CLAUDE.md v3, 5.5): the text is typed out, reliability bar,
// "Poseidon hears this too", buttons "Put it on the chart" (Bayes update) / "Don't trust it".
import { ICONS } from "./icons.js";
import { el } from "./fmt.js";
import { t } from "../i18n.js";

function clueText(c) {
  if (c.kind === "fish") return t("clue_fish", { dir: t(`dir_${c.sector}`) });
  return t(c.axis === "col" ? "clue_coast_col" : "clue_coast_row", { from: c.from, to: c.to });
}

export function createRadio(root) {
  const back = el("div", "radio-back");
  back.hidden = true;
  const box = el("div", "radio");
  box.innerHTML = `<div class="radio-head">${ICONS.radio}<span class="radio-title"></span><span class="radio-src"></span></div>
    <p class="radio-text"></p>
    <div class="radio-meta"><div class="rel"><span class="rel-label"></span><div class="rel-bar"><div class="rel-fill"></div></div></div>
      <span class="radio-hears">${t("rival_hears")}</span></div>
    <div class="radio-buttons"><button class="radio-accept">${ICONS.check}<span>${t("clue_accept")}</span></button>
      <button class="radio-reject">${t("clue_reject")}</button></div>`;
  back.append(box);
  root.append(back);
  const text = box.querySelector(".radio-text");
  let typing = null;

  /** Show one clue; resolves true (accept) / false (reject). line = {text, src} from story.json (the campaign). */
  function ask(clue, line = null) {
    return new Promise((resolve) => {
      box.querySelector(".radio-title").textContent = t("radio_title");
      box.querySelector(".radio-src").textContent = line?.src ?? t(clue.kind === "fish" ? "src_fish" : "src_coast");
      const p = Math.round(clue.reliability * 100);
      box.querySelector(".rel-label").textContent = t("reliability", { p });
      box.querySelector(".rel-fill").style.width = `${p}%`;
      const full = line?.text ?? clueText(clue);
      text.textContent = "";
      text.title = t("show_all");
      let i = 0;
      clearInterval(typing);
      typing = setInterval(() => {                     // typewriter
        text.textContent = full.slice(0, ++i);
        if (i >= full.length) clearInterval(typing);
      }, 28);
      text.onclick = () => { clearInterval(typing); text.textContent = full; };   // "show all"
      back.hidden = false;
      const done = (v) => { clearInterval(typing); back.hidden = true; resolve(v); };
      box.querySelector(".radio-accept").onclick = () => done(true);
      box.querySelector(".radio-reject").onclick = () => done(false);
    });
  }
  return { ask, get open() { return !back.hidden; } };
}
