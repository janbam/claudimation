import * as S from './score.js';

const TAU = Math.PI * 2;
const panL = (p) => Math.cos((p + 1) * Math.PI / 4);
const panR = (p) => Math.sin((p + 1) * Math.PI / 4);

// ───────────────────────── voices. each run(t, bus) adds to bus.l/r/s, returns alive

// control-rate sine bank voice. optional `lock`: a gentle phase-locked loop that pulls the
// oscillator onto an absolute phase grid, so the final waveform is *exactly* the spark.
class Sine {
  constructor(o) {
    this.f = o.f || 0; this.ff = o.ff || null; this.amp = o.amp; this.end = o.end ?? 1e9; this.start = o.start ?? -1;
    this.harm = o.harm || null; this.ph = o.ph ?? 0; this.send = o.send ?? 0.3; this.lock = o.lock || null;
    this.gl = panL(o.pan || 0); this.gr = panR(o.pan || 0); this.inv = 1 / sampleRate;
    this.cnt = 0; this.at = 0; this.a = 0; this.inc = this.f * this.inv;
  }
  run(t, bus) {
    if (t < this.start) return true;
    if (t > this.end) return false;
    if ((this.cnt++ & 15) === 0) { this.at = this.amp(t); if (this.ff) this.inc = this.ff(t) * this.inv; }
    this.a += 0.08 * (this.at - this.a);
    this.ph += this.inc;
    const L = this.lock;
    if (L && t > L.from) { let e = (L.f * t + L.phi) - this.ph; e -= Math.round(e); this.ph += e * 0.00025; }
    if (this.ph >= 1) this.ph -= 1;
    const a = this.a;
    if (a < 1e-5) return true;
    let y;
    if (this.harm) { y = 0; const h = this.harm; for (let i = 0; i < h.length; i++) y += h[i] * Math.sin(TAU * this.ph * (i + 1)); }
    else y = Math.sin(TAU * this.ph);
    y *= a;
    bus.l += y * this.gl; bus.r += y * this.gr; bus.s += y * this.send;
    return true;
  }
}

// modal plucked string: stiff (slightly inharmonic) partials, pluck-position comb,
// frequency-dependent decay, a tension pitch-drop at the attack, and a little wooden body.
class ModalPluck {
  constructor(t0, f, amp, pan, rnd, o = {}) {
    const sr = sampleRate; this.t0 = t0; this.inv = 1 / sr;
    const B = o.B ?? 0.00018, pos = o.pos ?? (0.12 + 0.04 * rnd()), tau0 = o.tau ?? 2.4, cut = o.cut ?? 5200;
    this.bend = o.bend ?? 0.0045;
    const P = []; let norm = 0;
    for (let m = 1; m <= 32; m++) {
      const fm = m * f * Math.sqrt(1 + B * m * m); if (fm > Math.min(15000, sr * 0.45)) break;
      const a = Math.sin(m * Math.PI * pos) / Math.pow(m, 0.8) / Math.sqrt(1 + Math.pow(fm / cut, 2));
      const tau = Math.max(0.04, tau0 / (1 + Math.pow(fm / 1300, 1.3)));
      P.push({ fm, a, r: Math.exp(-1 / (tau * sr)), c: 1, s: 0, cw: 1, sw: 0, side: m % 2 ? 1 : -1 });
      norm += Math.abs(a);
    }
    for (const p of P) p.a *= 2.2 / norm;
    this.P = P; this.amp = amp; this.pan = pan; this.cnt = 0; this.rnd = rnd;
    this.gl1 = panL(clampP(pan - 0.2)); this.gr2 = panR(clampP(pan + 0.2));
    this.life = tau0 * 3.2; this.send = o.send ?? 0.32;
    // body: three wooden modes kicked by the attack
    this.body = [[178, 0.05], [392, 0.03], [845, 0.018]].map(([bf, bt]) => { const R = Math.exp(-1 / (bt * sr)), w = TAU * bf / sr; return { a1: 2 * R * Math.cos(w), a2: -R * R, y1: 0, y2: 0, g: Math.sin(w) }; });
  }
  run(t, bus) {
    const age = t - this.t0; if (age < 0) return true; if (age > this.life) return false;
    if ((this.cnt++ & 31) === 0) { // tension settles: the pitch drops a few cents in the first ~60 ms
      const k = 1 + this.bend * Math.exp(-age / 0.045);
      for (const p of this.P) { const w = TAU * p.fm * k * this.inv; p.cw = Math.cos(w); p.sw = Math.sin(w); }
    }
    let l = 0, r = 0;
    for (const p of this.P) {
      const c = (p.c * p.cw - p.s * p.sw) * p.r, s = (p.c * p.sw + p.s * p.cw) * p.r; p.c = c; p.s = s;
      const y = s * p.a; if (p.side > 0) l += y; else r += y;
    }
    // attack excitation → body + pick noise
    let x = 0; if (age < 0.004) x = (this.rnd() * 2 - 1) * (1 - age / 0.004);
    let b = 0; for (const m of this.body) { const y = m.a1 * m.y1 + m.a2 * m.y2 + x * m.g; m.y2 = m.y1; m.y1 = y; b += y; }
    const pick = x * 0.12;
    const A = this.amp * Math.min(1, age / 0.0015);
    const dl = (l * 0.8 + r * 0.2 + b * 0.35 + pick) * A, dr = (r * 0.8 + l * 0.2 + b * 0.35 + pick) * A;
    bus.l += dl * this.gl1; bus.r += dr * this.gr2;
    bus.s += (dl + dr) * 0.5 * this.send;
    return true;
  }
}
const clampP = (p) => (p < -1 ? -1 : p > 1 ? 1 : p);

