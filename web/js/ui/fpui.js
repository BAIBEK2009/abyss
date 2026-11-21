// What the captain sees on foot (CLAUDE.md 23.2, "how the player knows what to do"):
//   - a dot in the centre; on a thing within reach: "[E] Take the binoculars" under it (a tap uses it too);
//   - the waypoint marker of the next step in the world with the distance ("12 m"); when the point is
//     off screen (or behind) the marker sticks to the edge and its arrow shows where to turn;
//   - the control hints (story.deck.hints) one at a time in the first 30 seconds, never again after.
import * as THREE from "three";
import { el } from "./fmt.js";
import { t } from "../i18n.js";

const HINTS_DONE = "abyss.deckHintsDone";

export function createFpUi(view, { onUse } = {}) {
  const dot = el("div", "fp-dot");
  const prompt = el("button", "fp-prompt");
  prompt.hidden = true;
  prompt.addEventListener("click", () => onUse?.());
  const marker = el("div", "fp-mark", `<span class="fp-arrow"></span><b class="fp-dia"></b><small class="fp-dist"></small>`);
  marker.hidden = true;
  const hint = el("div", "fp-hint");
  hint.hidden = true;
  document.body.append(dot, prompt, marker, hint);
  const arrow = marker.querySelector(".fp-arrow"), dist = marker.querySelector(".fp-dist");

  let target = null;              // { world: () => Vector3 }
  const v = new THREE.Vector3();
  function frame(eye, metresPerUnit = 1) {
    if (!target || !document.body.classList.contains("fp")) { marker.hidden = true; return; }
    const w = target.world();
    marker.hidden = false;
    const m = Math.max(1, Math.round(eye.distanceTo(w) * metresPerUnit));
    dist.textContent = t("fp_metres", { m });
    v.copy(w).applyMatrix4(view.camera.matrixWorldInverse);
    const behind = v.z > 0;
    v.copy(w).project(view.camera);
    let x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    if (behind) { x = innerWidth - x; y = innerHeight - y; }
    const PAD = 46, cx = innerWidth / 2, cy = innerHeight / 2;
    const inside = !behind && x > PAD && x < innerWidth - PAD && y > PAD && y < innerHeight - PAD;
    if (!inside) {          // stick to the edge along the line from the centre
      let dx = x - cx, dy = y - cy;
      if (behind && Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((cx - PAD) / Math.abs(dx || 1e-6), (cy - PAD) / Math.abs(dy || 1e-6));
      x = cx + dx * k; y = cy + dy * k;
      arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
    marker.classList.toggle("edge", !inside);
    marker.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  // the control hints: one at a time, the first 30 seconds of the first walk, then never again
  let hintsRun = false;
  async function hints(list) {
    let done = false;
    try { done = localStorage.getItem(HINTS_DONE) === "1"; } catch { /* show them */ }
    if (done || hintsRun) return;
    hintsRun = true;
    for (const text of list) {
      if (!document.body.classList.contains("fp")) break;
      hint.textContent = text;
      hint.hidden = false;
      hint.classList.remove("in"); void hint.offsetWidth; hint.classList.add("in");
      await new Promise((r) => setTimeout(r, 5600));
    }
    hint.hidden = true;
    try { localStorage.setItem(HINTS_DONE, "1"); } catch { /* fine */ }
  }

  return {
    frame,
    /** The next step: a world point (function) or null. */
    setTarget(fnOrNull) { target = fnOrNull ? { world: fnOrNull } : null; },
    /** The thing under the crosshair: its prompt or null. */
    setPrompt(text) {
      prompt.hidden = !text;
      if (text) prompt.innerHTML = `<kbd>E</kbd><span>${text}</span>`;
      dot.classList.toggle("on", !!text);
    },
    hints,
  };
}
