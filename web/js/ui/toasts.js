// After every action an officer explains what happened (CLAUDE.md v3, 6.5): a toast at the top,
// 2–3 s, a click closes it. Several in a row are queued.
import { PORTRAITS } from "./icons.js";
import { el } from "./fmt.js";

export function createToasts(root) {
  const box = el("div", "toasts");
  root.append(box);
  const queue = [];
  let showing = false;

  function next() {
    if (showing || !queue.length) return;
    showing = true;
    const { who, html, ms } = queue.shift();
    const toast = el("div", `toast toast-${who}`, `${PORTRAITS[who]}<p>${html}</p>`);
    box.append(toast);
    const close = () => {
      if (!toast.isConnected) return;
      toast.classList.add("out");
      setTimeout(() => { toast.remove(); showing = false; next(); }, 220);
    };
    toast.addEventListener("click", close);
    setTimeout(close, ms);
  }

  return {
    say(who, html, ms = 2600) { queue.push({ who, html, ms }); next(); },
    clear() { queue.length = 0; box.replaceChildren(); showing = false; },
  };
}