class Bell { // 2-op FM
  constructor(t0, f, ratio, index, amp, decay, pan, send = 0.3) {
    this.t0 = t0; this.f = f; this.ratio = ratio; this.index = index; this.amp = amp; this.decay = decay;
    this.pc = 0; this.pm = 0; this.gl = panL(pan); this.gr = panR(pan); this.send = send; this.inv = 1 / sampleRate;
  }
  run(t, bus) {
    const age = t - this.t0; if (age < 0) return true;
    if (age > this.decay * 7) return false;
    this.pc += this.f * this.inv; this.pm += this.f * this.ratio * this.inv;
    if (this.pc > 1) this.pc -= 1; if (this.pm > 1) this.pm -= 1;
    const env = Math.min(1, age / 0.002) * Math.exp(-age / this.decay);
    const I = this.index * Math.exp(-age / (this.decay * 0.3));
    const y = Math.sin(TAU * this.pc + I * Math.sin(TAU * this.pm)) * env * this.amp;
    bus.l += y * this.gl; bus.r += y * this.gr; bus.s += y * this.send;
    return true;
  }
}

class Kick {
  constructor(t0, amp, f1 = 45, rnd, decay = 0.3) { this.t0 = t0; this.amp = amp; this.ph = 0; this.f1 = f1; this.rnd = rnd; this.decay = decay; this.inv = 1 / sampleRate; }
  run(t, bus) {
    const age = t - this.t0; if (age < 0) return true; if (age > this.decay * 6) return false;
    const f = this.f1 + 120 * Math.exp(-age / 0.03);
    this.ph += f * this.inv;
    let y = Math.sin(TAU * this.ph) * Math.exp(-age / this.decay);
    y += (this.rnd() * 2 - 1) * Math.exp(-age / 0.002) * 0.4;
    y = Math.tanh(y * 1.6) * this.amp;
    bus.l += y; bus.r += y; bus.s += y * 0.06;
    return true;
  }
}

class Bass808 { // tuned to the tonic of whatever tuning we're in
  constructor(t0, f, amp, decay) { this.t0 = t0; this.f = f; this.amp = amp; this.decay = decay; this.ph = 0; this.inv = 1 / sampleRate; }
  run(t, bus) {
    const age = t - this.t0; if (age < 0) return true; if (age > this.decay * 5) return false;
    this.ph += this.f * (1 + 1.2 * Math.exp(-age / 0.03)) * this.inv;
    const y = Math.tanh(2.2 * Math.sin(TAU * this.ph) * Math.exp(-age / this.decay)) * this.amp * Math.min(1, age / 0.003);
    bus.l += y; bus.r += y; bus.s += y * 0.05;
    return true;
  }
}

