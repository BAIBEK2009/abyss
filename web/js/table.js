// The navigator's table screen: owns the mission state from Python, the "a move is under way" flag,
// event playback on the map and the table UI (HUD, rival banner, officers, action tags, toasts).
import { api } from "./api.js";
import { createHud } from "./ui/hud.js";
import { createRivalBanner } from "./ui/rival.js";
import { createOfficers } from "./ui/officers.js";
import { createActions } from "./ui/actions.js";
import { createCellTip } from "./ui/celltip.js";
import { createToasts } from "./ui/toasts.js";
import { createRadio } from "./ui/radio.js";
import { createCoach } from "./ui/coach.js";
import { createIntro } from "./ui/intro.js";
import { showResult } from "./ui/result.js";
import { ICONS } from "./ui/icons.js";
import { pct, hours } from "./ui/fmt.js";
import { place, cap } from "./places.js";
import { t, plural } from "./strings.js";

const AUTOPILOT_PAUSE_MS = 1300;
const SPEAKER = {                       // who explains which event (CLAUDE.md 6.5)
  sonar_echo: "vera", sonar_silence: "vera", dive_debris: "vera", dive_empty: "vera",
  clue_applied: "vera", clue_rejected: "vera",
  rival_dive_empty: "lev", beacon_low: "lev", reef: "lev",
  refuel: "grisha", tow: "grisha",
};

