// Headset (Meta Quest and other standalone WebXR browsers) building blocks for the AR/VR page. There is no DOM overlay
// on a headset, so everything you read or press is drawn into the scene:
//   Pointers   controllers or tracked hands: rays, cursors, per-controller hit-test, buttons and thumbsticks
//   Panel      a menu drawn on a canvas, pressed with a ray (trigger or pinch)
//   TextCard   a text label in the scene (speech bubbles, the hint line), always facing you
//   Rig        moving yourself in VR: smooth walking, snap turns and teleports, via an offset reference space
import * as THREE from "three";

export const HEADSET = /OculusBrowser|Quest|Pico|Wolvic/i.test(navigator.userAgent);
const INK = "#1f2a22", LEAF = "#4d7a3a", CARD = "#fffdf8";

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}
function wrap(x, text, maxW) { // → lines (word wrap with the current font)
  const words = String(text).split(/\s+/), lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function canvasMesh(w, h, order = 1000) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return { canvas, ctx: canvas.getContext("2d"), tex, mesh };
}

// ---------- a menu on a canvas ----------
// rows: [{ show?: () => bool, h?: px, items: [{ text | () => text, icon?, on?: () => bool, off?: () => bool (disabled),
//          act?: () => void, kind?: "btn" | "title" | "note" | "bar", value?: () => 0..1, flex? }] }]
export class Panel {
  constructor(rows, { width = 0.36, px = 2000 } = {}) {
    Object.assign(this, { rows, px, wPx: Math.round(width * px) });
    const c = canvasMesh(this.wPx, 64);
    Object.assign(this, c);
    this.mesh.name = "menu";
    this.rects = [];
    this.hover = null;
    this.sig = "";
  }
  layout() { // positions of the visible items, in canvas pixels
    const pad = 22, gap = 12, out = [];
    let y = pad;
    for (const row of this.rows) {
      if (row.show && !row.show()) continue;
      const items = row.items.filter((it) => !it.show || it.show());
      const h = row.h || (items.some((it) => it.kind === "title" || it.kind === "note") ? 50 : 70);
      const flex = items.reduce((s, it) => s + (it.flex || 1), 0), free = this.wPx - 2 * pad - gap * (items.length - 1);
      let x = pad;
      for (const it of items) {
        const w = (free * (it.flex || 1)) / flex;
        out.push({ it, x, y, w, h });
        x += w + gap;
      }
      y += h + gap;
    }
    return { rects: out, height: Math.ceil(y - gap + pad) };
  }
  text(it) { return typeof it.text === "function" ? it.text() : it.text || ""; }
  refresh() { // redraw when anything shown has changed
    const { rects, height } = this.layout();
    const sig = height + "|" + rects.map((r) => `${this.text(r.it)}:${r.it.on?.() ? 1 : 0}${r.it.off?.() ? 1 : 0}${r.it === this.hover ? 1 : 0}${r.it.value ? r.it.value().toFixed(2) : ""}`).join("|");
    if (sig === this.sig) return;
    this.sig = sig;
    this.rects = rects;
    if (this.canvas.height !== height) {
      this.canvas.height = height;
      this.tex.dispose();
    }
    this.mesh.scale.set(this.wPx / this.px, height / this.px, 1);
    const x = this.ctx;
    x.clearRect(0, 0, this.wPx, height);
    x.fillStyle = "rgba(18, 24, 20, 0.9)";
    roundRect(x, 0, 0, this.wPx, height, 36);
    x.fill();
    x.textBaseline = "middle";
    x.textAlign = "center";
    for (const r of rects) {
      const it = r.it, label = this.text(it), off = it.off?.(), on = it.on?.();
      x.globalAlpha = off ? 0.35 : 1;
      if (it.kind === "title" || it.kind === "note") {
        x.fillStyle = it.kind === "title" ? "#fff" : "#cfd8cf";
        x.font = it.kind === "title" ? "700 34px system-ui, sans-serif" : "26px system-ui, sans-serif";
        x.textAlign = it.align || "center";
        x.fillText(label, it.align === "left" ? r.x : it.align === "right" ? r.x + r.w : r.x + r.w / 2, r.y + r.h / 2, r.w);
        x.textAlign = "center";
      } else if (it.kind === "bar") {
        x.fillStyle = "rgba(255,255,255,0.18)";
        roundRect(x, r.x, r.y + r.h / 2 - 7, r.w, 14, 7);
        x.fill();
        x.fillStyle = "#6a9d52";
        roundRect(x, r.x, r.y + r.h / 2 - 7, Math.max(14, r.w * (it.value?.() || 0)), 14, 7);
        x.fill();
      } else {
        x.fillStyle = on ? "#fff" : it.accent ? LEAF : "rgba(255,255,255,0.13)";
        roundRect(x, r.x, r.y, r.w, r.h, r.h / 2);
        x.fill();
        if (it === this.hover && !off) { x.strokeStyle = on ? LEAF : "#fff"; x.lineWidth = 4; x.stroke(); }
        x.fillStyle = on ? INK : "#fff";
        if (it.icon) icon(x, label, r.x + r.w / 2, r.y + r.h / 2, r.h * 0.26); // icon items name their icon in `text`
        else {
          x.font = "600 29px system-ui, sans-serif";
          x.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 16);
        }
      }
    }
    x.globalAlpha = 1;
    this.tex.needsUpdate = true;
  }
  itemAt(uv) { // the pressable item at a texture coordinate of the panel, or null
    const px = uv.x * this.wPx, py = (1 - uv.y) * this.canvas.height;
    for (const r of this.rects) if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h && r.it.act) return r.it;
    return null;
  }
}
function icon(x, name, cx, cy, s) {
  x.beginPath();
  if (name === "play") { x.moveTo(cx - s * 0.7, cy - s); x.lineTo(cx + s, cy); x.lineTo(cx - s * 0.7, cy + s); }
  else if (name === "pause") { x.rect(cx - s * 0.8, cy - s, s * 0.55, 2 * s); x.rect(cx + s * 0.25, cy - s, s * 0.55, 2 * s); }
  else if (name === "prev" || name === "next") {
    const d = name === "next" ? 1 : -1;
    x.moveTo(cx - d * s, cy - s); x.lineTo(cx + d * s * 0.5, cy); x.lineTo(cx - d * s, cy + s);
    x.rect(d > 0 ? cx + s * 0.55 : cx - s * 0.85, cy - s, s * 0.3, 2 * s);
  }
  x.fill();
}

