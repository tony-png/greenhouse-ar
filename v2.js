// The v2 greenhouse (redesign/proposal-v2.md), built procedurally for the AR/VR pages and the GLB export.
//   Rib: two plies of 2x6 (38 × 140), each a regular polygon with a 30° step on R = 1.80 m centred 0.95 m up; ply B is
//   turned 15° from ply A. 11 identical segments + 2 A legs + 2 B legs per rib, 5 ribs at 1.2 m, 16 ft long.
//   Collar-tie pair at 2.15 m, 12 purlins on the X points, eaves rails, CS16 roof X-straps, leg braces, belled feet,
//   doubled hanging door posts, sliding barn doors at both ends with a vent above, 4-course side dwarf walls,
//   18 polycarbonate sheets.
// Frame: metres, y up, standing on y = 0, the tunnel along z, the front door at -z. Material names follow grain.js, so
// the pages' looks (flat / baked / photo) apply unchanged.
//
// buildStatic("greenhouse" | "frame") → THREE.Group, merged by material (a few draw calls)
// buildAssembly() → { root, steps, apply(step, t), lift(step) }: the build as 14 animated steps
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { kindOf, surfaceUVs } from "./grain.js";

const D = Math.PI / 180;
const R = 1.8, HC = 0.95, W = 0.14, T = 0.038;
const LEG_AX = R * Math.cos(15 * D);
const X_OUTER = (LEG_AX + W / 2) / Math.cos(7.5 * D); // rib envelope at an X point
const SKIN_R = X_OUTER + 0.089 + 0.003; // sheet over the purlins
export const DIM = {
  R, Hc: HC, w: W, t: T, legAx: LEG_AX, skinR: SKIN_R, ribZ: [-2.4, -1.2, 0, 1.2, 2.4], half: 2.438,
  ridge: HC + SKIN_R + 0.003, width: 2 * (SKIN_R + 0.006), door: { half: 0.475, top: 2.05 }, collarY: 2.15,
  pad: { x: 2.35, z: 2.95, top: 0, depth: 0.03 }, wallX: 1.9,
};

// ---------- 2D rib (in the rib plane: x across, y up) ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const nrm = (a) => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
const crs = (a, b) => a[0] * b[1] - a[1] * b[0];
const lineX = (p, d, q, e) => add2(p, mul(d, crs(sub(q, p), e) / crs(d, e)));
const arcPt = (deg, r = R) => [r * Math.cos(deg * D), HC + r * Math.sin(deg * D)];

function plyPath(angles, legX) { // centreline points with the cut direction at each (radial at vertices, level at the feet)
  const P = [[-legX, 0.2]], C = [[1, 0]];
  for (const a of angles) { const p = arcPt(a); P.push(p); C.push(nrm(sub(p, [0, HC]))); }
  P.push([legX, 0.2]);
  C.push([1, 0]);
  return { P, C };
}
function bands(pl, ply) {
  const out = [];
  for (let i = 0; i < pl.P.length - 1; i++) {
    const p = pl.P[i], q = pl.P[i + 1], d = nrm(sub(q, p)), n = [-d[1], d[0]];
    const o1 = add2(p, mul(n, W / 2)), o2 = sub(p, mul(n, W / 2));
    const quad = [lineX(o1, d, p, pl.C[i]), lineX(o1, d, q, pl.C[i + 1]), lineX(o2, d, q, pl.C[i + 1]), lineX(o2, d, p, pl.C[i])];
    const leg = i === 0 || i === pl.P.length - 2;
    out.push({ ply, a: p, b: q, d, quad, kind: leg ? "leg" + ply : "seg" });
  }
  return out;
}
export const PIECES = [
  ...bands(plyPath([165, 135, 105, 75, 45, 15], LEG_AX), "A"),
  ...bands(plyPath([180, 150, 120, 90, 60, 30, 0], R), "B"),
];
// X points: where the two plies' centrelines cross (one overlap zone each)
export const XPTS = (() => {
  const X = [];
  for (const a of PIECES.filter((p) => p.ply === "A")) for (const b of PIECES.filter((p) => p.ply === "B")) {
    const r = sub(a.b, a.a), s = sub(b.b, b.a), den = crs(r, s);
    if (Math.abs(den) < 1e-9) continue;
    const t = crs(sub(b.a, a.a), s) / den, u = crs(sub(b.a, a.a), r) / den;
    if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) {
      let bis = nrm(add2(a.d, b.d));
      X.push({ pt: add2(a.a, mul(r, t)), bis });
    }
  }
  return X;
})();
const inQuad = (q, x, y) => { // convex, either winding
  let sgn = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = crs(sub(b, a), [x - a[0], y - a[1]]);
    if (Math.abs(c) < 1e-12) continue;
    if (sgn && Math.sign(c) !== sgn) return false;
    sgn = Math.sign(c);
  }
  return true;
};
const solid = (x, y, ply) => PIECES.some((p) => (!ply || p.ply === ply) && inQuad(p.quad, x, y));
function clearX(y) { let x = 0.3; while (x < 2 && !solid(x, y)) x += 0.002; return x; } // first rib material going out at height y
function underY(x, ply) { let y = 2; while (y < 3 && !solid(x, y, ply)) y += 0.001; return y; } // a ply's underside above x
function outerR(phiDeg) { // the rib envelope along a ray from the arch centre
  let best = 0;
  const dir = [Math.cos(phiDeg * D), Math.sin(phiDeg * D)];
  for (let r = 1.6; r < 2; r += 0.0005) if (solid(dir[0] * r, HC + dir[1] * r)) best = r;
  return best;
}

