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
import { createGoal } from "./ui/goal.js";
import { createChapter } from "./ui/chapter.js";
import { createSpeech } from "./ui/speech.js";
import { createStoryFlow } from "./story_flow.js";
import { createWalk } from "./walk.js";
import { createDescent } from "./descent.js";
import { showResult } from "./ui/result.js";
import { ICONS } from "./ui/icons.js";
import { pct, hours } from "./ui/fmt.js";
import { place, cap } from "./places.js";
import { fade, sleep } from "./anim.js";
import { t, plural } from "./i18n.js";

const AUTOPILOT_PAUSE_MS = 1300;
const SPEAKER = {                       // who explains which event (CLAUDE.md 6.5)
  sonar_echo: "vera", sonar_silence: "vera", dive_debris: "vera", dive_empty: "vera", dive_seen: "vera",
  clue_applied: "vera", clue_rejected: "vera",
  rival_dive_empty: "lev", beacon_low: "lev", reef: "lev",
  refuel: "grisha", tow: "grisha", sonar_storm: "vera",
};

export function createTable(view, map, initialState, { cabin, dive } = {}) {
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
    { id: "menu", icon: ICONS.menu, label: t("btn_menu"), onClick: () => dispatchEvent(new CustomEvent("abyss:menu")) },
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
  // the story (CLAUDE.md 22.2): the goal and checklist on every screen, chapter cards, story lines
  const goal = createGoal(document.body, { onWho: () => intro.show() });
  goal.whoLabel = t("btn_who");
  const chapter = createChapter(document.body);
  const speech = createSpeech(document.body);
  const flow = createStoryFlow({
    view, cabin, ui, speech, chapter, toasts, intro, goal,
    getState: () => state, setState: (st) => { state = st; map.setState(st); }, render: () => render(),
    stand: (on) => stand(on, true), auto: () => autopilot, walk: () => walk,
  });
  // on foot: the deck and the cabin in first person (CLAUDE.md 22.4, 23.2)
  const walk = createWalk({
    view, cabin, speech, chapter, getState: () => state, flow: () => flow, busy: () => busy,
    onDive: () => diveFromDeck(),
  });
  const banner = document.getElementById("autopilot-banner");
  banner.textContent = t("autopilot_on");

  function render() {
    goal.update(state.campaign);
    walk?.refresh();
    if (state.dive) return;              // under water: the table waits (no previews while the dive is open)
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
    map.hover(busy ? null : cell);
    if (!cell || busy || state.status !== "playing") { tip.hide(); return; }
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
    if (busy || autopilot || !cell || state.status !== "playing" || state.campaign?.act === "prologue") return;
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
  let storyThisTurn = false;            // the story speaks this turn: Dana's v3 notes on the same result stay quiet
  const STORY_QUIET = new Set(["sonar_echo", "sonar_silence", "dive_empty", "dive_seen", "dive_debris"]);
  function speak(e) {
    if (e.type !== "msg" || !SPEAKER[e.key]) return;
    if (storyThisTurn && STORY_QUIET.has(e.key)) return;
    const params = { ...e };
    for (const k of ["p0", "p1"]) if (typeof params[k] === "number") params[k] = hours(params[k]);   // 0.4 -> "0,4"
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
    if (walk.mode !== "table") walk.toTable();
    render();
    cinema(true);
    try {
      const before = state;
      if (action.type === "decoy") {                 // act II: the decoy buoy goes over the side here
        const res = await api.decoy();
        await map.play(res.events, before, { onEvent: speak });
        flow.hold(res.story);
        state = res.state; map.setState(state); render();
        await flow.play(res.story);
        cinema(false);
        return;
      }
      const live = !!dive && !autopilot && action.tool === "dive";
      const res = await api.act(action, live);
      storyThisTurn = (res.story || []).some((i) => i.beat);
      const diveEv = live && res.state.dive && res.events.find((e) => e.type === "dive" && e.live);
      if (diveEv) {
        // sail there (the map), the dive itself (crane, under water, the search), then the rest of its hours
        const tArr = diveEv.t - state.costs.dive[0];
        const pre = res.events.filter((e) => (e.t ?? before.hours) <= tArr + 1e-6);
        const post = res.events.filter((e) => !pre.includes(e));
        await map.play(pre, before, { onEvent: speak });
        await flow.play(res.story);
        const brief = await flow.beforeDive();
        const found = await diveScene({ ...diveEv.scene, o2: brief?.oxygen_s, task: diveEv.scene.find ? brief?.task : null,
                                        onEvent: (n) => flow.diveEvent(n) });
        flow.afterDive();
        const end = await api.diveEnd(found.found && !found.find, found.coverage, found.debrisSeen, found.find);
        storyThisTurn = (end.story || []).some((i) => i.beat);
        const rivalMoves = pre.filter((e) => e.rival && e.type === "move");
        const mid = { ...before, hours: tArr, pos: diveEv.cell,
                      rival: before.rival && { ...before.rival, pos: rivalMoves.length ? rivalMoves[rivalMoves.length - 1].cell : before.rival.pos } };
        await map.play([...post, ...end.events], mid, { onEvent: speak });
        flow.hold(end.story);
        state = end.state;
        map.setState(state);
        await flow.play(end.story);
      } else {
        await map.play(res.events, before, { onEvent: speak });
        flow.hold(res.story);
        state = res.state;
        map.setState(state);
        render();
        await flow.play(res.story);
      }
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
      const accept = autopilot ? true : await radio.ask(c, flow.clueLine(c));
      map.showBand(null);
      const res = await api.clue(c.id, accept);
      state = res.state;
      res.events.forEach(speak);
      await map.setState(state, { animate: true });
      render();
      await flow.play(res.story);
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
      await sleep(AUTOPILOT_PAUSE_MS);
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

  /** Get up from the table: the captain stands in the cabin and walks (first person); E at the table sits back. */
  let standing = false;
  function stand(on = !standing, fromStory = false) {
    if (fromStory) { standing = false; hud.setActive("stand", false); return; }
    if (!on || busy || !cabin || state.campaign?.act === "prologue") return;
    setTarget(null);
    walk.enterCabin("table");
  }
  /** [E] "Lower Nerpa into the water" on the deck: back to the chart and the dive right where the ship is. */
  async function diveFromDeck() {
    if (busy || state.status !== "playing") return;
    await fade(true);
    walk.toTable();
    view.flyFrom(cabin.standPose, 3);
    await fade(false);
    await run({ type: "go", target: state.pos, tool: "dive" });
  }

  /** The dive: the descent film (23.3-B, five shots from the deck to the seabed), then the cockpit search. */
  let descent = null;
  async function diveScene(scene) {
    descent ??= createDescent(view, { getDeck: () => walk.getDeck(), dive });
    toasts.say("grisha", t("toast_crane"), 2600);
    await fade(true);
    await descent.play();
    await fade(true, "blue");
    const result = await dive.search(scene, () => fade(false), (found) => fade(true, found ? "white" : "blue"), { quick: true });
    dive.leave();
    map.resetNerpa(result.found && !result.find);
    view.follow(map.shipPoint);              // the cinema camera goes on following the ship
    await fade(false);
    return result;
  }

  /** Cinema mode during a move (CLAUDE.md v3.1, 18): the interface slides off, black bars, the camera follows the ship. */
  function cinema(on) {
    document.body.classList.toggle("cine", on);
    view.follow(on ? map.shipPoint : null);
  }

  // a live dive left unfinished (the page was reloaded under water): surface without the box
  if (state.dive) api.diveEnd(false, 0, false).then((r) => { state = r.state; map.setState(state); render(); }).catch(() => {});

  render();
  if (state.status !== "playing") finish();
  else if (state.campaign) flow.startIfNeeded();         // the tutorial is the story itself (17.3)
  else setTimeout(() => { if (!intro.showIfFirstTime()) coach.startIfFirstTime(); }, 3200);   // after the opening shot
  return {
    get state() { return state; },
    get busy() { return busy; },
    run, acceptClues, goal, chapter, speech, flow, walk,
  };
}
