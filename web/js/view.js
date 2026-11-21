// Renderer, lamp, camera, post-processing, HTML pins and the frame loop.
// Only drawing — the game state always comes from Python.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const deg = THREE.MathUtils.degToRad;

/** Small deterministic random: the hand-made look is the same every launch. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0807);
  scene.fog = new THREE.Fog(0x0a0807, 26, 52);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.13;     // a hint for the brass and the table edges: the lamp does the lighting

  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 160);

  // one warm lamp above the chart (soft shadows; it sways a little) + cold moonlight from the porthole
  // (three r170 uses physical light units: the reference r128 values are multiplied by π, decay 0)
  scene.add(new THREE.HemisphereLight(0x7a8fb8, 0x2a1c10, 0.95));
  const lamp = new THREE.SpotLight(0xffd3a1, 4.6, 0, 0.8, 0.6, 0);      // a warm pool on the chart, darker edges
  const LAMP_POS = new THREE.Vector3(-5, 7, -8);      // the scene moves it to the visible lamp shade
  lamp.position.copy(LAMP_POS);
  lamp.target.position.set(0.3, 0, 0.8);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.00035;
  lamp.shadow.normalBias = 0.01;
  lamp.shadow.radius = 3;
  lamp.shadow.camera.near = 6;
  lamp.shadow.camera.far = 30;
  scene.add(lamp, lamp.target);
  const moon = new THREE.DirectionalLight(0x86a6ff, 1.1);   // cold moonlight from the porthole, right
  moon.position.set(19, 7, -13);
  scene.add(moon);

  // post: render -> tone map + sRGB (no tilt-shift blur: CLAUDE.md v3.1, 18)
  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  // camera rig: look at `target` from `dist` at `tilt` degrees above the horizon.
  // hfov = horizontal field of view: a long lens (30-35°) keeps the chart from looking like a trapezoid
  const rig = { target: new THREE.Vector3(), dist: 36, tilt: 40, yaw: 0, hfov: 33 };
  // `home` is where the camera rests (set on resize); `follow` = a function filling a point to fly after
  const home = { target: new THREE.Vector3(), dist: 36, tilt: 40 };
  let follow = null, settled = true;
  const goal = new THREE.Vector3();
  function steer(dt) {
    if (!follow && settled) return;
    const k = 1 - Math.exp(-dt * 2.2);
    if (follow) follow(goal); else goal.copy(home.target);
    const gd = follow ? 9.5 : home.dist, gt = follow ? 34 : home.tilt;
    rig.target.lerp(goal, k);
    rig.dist += (gd - rig.dist) * k;
    rig.tilt += (gt - rig.tilt) * k;
    if (!follow && rig.target.distanceTo(home.target) < 0.002 && Math.abs(rig.dist - home.dist) < 0.002) {
      rig.target.copy(home.target); rig.dist = home.dist; rig.tilt = home.tilt; settled = true;
    }
    aim();
  }
  function aim() {
    const t = deg(rig.tilt), y = deg(rig.yaw);
    camera.position.set(rig.target.x + Math.sin(y) * Math.cos(t) * rig.dist,
                        rig.target.y + Math.sin(t) * rig.dist,
                        rig.target.z + Math.cos(y) * Math.cos(t) * rig.dist);
    camera.lookAt(rig.target);
  }
  const resizeHooks = [];
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    const cur = { target: rig.target.clone(), dist: rig.dist, tilt: rig.tilt };
    for (const fn of resizeHooks) fn(w, h);                  // the screen sets the resting camera
    home.target.copy(rig.target); home.dist = rig.dist; home.tilt = rig.tilt;
    if (!settled) { rig.target.copy(cur.target); rig.dist = cur.dist; rig.tilt = cur.tilt; }   // mid-flight: keep going
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(deg(rig.hfov) / 2) / camera.aspect));
    camera.updateProjectionMatrix();
    aim();
  }
  window.addEventListener("resize", resize);

  // HTML pinned to 3D points (all text is HTML, never drawn in WebGL)
  const pins = [];
  const overlay = document.getElementById("overlay");
  function pin(el, anchor, place = "at") {
    const holder = document.createElement("div");
    holder.className = `pinned pin-${place}`;
    holder.append(el);
    overlay.appendChild(holder);
    pins.push({ holder, anchor });
    return el;
  }
  function toScreen(v) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, visible: p.z < 1 };
  }

  const frameHooks = [];
  const clock = new THREE.Clock();
  let frames = 0;
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    const sway = { x: Math.sin(time * 0.55) * 0.12, z: Math.sin(time * 0.37) * 0.08 };   // a gentle swing
    lamp.position.set(LAMP_POS.x + sway.x, LAMP_POS.y, LAMP_POS.z + sway.z);
    for (const fn of frameHooks) fn(dt, time, sway);
    steer(dt);
    composer.render();
    for (const p of pins) {
      const s = toScreen(p.anchor);
      p.holder.style.visibility = s.visible ? "visible" : "hidden";
      p.holder.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
    if (++frames === 3) document.body.dataset.ready = "1";   // used by the screenshot tools
    requestAnimationFrame(frame);
  }

  /** The scene hangs the visible lamp shade here; the spotlight sits in its bulb. */
  function placeLamp(bulb, target) {
    LAMP_POS.copy(bulb);
    lamp.position.copy(bulb);
    lamp.target.position.copy(target);
  }

  return {
    renderer, scene, camera, rig, aim, lamp, pin, toScreen, placeLamp,
    /** Fly the camera after a point (fn(vector) fills it) or back home (null). */
    follow(fn) { if (!fn && !follow) return; follow = fn; settled = false; },
    onFrame: (fn) => frameHooks.push(fn),
    onResize: (fn) => resizeHooks.push(fn),
    start() { resize(); requestAnimationFrame(frame); },
  };
}
