// A story choice (story.json beat type "choice": act III — what to look for first, act IV — who gets the
// recording). Cards on the table with the speaker's question; a click, or the keys 1/2/3 (event.code).
import { el } from "./fmt.js";
import { who } from "../story.js";
import { sfx } from "../audio.js";
import { sleep } from "../anim.js";
import { t } from "../i18n.js";

/** line = the beat {speaker, text, options:[{id, text}]}. Resolves with the chosen option id. */
export function choiceCards(line) {
  return new Promise((resolve) => {
    const back = el("div", "choice-back");
    const p = line.speaker ? who(line.speaker) : null;
    back.innerHTML = `<div class="choice-in" role="dialog" aria-modal="true">
      ${p ? `<small class="choice-who">${p.name} · ${p.role}</small>` : ""}
      <h2>${line.text}</h2>
      <div class="choice-row">${line.options.map((o, i) => `<button class="choice-card" data-id="choice-${o.id}" data-opt="${o.id}" style="--d:${i * 0.12}s">
        <kbd>${i + 1}</kbd><span>${o.text}</span></button>`).join("")}</div>
      <small class="choice-key">${t("choice_keys")}</small></div>`;
    document.body.append(back);
    sfx.clack?.();
    let done = false;
    const pick = async (id) => {
      if (done) return;
      done = true;
      removeEventListener("keydown", onKey, true);
      sfx.brass?.();
      back.querySelector(`[data-opt="${id}"]`)?.classList.add("picked");
      await sleep(450);
      back.classList.add("out");
      await sleep(350);
      back.remove();
      resolve(id);
    };
    const onKey = (e) => {
      if (document.body.classList.contains("menu-open")) return;
      const i = ["1", "2", "3"].indexOf(e.code.replace(/^(Digit|Numpad)/, ""));
      if (i >= 0 && line.options[i]) { e.preventDefault(); e.stopPropagation(); pick(line.options[i].id); }
    };
    addEventListener("keydown", onKey, true);
    back.querySelectorAll(".choice-card").forEach((b) => b.addEventListener("click", () => pick(b.dataset.opt)));
  });
}
