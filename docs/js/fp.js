// First person on foot (CLAUDE.md 22.4, 23.2): WASD / arrows, the mouse turns the head (pointer lock),
// Shift runs, collisions with rails, walls and things, steps with a sound, a light bob in time with the
// ship. Without a mouse (touchpad, touch): drag to look, click on the floor and the captain walks there
// (a short A* path over a walk grid), click on a thing and he walks up to it and uses it.
//
// A "space" describes where we walk (all in metres, space-local):
//   { scale, eye, poly: [[x, z], ...] walk area, colliders: [[x0, z0, x1, z1], ...], floor: [meshes],
//     toWorld(x, y, z, out), orient(yaw, pitch, out quaternion), toLocal(world, out), step: "metal" | "wood" }
// Things to use: [{ id, show: [objects to outline], hit: mesh, stand: [x, z], look: [x, y, z],
//                    prompt() -> text | null (null = not usable now), use() }]
import * as THREE from "three";

const RADIUS = 0.3, WALK = 1.45, RUN = 3.0, REACH = 2.5, SENS = 0.0022;

function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function createFirstPerson(view, { onStep, onLockLost, isBlocked, onLockedClick } = {}) {
  const cam = view.camera;
  const canvas = view.renderer.domElement;
  const ray = new THREE.Raycaster();
  let space = null, things = [];
  const me = { x: 0, z: 0, yaw: 0, pitch: 0, bob: 0, moving: 0 };
  const keys = new Set();
  let active = false, locked = false, releasing = false;
  let lookOnly = false;                       // the binoculars, the radio: turn the head, do not walk
  let path = null, pathThing = null;          // click-to-walk
  let focus = null;                           // the thing under the crosshair (within reach)
  let grid = null;
  const listeners = { focus: [] };

  // ---------------------------------------------------------------- collisions
  function free(x, z) {
    if (!inPoly(space.poly, x, z)) return false;
    for (const [x0, z0, x1, z1] of space.colliders) {
      const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
      if ((x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS) return false;
    }
    return true;
  }
  function moveBy(dx, dz) {
    let moved = false;
    if (free(me.x + dx, me.z)) { me.x += dx; moved = true; }
    if (free(me.x, me.z + dz)) { me.z += dz; moved = true; }
    return moved;
  }

  // ---------------------------------------------------------------- the walk grid and A* (for clicks)
  const CELL = 0.25;
  function buildGrid() {
    const xs = space.poly.map((p) => p[0]), zs = space.poly.map((p) => p[1]);
    const x0 = Math.min(...xs), z0 = Math.min(...zs);
    const w = Math.ceil((Math.max(...xs) - x0) / CELL) + 1, h = Math.ceil((Math.max(...zs) - z0) / CELL) + 1;
    const ok = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) ok[j * w + i] = free(x0 + i * CELL, z0 + j * CELL) ? 1 : 0;
    grid = { x0, z0, w, h, ok };
  }
  const cellOf = (x, z) => [Math.round((x - grid.x0) / CELL), Math.round((z - grid.z0) / CELL)];
  function nearestFree(i, j) {
    for (let r = 0; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < grid.w && b < grid.h && grid.ok[b * grid.w + a]) return [a, b];
    }
    return null;
  }
  function lineFree(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
    for (let k = 1; k <= n; k++) if (!free(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
    return true;
  }
  function findPath(tx, tz) {
    const s = nearestFree(...cellOf(me.x, me.z)), g = nearestFree(...cellOf(tx, tz));
    if (!s || !g) return null;
    const { w, h, ok } = grid, N = w * h;
    const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const si = s[1] * w + s[0], gi = g[1] * w + g[0];
    const hh = (i) => { const dx = Math.abs((i % w) - g[0]), dz = Math.abs(((i / w) | 0) - g[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    gs[si] = 0;
    const open = [[hh(si), si]];
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === gi) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % w, cz = (cur / w) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx;
        if (!ok[ni] || closed[ni]) continue;
        if (dx && dz && (!ok[cz * w + nx] || !ok[nz * w + cx])) continue;    // no corner cutting
        const ng = gs[cur] + (dx && dz ? 1.414 : 1);
        if (ng < gs[ni]) { gs[ni] = ng; from[ni] = cur; open.push([ng + hh(ni), ni]); }
      }
    }
    if (from[gi] < 0 && gi !== si) return null;
    const pts = [];
    for (let c = gi; c !== -1; c = from[c]) pts.push([grid.x0 + (c % w) * CELL, grid.z0 + ((c / w) | 0) * CELL]);
    pts.reverse();
    // string-pull: keep only the corners we cannot see past
    const out = [];
    let ax = me.x, az = me.z;
    for (let k = 0; k < pts.length; k++) {
      const nxt = pts[k + 1];
      if (!nxt || !lineFree(ax, az, nxt[0], nxt[1])) { out.push(pts[k]); [ax, az] = pts[k]; }
    }
    return out;
  }

  // ---------------------------------------------------------------- input
  const ACTION_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  addEventListener("keydown", (e) => {
    if (!active || isBlocked?.()) return;
    if (e.target.closest?.("input, textarea")) return;
    if (ACTION_KEYS.has(e.code)) {
      keys.add(e.code);
      path = null; pathThing = null;
      if (e.code.startsWith("Key") || e.code.startsWith("Arrow")) e.preventDefault();
      if (!locked && !e.repeat && matchMedia("(pointer: fine)").matches) lock();
    }
    if (e.code === "KeyE" && !e.repeat) use();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  function lock() { try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* not allowed: drag to look */ } }
  function unlock() { if (document.pointerLockElement) { releasing = true; document.exitPointerLock(); } }
  document.addEventListener("pointerlockchange", () => {
    const was = locked;
    locked = document.pointerLockElement === canvas;
    if (was && !locked && active && !releasing) onLockLost?.();      // Esc: the browser freed the cursor -> the menu
    releasing = false;
    document.body.classList.toggle("fp-locked", locked);
  });
  addEventListener("mousemove", (e) => { if (active && locked) turn(e.movementX, e.movementY); });
  // without the lock: drag to look, a click walks or uses
  let down = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!active || isBlocked?.()) return;
    if (locked) { if (e.button === 0 && !onLockedClick?.() && !lookOnly) use(); return; }
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: false, id: e.pointerId };
  });
  addEventListener("pointermove", (e) => {
    if (!down || locked) return;
    const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.drag = true;
    if (down.drag) turn(dx * 1.6, dy * 1.6);
    down.lx = e.clientX; down.ly = e.clientY;
  });
  addEventListener("pointerup", (e) => {
    if (!down) return;
    const d = down; down = null;
    if (!active || d.drag || locked || isBlocked?.()) return;
    if (onLockedClick?.() || lookOnly) return;
    clickAt(e.clientX, e.clientY);
  });

  function turn(dx, dy) {
    me.yaw -= dx * SENS;
    me.pitch = Math.max(-1.25, Math.min(1.2, me.pitch - dy * SENS));
  }

  const ndc = new THREE.Vector2();
  function clickAt(x, y) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    // a thing first: walk up to it and use it
    const hits = ray.intersectObjects(things.map((th) => th.hit), false);
    const th = hits.length && things.find((x2) => x2.hit === hits[0].object);
    if (th && th.prompt()) {
      if (focus === th) return use();
      return walkTo(th.stand[0], th.stand[1], th);
    }
    const fh = ray.intersectObjects(space.floor, false);
    if (fh.length) {
      const p = space.toLocal(fh[0].point, new THREE.Vector3());
      walkTo(p.x / space.scale, p.z / space.scale, null);
    }
  }
  function walkTo(x, z, thing) {
    path = findPath(x, z);
    pathThing = path ? thing : null;
    if (!path && thing) { pathThing = null; }
  }
  function use() {
    if (!active || isBlocked?.() || lookOnly) return false;     // looking through the binoculars / at the radio: E is theirs
    if (focus && focus.prompt()) { const f = focus; f.use(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- per frame
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), look = new THREE.Vector3();
  function update(dt, time) {
    if (!active) return;
    const blocked = isBlocked?.() || lookOnly;
    const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
    let fx = 0, fz = 0;
    if (!blocked) {
      if (keys.has("KeyW") || keys.has("ArrowUp")) fz += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) fz -= 1;
      if (keys.has("KeyA")) fx += 1;
      if (keys.has("KeyD")) fx -= 1;
      if (keys.has("ArrowLeft")) me.yaw += 1.8 * dt;
      if (keys.has("ArrowRight")) me.yaw -= 1.8 * dt;
    }
    let speed = run ? RUN : WALK, wx = 0, wz = 0;
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    if (fx || fz) {
      const l = Math.hypot(fx, fz);
      wx = (fz * sy + fx * cy) / l; wz = (fz * cy - fx * sy) / l;
    } else if (path && !blocked) {              // follow the clicked path, turning towards it
      const [px, pz] = path[0];
      const dx = px - me.x, dz = pz - me.z, d = Math.hypot(dx, dz);
      if (d < 0.12) { path.shift(); if (!path.length) arrive(); }
      else {
        wx = dx / d; wz = dz / d; speed = WALK * 1.15;
        const want = Math.atan2(dx, dz);
        let da = want - me.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
        me.yaw += da * Math.min(1, dt * 5);
      }
    }
    me.moving = 0;
    if (wx || wz) {
      const step = speed * dt;
      if (moveBy(wx * step, wz * step)) me.moving = run ? 2 : 1;
      else if (path) { path = null; pathThing = null; }
    }
    // the head bob and the steps (two per cycle)
    if (me.moving) {
      const before = Math.sin(me.bob);
      me.bob += dt * (me.moving === 2 ? 11 : 7.2);
      if (Math.sign(Math.sin(me.bob)) !== Math.sign(before)) onStep?.(space.step, me.moving === 2);
    }
    const bobY = me.moving ? Math.abs(Math.sin(me.bob)) * 0.04 : 0;
    space.toWorld(me.x * space.scale, (space.eye + bobY) * space.scale, me.z * space.scale, pos);
    space.orient(me.yaw, me.pitch, quat);
    cam.position.copy(pos);
    cam.quaternion.copy(quat);
    cam.updateMatrixWorld();
    // what do we look at?
    let f = null;
    if (!blocked) {
      ray.setFromCamera(ndc.set(0, 0), cam);
      ray.far = REACH * space.scale;
      const hits = ray.intersectObjects(things.map((th) => th.hit), false);
      ray.far = Infinity;
      if (hits.length) f = things.find((th) => th.hit === hits[0].object && th.prompt()) ?? null;
    }
    if (f !== focus) { focus = f; for (const fn of listeners.focus) fn(f); }
  }
  function arrive() {
    const th = pathThing; path = null; pathThing = null;
    if (!th) return;
    // face the thing, then use it
    const dx = th.look[0] - me.x, dz = th.look[2] - me.z;
    me.yaw = Math.atan2(dx, dz);
    const eyeY = space.eye, dy = th.look[1] - eyeY;
    me.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    setTimeout(() => { if (active && th.prompt()) th.use(); }, 250);
  }

  return {
    /** Enter a space at {x, z, yaw}. */
    enter(sp, start, list = []) {
      space = sp; things = list;
      me.x = start.x; me.z = start.z; me.yaw = start.yaw ?? 0; me.pitch = start.pitch ?? -0.05;
      path = null; pathThing = null; focus = null;
      buildGrid();
      active = true;
      document.body.classList.add("fp");
    },
    leave() {
      active = false; keys.clear(); path = null; focus = null;
      for (const fn of listeners.focus) fn(null);
      unlock();
      document.body.classList.remove("fp", "fp-locked");
    },
    setThings(list) { things = list; },
    /** Tests: the things here, read only (id, where to stand, where to look). */
    get thingsInfo() { return things.map((t) => ({ id: t.id, stand: t.stand, look: t.look, prompt: !!t.prompt?.() })); },
    set lookOnly(on) { lookOnly = on; if (on) { path = null; keys.clear(); } },
    get lookOnly() { return lookOnly; },
    update, use, unlock, lock,
    get active() { return active; },
    get locked() { return locked; },
    get focus() { return focus; },
    get pos() { return me; },
    get space() { return space; },
    /** World position of the eye (for the waypoint distance). */
    eyeWorld: () => cam.position,
    onFocus: (fn) => listeners.focus.push(fn),
    /** Debug / tests: teleport. */
    place(x, z, yaw = me.yaw, pitch = me.pitch) { me.x = x; me.z = z; me.yaw = yaw; me.pitch = pitch; },
    walkTo: (x, z) => walkTo(x, z, null),
    walkToThing(id) { const th = things.find((x) => x.id === id); if (th) walkTo(th.stand[0], th.stand[1], th); return !!(th && path); },
    get pathLeft() { return path ? path.length : 0; },
  };
}
