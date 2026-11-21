// The rival's plan as an intercepted telegram pinned to the table (CLAUDE.md v3.1, 18; v3 5.6 / 6.6):
// an honest forecast, typed out when it changes. A dive that ends within 8 h gets the "urgent" stamp
// and the telegram pulses.
import { el, hours } from "./fmt.js";
import { place } from "../places.js";
import { t } from "../i18n.js";

export function createRivalBanner(root) {
  const b = el("div", "tg rival-banner");
  b.innerHTML = `<div class="hd"><span class="tg-when"></span><span class="st"></span></div><span class="tg-body"></span>`;
  root.append(b);
  const body = b.querySelector(".tg-body"), when = b.querySelector(".tg-when"), stamp = b.querySelector(".st");
  let shown = "", typing = null;

  function type(html) {
    if (html === shown) return;
    shown = html;
    clearInterval(typing);
    // type the plain text, then swap in the marked-up version
    const plain = html.replace(/<[^>]+>/g, "");
    let i = 0;
    typing = setInterval(() => {
      body.textContent = plain.slice(0, (i += 2));
      if (i >= plain.length) { clearInterval(typing); body.innerHTML = html; }
    }, 22);
  }

  return {
    update(st) {
      b.hidden = !st.rival || st.status !== "playing";
      if (b.hidden) return;
      when.textContent = t("tg_when", { h: Math.round(st.hours) });
      const plan = st.rival?.plan;
      if (!plan) { type(t("tg_done")); b.classList.remove("urgent"); stamp.textContent = t("tg_stamp"); return; }
      const pl = place(st, plan.target);
      const tool = t(plan.tool === "dive" ? "tg_tool_dive" : "tg_tool_sonar");
      let text = plan.arrive_in > 0
        ? t("tg_going", { to: `<b>${pl.to.toUpperCase()}</b>`, h: hours(plan.arrive_in), tool })
        : t("tg_there", { at: `<b>${pl.at.toUpperCase()}</b>`, h: hours(plan.tool_end_in), tool });
      if (plan.tool === "dive") text += t("tg_dive_tail", { h: hours(plan.tool_end_in) });
      type(text);
      const urgent = plan.tool === "dive" && plan.tool_end_in <= 8;
      b.classList.toggle("urgent", urgent);
      stamp.textContent = t(urgent ? "tg_stamp_urgent" : "tg_stamp");
    },
  };
}
