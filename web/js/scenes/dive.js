// The dive (CLAUDE.md v3.1, 19): a separate deep-sea scene rendered by the same view.
// Part 1 — the shot from under the surface: the real bathyscaphe "Nerpa-2" (yellow sphere,
// porthole, tanks, frame, name plate, cable) sinks past the camera under the ship's floodlights;
// above, the rippled surface in the pool of light, slanted light shafts, bubbles; a third of the
// way down its lamps switch on with a click.
import * as THREE from "three";
import { canvasTexture } from "../view.js";
import { anim, ease } from "../anim.js";
import { t } from "../strings.js";

const std = (o) => new THREE.MeshStandardMaterial(o);
const soft = canvasTexture(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

/** "Marine snow": points that glow only inside the searchlight cone (plus a faint ambient). */
export function marineSnow(count = 2800) {
  const pos = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 28, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 28], i * 3);
    size[i] = 0.5 + Math.random() * Math.random() * 2.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aS", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uLP: { value: new THREE.Vector3() }, uLD: { value: new THREE.Vector3(0, 0, -1) }, uCos: { value: Math.cos(0.44) },
                uPR: { value: 1 }, uAmb: { value: 0.045 }, uOn: { value: 1 }, uStreak: { value: 0 } },
    vertexShader: /* glsl */`
      uniform vec3 uLP; uniform vec3 uLD; uniform float uCos; uniform float uPR; uniform float uAmb; uniform float uOn;
      attribute float aS; varying float vB;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 d = wp.xyz - uLP; float dist = max(length(d), 0.001); float c = dot(d / dist, uLD);
        float cone = smoothstep(uCos - 0.05, uCos + 0.08, c) / (1.0 + dist * dist * 0.05) * uOn;
        vec4 mv = viewMatrix * wp; float z = max(0.25, -mv.z);
        vB = (uAmb + cone * 1.8) * exp(-z * 0.06);
        gl_PointSize = aS * uPR * (7.0 / z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uStreak; varying float vB;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        p.y *= 1.0 - uStreak * 0.75;                       // moving fast: flakes stretch into short streaks
        float a = smoothstep(0.5, 0.05, length(p));
        gl_FragColor = vec4(vec3(0.82, 0.91, 0.93) * vB, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points, mat,
    /** Keep flakes around the camera; rise = extra drift upwards (descending fast). */
    update(dt, time, cam, rise = 0) {
      const p = pos;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] += dt * (0.06 + rise); p[i] += Math.sin(time * 0.3 + i) * dt * 0.02;
        for (let a = 0; a < 3; a++) {
          const c = a === 0 ? cam.x : a === 1 ? cam.y : cam.z, h = a === 1 ? 7 : 14, v = p[i + a] - c;
          if (v > h) p[i + a] -= 2 * h; else if (v < -h) p[i + a] += 2 * h;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** The real "Nerpa-2" at full size. */
function realNerpa() {
  const g = new THREE.Group();
  const yel = std({ color: 0xf2b632, roughness: 0.4, metalness: 0.25 });
  const steel = std({ color: 0x9aa2a8, metalness: 0.85, roughness: 0.35 });
  const glassM = std({ color: 0x0c2a33, roughness: 0.05, metalness: 0.6, emissive: 0x0a3a44 });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 40, 28), yel));
  const port = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), glassM);
  port.position.set(0, 0.05, -0.95); port.scale.z = 0.5; g.add(port);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 10, 30), steel);
  ring.position.set(0, 0.05, -1.02); g.add(ring);
  for (const sx of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 20), std({ color: 0xe8e2d4, roughness: 0.5 }));
    tank.rotation.x = Math.PI / 2; tank.position.set(sx * 1.2, -0.75, 0); g.add(tank);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), steel); leg.position.set(x * 1.05, -0.6, z * 0.9); g.add(leg);
  }
  const skid = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.2), steel); skid.position.y = -1.4; g.add(skid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 20), yel); top.position.y = 1.15; g.add(top);
  const nm = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = "#f2b632"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#1b1b1b"; c.font = "700 40px Manrope, sans-serif"; c.textAlign = "center"; c.fillText(t("nerpa_plate"), w / 2, 46);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), std({ map: nm, roughness: 0.5 }));
  plate.position.set(0.62, 0.5, -0.86); plate.rotation.y = 0.6; g.add(plate);
  const lamps = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.22, 14), steel);
    l.rotation.x = Math.PI / 2; l.position.set(sx * 0.7, -0.35, -1.05); g.add(l);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: new THREE.Color(0xdff2ff).multiplyScalar(4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.setScalar(1.3); glow.position.set(sx * 0.7, -0.35, -1.2); g.add(glow);
    const sl = new THREE.SpotLight(0xdff2ff, 0, 18, 0.45, 0.5, 1.3);
    sl.position.copy(glow.position); sl.target.position.set(sx * 0.7, -3, -8); g.add(sl, sl.target);
    lamps.push({ glow, sl });
  }
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 40, 5), std({ color: 0x111111 }));
  cable.position.y = 21.3; g.add(cable);
  // a column of bubbles from the vents
  const N = 240, bp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) bp.set([(Math.random() - 0.5) * 2.2, 1 + Math.random() * 13, (Math.random() - 0.5) * 2.2], i * 3);
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
  const bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ map: soft, color: 0xcfefff, size: 0.14, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  bubbles.frustumCulled = false; g.add(bubbles);
  g.userData = { lamps, bp, bg };
  return g;
}

export function createDive(view) {
  const camera = view.camera;
  const deep = new THREE.Scene();
  deep.background = new THREE.Color(0x010a10);
  deep.fog = new THREE.FogExp2(0x02161f, 0.082);
  deep.add(new THREE.HemisphereLight(0x0d4257, 0x000000, 0.6));
  const top = new THREE.DirectionalLight(0x3f86a8, 0);
  top.position.set(0, 40, 0);
  deep.add(top);
  const snow = marineSnow();
  snow.mat.uniforms.uPR.value = view.renderer.getPixelRatio();
  deep.add(snow.points);

  // ---- the surface shot
  const surf = new THREE.Group();
  surf.visible = false;
  deep.add(surf);
  const nerpa = realNerpa();
  surf.add(nerpa);
  const surfPlane = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, uniforms: { uT: { value: 0 } },
    vertexShader: "varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */`
      uniform float uT; varying vec2 vP;
      float hh(vec2 p) { return sin(p.x * 0.9 + uT * 1.3) * sin(p.y * 0.8 - uT * 1.1) + 0.5 * sin(p.x * 2.1 - uT * 2.0 + p.y * 1.7); }
      void main() {
        float r = length(vP); float flood = exp(-r * r * 0.0035); float rip = 0.5 + 0.5 * hh(vP * 0.6);
        vec3 c = mix(vec3(0.015, 0.07, 0.1), vec3(0.5, 0.72, 0.78), flood * (0.5 + 0.5 * rip));
        c += vec3(0.9, 0.96, 1.0) * pow(rip, 6.0) * flood * 0.7;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  surfPlane.rotation.x = Math.PI / 2; surfPlane.position.y = 14;
  surf.add(surfPlane);
  const shaftTex = canvasTexture(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(200,232,242,.6)"); gr.addColorStop(1, "rgba(200,232,242,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const gx = g.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, "rgba(0,0,0,1)"); gx.addColorStop(0.5, "rgba(0,0,0,0)"); gx.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out"; g.fillStyle = gx; g.fillRect(0, 0, w, h);
  });
  const shafts = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + Math.random() * 2.6, 34), new THREE.MeshBasicMaterial({
      map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3, side: THREE.DoubleSide, fog: false }));
    m.position.set((Math.random() - 0.5) * 16, -3, (Math.random() - 0.5) * 16 - 2);
    m.rotation.y = Math.random() * 3; m.rotation.z = (Math.random() - 0.5) * 0.25; m.userData.ph = Math.random() * 6;
    surf.add(m); shafts.push(m);
  }

  let rise = 0;
  view.onFrame((dt, time) => {
    if (!active) return;
    snow.update(dt, time, camera.position, rise);
    surfPlane.material.uniforms.uT.value = time;
  });
  let active = false;

  /** Part 1: the real Nerpa sinks past the camera; resolves when the screen is dark again. */
  async function surfaceShot(fadeIn) {
    active = true;
    view.useScene(deep);
    const Y0 = 60;
    surf.position.set(0, Y0, 0); surf.visible = true;
    deep.fog.color.set(0x0b2c3c); deep.fog.density = 0.026; deep.background.set(0x08283a);
    top.color.set(0x7fb8d8); top.intensity = 3.4;
    snow.mat.uniforms.uOn.value = 0; snow.mat.uniforms.uAmb.value = 0.3;
    nerpa.position.set(0, 11, 0); nerpa.rotation.set(0, 0.5, 0);
    nerpa.userData.lamps.forEach((l) => { l.glow.material.opacity = 0; l.sl.intensity = 0; });
    const camAt = (k) => {
      camera.position.set(4.6 - k * 1.3, Y0 - 1 - k * 9.5, 7 - k * 2);
      camera.lookAt(nerpa.position.x, Y0 + nerpa.position.y - 0.3, nerpa.position.z);
    };
    camAt(0);
    await fadeIn();
    let lit = false;
    await anim(7.5, (k) => {
      nerpa.position.y = 11 - ease(k) * 24; nerpa.rotation.y = 0.5 + k * 0.6; nerpa.rotation.z = Math.sin(k * 6) * 0.04;
      camAt(k);
      for (const m of shafts) m.material.opacity = (0.25 + 0.2 * Math.sin(performance.now() / 1250 + m.userData.ph)) * (1 - k * 0.7);
      top.intensity = 3.4 * (1 - k * 0.85); deep.fog.density = 0.026 + k * 0.035;
      snow.mat.uniforms.uAmb.value = 0.3 * (1 - k) + 0.045;
      if (!lit && k > 0.3) { lit = true; nerpa.userData.lamps.forEach((l) => { l.glow.material.opacity = 0.9; l.sl.intensity = 30; }); }
      const bp = nerpa.userData.bp;
      for (let i = 1; i < bp.length; i += 3) { bp[i] += 0.06; if (bp[i] > 14) bp[i] = 1; }
      nerpa.userData.bg.attributes.position.needsUpdate = true;
    });
  }

  /** Back to the table scene. */
  function leave() {
    active = false;
    surf.visible = false;
    view.useScene(null);
  }

  return { deep, surfaceShot, leave };
}
