// The player's side of the game: mouse + keys -> server API -> animated events.
// The browser never decides anything: previews and results come from Python.
import * as THREE from "three";
import { CHART_TOP_Y } from "./props.js";
import { cellToWorld, MAP_CELLS } from "./scene.js";
import { cursorTag, confirmNote, tutorialNote, endNote } from "./ui.js";
import { t, plural } from "./strings.js";

const STEP_S = 0.22;              // seconds per cell when the sub sails
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (p) => (p < 0.01 ? "<1" : String(Math.round(p * 100)));
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { key: data.error, params: data.params || {} });
  return data;
}

/** Message key from the server -> player text. */
function say(key, params = {}) {
  const map = { reef: "tip_reef", nofuel: "tip_nofuel", here: "tip_here", at_base: "tip_at_base",
                unreachable: "tip_unreachable", game_over: "tip_game_over", stranded: "stranded" };
  const p = { ...params };
  if (typeof p.p === "number") p.p = pct(p.p);
  return t(map[key] || key, p);
}

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};

export function createGame(view, table, initialState) {
  const { camera, renderer } = view;
  const { hills, effects, sub, fuel, buttons, compass, tape, legend, tallyMark } = table;
  let state = initialState;
  let busy = false;
  let hover = null;               // {kind: "cell", cell} | {kind: "action", action}
  const tip = cursorTag();

  const you = () => state.subs.you;
  const over = () => state.status !== "playing";

  // ------------------------------------------------------------------ sub on the relief
  let subCell = [...you().pos];
  let subMove = null;              // {path, t} while sailing
  let heading = THREE.MathUtils.degToRad(-25);

  function subPlace(dt) {
    let x, z, h;
    if (subMove) {
      subMove.t += dt / STEP_S;
      const i = Math.min(Math.floor(subMove.t), subMove.path.length - 1);
      const a = subMove.path[i], b = subMove.path[Math.min(i + 1, subMove.path.length - 1)];
      const f = Math.min(1, subMove.t - i);
      const e = f * f * (3 - 2 * f);                       // ease each step
      x = a[0] + (b[0] - a[0]) * e; z = a[1] + (b[1] - a[1]) * e;
      h = hills.heightAt(...a) + (hills.heightAt(...b) - hills.heightAt(...a)) * e;
      if (!same(a, b)) heading = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      if (subMove.onStep && i !== subMove.lastI) { subMove.lastI = i; subMove.onStep(i); }
      if (subMove.t >= subMove.path.length - 1) {
        subCell = [...subMove.path[subMove.path.length - 1]];
        const done = subMove.done;
        subMove = null;
        done();
      }
    }
    if (!subMove) {
      [x, z] = subCell;
      h = hills.heightAt(...subCell);
    }
    const w = cellToWorld(x, z);
    sub.group.position.set(w.x, h - CHART_TOP_Y, w.z);
    const r = sub.group.rotation;
    r.y += Math.atan2(Math.sin(heading - r.y), Math.cos(heading - r.y)) * Math.min(1, dt * 8);
  }

  function sail(path, onStep) {
    return new Promise((done) => { subMove = { path, t: 0, done, onStep, lastI: -1 }; });
  }

  // ------------------------------------------------------------------ camera shake (echo)
  const camBase = camera.position.clone();
  let shake = 0;
  function cameraShake(dt) {
    if (shake <= 0) return;
    shake = Math.max(0, shake - dt);
    const a = shake * 0.12;
    camera.position.set(camBase.x + (Math.random() - 0.5) * a, camBase.y + (Math.random() - 0.5) * a, camBase.z);
    if (shake === 0) camera.position.copy(camBase);
  }
  const flash = new THREE.PointLight(0xff6a45, 0, 6, 1.5);
  view.scene.add(flash);

  // ------------------------------------------------------------------ buttons: enabled + reasons
  /** Why an action is not possible right now (null = possible). Computed from the server state. */
  function blocked(action) {
    if (over()) return t("tip_game_over");
    if (busy) return t("busy");
    const s = you();
    if (action === "check" && s.fuel < state.costs.check) return t("tip_check_nofuel");
    if (action === "lift" && s.fuel < state.costs.lift) return t("tip_lift_nofuel");
    if (action === "home" && same(s.pos, s.base)) return t("tip_at_base");
    return null;
  }

  function refreshButtons() {
    for (const [action, b] of Object.entries(buttons)) {
      b.tag.classList.toggle("disabled", !!blocked(action));
    }
    const s = you();
    const advise = !over() && s.advice === "RETURN" && !same(s.pos, s.base);
    buttons.home.tag.classList.toggle("advice", advise);
    buttons.home.glow(advise);
  }

  function refreshAll() {
    fuel.setFuel(you().fuel);
    table.fuelTag.set(t("fuel", { f: you().fuel }));
    effects.setMarks(state.marks);
    tallyMark.set(you().checks, plural(you().checks, "checkN"));
    refreshButtons();
  }

  // ------------------------------------------------------------------ previews (hover)
  let previewSeq = 0;
  async function preview(action, cell) {
    const seq = ++previewSeq;
    const pv = await api("/api/preview", { action, cell });
    return seq === previewSeq ? pv : null;      // a newer hover replaced this one
  }

  function clearHover() {
    effects.hideRoute();
    effects.frameCell(null);
    effects.sonarZone(null);
    tip.hide();
    renderer.domElement.style.cursor = "";
  }

  async function hoverCell(cell) {
    if (busy) { effects.frameCell(cell, 0x8a8a95); tip.show([t("busy")], { warn: true }); return; }
    if (over()) { clearHover(); return; }
    effects.frameCell(cell);
    const pv = await preview("move", cell);
    if (!pv || !hover || hover.kind !== "cell" || !same(hover.cell, cell)) return;
    const name = `${state.cols[cell[0]]}${cell[1] + 1}`;
    const prob = hills.isShown() && pv.p != null ? t("tip_p", { p: pct(pv.p) }) : null;
    renderer.domElement.style.cursor = pv.ok ? "pointer" : "not-allowed";
    if (pv.ok) {
      effects.showRoute(pv.path);
      tip.show([t("tip_move", { cell: name, cells: plural(pv.cost, "cell"), n: pv.cost }), prob]);
    } else {
      effects.frameCell(cell, 0xC2412D);
      if (pv.path) effects.showRoute(pv.path, { color: 0xC2412D });
      else effects.hideRoute();
      tip.show([say(pv.reason, pv.params), pv.reason === "here" ? prob : null], { warn: pv.reason !== "here" });
    }
  }

  async function hoverAction(action) {
    const why = blocked(action);
    if (action === "check" && !why) effects.sonarZone(you().pos);
    if (why) { tip.show([why], { warn: true }); return; }
    const s = you();
    if (action === "check") tip.show([t("tip_check")]);
    if (action === "lift") {
      const p = state.P[s.pos[1]][s.pos[0]];
      tip.show([t("tip_lift"), hills.isShown() ? t("tip_p_here", { p: pct(p) }) : null]);
    }
    if (action === "hint") tip.show([t("tip_hint")]);
    if (action === "home") {
      const pv = await preview("home");
      if (!pv || !hover || hover.action !== "home") return;
      if (pv.path) effects.showRoute(pv.path, pv.ok ? {} : { color: 0xC2412D });
      tip.show(pv.ok ? [t("tip_home", { cells: plural(pv.cost, "cell") })] : [say(pv.reason, pv.params)], { warn: !pv.ok });
    }
  }

  // ------------------------------------------------------------------ playing server events
  async function play(events, before) {
    let shownFuel = before.subs.you.fuel;
    for (const ev of events) {
      if (ev.who && ev.who !== "you") continue;              // duel opponent: M5
      switch (ev.type) {
        case "move": {
          effects.showRoute(ev.path, { dashed: false });
          await sail(ev.path, (i) => { if (i > 0) fuel.setFuel(--shownFuel); });
          effects.hideRoute();
          break;
        }
        case "fuel":
          shownFuel = ev.value;
          fuel.setFuel(ev.value);
          table.fuelTag.set(t("fuel", { f: ev.value }));
          break;
        case "refuel":
          await wait(250);
          fuel.setFuel(ev.value);
          table.fuelTag.set(t("fuel", { f: ev.value }));
          await wait(600);
          break;
        case "sonar":
          effects.sonarWave(ev.cell, ev.echo);
          await wait(700);
          state.marks = [...state.marks, { cell: ev.cell, type: ev.echo ? "echo" : "silence", by: "you" }];
          effects.setMarks(state.marks);
          if (ev.echo) {
            shake = 0.35;
            flash.position.copy(hills.topOf(...ev.cell)).add(new THREE.Vector3(0, 0.6, 0));
            flash.intensity = 6;
          }
          break;
        case "belief":
          await hills.animateTo(ev.P, 400);
          break;
        case "msg":
          tape.say(say(ev.key, ev));
          if (ev.key === "low_fuel") buttons.home.glow(true);
          break;
        case "lift":
          if (ev.found) { effects.foundBox(ev.cell); await wait(1700); }
          else { await wait(250); }
          break;
        case "hint":
          effects.hintCurrent(ev.cell);
          break;
        case "stranded":
          tape.say(t("stranded"));
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ actions
  async function act(action, cell) {
    const why = blocked(action);
    if (why) { tip.show([why], { warn: true }); return; }
    if (action === "lift" && !storage.get("abyss.liftConfirmed")) {
      const ok = await confirmNote(t("lift_confirm"), t("btn_lift_do"), t("btn_cancel"));
      if (!ok) return;
      storage.set("abyss.liftConfirmed", "1");
    }
    busy = true;
    clearHover();
    refreshButtons();
    buttons[action]?.press();
    const before = state;
    try {
      const res = await api("/api/act", { action, cell });
      await play(res.events, before);
      state = res.state;
      tutorial.after(action, res.events);
    } catch (err) {
      tip.show([say(err.key || "busy", err.params)], { warn: true });
    } finally {
      busy = false;
      refreshAll();
      if (over()) finish();
    }
  }

  function finish() {
    tutorial.stop();
    const s = you();
    const won = state.status === "won";
    setTimeout(() => endNote(
      t(won ? "win" : "lose"),
      won ? t("end_win_line", { checks: plural(s.checks, "check") }) : t("end_lose_line", { n: s.checks }),
      t("again"),
      async () => { await api("/api/new", { mode: state.mode }); location.reload(); },
    ), won ? 600 : 300);
  }

  // ------------------------------------------------------------------ tutorial (section 8)
  const tutorial = (() => {
    const done = () => storage.get("abyss.tutorialDone") === "1";
    let step = 0;                                   // 1..3 sequential, then 4 (echo) / 5 (fuel)
    const note = tutorialNote(t("tut_skip"), () => { storage.set("abyss.tutorialDone", "1"); note.hide(); });
    let stopped = false;
    const show = (n) => { step = n; note.show(t(`tut${n}`)); };
    const finished = { 4: false, 5: false };
    function next() {
      if (!finished[4] && state.marks.some((m) => m.type === "echo" && m.by === "you")) return show(4);
      if (!finished[5] && you().fuel < 40 && !same(you().pos, you().base)) return show(5);
      step = 0;
      note.hide();
      if (finished[4] && finished[5]) storage.set("abyss.tutorialDone", "1");
    }
    return {
      start() { if (!done() && state.mode === "play") show(1); },
      stop() { stopped = true; note.hide(); },        // game over: no more tips this game
      after(action, events) {
        if (stopped || done() || step === 0 && finished[4] && finished[5]) return;
        if (step === 1 && action === "move") return show(2);
        if (step === 2 && action === "check") return show(3);
        if (step === 3 && action === "move") return next();
        if (step === 4 && action === "lift") { finished[4] = true; return next(); }
        if (step === 5 && action === "home") { finished[5] = true; return next(); }
        if (step === 0 && !done()) next();
      },
    };
  })();

  // ------------------------------------------------------------------ input
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CHART_TOP_Y);
  const clickables = [];
  for (const [action, b] of Object.entries(buttons)) {
    for (const obj of b.objects) { obj.userData.action = action; clickables.push(obj); }
  }

  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(clickables, true)[0];
    if (hit) {
      let o = hit.object;
      while (o && !o.userData.action) o = o.parent;
      if (o) return { kind: "action", action: o.userData.action };
    }
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, p)) return null;
    const cx = Math.floor(p.x + MAP_CELLS / 2), cy = Math.floor(p.z + MAP_CELLS / 2);
    if (cx < 0 || cy < 0 || cx >= MAP_CELLS || cy >= MAP_CELLS) return null;
    return { kind: "cell", cell: [cx, cy] };
  }

  function setHover(h) {
    const key = (x) => (x ? (x.kind === "cell" ? `c${x.cell}` : `a${x.action}`) : "");
    if (key(h) === key(hover)) return;
    hover = h;
    clearHover();
    if (!h) return;
    if (h.kind === "cell") hoverCell(h.cell);
    else { renderer.domElement.style.cursor = blocked(h.action) ? "not-allowed" : "pointer"; hoverAction(h.action); }
  }

  renderer.domElement.addEventListener("mousemove", (e) => setHover(pick(e)));
  renderer.domElement.addEventListener("mouseleave", () => setHover(null));
  renderer.domElement.addEventListener("click", (e) => {
    const h = pick(e);
    if (!h) return;
    if (h.kind === "action") act(h.action);
    else if (!same(h.cell, you().pos)) act("move", h.cell);
  });
  for (const [action, b] of Object.entries(buttons)) {        // HTML tags are buttons too
    b.tag.classList.add("interactive");
    b.tag.addEventListener("mouseenter", () => setHover({ kind: "action", action }));
    b.tag.addEventListener("mouseleave", () => setHover(null));
    b.tag.addEventListener("click", () => act(action));
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const action = { " ": "check", f: "lift", "а": "lift", r: "home", "к": "home", h: "hint", "р": "hint" }[k];
    if (action) { e.preventDefault(); act(action); return; }
    if (k === "v" || k === "м") {
      hills.setShown(!hills.isShown());
      legend.textContent = t(hills.isShown() ? "legend" : "hills_off");
      if (hover?.kind === "cell") { const h = hover; hover = null; setHover(h); }
    }
    if (k === "e" || k === "у") {
      api("/api/exam", {}).then(() => tape.say(t("exam_printed"))).catch((err) => tip.show([say(err.key)], { warn: true }));
    }
  });

  // ------------------------------------------------------------------ per frame
  function update(dt) {
    subPlace(dt);
    cameraShake(dt);
    flash.intensity *= Math.pow(0.02, dt);
  }

  refreshAll();
  tutorial.start();

  // read-only hook for the automated UI scenario (tools/ui_scenario.py)
  window.__abyss = {
    busy: () => busy,
    state: () => state,
    cellScreen: (x, y) => view.toScreen(hills.topOf(x, y)),
  };
  return { update };
}
