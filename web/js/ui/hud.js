// HUD: mission goal + "Beacon" and "Fuel" gauges (top left), the table buttons (top right).
import { ICONS } from "./icons.js";
import { el, hours } from "./fmt.js";
import { t } from "../strings.js";

const BEACON_MAX = 120, FUEL_MAX = 100;

function gauge(icon, label) {
  const g = el("div", "gauge");
  g.innerHTML = `<div class="gauge-head">${icon}<span class="gauge-label">${label}</span><span class="gauge-value"></span></div>
                 <div class="gauge-bar"><div class="gauge-fill"></div></div>`;
  return {
    el: g,
    set(value, max, text, low) {
      g.querySelector(".gauge-value").textContent = text;
      g.querySelector(".gauge-fill").style.width = `${Math.max(0, Math.min(1, value / max)) * 100}%`;
      g.classList.toggle("low", low);
    },
  };
}

/**
 * buttons: [{id, icon, label, onClick, soon}] — `soon` = the milestone that brings it (disabled until then).
 */
export function createHud(root, buttons) {
  const left = el("div", "hud hud-left");
  left.append(el("div", "hud-goal", `${ICONS.target}<span>${t("goal")}</span>`));
  const beacon = gauge(ICONS.clock, t("beacon"));
  const fuel = gauge(ICONS.fuel, t("fuel_label"));
  const gauges = el("div", "hud-gauges");
  gauges.append(beacon.el, fuel.el);
  left.append(gauges);

  const right = el("div", "hud hud-right");
  const btns = {};
  for (const b of buttons) {
    const btn = el("button", "hud-btn", `${b.icon}<span>${b.label}</span>`);
    if (b.soon) {
      btn.classList.add("soon");
      btn.title = t("soon", { m: b.soon });
      btn.setAttribute("aria-disabled", "true");
    } else {
      btn.addEventListener("click", b.onClick);
    }
    btns[b.id] = btn;
    right.append(btn);
  }
  root.append(left, right);

  return {
    buttons: btns,
    update(st) {
      const left_h = st.beacon_left;
      beacon.set(left_h, BEACON_MAX, t("beacon_value", { h: hours(left_h) }), left_h < 30);
      fuel.set(st.fuel, FUEL_MAX, t("fuel_value", { f: st.fuel }), st.fuel < 35);
    },
    setActive(id, on) { btns[id]?.classList.toggle("active", on); },
  };
}
