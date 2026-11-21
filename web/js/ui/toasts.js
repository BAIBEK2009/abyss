// After every action an officer explains what happened (CLAUDE.md v3, 6.5): a paper note with the
// officer's medallion slides in at the top right (in the cinema mode — top centre), 2–3 s,
// a click closes it. Several in a row are queued.
import { portrait } from "./art.js";
import { el } from "./fmt.js";
import { t } from "../strings.js";

export function createToasts(root) {
  const box = el("div", "toasts");
  root.append(box);
  const queue = [];
  let showing = false;

  function next() {
    if (showing || !queue.length) return;
    showing = true;
    const { who, html, ms } = queue.shift();
    const toast = el("div", `toast toast-${who}`, `${portrait(who)}<div><div class="tn">${t(`${who}_toast`)}</div><div class="tt">${html}</div></div>`);
    box.append(toast);
    const close = () => {
      if (!toast.isConnected) return;
      toast.classList.add("out");
      setTimeout(() => { toast.remove(); showing = false; next(); }, 300);
    };
    toast.addEventListener("click", close);
    setTimeout(close, ms);
  }

  return {
    say(who, html, ms = 3000) { queue.push({ who, html, ms }); next(); },
    clear() { queue.length = 0; box.replaceChildren(); showing = false; },
  };
}
