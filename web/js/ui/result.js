// Results card (CLAUDE.md v3, 5.7 / 12): stamp, title, story, stars, a lesson in red pencil,
// three numbers and two buttons.
import { el, hours } from "./fmt.js";
import { place } from "../places.js";
import { t } from "../i18n.js";

function lessonFor(st) {
  if (st.status === "won") return st.counts.sonar === 0 ? t("lesson_sonar") : t("lesson_good");
  return st.reason === "rival" ? t("lesson_rival") : t("lesson_beacon");
}

/** handlers: {onAgain(), onNew()} */
export function showResult(root, st, handlers) {
  const won = st.status === "won";
  const kind = won ? "win" : st.reason === "rival" ? "rival" : "beacon";
  const at = st.box ? place(st, st.box).at : "?";
  const stars = won ? st.stars : 0;
  const par = st.par?.hours;
  const back = el("div", "result-back");
  const card = el("div", `result ${won ? "won" : "lost"}`);
  card.innerHTML = `
    <div class="stamp">${t(won ? "stamp_win" : "stamp_lose")}</div>
    <h2>${t(`end_${kind}_title`)}</h2>
    <p class="story">${t(`end_${kind}_story`, { at })}</p>
    <div class="stars">${[1, 2, 3].map((n) => `<svg class="star ${n <= stars ? "on" : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"/></svg>`).join("")}</div>
    <p class="lesson">${lessonFor(st)}</p>
    <div class="numbers">
      <div><b>${t("hours_unit", { h: hours(st.hours) })}</b><span>${t("num_hours")}</span></div>
      <div><b>${par != null ? t("hours_unit", { h: hours(par) }) : "—"}</b><span>${t("num_par")}</span></div>
      <div><b>${st.counts.sonar} / ${st.counts.dive}</b><span>${t("num_probes")}</span></div>
    </div>
    <div class="result-buttons"><button class="again" data-id="again">${t("again_map")}</button><button class="new" data-id="new-map">${t("new_map")}</button></div>`;
  card.querySelector(".again").onclick = handlers.onAgain;
  card.querySelector(".new").onclick = handlers.onNew;
  back.append(card);
  root.append(back);
}
