// The two characters that live around the greenhouse, shared by the AR pages.
//   Gus, the gardener, works inside: walks between spots, tends the walls and doors, turns to you and waves.
//   Bolt, the robot, follows you around outside, routing around the greenhouse and (at life size) around real
//   obstacles the phone's depth sensing has seen; when you step inside he waits in the porch.
// Everything here is in the greenhouse's own frame: metres, y up, the porch at -z, standing on y = 0.
import * as THREE from "three";

// footprint: side walls x = ±1.9, back wall at z = 2.46, front wall (door shut) at z = -1.24, open porch to z = -2.48
export const HOUSE = { x: 1.9, back: 2.46, front: -1.24, end: -2.48, padX: 2.35, padZ: 2.95 };
const WALLS = [
  [-HOUSE.x, HOUSE.end, -HOUSE.x, HOUSE.back], [HOUSE.x, HOUSE.end, HOUSE.x, HOUSE.back],
  [-HOUSE.x, HOUSE.back, HOUSE.x, HOUSE.back], [-HOUSE.x, HOUSE.front, HOUSE.x, HOUSE.front],
];
export const inside = (x, z) => Math.abs(x) < HOUSE.x && z > HOUSE.front && z < HOUSE.back;

// ---------- navigation grid: greenhouse walls + real obstacles, A* with line-of-sight smoothing ----------
export class NavGrid {
  constructor(half = 20, cell = 0.2, radius = 0.3) {
    Object.assign(this, { half, cell, n: Math.round((2 * half) / cell) });
    const N = this.n * this.n;
    this.wall = new Uint8Array(N); // greenhouse walls, grown by the walker's radius
    this.seen = new Float32Array(N); // real obstacles, 0..1 confidence from depth
    this.inner = new Uint8Array(N); // the shut-in part of the greenhouse
    this.block = new Uint8Array(N); // what the last mask() call allows
    this.g = new Float32Array(N);
    this.f = new Float32Array(N);
    this.from = new Int32Array(N);
    this.state = new Uint8Array(N); // 0 unseen, 1 open, 2 closed
    this.heap = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const x = this.cx(i), z = this.cz(i);
      for (const [ax, az, bx, bz] of WALLS) if (segDist(x, z, ax, az, bx, bz) < radius) { this.wall[i] = 1; break; }
      this.inner[i] = inside(x, z) ? 1 : 0;
    }
  }
  idx(x, z) {
    const i = Math.floor((x + this.half) / this.cell), j = Math.floor((z + this.half) / this.cell);
    return i < 0 || j < 0 || i >= this.n || j >= this.n ? -1 : j * this.n + i;
  }
  cx(i) { return -this.half + ((i % this.n) + 0.5) * this.cell; }
  cz(i) { return -this.half + (Math.floor(i / this.n) + 0.5) * this.cell; }

  // walls, plus the inside when `outside`, plus real obstacles grown by one cell when `seen`, plus everything
  // outside `limit` ({x, z} half-sizes)
  mask({ outside = false, seen = false, limit = null } = {}) {
    const { n, block, wall } = this;
    block.set(wall);
    if (outside) for (let i = 0; i < n * n; i++) block[i] |= this.inner[i];
    if (seen) for (let i = 0; i < n * n; i++) {
      if (this.seen[i] < 0.5) continue;
      const r = Math.floor(i / n), c = i % n;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n) block[rr * n + cc] = 1;
      }
    }
    if (limit) for (let i = 0; i < n * n; i++) if (Math.abs(this.cx(i)) > limit.x || Math.abs(this.cz(i)) > limit.z) block[i] = 1;
    return block;
  }

  // real-world evidence: obstacle points raise a cell, floor points lower it, and everything fades with time
  observe(x, z, solid) {
    const i = this.idx(x, z);
    if (i >= 0) this.seen[i] = solid ? Math.min(1, this.seen[i] + 0.34) : Math.max(0, this.seen[i] - 0.12);
  }
  fade(dt) {
    const k = Math.exp(-dt / 25);
    for (let i = 0; i < this.seen.length; i++) if (this.seen[i]) this.seen[i] = this.seen[i] < 0.02 ? 0 : this.seen[i] * k;
  }

  clear(ax, az, bx, bz, block) {
    const d = Math.hypot(bx - ax, bz - az), steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, i = this.idx(ax + (bx - ax) * t, az + (bz - az) * t);
      if (i < 0 || block[i]) return false;
    }
    return true;
  }

  nearestFree(i, block, R = 30) {
    if (i >= 0 && !block[i]) return i;
    const n = this.n, r0 = Math.floor(i / n), c0 = i % n;
    for (let r = 1; r <= R; r++) {
      let best = -1, bd = Infinity;
      for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
        const rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n || block[rr * n + cc]) continue;
        const d = dr * dr + dc * dc;
        if (d < bd) { bd = d; best = rr * n + cc; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // waypoints from (sx, sz) towards (tx, tz), or null. The goal moves to the nearest free cell when it is blocked.
  plan(sx, sz, tx, tz, block) {
    const s = this.idx(sx, sz);
    let t = this.idx(tx, tz);
    if (s < 0 || t < 0) return null;
    if (block[t]) { t = this.nearestFree(t, block); if (t < 0) return null; tx = this.cx(t); tz = this.cz(t); }
    if (this.clear(sx, sz, tx, tz, block)) return [[tx, tz]];
    const { n, g, f, from, state, heap } = this;
    state.fill(0);
    let size = 0;
    const push = (i) => { let k = size++; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[i]) break; heap[k] = heap[p]; k = p; } heap[k] = i; };
    const pop = () => {
      const top = heap[0], last = heap[--size];
      let k = 0;
      for (;;) { let c = 2 * k + 1; if (c >= size) break; if (c + 1 < size && f[heap[c + 1]] < f[heap[c]]) c++; if (f[heap[c]] >= f[last]) break; heap[k] = heap[c]; k = c; }
      heap[k] = last;
      return top;
    };
    const tr = Math.floor(t / n), tc = t % n;
    const h = (i) => { const dr = Math.abs(Math.floor(i / n) - tr), dc = Math.abs((i % n) - tc); return Math.max(dr, dc) + 0.414 * Math.min(dr, dc); };
    g[s] = 0; f[s] = h(s); from[s] = -1; state[s] = 1; push(s);
    let found = false, budget = 30000;
    while (size && budget--) {
      const i = pop();
      if (state[i] === 2) continue;
      state[i] = 2;
      if (i === t) { found = true; break; }
      const r = Math.floor(i / n), c = i % n;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const j = rr * n + cc;
        if (block[j] || state[j] === 2) continue;
        if (dr && dc && (block[r * n + cc] || block[rr * n + c])) continue; // no cutting corners
        const ng = g[i] + (dr && dc ? 1.414 : 1);
        if (state[j] === 1 && ng >= g[j]) continue;
        g[j] = ng; f[j] = ng + h(j); from[j] = i; state[j] = 1; push(j);
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = t; i !== s && i >= 0; i = from[i]) cells.push([this.cx(i), this.cz(i)]);
    cells.reverse();
    cells[cells.length - 1] = [tx, tz];
    // keep only the corners: from each point, jump to the farthest one still in sight
    const out = [];
    let ax = sx, az = sz, k = 0;
    while (k < cells.length) {
      let j = k;
      for (let m = Math.min(cells.length - 1, k + 40); m > k; m--) if (this.clear(ax, az, cells[m][0], cells[m][1], block)) { j = m; break; }
      out.push(cells[j]);
      [ax, az] = cells[j];
      k = j + 1;
    }
    return out;
  }
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

