// The story director (CLAUDE.md 17, 22): plays what the campaign core sends — story lines, goal cards,
// chapter cards between acts — and runs the prologue on foot: the radio on the bridge, the binoculars,
// down to the cabin (the officers introduce themselves), the chart table.
// Texts come from story.json only; the core decides what fires (core/campaign.py).
import { api } from "./api.js";
import { act, beat, who } from "./story.js";
import { goalCards } from "./ui/speech.js";
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
        continue;
      }
      if (!it.beat) continue;
      const b = beat(it.beat);
      if (!b || b.type === "act_end" || b.type === "clue" || b.type === "choice") continue;
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

  /** On load: start or resume the prologue where it was left. Returns true if the prologue is running. */
  function startIfNeeded() {
    const c = camp();
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