// ---------- a text card that faces you: speech bubbles and the hint line ----------
export class TextCard {
  constructor({ w = 640, h = 220, bubble = false } = {}) {
    Object.assign(this, canvasMesh(w, h, bubble ? 1001 : 1002));
    this.bubble = bubble;
    this.key = "";
    this.mesh.visible = false;
    this.aspect = h / w;
  }
  // name (bubble title), text, shown (characters revealed so far; the rest keeps the layout steady)
  set(name, text, shown = text.length) {
    const key = name + "|" + text + "|" + shown;
    if (key === this.key) return;
    this.key = key;
    const x = this.ctx, W = this.canvas.width, H = this.canvas.height, pad = 26;
    x.clearRect(0, 0, W, H);
    x.font = this.bubble ? "30px system-ui, sans-serif" : "600 30px system-ui, sans-serif";
    const lines = wrap(x, text, W - 2 * pad).slice(0, this.bubble ? 4 : 3);
    const top = name ? 46 : 0, lh = 38, boxH = Math.min(H - (this.bubble ? 24 : 0), top + pad * 1.4 + lines.length * lh);
    x.fillStyle = this.bubble ? CARD : "rgba(18, 24, 20, 0.86)";
    roundRect(x, 0, this.bubble ? H - 24 - boxH : 0, W, boxH, 28);
    x.fill();
    const y0 = this.bubble ? H - 24 - boxH : 0;
    if (this.bubble) { x.beginPath(); x.moveTo(W / 2 - 18, H - 25); x.lineTo(W / 2, H - 2); x.lineTo(W / 2 + 18, H - 25); x.fill(); }
    if (name) {
      x.fillStyle = LEAF;
      x.font = "700 24px system-ui, sans-serif";
      x.textAlign = "left";
      x.textBaseline = "top";
      x.fillText(name.toUpperCase(), pad, y0 + 20);
    }
    x.fillStyle = this.bubble ? INK : "#fff";
    x.font = this.bubble ? "30px system-ui, sans-serif" : "600 30px system-ui, sans-serif";
    x.textAlign = this.bubble ? "left" : "center";
    x.textBaseline = "top";
    let left = shown;
    lines.forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, left));
      left -= ln.length + 1;
      if (part) x.fillText(part, this.bubble ? pad : W / 2, y0 + top + pad * 0.7 + i * lh);
    });
    this.tex.needsUpdate = true;
  }
  // stand at `at` (world), face the camera, `size` = height in radians of view at any distance
  place(at, cam, camPos, size = 0.075) {
    const d = Math.max(0.25, at.distanceTo(camPos)), h = size * d;
    this.mesh.position.copy(at);
    this.mesh.quaternion.copy(cam.getWorldQuaternion(_q));
    this.mesh.scale.set(h / this.aspect, h, 1);
  }
}
const _q = new THREE.Quaternion();