export function createTable(view, map, initialState, { cabin } = {}) {
  let state = initialState;
  let busy = false;
  let autopilot = false;
  let target = null;                    // chosen cell (red frame) or null
  const ui = document.getElementById("ui");
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

  // ------------------------------------------------------------------ widgets
  const hud = createHud(ui, [
    { id: "stand", icon: ICONS.stand, label: t("btn_stand"), onClick: () => stand() },
    { id: "autopilot", icon: ICONS.autopilot, label: t("btn_autopilot"), onClick: () => toggleAutopilot() },
    { id: "journal", icon: ICONS.journal, label: t("btn_journal_top"), soon: "M8" },
    { id: "hints", icon: ICONS.hints, label: t("btn_hints"), onClick: () => coach.start() },
    { id: "music", icon: ICONS.music, label: t("btn_music"), soon: "M11" },
    { id: "sound", icon: ICONS.sound, label: t("btn_sound"), soon: "M11" },
  ], { onWho: () => intro.show() });
  const rival = createRivalBanner(ui);
  const officers = createOfficers(ui, {
    onAccept: () => acceptAdvice(),
    onAdviceHover: (on) => previewAction(on ? state.advice?.advice.action : null, null, true),
    onOfficer: (id) => highlightOfficer(id),
  });
  const actions = createActions(ui, {
    onRun: (action) => run(action),
    onHover: (tag, pv) => previewAction(tag?.action, pv),
  });
  const toasts = createToasts(ui);
  const radio = createRadio(ui);
  const tip = createCellTip();

  // tutorial: each step highlights a part of the screen (CLAUDE.md 11)
  const rectOf = (sel) => () => document.querySelector(sel).getBoundingClientRect();
  const chartRect = () => {
    const pts = [[0, 0], [9, 0], [0, 9], [9, 9]].map(([x, y]) => map.cellScreen(x, y));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const left = Math.min(...xs) - 30, top = Math.min(...ys) - 30;
    return { left, top, width: Math.max(...xs) - left + 30, height: Math.max(...ys) - top + 30 };
  };
  const coach = createCoach(ui, [
    { title: t("coach1_t"), text: t("coach1"), rect: chartRect },
    { title: t("coach2_t"), text: t("coach2"), rect: rectOf(".dock") },
    { title: t("coach3_t"), text: t("coach3"), rect: rectOf(".actions-row") },
    { title: t("coach4_t"), text: t("coach4"), rect: rectOf(".tg") },
    { title: t("coach5_t"), text: t("coach5"), rect: rectOf(".inst") },
  ]);
  const intro = createIntro(ui, { onClose: (first) => { if (first) setTimeout(() => coach.startIfFirstTime(), 300); } });
  const banner = document.getElementById("autopilot-banner");
  banner.textContent = t("autopilot_on");

  function render() {
    hud.update(state);
    rival.update(state);
    officers.update(state, busy || autopilot);
    actions.update(state, target, busy || autopilot, (a) => api.preview(a));
  }

  // ------------------------------------------------------------------ map previews
  /** Show what an action would do: our route, the tool zone, where the rival will be by then. */
  function previewAction(action, pv, isAdvice = false) {
    if (busy) return;
    if (!action) {
      map.showAdvice(false); map.showZone(null); map.showForecast(null);
      map.setRoute("ours", target ? courseTo(target) : null);
      return;
    }
    const dest = action.type === "home" ? state.base : action.target;
    if (isAdvice) map.showAdvice(true);
    else if (pv) map.setRoute("ours", pv.path.length > 1 ? pv.path : null);
    map.showZone(action.tool ? dest : null, action.tool);
    if (pv?.rival) map.showForecast(pv.rival.pos);
    else if (isAdvice) api.preview(action).then((p) => { if (!busy) map.showForecast(p.rival?.pos); }).catch(() => {});
  }

  const courses = new Map();            // cell -> preview of "just sail there" (per turn)
  let coursesTurn = -1;
  function courseTo(cell) { return courses.get(cell.join(","))?.path ?? null; }
  async function coursePreview(cell) {
    if (coursesTurn !== state.counts.actions + state.hours) { courses.clear(); coursesTurn = state.counts.actions + state.hours; }
    const key = cell.join(",");
    if (!courses.has(key)) courses.set(key, await api.preview({ type: "go", target: cell, tool: null }).catch(() => null));
    return courses.get(key);
  }

  /** Click on an officer card lights up the thing it talks about on the map. */
  function highlightOfficer(id) {
    if (!state.advice) return;
    if (id === "vera") map.pulse(state.advice.vera.target, 0xE3A635);
    if (id === "lev") { map.showAdvice(true); setTimeout(() => map.showAdvice(false), 1800); }
    if (id === "grisha") map.pulse(state.base, 0xE3A635);
  }

  // ------------------------------------------------------------------ cells: hover tip and selection
  const isReef = (c) => state.reefs.some((r) => same(r, c));
  const seenEmpty = (c) => state.probes.some((p) => p.kind === "dive" && p.result === "nothing" && same(p.cell, c));
  let hoverCell = null;
  async function onHoverCell(cell) {
    if (same(cell, hoverCell)) return;
    hoverCell = cell;
    map.hover(cell);
    if (!cell || state.status !== "playing") { tip.hide(); return; }
    const big = `${place(state, cell).name} · ${pct(state.P[cell[1]][cell[0]])} %`;
    const extra = seenEmpty(cell) ? t("tip_seen_empty") : null;
    if (isReef(cell)) return tip.show(big, [t("tip_reef")]);
    if (same(cell, state.pos)) return tip.show(big, [t("tip_here"), extra]);
    tip.show(big, ["…", extra]);
    const pv = await coursePreview(cell);
    if (!same(cell, hoverCell) || !pv) return;
    tip.show(big, [t("tip_course", { cells: plural(pv.cells, "cell"), h: hours(pv.hours), f: pv.fuel }), extra]);
  }
  async function onClickCell(cell) {
    if (busy || autopilot || !cell || state.status !== "playing") return;
    if (isReef(cell)) { toasts.say("lev", t("toast_reef")); return; }
    if (same(cell, target) || same(cell, state.pos)) { setTarget(null); return; }   // second click clears
    setTarget(cell);
  }
  async function setTarget(cell) {
    target = cell;
    map.target(cell);
    map.setRoute("ours", null);
    if (cell) {
      const pv = await coursePreview(cell);
      if (same(target, cell) && pv) map.setRoute("ours", pv.path.length > 1 ? pv.path : null);
    }
    render();
  }
  const canvas = view.renderer.domElement;
  canvas.addEventListener("mousemove", (e) => onHoverCell(map.cellAt(e.clientX, e.clientY)));
  canvas.addEventListener("mouseleave", () => onHoverCell(null));
  canvas.addEventListener("click", (e) => onClickCell(map.cellAt(e.clientX, e.clientY)));

  // ------------------------------------------------------------------ actions
  function speak(e) {
    if (e.type !== "msg" || !SPEAKER[e.key]) return;
    const params = { ...e };
    if (typeof e.cell === "string") {            // the core names cells "E5": turn it into a place
      const c = [state.cols.indexOf(e.cell[0]), Number(e.cell.slice(1)) - 1];
      const pl = place(state, c);
      Object.assign(params, pl, { At: cap(pl.at) });
    }
    toasts.say(SPEAKER[e.key], t(`toast_${e.key}`, params));
  }

  async function run(action) {
    if (busy || state.status !== "playing") return;
    busy = true;
    target = null;
    map.showAdvice(false); map.showZone(null); map.showForecast(null); map.target(null); map.setRoute("ours", null);
    tip.hide();
    officers.peek(false);
    if (standing) stand(false);
    render();
    cinema(true);
    try {
      const before = state;
      const res = await api.act(action);
      await map.play(res.events, before, { onEvent: speak });
      state = res.state;
      map.setState(state);
      if (!autopilot || state.status !== "playing") cinema(false);
      if (state.status === "playing") await handleClues();
    } catch (err) {
      cinema(false);
      if (err.key === "reef") toasts.say("lev", t("toast_reef"));
    } finally {
      busy = false;
      render();
      if (state.status !== "playing") finish();
    }
  }

  /** Radio clues that arrived during the move: the captain decides (the autopilot always accepts). */
  async function handleClues() {
    for (const c of state.clues) {
      if (c.kind === "coast") map.showBand(c.axis, c.start, c.start + 2);    // the strip is marked on the chart
      const accept = autopilot ? true : await radio.ask(c);
      map.showBand(null);
      const res = await api.clue(c.id, accept);
      state = res.state;
      res.events.forEach(speak);
      await map.setState(state, { animate: true });
    }
  }
  async function acceptClues() { await handleClues(); render(); }

  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    toggleAutopilot(false);
    setTimeout(() => showResult(ui, state, {
      onAgain: async () => { await api.newGame(state.seed); location.reload(); },
      onNew: async () => { await api.newGame(null); location.reload(); },
    }), 900);
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
    if (on && state.status !== "playing") return;
    autopilot = on;
    if (!on && !busy) cinema(false);
    hud.setActive("autopilot", on);
    banner.hidden = !on;
    if (on) setTarget(null);
    render();
    if (on) autopilotLoop();
  }

  /** Get up from the table and look at the cabin; the second press sits back down. */
  let standing = false;
  function stand(on = !standing) {
    if (on && (busy || !cabin)) return;
    standing = on;
    hud.setActive("stand", on);
    document.body.classList.toggle("standing", on);
    view.pose(on ? cabin.standPose : null);
  }

  /** Cinema mode during a move (CLAUDE.md v3.1, 18): the interface slides off, black bars, the camera follows the ship. */
  function cinema(on) {
    document.body.classList.toggle("cine", on);
    view.follow(on ? map.shipPoint : null);
  }

  render();
  if (state.status !== "playing") finish();
  else setTimeout(() => { if (!intro.showIfFirstTime()) coach.startIfFirstTime(); }, 3200);   // after the opening shot
  return {
    get state() { return state; },
    get busy() { return busy; },
    run, acceptClues,
  };
}
