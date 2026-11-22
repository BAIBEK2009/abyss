// Story lines (CLAUDE.md 22.2): a window with the speaker's portrait, name and role, the text typed out.
// On the table it sits on the right, in the cockpit at the bottom above the instruments, on the deck at
// the bottom centre. The officers have their engraved medallions; voices on the radio (morspasssluzhba,
// Poseidon-2, the families) get the radio medallion, the flight recorder its own.
// A click (or Enter / Space outside the dive) shows the whole line, the next click goes on.
// In the cockpit and on the autopilot the lines go on by themselves after a reading pause.
import { clock, later } from "../clock.js";
import { el } from "./fmt.js";
import { portrait } from "./art.js";
import { ICONS } from "./icons.js";
import { beat, who, PORTRAIT } from "../story.js";
import { sfx } from "../audio.js";
import { sleep } from "../anim.js";
import { t } from "../i18n.js";

function medal(id) {
  if (PORTRAIT[id]) return portrait(PORTRAIT[id]);
  const ch = who(id).channel;
  const icon = ch === "recorder"
    ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="8.5" cy="12" r="2.5"/><circle cx="15.5" cy="12" r="2.5"/><path d="M8.5 14.5h7"/></svg>`
    : ICONS.radio;
  return `<span class="sp-radio sp-${ch || "radio"}">${icon}</span>`;
}

export function createSpeech(root = document.body) {
  const box = el("div", "speech");
  box.hidden = true;
  box.innerHTML = `<div class="sp-face"></div><div class="sp-body"><div class="sp-who"></div><p class="sp-text"></p>
    <div class="sp-next">${t("sp_next")}</div></div>`;
  root.append(box);
  const face = box.querySelector(".sp-face"), whoEl = box.querySelector(".sp-who"), text = box.querySelector(".sp-text");
  let place = "table", chain = Promise.resolve(), current = null;

  /** Show one line; resolves when the player (or the timer) moves on. */
  function show(line, { auto = false } = {}) {
    return new Promise((resolve) => {
      const id = line.speaker;
      const p = id ? who(id) : null;
      face.innerHTML = id ? medal(id) : "";
      box.classList.toggle("no-face", !id);
      whoEl.textContent = p ? `${p.name} · ${p.role}` : "";
      box.className = box.className.replace(/\bsp-at-\w+/g, "").trim() + ` sp-at-${place}`;
      box.classList.toggle("auto", auto);
      box.classList.remove("in"); void box.offsetWidth; box.classList.add("in");
      box.hidden = false;
      if (p?.channel === "radio") sfx.radio?.();
      const full = line.text;
      let i = 0, typing = true;
      text.textContent = "";
      const timer = setInterval(() => {
        if (clock.paused) return;                           // the pause stops the typewriter too
        i += 2;
        text.textContent = full.slice(0, i);
        if (i % 6 === 0) sfx.type?.();
        if (i >= full.length) { clearInterval(timer); typing = false; }
      }, 24);
      let autoT = null;
      const done = () => {
        clearInterval(timer); autoT?.();
        removeEventListener("keydown", onKey, true);
        box.onclick = null; current = null;
        resolve();
      };
      const step = () => {
        if (typing) { clearInterval(timer); typing = false; text.textContent = full; return; }
        done();
      };
      const onKey = (e) => {
        if (place === "cockpit" || clock.paused) return;    // Space is the sonar under water; the pause takes no keys
        // E too: on foot E is "use", and a line on screen must never swallow it into nothing — it turns the line
        if (e.code === "Enter" || e.code === "Space" || (e.code === "KeyE" && !e.repeat)) { e.preventDefault(); e.stopPropagation(); step(); }
      };
      box.onclick = step;
      addEventListener("keydown", onKey, true);
      if (auto) autoT = later(Math.max(3200, full.length * 55 + 1200), done);
      current = { done, step };
    });
  }

  return {
    /** Where the window sits: "table" (right), "cockpit" (bottom, above the instruments), "deck" (bottom centre). */
    set place(p) { place = p; box.className = box.className.replace(/\bsp-at-\w+/g, "").trim() + ` sp-at-${p}`; },
    get place() { return place; },
    /** Queue a story beat by id (or a {speaker, text} line); resolves when it has been shown. */
    say(idOrLine, opts = {}) {
      const line = typeof idOrLine === "string" ? beat(idOrLine) : idOrLine;
      if (!line?.text) return chain;
      chain = chain.then(() => show(line, opts));
      return chain;
    },
    /** Hide after the queue drains. */
    async idle() { await chain; box.hidden = true; },
    hide() { current?.done(); box.hidden = true; },
    /** Like a click on the window: the whole line, then the next one. False if nothing is shown. */
    next() { if (!current || box.hidden) return false; current.step(); return true; },
    get open() { return !box.hidden; },
  };
}

/** The three goal cards after the briefing (story.json beat type "goal_cards") and one button. */
export function goalCards(root, line, buttonLabel) {
  return new Promise((resolve) => {
    const back = el("div", "gcards");
    const icons = [ICONS.target, ICONS.clock, ICONS.ship];
    back.innerHTML = `<div class="gc-row">${line.cards.map((c, i) => {
      const [head, ...rest] = c.split(":");
      return `<div class="gc" style="--d:${i * 0.18}s">${icons[i] ?? ""}<b>${head}</b><p>${rest.join(":").trim()}</p></div>`;
    }).join("")}</div><button class="gc-go" data-id="cards-ok">${buttonLabel}</button>`;
    root.append(back);
    sfx.clack?.();
    // E or Enter takes the cards too (after a moment, so the key that ended the last line does not)
    const t0 = performance.now();
    const onKey = (e) => {
      if (!["KeyE", "Enter"].includes(e.code) || e.repeat || performance.now() - t0 < 600) return;
      e.preventDefault(); e.stopPropagation(); back.querySelector(".gc-go").onclick();
    };
    addEventListener("keydown", onKey, true);
    back.querySelector(".gc-go").onclick = async () => {
      removeEventListener("keydown", onKey, true);
      back.querySelector(".gc-go").onclick = null;
      back.classList.add("out");
      await sleep(400);
      back.remove();
      resolve();
    };
  });
}
