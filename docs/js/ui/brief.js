// The briefing before each dive (CLAUDE.md 22.2): story.json acts[].dive_brief — task / how to search /
// oxygen — and the "Start the dive" button.
import { el } from "./fmt.js";
import { ICONS } from "./icons.js";
import { t } from "../i18n.js";
import { sfx } from "../audio.js";

export function showBrief(root, brief) {
  return new Promise((resolve) => {
    const back = el("div", "brief-back");
    back.innerHTML = `<div class="brief" role="dialog" aria-modal="true">
      <h2>${brief.title}</h2>
      <div class="br-row">${ICONS.target}<div><b>${t("brief_task")}</b><p>${brief.task}</p></div></div>
      <div class="br-row">${ICONS.sonar}<div><b>${t("brief_how")}</b><p>${brief.how}</p></div></div>
      <div class="br-row">${ICONS.clock}<div><b>${t("brief_o2")}</b><p>${t("brief_o2_value", { s: brief.oxygen_s })}</p></div></div>
      <button class="br-go" data-id="dive-start">${ICONS.dive}<span>${t("btn_dive_start")}</span></button></div>`;
    root.append(back);
    sfx.clack?.();
    const go = back.querySelector(".br-go");
    go.focus();
    go.onclick = () => { back.remove(); resolve(); };
  });
}