class Noise { // filtered noise via TPT state-variable filter, optional tonal body
  constructor(o) {
    this.t0 = o.t0; this.dur = o.dur; this.fc = o.fc; this.q = o.q ?? 0.8; this.amp = o.amp; this.mode = o.mode || 'bp';
    this.rnd = o.rnd; this.send = o.send ?? 0.3; this.gl = panL(o.pan || 0); this.gr = panR(o.pan || 0);
    this.ic1 = 0; this.ic2 = 0; this.sr = sampleRate; this.cnt = 0; this.g = 0;
    this.tone = o.tone || null; this.tph = 0;
  }
  run(t, bus) {
    const age = t - this.t0; if (age < 0) return true; if (age > this.dur) return false;
    if ((this.cnt++ & 15) === 0) { const fc = Math.min(this.fc(age), this.sr * 0.45); this.g = Math.tan(Math.PI * fc / this.sr); }
    const g = this.g, k = 1 / this.q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const x = this.rnd() * 2 - 1;
    const v3 = x - this.ic2; const v1 = a1 * this.ic1 + a2 * v3; const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    let y = this.mode === 'bp' ? v1 : this.mode === 'hp' ? x - k * v1 - v2 : v2;
    y *= this.amp(age);
    if (this.tone) { this.tph += this.tone.f(age) / this.sr; y += Math.sin(TAU * this.tph) * this.tone.a(age); }
    bus.l += y * this.gl; bus.r += y * this.gr; bus.s += y * this.send;
    return true;
  }
}

class Sweep { // the tear: a sine falling through the floor, bit-crushed
  constructor(t0) { this.t0 = t0; this.ph = 0; this.inv = 1 / sampleRate; this.hold = 0; this.hc = 0; }
  run(t, bus) {
    const age = t - this.t0; if (age < 0) return true; if (age > 0.28) return false;
    const f = 30 + 2600 * Math.exp(-age / 0.045);
    this.ph += f * this.inv;
    const crush = 1 + Math.floor(age * 120);
    if (this.hc++ % crush === 0) this.hold = Math.sign(Math.sin(TAU * this.ph)) * 0.5 + Math.sin(TAU * this.ph * 0.5) * 0.5;
    const y = this.hold * 0.22 * (1 - age / 0.28);
    bus.l += y; bus.r -= y * 0.7; bus.s += y * 0.5;
    return true;
  }
}

// ───────────────────────── reverb: 8-line FDN, Hadamard feedback
class FDN {
  constructor(sr) {
    const base = [1031, 1327, 1523, 1871, 2053, 2311, 2677, 2963];
    this.len = base.map((l) => Math.round(l * sr / 48000));
    this.buf = this.len.map((l) => new Float32Array(l)); this.idx = new Int32Array(8);
    this.lp = new Float32Array(8); this.o = new Float32Array(8); this.fb = 0.86; this.damp = 0.3;
    this.pre = new Float32Array(Math.round(sr * 0.021)); this.pi = 0; this.l = 0; this.r = 0;
  }
  run(x) {
    const pre = this.pre[this.pi]; this.pre[this.pi] = x; this.pi = (this.pi + 1) % this.pre.length;
    const o = this.o;
    for (let i = 0; i < 8; i++) { const v = this.buf[i][this.idx[i]]; this.lp[i] += this.damp * (v - this.lp[i]); o[i] = this.lp[i]; }
    for (let h = 1; h < 8; h <<= 1) for (let i = 0; i < 8; i += h << 1) for (let j = i; j < i + h; j++) { const a = o[j], b = o[j + h]; o[j] = a + b; o[j + h] = a - b; }
    const sc = this.fb / Math.sqrt(8);
    let l = 0, r = 0;
    for (let i = 0; i < 8; i++) {
      const v = this.lp[i];
      if (i & 1) r += v; else l += v;
      this.buf[i][this.idx[i]] = o[i] * sc + pre * (i & 2 ? 0.5 : -0.5);
      if (++this.idx[i] >= this.len[i]) this.idx[i] = 0;
    }
    this.l = l * 0.35; this.r = r * 0.35;
  }
}

