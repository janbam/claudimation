import * as S from './score.js';

const TAU = Math.PI * 2;
const panL = (p) => Math.cos((p + 1) * Math.PI / 4);
const panR = (p) => Math.sin((p + 1) * Math.PI / 4);

// ───────────────────────── voices. each run(t, bus) adds to bus.l/r/s, returns alive
class Sine { // control-rate amp/freq (every 16 samples), smoothed amp
  constructor(o) {
    this.f = o.f || 0; this.ff = o.ff || null; this.amp = o.amp; this.end = o.end ?? 1e9; this.start = o.start ?? -1;
    this.harm = o.harm || null; this.ph = o.ph ?? 0; this.send = o.send ?? 0.3;
    this.gl = panL(o.pan || 0); this.gr = panR(o.pan || 0); this.inv = 1 / sampleRate;
    this.cnt = 0; this.at = 0; this.a = 0; this.inc = this.f * this.inv;
  }
  run(t, bus) {
    if (t < this.start) return true;
    if (t > this.end) return false;
    if ((this.cnt++ & 15) === 0) { this.at = this.amp(t); if (this.ff) this.inc = this.ff(t) * this.inv; }
    this.a += 0.08 * (this.at - this.a);
    this.ph += this.inc; if (this.ph >= 1) this.ph -= 1;
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

class Pluck { // Karplus–Strong with fractional delay
  constructor(f, amp, pan, bright, decay, rnd, send = 0.35) {
    const sr = sampleRate; const N = sr / f;
    let size = 1; while (size < N + 8) size <<= 1;
    this.buf = new Float32Array(size); this.mask = size - 1;
    let lp = 0; const init = Math.ceil(N) + 2;
    for (let i = 0; i < init; i++) { const x = rnd() * 2 - 1; lp += bright * (x - lp); this.buf[i] = lp; }
    // remove DC from excitation
    let m = 0; for (let i = 0; i < init; i++) m += this.buf[i]; m /= init; for (let i = 0; i < init; i++) this.buf[i] -= m;
    this.w = init; this.D = N - 0.5; this.g = Math.pow(0.001, 1 / (f * decay));
    this.amp = amp; this.life = decay * 1.3 * sr; this.n = 0; this.send = send;
    this.gl = panL(pan); this.gr = panR(pan);
  }
  read(p) { const i = Math.floor(p); const fr = p - i; const a = this.buf[i & this.mask], b = this.buf[(i + 1) & this.mask]; return a + (b - a) * fr; }
  run(t, bus) {
    const p = this.w - this.D;
    const y = this.g * 0.5 * (this.read(p) + this.read(p - 1));
    this.buf[this.w & this.mask] = y; this.w++;
    const o = y * this.amp * (this.n < 64 ? this.n / 64 : 1);
    bus.l += o * this.gl; bus.r += o * this.gr; bus.s += o * this.send;
    return ++this.n < this.life;
  }
}

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

class Noise { // filtered noise via TPT state-variable filter
  constructor(o) {
    this.t0 = o.t0; this.dur = o.dur; this.fc = o.fc; this.q = o.q ?? 0.8; this.amp = o.amp; this.mode = o.mode || 'bp';
    this.rnd = o.rnd; this.send = o.send ?? 0.3; this.gl = panL(o.pan || 0); this.gr = panR(o.pan || 0);
    this.ic1 = 0; this.ic2 = 0; this.sr = sampleRate; this.cnt = 0; this.g = 0;
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
    this.pre = new Float32Array(Math.round(sr * 0.021)); this.pi = 0;
  }
  run(x) {
    const pre = this.pre[this.pi]; this.pre[this.pi] = x; this.pi = (this.pi + 1) % this.pre.length;
    const o = this.o;
    for (let i = 0; i < 8; i++) { const v = this.buf[i][this.idx[i]]; this.lp[i] += this.damp * (v - this.lp[i]); o[i] = this.lp[i]; }
    // fast Walsh-Hadamard
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
    this.running = false; this.startAt = 0; this.offset = 0;
    this.rnd = S.mulberry32(23460);
    this.voices = []; this.events = []; this.ei = 0;
    this.bus = { l: 0, r: 0, s: 0 };
    this.fdn = new FDN(sampleRate);
    this.hpL = 0; this.hpR = 0; this.xl = 0; this.xr = 0;
    // rhythmicon state
    const K = S.RHY_K;
    this.rc = new Float64Array(K + 1); this.ry1 = new Float64Array(K + 1); this.ry2 = new Float64Array(K + 1);
    this.rp = new Float64Array(K + 1); this.rl1 = new Float64Array(K + 1); this.rl2 = new Float64Array(K + 1);
    this.rCoef = []; for (let k = 1; k <= K; k++) {
      const w = TAU * S.HOME * k / sampleRate, R = Math.exp(-1 / (0.055 * sampleRate));
      this.rCoef[k] = { a1: 2 * R * Math.cos(w), a2: -R * R };
    }
    this.lastPhase = 0; this.rcnt = 0; this.rBody = 0; this.rTau = 0.06; this.rGain = 1.0;
    this.rPL = new Float64Array(K + 1); this.rPR = new Float64Array(K + 1);
    for (let k = 1; k <= K; k++) { const p = (k % 2 ? 1 : -1) * Math.min(0.85, k / 10); this.rPL[k] = panL(p); this.rPR[k] = panR(p); }
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this.startAt = e.data.at; this.offset = e.data.offset || 0; this.build(this.offset); this.running = true;
      }
    };
    const po = options && options.processorOptions;
    if (po && po.autostart) { this.startAt = po.at || 0; this.offset = po.offset || 0; this.build(this.offset); this.running = true; }
  }

