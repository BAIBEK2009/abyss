// The descent (CLAUDE.md 23.3-B): a 20-25 s film in five shots before the cockpit.
//   1. the deck, first person: the A-frame lifts Nerpa by her ring and swings her out over the stern (3 s);
//   2. the camera on the water line, half above, half below: the splash, foam, bubbles, the meniscus (3 s);
//   3. from under the water looking up: Snell's window, Tulpar's hull and propeller, Nerpa sinks past (4 s);
//   4. the twilight zone: blue to black, the depth races to 950 m, comb jellies; the lamps click on at ~200 m (5 s);
//   5. the seabed comes up in the light, the skids touch, a cloud of silt (4 s) — then the cockpit.
// Space skips it. Repeated dives get a short cut (about 8 s).
import { clock, gameFrame } from "./clock.js";
import { fade, sleep } from "./anim.js";
import { sfx } from "./audio.js";
import { el } from "./ui/fmt.js";
import { t } from "./i18n.js";

const FULL = [3, 3, 4, 5, 4.5], SHORT = [1.4, 1.4, 1.6, 2.0, 1.6];

export function createDescent(view, { getDeck, dive }) {
  let dives = 0;
  const hint = el("div", "cine-skip");
  hint.hidden = true;
  document.body.append(hint);

  async function play() {
    const D = dives++ > 0 ? SHORT : FULL;
    let skipped = false;
    const onKey = (e) => { if (e.code === "Space" && !clock.paused) { e.preventDefault(); skipped = true; } };   // Esc is the pause
    addEventListener("keydown", onKey, true);
    hint.textContent = t("cine_skip"); hint.hidden = false;
    document.body.classList.add("cine", "descent");
    const skip = () => skipped;
    const deck = getDeck();
    const cam = view.camera;

    // ---- shots 1-2 on the deck scene
    view.useScene(deck.scene, { bloom: false });
    cam.far = 9000; view.setFov(54);
    deck.launch.start();
    deck.launch.onSplash = () => { sfx.splash?.(); sfx.bubbles?.(8); };
    sfx.crane?.(); sfx.outside?.(true);
    const run = (dur, fn) => new Promise((res) => {
      const t0 = clock.now(); let last = t0;
      const step = () => {
        const now = clock.now(), k = Math.min(1, (now - t0) / 1000 / dur), dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        deck.update(dt, now / 1000);
        fn(k, dt, now / 1000);
        if (k >= 1 || skipped) res(); else gameFrame(step);
      };
      gameFrame(step);
    });
    deck.update(0, clock.now() / 1000);
    deck.launch.lift(0, 0, clock.now() / 1000, cam);     // the first frame is already the film
    await fade(false);
    await run(D[0], (k, dt, time) => { deck.launch.lift(k, dt, time, cam); if (Math.random() < 0.015) sfx.creak?.(); });
    view.setWaterline(true, 0.5, 0, { scene: deck.scene, hide: deck.aboveWater });
    await run(D[1], (k, dt, time) => { deck.launch.lower(k, dt, time, cam); view.setWaterline(true, 0.5, time); });
    view.setWaterline(false, 0.5, 0, null);
    deck.launch.end();
    cam.up.set(0, 1, 0);
    cam.far = 260; view.setFov(null);              // the deep scene sets its own lens; the table gets its own back later
    sfx.outside?.(false);

    // ---- shots 3-5 in the deep scene
    await dive.cinematic(D.slice(2), skip, {
      under: () => { sfx.underwater?.(true); sfx.bubbles?.(6); },
      lights: () => sfx.clack?.(),
      creak: () => sfx.creak?.(),
      thud: () => sfx.thud?.(),
    });
    removeEventListener("keydown", onKey, true);
    hint.hidden = true;
    document.body.classList.remove("descent");
    await sleep(skipped ? 0 : 500);
  }
  return { play, get count() { return dives; } };
}
