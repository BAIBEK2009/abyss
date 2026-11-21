// The chapter card between acts (CLAUDE.md 22.2): a dark screen, the act's title and subtitle from
// story.json acts[].card, for hud.chapter_card_seconds (3.5 s). A click skips it.
import { el } from "./fmt.js";
import { act, hud } from "../story.js";
import { sleep } from "../anim.js";

export function createChapter(root = document.body) {
  const back = el("div", "chapter");
  back.hidden = true;
  back.innerHTML = `<div class="ch-in"><div class="ch-rule"></div><h2></h2><p></p><div class="ch-rule"></div></div>`;
  root.append(back);

  /** Show the card of an act; resolves when it is gone. */
  async function show(actId) {
    const card = act(actId)?.card;
    if (!card) return;
    back.querySelector("h2").textContent = card.title;
    back.querySelector("p").textContent = card.subtitle;
    back.hidden = false;
    back.classList.remove("out");
    void back.offsetWidth;
    back.classList.add("in");
    let skip;
    const skipped = new Promise((r) => { skip = r; back.onclick = r; });
    await Promise.race([sleep((hud("chapter_card_seconds") ?? 3.5) * 1000), skipped]);
    back.onclick = null; skip();
    back.classList.remove("in");
    back.classList.add("out");
    await sleep(700);
    back.hidden = true;
  }
  return { show, get open() { return !back.hidden; } };
}
