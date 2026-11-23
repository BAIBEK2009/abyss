// Weather that works for the story (CLAUDE.md 21.2, 23): a calm night in the prologue and act I, the storm in act II,
// night fog in act III, dawn in act IV. One set of numbers W, eased towards the target state over a few seconds;
// every scene reads W each frame (the deck: sea, sky, fog, rain, lights, roll; the cabin porthole; the sound).
// ?weather=calm|storm|fog|dawn forces a state (for checking).
import * as THREE from "three";
import { sfx } from "./audio.js";

const C = (hex) => new THREE.Color(hex);
export const STATES = {
  calm: { amp: 1, foam: 0, cloud: 0.12, rain: 0, wind: 0.15, roll: 1, fogD: 0.00042, fogCol: C(0x0b1626), moon: 1, stars: 1,
          env: 1, envName: "night", wet: 0, lightning: 0, sun: 0, haze: 0,
          sat: 1, con: 1, shR: -0.02, shG: 0.012, shB: 0.03, hiR: 0.035, hiG: 0.012, hiB: -0.03 },
  storm: { amp: 2.6, foam: 1, cloud: 1, rain: 1, wind: 1, roll: 2.1, fogD: 0.0042, fogCol: C(0x0a1118), moon: 0, stars: 0,
           env: 0.55, envName: "overcast", wet: 1, lightning: 1, sun: 0, haze: 0.35,
           sat: 0.72, con: 1.12, shR: -0.018, shG: 0.0, shB: 0.032, hiR: -0.01, hiG: 0.0, hiB: 0.02 },
  fog: { amp: 0.7, foam: 0, cloud: 0.8, rain: 0, wind: 0.05, roll: 0.8, fogD: 0.02, fogCol: C(0x1a242c), moon: 0.25, stars: 0,
         env: 0.7, envName: "overcast", wet: 0.45, lightning: 0, sun: 0, haze: 1,
         sat: 0.6, con: 0.86, shR: 0.012, shG: 0.022, shB: 0.024, hiR: 0.0, hiG: 0.01, hiB: 0.0 },
  dawn: { amp: 0.85, foam: 0, cloud: 0.35, rain: 0, wind: 0.2, roll: 0.9, fogD: 0.0007, fogCol: C(0x9a7a6a), moon: 0, stars: 0,
          env: 1.4, envName: "night", wet: 0.1, lightning: 0, sun: 1, haze: 0.25,
          sat: 1.12, con: 1.04, shR: 0.022, shG: -0.01, shB: 0.042, hiR: 0.065, hiG: 0.025, hiB: -0.045 },
  // act I (C5): morning — the sun 15 degrees up, a clear pale-blue sky, golden light
  morning: { amp: 0.95, foam: 0, cloud: 0.32, rain: 0, wind: 0.25, roll: 1, fogD: 0.00028, fogCol: C(0x8aa2b4), moon: 0, stars: 0,
             env: 1.1, envName: "night", wet: 0, lightning: 0, sun: 1, haze: 0.0, day: 1,
             sat: 1.08, con: 1.03, shR: -0.005, shG: 0.008, shB: 0.025, hiR: 0.045, hiG: 0.02, hiB: -0.03 },
};
for (const st of Object.values(STATES)) st.day ??= 0;
export const ACT_WEATHER = { prologue: "calm", act1: "morning", act2: "storm", act3: "fog", act4: "dawn" };

// ?weather= or ?time=night|morning|storm|fog|dawn (C5: for checking and screenshots)
const forced = (() => { try { const q = new URLSearchParams(location.search); const v = q.get("weather") || q.get("time"); return v === "night" ? "calm" : v; } catch { return null; } })();
export const W = { name: "calm", flash: 0 };
for (const [k, v] of Object.entries(STATES.calm)) W[k] = v instanceof THREE.Color ? v.clone() : v;
let target = STATES.calm, rate = 0.3, nextBolt = 8, thunderAt = -1;
if (forced && STATES[forced]) { W.name = forced; target = STATES[forced]; snap(); }

function snap() {
  for (const [k, v] of Object.entries(target)) { if (v instanceof THREE.Color) W[k].copy(v); else W[k] = v; }
}

/** Move to a state over ~sec seconds (no-op if already there; ?weather= wins over the story). */
export function setWeather(name, sec = 30) {          // the light changes over 30 s when the act changes
  if (forced && STATES[forced]) name = forced;
  if (!STATES[name] || name === W.name) return;
  W.name = name; target = STATES[name]; rate = 3 / Math.max(0.1, sec);
  if (sec <= 0) snap();
}
export const weatherForAct = (act) => ACT_WEATHER[act] ?? "calm";

let time = 0, hornT = 6;
/** Every frame: ease W, throw lightning (a flash, the thunder 1-3 s later), feed the sound. */
export function updateWeather(dt) {
  time += dt;
  const k = 1 - Math.exp(-dt * rate);
  for (const [key, v] of Object.entries(target)) {
    if (typeof v === "number") W[key] += (v - W[key]) * k;
    else if (v instanceof THREE.Color) W[key].lerp(v, k);
    else W[key] = v;
  }
  W.flash = Math.max(0, W.flash - dt * 5.5);
  if (W.lightning > 0.5 && (nextBolt -= dt) <= 0) {
    nextBolt = 5 + Math.random() * 9;
    W.flash = 1;
    W.boltAt = time;
    thunderAt = time + 1 + Math.random() * 2;
    setTimeout(() => { W.flash = Math.max(W.flash, 0.7); }, 120);          // a double stroke
  }
  if (thunderAt > 0 && time >= thunderAt) { thunderAt = -1; sfx.thunder?.(); }
  if (W.haze > 0.6 && (hornT -= dt) <= 0) { hornT = 22 + Math.random() * 14; sfx.foghorn?.(); }      // a ship's horn somewhere in the fog
  sfx.weather?.(W.rain, W.wind);
}

const NEUTRAL = { sat: 1, con: 1, sh: [-0.02, 0.012, 0.03], hi: [0.035, 0.012, -0.03] };
/** The grade for the final pass: the weather's palette on the surface; under water the dive keeps its own. */
export function gradeNow(underwater) {
  return underwater ? NEUTRAL : { sat: W.sat, con: W.con, sh: [W.shR, W.shG, W.shB], hi: [W.hiR, W.hiG, W.hiB] };
}