// ---------- a character: model, animation mixer, a soft blob shadow, movement, speech ----------
let blobTex = null;
function blob(r) {
  if (!blobTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"), grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.6 }));
  m.position.y = 0.006;
  m.renderOrder = 1;
  return m;
}

const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

class Character {
  constructor(gltf, o) {
    Object.assign(this, o);
    this.root = new THREE.Group();
    this.root.name = o.name;
    this.body = gltf.scene;
    this.body.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; } });
    this.root.add(this.body, blob(o.radius * 1.6));
    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = Object.fromEntries(gltf.animations.map((c) => [c.name, this.mixer.clipAction(c)]));
    this.mixer.addEventListener("finished", (e) => { if (e.action === this.oneShot) { this.oneShot = null; this.loop(this.base, 0.3); } });
    this.pos = this.root.position;
    this.yaw = 0;
    this.path = null;
    this.speech = "";
    this.speechUntil = 0;
    this.lineIndex = {};
    this.current = null;
    this.loop("Idle", 0);
  }
  fadeTo(a, fade) {
    if (this.current && this.current !== a) this.current.fadeOut(fade);
    a.reset().fadeIn(fade).play();
    this.current = a;
  }
  loop(name, fade = 0.25) { // a looping clip that becomes the resting state
    const a = this.actions[name];
    this.base = name;
    if (!a || this.oneShot) return;
    if (this.current === a) return;
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = 1;
    this.fadeTo(a, fade);
  }
  emote(name) { // play once, then fall back to the resting loop
    const a = this.actions[name];
    if (!a) return;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = 1;
    this.oneShot = a;
    this.fadeTo(a, 0.2);
  }
  // follow the waypoints; true while still walking
  step(dt, speed) {
    if (!this.path || !this.path.length) return false;
    const [wx, wz] = this.path[0], dx = wx - this.pos.x, dz = wz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.06) { this.path.shift(); return this.path.length > 0; }
    const turn = angleTo(this.yaw, Math.atan2(dx, dz));
    this.yaw += turn * Math.min(1, dt * 8);
    const s = Math.min(d, speed * dt * Math.max(0.25, Math.cos(turn))); // slow down in sharp turns
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
    return true;
  }
  gait(name, speed) { // walk or run with the feet matching the ground speed
    this.loop(name);
    const a = this.actions[name];
    if (a && !this.oneShot) a.timeScale = speed / this.clipSpeed[name];
  }
  face(x, z, dt, rate = 5) { this.yaw += angleTo(this.yaw, Math.atan2(x - this.pos.x, z - this.pos.z)) * Math.min(1, dt * rate); }
  say(text, now, secs = 5) { this.speech = text; this.speechUntil = now + secs; }
  line(topic) { // the next line of a topic, in order, wrapping round
    const list = this.lines[topic], i = (this.lineIndex[topic] = ((this.lineIndex[topic] ?? -1) + 1) % list.length);
    return list[i];
  }
  update(dt) {
    this.mixer.update(dt);
    this.root.rotation.y = this.yaw;
  }
}

