// Renderer, lamp, camera, post-processing, HTML pins and the frame loop.
// Only drawing — the game state always comes from Python.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));   // HTML text stays sharp; the 3D keeps 60 FPS on Retina
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0807);
  scene.fog = new THREE.Fog(0x0a0807, 40, 120);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;      // reflections for brass, glass and lacquer (CLAUDE.md v3.1, 21.1 p. 2)

  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 260);

  // one warm lamp above the chart (soft shadows; it sways a little) + cold moonlight from the porthole
  // (three r170 uses physical light units: the reference r128 values are multiplied by π, decay 0)
  scene.add(new THREE.HemisphereLight(0x7a8fb8, 0x2a1c10, 0.95));
  const lamp = new THREE.SpotLight(0xffd3a1, 4.6, 0, 0.8, 0.6, 0);      // a warm pool on the chart, darker edges
  const LAMP_POS = new THREE.Vector3(-5, 7, -8);      // the scene moves it to the visible lamp shade
  lamp.position.copy(LAMP_POS);
  lamp.target.position.set(0.3, 0, 0.8);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(4096, 4096);
  lamp.shadow.bias = -0.00035;
  lamp.shadow.normalBias = 0.01;
  lamp.shadow.radius = 3;
  lamp.shadow.camera.near = 6;
  lamp.shadow.camera.far = 30;
  scene.add(lamp, lamp.target);
  const moon = new THREE.DirectionalLight(0x86a6ff, 1.1);   // cold moonlight from the porthole, right
  moon.position.set(19, 7, -13);
  scene.add(moon);

  // post (CLAUDE.md v3.1, 21.1 p. 1; no tilt-shift blur, 18):
  //   render -> GTAO (weak: soft shade in the joints of the tracing paper, under ships and pins)
  //   -> bloom (high threshold: only lamps, mast lights, the lighthouse glow) -> ACES + sRGB
  //   -> film: warm highlights / teal shadows, 3.5 % grain, soft vignette, chromatic aberration at the edges
  // The scene depth goes to GTAO from the main render, so cut-out paper sheets (discard) are honoured.
  const depthTex = new THREE.DepthTexture(1, 1);
  depthTex.type = THREE.UnsignedIntType;
  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType, depthTexture: depthTex });
  const composer = new EffectComposer(renderer, rt);
  composer.renderTarget2.depthTexture = depthTex;            // both buffers share one depth: GTAO always reads it
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.setGBuffer(depthTex);          // set after construction (r170 needs its own targets to exist first)
  gtao.blendIntensity = 0.55;
  gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.5, 2.6);   // HDR threshold: only emitters (lit paper stays below)
  composer.addPass(bloom);
  // a soft warm outline on the thing the captain looks at in first person (CLAUDE.md 23.2: "[E] ...")
  const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera, []);
  outline.edgeStrength = 3.2; outline.edgeGlow = 0.6; outline.edgeThickness = 1.6; outline.pulsePeriod = 2.4;
  outline.visibleEdgeColor.set(0xffd27a); outline.hiddenEdgeColor.set(0x6a4a1a);
  outline.enabled = false;
  composer.addPass(outline);
  // under water (CLAUDE.md v3.1, 21.1 p. 7): colour absorption by distance (red dies first, so the orange
  // box looks brown far away and flares up close) + the porthole glass: slight barrel distortion and a
  // colour fringe towards its rim. Only during the first-person search.
  const water = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tDepth: { value: depthTex }, uNear: { value: 0.1 }, uFar: { value: 260 },
                uAbs: { value: new THREE.Vector3(0.30, 0.085, 0.045) }, uWater: { value: new THREE.Color(0x01121a) },
                uC: { value: new THREE.Vector2(0.5, 0.54) }, uR: { value: 0.4 }, uAsp: { value: 1.6 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      #include <packing>
      uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float uNear, uFar, uR, uAsp;
      uniform vec3 uAbs; uniform vec3 uWater; uniform vec2 uC; varying vec2 vUv;
      vec3 absorbed(vec2 uv) {
        vec3 c = texture2D(tDiffuse, uv).rgb;
        float d = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
        vec3 k = exp(-uAbs * min(d, 60.0));
        return c * k + uWater * (1.0 - k);
      }
      void main() {
        vec2 p = vUv - uC; p.x *= uAsp;
        float r = length(p) / uR;                              // 0 centre .. 1 the porthole rim
        vec2 q = p * (1.0 - 0.06 * r * r);                     // barrel distortion of the thick glass
        q.x /= uAsp;
        vec2 ca = q * 0.012 * smoothstep(0.6, 1.0, r);         // colour fringe at the rim
        vec3 col = vec3(absorbed(uC + q + ca).r, absorbed(uC + q).g, absorbed(uC + q - ca).b);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  water.enabled = false;
  composer.addPass(water);
  // shot 2 of the descent (CLAUDE.md 23.3-B): the camera on the water line. Above a wavy line — the frame as is;
  // below it — a second render of the scene without the sea surface (underRT), seen through water: fog by world
  // height (blue-green, darker with depth) and distance, the red lost first, light shafts from the surface, a meniscus
  const underDepth = new THREE.DepthTexture(1, 1); underDepth.type = THREE.UnsignedIntType;
  const underRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: underDepth });
  let under = null;                     // { scene, hide: [objects] } while shot 2 runs
  const waterline = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tUnder: { value: null }, tUD: { value: null }, uT: { value: 0 }, uLine: { value: 0.5 },
                uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform sampler2D tUnder; uniform sampler2D tUD; uniform float uT; uniform float uLine;
      uniform mat4 uInvProj; uniform mat4 uCamW; varying vec2 vUv;
      // the water's own colour along a ray: bright towards the lit surface, black looking down (night, the ship's lights above)
      vec3 waterAlong(float dy) { return mix(vec3(0.002, 0.016, 0.024), vec3(0.03, 0.17, 0.18), smoothstep(-0.55, 0.15, dy)); }
      void main() {
        float line = uLine + 0.014 * sin(vUv.x * 13.0 + uT * 2.4) + 0.007 * sin(vUv.x * 31.0 - uT * 4.3) + 0.004 * sin(vUv.x * 71.0 + uT * 7.0);
        float d = vUv.y - line;
        vec3 col;
        if (d < 0.0) {
          vec2 uv = vUv + vec2(sin(vUv.y * 40.0 + uT * 3.0), cos(vUv.x * 33.0 + uT * 2.2)) * 0.003;
          float z = texture2D(tUD, uv).r;
          vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); v /= v.w;
          vec3 w = (uCamW * vec4(v.xyz, 1.0)).xyz, cam = (uCamW * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float dist = z >= 1.0 ? 80.0 : length(v.xyz);
          float dy = normalize(w - cam).y;
          vec3 c = texture2D(tUnder, uv).rgb * 0.45;                                 // under the surface nothing is lit from above
          vec3 absorb = exp(-dist * vec3(0.34, 0.09, 0.075));                        // red goes first
          float fog = 1.0 - exp(-dist * 0.2);
          col = c * absorb * (1.0 - fog) + waterAlong(dy) * fog;
          // light shafts from the surface, slanting, fading with depth below the line
          float sx = vUv.x * 9.0 + d * 2.5;
          float shaft = pow(0.5 + 0.5 * sin(sx * 2.3 + sin(sx * 0.7 + uT * 0.4) * 2.0), 6.0) * 0.6 + pow(0.5 + 0.5 * sin(sx * 5.1 - uT * 0.3), 10.0) * 0.4;
          col += vec3(0.1, 0.26, 0.26) * shaft * exp(d * 5.0) * 0.35 * fog;
          col += vec3(0.06, 0.18, 0.19) * exp(d * 30.0) * 0.5;                       // the bright underside of the surface
        } else col = texture2D(tDiffuse, vUv).rgb;
        float men = exp(-pow(d / 0.005, 2.0));
        col = mix(col, vec3(0.75, 0.88, 0.92), men * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  waterline.uniforms.tUnder.value = underRT.texture; waterline.uniforms.tUD.value = underDepth;   // (ShaderPass clones uniforms: render-target textures go in after)
  waterline.enabled = false;
  composer.addPass(waterline);
  composer.addPass(new OutputPass());
  const film = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        vec2 ca = c * smoothstep(0.14, 0.5, r2) * 0.004;           // colour fringe only near the edges
        vec3 col = vec3(texture2D(tDiffuse, vUv - ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + ca).b);
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col += vec3(0.035, 0.012, -0.03) * smoothstep(0.45, 1.0, l);   // warm highlights
        col += vec3(-0.02, 0.012, 0.03) * (1.0 - smoothstep(0.0, 0.4, l)); // teal shadows
        col *= 1.0 - 0.55 * smoothstep(0.18, 0.62, r2 * 1.35);       // soft vignette
        col += (h(vUv * uRes + fract(uTime * 13.0)) - 0.5) * 0.035;  // film grain
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(film);

  // camera rig: look at `target` from `dist` at `tilt` degrees above the horizon.
  // hfov = horizontal field of view: a long lens (30-35°) keeps the chart from looking like a trapezoid
  const rig = { target: new THREE.Vector3(), dist: 36, tilt: 40, yaw: 0, hfov: 33 };
  // `home` is where the camera rests (set on resize). The camera can fly after a point (`follow`,
  // the cinema mode), to a fixed `pose` (standing up from the table) or start from somewhere else
  // and glide home (`flyFrom`, the opening shot of the cabin).
  const home = { target: new THREE.Vector3(), dist: 36, tilt: 40, yaw: 0 };
  let follow = null, followOpt = { dist: 9.5, tilt: 34 }, pose = null, settled = true, rate = 2.2;
  let manual = false;                 // another scene drives the camera itself (the dive)
  let driven = false;                 // first person drives the camera in the cabin
  let fovOverride = null;             // first person sets its own lens
  const goal = new THREE.Vector3();
  function steer(dt) {
    if (manual || driven || (!follow && !pose && settled)) return;
    const k = 1 - Math.exp(-dt * rate);
    let gd, gt, gy;
    if (follow) { follow(goal); gd = followOpt.dist; gt = followOpt.tilt; gy = followOpt.yaw ?? 0; }
    else if (pose) { goal.copy(pose.target); gd = pose.dist; gt = pose.tilt; gy = pose.yaw; }
    else { goal.copy(home.target); gd = home.dist; gt = home.tilt; gy = home.yaw; }
    rig.target.lerp(goal, k);
    rig.dist += (gd - rig.dist) * k;
    rig.tilt += (gt - rig.tilt) * k;
    rig.yaw += (gy - rig.yaw) * k;
    if (!follow && !pose && rig.target.distanceTo(home.target) < 0.002 && Math.abs(rig.dist - home.dist) < 0.002 && Math.abs(rig.yaw) < 0.01) {
      rig.target.copy(home.target); rig.dist = home.dist; rig.tilt = home.tilt; rig.yaw = home.yaw; settled = true; rate = 2.2;
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
    underRT.setSize(Math.ceil(w * renderer.getPixelRatio()), Math.ceil(h * renderer.getPixelRatio()));
    film.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    camera.aspect = w / h;
    const cur = { target: rig.target.clone(), dist: rig.dist, tilt: rig.tilt, yaw: rig.yaw };
    for (const fn of resizeHooks) fn(w, h);                  // the screen sets the resting camera
    home.target.copy(rig.target); home.dist = rig.dist; home.tilt = rig.tilt; home.yaw = rig.yaw;
    if (!settled) { rig.target.copy(cur.target); rig.dist = cur.dist; rig.tilt = cur.tilt; rig.yaw = cur.yaw; }   // mid-flight: keep going
    camera.fov = fovOverride ?? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(deg(rig.hfov) / 2) / camera.aspect));
    camera.updateProjectionMatrix();
    outline.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    if (!manual && !driven) aim();
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
  let frames = 0, frameMs = 16.7, lastNow = 0, calls = 0;
  renderer.info.autoReset = false;            // count draw calls over the whole frame (all passes)
  function frame(now) {
    if (lastNow) frameMs += (now - lastNow - frameMs) * 0.05;
    lastNow = now;
    renderer.info.reset();
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    const sway = { x: Math.sin(time * 0.55) * 0.12, z: Math.sin(time * 0.37) * 0.08 };   // a gentle swing
    lamp.position.set(LAMP_POS.x + sway.x, LAMP_POS.y, LAMP_POS.z + sway.z);
    for (const fn of frameHooks) fn(dt, time, sway);
    steer(dt);
    film.uniforms.uTime.value = time;
    if (waterline.enabled && under) renderUnder();
    composer.render();
    calls = renderer.info.render.calls;
    for (const p of pins) {
      const s = toScreen(p.anchor);
      p.holder.style.visibility = s.visible ? "visible" : "hidden";
      p.holder.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
    if (++frames === 3) document.body.dataset.ready = "1";   // used by the screenshot tools
    requestAnimationFrame(frame);
  }

  const UNDER_BG = new THREE.Color(0x02161a);
  function renderUnder() {
    const sc = under.scene, bg = sc.background, fog = sc.fog, vis = under.hide.map((o) => o.visible), su = renderer.shadowMap.autoUpdate;
    under.hide.forEach((o) => { o.visible = false; });
    sc.background = UNDER_BG; sc.fog = null; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(underRT); renderer.clear(); renderer.render(sc, camera); renderer.setRenderTarget(null);
    sc.background = bg; sc.fog = fog; renderer.shadowMap.autoUpdate = su;
    under.hide.forEach((o, i) => { o.visible = vis[i]; });
    camera.updateMatrixWorld();
    waterline.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse); waterline.uniforms.uCamW.value.copy(camera.matrixWorld);
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
    follow(fn, opt = {}) { if (!fn && !follow) return; follow = fn; followOpt = { dist: 9.5, tilt: 34, ...opt }; rate = opt.rate ?? 2.2; settled = false; },
    /** Recompute the lens for the table after another scene changed it. */
    refit: () => resize(),
    /** The water pass during the dive; porthole = {cy (0..1 from the top), r (px)}. */
    setWater(on, porthole) {
      water.enabled = on;
      if (!on) return;
      const h = window.innerHeight;
      water.uniforms.uC.value.set(0.5, 1 - porthole.cy);
      water.uniforms.uR.value = porthole.r / h;
      water.uniforms.uAsp.value = window.innerWidth / h;
      water.uniforms.uNear.value = camera.near; water.uniforms.uFar.value = camera.far;
    },
    /** Shot 2 of the descent: the water line across the frame (v 0..1 from the bottom), its time. */
    setWaterline(on, v = 0.5, time = 0, below = undefined) { waterline.enabled = on; if (below !== undefined) under = below; waterline.uniforms.uLine.value = v; waterline.uniforms.uT.value = time; },
    /** Render another scene (the deep sea); the caller places the camera. null = back to the table. */
    useScene(s, { bloom: keepBloom = false } = {}) {
      manual = !!s;
      renderPass.scene = gtao.scene = outline.renderScene = s || scene;
      // GTAO only at the table (paper joints, under ships): objects floating in open water have the far
      // plane behind them and come out fully 'occluded' (black)
      gtao.enabled = !s;
      // bloom breaks on the dark deep scene with the additive jellyfish (the frame goes black): only at the table
      bloom.enabled = !s || keepBloom;
      document.body.classList.toggle("other-scene", !!s);
      if (!s) aim();
    },
    /** Stay at a fixed pose {target, dist, tilt, yaw} (null = back to the table). */
    pose(p) { pose = p; settled = false; rate = 1.4; },
    /** Start from a pose and glide home slowly (the opening shot). */
    flyFrom(p, speed = 0.9) {
      rig.target.copy(p.target); rig.dist = p.dist; rig.tilt = p.tilt; rig.yaw = p.yaw ?? 0;
      settled = false; rate = speed; aim();
    },
    /** First person in the cabin: the caller places the camera (the table's rig stops). */
    drive(on) { driven = on; if (!on) { settled = false; } },
    /** A fixed vertical field of view (first person), null = the table's lens. */
    setFov(f) { fovOverride = f; camera.fov = f ?? camera.fov; camera.updateProjectionMatrix(); if (f === null) resize(); },
    /** Outline these objects (empty = none). */
    outline(objs) { outline.selectedObjects = objs; outline.enabled = objs.length > 0; },
    get mainScene() { return scene; },
    /** Smoothed frame time (ms) and draw calls of the last frame (dev tools). */
    perf: () => ({ ms: +frameMs.toFixed(2), calls, tris: renderer.info.render.triangles }),
    onFrame: (fn) => frameHooks.push(fn),
    onResize: (fn) => resizeHooks.push(fn),
    start() { resize(); requestAnimationFrame(frame); },
  };
}
