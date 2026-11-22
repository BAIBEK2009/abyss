import { clock, wait, gameFrame } from "./clock.js";
// Promise-based animation helpers (CLAUDE.md v3 13.3: "await anim(dur, fn)").
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const sleep = (ms) => wait(ms);          // game time: stands still in the pause

/** Call fn(k) every frame for dur seconds, k = 0..1; resolves at the end. */
export function anim(dur, fn) {
  return new Promise((resolve) => {
    const t0 = clock.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1000 / dur);
      fn(k);
      if (k < 1) gameFrame(step); else resolve();
    };
    gameFrame(step);
  });
}

/** Full-screen fade: on = true covers the screen (colour: "", "blue", "white"). */
export async function fade(on, color = "") {
  const el = document.getElementById("fade");
  el.className = (on ? "on " : "") + color;
  await sleep(700);
}
