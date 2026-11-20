// Entry point: load fonts, ask Python for the state, build the table, start the render loop.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createScene, cellToWorld, MAP_CELLS, MAP_MARGIN } from "./scene.js";
import { createHills } from "./hills.js";
import { createSub, createShip, createFuelGauge, createCompass, createRadio, createJournal,
         createPanel, createPencil, shipPlace } from "./props.js";
import { pin, updatePins, instrumentTag, valueTag, chartNote, radioTape, tally } from "./ui.js";
import { createEffects } from "./effects.js";
import { createGame } from "./game.js";
import { t, setLang } from "./strings.js";

const $ = (id) => document.getElementById(id);

async function loadFonts() {
  // Fonts with unicode-range load lazily; ask for both alphabets up front so the chart texture
  // (drawn on a canvas) and the HTML text use the real fonts from the first frame.
  const sample = "ABCDEFGHIJ 0123456789 Карта капитана Ёё −·";
  await Promise.all([
    document.fonts.load('700 40px "Caveat"', sample),
    document.fonts.load('400 40px "Caveat"', sample),
    document.fonts.load('400 16px "Manrope"', sample),
    document.fonts.load('700 16px "Manrope"', sample),
  ]);
}

async function fetchState() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function cellName(state, [x, y]) {
  return `${state.cols[x]}${y + 1}`;
}

/** Put everything on the table. Returns the objects the game will animate later. */
function buildTable(view, state) {
  const { scene } = view;

  // soft studio reflections for the brass (kept dim: the lamp is the star)
  const pmrem = new THREE.PMREMGenerator(view.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const hills = createHills(scene);
  hills.setBelief(state.P);
  hills.markSignal(state.signal);

  // bases + subs
  const you = state.subs.you;
  const ship = createShip();
  ship.group.position.copy(shipPlace(you.base));
  scene.add(ship.group);
  const sub = createSub();           // positioned every frame by game.js (rides on the relief)
  sub.group.rotation.y = THREE.MathUtils.degToRad(-25);
  scene.add(sub.group);
  const animated = [ship, sub];
  if (state.subs.ai) {
    const aiShip = createShip(0x4E7A8A);
    aiShip.group.position.copy(shipPlace(state.subs.ai.base));
    scene.add(aiShip.group);
    const aiSub = createSub(0xD9573B);
    aiSub.group.position.copy(cellToWorld(...state.subs.ai.pos));
    aiSub.group.rotation.y = THREE.MathUtils.degToRad(205);
    scene.add(aiSub.group);
    animated.push(aiShip, aiSub);
  }

  // instruments around the chart (max 5, one job each)
  const fuel = createFuelGauge();
  fuel.group.position.set(-8.6, 0, -1.6);
  fuel.group.rotation.y = THREE.MathUtils.degToRad(14);
  fuel.setFuel(you.fuel);
  const compass = createCompass();
  compass.group.position.set(-8.3, 0, 3.3);
  const radio = createRadio();
  radio.group.position.set(8.7, 0, -3.0);
  radio.group.rotation.y = THREE.MathUtils.degToRad(-18);
  const journal = createJournal();
  journal.group.position.set(8.0, 0, 3.3);
  const panel = createPanel();
  panel.group.position.set(0, 0, 6.95);
  const pencil = createPencil();
  pencil.group.position.set(5.2, 0.0, -6.6);
  pencil.group.rotation.y = THREE.MathUtils.degToRad(8);
  for (const o of [fuel, compass, radio, journal, panel, pencil]) scene.add(o.group);
  animated.push(fuel, compass, panel);
  const effects = createEffects(scene, hills);

  // --- HTML labels pinned to the objects
  const world = (obj, local) => obj.group.localToWorld(local.clone());
  scene.updateMatrixWorld(true);

  const fuelTag = valueTag(t("fuel", { f: you.fuel }));
  pin(fuelTag.el, world(fuel, fuel.anchorBelow), "below");
  const hintTag = pin(instrumentTag(t("btn_hint"), "H"), world(compass, compass.anchorBelow), "below");
  pin(instrumentTag(t("btn_journal"), "J"), world(journal, journal.anchorBelow), "below");
  const [bCheck, bLift, bHome] = panel.buttons;
  const buttons = {
    check: { ...bCheck, tag: pin(instrumentTag(t("btn_check"), t("key_space")), world(panel, bCheck.anchorBelow), "below") },
    lift: { ...bLift, tag: pin(instrumentTag(t("btn_lift"), "F"), world(panel, bLift.anchorBelow), "below") },
    home: { ...bHome, tag: pin(instrumentTag(t("btn_home"), "R"), world(panel, bHome.anchorBelow), "below") },
    hint: { tag: hintTag, objects: compass.objects, press() {}, glow() {} },
  };

  const tape = radioTape();
  pin(tape.el, world(radio, radio.anchorTape), "at");
  tape.say(t("radio_start", { cell: cellName(state, state.signal) }));

  // on the chart: last-signal caption and the legend
  const [sx, sy] = state.signal;
  const signalAnchor = new THREE.Vector3();
  const placeCaption = () => signalAnchor.copy(hills.topOf(sx, sy)).add(new THREE.Vector3(0, 0, 0.62));
  placeCaption();
  hills.onChange(placeCaption);                 // the caption rides on the relief
  pin(chartNote(t("signal"), "red"), signalAnchor, "at");
  const edge = MAP_CELLS / 2 + MAP_MARGIN / 2;
  const legend = pin(chartNote(t("legend"), "legend"), new THREE.Vector3(0.2, 0.04, edge), "at");
  const tallyMark = tally();
  pin(tallyMark.el, new THREE.Vector3(4.0, 0.04, edge), "at");

  return { hills, sub, fuel, fuelTag, animated, effects, buttons, compass, tape, legend, tallyMark };
}

async function start() {
  await loadFonts();
  const lang = new URLSearchParams(location.search).get("lang");

  let state;
  try {
    state = await fetchState();
  } catch (err) {
    $("status").textContent = "Сервер не отвечает — запусти python main.py";
    $("status").hidden = false;
    return;
  }
  setLang(lang || state.lang);
  document.documentElement.lang = lang || state.lang;

  const view = createScene($("scene"), state);
  const table = buildTable(view, state);
  const game = createGame(view, table, state);
  const clock = new THREE.Clock();
  let frames = 0;

  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    for (const o of table.animated) o.update?.(time, dt);
    table.effects.update(dt);
    game.update(dt);
    view.composer.render();
    updatePins(view.toScreen);
    if (++frames === 3) document.body.dataset.ready = "1"; // used by the screenshot tool
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start();