// ---------- geometry helpers: non-indexed triangle lists with normals ----------
function fromArray(pos, nor) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (nor) g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  else g.computeVertexNormals();
  return g;
}
function prism(pts, z0, z1) { // a polygon in xy, extruded from z0 to z1
  let v = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  if (THREE.ShapeUtils.isClockWise(v)) v = v.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(v, []), pos = [];
  const P = (p, z) => pos.push(p.x, p.y, z);
  for (const [a, b, c] of tris) { P(v[a], z1); P(v[b], z1); P(v[c], z1); P(v[a], z0); P(v[c], z0); P(v[b], z0); }
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    P(a, z0); P(b, z0); P(b, z1); P(a, z0); P(b, z1); P(a, z1);
  }
  return fromArray(pos);
}
function box(x0, x1, y0, y1, z0, z1) {
  [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)];
  [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];
  return prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], Math.min(z0, z1), Math.max(z0, z1));
}
const ni = (g) => { if (g.index) g = g.toNonIndexed(); g.deleteAttribute("uv"); return g; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// a board from a to b (centreline), `h` along the up hint, `w` across
function beam(a, b, w, h, upHint = V(0, 1, 0)) {
  const X = b.clone().sub(a), L = X.length();
  X.normalize();
  const Y = upHint.clone().addScaledVector(X, -upHint.dot(X)).normalize(), Z = X.clone().cross(Y);
  const g = box(0, L, -h / 2, h / 2, -w / 2, w / 2);
  return g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(a));
}
const cyl = (r0, r1, h, seg = 10) => ni(new THREE.CylinderGeometry(r1, r0, h, seg));
// cylinder along `axis` (unit), from `at` for length h
function rod(at, axis, r, h, seg = 10, r1 = r) {
  const g = cyl(r, r1, h, seg).translate(0, h / 2, 0);
  return g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis)).setPosition(at));
}
function flatShape(pts, z, facing) { // a polygon in xy at z, facing ±z
  const tri = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(...p)), []), pos = [], nor = [];
  const ccw = !THREE.ShapeUtils.isClockWise(pts.map((p) => new THREE.Vector2(...p)));
  for (let [a, b, c] of tri) {
    if (ccw !== facing > 0) [b, c] = [c, b];
    for (const i of [a, b, c]) { pos.push(pts[i][0], pts[i][1], z); nor.push(0, 0, facing); }
  }
  return fromArray(pos, nor);
}
// the skin profile: up the left side from 0.30 m, over the arch, down the right; s in metres along it
const SIDE = HC - 0.3, ARC = Math.PI * SKIN_R, PROFILE = 2 * SIDE + ARC;
function profileAt(s, r = SKIN_R) { // → [x, y, nx, ny]
  if (s <= SIDE) return [-r, 0.3 + s, -1, 0];
  if (s >= SIDE + ARC) return [r, 0.3 + (PROFILE - s), 1, 0];
  const a = Math.PI - ((s - SIDE) / ARC) * Math.PI;
  return [r * Math.cos(a), HC + r * Math.sin(a), Math.cos(a), Math.sin(a)];
}
function skinPatch(s0, s1, z0, z1, r = SKIN_R) { // a strip of the skin surface (single-sided, outward)
  const n = Math.max(2, Math.ceil(((s1 - s0) / SKIN_R) / (3 * D))), pos = [], nor = [];
  const cuts = [s0];
  for (const k of [SIDE, SIDE + ARC]) if (k > s0 && k < s1) cuts.push(k);
  cuts.push(s1);
  const samples = [];
  for (let c = 0; c < cuts.length - 1; c++) for (let i = 0; i <= n; i++) samples.push(cuts[c] + ((cuts[c + 1] - cuts[c]) * i) / n);
  for (let i = 0; i < samples.length - 1; i++) {
    const a = profileAt(samples[i], r), b = profileAt(samples[i + 1], r);
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const quad = [[a, z0], [b, z0], [b, z1], [a, z0], [b, z1], [a, z1]];
    for (const [p, z] of quad) { pos.push(p[0], p[1], z); nor.push(p[2], p[3], 0); }
  }
  // winding: outward normal = (b-a) × z for a walk that goes left → right over the top
  const g = fromArray(pos, nor);
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  const nn = g.attributes.normal.array;
  for (let i = 0; i < nn.length; i += 9) for (let k = 0; k < 3; k++) { const t = nn[i + 3 + k]; nn[i + 3 + k] = nn[i + 6 + k]; nn[i + 6 + k] = t; }
  return g;
}
// a thin strip following the skin between two (angle-from-horizontal-on-the-right, z) points, just under the sheets
function strap(a0, z0, a1, z1, side, width = 0.032) {
  const pos = [], nor = [], n = 14, r = SKIN_R - 0.0013;
  const pt = (k) => {
    const a = (a0 + (a1 - a0) * k) * D, z = z0 + (z1 - z0) * k;
    return { p: V(side * r * Math.cos(a), HC + r * Math.sin(a), z), n: V(side * Math.cos(a), Math.sin(a), 0) };
  };
  for (let i = 0; i < n; i++) {
    const A = pt(i / n), B = pt((i + 1) / n), along = B.p.clone().sub(A.p).normalize(), across = A.n.clone().cross(along).normalize().multiplyScalar(width / 2);
    const a1p = A.p.clone().add(across), a2p = A.p.clone().sub(across), b1p = B.p.clone().add(across), b2p = B.p.clone().sub(across);
    for (const [p, nn] of [[a1p, A.n], [a2p, A.n], [b2p, B.n], [a1p, A.n], [b2p, B.n], [b1p, B.n]]) { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); }
    for (const [p, nn] of [[a1p, A.n], [b2p, B.n], [a2p, A.n], [a1p, A.n], [b1p, B.n], [b2p, B.n]]) { pos.push(p.x, p.y, p.z); nor.push(-nn.x, -nn.y, -nn.z); }
  }
  return fromArray(pos, nor);
}

