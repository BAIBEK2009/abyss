// Promise-based animation helpers (CLAUDE.md v3 13.3: "await anim(dur, fn)").
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Call fn(k) every frame for dur seconds, k = 0..1; resolves at the end. */
export function anim(dur, fn) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1000 / dur);
      fn(k);
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Full-screen fade: on = true covers the screen (colour: "", "blue", "white"). */
export async function fade(on, color = "") {
  const el = document.getElementById("fade");
  el.className = (on ? "on " : "") + color;
  await sleep(700);
}
