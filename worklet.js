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
    // (real time: the phase grid stays in tune at any speed)
    if (L && t > L.from) { let e = (L.f * bus.tr + L.phi) - this.ph; e -= Math.round(e); this.ph += e * 0.00025; }
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
const PLUCK_GAIN = 0.38; // −5 dB vs the brighter version, measured (the rounder spectrum alone would be +4 dB)
class ModalPluck {
  constructor(t0, f, amp, pan, rnd, o = {}) {
    const sr = sampleRate; this.t0 = t0; this.inv = 1 / sr;
    const B = o.B ?? 0.00018, pos = o.pos ?? (0.17 + 0.04 * rnd()), tau0 = o.tau ?? 2.4, cut = o.cut ?? 3200;
    this.bend = o.bend ?? 0.0045;
    const P = []; let norm = 0;
    for (let m = 1; m <= 32; m++) {
      const fm = m * f * Math.sqrt(1 + B * m * m); if (fm > Math.min(15000, sr * 0.45)) break;
      const a = Math.sin(m * Math.PI * pos) / Math.pow(m, 0.95) / (1 + Math.pow(fm / cut, 2)); // 2nd-order rolloff: rounder
      const tau = Math.max(0.04, tau0 / (1 + Math.pow(fm / 1050, 1.35))); // highs die a little sooner
      P.push({ fm, a, r: Math.exp(-1 / (tau * sr)), c: 1, s: 0, cw: 1, sw: 0, side: m % 2 ? 1 : -1 });
      norm += Math.abs(a);
    }
    for (const p of P) p.a *= 2.75 / norm; // +2 dB: the body used to carry some of the level
    this.P = P; this.amp = amp * PLUCK_GAIN; this.pan = pan; this.cnt = 0; this.rnd = rnd;
    this.gl1 = panL(clampP(pan - 0.2)); this.gr2 = panR(clampP(pan + 0.2));
    this.life = tau0 * 3.2; this.send = o.send ?? 0.32;
    this.xp = 0; // (no body resonator any more: it knocked)
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
    // pick: a 2 ms breath of high-passed noise, nothing low
    let pick = 0; if (age < 0.002) { const x = (this.rnd() * 2 - 1) * (1 - age / 0.002); pick = (x - this.xp) * 0.012; this.xp = x; }
    const A = this.amp * Math.min(1, age / 0.0015);
    const dl = (l * 0.8 + r * 0.2 + pick) * A, dr = (r * 0.8 + l * 0.2 + pick) * A;
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
    const e = Math.exp(-age / this.decay); // envelope after the drive: punch, then a tail that actually goes away
    let y = Math.sin(TAU * this.ph) * Math.min(1, e * 1.6);
    y += (this.rnd() * 2 - 1) * Math.exp(-age / 0.002) * 0.4;
    y = Math.tanh(y * 1.6) * e * this.amp;
    bus.l += y; bus.r += y; bus.s += y * 0.06;
    return true;
  }
}

