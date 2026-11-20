// Tooltip next to the cursor over a cell: "F4 23 %" in big red pencil + a course / reef / here line.
import { el } from "./fmt.js";

export function createCellTip() {
  const tip = el("div", "cell-tip");
  tip.hidden = true;
  document.body.append(tip);
  let x = 0, y = 0;
  window.addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; if (!tip.hidden) place(); });
  const place = () => { tip.style.transform = `translate(${x + 18}px, ${y + 14}px)`; };
  return {
    show(big, lines) {
      tip.innerHTML = `<span class="cell-tip-big">${big}</span>${lines.filter(Boolean).map((l) => `<span>${l}</span>`).join("")}`;
      tip.hidden = false;
      place();
    },
    hide() { tip.hidden = true; },
  };
}