// ---------- Gus ----------
const SPOTS = [ // where Gus works: position, which way he faces, what he does, what he talks about there
  { x: -1.3, z: 1.6, yaw: -Math.PI / 2, act: "Interact", topic: "frame" },
  { x: 1.3, z: 1.6, yaw: Math.PI / 2, act: "Interact", topic: "frame" },
  { x: 0, z: 2.0, yaw: 0, act: "Look", topic: "door" },
  { x: 1.3, z: 0.0, yaw: Math.PI / 2, act: "Interact", topic: "frame" },
  { x: 0, z: -0.75, yaw: Math.PI, act: "Look", topic: "porch" },
  { x: -1.3, z: -0.1, yaw: -Math.PI / 2, act: "Interact", topic: "frame" },
];
const GUS_LINES = {
  hello: ["Hi, I'm Gus. Not one bent board in here: every curve is short straight pieces."],
  frame: [
    "Each arch is two chains of straight pieces, offset by half a piece. Every crossing gets a half-lap and a bolt.",
    "All those crossings make little triangles. That's what stiffens the arch, like a curved truss.",
    "Five arches, about 1.2 m apart, tied together by the purlins.",
    "Each foot sits between two treated foot boards, held with three bolts.",
    "The twinwall polycarbonate bends right over the purlins.",
    "Tomatoes love it in here. I tie them straight to the frame.",
  ],
  door: ["Sliding doors on a barn-door track, with a vent above each one.", "3.74 m across and 2.6 m of headroom. Plenty of room for me."],
  porch: ["Out front there's a covered porch bay.", "It all started from five photos of a greenhouse in England."],
};

