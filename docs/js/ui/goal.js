// The player always knows the goal (CLAUDE.md 22.2): top left on every screen (the table, the cabin,
// the cockpit) — "Goal: …" from story.json acts[].goal and the act's checklist acts[].tasks.
// A task gets its tick with a pencil stroke and a sound. The block's height goes into --goal-h,
// so the brass instruments (and the cockpit's help card) sit right under it.
import { el } from "./fmt.js";
import { act, hud } from "../story.js";
import { sfx } from "../audio.js";

export const CHECK = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="2.5" class="bx"/>
  <path d="M5 10.5l3.4 3.6L15.5 5" class="ck" pathLength="1"/></svg>`;

export function createGoal(root = document.body, { onWho } = {}) {
  const box = el("div", "goal");
  box.innerHTML = `<div class="goal-line"><span class="goal-pre">${hud("goal_prefix") ?? ""}</span> <b class="goal-text"></b></div>
    <ul class="goal-tasks"></ul>`;
  if (onWho) {
    const who = el("button", "pill who goal-who");
    who.addEventListener("click", onWho);
    box.append(who);
  }
  root.append(box);
  const text = box.querySelector(".goal-text"), list = box.querySelector(".goal-tasks");
  let shownAct = null, done = [], held = false;

  const measure = () => document.documentElement.style.setProperty("--goal-h", `${box.offsetHeight + 14}px`);
  new ResizeObserver(measure).observe(box);

  function build(actId, tasks) {
    const a = act(actId);
    text.textContent = a?.goal ?? "";
    list.replaceChildren(...(a?.tasks ?? []).map((s, i) => {
      const li = el("li", tasks[i] ? "done" : "", `${CHECK}<span>${s}</span>`);
      return li;
    }));
    done = [...tasks];
    shownAct = actId;
    box.classList.remove("swap");
    void box.offsetWidth;
    box.classList.add("swap");
  }

  return {
    el: box,
    /** campaign = state.campaign ({act, tasks}); null hides the block (free search). */
    update(campaign) {
      box.hidden = !campaign;
      document.body.classList.toggle("has-goal", !!campaign);
      if (!campaign) return;
      if (campaign.act !== shownAct) {
        // the act changed: until its chapter card the old checklist stays, all ticked
        if (held && shownAct) return this.update({ act: shownAct, tasks: done.map(() => true) });
        return build(campaign.act, campaign.tasks);
      }
      campaign.tasks.forEach((v, i) => {
        if (v && !done[i]) {
          const li = list.children[i];
          li?.classList.add("done", "just");
          setTimeout(() => li?.classList.remove("just"), 1400);
          sfx.tick?.();
        }
      });
      done = [...campaign.tasks];
    },
    /** Keep the current act on screen until release() (the story plays the chapter card first). */
    hold() { held = true; },
    release(campaign) { held = false; if (campaign) this.update(campaign); },
    set whoLabel(s) { const b = box.querySelector(".goal-who"); if (b) b.textContent = s; },
  };
}
