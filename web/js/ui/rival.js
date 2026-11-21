// The rival banner (CLAUDE.md v3, 5.6 / 6.6): an honest forecast of Poseidon-2's plan.
import { ICONS } from "./icons.js";
import { el, hours } from "./fmt.js";
import { place } from "../places.js";
import { t } from "../strings.js";

export function createRivalBanner(root) {
  const b = el("div", "rival-banner");
  b.innerHTML = `<span class="rival-icon">${ICONS.ship}</span><p></p>`;
  root.append(b);
  const p = b.querySelector("p");
  return {
    update(st) {
      const plan = st.rival?.plan;
      b.hidden = !st.rival || st.status !== "playing";      // after the end the results card says it all
      if (!plan) { p.innerHTML = `<b>${t("rival_name")}</b> ${t("rival_done")}`; b.classList.remove("urgent"); return; }
      const pl = place(st, plan.target);
      const tool = t(plan.tool === "dive" ? "rival_tool_dive" : "rival_tool_sonar");
      let text = plan.arrive_in > 0
        ? t("rival_going", { to: `<b>${pl.to}</b>`, h: hours(plan.arrive_in), tool })
        : t("rival_there", { at: `<b>${pl.at}</b>`, h: hours(plan.tool_end_in), tool });
      if (plan.tool === "dive") text += t("rival_dive_tail", { h: hours(plan.tool_end_in) });
      p.innerHTML = `<b>${t("rival_name")}</b> ${text}`;
      // a dive that ends within 8 h: the banner pulses
      b.classList.toggle("urgent", plan.tool === "dive" && plan.tool_end_in <= 8);
    },
  };
}
