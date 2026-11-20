// The navigator's table screen: owns the mission state from Python, the "a move is under way" flag,
// event playback on the map and the table UI (HUD, rival banner, officers; tags and radio next).
import { api } from "./api.js";
import { createHud } from "./ui/hud.js";
import { createRivalBanner } from "./ui/rival.js";
import { createOfficers } from "./ui/officers.js";
import { ICONS } from "./ui/icons.js";
import { t } from "./strings.js";

const AUTOPILOT_PAUSE_MS = 1300;

export function createTable(view, map, initialState) {
  let state = initialState;
  let busy = false;
  let autopilot = false;
  const ui = document.getElementById("ui");

  // ------------------------------------------------------------------ widgets
  const hud = createHud(ui, [
    { id: "stand", icon: ICONS.stand, label: t("btn_stand"), soon: "M7" },
    { id: "autopilot", icon: ICONS.autopilot, label: t("btn_autopilot"), onClick: () => toggleAutopilot() },
    { id: "journal", icon: ICONS.journal, label: t("btn_journal_top"), soon: "M8" },
    { id: "hints", icon: ICONS.hints, label: t("btn_hints"), soon: "M6" },
    { id: "music", icon: ICONS.music, label: t("btn_music"), soon: "M8" },
    { id: "sound", icon: ICONS.sound, label: t("btn_sound"), soon: "M8" },
  ]);
  const rival = createRivalBanner(ui);
  const officers = createOfficers(ui, {
    onAccept: () => acceptAdvice(),
    onAdviceHover: (on) => showAdvicePreview(on),
    onOfficer: (id) => highlightOfficer(id),
  });
  const banner = document.getElementById("autopilot-banner");
  banner.textContent = t("autopilot_on");

  function render() {
    hud.update(state);
    rival.update(state);
    officers.update(state, busy || autopilot);
  }

  // ------------------------------------------------------------------ hover previews from the officers
  function showAdvicePreview(on) {
    if (busy || !state.advice) return;
    map.showAdvice(on);
    const adv = state.advice.advice.action;
    if (on && adv.type === "go") map.showZone(adv.target, adv.tool);
    else map.showZone(null);
  }

  /** Click on an officer card lights up the thing it talks about on the map. */
  function highlightOfficer(id) {
    if (!state.advice) return;
    if (id === "vera") map.pulse(state.advice.vera.target, 0xE3A635);
    if (id === "lev") { map.showAdvice(true); setTimeout(() => map.showAdvice(false), 1800); }
    if (id === "grisha") map.pulse(state.base, 0xE3A635);
  }

  // ------------------------------------------------------------------ actions
  async function run(action) {
    if (busy || state.status !== "playing") return;
    busy = true;
    map.showAdvice(false); map.showZone(null); map.target(null); map.setRoute("ours", null);
    render();
    try {
      const before = state;
      const res = await api.act(action);
      await map.play(res.events, before);
      state = res.state;
      map.setState(state);
    } finally {
      busy = false;
      render();
    }
  }

  async function acceptClues() {
    for (const c of state.clues) {
      const res = await api.clue(c.id, true);
      state = res.state;
      await map.setState(state, { animate: true });
    }
  }

  async function acceptAdvice() {
    if (busy || !state.advice) return;
    await run(state.advice.advice.action);
  }

  // ------------------------------------------------------------------ autopilot (CLAUDE.md 10)
  async function autopilotLoop() {
    while (autopilot && state.status === "playing") {
      await acceptClues();
      await run(state.advice.advice.action);
      await new Promise((r) => setTimeout(r, AUTOPILOT_PAUSE_MS));
    }
    if (state.status !== "playing") toggleAutopilot(false);
  }
  function toggleAutopilot(on = !autopilot) {
    autopilot = on;
    hud.setActive("autopilot", on);
    banner.hidden = !on;
    render();
    if (on) autopilotLoop();
  }

  render();
  return {
    get state() { return state; },
    get busy() { return busy; },
    run, acceptClues,
    setState(st) { state = st; map.setState(st, { animate: true }); render(); },
  };
}