export class Gardener extends Character {
  constructor(gltf) {
    super(gltf, { name: "Gus", radius: 0.3, height: 1.86, walk: 1.0, clipSpeed: { Walk: 1.3, Run: 3.0 }, lines: GUS_LINES });
    this.spot = SPOTS[4];
    this.pos.set(this.spot.x, 0, this.spot.z);
    this.yaw = this.spot.yaw;
    this.mode = "work";
    this.timer = 2;
    this.lastWave = -99;
    this.attending = false;
    this.greeted = false;
  }
  // ctx: { dt, now, grid, user: {x, z} | null, near: bool (you are close to him) }
  think(ctx) {
    const { dt, now, user } = ctx;
    const attention = user && (now < this.talkUntil || ctx.near);
    if (attention) {
      if (!this.attending) {
        this.attending = true;
        this.path = null;
        this.loop("Idle");
        if (now - this.lastWave > 25) { this.emote("Wave"); this.lastWave = now; }
      }
      this.face(user.x, user.z, dt);
    } else if (this.attending) {
      this.attending = false;
      this.mode = "work";
      this.timer = 1.2; // a moment before going back to work
      this.loop("Idle");
    } else if (this.mode === "walk") {
      if (this.step(dt, this.walk)) this.gait("Walk", this.walk);
      else { this.mode = "work"; this.timer = 4 + Math.random() * 4; this.loop(this.spot.act); }
    } else {
      this.yaw += angleTo(this.yaw, this.spot.yaw) * Math.min(1, dt * 4);
      if ((this.timer -= dt) <= 0) {
        const choices = SPOTS.filter((s) => s !== this.spot);
        this.spot = choices[Math.floor(Math.random() * choices.length)];
        this.path = ctx.grid.plan(this.pos.x, this.pos.z, this.spot.x, this.spot.z, ctx.grid.wall);
        this.mode = this.path ? "walk" : "work";
        this.timer = 3;
      }
    }
    this.update(dt);
  }
  tap(now) {
    this.talkUntil = now + 6;
    const topic = this.greeted ? (this.mode === "work" ? this.spot.topic : "frame") : "hello";
    this.greeted = true;
    this.say(this.line(topic), now, 6);
  }
}

// ---------- Bolt ----------
const BOLT_LINES = {
  hello: ["Beep! I'm Bolt. Walk around, I'll keep up."],
  depth: ["Your phone's depth sensing shows me real things. I'll walk around them.", "I counted the arches. Five. All present."],
  blind: ["This phone can't show me real obstacles, so I only dodge the greenhouse.", "I counted the arches. Five. All present."],
  small: ["Lean in, I'm down here!", "This table is enormous. Or I'm very small.", "I counted the arches. Five. All present."],
  wait: ["The doors are shut. I'll wait out here."],
};
const EMOTES = ["Wave", "ThumbsUp", "Yes", "Dance", "Jump"];

