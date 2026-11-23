// The one game clock (A1): every animation, the oxygen, the descent film, the rival's moves and the
// typewriter read the time from here. While the pause menu is open the clock stands still:
// clock.now() does not move, the frame loop hands the world dt = 0, waits do not run out.
let paused = false, pausedAt = 0, lost = 0;
const listeners = new Set();

export const clock = {
  get paused() { return paused; },
  /** Game milliseconds (performance.now() minus the time spent in the pause). */
  now() { return (paused ? pausedAt : performance.now()) - lost; },
  pause(on) {
    if (on === paused) return;
    if (on) pausedAt = performance.now();
    else lost += performance.now() - pausedAt;
    paused = on;
    document.body.classList.toggle("paused", on);
    for (const fn of listeners) fn(on);
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/** setTimeout in game time: does not run out while the game is paused. */
export function wait(ms) {
  const end = clock.now() + ms;
  return new Promise((resolve) => {
    const tick = () => {
      const left = end - clock.now();
      if (left <= 0) resolve();
      else setTimeout(tick, clock.paused ? 100 : Math.min(left, 250));
    };
    tick();
  });
}

/** Run fn after ms of game time (a pause-aware setTimeout); returns a cancel function. */
export function later(ms, fn) {
  let off = false;
  wait(ms).then(() => { if (!off) fn(); });
  return () => { off = true; };
}

/** requestAnimationFrame that skips frames while paused (the callback gets game ms). */
export function gameFrame(fn) {
  const step = () => { if (clock.paused) requestAnimationFrame(step); else fn(clock.now()); };
  requestAnimationFrame(step);
}

window.__clock = clock;    // for the tests