// ---------- materials (glTF base colours, linear) ----------
const MATS = {
  gravel: { c: [0.552, 0.503, 0.397], r: 0.95 },
  pt: { c: [0.429, 0.386, 0.209] }, ptDark: { c: [0.33, 0.3, 0.17] },
  plyA: { c: [0.791, 0.552, 0.212] }, plyB: { c: [0.624, 0.347, 0.091] },
  timber: { c: [0.791, 0.539, 0.202] }, timberLight: { c: [0.855, 0.651, 0.323] },
  steel: { c: [0.275, 0.314, 0.296], r: 0.4, m: 0.8 }, steelDark: { c: [0.068, 0.084, 0.078], r: 0.4, m: 0.8 },
  poly: { c: [0.212, 0.434, 0.527], a: 0.35, r: 0.2 }, channel: { c: [0.716, 0.791, 0.807], a: 0.85, r: 0.4 },
  soil: { c: [0.541, 0.416, 0.298], a: 0.32, r: 1 }, soilDark: { c: [0.369, 0.278, 0.2], r: 1 },
  concrete: { c: [0.663, 0.671, 0.651], r: 0.9 }, stone: { c: [0.741, 0.718, 0.659], a: 0.45, r: 1 }, rebar: { c: [0.42, 0.298, 0.227], r: 0.6, m: 0.6 },
  pot: { c: [0.55, 0.2, 0.09], r: 0.85 }, leaf: { c: [0.1, 0.3, 0.06], r: 0.75 }, tomato: { c: [0.62, 0.05, 0.02], r: 0.35 },
};
let matCache = null;
export function materials() {
  return (matCache ||= Object.fromEntries(Object.entries(MATS).map(([name, o]) => {
    const m = new THREE.MeshStandardMaterial({ name, roughness: o.r ?? 0.8, metalness: o.m ?? 0 });
    m.color.setRGB(...o.c);
    if (o.a) { m.transparent = true; m.opacity = o.a; m.side = THREE.DoubleSide; m.depthWrite = false; }
    return [name, m];
  })));
}

// ---------- the parts ----------
// A unit is what the assembly animates as one thing: poses (named) and keys [{ step, t0, dur, a, b, arc }].
export const STEPS = [
  ["cut", "Cut every piece at 15°"], ["plya", "Lay ply A flat"], ["plyb", "Ply B on top, turned half a step"],
  ["bolt", "Drill through, bolt and screw"], ["feet", "Belled feet below the frost line"], ["raise", "Stand the ribs, rib 5 first"],
  ["collar", "Collar ties at 2.15 m"], ["purlins", "Purlins and eaves rails"], ["brace", "Roof X-straps and leg braces"],
  ["endwalls", "End-wall framing"], ["dwarf", "Dwarf walls"], ["cladding", "Polycarbonate, uncut sheets"],
  ["doors", "Doors, vents and track"], ["final", "Finished"],
];
const S = Object.fromEntries(STEPS.map(([id], i) => [id, i]));
const UP = V(0, 1, 0);
const SPOT = V(4.5, T, 1.55); // where the ribs are put together, flat, before they stand