class Bass808 { // tuned to the tonic of whatever tuning we're in
  constructor(t0, f, amp, decay) { this.t0 = t0; this.f = f; this.amp = amp; this.decay = decay; this.ph = 0; this.inv = 1 / sampleRate; }
  run(t, bus) {
    const age = t - this.t0; if (age < 0) return true; if (age > this.decay * 6) return false;
    this.ph += this.f * (1 + 1.2 * Math.exp(-age / 0.03)) * this.inv;
    // drive only while it's loud; the envelope comes *after* the tanh, so the tail really decays (no drone)
    const e = Math.exp(-age / this.decay);
    const y = Math.tanh(2.2 * Math.sin(TAU * this.ph) * Math.min(1, e * 1.5)) * e * this.amp * Math.min(1, age / 0.003);
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

// ───────────────────────── reverb: 8-line FDN, Hadamard feedback
// 4-point Hermite read from a power-of-two ring buffer at a fractional position
function herm(b, m, pos) {
  const i = Math.floor(pos), f = pos - i;
  const xm = b[(i - 1) & m], x0 = b[i & m], x1 = b[(i + 1) & m], x2 = b[(i + 2) & m];
  const c1 = 0.5 * (x1 - xm), c2 = xm - 2.5 * x0 + 2 * x1 - 0.5 * x2, c3 = 0.5 * (x2 - xm) + 1.5 * (x0 - x1);
  return ((c3 * f + c2) * f + c1) * f + x0;
}
const pow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

// the room. an 8-line Hadamard FDN with
//  · input diffusion (3 allpasses, static)
//  · Lexicon-style "wander": every delay length drifts on its own smooth random walk, ±0.17 ms,
//    so the modes never sit still. the drift is slow enough that the pitch moves ≤ 0.7¢ (only in the
//    tail; the dry sound is never touched): at 256 Hz that's 0.1 Hz, 35× less than the 3.49 Hz comma beat
//  · a Dimension-D-style widener on the *return only*: two short delays on opposite slow LFOs, with
//    high-passed, polarity-inverted crossfeed. width by decorrelation, not by chorus; the bass stays mono.
class FDN {
  constructor(sr) {
    const k = sr / 48000; this.sr = sr;
    this.D0 = [1031, 1327, 1523, 1871, 2053, 2311, 2677, 2963].map((l) => l * k);
    this.N = pow2(Math.ceil(2963 * k + 64)); this.m = this.N - 1; this.w = 0;
    this.buf = this.D0.map(() => new Float32Array(this.N));
    this.lp = new Float32Array(8); this.o = new Float32Array(8); this.fb = 0.86; this.fbMul = 1; this.damp = 0.3;
    // output taps: two sign patterns chosen (by measurement) so the diffuse tail comes out decorrelated (corr ≈ −0.1).
    // the old even/odd taps shared the Hadamard pattern of the input and gave an anti-phase tail (corr −0.5):
    // phasey on headphones, and it cancelled itself in mono.
    this.tapL = [1, -1, -1, -1, -1, 1, 1, -1].map((x) => x * 0.5); this.tapR = [1, 1, 1, -1, -1, 1, -1, -1].map((x) => x * 0.5);
    this.pre = new Float32Array(Math.round(sr * 0.021)); this.pi = 0; this.l = 0; this.r = 0;
    // wander
    this.rnd = S.mulberry32(3490); this.WANDER = 8 * k;
    this.off = new Float64Array(8); this.o1 = new Float64Array(8); this.tgt = new Float64Array(8); this.timer = new Int32Array(8);
    this.ks = 1 - Math.exp(-1 / (0.3 * sr)); // two of these in series ≈ 0.6 s of glide
    // input diffusion
    this.ap = [142, 107, 379].map((d) => ({ b: new Float32Array(Math.round(d * k)), i: 0 })); this.apg = 0.6;
    // dimension
    this.DN = pow2(Math.ceil(0.012 * sr)); this.dm = this.DN - 1; this.dw = 0;
    this.dL = new Float32Array(this.DN); this.dR = new Float32Array(this.DN);
    this.lfo = 0; this.lfoInc = 0.3 / sr; this.dBase = [0.0070 * sr, 0.0093 * sr]; this.dDepth = 0.0002 * sr;
    this.hpc = 1 - Math.exp(-TAU * 350 / sr); this.xl = 0; this.xr = 0;
  }
  clear() { // the tear: an empty room
    for (const b of this.buf) b.fill(0); this.lp.fill(0); this.pre.fill(0); for (const a of this.ap) a.b.fill(0);
    this.dL.fill(0); this.dR.fill(0); this.xl = 0; this.xr = 0; this.l = 0; this.r = 0;
  }
  run(x) {
    const pre0 = this.pre[this.pi]; this.pre[this.pi] = x; this.pi = (this.pi + 1) % this.pre.length;
    let pre = pre0;
    for (const a of this.ap) { const d = a.b[a.i]; const y = d - this.apg * pre; a.b[a.i] = pre + this.apg * y; pre = y; if (++a.i >= a.b.length) a.i = 0; }
    const o = this.o, m = this.m, w = this.w;
    for (let i = 0; i < 8; i++) {
      if (--this.timer[i] <= 0) { this.tgt[i] = (this.rnd() * 2 - 1) * this.WANDER; this.timer[i] = Math.round(this.sr * (0.5 + 1.1 * this.rnd())); }
      this.o1[i] += this.ks * (this.tgt[i] - this.o1[i]); this.off[i] += this.ks * (this.o1[i] - this.off[i]);
      const v = herm(this.buf[i], m, w - this.D0[i] - this.off[i]);
      this.lp[i] += this.damp * (v - this.lp[i]); o[i] = this.lp[i];
    }
    for (let h = 1; h < 8; h <<= 1) for (let i = 0; i < 8; i += h << 1) for (let j = i; j < i + h; j++) { const a = o[j], b = o[j + h]; o[j] = a + b; o[j + h] = a - b; }
    const sc = this.fb * this.fbMul / Math.sqrt(8);
    let l = 0, r = 0;
    for (let i = 0; i < 8; i++) {
      const v = this.lp[i];
      l += v * this.tapL[i]; r += v * this.tapR[i];
      this.buf[i][w] = o[i] * sc + pre * (i & 2 ? 0.5 : -0.5);
    }
    this.w = (w + 1) & m;
    l *= 0.283; r *= 0.283; // −3 dB
    // dimension: return only
    const dw = this.dw, dm = this.dm;
    this.dL[dw] = l; this.dR[dw] = r;
    this.lfo += this.lfoInc; if (this.lfo >= 1) this.lfo -= 1;
    const s = Math.sin(TAU * this.lfo);
    const wl = herm(this.dL, dm, dw - this.dBase[0] - this.dDepth * s), wr = herm(this.dR, dm, dw - this.dBase[1] + this.dDepth * s);
    this.dw = (dw + 1) & dm;
    this.xl += this.hpc * (wl - this.xl); this.xr += this.hpc * (wr - this.xr); // lowpass → subtract = highpass
    const hl = wl - this.xl, hr = wr - this.xr;
    this.l = 0.85 * (l + 0.25 * wl - 0.38 * hr);
    this.r = 0.85 * (r + 0.25 * wr - 0.38 * hl);
  }
}

// ───────────────────────── master: drive into the same tanh saturation as always, with a lower ceiling.
// (tried: a slow compressor, then a lookahead limiter. both ducked the IV climax, whose 12 aligned pulses make
// huge peaks; the tanh just rounds those peaks off, which is part of IV's sound.) small signals get +2 dB,
// the climax mostly saturates harder. ceiling 0.79 = −2 dBFS sample peak ≈ −1 dBTP after inter-sample overshoot.
const M_DRIVE = 1.1 * Math.pow(10, 3.3 / 20), M_CEIL = 0.79;
class Master {
  constructor() { this.l = 0; this.r = 0; }
  run(x, y) { this.l = Math.tanh(x * M_DRIVE) * M_CEIL; this.r = Math.tanh(y * M_DRIVE) * M_CEIL; }
}

// all of IV, trimmed (pre-master; the tanh master saturates the climax, so this was set by measuring LUFS)
const IV_TRIM = Math.pow(10, -5.3 / 20); // −5.3 dB in ≈ −4 dB out, measured

// ───────────────────────── the processor
class CommaProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.running = false; this.dead = false; this.startAt = 0; this.offset = 0; this.speed = 1;
    this.rnd = S.mulberry32(23460);
    this.voices = []; this.events = []; this.ei = 0;
    this.bus = { l: 0, r: 0, s: 0, tr: 0 }; this.bus2 = { l: 0, r: 0, s: 0, tr: 0 }; this.bus3 = { l: 0, r: 0, s: 0, tr: 0 }; this.torn = false;
    this.fdn = new FDN(sampleRate); this.fdn2 = new FDN(sampleRate); this.master = new Master();
    this.hpL = 0; this.hpR = 0; this.xl = 0; this.xr = 0;
    const K = S.RHY_K;
    this.rc = new Float64Array(K + 1); this.ry1 = new Float64Array(K + 1); this.ry2 = new Float64Array(K + 1);
    this.rp = new Float64Array(K + 1); this.rl1 = new Float64Array(K + 1); this.rl2 = new Float64Array(K + 1);
    this.rCoef = []; for (let k = 1; k <= K; k++) this.rCoef[k] = { a1: 0, a2: 0, b: 0 };
    this.rcnt = 0; this.rBody = 0; this.rTau = 0.06; this.rGain = IV_TRIM;
    this.rHP = new Float64Array(4); this.rHPc = 1 - Math.exp(-TAU * 35 / sampleRate);
    this.rPL = new Float64Array(K + 1); this.rPR = new Float64Array(K + 1);
    for (let k = 1; k <= K; k++) { const p = (k % 2 ? 1 : -1) * Math.min(0.85, k / 10); this.rPL[k] = panL(p); this.rPR[k] = panR(p); }
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') { this.startAt = e.data.at; this.offset = e.data.offset || 0; this.speed = e.data.speed || S.BASE_SPEED; this.build(this.offset); this.running = true; }
      if (e.data.type === 'stop') { this.dead = true; this.voices = []; this.events = []; }
    };
    const po = options && options.processorOptions;
    if (po && po.autostart) { this.startAt = po.at || 0; this.offset = po.offset || 0; this.speed = po.speed || S.BASE_SPEED; this.build(this.offset); this.running = true; }
  }

  build(t0) {
    const R = this.rnd; const ev = [];
    const at = (t, fn) => ev.push({ t, fn });
    const II = (v) => { v.grp = 2; return v; }; // II's voices: cut dead at the tear

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
      at(n.t, () => II(new ModalPluck(n.t, n.freq, n.n === 12 ? 0.95 : 0.7, pan, R, { tau: 2.6 })));
      at(n.t, () => II(new ModalPluck(n.t + 0.012, n.freq / 2, 0.22, -pan, R, { tau: 1.8, pos: 0.2 })));
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
      if (c.who !== 'C') at(c.t, () => II(new ModalPluck(c.t, bs, 0.9, 0.5, R, { tau: 3 })));
      if (c.who !== 'B♯') at(c.t, () => II(new ModalPluck(c.t + (c.who === 'both' ? 0.006 : 0), S.HOME, 0.9, -0.5, R, { tau: 3 })));
    }
    const W0 = S.WOBBLE_T, W1 = S.TEAR_T;
    // the wobble holds, then falls (S.FALL) — dry, and into the comma room. it is not cut at the tear.
    const F0f = S.FALL.t0, F1f = S.FALL.t0 + S.FALL.len;
    const wob = (lvl) => (t) => lvl * S.ramp(t, W0 - 0.05, W0 + 0.3) * (0.7 + 0.3 * S.ramp(t, W0, W1)) * (1 - S.ramp(t, F0f + 0.55 * S.FALL.len, F1f));
    const FALLS = (v) => { v.grp = 3; return v; };
    this.voices.push(FALLS(new Sine({ start: W0 - 0.1, f: bs, ff: (t) => bs * S.fallF(t), pan: 0.4, send: 0.3, end: F1f + 0.05, harm: [1, 0.55, 0.35, 0.2, 0.12], amp: wob(0.15) })));
    this.voices.push(FALLS(new Sine({ start: W0 - 0.1, f: S.HOME, ff: (t) => S.HOME * S.fallF(t), pan: -0.4, send: 0.3, end: F1f + 0.05, harm: [1, 0.55, 0.35, 0.2, 0.12], amp: wob(0.15) })));
    this.voices.push(FALLS(new Sine({ start: W0 - 0.1, f: S.HOME / 4, ff: (t) => S.HOME / 4 * S.fallF(t), pan: 0, send: 0.15, end: F1f + 0.05, harm: [1, 0.3], amp: wob(0.16) })));
    // ── III: the bar has as many steps as the octave has notes
    for (const nt of S.III_NOTES) {
      const seg = S.III_SEGS[nt.seg];
      const ratio = seg.P === 3 ? 2 : seg.cont ? 1 : [1, 1, 2, 1][nt.seg] ?? 1;
      const idx = seg.P === 3 ? 2.4 : seg.cont ? 1.4 : [1.6, 2.0, 1.2, 2.4][nt.seg] ?? 1.6;
      at(nt.t, () => new Bell(nt.t, nt.freq, ratio, idx, (seg.cont ? 0.16 : 0.12) * nt.vel, seg.cont ? 0.35 : seg.n > 40 ? 0.14 : 0.22, nt.pan * 0.85));
    }
    for (const d of S.III_DRUMS) {
      const t = d.t;
      if (d.type === 'kick') at(t, () => new Kick(t, 0.55 * d.vel, 46, R, 0.1));
      else if (d.type === 'bass') at(t, () => new Bass808(t, d.f, 0.3, 0.11));
      else if (d.type === 'snare') at(t, () => new Noise({ t0: t, dur: 0.3, rnd: R, fc: () => 2400, q: 0.6, mode: 'bp', pan: 0.1, send: 0.35,
        amp: (a) => 0.42 * d.vel * Math.exp(-a / 0.07),
        tone: { f: (a) => 175 + 60 * Math.exp(-a / 0.02), a: (a) => 0.22 * d.vel * Math.exp(-a / 0.05) } }));
      else at(t, () => new Noise({ t0: t, dur: d.open ? 0.4 : 0.07, rnd: R, fc: () => 8500, q: 0.7, mode: 'hp', pan: (R() - 0.5) * 0.8, send: 0.1,
        amp: (a) => 0.12 * d.vel * Math.exp(-a / (d.open ? 0.12 : 0.014)) }));
    }

    // ── III → IV: the landing. 64 Hz falls two octaves in a blink; the missing bit of π arrives.
    { const t4 = S.T.IV;
      this.voices.push(new Sine({ start: t4 - 0.005, f: 64, send: 0.05, end: t4 + 0.9, harm: [1, 0.28, 0.08],
        ff: (t) => 64 * Math.pow(0.25, S.smooth(S.clamp((t - t4) / 0.32, 0, 1))),
        amp: (t) => 0.62 * IV_TRIM * S.ramp(t, t4 - 0.004, t4 + 0.004) * Math.exp(-Math.max(0, t - t4) / 0.2) }));
      at(t4, () => new Kick(t4, 0.55 * IV_TRIM, 50, R, 0.3));
      at(t4, () => new Noise({ t0: t4, dur: 1.0, rnd: R, fc: () => 7000, q: 0.5, mode: 'hp', send: 0.7, amp: (a) => 0.07 * IV_TRIM * Math.exp(-a / 0.25) })); }

    // ── IV → V: whoosh into the mirror
    at(S.T.V - 1.6, () => new Noise({ t0: S.T.V - 1.6, dur: 1.62, rnd: R, fc: (a) => 250 * Math.pow(30, a / 1.6), q: 2.5, mode: 'bp', send: 0.4, amp: (a) => 0.16 * IV_TRIM * Math.pow(a / 1.6, 2.2) }));

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

    this.torn = t0 >= S.TEAR_T; this.dryGone = t0 >= S.TEAR_T + 0.07;
    ev.sort((a, b) => a.t - b.t);
    this.events = ev.filter((e) => e.t >= t0 - 0.01); this.ei = 0;
    const ph = S.rhyPhase(t0) / this.speed;
    for (let k = 1; k <= S.RHY_K; k++) this.rc[k] = Math.floor(k * ph);
  }

  rhythmicon(t, bus) {
    const env = S.rhyEnvelope(t); if (env <= 0) return;
    // pulse *rates* are real Hz (64 Hz must stay the tonic), so at speed ≠ 1 the phase is rescaled, not the rate
    const r = S.rhyRate(t), ph = S.rhyPhase(t) / this.speed;
    const u = S.clamp((t - S.T.IV) / S.IV_ACC, 0, 1);
    if ((this.rcnt++ & 15) === 0) { // control rate: resonator decay shrinks as tempo climbs
      const tau = 0.06 * Math.pow(r, -0.62);
      const R = Math.exp(-1 / (tau * sampleRate));
      for (let k = 1; k <= S.RHY_K; k++) { const w = TAU * S.HOME * k / sampleRate; const co = this.rCoef[k]; co.a1 = 2 * R * Math.cos(w); co.a2 = -R * R; co.b = Math.sin(w); }
      this.rBody = S.smooth((r - 4) / 40); this.rTau = tau;
    }
    const body = this.rBody, tau = this.rTau;
    const cresc = (0.55 + 0.75 * u * u * u) * this.rGain; // top 3 dB lower than before: still a climb, no longer 7 dB above everything
    let bl = 0, br = 0;
    for (let k = 1; k <= S.RHY_K; k++) {
      const c = Math.floor(k * ph);
      let x = this.rp[k]; this.rp[k] = 0;
      if (c > this.rc[k]) {
        this.rc[k] = c;
        const rate = k * r; const d = (k * ph - c) / (rate / sampleRate);
        const A = env * cresc / Math.pow(k, 0.35) / Math.sqrt(Math.max(1, rate * tau * 3));
        const dd = S.clamp(d, 0, 1); x += A * dd; this.rp[k] += A * (1 - dd);
        if (k === 1 && r < 3 && t > S.T.IV - 0.01) this.voices.push(new Kick(t, 0.5 * IV_TRIM * (1 - r / 3.3), 44, this.rnd, 0.13));
      }
      const co = this.rCoef[k];
      const y = co.a1 * this.ry1[k] + co.a2 * this.ry2[k] + x * co.b; this.ry2[k] = this.ry1[k]; this.ry1[k] = y;
      this.rl1[k] += 0.2 * (x - this.rl1[k]); this.rl2[k] += 0.2 * (this.rl1[k] - this.rl2[k]);
      const o = y * (1 - 0.6 * body), bo = this.rl2[k] * body * 9;
      bus.l += o * this.rPL[k]; bus.r += o * this.rPR[k]; bus.s += o * 0.18;
      bl += bo * this.rPL[k]; br += bo * this.rPR[k];
    }
    // the pulse fundamental rises through 5…64 Hz: keep the 64 Hz it becomes, lose the rumble on the way
    const hc = this.rHPc, H = this.rHP;
    H[0] += hc * (bl - H[0]); bl -= H[0]; H[1] += hc * (bl - H[1]); bl -= H[1];
    H[2] += hc * (br - H[2]); br -= H[2]; H[3] += hc * (br - H[3]); br -= H[3];
    bus.l += bl; bus.r += br; bus.s += (bl + br) * 0.09;
  }

  process(inputs, outputs) {
    if (this.dead) return false; // replay/stop: let the node die instead of burning CPU forever
    const out = outputs[0]; const L = out[0], Rr = out[1] || out[0];
    if (!this.running) return true;
    const sr = sampleRate; const bus = this.bus;
    for (let i = 0; i < L.length; i++) {
      const tr = currentTime + i / sr - this.startAt; // real seconds since start
      const t = this.offset + tr * this.speed;         // score time
      bus.tr = tr;
      if (tr < 0) { L[i] = 0; Rr[i] = 0; continue; }
      if (t > S.DUR + 0.3) { L[i] = 0; Rr[i] = 0; this.dead = true; continue; }
      while (this.ei < this.events.length && this.events[this.ei].t <= t) this.voices.push(this.events[this.ei++].fn());
      bus.l = 0; bus.r = 0; bus.s = 0;
      const b2 = this.bus2; b2.l = 0; b2.r = 0; b2.s = 0; b2.tr = tr;
      const b3 = this.bus3; b3.l = 0; b3.r = 0; b3.s = 0; b3.tr = tr;
      // the tear: everything from II stops dead (6 ms, so it doesn't click), and the room is emptied
      // II → III: II plays into its own room (the comma room). one quarter before the beat the wobble falls four
      // octaves (S.FALL), dry and into that room, which opens as it falls; the plucks' dry sound goes at the tear.
      const TT = S.TEAR_T;
      if (!this.torn && t >= TT) { this.torn = true; this.fdn.clear(); } // III starts in an empty main room
      if (t >= TT + 0.07 && !this.dryGone) { this.dryGone = true; this.voices = this.voices.filter((v) => v.grp !== 2); }
      const vs = this.voices;
      for (let v = 0; v < vs.length; v++) { const gv = vs[v].grp; if (!vs[v].run(t, gv === 2 ? b2 : gv === 3 ? b3 : bus)) { vs[v] = vs[vs.length - 1]; vs.pop(); v--; } }
      const dry2 = 1 - S.smooth((t - TT) / 0.06);
      bus.l += b2.l * dry2 + b3.l; bus.r += b2.r * dry2 + b3.r; // the falling wobble (grp 3) keeps its dry sound
      const FE = S.FALL.t0 + S.FALL.len;
      if (t > S.T.II - 0.1 && t < FE + 6) {
        // the room opens with the fall (not before: then it would hold a ghost of the static tone), fills with the
        // glissando, and holds until the fall is over
        const grow = S.ramp(t, S.FALL.t0 - 0.05, S.FALL.t0 + 0.4), shrink = S.ramp(t, FE - 0.2, FE + 2.2);
        this.fdn2.fb = 0.86 + (0.965 - 0.86) * grow * (1 - shrink) + (0.9 - 0.86) * shrink;
        this.fdn2.run((b2.s * dry2 + b3.s) * (1 + 1.5 * grow));
        bus.l += this.fdn2.l; bus.r += this.fdn2.r;
      }
      this.rhythmicon(t, bus);
      // the ending: more and more of the sound goes into the room, and the room grows (RT60 ≈ 2 s → ~10 s).
      // the picture stops at VIS_END; the room keeps ringing for another RING seconds.
      const endU = S.ramp(t, S.V_CLEAN[0], S.V_FADE[0] + 0.6);
      this.fdn.fb = 0.86 + (0.975 - 0.86) * endU; // the room is already big when the fade begins
      this.fdn.run(bus.s * (1 + 1.3 * endU));
      const g = 1;
      // while the dry still plays, the bigger room would swell the sum: hold its return back a little,
      // and release it as the dry fades, so the whole thing only ever goes down, and the tail keeps its length
      const hold = 1 - 0.4 * S.ramp(t, S.V_CLEAN[0], S.V_FADE[0] + 0.2) * (1 - S.ramp(t, S.V_FADE[0] + 0.3, S.VIS_END));
      const rl = this.fdn.l * g * hold, rr = this.fdn.r * g * hold;
      const l = bus.l + rl, r = bus.r + rr;
      const yl = l - this.xl + 0.9995 * this.hpL; this.xl = l; this.hpL = yl;
      const yr = r - this.xr + 0.9995 * this.hpR; this.xr = r; this.hpR = yr;
      const fade = S.clamp((S.DUR + 0.3 - t) / 0.3, 0, 1);
      this.master.run(yl, yr); L[i] = this.master.l * fade; Rr[i] = this.master.r * fade;
    }
    return true;
  }
}

registerProcessor('comma', CommaProcessor);