// ───────────────────────── the processor
class CommaProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.running = false; this.dead = false; this.startAt = 0; this.offset = 0;
    this.rnd = S.mulberry32(23460);
    this.voices = []; this.events = []; this.ei = 0;
    this.bus = { l: 0, r: 0, s: 0 };
    this.fdn = new FDN(sampleRate);
    this.hpL = 0; this.hpR = 0; this.xl = 0; this.xr = 0;
    const K = S.RHY_K;
    this.rc = new Float64Array(K + 1); this.ry1 = new Float64Array(K + 1); this.ry2 = new Float64Array(K + 1);
    this.rp = new Float64Array(K + 1); this.rl1 = new Float64Array(K + 1); this.rl2 = new Float64Array(K + 1);
    this.rCoef = []; for (let k = 1; k <= K; k++) this.rCoef[k] = { a1: 0, a2: 0, b: 0 };
    this.rcnt = 0; this.rBody = 0; this.rTau = 0.06; this.rGain = 1.0;
    this.rPL = new Float64Array(K + 1); this.rPR = new Float64Array(K + 1);
    for (let k = 1; k <= K; k++) { const p = (k % 2 ? 1 : -1) * Math.min(0.85, k / 10); this.rPL[k] = panL(p); this.rPR[k] = panR(p); }
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') { this.startAt = e.data.at; this.offset = e.data.offset || 0; this.build(this.offset); this.running = true; }
      if (e.data.type === 'stop') { this.dead = true; this.voices = []; this.events = []; }
    };
    const po = options && options.processorOptions;
    if (po && po.autostart) { this.startAt = po.at || 0; this.offset = po.offset || 0; this.build(this.offset); this.running = true; }
  }

  build(t0) {
    const R = this.rnd; const ev = [];
    const at = (t, fn) => ev.push({ t, fn });

    // ── I: the drone, and a glassy ping for every partial as it arrives
    for (let k = 1; k <= S.PARTIALS; k++) {
      const shimmer = 0.6 + 0.9 * R(); const sp = R() * TAU; const pan = ((k * 0.618) % 1) * 1.4 - 0.7;
      this.voices.push(new Sine({ f: S.F0 * k, pan, send: 0.3, end: S.T.III,
        amp: (t) => S.droneAmp(k, t) * (1 + 0.18 * Math.sin(t * shimmer + sp)) }));
      const on = S.partialOnset(k), f = S.F0 * k;
      const far = k === 7 || k === 11 || k === 13;
      at(on, () => new Bell(on, f, 1, far ? 1.6 : 0.9, (far ? 0.2 : 0.14) / Math.pow(k, 0.25), far ? 0.55 : 0.4, pan, 0.5));
      if (k > 3) at(on, () => new Bell(on, f * 2, 1, 0.3, 0.03, 0.25, -pan, 0.5));
    }
    at(0.25, () => new Noise({ t0: 0.25, dur: 4.6, rnd: R, fc: () => 320, q: 3, mode: 'bp', send: 0.5, amp: (a) => 0.05 * S.smooth(a / 1.5) * (1 - S.smooth((a - 2.8) / 1.8)) }));

    // ── II: fifths on a modal string
    const duck = (t) => 1 - S.ramp(t, S.T_COMMA_DUCK, S.T_COMMA_DUCK + 0.35);
    for (const n of S.FIFTHS) {
      const pan = (n.n % 2 ? 0.45 : -0.45) * (0.3 + n.n / 12);
      at(n.t, () => new ModalPluck(n.t, n.freq, n.n === 12 ? 0.95 : 0.7, pan, R, { tau: 2.6 }));
      at(n.t, () => new ModalPluck(n.t + 0.012, n.freq / 2, 0.22, -pan, R, { tau: 1.8, pos: 0.2 }));
      if (n.n < 12) {
        const lyd = n.n <= 6;
        this.voices.push(new Sine({ start: n.t, f: n.freq, pan: (n.n % 3 - 1) * 0.5, send: 0.45, end: 11, harm: [1, 0.25],
          amp: (t) => S.ramp(t, n.t + 0.08, n.t + 0.6) * (lyd ? 0.04 : 0.028) * duck(t) }));
      }
    }
    // Lydian bloom — seven fifths from the tonic. maximum gravity.
    for (let i = 0; i <= 6; i++) {
      const f = S.FIFTHS[i].freq / 2;
      this.voices.push(new Sine({ start: S.LYDIAN_T - 0.01, f, pan: (i / 6) * 1.2 - 0.6, send: 0.6, end: 11, harm: [1, 0.5, 0.2, 0.1],
        amp: (t) => 0.05 * S.ramp(t, S.LYDIAN_T, S.LYDIAN_T + 0.35) * (1 - S.ramp(t, S.LYDIAN_T + 0.4, S.LYDIAN_T + 2.4)) }));
    }
    // the comma scene: B♯! … C. … B♯? … both. then they just sit there and wobble.
    const bs = S.FIFTHS[12].freq;
    for (const c of S.COMMA_CALLS) {
      if (c.t === S.COMMA_T) continue; // the 13th fifth itself is the first call
      if (c.who !== 'C') at(c.t, () => new ModalPluck(c.t, bs, 0.9, 0.5, R, { tau: 3 }));
      if (c.who !== 'B♯') at(c.t, () => new ModalPluck(c.t + (c.who === 'both' ? 0.006 : 0), S.HOME, 0.9, -0.5, R, { tau: 3 }));
    }
    const W0 = S.WOBBLE_T, W1 = S.TEAR_T;
    const wob = (lvl) => (t) => lvl * S.ramp(t, W0 - 0.05, W0 + 0.3) * (0.7 + 0.3 * S.ramp(t, W0, W1)) * (1 - S.ramp(t, W1 - 0.02, W1 + 0.02));
    this.voices.push(new Sine({ start: W0 - 0.1, f: bs, pan: 0.4, send: 0.3, end: 12.7, harm: [1, 0.55, 0.35, 0.2, 0.12], amp: wob(0.15) }));
    this.voices.push(new Sine({ start: W0 - 0.1, f: S.HOME, pan: -0.4, send: 0.3, end: 12.7, harm: [1, 0.55, 0.35, 0.2, 0.12], amp: wob(0.15) }));
    this.voices.push(new Sine({ start: W0 - 0.1, f: S.HOME / 4, pan: 0, send: 0.15, end: 12.7, harm: [1, 0.3], amp: wob(0.16) }));
    // the tear
    at(S.TEAR_T, () => new Sweep(S.TEAR_T));
    at(S.TEAR_T, () => new Noise({ t0: S.TEAR_T, dur: 0.25, rnd: R, fc: (a) => 9000 * Math.exp(-a / 0.05) + 200, q: 1.5, mode: 'bp', send: 0.6, amp: (a) => 0.5 * Math.exp(-a / 0.06) }));

    // ── III: the bar has as many steps as the octave has notes
    for (let j = 0; j < 4; j++) {
      this.voices.push(new Sine({ start: S.T.III - 0.01, ff: (t) => S.padChord(S.tuningAt(t))[j], pan: j / 3 * 1.2 - 0.6, send: 0.5, end: S.T.IV + 0.3, harm: [1, 0.3, 0.1],
        amp: (t) => 0.04 * S.ramp(t, S.T.III, S.T.III + 0.3) * (1 - S.ramp(t, S.T.IV - 0.25, S.T.IV - 0.05)) }));
    }
    for (const nt of S.III_NOTES) {
      const seg = S.III_SEGS[nt.seg];
      const ratio = seg.P === 3 ? 2 : seg.cont ? Math.PI : [1, 1, 2, 1][nt.seg] ?? 1;
      const idx = seg.P === 3 ? 2.4 : seg.cont ? 3.2 : [1.6, 2.0, 1.2, 2.4][nt.seg] ?? 1.6;
      at(nt.t, () => new Bell(nt.t, nt.freq, ratio, idx, 0.12 * nt.vel, seg.n > 40 ? 0.14 : 0.22, nt.pan * 0.85));
    }
    for (const d of S.III_DRUMS) {
      const t = d.t;
      if (d.type === 'kick') at(t, () => new Kick(t, 0.5 * d.vel, 46, R, 0.16));
      else if (d.type === 'bass') at(t, () => new Bass808(t, d.f, 0.28, 0.2));
      else if (d.type === 'snare') at(t, () => new Noise({ t0: t, dur: 0.3, rnd: R, fc: () => 2400, q: 0.6, mode: 'bp', pan: 0.1, send: 0.35,
        amp: (a) => 0.42 * d.vel * Math.exp(-a / 0.07),
        tone: { f: (a) => 175 + 60 * Math.exp(-a / 0.02), a: (a) => 0.22 * d.vel * Math.exp(-a / 0.05) } }));
      else at(t, () => new Noise({ t0: t, dur: d.open ? 0.4 : 0.07, rnd: R, fc: () => 8500, q: 0.7, mode: 'hp', pan: (R() - 0.5) * 0.8, send: 0.1,
        amp: (a) => 0.12 * d.vel * Math.exp(-a / (d.open ? 0.12 : 0.014)) }));
    }

    // ── IV → V: whoosh into the mirror
    at(S.T.V - 1.6, () => new Noise({ t0: S.T.V - 1.6, dur: 1.62, rnd: R, fc: (a) => 250 * Math.pow(30, a / 1.6), q: 2.5, mode: 'bp', send: 0.4, amp: (a) => 0.16 * Math.pow(a / 1.6, 2.2) }));

    // ── V: impact
    at(S.T.V, () => new Kick(S.T.V, 0.75, 38, R, 0.6));
    at(S.T.V, () => new Noise({ t0: S.T.V, dur: 2.2, rnd: R, fc: () => 5000, q: 0.5, mode: 'hp', send: 0.8, amp: (a) => 0.14 * Math.exp(-a / 0.32) }));
    // the twelve mirror voices. at the end they become the twelve strongest partials of the spark
    for (let k = 1; k <= S.RHY_K; k++) {
      const p = S.gliderOf(k);
      this.voices.push(new Sine({ start: S.T.V - 0.3, ff: (t) => S.mirrorFreq(k, t), f: S.F0 * k, pan: (k % 2 ? 1 : -1) * Math.min(0.6, k / 14), send: 0.4, end: S.DUR,
        amp: (t) => S.mirrorAmp(k, t),
        lock: { f: p.f, phi: (p.psi + Math.PI / 2) / TAU, from: p.t + 0.6 } }));
      // warmth for the mirror section only (harmonics would distort the spark, so they leave before it)
      this.voices.push(new Sine({ start: S.T.V - 0.3, ff: (t) => 2 * S.mirrorFreq(k, t), f: 2 * S.F0 * k, pan: (k % 2 ? -1 : 1) * 0.3, send: 0.4, end: S.V_SETTLE[1] + 0.2,
        amp: (t) => 0.3 * S.mirrorAmp(k, t) * (1 - S.ramp(t, S.V_WOBBLE[0], S.V_SETTLE[1])) }));
    }
    // a C to disagree with: B♯ wobbles against it, then everyone gives in
    this.voices.push(new Sine({ start: S.V_CONVERGE[0], f: S.HOME, pan: 0, send: 0.35, end: S.V_SETTLE[1] + 0.2, harm: [1, 0.4, 0.2],
      amp: (t) => 0.2 * S.ramp(t, S.V_CONVERGE[1] - 0.3, S.V_WOBBLE[0] + 0.1) * (1 - S.ramp(t, S.V_SETTLE[0] + 0.1, S.V_SETTLE[1])) }));
    this.voices.push(new Sine({ start: S.T.V - 0.01, f: S.F0, send: 0.1, end: S.V_SETTLE[1] + 0.2, harm: [1, 0.25], amp: (t) => 0.12 * S.ramp(t, S.T.V, S.T.V + 0.3) * (1 - S.ramp(t, S.V_CONVERGE[0], S.V_SETTLE[1])) }));
    // the rest of the spark: sidebands that make the rays organic, phase-locked to the same grid
    for (let i = S.RHY_K; i < S.SPARK.length; i++) {
      const p = S.SPARK[i]; const phi = (p.psi + Math.PI / 2) / TAU;
      this.voices.push(new Sine({ start: p.t - 0.01, f: p.f, ph: ((p.f * p.t + phi) % 1 + 1) % 1, pan: (i % 2 ? 0.35 : -0.35), send: 0.4, end: S.DUR,
        amp: (t) => S.sparkAmp(p, t), lock: { f: p.f, phi, from: p.t } }));
    }
    // (look at the spectrogram during the mirror, above 3 kHz)
    for (const w of ['top', 'bot']) this.voices.push(new Sine({ start: S.HEART.t0 - 0.05, ff: (t) => S.heartFreq(w, t), f: S.heartFreq(w, S.HEART.t0), send: 0, end: S.HEART.t1 + 0.1, amp: S.heartAmp }));

    ev.sort((a, b) => a.t - b.t);
    this.events = ev.filter((e) => e.t >= t0 - 0.01); this.ei = 0;
    const ph = S.rhyPhase(t0);
    for (let k = 1; k <= S.RHY_K; k++) this.rc[k] = Math.floor(k * ph);
  }

  rhythmicon(t, bus) {
    const env = S.rhyEnvelope(t); if (env <= 0) return;
    const r = S.rhyRate(t), ph = S.rhyPhase(t);
    const u = S.clamp((t - S.T.IV) / S.IV_ACC, 0, 1);
    if ((this.rcnt++ & 15) === 0) { // control rate: resonator decay shrinks as tempo climbs
      const tau = 0.06 * Math.pow(r, -0.62);
      const R = Math.exp(-1 / (tau * sampleRate));
      for (let k = 1; k <= S.RHY_K; k++) { const w = TAU * S.HOME * k / sampleRate; const co = this.rCoef[k]; co.a1 = 2 * R * Math.cos(w); co.a2 = -R * R; co.b = Math.sin(w); }
      this.rBody = S.smooth((r - 4) / 40); this.rTau = tau;
    }
    const body = this.rBody, tau = this.rTau;
    const cresc = (0.55 + 1.3 * u * u * u) * this.rGain;
    for (let k = 1; k <= S.RHY_K; k++) {
      const c = Math.floor(k * ph);
      let x = this.rp[k]; this.rp[k] = 0;
      if (c > this.rc[k]) {
        this.rc[k] = c;
        const rate = k * r; const d = (k * ph - c) / (rate / sampleRate);
        const A = env * cresc / Math.pow(k, 0.35) / Math.sqrt(Math.max(1, rate * tau * 3));
        const dd = S.clamp(d, 0, 1); x += A * dd; this.rp[k] += A * (1 - dd);
        if (k === 1 && r < 4.5 && t > S.T.IV - 0.01) this.voices.push(new Kick(t, 0.5 * (1 - r / 5), 42, this.rnd, 0.35));
      }
      const co = this.rCoef[k];
      const y = co.a1 * this.ry1[k] + co.a2 * this.ry2[k] + x * co.b; this.ry2[k] = this.ry1[k]; this.ry1[k] = y;
      this.rl1[k] += 0.2 * (x - this.rl1[k]); this.rl2[k] += 0.2 * (this.rl1[k] - this.rl2[k]);
      const o = y * (1 - 0.6 * body) + this.rl2[k] * body * 9;
      bus.l += o * this.rPL[k]; bus.r += o * this.rPR[k]; bus.s += o * 0.18;
    }
  }

  process(inputs, outputs) {
    if (this.dead) return false; // replay/stop: let the node die instead of burning CPU forever
    const out = outputs[0]; const L = out[0], Rr = out[1] || out[0];
    if (!this.running) return true;
    const sr = sampleRate; const bus = this.bus;
    for (let i = 0; i < L.length; i++) {
      const t = currentTime + i / sr - this.startAt + this.offset;
      if (t < this.offset) { L[i] = 0; Rr[i] = 0; continue; }
      if (t > S.DUR + 0.3) { L[i] = 0; Rr[i] = 0; this.dead = true; continue; }
      while (this.ei < this.events.length && this.events[this.ei].t <= t) this.voices.push(this.events[this.ei++].fn());
      bus.l = 0; bus.r = 0; bus.s = 0;
      const vs = this.voices;
      for (let v = 0; v < vs.length; v++) { if (!vs[v].run(t, bus)) { vs[v] = vs[vs.length - 1]; vs.pop(); v--; } }
      this.rhythmicon(t, bus);
      this.fdn.run(bus.s); const rl = this.fdn.l, rr = this.fdn.r;
      const l = bus.l + rl, r = bus.r + rr;
      const yl = l - this.xl + 0.9995 * this.hpL; this.xl = l; this.hpL = yl;
      const yr = r - this.xr + 0.9995 * this.hpR; this.xr = r; this.hpR = yr;
      const fade = S.clamp((S.DUR + 0.3 - t) / 0.3, 0, 1);
      L[i] = Math.tanh(yl * 1.1) * 0.92 * fade; Rr[i] = Math.tanh(yr * 1.1) * 0.92 * fade;
    }
    return true;
  }
}

registerProcessor('comma', CommaProcessor);