function generate(asm) {
  const parts = [], units = [];
  const unit = (key, o = {}) => { const u = { key, keys: [], poses: {}, parent: null, up: UP, ...o }; units.push(u); return u; };
  const add = (mat, geo, u, o = {}) => parts.push({ mat, geo, unit: u, ...o });
  // a unit that drops (or slides) into place: from `off` (a vector) at step s, starting t0
  const arrive = (u, s, t0, dur, off, arc = 0) => { u.poses.from = { off }; u.keys.push({ step: s, t0, dur, a: "from", b: "final", arc }); return u; };
  const grow = (u, s, t0, dur, base) => { u.poses.from = { grow: base }; u.keys.push({ step: s, t0, dur, a: "from", b: "final" }); return u; };
  const ribZ = DIM.ribZ, below = !asm ? 0 : -1.2;

  // ---- ribs. In the assembly they are groups: rib 5 is built flat (its pieces and bolt zones animate), then each rib
  // is lifted from the build spot into its feet
  const order = [4, 3, 2, 1, 0]; // rib 5 stands first
  const rib = ribZ.map((z, ri) => {
    const u = unit("rib" + ri, { group: true, z });
    const k = order.indexOf(ri), t = k * 2.7;
    u.poses.spot = { c: SPOT.clone(), q: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2) };
    u.poses.drop = { c: SPOT.clone().add(V(0, 0.6, 0)), q: u.poses.spot.q };
    u.poses.air1 = { c: V(2.3, 1.7, z), q: new THREE.Quaternion() };
    u.poses.air2 = { c: V(0, 0.95, z), q: new THREE.Quaternion() };
    u.poses.final = { c: V(0, 0, z), q: new THREE.Quaternion() };
    if (ri === 4) { u.keys.push({ step: S.cut, t0: 0, dur: 0.01, a: "spot", b: "spot" }); u.hidden = [S.feet]; }
    else u.keys.push({ step: S.raise, t0: t - 1.2, dur: 0.5, a: "drop", b: "spot" });
    u.keys.push({ step: S.raise, t0: t, dur: 1.0, a: "spot", b: "air1", arc: 0.3 }, { step: S.raise, t0: t + 1.0, dur: 0.8, a: "air1", b: "air2" },
      { step: S.raise, t0: t + 1.8, dur: 0.7, a: "air2", b: "final" });
    u.landed = t + 2.5;
    return u;
  });
  const built = rib[4], LOCAL_UP = V(0, 0, 1); // rib-local "up" while it lies flat
  let cutK = 0, layA = 0, layB = 0;
  PIECES.forEach((pc, i) => {
    const z0 = pc.ply === "A" ? -T : 0, z1 = z0 + T;
    for (const [ri, ru] of rib.entries()) {
      let u = ru;
      if (ri === 4 && asm) { // rib 5's own pieces: cut (laid out in rows behind the build spot), then laid into the rib
        u = unit(`r5p${i}`, { parent: built, up: LOCAL_UP });
        const c = pc.quad.reduce((s, q) => add2(s, mul(q, 0.25)), [0, 0]), k = cutK++;
        const ang = Math.atan2(pc.d[1], pc.d[0]), q = new THREE.Quaternion().setFromAxisAngle(LOCAL_UP, -ang);
        const lay = V(k % 2 ? 0.75 : -0.75, -0.35 - Math.floor(k / 2) * 0.17, -T / 2);
        u.pivot = V(c[0], c[1], (z0 + z1) / 2);
        u.poses.above = { c: lay.clone().add(V(0, 0, 0.5)), q };
        u.poses.layout = { c: lay, q };
        u.keys.push({ step: S.cut, t0: k * 0.22, dur: 0.5, a: "above", b: "layout" });
        u.keys.push({ step: pc.ply === "A" ? S.plya : S.plyb, t0: (pc.ply === "A" ? layA++ : layB++) * 0.42, dur: 0.9, a: "layout", b: "final", arc: 0.25 });
      }
      add(pc.ply === "A" ? "plyA" : "plyB", prism(pc.quad, z0, z1), u, { rib: ri });
    }
  });
  // overlap zones: 2 carriage bolts (domed head on the B face, washer and nut on the A face), 6 structural screws from B
  XPTS.forEach((x, i) => {
    const perp = [-x.bis[1], x.bis[0]];
    for (const [ri, ru] of rib.entries()) {
      const u = ri === 4 && asm ? arrive(unit(`r5b${i}`, { parent: built, up: LOCAL_UP }), S.bolt, i * 0.18, 0.45, V(0, 0, 0.4)) : ru;
      for (const s of [-1, 1]) {
        const p = add2(x.pt, mul(x.bis, 0.075 * s));
        boltParts(V(p[0], p[1], 0), V(0, 0, 1), T, T).forEach(([m, g]) => add(m, g, u, { rib: ri }));
      }
      for (const st of [-0.15, 0, 0.15]) for (const s of [-1, 1]) {
        const p = add2(add2(x.pt, mul(x.bis, st)), mul(perp, 0.015 * s));
        add("steelDark", rod(V(p[0], p[1], T), V(0, 0, 1), 0.0065, 0.004, 6), u, { rib: ri });
      }
    }
  });

  // ---- feet: two PT 2x8 boards sandwich the legs from 1.2 m down to 0.6 m up, 3 bolts; belled concrete plug, stone
  const soil = asm && unit("soil", { until: S.feet });
  if (asm) {
    add("soil", box(-DIM.pad.x, DIM.pad.x, -1.25, -0.002, -DIM.pad.z, DIM.pad.z), grow(soil, S.feet, 0, 0.6, -1.25));
  }
  let fk = 0;
  for (const [ri, z] of ribZ.entries()) for (const sx of [-1, 1]) {
    const x = sx * 1.7695, k = fk++;
    const boards = asm ? arrive(unit(`foot${ri}${sx}`), S.feet, 0.6 + k * 0.25, 0.6, V(0, 1.9, 0)) : null;
    for (const s of [-1, 1]) add("ptDark", box(x - 0.092, x + 0.092, below, 0.6, z + s * T, z + s * 2 * T), boards);
    const fb = unit(`footbolt${ri}${sx}`);
    if (asm) arrive(fb, S.raise, rib[ri].landed, 0.3, V(0, 0, 0.25));
    for (const y of [0.27, 0.41, 0.55]) boltParts(V(x + sx * 0.012, y, z), V(0, 0, 1), 2 * T, 2 * T).forEach(([m, g]) => add(m, g, fb));
    if (asm) {
      add("concrete", rod(V(x, -1.2, z), UP, 0.225, 0.25, 16), grow(unit(`bell${ri}${sx}`), S.feet, 3.4 + k * 0.08, 0.5, -1.2));
      add("rebar", rod(V(x, -1.1, z - 0.15), V(0, 0, 1), 0.006, 0.3, 6), boards);
      add("stone", rod(V(x, -0.95, z), UP, 0.16, 0.948, 14), grow(unit(`stone${ri}${sx}`), S.feet, 4.3 + k * 0.08, 0.5, -0.95));
    }
  }

  // ---- collar ties: a 2x4 pair, one each face, centred 2.15 m up, ends at ±1.435; spacers on the middle ribs.
  // At the end ribs the outer piece goes on over the gable sheet with the doors (it carries the track).
  const CY0 = 2.1055, CY1 = 2.1945;
  for (const [ri, z] of ribZ.entries()) {
    const end = ri === 0 || ri === 4, out = ri === 0 ? -1 : 1;
    const inner = asm ? arrive(unit(`collar${ri}`), S.collar, [4, 3, 2, 1, 0].indexOf(ri) * 0.5, 0.7, V(0, 0.9, 0)) : null;
    const outer = end ? (asm ? arrive(unit(`collarOut${ri}`), S.doors, ri ? 0.6 : 0, 0.7, V(0, 0, out * 0.6)) : null) : inner;
    for (const s of [-1, 1]) {
      const isOuter = end && s === out, off = isOuter ? T + 0.009 : T;
      add(isOuter && ri === 4 ? "pt" : "timber", box(-1.435, 1.435, CY0, CY1, z + s * off, z + s * (off + T)), isOuter ? outer : inner);
    }
    const reach = end ? T + 0.009 + T : 2 * T;
    for (const sx of [-1, 1]) for (const [bx, by] of [[1.346, 2.126], [1.314, 2.166]]) {
      boltParts(V(sx * bx, by, z), V(0, 0, 1), end && out > 0 ? reach : 2 * T, end && out < 0 ? reach : 2 * T).forEach(([m, g]) => add(m, g, outer));
    }
    if (!end) for (const sx of [-1, 1]) {
      add("timber", box(sx * 0.5 - 0.0875, sx * 0.5 + 0.0875, CY0, CY1, z - T, z + T), inner);
      boltParts(V(sx * 0.5, 2.15, z), V(0, 0, 1), 2 * T, 2 * T).forEach(([m, g]) => add(m, g, inner));
    }
  }

  // ---- purlins (2x4 on edge on the X points, 12) and eaves rails (2x4 flat, 2): uncut 16 ft, slid in from the front
  const L = 2.4385;
  let pk = 0;
  for (const sx of [-1, 1]) {
    const u = asm ? arrive(unit(`rail${sx}`), S.purlins, sx > 0 ? 0.3 : 0, 0.9, V(0, 0, -5.5)) : null;
    add("timber", box(sx > 0 ? 1.87 : -1.908, sx > 0 ? 1.908 : -1.87, 0.9055, 0.9945, -L, L), u);
  }
  for (const c of [82.5, 67.5, 52.5, 36.45, 22.5, 7.5]) for (const sx of [-1, 1]) {
    const phi = sx > 0 ? 90 - c : 90 + c, r = outerR(phi) + 0.0445;
    const g = box(-0.0445, 0.0445, -0.019, 0.019, -L, L).rotateZ(phi * D).translate(r * Math.cos(phi * D), HC + r * Math.sin(phi * D), 0);
    add("timber", g, asm ? arrive(unit(`purlin${pk}`), S.purlins, 0.7 + pk++ * 0.28, 0.9, V(0, 0, -5.5)) : null);
  }

  // ---- bracing: CS16 coil-strap X over the purlins in bays 1–2 and 4–5 (eaves rail at one rib → 52.5° purlin at the
  // next), and 2x4 leg braces flat on the A legs' inner edges in the same bays
  let bk = 0;
  for (const [za, zb] of [[-2.4, -1.2], [2.4, 1.2]]) for (const sx of [-1, 1]) {
    for (const [p, q] of [[za, zb], [zb, za]]) {
      const u = asm ? arrive(unit(`strap${bk}`), S.brace, bk++ * 0.25, 0.5, V(sx * 0.3, 0.3, 0)) : null;
      add("steel", strap(0, p + Math.sign(q - p) * 0.04, 37.5, q - Math.sign(q - p) * 0.02, sx), u);
    }
    const xi = sx * (LEG_AX - W / 2 - 0.019), u = asm ? arrive(unit(`legbrace${za}${sx}`), S.brace, 2.2 + bk * 0.1, 0.6, V(-sx * 0.8, 0, 0)) : null;
    add("timber", beam(V(xi, 0.3, za + Math.sign(zb - za) * 0.04), V(xi, 1.36, zb - Math.sign(zb - za) * 0.04), 0.038, 0.089), u);
  }

  // ---- end walls (front at -z, back at +z)
  const yB = (x) => underY(x, "B");
  for (const [ri, out] of [[0, -1], [4, 1]]) {
    const z = ribZ[ri], t0 = ri ? 2.6 : 0;
    const ew = (name, dt, off) => (asm ? arrive(unit(`${name}${ri}`), S.endwalls, t0 + dt, 0.6, off) : null);
    const stubs = ew("stubs", 0, V(0, 0.9, 0)), posts = ew("posts", 0.5, V(0, 1.2, 0)), head = ew("head", 1.0, V(0, 0.6, 0));
    const sole = ew("sole", 0.25, V(0, 0.5, 0)), girts = ew("girts", 1.4, V(0, 0, out * 0.8));
    for (const sx of [-1, 1]) {
      const x0 = 0.475, x1 = 0.564;
      const pts = [[x0, 0.063], [x1, 0.063], [x1, yB(x1) - 0.001], [x0, yB(x0) - 0.001]].map(([x, y]) => [sx * x, y]);
      add("timber", prism(pts, z - T, z), posts);
      add("timber", prism(pts, z, z + T), posts);
      add("pt", box(sx > 0 ? 0.475 : -1.66, sx > 0 ? 1.66 : -0.475, 0, 0.038, z - 0.0445, z + 0.0445), sole);
      const zs = z - out * (T + 0.019);
      add("pt", box(sx * 0.52 - 0.07, sx * 0.52 + 0.07, asm ? -0.75 : 0, 0.15, zs - 0.019, zs + 0.019), stubs);
      for (const y0 of [0.3, 1.05, 1.7]) {
        const xe = Math.min(clearX(y0), clearX(y0 + 0.089)) - 0.002;
        add("timber", box(sx > 0 ? x1 : -xe, sx > 0 ? xe : -x1, y0, y0 + 0.089, z - 0.019, z + 0.019), girts);
      }
    }
    add("timber", box(-0.475, 0.475, 2.05, 2.139, z - 0.019, z + 0.019), head);
  }

  // ---- dwarf walls: 4 courses of 1x6 PT on the long sides (0.02–0.58 m), 2 on the end walls; the 1x4 PT strip the
  // sheets stand on
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const u = asm ? arrive(unit(`dwarf${sx}${k}`), S.dwarf, k * 0.35 + (sx > 0 ? 0.15 : 0), 0.6, V(sx * 0.8, 0, 0)) : null;
    const y0 = 0.02 + k * 0.14, xa = sx > 0 ? 1.87 : -1.889, xb = xa + 0.019;
    add("pt", box(xa, xb, y0, y0 + 0.138, -2.438, -0.001), u, { dwarf: true });
    add("pt", box(xa, xb, y0, y0 + 0.138, 0.001, 2.438), u, { dwarf: true });
  }
  for (const sx of [-1, 1]) {
    const u = asm ? arrive(unit(`strip${sx}`), S.dwarf, 1.7, 0.6, V(sx * 0.8, 0, 0)) : null;
    add("pt", box(sx > 0 ? 1.889 : -1.908, sx > 0 ? 1.908 : -1.889, 0.3, 0.389, -2.438, 2.438), u, { dwarf: true });
  }
  const RG = SKIN_R - 0.004;
  for (const [ri, out] of [[0, -1], [4, 1]]) {
    const z = ribZ[ri] + out * T;
    for (let k = 0; k < 2; k++) {
      const u = asm ? arrive(unit(`edwarf${ri}${k}`), S.dwarf, 2.2 + k * 0.3 + (ri ? 0.6 : 0), 0.6, V(0, 0, out * 0.8)) : null;
      for (const sx of [-1, 1]) {
        const y0 = 0.02 + k * 0.14;
        add("pt", box(sx * 0.564, sx * 1.672, y0, y0 + 0.138, z, z + out * 0.019), u, { dwarf: true });
      }
    }
  }

  // ---- cladding: 12 roof sheets, uncut, 3 along the arch × 4 along the tunnel, H-channel at the joints; gable sheets
  const third = PROFILE / 3, colW = (2 * 2.438) / 4;
  let ck = 0;
  for (let col = 0; col < 4; col++) for (let row = 0; row < 3; row++) {
    const za = -2.438 + col * colW + 0.003, zb = za + colW - 0.006;
    const u = asm ? arrive(unit(`sheet${col}${row}`), S.cladding, ck++ * 0.3, 0.7, V(0, 1.4, 0), 0) : null;
    add("poly", skinPatch(row * third + (row ? 0.002 : 0), (row + 1) * third - (row < 2 ? 0.002 : 0), za, zb), u, { clad: true });
  }
  for (let col = 1; col < 4; col++) {
    const zc = -2.438 + col * colW, u = asm ? arrive(unit(`chan${col}`), S.cladding, 3.8 + col * 0.2, 0.5, V(0, 1.0, 0)) : null;
    add("channel", skinPatch(0, PROFILE, zc - 0.012, zc + 0.012, SKIN_R + 0.004), u, { clad: true });
  }
  for (const [ri, out] of [[0, -1], [4, 1]]) {
    const z = ribZ[ri] + out * (T + 0.003), u = asm ? arrive(unit(`gable${ri}`), S.cladding, 4.6 + (ri ? 0.6 : 0), 0.7, V(0, 0, out * 1.0)) : null;
    const xEnd = Math.acos(0.564 / RG);
    for (const sx of [-1, 1]) {
      const pts = [[0.564, 0.3], [1.672, 0.3], [1.672, 0.605], [RG, 0.605], [RG, HC]]; // notched round the foot boards
      for (let a = 0; a <= 1.0001; a += 1 / 24) { const ang = a * xEnd; pts.push([RG * Math.cos(ang), HC + RG * Math.sin(ang)]); }
      add("poly", flatShape(pts.map(([x, y]) => [sx * x, y]), z, out), u, { clad: true });
    }
    const top = [[-0.564, 2.525], [0.564, 2.525]], a0 = Math.acos(0.564 / RG);
    for (let i = 0; i <= 12; i++) { const a = a0 + (i * (Math.PI - 2 * a0)) / 12; top.push([RG * Math.cos(a), HC + RG * Math.sin(a)]); }
    add("poly", flatShape(top, z, out), u, { clad: true });
  }

  // ---- doors (sliding barn doors on a track on the outer collar), vents (sill on the outer collar)
  for (const [ri, out] of [[0, -1], [4, 1]]) {
    const z = ribZ[ri], zo = (d) => z + out * d, t0 = ri ? 1.6 : 0.4;
    const track = asm ? arrive(unit(`track${ri}`), S.doors, t0, 0.5, V(0, 0, out * 0.5)) : null;
    add("steel", box(-0.55, 1.5, 2.115, 2.165, Math.min(zo(0.085), zo(0.091)), Math.max(zo(0.085), zo(0.091))), track, { door: true });
    const door = asm ? arrive(unit(`door${ri}`), S.doors, t0 + 0.5, 1.0, V(1.0, 0, 0)) : null;
    const zf = (a, b) => [Math.min(zo(a), zo(b)), Math.max(zo(a), zo(b))];
    const [f0, f1] = zf(0.099, 0.137), [k0, k1] = zf(0.137, 0.156);
    for (const sx of [-1, 1]) add("timberLight", box(sx > 0 ? 0.411 : -0.5, sx > 0 ? 0.5 : -0.411, 0.045, 2.1, f0, f1), door, { door: true });
    for (const [y0, y1] of [[0.045, 0.134], [0.7, 0.789], [2.011, 2.1]]) add("timberLight", box(-0.411, 0.411, y0, y1, f0, f1), door, { door: true });
    add("timberLight", beam(V(-0.38, 0.14, (f0 + f1) / 2), V(0.38, 0.69, (f0 + f1) / 2), 0.038, 0.089, V(-0.6, 0.8, 0).normalize()), door, { door: true });
    for (let k = 0; k < 5; k++) add("pt", box(-0.5, 0.5, 0.045 + k * 0.131, 0.045 + k * 0.131 + 0.13, k0, k1), door, { door: true });
    add("poly", box(-0.411, 0.411, 0.789, 2.011, (f0 + f1) / 2 - 0.003, (f0 + f1) / 2 + 0.003), door, { door: true, clad: true });
    for (const sx of [-0.35, 0.35]) add("steelDark", rod(V(sx, 2.14, zo(0.093)), V(0, 0, out), 0.032, 0.012, 14), door, { door: true });
    const vent = asm ? arrive(unit(`vent${ri}`), S.doors, t0 + 1.4, 0.6, V(0, 0.6, 0)) : null;
    const [v0, v1] = zf(T + 0.009, T + 0.047);
    for (const sx of [-1, 1]) add("timberLight", box(sx > 0 ? 0.411 : -0.475, sx > 0 ? 0.475 : -0.411, 2.195, 2.522, v0, v1), vent, { door: true });
    for (const [y0, y1] of [[2.195, 2.259], [2.458, 2.522]]) add("timberLight", box(-0.411, 0.411, y0, y1, v0, v1), vent, { door: true });
    add("poly", box(-0.411, 0.411, 2.259, 2.458, (v0 + v1) / 2 - 0.003, (v0 + v1) / 2 + 0.003), vent, { door: true, clad: true });
  }

  // ---- gravel pad and a few tomato plants in pots along the walls
  add("gravel", box(-DIM.pad.x, DIM.pad.x, -DIM.pad.depth, 0, -DIM.pad.z, DIM.pad.z), asm ? arrive(unit("pad"), S.feet, 0, 0.01, V(0, 0, 0)) : null);
  if (asm) { // the pad goes down with the feet; before that the build site is bare
    const pad = units.find((u) => u.key === "pad");
    pad.keys = [{ step: S.raise, t0: 0, dur: 0.01, a: "final", b: "final" }];
  }
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  [[-1.48, 1.6], [1.48, 1.6], [1.48, -0.4], [-1.48, -0.6], [1.48, 0.6], [-1.48, -1.75]].forEach(([x, z], k) => {
    const u = asm ? grow(unit(`plant${k}`), S.final, k * 0.25, 0.8, 0) : null;
    add("pot", rod(V(x, DIM.pad.top, z), UP, 0.1, 0.24, 14, 0.13), u, { plant: true });
    add("soilDark", rod(V(x, DIM.pad.top + 0.215, z), UP, 0.12, 0.01, 14), u, { plant: true });
    add("timberLight", box(x - 0.008, x + 0.008, 0.2, 1.35, z - 0.008, z + 0.008), u, { plant: true });
    for (let i = 0; i < 9; i++) {
      const h = 0.35 + i * 0.11, a = i * 2.4 + k, r = 0.07 + 0.05 * rnd();
      const leaf = ni(new THREE.IcosahedronGeometry(0.075 + 0.04 * rnd(), 0));
      add("leaf", leaf.scale(1, 0.7, 1).translate(x + r * Math.cos(a), h, z + r * Math.sin(a)), u, { plant: true });
      if (i % 3 === 1) {
        const tom = ni(new THREE.IcosahedronGeometry(0.026, 1));
        add("tomato", tom.translate(x + 0.6 * r * Math.cos(a + 1.3), h - 0.06, z + 0.6 * r * Math.sin(a + 1.3)), u, { plant: true });
      }
    }
  });

  // surface coordinates and board shading per part, before anything is merged (butted pieces must stay separate)
  parts.forEach((p, i) => {
    if (!p.geo?.attributes?.position) throw new Error("part " + i + " " + p.mat + " has no geometry");
    const pos = p.geo.attributes.position.array, kind = kindOf(p.mat) || "steel";
    const { uv, color } = surfaceUVs(kind, pos, i + 1);
    p.geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    p.geo.setAttribute("color", new THREE.BufferAttribute(color || new Float32Array(pos.length).fill(1), 3));
  });
  return { parts, units };
}

