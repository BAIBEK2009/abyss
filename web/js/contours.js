// Contour lines of the belief map — the cutting lines of a laser-cut topographic model.
// Pure geometry (no three.js): smooth the 10x10 grid, run marching squares, join the segments
// into closed loops, and sort loops into outer outlines and holes.
//
// Coordinates are "map units": u = 0..10 left->right, v = 0..10 top->bottom (cell (x, y) is the
// square [x, x+1] x [y, y+1]; its centre is (x + 0.5, y + 0.5)).

export const RES = 5;  // samples per cell of the smoothed field

/** Catmull-Rom: passes exactly through p1 at t=0 and p2 at t=1 (so cell centres keep their P). */
function cr(p0, p1, p2, p3, t) {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
              + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

/**
 * Smoothed field sampled on a fine grid. Two rings of zero cells are added around the map so
 * every contour closes. Returns {values[j][i], u0, step, n}: sample (i, j) is at
 * u = u0 + i*step, v = u0 + j*step.
 */
export function smoothField(P) {
  const N = P.length, PAD = 2, M = N + 2 * PAD;
  const g = Array.from({ length: M }, (_, y) => Array.from({ length: M }, (_, x) => {
    const cx = x - PAD, cy = y - PAD;
    return cx >= 0 && cy >= 0 && cx < N && cy < N ? P[cy][cx] : 0;
  }));
  const at = (x, y) => g[Math.max(0, Math.min(M - 1, y))][Math.max(0, Math.min(M - 1, x))];

  // sample from the centre of the first pad ring (-0.5) to the centre of the last (N + 0.5)
  const u0 = -0.5, step = 1 / RES, n = (N + 1) * RES + 1;
  const values = [];
  for (let j = 0; j < n; j++) {
    const fy = j / RES + PAD - 1;         // fractional row index in g (cell centres)
    const y1 = Math.floor(fy), ty = fy - y1;
    const row = [];
    for (let i = 0; i < n; i++) {
      const fx = i / RES + PAD - 1;
      const x1 = Math.floor(fx), tx = fx - x1;
      const col = [-1, 0, 1, 2].map((d) => cr(at(x1 - 1, y1 + d), at(x1, y1 + d), at(x1 + 1, y1 + d),
                                              at(x1 + 2, y1 + d), tx));
      // clamp to the 4 surrounding cell centres: no overshoot, so a sheet at level k never
      // appears where no cell actually has P >= k
      const near = [at(x1, y1), at(x1 + 1, y1), at(x1, y1 + 1), at(x1 + 1, y1 + 1)];
      const v = cr(col[0], col[1], col[2], col[3], ty);
      row.push(Math.min(Math.max(...near), Math.max(Math.min(...near), v)));
    }
    values.push(row);
  }
  return { values, u0, step, n };
}

// marching-squares segment table: corners a=TL(8) b=TR(4) c=BR(2) d=BL(1); edges T R B L
const TABLE = {
  1: [["L", "B"]], 2: [["B", "R"]], 3: [["L", "R"]], 4: [["T", "R"]],
  6: [["T", "B"]], 7: [["L", "T"]], 8: [["L", "T"]], 9: [["T", "B"]],
  11: [["T", "R"]], 12: [["L", "R"]], 13: [["B", "R"]], 14: [["L", "B"]],
};

/** All closed contour loops of the field at `level`, as arrays of [u, v]. */
export function contourLoops(field, level) {
  const { values, u0, step, n } = field;
  const pts = new Map();     // edge id -> [u, v]
  const adj = new Map();     // edge id -> neighbour ids

  const edge = (kind, i, j) => {
    const id = `${kind}${i},${j}`;
    if (!pts.has(id)) {
      let a, b, pa, pb;
      if (kind === "h") { a = values[j][i]; b = values[j][i + 1]; pa = [i, j]; pb = [i + 1, j]; }
      else { a = values[j][i]; b = values[j + 1][i]; pa = [i, j]; pb = [i, j + 1]; }
      const t = (level - a) / (b - a);
      pts.set(id, [u0 + (pa[0] + (pb[0] - pa[0]) * t) * step, u0 + (pa[1] + (pb[1] - pa[1]) * t) * step]);
    }
    return id;
  };
  const link = (p, q) => {
    if (!adj.has(p)) adj.set(p, []);
    if (!adj.has(q)) adj.set(q, []);
    adj.get(p).push(q); adj.get(q).push(p);
  };

  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = values[j][i], b = values[j][i + 1], c = values[j + 1][i + 1], d = values[j + 1][i];
      const code = (a >= level) * 8 + (b >= level) * 4 + (c >= level) * 2 + (d >= level) * 1;
      if (code === 0 || code === 15) continue;
      const E = { T: () => edge("h", i, j), R: () => edge("v", i + 1, j),
                  B: () => edge("h", i, j + 1), L: () => edge("v", i, j) };
      let segs = TABLE[code];
      if (code === 5 || code === 10) {        // saddle: decide by the centre value
        const centre = (a + b + c + d) / 4 >= level;
        segs = (code === 5) === centre ? [["L", "T"], ["B", "R"]] : [["T", "R"], ["L", "B"]];
      }
      for (const [e1, e2] of segs) link(E[e1](), E[e2]());
    }
  }

  // walk the adjacency graph into closed loops
  const loops = [], seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = null, cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(pts.get(cur));
      const next = adj.get(cur).find((q) => q !== prev && !seen.has(q));
      prev = cur; cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export function area(loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function inside([x, y], loop) {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i], [xj, yj] = loop[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** One pass of Chaikin corner cutting: rounder, still closed. */
export function chaikin(loop) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length];
    out.push([0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2], [0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2]);
  }
  return out;
}

/**
 * Sort loops into shapes: [{outer, holes: [...]}]. A loop inside an even number of other loops is
 * an outer outline; inside an odd number it is a hole of its smallest enclosing outer.
 */
export function nestLoops(loops, minArea = 0.01) {
  const L = loops.filter((l) => Math.abs(area(l)) >= minArea)
                 .map((l) => ({ pts: l, a: Math.abs(area(l)) }));
  for (const l of L) {
    l.parents = L.filter((o) => o !== l && o.a > l.a && inside(l.pts[0], o.pts));
    l.depth = l.parents.length;
  }
  const shapes = new Map();
  for (const l of L) if (l.depth % 2 === 0) shapes.set(l, { outer: l.pts, holes: [] });
  for (const l of L) {
    if (l.depth % 2 === 0) continue;
    const owner = l.parents.filter((o) => o.depth === l.depth - 1).sort((p, q) => p.a - q.a)[0];
    if (owner) shapes.get(owner).holes.push(l.pts);
  }
  return [...shapes.values()];
}
