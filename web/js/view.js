// Renderer, lamp, camera, post-processing, HTML pins and the frame loop.
// Only drawing — the game state always comes from Python.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { HorizontalTiltShiftShader } from "three/addons/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/addons/shaders/VerticalTiltShiftShader.js";
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0905);
  scene.fog = new THREE.Fog(0x0e0905, 28, 50);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);

  // one warm lamp above the table; it sways a little, so the shadows on the relief move
  scene.add(new THREE.HemisphereLight(0xc9c2b5, 0x2a1a10, 0.25));
  const lamp = new THREE.SpotLight(0xFFD9A0, 5.4, 0, deg(40), 0.85, 0);
  const LAMP_POS = new THREE.Vector3(-6, 15, -1);
  lamp.position.copy(LAMP_POS);
  lamp.target.position.set(0.5, 0, 0.8);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0002;
  lamp.shadow.normalBias = 0.015;
  lamp.shadow.radius = 4;
  lamp.shadow.camera.near = 6;
  lamp.shadow.camera.far = 40;
  scene.add(lamp, lamp.target);
  const fill = new THREE.DirectionalLight(0x9cc3d6, 0.28);   // cool porthole light from the right
  fill.position.set(14, 7, -6);
  scene.add(fill);

  // post: render -> soft tilt-shift at top and bottom -> tone map + sRGB
  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const hBlur = new ShaderPass(HorizontalTiltShiftShader);
  const vBlur = new ShaderPass(VerticalTiltShiftShader);
  hBlur.uniforms.r.value = vBlur.uniforms.r.value = 0.5;
  composer.addPass(hBlur);
  composer.addPass(vBlur);
  composer.addPass(new OutputPass());
  const BLUR = 0.9;

  // camera rig: look at `target` from `dist` at `tilt` degrees; can be re-aimed per screen size
  const rig = { target: new THREE.Vector3(), dist: 20, tilt: 50, yaw: 0 };
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
    hBlur.uniforms.h.value = BLUR / w;
    vBlur.uniforms.v.value = BLUR / h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const fn of resizeHooks) fn(w, h);
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
    lamp.position.set(LAMP_POS.x + Math.sin(time * 0.55) * 0.7, LAMP_POS.y, LAMP_POS.z + Math.sin(time * 0.37) * 0.5);
    for (const fn of frameHooks) fn(dt, time);
    composer.render();
    for (const p of pins) {
      const s = toScreen(p.anchor);
      p.holder.style.visibility = s.visible ? "visible" : "hidden";
      p.holder.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
    if (++frames === 3) document.body.dataset.ready = "1";   // used by the screenshot tools
    requestAnimationFrame(frame);
  }

  return {
    renderer, scene, camera, rig, aim, lamp, pin, toScreen,
    onFrame: (fn) => frameHooks.push(fn),
    onResize: (fn) => resizeHooks.push(fn),
    start() { resize(); requestAnimationFrame(frame); },
  };
}
