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
