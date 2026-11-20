// The three officers (CLAUDE.md v3, 6): paper notes with a portrait, name, role · algorithm and a
// handwritten line with the key part in red pencil; plus the "Accept advice" button.
import { PORTRAITS, ICONS } from "./icons.js";
import { el, pct, cellName } from "./fmt.js";
import { t, plural } from "../strings.js";

const OFFICERS = ["vera", "lev", "grisha"];

/** The joint advice as a sentence: what exactly will happen. */
export function adviceLabel(st) {
  const adv = st.advice.advice;
  if (adv.kind === "home") return t("advice_home");
  return t(`advice_${adv.kind}`, { cell: cellName(st.cols, adv.action.target) });
}

/** handlers: {onAccept(), onAdviceHover(on), onOfficer(id)} */
export function createOfficers(root, handlers) {
  const panel = el("div", "officers");
  const cards = {};
  for (const id of OFFICERS) {
    const c = el("div", `officer officer-${id}`);
    c.innerHTML = `${PORTRAITS[id]}<div class="officer-text">
        <div class="officer-name">${t(`${id}_name`)} <span>${t(`${id}_role`)}</span></div>
        <p class="officer-line"></p></div>`;
    c.addEventListener("click", () => handlers.onOfficer(id));
    cards[id] = c;
    panel.append(c);
  }
  const accept = el("button", "accept-advice");
  accept.innerHTML = `${ICONS.check}<span class="accept-title">${t("accept_advice")}</span><span class="accept-what"></span>`;
  accept.addEventListener("click", () => handlers.onAccept());
  accept.addEventListener("mouseenter", () => handlers.onAdviceHover(true));
  accept.addEventListener("mouseleave", () => handlers.onAdviceHover(false));
  panel.append(accept);
  root.append(panel);

  return {
    update(st, busy) {
      panel.hidden = !st.advice;
      if (!st.advice) return;
      const { vera, lev, grisha } = st.advice;
      const vc = cellName(st.cols, vera.target);
      cards.vera.querySelector(".officer-line").innerHTML =
        `${t("vera_where", { cell: vc, p: pct(vera.p), s: pct(vera.sum3) })} ${t(vera.tool === "dive" ? "vera_dive" : "vera_sonar")}`;
      cards.lev.querySelector(".officer-line").innerHTML = lev.here
        ? t("lev_here", { cell: vc })
        : t("lev_route", { cell: vc, cells: plural(lev.cells, "cell"), h: lev.hours, f: lev.fuel });
      cards.grisha.querySelector(".officer-line").innerHTML =
        t(grisha.action === "SEARCH" ? "grisha_search" : "grisha_return", { f: grisha.fuel });
      cards.grisha.classList.toggle("warning", grisha.action !== "SEARCH");
      accept.querySelector(".accept-what").textContent = adviceLabel(st);
      accept.disabled = busy;
    },
  };
}
