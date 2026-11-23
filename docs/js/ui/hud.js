// HUD as things on the table (CLAUDE.md v3.1, 18 / 4.4): top left the caption with the mission goal
// (always on screen) and "Who is who", under it two brass instruments, the beacon and the fuel;
// top right the table buttons with an icon and a label each.
import { el, hours } from "./fmt.js";
import { dialSvg, dialAngle } from "./art.js";
import { t } from "../i18n.js";

function instrument(kind, label) {
  const d = el("div", `dial dial-${kind}`, `${dialSvg(kind)}<span>${label}</span>`);
  const needle = d.querySelector(".needle"), value = d.querySelector(".dial-value");
  return {
    el: d,
    set(v, text, low) {
      needle.style.transform = `rotate(${dialAngle(kind, v)}deg)`;
      value.textContent = text;
      d.classList.toggle("low", low);
    },
  };
}

/** buttons: [{id, icon, label, onClick, soon}] — `soon` = the milestone that brings it (disabled until then). */
export function createHud(root, buttons, { onWho }) {
  const cap = el("div", "cap");
  cap.innerHTML = `<div><h1>${t("cap_title")}</h1><small>${t("goal")}</small></div>`;
  const who = el("button", "pill who", t("btn_who"));
  who.addEventListener("click", onWho);
  cap.append(who);

  const inst = el("div", "inst");
  const beacon = instrument("beacon", t("beacon"));
  const fuel = instrument("fuel", t("fuel_label"));
  const voice = instrument("beacon", t("voice_beacon"));       // act III: the voice recorder's 30 h (17.6)
  voice.el.classList.add("dial-voice"); voice.el.hidden = true;
  inst.append(beacon.el, fuel.el, voice.el);

  const right = el("div", "hud-right");
  const btns = {};
  for (const b of buttons) {
    const btn = el("button", "pill hud-btn", `${b.icon}<span>${b.label}</span>`);
    btn.dataset.id = b.id;
    if (b.soon) {
      btn.classList.add("soon");
      btn.title = t("soon", { m: b.soon });
      btn.setAttribute("aria-disabled", "true");
    } else btn.addEventListener("click", b.onClick);
    btns[b.id] = btn;
    right.append(btn);
  }
  root.append(cap, inst, right);

  return {
    buttons: btns,
    update(st) {
      beacon.set(st.beacon_left, t("beacon_value", { h: hours(Math.max(0, st.beacon_left)) }), st.beacon_left < 30);
      fuel.set(st.fuel, String(Math.max(0, st.fuel)), st.fuel < 35);
      const v = st.campaign?.cvr_left;
      voice.el.hidden = v == null;
      if (v != null) voice.set(v * 4, t("beacon_value", { h: hours(Math.max(0, v)) }), v < 10);
    },
    setActive(id, on) { btns[id]?.classList.toggle("active", on); },
  };
}
