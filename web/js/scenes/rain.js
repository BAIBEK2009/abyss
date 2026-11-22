// Rain (the storm, act II): short streaks falling in a box that travels with the camera, slanted by the wind, one
// draw call (LineSegments). A streak is brighter near a lamp (the drops catch the light), and none fall inside the
// wheelhouse (a box in ship space). update(camera, lamps[], amount 0..1, wind 0..1, time).
import * as THREE from "three";

export function createRain({ count = 7000, box = new THREE.Vector3(26, 14, 26), shelter = null } = {}) {
  const seeds = new Float32Array(count * 2 * 3), end = new Float32Array(count * 2), spd = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * box.x, y = Math.random() * box.y, z = Math.random() * box.z, v = 0.75 + Math.random() * 0.5;
    for (let k = 0; k < 2; k++) { seeds.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; spd[i * 2 + k] = v; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
  geo.setAttribute("aSpd", new THREE.BufferAttribute(spd, 1));
  const lamps = Array.from({ length: 6 }, () => new THREE.Vector4());
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uWind: { value: 0 }, uAmt: { value: 0 },
                uLamps: { value: lamps }, uShipInv: { value: new THREE.Matrix4() }, uMin: { value: shelter?.min ?? new THREE.Vector3(1, 1, 1) },
                uMax: { value: shelter?.max ?? new THREE.Vector3(0, 0, 0) }, uFlash: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float uT; uniform vec3 uCam; uniform vec3 uBox; uniform float uWind; uniform mat4 uShipInv; uniform vec3 uMin; uniform vec3 uMax;
      attribute float aEnd; attribute float aSpd; varying float vA; varying vec3 vP;
      void main() {
        vec3 vel = vec3(-3.5 * uWind, -11.0, -1.5 * uWind) * aSpd;          // m/s: down, and across with the wind
        vec3 p = mod(position + vel * uT - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
        p -= vel * 0.045 * aEnd;                                             // the streak: where the drop was 45 ms ago
        vec3 s = (uShipInv * vec4(p, 1.0)).xyz;
        float inside = step(uMin.x, s.x) * step(s.x, uMax.x) * step(uMin.y, s.y) * step(s.y, uMax.y) * step(uMin.z, s.z) * step(s.z, uMax.z);
        float dc = length(p - uCam);
        vA = (1.0 - inside) * (1.0 - smoothstep(0.35, 0.5, length((p - uCam) / uBox))) * smoothstep(1.2, 4.0, dc) * (0.45 + 0.55 * fract(position.x * 7.31 + position.z * 3.17));
        vP = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uAmt; uniform vec4 uLamps[6]; uniform float uFlash; varying float vA; varying vec3 vP;
      void main() {
        float lit = 0.0;
        for (int i = 0; i < 6; i++) { vec3 d = vP - uLamps[i].xyz; lit += uLamps[i].w * exp(-dot(d, d) / 10.0); }
        vec3 col = vec3(0.32, 0.38, 0.46) * (0.11 + 0.6 * uFlash) + vec3(1.0, 0.86, 0.66) * min(lit, 2.0) * 0.32;
        gl_FragColor = vec4(col * vA * uAmt, 1.0);
      }`,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  return {
    object: lines,
    /** lampList: [{pos: Vector3, k}] up to 6; ship: the ship group (for the shelter box). */
    update(camera, lampList, amount, wind, time, ship, flash = 0) {
      lines.visible = amount > 0.01;
      if (!lines.visible) return;
      const u = mat.uniforms;
      u.uT.value = time; u.uCam.value.copy(camera.position); u.uAmt.value = amount; u.uWind.value = wind; u.uFlash.value = flash;
      lamps.forEach((l, i) => { const s = lampList[i]; if (s) l.set(s.pos.x, s.pos.y, s.pos.z, s.k); else l.set(0, -999, 0, 0); });
      if (ship) u.uShipInv.value.copy(ship.matrixWorld).invert();
    },
  };
}