// carriage bolt along `axis` through a sandwich: domed head at +front, washer and nut at -back (distances from `at`)
function boltParts(at, axis, front, back) {
  const n = axis.clone().normalize(), m = n.clone().negate();
  return [
    ["steel", rod(at.clone().addScaledVector(n, front), n, 0.016, 0.006, 12, 0.011)],
    ["steel", rod(at.clone().addScaledVector(m, back), m, 0.019, 0.003, 12)],
    ["steelDark", rod(at.clone().addScaledVector(m, back + 0.003), m, 0.012, 0.011, 6)],
    ["steel", rod(at.clone().addScaledVector(m, back + 0.014), m, 0.0063, 0.012, 8)],
  ];
}

function meshesByMaterial(parts, mats, xform) {
  const groups = new Map();
  for (const p of parts) {
    const g = xform ? xform(p) : p.geo;
    if (!groups.has(p.mat)) groups.set(p.mat, []);
    groups.get(p.mat).push(g);
  }
  const out = [];
  for (const [name, list] of groups) for (const geo of mats[name].transparent ? list : [mergeGeometries(list, false)]) {
    const mesh = new THREE.Mesh(geo, mats[name]);
    mesh.name = name;
    const clear = mats[name].transparent;
    mesh.castShadow = !clear;
    mesh.receiveShadow = !clear;
    out.push(mesh);
  }
  return out;
}

