// Surface coordinates for the material looks, shared by the Node preprocessing and the browser.
// Input is a non-indexed triangle list (xyz per corner); output is a UV per corner, in metres:
//   lumber    u along the board's long axis (PCA per connected piece, projected onto each face), v across it,
//             centred on the board; plus a colour multiplier: 0.8 on end grain, a random 0.9-1.0 per board
//   twinwall  v runs across the flutes (along the tunnel on the roof, sideways on the end walls)
//   steel     box projection on the dominant axis
// Port of grain_uvs() in video/blender/stills.py.

export const WOOD_TILE = { plyA: "spruce", timber: "spruce", card: "spruce", timberLight: "spruce_light", plyB: "spruce_dark", bench: "spruce_dark", pt: "treated", ptDark: "treated_dark" };
export const base = (name) => String(name || "").split(".")[0];
export function kindOf(name) {
  const n = base(name);
  if (WOOD_TILE[n]) return "wood";
  if (/^(steel|steelDark|screw|sawDark)$/.test(n)) return "steel";
  if (n === "poly") return "poly";
  return null;
}

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function eigenSym3(m) { // Jacobi; m = [a00,a01,a02,a11,a12,a22] → vectors sorted by value, largest first
  const A = [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]];
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]);
    if (off < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
      const c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return [0, 1, 2].map((i) => ({ value: A[i][i], vec: [V[0][i], V[1][i], V[2][i]] })).sort((a, b) => b.value - a.value);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** pos: Float32Array of a non-indexed triangle list. Returns { uv: Float32Array, color: Float32Array | null }. */
export function surfaceUVs(kind, pos, seed = 1) {
  const corners = pos.length / 3, tris = corners / 3;
  const uv = new Float32Array(corners * 2);
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const faceNormal = (t) => { const a = P(t * 3), b = P(t * 3 + 1), c = P(t * 3 + 2); return norm(cross(sub(b, a), sub(c, a))); };
  if (kind === "steel" || kind === "poly") {
    for (let t = 0; t < tris; t++) {
      const n = faceNormal(t), ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k, p = P(i);
        let u, v;
        if (kind === "poly") { // flutes: end walls vary sideways (x), roof sheets along the tunnel (z)
          if (az > 0.7) { u = p[1]; v = p[0]; } else { u = p[0] + p[1]; v = p[2]; }
        } else if (ax >= ay && ax >= az) { u = p[2]; v = p[1]; } else if (ay >= az) { u = p[0]; v = p[2]; } else { u = p[0]; v = p[1]; }
        uv[i * 2] = u;
        uv[i * 2 + 1] = v;
      }
    }
    return { uv, color: null };
  }
  // lumber: connected pieces via welded corner positions (union-find)
  const key = new Map(), canon = new Int32Array(corners);
  for (let i = 0; i < corners; i++) {
    const k = Math.round(pos[i * 3] * 1e4) + "," + Math.round(pos[i * 3 + 1] * 1e4) + "," + Math.round(pos[i * 3 + 2] * 1e4);
    let id = key.get(k);
    if (id === undefined) key.set(k, (id = key.size));
    canon[i] = id;
  }
  const parent = Int32Array.from({ length: key.size }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  for (let t = 0; t < tris; t++) {
    const a = find(canon[t * 3]), b = find(canon[t * 3 + 1]), c = find(canon[t * 3 + 2]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const islands = new Map(); // root → { verts: Set, tris: [] }
  for (let t = 0; t < tris; t++) {
    const r = find(canon[t * 3]);
    let isl = islands.get(r);
    if (!isl) islands.set(r, (isl = { verts: new Map(), tris: [] }));
    isl.tris.push(t);
    for (let k = 0; k < 3; k++) isl.verts.set(canon[t * 3 + k], t * 3 + k);
  }
  const color = new Float32Array(corners * 3);
  const rand = rng(seed);
  for (const isl of islands.values()) {
    const pts = [...isl.verts.values()].map(P);
    const c = [0, 0, 0];
    for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
    const m = [0, 0, 0, 0, 0, 0];
    for (const p of pts) {
      const d = sub(p, c);
      m[0] += d[0] * d[0]; m[1] += d[0] * d[1]; m[2] += d[0] * d[2]; m[3] += d[1] * d[1]; m[4] += d[1] * d[2]; m[5] += d[2] * d[2];
    }
    const [e0, e1] = eigenSym3(m);
    const g = norm(e0.vec), g2 = norm(e1.vec);
    const ou = rand() * 20, ov = (rand() - 0.5) * 0.06, shade = 0.9 + rand() * 0.1;
    for (const t of isl.tris) {
      const n = faceNormal(t), end = Math.abs(dot(n, g)) > 0.7, a = end ? g2 : g;
      const ua = norm(sub(a, n.map((x) => x * dot(a, n)))), va = cross(n, ua);
      const f = (end ? 0.8 : 1) * shade;
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k, d = sub(P(i), c);
        uv[i * 2] = dot(d, ua) + ou;
        uv[i * 2 + 1] = dot(d, va) + ov;
        color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = f;
      }
    }
  }
  return { uv, color };
}

/** Texture transform for each look's tiles: metres → texture space. */
export const TILES = {
  baked: { wood: [1.2, 0.3], steel: [0.3, 0.3], poly: [0.3, 0.3] },
  photo: { wood: [1.89, 0.129], steel: [0.3, 0.3], poly: [0.3, 0.3] },
};
