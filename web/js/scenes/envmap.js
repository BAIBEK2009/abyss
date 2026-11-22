// Image-based light for the surface (Poly Haven CC0 HDRIs, 1k, web/assets/env): an HDR sky -> PMREM -> the scene's
// environment, so paint, steel, glass and wet decks reflect a real night sky. The visible sky stays our own.
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export const ENV_FILES = {
  night: "assets/env/kloppenheim_02_puresky_1k.hdr",      // a clear night
  overcast: "assets/env/kloppenheim_07_puresky_1k.hdr",   // an overcast night: the storm and the fog
};
const cache = new Map();

/** A PMREM environment texture for a sky (cached); resolves null if the file cannot be loaded. */
export function loadEnv(renderer, name) {
  if (!cache.has(name)) {
    cache.set(name, new Promise((resolve) => {
      new RGBELoader().load(ENV_FILES[name], (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const pm = new THREE.PMREMGenerator(renderer);
        const tex = pm.fromEquirectangular(hdr).texture;
        hdr.dispose(); pm.dispose();
        resolve(tex);
      }, undefined, () => resolve(null));
    }));
  }
  return cache.get(name);
}

// PBR texture sets (Poly Haven CC0, 1k jpg in web/assets/deck): colour + normal (GL) + roughness
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
/** One image per file; clones (each with its own repeat) are flagged for upload once the image has arrived. */
function tex(path, srgb) {
  if (!texCache.has(path)) {
    const entry = { waiting: [] };
    entry.t = texLoader.load(path, () => { for (const c of entry.waiting) c.needsUpdate = true; entry.waiting = null; });
    entry.t.wrapS = entry.t.wrapT = THREE.RepeatWrapping;
    entry.t.anisotropy = 8;
    if (srgb) entry.t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(path, entry);
  }
  return texCache.get(path);
}
function cloneOf(path, srgb, repeat) {
  const e = tex(path, srgb), c = e.t.clone();
  c.repeat.set(repeat[0], repeat[1]);
  if (e.waiting) e.waiting.push(c); else c.needsUpdate = true;
  return c;
}
/** {map, normalMap, roughnessMap} of a set, each a clone with its own repeat (they share the image). */
export function pbrSet(name, repeat = [1, 1], { color = true } = {}) {
  const base = `assets/deck/${name}`;
  const out = { normalMap: cloneOf(`${base}_nor_gl_1k.jpg`, false, repeat), roughnessMap: cloneOf(`${base}_rough_1k.jpg`, false, repeat) };
  if (color) out.map = cloneOf(`${base}_diff_1k.jpg`, true, repeat);
  return out;
}
