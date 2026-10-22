// Synthesized sound for Gus and Bolt, with Web Audio and no sound files: Sims-style gibberish that follows the syllables of
// what they say (Gus: a voice through vowel formants; Bolt: beeps), plus pick-up, throw, landing, bump and footstep
// effects. Every sound comes from the character's position in the room (HRTF panning), heard from the phone.

const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2200, 2900], o: [570, 840, 2410], u: [320, 900, 2240] };
const BEEP = { a: 880, e: 1175, i: 1568, o: 659, u: 523 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.voices = new Map(); // character → its panner
  }
  // browsers only start audio from a tap: call this from any user gesture (a test can hand in an offline context)
  unlock(ctx) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC && !ctx) return;
      this.ctx = ctx || new AC();
      const comp = this.ctx.createDynamicsCompressor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      this.master.connect(comp).connect(this.ctx.destination);
      const n = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === "suspended" && !(window.OfflineAudioContext && this.ctx instanceof OfflineAudioContext)) this.ctx.resume();
  }
  setOn(on) {
    this.on = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  get live() { return !!this.ctx && this.on && this.ctx.state === "running"; }

  // ---------- where things are ----------
  out(c) {
    let p = this.voices.get(c);
    if (!p) {
      p = this.ctx.createPanner();
      p.panningModel = "HRTF";
      p.distanceModel = "inverse";
      p.refDistance = 0.6;
      p.rolloffFactor = 1.2;
      p.connect(this.master);
      this.voices.set(c, p);
    }
    return p;
  }
  place(c, v) { // world position of a character
    if (!this.ctx) return;
    const p = this.out(c);
    if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z);
  }
  listen(m) { // the camera's world matrix
    if (!this.ctx) return;
    const L = this.ctx.listener, e = m.elements;
    const pos = [e[12], e[13], e[14]], fwd = [-e[8], -e[9], -e[10]], up = [e[4], e[5], e[6]];
    if (L.positionX) {
      [L.positionX.value, L.positionY.value, L.positionZ.value] = pos;
      [L.forwardX.value, L.forwardY.value, L.forwardZ.value] = fwd;
      [L.upX.value, L.upY.value, L.upZ.value] = up;
    } else { L.setPosition(...pos); L.setOrientation(...fwd, ...up); }
  }

  // ---------- talking ----------
  // schedules the babble for `text` and returns how long it lasts (also used to type out the bubble)
  speak(c, text, robot) {
    const syl = syllables(text);
    const dur = syl.reduce((t, s) => t + s.len + s.pause, 0);
    if (!this.live) return dur;
    const ctx = this.ctx, dest = this.out(c);
    let t = ctx.currentTime + 0.05;
    const ask = /\?\s*$/.test(text), shout = /!/.test(text);
    syl.forEach((s, k) => {
      const along = k / Math.max(1, syl.length - 1); // intonation: falls through a sentence, rises for a question
      const lift = (ask ? 0.25 * along * along : -0.18 * along) + (shout ? 0.12 : 0) + (Math.random() - 0.5) * 0.12;
      if (robot) this.beep(dest, t, s, lift);
      else this.voice(dest, t, s, lift);
      t += s.len + s.pause;
    });
    return dur;
  }
  voice(dest, t, s, lift) { // a sawtooth glottis through the vowel's formants, with a puff of noise for hard consonants
    const ctx = this.ctx, f0 = 112 * (1 + lift), F = VOWELS[s.v];
    const src = ctx.createOscillator();
    src.type = "sawtooth";
    src.frequency.setValueAtTime(f0 * 1.06, t);
    src.frequency.linearRampToValueAtTime(f0 * 0.94, t + s.len);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(2.2, t + 0.018); // the narrow formant filters keep only a little of the sawtooth
    env.gain.setTargetAtTime(0, t + s.len * 0.7, 0.03);
    env.connect(dest);
    F.forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f * (0.96 + Math.random() * 0.08);
      bp.Q.value = [6, 9, 11][i];
      const g = ctx.createGain();
      g.gain.value = [1, 0.55, 0.25][i];
      src.connect(bp).connect(g).connect(env);
    });
    src.start(t);
    src.stop(t + s.len + 0.15);
    if (s.hard) this.noise(dest, t - 0.02, 0.035, "highpass", 2800, 0.12);
  }
  beep(dest, t, s, lift) { // R2-style: a chirp per syllable, sliding between notes
    const ctx = this.ctx, f = BEEP[s.v] * (1 + lift * 1.5), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = s.hard ? "square" : "triangle";
    o.frequency.setValueAtTime(f * (Math.random() < 0.5 ? 0.8 : 1.25), t);
    o.frequency.exponentialRampToValueAtTime(f, t + s.len * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.01);
    g.gain.setTargetAtTime(0, t + s.len * 0.6, 0.02);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + s.len + 0.1);
  }

  // ---------- effects ----------
  noise(dest, t, len, type, freq, gain, q = 0.8, sweepTo = 0) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noiseBuf;
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + len);
    f.Q.value = q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, len / 3));
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(f).connect(g).connect(dest);
    n.start(t, Math.random() * 0.5);
    n.stop(t + len + 0.05);
  }
  tone(dest, t, type, f0, f1, len, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
  }
  // name: grab | toss | land | step | bump; k: strength (throw speed, impact speed in m/s)
  fx(c, name, k = 1, robot = false) {
    if (!this.live) return;
    const dest = this.out(c), t = this.ctx.currentTime + 0.01;
    if (name === "grab") this.tone(dest, t, "sine", 320, 900, 0.16, 0.4);
    else if (name === "toss") this.noise(dest, t, 0.25 + 0.05 * Math.min(k, 5), "bandpass", 400, Math.min(1.5, 0.3 + 0.25 * k), 1.5, 2400);
    else if (name === "land" || name === "bump") {
      const v = Math.min(1, (name === "bump" ? 0.35 : 0.15) + 0.2 * k);
      if (robot) { // a small metal body: inharmonic ringing partials and a click
        [523, 1411, 2237, 3320].forEach((f, i) => this.tone(dest, t, "sine", f, f * 0.98, 0.25 + 0.3 * v / (i + 1), 0.3 * v / (1 + i * 0.6)));
        this.noise(dest, t, 0.03, "highpass", 3000, 0.6 * v);
      } else { // a body on the floor: a low thump and a scuff
        this.tone(dest, t, "sine", 110, 42, 0.22, 1.1 * v);
        this.noise(dest, t, 0.12, "lowpass", 900, 0.7 * v);
      }
    } else if (name === "step") {
      if (robot) this.tone(dest, t, "square", 1900 + Math.random() * 300, 1500, 0.025, 0.08);
      else this.noise(dest, t, 0.06, "bandpass", 1200 + Math.random() * 600, 0.45, 1.2);
    }
  }
}

// rough syllables: one per vowel group, with the vowel that colours it, whether a hard consonant starts it, and a pause
// after punctuation
function syllables(text) {
  const out = [];
  for (const m of text.toLowerCase().matchAll(/([a-z']+)|([,;:.!?…])/g)) {
    if (m[2]) { if (out.length) out[out.length - 1].pause += /[,;:]/.test(m[2]) ? 0.14 : 0.26; continue; }
    const word = m[1];
    for (const g of word.matchAll(/([^aeiouy]*)([aeiouy]+)/g)) {
      const v = g[2][0] === "y" ? "i" : g[2][0];
      out.push({ v, hard: /[ptkbdgcqxzsf]/.test(g[1]), len: 0.085 + Math.random() * 0.05, pause: 0 });
    }
    if (out.length) out[out.length - 1].pause += 0.03; // a breath between words
  }
  return out.length ? out : [{ v: "a", hard: false, len: 0.1, pause: 0 }];
}