export class Robot extends Character {
  constructor(gltf) {
    super(gltf, { name: "Bolt", radius: 0.22, height: 0.6, walk: 0.6, run: 1.5, clipSpeed: { Walk: 0.5, Run: 0.85 }, lines: BOLT_LINES });
    this.pos.set(1.2, 0, HOUSE.end - 0.3);
    this.yaw = Math.PI;
    this.goal = null;
    this.replan = 0;
    this.idleFor = 0;
    this.waiting = false;
    this.greeted = false;
  }
  // ctx: { dt, now, grid, user, life (life size: may leave the pad and use real obstacles), depth }
  think(ctx) {
    const { dt, now, user, grid } = ctx;
    if (user) {
      const limit = ctx.life ? null : { x: HOUSE.padX - 0.04, z: HOUSE.padZ - 0.04 };
      const userIn = ctx.life && inside(user.x, user.z);
      let gx, gz;
      if (userIn) { gx = 0; gz = HOUSE.front - 0.45; } // at the front door, in the porch
      else {
        const dx = this.pos.x - user.x, dz = this.pos.z - user.z, d = Math.hypot(dx, dz) || 1;
        const keep = ctx.life ? 1.2 : 0; // at life size, stay a step away; on the table, come as close as the pad allows
        gx = user.x + (dx / d) * keep;
        gz = user.z + (dz / d) * keep;
      }
      if (limit) { gx = THREE.MathUtils.clamp(gx, -limit.x, limit.x); gz = THREE.MathUtils.clamp(gz, -limit.z, limit.z); }
      if (userIn !== this.waiting) { this.waiting = userIn; if (userIn) this.say(this.line("wait"), now, 4); }
      const far = Math.hypot(gx - this.pos.x, gz - this.pos.z);
      const moving = this.path && this.path.length;
      if ((this.replan -= dt) <= 0 && (moving ? far > 0.25 : far > (ctx.life ? 0.7 : 0.35))) {
        this.replan = 0.5;
        this.path = grid.plan(this.pos.x, this.pos.z, gx, gz, grid.mask({ outside: true, seen: ctx.life && ctx.depth, limit }));
      }
      const dist = Math.hypot(user.x - this.pos.x, user.z - this.pos.z);
      const speed = ctx.life && dist > 4 ? this.run : this.walk;
      if (this.step(dt, speed)) { this.gait(speed > this.walk ? "Run" : "Walk", speed); this.idleFor = 0; }
      else {
        this.path = null;
        this.loop("Idle");
        this.face(user.x, user.z, dt);
        if ((this.idleFor += dt) > 9 + Math.random() * 6 && !this.oneShot) { this.idleFor = 0; this.emote(EMOTES[Math.floor(Math.random() * EMOTES.length)]); }
      }
    }
    this.update(dt);
  }
  tap(now, ctx) {
    this.emote(EMOTES[Math.floor(Math.random() * EMOTES.length)]);
    this.idleFor = 0;
    const topic = !this.greeted ? "hello" : this.waiting ? "wait" : !ctx.life ? "small" : ctx.depth ? "depth" : "blind";
    this.greeted = true;
    this.say(this.line(topic), now, 5);
  }
}

// ---------- real-world occlusion from a CPU depth map ----------
// Fragments of patched materials are dropped where the phone measured a real surface in front of them.
export const occlusion = {
  uniforms: {
    uRealDepth: { value: null },
    uDepthUV: { value: new THREE.Matrix4() },
    uScreen: { value: new THREE.Vector2(1, 1) },
    uOcclude: { value: 0 },
  },
  texture: null,
  patch(material) {
    if (material.userData.occl || !(material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial)) return;
    material.userData.occl = true;
    const u = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform sampler2D uRealDepth;\nuniform mat4 uDepthUV;\nuniform vec2 uScreen;\nuniform float uOcclude;\nvoid main() {")
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
  if (uOcclude > 0.5) {
    vec2 nv = vec2(gl_FragCoord.x / uScreen.x, 1.0 - gl_FragCoord.y / uScreen.y);
    vec2 duv = (uDepthUV * vec4(nv, 0.0, 1.0)).xy;
    float real = texture2D(uRealDepth, duv).r;
    if (real > 0.05 && real < vViewPosition.z - 0.05) discard;
  }`);
    };
    material.customProgramCacheKey = () => "occl";
    material.needsUpdate = true;
  },
  // copy this frame's depth (CPU) into a float texture, in metres
  upload(info) {
    const w = info.width, h = info.height;
    if (!this.texture || this.texture.image.width !== w || this.texture.image.height !== h) {
      this.texture?.dispose();
      this.texture = new THREE.DataTexture(new Float32Array(w * h), w, h, THREE.RedFormat, THREE.FloatType);
      this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
      this.uniforms.uRealDepth.value = this.texture;
    }
    const out = this.texture.image.data, k = info.rawValueToMeters;
    const src = info.data instanceof ArrayBuffer && info.data.byteLength === w * h * 4 ? new Float32Array(info.data) : new Uint16Array(info.data);
    for (let i = 0; i < out.length; i++) out[i] = src[i] * k;
    this.texture.needsUpdate = true;
    this.uniforms.uDepthUV.value.fromArray(info.normDepthBufferFromNormView.matrix);
  },
};
