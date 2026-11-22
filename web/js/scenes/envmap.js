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
function tex(path, srgb) {
  if (!texCache.has(path)) {
    const t = texLoader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(path, t);
  }
  return texCache.get(path);
}
/** {map, normalMap, roughnessMap} of a set, each a clone with its own repeat (they share the image). */
export function pbrSet(name, repeat = [1, 1], { color = true } = {}) {
  const base = `assets/deck/${name}`;
  const out = {
    normalMap: tex(`${base}_nor_gl_1k.jpg`, false).clone(),
    roughnessMap: tex(`${base}_rough_1k.jpg`, false).clone(),
  };
  if (color) out.map = tex(`${base}_diff_1k.jpg`, true).clone();
  for (const t of Object.values(out)) { t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; }
  return out;
}
