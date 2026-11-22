// Synthesised sound (WebAudio, no files; CLAUDE.md v3, 9). M8 brings what the dive needs: the beacon
// pinger with stereo panning (v3.1, 19 p. 6), sonar, splash, bubbles, hull creaks, the heartbeat at
// low oxygen, thrusters, the manipulator. Music and the table sounds come in M11.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let ac = null, master, noise, amb, under, drone, thr, wind, rain, rainLo;
let outdoors = false, wxRain = 0, wxWind = 0.15;

function loop(freq, vol, lfo, type = "lowpass") {
  const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start();
  if (lfo) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = lfo; lg.gain.value = vol * 0.7; l.connect(lg); lg.connect(g.gain); l.start();
  }
  return { g, f };
}

/** Browsers start audio only after a gesture: called on the first click / key. */
export function initAudio() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; return; }
  master = ac.createGain(); master.gain.value = 0.85; master.connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  amb = loop(480, 0.03, 0.11);                 // the sea outside the hull
  under = loop(170, 0);
  thr = loop(300, 0, 0, "bandpass");
  wind = loop(900, 0, 0.07, "bandpass");     // the wind on the open deck (M12b)
  rain = loop(5200, 0, 0.0, "highpass");      // rain: a hiss of drops ...
  rainLo = loop(1400, 0, 0.23, "bandpass");   // ... and their patter on steel
  const o = ac.createOscillator(); drone = ac.createGain();
  o.type = "sine"; o.frequency.value = 44; drone.gain.value = 0; o.connect(drone); drone.connect(master); o.start();
}
addEventListener("pointerdown", initAudio, { once: true });
addEventListener("keydown", initAudio, { once: true });

