// The three officers (CLAUDE.md v3.1, 18; v3 6) live in a drawer: hold «Б» (or B, or the button)
// and the drawer springs up from the bottom; let go and it slides back. Each card is a paper note:
// an engraved portrait, name, role · algorithm and a handwritten line with the key part in red.
// "Принять совет" stays on screen at all times, next to the drawer button.
import { el, pct } from "./fmt.js";
import { portrait, TAG_ICONS } from "./art.js";
import { place } from "../places.js";
import { t, plural } from "../strings.js";

const OFFICERS = ["vera", "lev", "grisha"];

/** The joint advice as a sentence: what exactly will happen. */
export function adviceLabel(st) {
  const adv = st.advice.advice;
  if (adv.kind === "home") return t("advice_home");
  return t(`advice_${adv.kind}`, place(st, adv.action.target, { pin: true }));
}

/** handlers: {onAccept(), onAdviceHover(on), onOfficer(id)} */
export function createOfficers(root, handlers) {
  const drawer = el("aside", "off officers");
  drawer.setAttribute("aria-label", t("officers_title"));
  drawer.innerHTML = `<h2>${t("officers_title")}<small>${t("officers_release")}</small></h2>`;
  const cards = {};
  for (const id of OFFICERS) {
    const c = el("div", `oc officer officer-${id}`);
    c.innerHTML = `${portrait(id)}<div><div class="nm">${t(`${id}_name`)}</div><div class="rl">${t(`${id}_role`)}</div><q class="officer-line"></q></div>`;
    c.addEventListener("click", () => handlers.onOfficer(id));
    cards[id] = c;
    drawer.append(c);
  }

  const dock = el("div", "dock");
  const peekBtn = el("button", "pk");
  peekBtn.title = t("officers_hold");
  peekBtn.innerHTML = `<span class="kc">${t("officers_key")}</span><span><b>${t("officers_btn")}</b><small>${t("officers_hold_short")}</small></span>
    <span class="fc">${OFFICERS.map((id) => `<i class="face face-${id}">${portrait(id)}</i>`).join("")}</span>`;
  const accept = el("button", "adv accept-advice");
  accept.innerHTML = `${TAG_ICONS.check}<b class="accept-title">${t("accept_advice")}</b><small class="accept-what"></small>`;
  accept.addEventListener("click", () => handlers.onAccept());
  accept.addEventListener("mouseenter", () => handlers.onAdviceHover(true));
  accept.addEventListener("mouseleave", () => handlers.onAdviceHover(false));
  dock.append(peekBtn, accept);
  root.append(drawer, dock);

  // hold to look: keyboard Б / B (on a Russian layout Б is the comma key) or the button
  let peekOn = false;
  function peek(on) {
    if (on === peekOn) return;
    peekOn = on;
    document.body.classList.toggle("peek", on);
  }
  const isB = (e) => e.code === "KeyB" || e.code === "Comma" || e.key === "б" || e.key === "Б" || e.key === "b" || e.key === "B";
  addEventListener("keydown", (e) => {
    if (!isB(e) || e.repeat || e.target.closest?.("input, textarea")) return;
    e.preventDefault(); peek(true);
  });
  addEventListener("keyup", (e) => { if (isB(e)) peek(false); });
  addEventListener("blur", () => peek(false));
  peekBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); peekBtn.setPointerCapture(e.pointerId); peek(true); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) peekBtn.addEventListener(ev, () => peek(false));

  return {
    peek,
    update(st, busy) {
      const has = !!st.advice && st.status === "playing";
      drawer.hidden = dock.hidden = !has;
      if (!has) return;
      const { vera, lev, grisha } = st.advice;
      const vc = place(st, vera.target);
      cards.vera.querySelector(".officer-line").innerHTML =
        `${t("vera_where", { ...vc, p: pct(vera.p), s: pct(vera.sum3) })} ${t(vera.tool === "dive" ? "vera_dive" : "vera_sonar")}`;
      cards.lev.querySelector(".officer-line").innerHTML = lev.here
        ? t("lev_here", place(st, st.pos))
        : t("lev_route", { ...place(st, vera.target, { pin: true }), cells: plural(lev.cells, "cell"), h: lev.hours, f: lev.fuel });
      cards.grisha.querySelector(".officer-line").innerHTML =
        t(grisha.action === "SEARCH" ? "grisha_search" : "grisha_return", { f: grisha.fuel });
      const warn = grisha.action !== "SEARCH";
      cards.grisha.classList.toggle("warning", warn);
      peekBtn.querySelector(".face-grisha").classList.toggle("warning", warn);
      accept.querySelector(".accept-what").textContent = adviceLabel(st);
      accept.disabled = busy;
    },
  };
}
