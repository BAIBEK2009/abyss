// The story director (CLAUDE.md 17, 22): plays what the campaign core sends — story lines, goal cards,
// chapter cards between acts — and runs the prologue on foot: the radio on the bridge, the binoculars,
// down to the cabin (the officers introduce themselves), the chart table.
// Texts come from story.json only; the core decides what fires (core/campaign.py).
import { api } from "./api.js";
import { act, beat, who } from "./story.js";
import { goalCards } from "./ui/speech.js";
import { choiceCards } from "./ui/choice.js";
import { el } from "./ui/fmt.js";
import { showBrief } from "./ui/brief.js";
import { sleep } from "./anim.js";
import { sfx } from "./audio.js";
import { t } from "./i18n.js";

/**
 * ctx: { view, cabin, ui, speech, chapter, toasts, intro, goal,
 *        getState(), setState(st), render(), stand(on), auto() -> autopilot on? }
 */
export function createStoryFlow(ctx) {
  const { speech, chapter } = ctx;
  let queue = Promise.resolve();
  const camp = () => ctx.getState().campaign;

  // ------------------------------------------------------------------ playing what the core sent
  /** Call before rendering a new state: an act change waits for its chapter card. */
  function hold(items) { if (items?.some((i) => i.act)) ctx.goal.hold(); }

  async function playItems(items) {
    hold(items);
    for (const it of items) {
      if (it.act) {
        await speech.idle();
        ctx.goal.release();
        sfx.chapter?.();
        const shown = chapter.show(it.act);
        await new Promise((r) => setTimeout(r, 400));      // swap the checklist under the dark card
        ctx.render();
        await shown;
        if (it.act === "act1") setTimeout(() => ctx.intro.showIfFirstTime(), 400);   // who is who, once
        if (it.act === "act4") await toDawnDeck();
        continue;
      }
      if (it.msg) { ctx.toasts.say("lev", t(`toast_${it.msg}`), 4200); continue; }
      if (!it.beat) continue;
      const b = beat(it.beat);
      if (!b || b.type === "act_end" || b.type === "clue") continue;
      if (b.type === "choice") {                      // act III: what first; act IV: who gets the recording
        await speech.idle();
        ctx.walk()?.freeCursor();
        const key = camp()?.act;
        const option = await choiceCards(b);
        const res = await api.choice(key, option);
        hold(res.story);
        ctx.setState(res.state);
        ctx.render();
        await playItems(res.story);
        if (res.state.status !== "playing") ctx.finish?.();
        continue;
      }
      if (b.show === "cvr_waveform") {                // the voice recorder: a dark screen, only the voice wave
        const dark = cvrScreen();
        await speech.say(it.beat, { auto: false });
        await sleep(2000);                            // two seconds of silence after the last words
        dark.close();
        continue;
      }
      if (b.type === "goal_cards") {
        await speech.idle();
        ctx.walk()?.freeCursor();
        await goalCards(document.body, b, t("coach_done"));      // not in #ui: on foot #ui is hidden (body.walking)
        await send("radio_heard");
        continue;
      }
      const p = speech.say(it.beat, { auto: ctx.auto() || speech.place === "cockpit" });
      if (b.type === "mystery") p.then(() => ctx.toasts.say("vera", t("mystery_toast"), 3200));
      await p;
    }
    if (!ctx.auto() || speech.place !== "cockpit") await speech.idle();
  }
  /** The voice recorder's last minutes (17.6, show: cvr_waveform): black screen, a green voice wave. */
  function cvrScreen() {
    const box = el("div", "cvr-screen", `<canvas width="900" height="160"></canvas>`);
    document.body.append(box);
    const c = box.querySelector("canvas").getContext("2d");
    let on = true, t0 = performance.now();
    const draw = () => {
      if (!on) return;
      const tt = (performance.now() - t0) / 1000, talking = speech.open;
      c.clearRect(0, 0, 900, 160);
      c.strokeStyle = "#7fe0a0"; c.lineWidth = 2; c.shadowColor = "#7fe0a0"; c.shadowBlur = 8;
      c.beginPath();
      for (let x = 0; x <= 900; x += 3) {
        const a = talking ? (0.35 + 0.65 * Math.abs(Math.sin(tt * 2.1 + x * 0.004))) * Math.sin(x * 0.11 + tt * 31) * Math.sin(x * 0.023 - tt * 7) : 0.02 * Math.sin(x * 0.3 + tt * 5);
        c.lineTo(x, 80 + a * 62);
      }
      c.stroke();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(() => box.classList.add("on"));
    draw();
    return { close() { on = false; box.classList.remove("on"); setTimeout(() => box.remove(), 800); } };
  }

  /** Story items are played one batch after another, never two at once. */
  function play(items) {
    if (!items?.length) return queue;
    queue = queue.then(() => playItems(items)).catch((e) => console.warn(e));
    return queue;
  }

  async function send(event) {
    const res = await api.story(event);
    hold(res.story);
    ctx.setState(res.state);
    ctx.render();
    return playItems(res.story);
  }

  // ------------------------------------------------------------------ the prologue, on foot (CLAUDE.md 23.2)
  // The deck: answer the radio on the bridge -> the binoculars to the south -> down the companionway ->
  // the cabin: walk up to the chart table. The waypoint and the "[E] ..." prompts live in walk.js.
  const walk = () => ctx.walk();

  /** [E] on the radio: Aigerim's call (p1-p5), the goal cards, then the task is ticked. */
  async function answerRadio() {
    await queue;
    const c = camp();
    queue = (c.fired.includes("p1") ? playItems([{ beat: "p6" }]) : send("start")).catch((e) => console.warn(e));
    await queue;
  }
  /** The binoculars lines were heard (walk.js plays them while the player looks south). */
  async function binocularsDone() {
    queue = queue.then(() => send("binoculars")).catch((e) => console.warn(e));
    await queue;
  }
  /** [E] on the companionway: down to the cabin (in the prologue the officers introduce themselves). */
  async function downstairs() {
    sfx.hatch?.();
    await walk().enterCabin("stairs");
    const c = camp();
    if (c?.act === "prologue" && !c.tasks[2]) {
      queue = queue.then(() => send("enter_cabin")).catch((e) => console.warn(e));
      await queue;
    }
    walk().refresh();
  }
  /** [E] at the chart table: sit down (the camera glides from the eyes to the chart). */
  async function sitAtTable() {
    sfx.clack?.();
    walk().toTable();
    ctx.stand(false);
    const pro = camp()?.act === "prologue";
    document.body.classList.remove("prologue");
    if (pro) {
      await sleep(1700);
      queue = queue.then(() => send("sit_at_table")).catch((e) => console.warn(e));
    }
  }

  /** Act IV (17.7, B3): the deck at dawn, «Poseidon-2» alongside; the talk and the choice happen there. */
  async function toDawnDeck() {
    if (walk()?.mode === "deck") return;
    speech.place = "deck";
    await walk().enterDeck({ x: 1.6, z: -8.6, yaw: Math.PI / 2 + 0.25, pitch: 0.02 });
    walk().refresh();
  }

  /** A choice that fired but was not answered (the page was reloaded): ask again. */
  function resumeChoice() {
    const c = camp();
    if (!c || ctx.getState().status !== "playing") return false;
    const id = c.act === "act3" && !c.choices.act3 && c.fired.includes("a3_3") ? "a3_3"
      : c.act === "act4" && !c.choices.act4 && c.fired.includes("a4_5") ? "a4_5" : null;
    if (c.act === "act4") queue = queue.then(() => toDawnDeck());
    if (id) play([{ beat: id }]);
    return c.act === "act4";
  }

  /** On load: start or resume the prologue where it was left. Returns true if the prologue is running. */
  function startIfNeeded() {
    const c = camp();
    if (c && c.act !== "prologue") return resumeChoice();
    if (!c || c.act !== "prologue") return false;
    document.body.classList.add("prologue");
    speech.place = "deck";
    const [, , inCabin] = c.tasks;
    if (!inCabin) {
      walk().enterDeckNow();
      if (!c.fired.length) queue = queue.then(() => chapter.show("prologue"));
    } else walk().enterCabinNow("stairs");
    return true;
  }

  // ------------------------------------------------------------------ the dive
  /** Before a live dive: Murat's "Nerpa is ready" (the first time) and the briefing card. Returns the briefing. */
  async function beforeDive() {
    const c = camp();
    if (!c) return null;
    await queue;
    await send("first_dive_ready");
    const brief = act(c.act)?.dive_brief;
    if (!brief) return null;
    if (!ctx.auto()) await showBrief(ctx.ui, brief);
    return brief;
  }
  /** Events inside the dive go to the core (dive:start, dive:first_debris) and are spoken in the cockpit. */
  function diveEvent(name) {
    if (!camp()) return;
    speech.place = "cockpit";
    queue = queue.then(() => send(`dive:${name}`)).catch((e) => console.warn(e));
  }
  function afterDive() { speech.place = "table"; }

  // ------------------------------------------------------------------ radio clues
  /** The radio line for a clue from story.json (the fishermen: the direction comes from the core). */
  function clueLine(clue) {
    if (!camp()) return null;
    const b = beat(clue.kind === "fish" ? "a1_3" : "a2_3");
    if (!b) return null;
    const p = who(b.speaker);
    let text = b.text;
    // the story says "northeast" (dir_1 in each language); the core knows the real direction
    if (clue.kind === "fish") text = text.replace(t("dir_1"), t(`dir_${clue.sector}`));
    return { text, src: `${p.name} · ${p.role}` };
  }

  return { play, send, hold, startIfNeeded, beforeDive, diveEvent, afterDive, clueLine, answerRadio, binocularsDone, downstairs, sitAtTable,
           get busy() { return queue; } };
}