function env(g, t, a, p, h, r) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(p, t + a);
  g.gain.setValueAtTime(p, t + a + h); g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
}
function out(node, pan) {
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node.connect(p); p.connect(master); }
  else node.connect(master);
}
function tone(f1, f2, dur, type = "sine", vol = 0.2, delay = 0, pan = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  o.connect(g); out(g, pan); env(g, t, 0.006, Math.max(0.0002, vol), dur * 0.25, dur * 0.75);
  o.start(t); o.stop(t + dur + 0.1);
}
function nz(dur, freq, type = "bandpass", vol = 0.15, delay = 0, q = 1, pan = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
  s.connect(f); f.connect(g); out(g, pan); env(g, t, 0.005, vol, dur * 0.3, dur * 0.7);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const ramp = (p, v, tc = 0.3) => { if (ac && p) p.setTargetAtTime(v, ac.currentTime, tc); };

function mixWeather() {
  if (!ac) return;
  const o = outdoors ? 1 : 0.35;
  ramp(rain.g.gain, wxRain * 0.07 * o, 0.8); ramp(rainLo.g.gain, wxRain * 0.05 * o, 0.8);
  rain.f.frequency.value = outdoors ? 5200 : 2600;                 // through the hull: duller
  ramp(wind.g.gain, outdoors ? 0.02 + wxWind * 0.11 : wxWind * 0.02, 0.8);
  wind.f.frequency.value = 600 + wxWind * 700;
}

/** The pause turns everything down to 20 % (A1). */
export function duck(on) {
  if (!ac) return;
  master.gain.cancelScheduledValues(ac.currentTime);
  master.gain.setTargetAtTime(on ? 0.85 * 0.2 : 0.85, ac.currentTime, 0.08);
}

export const sfx = {
  crane: () => { tone(180, 300, 1.6, "sawtooth", 0.022); nz(1.6, 900, "bandpass", 0.03, 0, 5); },
  splash: () => { nz(1.2, 900, "lowpass", 0.32); for (let i = 0; i < 9; i++) tone(500 + Math.random() * 700, 1000 + Math.random() * 500, 0.08, "sine", 0.05, 0.3 + i * 0.1); },
  bubbles: (n = 6) => { for (let i = 0; i < n; i++) tone(350 + Math.random() * 500, 800 + Math.random() * 600, 0.07, "sine", 0.04, i * 0.12); },
  underwater(on) { if (!ac) return; ramp(amb.g.gain, on ? 0 : 0.03, 0.6); ramp(under.g.gain, on ? 0.17 : 0, 0.9); ramp(drone.gain, on ? 0.07 : 0, 0.9); if (!on) ramp(thr.g.gain, 0, 0.2); },
  thrust: (v) => ramp(thr?.g.gain, Math.min(0.11, v * 0.085), 0.15),
  creak: () => { const f = 80 + Math.random() * 120; tone(f, f * 0.65, 1.3, "sawtooth", 0.028); nz(1.1, f * 3, "bandpass", 0.05, 0, 14); },
  /** The beacon's ping: louder when close, panned to the side where the box is. */
  pinger: (vol, pan) => tone(2900, 2900, 0.05, "sine", 0.15 * vol, 0, pan),
  sonar: () => { tone(1250, 700, 0.9, "sine", 0.12); tone(1250, 700, 0.9, "sine", 0.04, 0.35); },
  heart: () => { tone(70, 48, 0.13, "sine", 0.28); tone(64, 44, 0.13, "sine", 0.2, 0.18); },
  alarm: () => { for (let i = 0; i < 4; i++) tone(880, 640, 0.24, "square", 0.05, i * 0.3); },
  claw: () => { tone(260, 520, 0.6, "sawtooth", 0.03); nz(0.6, 1500, "bandpass", 0.04, 0, 6); tone(150, 110, 0.16, "square", 0.09, 0.65); },
  found: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.55, "triangle", 0.12, i * 0.11)),
  chord: () => [220, 277, 330, 440].forEach((f) => tone(f, f, 2.2, "triangle", 0.06)),
  seen: () => { tone(440, 440, 0.5, "sine", 0.06); tone(660, 660, 0.6, "sine", 0.05, 0.12); },
  clack: () => { tone(190, 90, 0.09, "square", 0.12); nz(0.07, 2600, "highpass", 0.09); },
  // M9a: the story (the full table sound set comes in M11)
  tick: () => { nz(0.16, 3200, "bandpass", 0.06, 0, 3); nz(0.12, 2400, "bandpass", 0.05, 0.12, 3); tone(880, 1320, 0.18, "triangle", 0.05, 0.2); },
  type: () => nz(0.025, 3800, "highpass", 0.035),
  radio: () => { nz(0.35, 1800, "bandpass", 0.06, 0, 0.7); tone(1400, 1400, 0.06, "sine", 0.05, 0.36); },
  door: () => { tone(120, 70, 0.5, "sawtooth", 0.03); nz(0.4, 400, "lowpass", 0.18, 0.25); },
  chapter: () => [147, 220, 294].forEach((f, i) => tone(f, f, 2.4, "triangle", 0.05, i * 0.05)),
  // M12b: on foot
  /** A step: on steel plates (the deck) or on planks (the cabin); running is harder. */
  step: (kind = "metal", run = false) => {
    const v = run ? 1.4 : 1, p = (Math.random() - 0.5) * 0.3;
    if (kind === "metal") { tone(160 + Math.random() * 40, 90, 0.07, "triangle", 0.07 * v, 0, p); nz(0.06, 2600 + Math.random() * 900, "bandpass", 0.05 * v, 0, 3, p); tone(1900 + Math.random() * 300, 1700, 0.05, "sine", 0.012 * v, 0.005, p); }
    else { tone(110 + Math.random() * 30, 70, 0.09, "sine", 0.1 * v, 0, p); nz(0.07, 700 + Math.random() * 300, "bandpass", 0.06 * v, 0, 2, p); }
  },
  /** Outside: the wind and the sea louder; inside: muffled. */
  outside(on) { outdoors = on; if (!ac) return; mixWeather(); ramp(amb.g.gain, on ? 0.06 : 0.03, 0.8); },
  /** The weather's sound (weather.js, every frame): rain 0..1, wind 0..1; louder on deck, muffled below. */
  weather(r, w) {
    if (Math.abs(r - wxRain) < 0.01 && Math.abs(w - wxWind) < 0.01) return;
    wxRain = r; wxWind = w; mixWeather();
  },
  /** A ship's horn far off in the fog: two long low notes, muffled by distance. */
  foghorn() {
    if (!ac) return;
    const k = outdoors ? 1 : 0.45;
    for (const [f, d] of [[98, 0], [98, 3.4]]) { tone(f, f * 0.99, 2.6, "sawtooth", 0.035 * k, d); tone(f * 1.5, f * 1.49, 2.6, "sawtooth", 0.018 * k, d); nz(2.6, 200, "lowpass", 0.05 * k, d, 1); }
  },
  /** Thunder: a crack, then a long low roll. */
  thunder() {
    if (!ac) return;
    const k = outdoors ? 1 : 0.5;
    nz(0.35, 1800, "bandpass", 0.12 * k, 0, 0.8);
    nz(3.6, 140, "lowpass", 0.55 * k, 0.05, 0.7);
    nz(2.4, 320, "lowpass", 0.25 * k, 0.4, 0.9);
    tone(55, 32, 2.8, "sine", 0.25 * k, 0.1);
  },
  crackle: () => { nz(0.5, 1500, "bandpass", 0.05, 0, 0.6); tone(1250, 1250, 0.05, "sine", 0.03, 0.1); tone(1250, 1250, 0.05, "sine", 0.03, 0.3); },
  hatch: () => { tone(90, 50, 0.4, "square", 0.05); nz(0.5, 300, "lowpass", 0.2, 0.05); },
  thud: () => { tone(70, 35, 0.5, "sine", 0.3); nz(0.6, 220, "lowpass", 0.2); },
};
