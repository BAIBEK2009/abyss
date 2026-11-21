// The story director (CLAUDE.md 17, 22): plays what the campaign core sends — story lines, goal cards,
// chapter cards between acts — and runs the prologue: the radio at night, down to the cabin, the officers
// introduce themselves, the golden pin over the chart table, sitting down at the table.
// Texts come from story.json only; the core decides what fires (core/campaign.py).
import * as THREE from "three";
import { api } from "./api.js";
import { act, beat, who } from "./story.js";
import { goalCards } from "./ui/speech.js";
import { showBrief } from "./ui/brief.js";
import { el } from "./ui/fmt.js";
import { fade, sleep } from "./anim.js";
import { sfx } from "./audio.js";
import { t } from "./i18n.js";

/**
 * ctx: { view, cabin, ui, speech, chapter, toasts, intro, goal,
 *        getState(), setState(st), render(), stand(on), auto() -> autopilot on? }
 */
export function createStoryFlow(ctx) {
  const { view, cabin, speech, chapter } = ctx;
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
        await goalCards(ctx.ui, b, t("btn_go_cabin"));
        await send("radio_heard");
        await send("binoculars");     // until M12b: p5 already showed Poseidon on the horizon
        await goCabin();
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

  // ------------------------------------------------------------------ the prologue
  let night = null;
  function showNight() {
    night = el("div", "night", `<div class="moon"></div><div class="sea"></div><div class="path"></div><div class="mast"></div>`);
    document.body.prepend(night);
  }
  async function hideNight() {
    if (!night) return;
    night.classList.add("out");
    await sleep(800);
    night.remove(); night = null;
  }

  /** Down to the cabin: the door, the dark, the whole cabin from where the captain stands. */
  async function goCabin() {
    sfx.door?.();
    await fade(true);
    await hideNight();
    ctx.stand(true);
    view.flyFrom(cabin.standPose, 3);
    speech.place = "table";
    await fade(false);
    await send("enter_cabin");
    tablePin(true);
  }

  // the golden pin over the chart table: pin_table + pin_table_sub
  let pin = null, pinHook = false;
  const PIN_AT = new THREE.Vector3(0.6, 1.4, 2.6);
  function tablePin(on) {
    if (!on) { pin?.remove(); pin = null; return; }
    if (pin) return;
    pin = el("button", "cabin-pin", `<span class="pl"><b>${t("pin_table")}</b><small>${t("pin_table_sub")}</small></span><span class="dot"></span>`);
    pin.addEventListener("click", sitDown);
    document.body.append(pin);
    if (!pinHook) {
      pinHook = true;
      view.onFrame(() => {
        if (!pin) return;
        const s = view.toScreen(PIN_AT);
        pin.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      });
    }
  }
  async function sitDown() {
    tablePin(false);
    sfx.clack?.();
    ctx.stand(false);
    document.body.classList.remove("prologue");
    await sleep(1700);
    await send("sit_at_table");
  }

  /** On load: start or resume the prologue where it was left. Returns true if the prologue is running. */
  function startIfNeeded() {
    const c = camp();
    if (!c || c.act !== "prologue") return false;
    document.body.classList.add("prologue");
    const [heard, inCabin] = c.tasks;
    if (!heard) {
      showNight();
      speech.place = "deck";
      queue = queue.then(async () => {
        await chapter.show("prologue");
        if (!c.fired.length) await send("start");
        else await playItems([{ beat: "p6" }]);          // reloaded during the radio: the goal cards again
      });
    } else if (!inCabin) {
      queue = queue.then(goCabin);
    } else {
      ctx.stand(true);
      view.flyFrom(cabin.standPose, 3);
      speech.place = "table";
      tablePin(true);
    }
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

  return { play, send, hold, startIfNeeded, beforeDive, diveEvent, afterDive, clueLine, get busy() { return queue; } };
}
