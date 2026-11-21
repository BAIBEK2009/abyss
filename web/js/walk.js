// On foot (CLAUDE.md 22.4, 23.2): the deck of «Tulpar» and the cabin in first person, the binoculars.
// Modes: "table" (the chart, the old view) | "deck" | "bino" (looking through the binoculars) | "cabin".
// The next step is always marked (the waypoint): it follows the act's checklist. Things say what E does
// ("[E] Take the binoculars", texts from story.deck.prompts) and get a soft outline when looked at.
import * as THREE from "three";
import { createDeck } from "./scenes/deck.js";
import { createFirstPerson } from "./fp.js";
import { createFpUi } from "./ui/fpui.js";
import { story } from "./story.js";
import { sfx } from "./audio.js";
import { fade, sleep } from "./anim.js";
import { el } from "./ui/fmt.js";
import { t } from "./i18n.js";

const FOV = 64;

/**
 * ctx: { view, cabin, speech, chapter, getState(), flow() -> the story flow, onDive(), onSit() }
 */
export function createWalk(ctx) {
  const { view, cabin, speech } = ctx;
  let deck = null;
  let mode = "table";
  let busy = false;                    // a transition (fade) is running
  const prompts = () => story()?.deck?.prompts ?? {};
  const camp = () => ctx.getState().campaign;
  const prologue = () => camp()?.act === "prologue";
  const tasks = () => camp()?.tasks ?? [];

  const blocked = () => busy || document.body.classList.contains("menu-open") || ctx.chapter.open
    || !!document.querySelector(".gcards, .brief-back, .result-back");
  const fp = createFirstPerson(view, {
    onStep: (kind, run) => sfx.step?.(kind, run),
    onLockLost: () => { if (!document.body.classList.contains("menu-open")) dispatchEvent(new CustomEvent("abyss:menu-open")); },
    isBlocked: blocked,
    onLockedClick: () => speech.next(),
  });
  const ui = createFpUi(view, { onUse: () => (mode === "bino" ? leaveBino() : fp.use()) });
  fp.onFocus((th) => {
    view.outline(th ? th.show : []);
    ui.setPrompt(th ? th.prompt() : null);
  });
  addEventListener("abyss:menu-closed", () => { if (fp.active && matchMedia("(pointer: fine)").matches) fp.lock(); });

  // ---------------------------------------------------------------- things to use
  function deckThings() {
    const o = deck.objects, P = prompts();
    return [
      { id: "radio", ...o.radio, prompt: () => (prologue() && !tasks()[0] ? P.radio : null), use: answerRadio },
      { id: "binoculars", ...o.binoculars, prompt: () => (!prologue() || tasks()[0] ? P.binoculars : null), use: takeBinoculars },
      { id: "stairs", ...o.stairs, prompt: () => (!prologue() || tasks()[1] ? P.stairs : null), use: () => ctx.flow().downstairs() },
      { id: "nerpa", ...o.nerpa, prompt: () => (canDive() ? P.nerpa : null), use: () => ctx.onDive() },
    ];
  }
  function cabinThings() {
    const o = cabin.things, P = prompts();
    return [
      { id: "table", ...o.table, prompt: () => (!prologue() || tasks()[2] ? P.table : null), use: () => ctx.flow().sitAtTable() },
      { id: "stairs_up", ...o.stairs_up, prompt: () => (!prologue() || tasks()[2] ? P.stairs_up : null), use: () => upstairs() },
    ];
  }
  function canDive() {
    const st = ctx.getState();
    return !prologue() && st.status === "playing" && !st.dive && !ctx.busy();
  }

  // ---------------------------------------------------------------- the waypoint: the next step
  const v = new THREE.Vector3();
  function waypoint() {
    if (!fp.active) return null;
    const tk = tasks();
    let id = null;
    if (prologue()) {
      if (mode === "deck") id = !tk[0] ? "radio" : !tk[1] ? "binoculars" : "stairs";
      else if (mode === "cabin") id = tk[2] ? "table" : null;
    } else if (mode === "cabin") id = "table";
    if (!id) return null;
    if (mode === "deck") {
      const th = deck.objects[id];
      return () => deck.space.toWorld(th.look[0], th.look[1] + 0.55, th.look[2], v);
    }
    const th = cabin.things[id];
    return () => cabin.space.toWorld(th.look[0] * 12, (th.look[1] + 0.5) * 12, th.look[2] * 12, v);
  }
  function refresh() {
    ui.setTarget(mode === "bino" ? binoTarget() : waypoint());
    if (deck) deck.radioCalling = prologue() && !tasks()[0];
  }

  // ---------------------------------------------------------------- modes
  function ensureDeck() {
    if (!deck) deck = createDeck(view, { lifeLabel: prompts().lifering ?? "" });
    return deck;
  }
  function enterDeck(start) {
    ensureDeck();
    fp.leave();
    hideBino(); fp.lookOnly = false;
    // no bloom on the deck: the sea's moon path overflows the half-float buffer and bloom turns it into
    // black blocks; the lights have their own soft halos (sprites)
    view.useScene(deck.scene, { bloom: false });
    view.camera.far = 9000; view.setFov(FOV);
    mode = "deck";
    document.body.classList.add("walking", "on-deck");
    document.body.classList.remove("in-cabin", "standing");
    speech.place = "deck";
    fp.enter(deck.space, start ?? deck.spawn, deckThings());
    sfx.outside?.(true);
    refresh();
    ui.hints(Object.values(story()?.deck?.hints ?? {}));
  }
  function enterCabin(where = "stairs") {
    fp.leave();
    if (deck) { view.useScene(null); }
    view.camera.far = 260;
    view.drive(true); view.setFov(FOV);
    mode = "cabin";
    document.body.classList.add("walking", "in-cabin");
    document.body.classList.remove("on-deck", "standing");
    speech.place = "deck";
    fp.enter(cabin.space, cabin.spawn[where], cabinThings());
    sfx.outside?.(false);
    refresh();
  }
  /** Back to the chart: from the cabin the camera glides from the eyes down to the table. */
  function toTable() {
    const wasCabin = mode === "cabin";
    const from = view.camera.position.clone();
    fp.leave();
    if (mode === "deck" || mode === "bino") { view.useScene(null); hideBino(); }
    view.camera.far = 260; view.camera.updateProjectionMatrix();
    view.setFov(null);
    view.drive(false);
    mode = "table";
    document.body.classList.remove("walking", "on-deck", "in-cabin");
    speech.place = "table";
    sfx.outside?.(false);
    ui.setTarget(null);
    view.outline([]);
    if (wasCabin) {
      const tgt = view.rig.target.clone();
      const d = from.distanceTo(tgt);
      view.flyFrom({ target: tgt, dist: d, tilt: THREE.MathUtils.radToDeg(Math.asin((from.y - tgt.y) / d)),
                     yaw: THREE.MathUtils.radToDeg(Math.atan2(from.x - tgt.x, from.z - tgt.z)) }, 2.2);
    }
  }
  async function upstairs() {
    busy = true;
    sfx.hatch?.();
    await fade(true);
    enterDeck({ x: -2.2, z: -0.55, yaw: Math.PI, pitch: -0.05 });
    await fade(false);
    busy = false;
  }
  async function transition(fn) {
    busy = true;
    await fade(true);
    fn();
    await fade(false);
    busy = false;
  }

  // ---------------------------------------------------------------- the radio (prologue task 1)
  let crackleT = 0;
  async function answerRadio() {
    fp.lookOnly = true;
    view.outline([]); ui.setPrompt(null);
    deck.radioCalling = false;
    try { await ctx.flow().answerRadio(); } finally { fp.lookOnly = false; refresh(); }
  }

  // ---------------------------------------------------------------- the binoculars (prologue task 2)
  let bino = null, zoom = 4, stage = 0, seenT = 0;
  const lines = () => story()?.deck?.binocular_lines ?? [];
  function binoTarget() {
    if (!deck || !prologue() || tasks()[1]) return null;
    return stage === 0 ? () => deck.targets.heli : stage === 1 ? () => deck.targets.seat : null;
  }
  function takeBinoculars() {
    mode = "bino";
    fp.lookOnly = true;
    view.outline([]); ui.setPrompt(null);
    zoom = 4; seenT = 0;
    stage = prologue() && !tasks()[1] ? 0 : 3;
    if (!bino) {
      bino = el("div", "bino", `<svg class="bino-svg" aria-hidden="true"></svg>
        <div class="bino-top"></div><div class="bino-bottom"></div>
        <div class="bino-zoom"><button data-z="1" aria-label="+">+</button><button data-z="-1" aria-label="-">&minus;</button></div>`);
      bino.querySelectorAll(".bino-zoom button").forEach((b) => b.addEventListener("click", () => setZoom(zoom * (b.dataset.z > 0 ? 1.4 : 1 / 1.4))));
      addEventListener("resize", () => { if (mode === "bino") drawMask(); });
      document.body.append(bino);
      addEventListener("wheel", (e) => { if (mode === "bino") setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: true });
      addEventListener("keydown", (e) => { if (mode === "bino" && e.code === "KeyE" && !e.repeat && !blocked()) leaveBino(); });
    }
    const P = prompts();
    bino.querySelector(".bino-top").textContent = stage < 3 ? (P.binoculars_use ?? "") : "";
    bino.querySelector(".bino-bottom").innerHTML = `${t("bino_zoom")} · <kbd>E</kbd> ${P.binoculars_drop ?? ""}`;
    drawMask();
    bino.hidden = false;
    document.body.classList.add("binoculars");
    sfx.clack?.();
    refresh();
  }
  function setZoom(z) { zoom = Math.max(2.5, Math.min(16, z)); }
  /** One merged figure-eight (two overlapping circles as a single hole, no inner arcs), a soft shadow at its
   *  rim, and the thin rangefinder reticle of a marine binocular (mil scale). */
  function drawMask() {
    const W = innerWidth, H = innerHeight, m = Math.min(W, H), R = 0.34 * m, d = 0.21 * m, cx = W / 2, cy = H / 2;
    const tick = (x, y, len) => `<line x1="${x}" y1="${y - len}" x2="${x}" y2="${y + len}"/>`;
    let ret = `<line x1="${cx - R * 0.95}" y1="${cy}" x2="${cx + R * 0.95}" y2="${cy}"/>`;
    const step = R * 0.075;
    for (let k = -12; k <= 12; k++) if (k) ret += tick(cx + k * step, cy, k % 2 ? 4 : 9);
    for (let k = 2; k <= 10; k += 2) ret += `<text x="${cx + k * step}" y="${cy - 14}">${k * 5}</text><text x="${cx - k * step}" y="${cy - 14}">${k * 5}</text>`;
    ret += `<line x1="${cx}" y1="${cy - R * 0.25}" x2="${cx}" y2="${cy + R * 0.8}"/>`;
    for (let k = 1; k <= 10; k++) ret += `<line x1="${cx - (k % 2 ? 4 : 9)}" y1="${cy + k * step}" x2="${cx + (k % 2 ? 4 : 9)}" y2="${cy + k * step}"/>`;
    bino.querySelector(".bino-svg").innerHTML = `
      <defs><filter id="bsoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(m * 0.022).toFixed(1)}"/></filter>
        <mask id="bmask"><rect width="${W}" height="${H}" fill="white"/>
          <g filter="url(#bsoft)"><circle cx="${cx - d}" cy="${cy}" r="${R}" fill="black"/><circle cx="${cx + d}" cy="${cy}" r="${R}" fill="black"/></g></mask></defs>
      <rect width="${W}" height="${H}" fill="#000" mask="url(#bmask)"/>
      <g class="bino-reticle">${ret}</g>`;
    bino.querySelector(".bino-svg").setAttribute("viewBox", `0 0 ${W} ${H}`);
  }
  function hideBino() {
    if (bino) bino.hidden = true;
    document.body.classList.remove("binoculars");
  }
  function leaveBino() {
    if (mode !== "bino") return;
    hideBino();
    mode = "deck";
    fp.lookOnly = false;
    view.setFov(FOV);
    sfx.clack?.();
    refresh();
  }
  const fwd = new THREE.Vector3(), to = new THREE.Vector3();
  const binoQ = new THREE.Quaternion(), binoE = new THREE.Euler();
  function inView(points, frac) {
    fwd.set(0, 0, -1).applyQuaternion(view.camera.quaternion);
    const half = THREE.MathUtils.degToRad(view.camera.fov / 2) * frac;
    return points.some((p) => fwd.angleTo(to.copy(p).sub(view.camera.position)) < half);
  }
  async function binoStory(dt) {
    if (stage > 1 || blocked() || speech.open) return;
    const pts = stage === 0 ? deck.targets.rescue() : deck.targets.wreck();
    seenT = inView(pts, 0.6) ? seenT + dt : 0;
    if (seenT < 0.8) return;
    seenT = 0;
    const my = stage;
    stage = my + 0.5;                   // speaking
    if (my === 0) {
      await speech.say(lines()[0]);
      await speech.idle();
      stage = 1; refresh();
    } else {
      bino.querySelector(".bino-top").textContent = "";
      await speech.say(lines()[1]);
      await speech.say(lines()[2]);
      await speech.idle();
      stage = 3; refresh();
      await ctx.flow().binocularsDone();
      refresh();
    }
  }

  // ---------------------------------------------------------------- per frame
  view.onFrame((dt, time) => {
    if (deck && (mode === "deck" || mode === "bino")) deck.update(dt, time);
    fp.update(dt, time);
    if (mode === "bino") {
      const f = FOV / zoom;
      if (Math.abs(view.camera.fov - f) > 0.01) { view.camera.fov += (f - view.camera.fov) * Math.min(1, dt * 8); view.camera.updateProjectionMatrix(); }
      // the captain's arms take out the ship's roll (at 16x a degree of pitch is a quarter of the frame);
      // what is left is a light tremor of the hands, stronger with more zoom
      const me = fp.pos;
      binoQ.setFromEuler(binoE.set(me.pitch, me.yaw + Math.PI, 0, "YXZ"));
      view.camera.quaternion.slerp(binoQ, 0.9);
      const k = 0.00022 * zoom;
      view.camera.rotateX(Math.sin(time * 7.3) * k + Math.sin(time * 13.1) * k * 0.5);
      view.camera.rotateY(Math.sin(time * 5.9 + 1) * k + Math.sin(time * 11.7) * k * 0.4);
      binoStory(dt);
    }
    if (fp.active) ui.frame(view.camera.position, 1 / fp.space.scale);
    if (deck && deck.radioCalling && mode === "deck" && !blocked()) {
      crackleT -= dt;
      if (crackleT < 0) { crackleT = 3.2; sfx.crackle?.(); }
    }
  });

  return {
    enterDeck: (start) => transition(() => enterDeck(start)),
    enterDeckNow: enterDeck,
    enterCabin: (where) => transition(() => enterCabin(where)),
    enterCabinNow: enterCabin,
    toTable, refresh,
    freeCursor: () => fp.unlock(),
    get mode() { return mode; },
    get deck() { return deck; },
    fp,
    /** Tests / screenshots: where things are. */
    /** Tests / screenshots: look through the binoculars at a world point with a zoom. */
    debugBino(point, z) { if (mode !== "bino") takeBinoculars(); setZoom(z); if (point) { const e = deck.space.toWorld(fp.pos.x, deck.space.eye, fp.pos.z, new THREE.Vector3()); fp.place(fp.pos.x, fp.pos.z, Math.atan2(point[0] - e.x, point[2] - e.z), Math.atan2(point[1] - e.y, Math.hypot(point[0] - e.x, point[2] - e.z))); } },
    /** Tests: walk (A*) up to a thing by id and use it, like a click on it. */
    goTo: (id) => fp.walkToThing(id),
    debug: () => ({ mode, pos: { ...fp.pos }, focus: fp.focus?.id ?? null, stage, zoom, locked: fp.locked }),
  };
}