// ---------- controllers and hands ----------
const BUTTONS = { 4: "a", 5: "b" }; // xr-standard: A/X = 4, B/Y = 5 (left hand: X/Y)
export class Pointers {
  constructor(renderer, scene, cb) {
    Object.assign(this, { renderer, scene, cb, session: null, wantHits: false });
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const dot = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.011, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 }));
    dot.renderOrder = 1003;
    this.list = [0, 1].map((i) => {
      const ctrl = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
      const p = { i, ctrl, grip, source: null, hand: false, handed: "", selecting: false, squeezing: false, action: null, hitSource: null, hit: null,
        pressed: {}, axes: [0, 0], ray: new THREE.Ray(), len: 2, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), gripPos: new THREE.Vector3(), gripQuat: new THREE.Quaternion() };
      p.line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false }));
      p.line.renderOrder = 1003;
      p.line.visible = false;
      p.cursor = dot.clone();
      p.cursor.visible = false;
      scene.add(ctrl, grip, p.cursor);
      ctrl.add(p.line);
      ctrl.addEventListener("connected", (e) => {
        const src = e.data;
        if (src.targetRayMode !== "tracked-pointer") return; // a phone's screen taps go to the page's own handlers
        Object.assign(p, { source: src, hand: !!src.hand, handed: src.handedness || "" });
        p.line.visible = true;
        this.requestHits(p);
        cb.connected?.(p);
      });
      ctrl.addEventListener("disconnected", () => {
        p.hitSource?.cancel?.();
        Object.assign(p, { source: null, hitSource: null, hit: null, selecting: false, squeezing: false });
        p.line.visible = p.cursor.visible = false;
        if (p.action) cb.cancel?.(p);
        p.action = null;
      });
      ctrl.addEventListener("selectstart", () => { if (!p.source) return; p.selecting = true; this.active = p; cb.selectstart?.(p); });
      ctrl.addEventListener("selectend", () => { if (!p.source) return; p.selecting = false; cb.selectend?.(p); });
      ctrl.addEventListener("squeezestart", () => { if (!p.source) return; p.squeezing = true; this.active = p; cb.squeezestart?.(p); });
      ctrl.addEventListener("squeezeend", () => { if (!p.source) return; p.squeezing = false; cb.squeezeend?.(p); });
      return p;
    });
    this.active = this.list[1];
  }
  start(session, wantHits) {
    this.session = session;
    this.wantHits = wantHits;
    for (const p of this.list) if (p.source) this.requestHits(p);
  }
  stop() {
    for (const p of this.list) { p.hitSource?.cancel?.(); p.hitSource = null; p.hit = null; p.action = null; p.line.visible = p.cursor.visible = false; }
    this.session = null;
  }
  requestHits(p) {
    if (!this.wantHits || !this.session || p.hitSource || !p.source || !this.session.requestHitTestSource) return;
    this.session.requestHitTestSource({ space: p.source.targetRaySpace }).then((h) => {
      if (p.source && this.session) p.hitSource = h; else h.cancel?.();
    }).catch(() => {});
  }
  get any() { return this.list.some((p) => p.source); }
  get hands() { return this.list.some((p) => p.source && p.hand); }
  byHand(h) { return this.list.find((p) => p.source && p.handed === h) || null; }
  // per frame, before the page reads anything: rays, hit-test results, buttons, sticks
  update(frame, refSpace) {
    for (const p of this.list) {
      if (!p.source) continue;
      p.ctrl.updateMatrixWorld(true);
      p.grip.updateMatrixWorld(true);
      p.ctrl.matrixWorld.decompose(p.pos, p.quat, _s);
      p.grip.matrixWorld.decompose(p.gripPos, p.gripQuat, _s);
      if (!p.grip.visible || p.gripPos.lengthSq() === 0) { p.gripPos.copy(p.pos); p.gripQuat.copy(p.quat); }
      p.ray.origin.copy(p.pos);
      p.ray.direction.set(0, 0, -1).applyQuaternion(p.quat);
      p.hit = null;
      if (p.hitSource && frame) {
        const res = frame.getHitTestResults(p.hitSource);
        if (res.length) { const pose = res[0].getPose(refSpace); if (pose) p.hit = { hit: res[0], pose }; }
      }
      const gp = p.source.gamepad;
      if (gp) {
        const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
        p.axes[0] = Math.abs(ax[0]) > 0.18 ? ax[0] : 0;
        p.axes[1] = Math.abs(ax[1]) > 0.18 ? ax[1] : 0;
        for (const [k, name] of Object.entries(BUTTONS)) {
          const down = !!gp.buttons[k]?.pressed;
          if (down && !p.pressed[name]) this.cb.button?.(p, name);
          p.pressed[name] = down;
        }
      } else p.axes[0] = p.axes[1] = 0;
    }
  }
  // the ray visual: length to whatever it points at (world point), or a default reach
  show(p, point, visible = true) {
    if (!p.source) return;
    p.line.visible = visible;
    const len = point ? Math.max(0.02, point.distanceTo(p.pos)) : p.len;
    p.line.scale.set(1, 1, len);
    p.cursor.visible = visible && !!point;
    if (point) {
      p.cursor.position.copy(point);
      p.cursor.quaternion.copy(p.quat);
      p.cursor.scale.setScalar(Math.max(0.6, len * 0.8));
    }
  }
}
const _s = new THREE.Vector3();

// ---------- moving yourself in VR ----------
// The rig is where your play area is in the world: position (x, z) and a turn. Everything WebXR reports (head,
// controllers) comes through an offset reference space built from it.
export class Rig {
  constructor(renderer) { Object.assign(this, { renderer, base: null, x: 0, z: 0, yaw: 0 }); }
  start(base, x, z, yaw) { Object.assign(this, { base, x, z, yaw }); this.apply(); }
  stop() { this.base = null; }
  apply() {
    if (!this.base) return;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(this.x, 0, this.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw), new THREE.Vector3(1, 1, 1)).invert();
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    m.decompose(p, q, _s);
    this.renderer.xr.setReferenceSpace(this.base.getOffsetReferenceSpace(new XRRigidTransform({ x: p.x, y: p.y, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w })));
  }
  move(dx, dz) { this.x += dx; this.z += dz; this.apply(); }
  turn(a, head) { // about your head, so you don't swing round the play area's centre
    const c = Math.cos(a), s = Math.sin(a), rx = this.x - head.x, rz = this.z - head.z;
    this.x = head.x + rx * c + rz * s;
    this.z = head.z - rx * s + rz * c;
    this.yaw += a;
    this.apply();
  }
}
