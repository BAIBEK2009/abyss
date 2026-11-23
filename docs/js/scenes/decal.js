// Projected decals on curved surfaces, after three.js DecalGeometry (MIT): the triangles of a mesh inside an
// oriented box are clipped against the box's six planes and get UVs from the projection.
import * as THREE from "three";

/**
 * mesh: the target (its matrixWorld is used); position, orientation (Euler) and size (Vector3) of the projector box,
 * in the same space as the mesh's world. Returns a BufferGeometry in that space (position, normal, uv).
 */
export function decalGeometry(mesh, position, orientation, size) {
  mesh.updateMatrixWorld(true);
  const proj = new THREE.Matrix4().makeRotationFromEuler(orientation).setPosition(position);
  const projInv = proj.clone().invert();
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const P = geo.attributes.position, N = geo.attributes.normal;
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const dir = new THREE.Vector3(0, 0, 1).applyEuler(orientation);           // the projector looks along -z of its box
  let verts = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    const tri = [];
    let facing = 0;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(P, i + k).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(N, i + k).applyMatrix3(nm).normalize();
      facing += n.dot(dir);
      tri.push({ p: v.clone().applyMatrix4(projInv), n: n.clone() });
    }
    if (facing <= 0.3) continue;                                            // only the faces turned to the projector
    verts.push(...tri);
  }
  const clip = (list, axis, s) => {           // keep the side where p[axis]*s <= size/2
    const out = [], h = size.getComponent(axis) / 2;
    for (let i = 0; i < list.length; i += 3) {
      const tri = list.slice(i, i + 3), d = tri.map((q) => q.p.getComponent(axis) * s - h);
      const inside = d.map((x) => x <= 0), cnt = inside.filter(Boolean).length;
      if (cnt === 3) { out.push(...tri); continue; }
      if (cnt === 0) continue;
      const poly = [];
      for (let k = 0; k < 3; k++) {
        const a = tri[k], b = tri[(k + 1) % 3], da = d[k], db = d[(k + 1) % 3];
        if (da <= 0) poly.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db);
          poly.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize() });
        }
      }
      for (let k = 1; k + 1 < poly.length; k++) out.push(poly[0], poly[k], poly[k + 1]);
    }
    return out;
  };
  for (let axis = 0; axis < 3; axis++) { verts = clip(verts, axis, 1); verts = clip(verts, axis, -1); }
  const pos = [], nor = [], uv = [];
  for (const q of verts) {
    uv.push(0.5 + q.p.x / size.x, 0.5 + q.p.y / size.y);
    const w = q.p.clone().applyMatrix4(proj).addScaledVector(q.n, 0.002);  // a hair off the surface
    pos.push(w.x, w.y, w.z); nor.push(q.n.x, q.n.y, q.n.z);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