/** "greenhouse" (finished) or "frame" (no cladding, doors, dwarf boards or plants), merged by material. */
export function buildStatic(which = "greenhouse") {
  const { parts } = generate(false), mats = materials();
  const keep = parts.filter((p) => which !== "frame" || !(p.clad || p.door || p.dwarf || p.plant));
  const group = new THREE.Group();
  group.name = "v2-" + which;
  const ribT = DIM.ribZ.map((z) => new THREE.Matrix4().makeTranslation(0, 0, z));
  meshesByMaterial(keep, mats, (p) => (p.rib != null ? p.geo.clone().applyMatrix4(ribT[p.rib]) : p.geo)).forEach((m) => group.add(m));
  return group;
}

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** The build in STEPS.length steps. apply(step, t) poses everything for time t (s) into that step. */
export function buildAssembly() {
  const { parts, units } = generate(true), mats = materials();
  const root = new THREE.Group();
  root.name = "v2-assembly";
  const byUnit = new Map(units.map((u) => [u, []]));
  for (const p of parts) byUnit.get(p.unit).push(p);
  for (const u of units) {
    u.obj = new THREE.Group();
    u.obj.name = u.key;
    meshesByMaterial(byUnit.get(u), mats).forEach((m) => u.obj.add(m));
    if (!u.pivot) { // the middle of its parts (rib groups pivot on their own origin)
      const b = new THREE.Box3();
      u.obj.children.forEach((m) => { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox); });
      u.pivot = u.group || b.isEmpty() ? V(0, 0, 0) : b.getCenter(V(0, 0, 0));
    }
    if (!u.poses.final) u.poses.final = { c: u.pivot.clone(), q: new THREE.Quaternion() };
    for (const k of Object.keys(u.poses)) { // resolve relative poses: offsets and growth from a base height
      const ps = u.poses[k];
      if (ps.off) u.poses[k] = { c: u.pivot.clone().add(ps.off), q: new THREE.Quaternion() };
      else if (ps.grow != null) u.poses[k] = { c: u.pivot.clone(), q: new THREE.Quaternion(), s: V(1, 0.001, 1), base: ps.grow };
    }
    u.keys.sort((a, b) => a.step - b.step || a.t0 - b.t0);
  }
  for (const u of units) (u.parent ? u.parent.obj : root).add(u.obj);
  const len = STEPS.map((_, s) => Math.max(1.5, ...units.flatMap((u) => u.keys.filter((k) => k.step === s).map((k) => k.t0 + k.dur))) + 0.8);
  const q = new THREE.Quaternion(), c = new THREE.Vector3(), sc = new THREE.Vector3(), piv = new THREE.Vector3();
  function pose(u, a, b, p, arc) {
    const A = u.poses[a], B = u.poses[b];
    c.lerpVectors(A.c, B.c, p);
    if (arc) c.addScaledVector(u.up, Math.sin(Math.PI * p) * arc);
    q.slerpQuaternions(A.q, B.q, p);
    sc.lerpVectors(A.s || V(1, 1, 1), B.s || V(1, 1, 1), p);
    const o = u.obj;
    o.quaternion.copy(q);
    o.scale.copy(sc);
    const base = A.base ?? B.base;
    if (base != null) { // grow from a base height: keep that height fixed
      o.position.set(0, base * (1 - sc.y), 0);
      return;
    }
    piv.copy(u.pivot).multiply(sc).applyQuaternion(q);
    o.position.copy(c).sub(piv);
  }
  function apply(s, t) {
    for (const u of units) {
      let cur = null;
      for (const k of u.keys) { if (k.step < s || (k.step === s && t >= k.t0)) cur = k; else break; }
      const shown = !!cur && !(u.hidden && u.hidden.includes(s)) && !(u.until != null && s > u.until);
      u.obj.visible = shown;
      if (!shown) continue;
      const p = cur.step === s ? Math.min(1, Math.max(0, (t - cur.t0) / cur.dur)) : 1;
      pose(u, cur.a, cur.b, ease(p), cur.arc);
    }
  }
  return {
    root, units, apply,
    steps: STEPS.map(([id, title], i) => ({ id, title, len: len[i] })),
    lift: (s) => (STEPS[s][0] === "feet" ? 1.25 : 0), // the foundations step stands on its soil cut-away
  };
}
