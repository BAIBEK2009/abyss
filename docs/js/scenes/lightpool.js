// A pool of point lights. Every lit material pays for every point light in the scene, on every pixel, wherever
// the light is: on the deck 13 of them cost more than the rest of the frame. The scene keeps its lamps where
// they were built (as markers on their parents, so they move with the ship), and a few real lights take the
// lamps nearest the camera each frame. The number of lights never changes, so no shader is rebuilt; a lamp
// that gains or loses a slot fades in or out over ~0.3 s, one spare slot holds the one fading out.
import * as THREE from "three";

const v = new THREE.Vector3();

export function lightPool(scene, { slots = 4, exclude = [] } = {}) {
  const lamps = [];
  scene.traverse((o) => { if (o.isPointLight && !exclude.includes(o)) lamps.push(o); });
  const items = lamps.map((l) => {
    const m = new THREE.Object3D();
    m.position.copy(l.position);
    l.parent.add(m);
    l.parent.remove(l);
    return { m, color: l.color.clone(), intensity: l.intensity, distance: l.distance, decay: l.decay, w: 0, on: false, s: 0, at: new THREE.Vector3() };
  });
  const real = Array.from({ length: Math.min(slots + 1, items.length) }, () => {
    const p = new THREE.PointLight(0xffffff, 0, 1, 1.5);
    scene.add(p);
    return p;
  });

  function update(cam, dt = 0) {
    for (const it of items) {
      it.m.getWorldPosition(it.at);
      const d = it.at.distanceTo(cam);
      // how much the lamp shows around the camera: bright and near first; past its range it hardly counts
      it.s = (it.intensity / (1 + d * d)) * (d < (it.distance || 1e9) + 6 ? 1 : 0.02);
    }
    const ranked = items.slice().sort((a, b) => b.s - a.s);
    const want = new Set(ranked.slice(0, slots));
    // hysteresis: a lamp that has a slot keeps it unless a new one is clearly brighter
    const weakest = ranked[Math.min(slots, ranked.length) - 1];
    for (const it of items) if (it.on && !want.has(it) && it.s > (weakest?.s ?? 0) / 1.3) { want.delete(weakest); want.add(it); break; }
    const k = dt > 0 ? Math.min(1, dt * 6) : 1;
    for (const it of items) { it.on = want.has(it); it.w += ((it.on ? 1 : 0) - it.w) * k; }
    const shown = items.slice().sort((a, b) => b.w - a.w);
    real.forEach((p, i) => {
      const it = shown[i];
      if (!it || it.w < 0.002) { p.intensity = 0; return; }
      p.position.copy(it.at); p.color.copy(it.color); p.distance = it.distance; p.decay = it.decay;
      p.intensity = it.intensity * it.w;
    });
  }
  return { update, get count() { return items.length; }, real };
}