  build(t0) {
    const R = this.rnd; const ev = [];
    // I: the drone. persistent voices, driven by pure functions of time
    for (let k = 1; k <= S.PARTIALS; k++) {
      const shimmer = 0.6 + 0.9 * R(); const sp = R() * TAU;
      this.voices.push(new Sine({
        f: S.F0 * k, pan: ((k * 0.618) % 1) * 1.4 - 0.7, send: 0.3, end: 11.6,
        amp: (t) => S.droneAmp(k, t) * (1 + 0.18 * Math.sin(t * shimmer + sp)),
      }));
    }
    // a breath of bowing noise under the drone
    ev.push({ t: 0.25, fn: () => new Noise({ t0: 0.25, dur: 4.6, rnd: R, fc: () => 320, q: 3, mode: 'bp', send: 0.5, amp: (a) => 0.06 * S.smooth(a / 1.5) * (1 - S.smooth((a - 2.8) / 1.8)) }) });

    // II: fifths
    for (const n of S.FIFTHS) {
      const last = n.n === 12;
      ev.push({ t: n.t, fn: () => new Pluck(n.freq, 0.62, (n.n % 2 ? 0.45 : -0.45) * (n.n / 12), 0.55, last ? 3.2 : 2.2, R) });
      ev.push({ t: n.t, fn: () => new Pluck(n.freq * 2, 0.17, -(n.n % 2 ? 0.45 : -0.45), 0.8, 1.2, R, 0.5) });
      if (!last) {
        const lyd = n.n <= 6;
        this.voices.push(new Sine({ start: n.t, f: n.freq, pan: (n.n % 3 - 1) * 0.5, send: 0.45, end: 11.6, harm: [1, 0.25],
          amp: (t) => S.ramp(t, n.t + 0.05, n.t + 0.5) * (lyd ? 0.045 : 0.03) * (1 - S.ramp(t, 10.6, 11.4)) }));
      }
    }
    // Lydian bloom — seven fifths from the tonic. maximum gravity.
    for (let i = 0; i <= 6; i++) {
      const f = S.FIFTHS[i].freq / 2;
      this.voices.push(new Sine({ start: S.LYDIAN_T - 0.01, f, pan: (i / 6) * 1.2 - 0.6, send: 0.6, end: 11.6, harm: [1, 0.5, 0.2, 0.1],
        amp: (t) => 0.05 * S.ramp(t, S.LYDIAN_T, S.LYDIAN_T + 0.35) * (1 - S.ramp(t, S.LYDIAN_T + 0.4, S.LYDIAN_T + 2.6)) }));
    }
    // the comma: B♯ against C. 3.49 Hz of disagreement
    const bs = S.FIFTHS[12].freq, cT = S.COMMA_T;
    const commaAmp = (lvl) => (t) => lvl * S.ramp(t, cT, cT + 0.25) * (0.6 + 0.4 * S.ramp(t, cT, S.TEAR_T)) * (1 - S.ramp(t, S.TEAR_T - 0.02, S.TEAR_T + 0.02));
    this.voices.push(new Sine({ start: cT - 0.01, f: bs, pan: 0.35, send: 0.35, end: 11.6, harm: [1, 0.4, 0.15], amp: commaAmp(0.16) }));
    this.voices.push(new Sine({ start: cT - 0.01, f: S.HOME, pan: -0.35, send: 0.35, end: 11.6, harm: [1, 0.4, 0.15], amp: commaAmp(0.16) }));
    this.voices.push(new Sine({ start: cT - 0.01, f: S.HOME / 4, pan: 0, send: 0.2, end: 11.6, harm: [1, 0.3], amp: commaAmp(0.2) }));
    // the tear
    ev.push({ t: S.TEAR_T, fn: () => new Sweep(S.TEAR_T) });
    ev.push({ t: S.TEAR_T, fn: () => new Noise({ t0: S.TEAR_T, dur: 0.25, rnd: R, fc: (a) => 9000 * Math.exp(-a / 0.05) + 200, q: 1.5, mode: 'bp', send: 0.6, amp: (a) => 0.5 * Math.exp(-a / 0.06) }) });

    // III: the EDO torrent
    for (let j = 0; j < 4; j++) {
      this.voices.push(new Sine({ start: S.T.III - 0.01, ff: (t) => S.padChord(S.tuningAt(t))[j], pan: j / 3 * 1.2 - 0.6, send: 0.5, end: 18.4, harm: [1, 0.3, 0.1],
        amp: (t) => 0.05 * S.ramp(t, S.T.III, S.T.III + 0.3) * (1 - S.ramp(t, S.T.IV - 0.25, S.T.IV)) }));
    }
    this.voices.push(new Sine({ start: S.T.III - 0.01, ff: (t) => S.padChord(S.tuningAt(t))[0] / 2, pan: 0, send: 0.1, end: 18.4, harm: [1, 0.2],
      amp: (t) => 0.09 * S.ramp(t, S.T.III, S.T.III + 0.1) * (1 - S.ramp(t, S.T.IV - 0.1, S.T.IV)) }));
    for (const nt of S.III_NOTES) {
      const tn = S.tuningAt(nt.t + 1e-6);
      const ratio = tn.P === 3 ? 2 : tn.cont ? Math.PI : 1;
      const idx = tn.P === 3 ? 2.4 : tn.cont ? 3.0 : 1.6;
      ev.push({ t: nt.t, fn: () => new Bell(nt.t, nt.freq, ratio, idx, 0.13 * nt.vel, 0.22, nt.pan * 0.8) });
    }
    for (const d of S.III_DRUMS) {
      if (d.type === 'kick') ev.push({ t: d.t, fn: () => new Kick(d.t, 0.5, 44, R, 0.22) });
      else if (d.type === 'clap') ev.push({ t: d.t, fn: () => new Noise({ t0: d.t, dur: 0.25, rnd: R, fc: () => 1500, q: 1.2, mode: 'bp', send: 0.5, amp: (a) => 0.35 * (Math.exp(-a / 0.05) + (a < 0.02 ? 0.5 : 0)) }) });
      else ev.push({ t: d.t, fn: () => new Noise({ t0: d.t, dur: 0.06, rnd: R, fc: () => 8000, q: 0.7, mode: 'hp', pan: (R() - 0.5) * 0.6, send: 0.1, amp: (a) => 0.1 * d.vel * Math.exp(-a / 0.012) }) });
    }

    // IV: whoosh into the mirror
    ev.push({ t: 23.9, fn: () => new Noise({ t0: 23.9, dur: 1.62, rnd: R, fc: (a) => 250 * Math.pow(30, a / 1.6), q: 2.5, mode: 'bp', send: 0.4, amp: (a) => 0.16 * Math.pow(a / 1.6, 2.2) }) });

    // V: impact
    ev.push({ t: S.T.V, fn: () => new Kick(S.T.V, 0.75, 38, R, 0.6) });
    ev.push({ t: S.T.V, fn: () => new Noise({ t0: S.T.V, dur: 2.6, rnd: R, fc: () => 5000, q: 0.5, mode: 'hp', send: 0.8, amp: (a) => 0.14 * Math.exp(-a / 0.32) }) });
    for (let k = 1; k <= S.RHY_K; k++) {
      this.voices.push(new Sine({ start: S.T.V - 0.3, ff: (t) => S.mirrorFreq(k, t), f: S.F0 * k, pan: (k % 2 ? 1 : -1) * Math.min(0.8, k / 12), send: 0.4, end: 30, harm: [1, 0.35, 0.14],
        amp: (t) => S.mirrorAmp(k, t) }));
    }
    this.voices.push(new Sine({ start: S.T.V - 0.01, f: S.F0, send: 0.1, end: 30, harm: [1, 0.25], amp: (t) => 0.12 * S.ramp(t, S.T.V, S.T.V + 0.3) * (1 - S.ramp(t, 27.5, 29.9)) }));
    // (look at the spectrogram between 26 and 28.5 seconds)
    for (const w of ['top', 'bot']) this.voices.push(new Sine({ start: S.HEART.t0 - 0.05, ff: (t) => S.heartFreq(w, t), f: S.heartFreq(w, S.HEART.t0), send: 0, end: S.HEART.t1 + 0.1, amp: S.heartAmp }));
    // home, finally. 1/1.
    const H = S.V_SETTLE[1];
    ev.push({ t: H, fn: () => new Pluck(S.HOME, 0.35, 0, 0.35, 3.0, R, 0.6) });
    ev.push({ t: H, fn: () => new Bell(H, S.HOME * 2, 1, 0.8, 0.07, 0.6, 0, 0.7) });

    ev.sort((a, b) => a.t - b.t);
    this.events = ev.filter((e) => e.t >= t0 - 0.01); this.ei = 0;
    // rhythmicon counters
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
        const rate = k * r; const d = (k * ph - c) / (rate / sampleRate); // samples since crossing
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
    const out = outputs[0]; const L = out[0], Rr = out[1] || out[0];
    if (!this.running) return true;
    const sr = sampleRate; const bus = this.bus;
    for (let i = 0; i < L.length; i++) {
      const t = currentTime + i / sr - this.startAt + this.offset;
      if (t < this.offset || t > S.DUR + 0.2) { L[i] = 0; Rr[i] = 0; continue; }
      while (this.ei < this.events.length && this.events[this.ei].t <= t) this.voices.push(this.events[this.ei++].fn());
      bus.l = 0; bus.r = 0; bus.s = 0;
      const vs = this.voices;
      for (let v = 0; v < vs.length; v++) { if (!vs[v].run(t, bus)) { vs[v] = vs[vs.length - 1]; vs.pop(); v--; } }
      this.rhythmicon(t, bus);
      this.fdn.run(bus.s); const rl = this.fdn.l, rr = this.fdn.r;
      let l = bus.l + rl, r = bus.r + rr;
      // DC block
      const yl = l - this.xl + 0.9995 * this.hpL; this.xl = l; this.hpL = yl;
      const yr = r - this.xr + 0.9995 * this.hpR; this.xr = r; this.hpR = yr;
      const fade = S.clamp((S.DUR + 0.2 - t) / 0.2, 0, 1);
      L[i] = Math.tanh(yl * 1.1) * 0.92 * fade; Rr[i] = Math.tanh(yr * 1.1) * 0.92 * fade;
    }
    return true;
  }
}

registerProcessor('comma', CommaProcessor);
