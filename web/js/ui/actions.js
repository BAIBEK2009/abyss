// Action tags at the bottom (CLAUDE.md v3, 7 / 8): verb + object + place, icon, cost and chance
// visible before pressing, the rival's forecast for those hours, red warnings, advice outlined in gold.
// Every number comes from /api/preview (the Python core).
import { ICONS } from "./icons.js";
import { el, hours, pct } from "./fmt.js";
import { place } from "../places.js";
import { t } from "../strings.js";

/** Which tags to show: without a target — act here; with a target — go there (+ tool). */
export function tagList(st, target) {
  const here = place(st, st.pos);
  const atBase = st.pos[0] === st.base[0] && st.pos[1] === st.base[1];
  const tags = [];
  if (!target) {
    tags.push({ id: "sonar_here", icon: ICONS.sonar, label: t("tag_sonar_here", here), desc: t("desc_sonar"),
                action: { type: "go", target: st.pos, tool: "sonar" } });
    tags.push({ id: "dive_here", icon: ICONS.dive, label: t("tag_dive_here", here), desc: t("desc_dive"),
                action: { type: "go", target: st.pos, tool: "dive" } });
  } else {
    const c = place(st, target, { pin: true });
    tags.push({ id: "go_sonar", icon: ICONS.sonar, label: t("tag_go_sonar", c), desc: t("desc_sonar"),
                action: { type: "go", target, tool: "sonar" } });
    tags.push({ id: "go_dive", icon: ICONS.dive, label: t("tag_go_dive", c), desc: t("desc_dive"),
                action: { type: "go", target, tool: "dive" } });
    tags.push({ id: "go_only", icon: ICONS.move, label: t("tag_go_only", c), desc: t("desc_go"),
                action: { type: "go", target, tool: null } });
  }
  if (!atBase) tags.push({ id: "home", icon: ICONS.home, label: t("tag_home"), desc: t("desc_home"), action: { type: "home" } });
  return tags;
}

const sameAction = (a, b) => a && b && a.type === b.type &&
  (a.type === "home" || (a.target[0] === b.target[0] && a.target[1] === b.target[1] && (a.tool ?? null) === (b.tool ?? null)));

/** handlers: {onRun(action), onHover(tag, preview | null)} */
export function createActions(root, handlers) {
  const bar = el("div", "actions");
  const hint = el("div", "actions-hint");
  const row = el("div", "actions-row");
  bar.append(hint, row);
  root.append(bar);
  let seq = 0;

  function chip(text, cls = "") { return `<span class="chip ${cls}">${text}</span>`; }

  function renderTag(tag, pv, st, advised) {
    const b = el("button", "tag-action");
    b.title = tag.desc;
    if (advised) b.classList.add("advised");
    let chips = "";
    let foot = "";
    if (pv) {
      chips += chip(t("chip_hours", { h: hours(pv.hours) }));
      chips += tag.action.type === "home" ? chip(t("chip_refuel")) : chip(t("chip_fuel", { f: pv.fuel }));
      if (pv.chance?.echo != null) chips += chip(t("chip_echo", { p: pct(pv.chance.echo) }), "chance");
      if (pv.chance?.find != null) chips += chip(t("chip_find", { p: pct(pv.chance.find) }), "chance");
      const warns = pv.risky.map((k) => t(`warn_${k}`));
      if (pv.empty && tag.action.tool === "dive") warns.push(t("warn_empty"));
      if (warns.length) foot = `<span class="tag-warn">${ICONS.warn}${warns.join(" · ")}</span>`;
      else if (pv.rival) {
        const r = pv.rival;
        if (r.dive_done) foot = `<span class="tag-rival urgent">${t("rival_will_dive", place(st, r.dive_done.cell))}</span>`;
        else {
          const moved = r.pos[0] !== st.rival.pos[0] || r.pos[1] !== st.rival.pos[1];
          foot = `<span class="tag-rival">${t(moved ? "rival_will_reach" : "rival_will_stay", place(st, r.pos))}</span>`;
        }
      }
    }
    b.innerHTML = `${advised ? `<span class="advice-badge">${t("advice_badge")}</span>` : ""}
      <span class="tag-title">${tag.icon}<span>${tag.label}</span></span>
      <span class="tag-chips">${chips}</span>${foot}`;
    b.addEventListener("mouseenter", () => handlers.onHover(tag, pv));
    b.addEventListener("mouseleave", () => handlers.onHover(null, null));
    b.addEventListener("click", () => handlers.onRun(tag.action));
    return b;
  }

  return {
    /** Rebuild tags for the current state / target (fetches previews). */
    async update(st, target, busy, preview) {
      const my = ++seq;
      bar.hidden = st.status !== "playing";
      if (bar.hidden) return;
      hint.innerHTML = target
        ? t("hint_target", { ...place(st, target), p: pct(st.P[target[1]][target[0]]) })
        : t("hint_none", place(st, st.pos));
      const tags = tagList(st, target);
      const previews = await Promise.all(tags.map((tg) => preview(tg.action).catch(() => null)));
      if (my !== seq) return;                       // a newer update replaced this one
      const advice = st.advice?.advice?.action;
      row.replaceChildren(...tags.map((tg, i) => renderTag(tg, previews[i], st, sameAction(tg.action, advice))));
      this.setBusy(busy);
    },
    setBusy(busy) { bar.classList.toggle("busy", busy); row.querySelectorAll("button").forEach((b) => { b.disabled = busy; }); },
  };
}
