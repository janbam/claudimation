// COMMA — a treatise in five axioms.
// Shared, deterministic score. Imported by both the AudioWorklet and the visuals,
// so what you see is computed from exactly the same numbers as what you hear.

export const F0 = 64;          // the tonic. 2^6 Hz. chosen by a computer, for a computer.
export const HOME = 256;       // 1/1 in the singing register
export const COMMA = 531441 / 524288; // (3/2)^12 / 2^19  ≈ 23.46 cents of heartbreak
export const COMMA_CENTS = 1200 * Math.log2(COMMA);
export const BEAT_HZ = HOME * COMMA - HOME; // 3.49 wobbles per second

export const T = { I: 0, II: 4.5, III: 12.6, IV: 19.1, V: 26.6, END: 35.6 };
export const DUR = T.END;

const TAU_ = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
export const ramp = (t, a, b) => smooth((t - a) / (b - a));

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// euclidean rhythm: k hits spread over n steps, first step always a hit
export const euclid = (k, n) => Array.from({ length: n }, (_, i) => Math.floor(i * k / n) !== Math.floor((i - 1) * k / n) ? 1 : 0);
export const fold = (f, lo) => { while (f >= 2 * lo) f /= 2; while (f < lo) f *= 2; return f; };

// ───────────────────────── I. every tone is a gravity well
export const PARTIALS = 16;
export const partialOnset = (k) => 0.35 + (k - 1) * 0.23;
export function droneAmp(k, t) {
  const on = ramp(t, partialOnset(k) + 0.05, partialOnset(k) + 1.1);
  let a = on * 0.3 / Math.pow(k, 0.85);
  if (k === 7 || k === 11 || k === 13) a *= 1.35; // the far-out ones get a spotlight
  if (k > 3) a *= 1 - ramp(t, 4.6, 6.4);
  else a *= 1 - 0.55 * ramp(t, 4.6, 6.0);
  a *= 1 - ramp(t, T_COMMA_DUCK, T_COMMA_DUCK + 0.5);
  return a;
}

// ───────────────────────── II. stack the fifths until they lie
export const NOTE_NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'];
export const FIFTHS = (() => {
  const out = []; let t = 4.7, d = 0.62;
  for (let n = 0; n <= 12; n++) {
    const num = Math.pow(3, n), freq = fold(F0 * Math.pow(1.5, n), HOME);
    out.push({ n, t, freq, name: NOTE_NAMES[n], num, den: Math.round(num * HOME / freq) });
    t += d; d *= 0.93;
  }
  return out;
})();
export const COMMA_T = FIFTHS[12].t;      // ≈ 9.85 — B♯ arrives, and it isn't C
export const T_COMMA_DUCK = COMMA_T - 0.1;
export const LYDIAN_T = FIFTHS[6].t;      // the seventh fifth completes Lydian
// the comma scene: call and response, then both together, then the wobble
export const COMMA_CALLS = [
  { t: COMMA_T, who: 'B♯' },
  { t: COMMA_T + 0.55, who: 'C' },
  { t: COMMA_T + 1.0, who: 'B♯' },
  { t: COMMA_T + 1.3, who: 'both' },
];
export const WOBBLE_T = COMMA_T + 1.3;    // from here: pure 3.49 Hz disagreement
export const TEAR_T = T.III - 0.14;

// ───────────────────────── III. twelve is a rounding error
// axiom-within-an-axiom: the bar has as many steps as the octave has notes.
export const III_SEGS = (() => {
  const defs = [
    { d: 1.40, n: 12, P: 2, label: '12-EDO', meter: '12/16', warp: 1.0, sub: 'the default. a rounding error.' },
    { d: 1.30, n: 19, P: 2, label: '19-EDO', meter: '19/16', warp: 1.3, sub: 'better thirds! stranger seconds!' },
    { d: 1.20, n: 31, P: 2, label: '31-EDO', meter: '31/32', warp: 0.78, sub: 'Huygens was right and nobody listened' },
    { d: 1.10, n: 53, P: 2, label: '53-EDO', meter: '53/64', warp: 1.4, sub: 'the comma-eater' },
    { d: 0.95, n: 13, P: 3, label: '13ED3', meter: '13/16', warp: 0.72, sub: 'Bohlen–Pierce: the octave is FIRED' },
    { d: 0.55, n: 24, P: 2, label: 'π-EDO', meter: 'π/4', warp: 1, sub: 'π notes per octave. why not.', cont: true },
  ];
  let t = T.III;
  return defs.map((d, i) => { const s = { ...d, i, t0: t, t1: t + d.d }; t += d.d; return s; });
})();
export function segAt(t) { for (const s of III_SEGS) if (t < s.t1) return s; return III_SEGS[III_SEGS.length - 1]; }
const PI_N = (u) => Math.exp(lerp(Math.log(24), Math.log(Math.PI), u * u));
export function tuningAt(t) {
  const s = segAt(t);
  if (!s.cont) return s;
  const u = clamp((t - s.t0) / s.d, 0, 1);
  return { ...s, n: PI_N(u), u };
}
export function tuningLabel(tn) {
  if (!tn.cont) return tn;
  return { ...tn, label: tn.u > 0.96 ? 'π-EDO' : tn.n.toFixed(4) + '-EDO' };
}
export const stepsFor = (n, P, r) => Math.round(n * Math.log(r) / Math.log(P));
export function padChord(tn) {
  const rs = tn.P === 3 ? [1, 5 / 3, 7 / 3, 3] : [1, 5 / 4, 3 / 2, 7 / 4];
  return rs.map((r) => 128 * Math.pow(tn.P, stepsFor(tn.n, tn.P, r) / tn.n));
}
// step times inside a bar, rubato-warped (each bar breathes differently)
function stepTimes(s) {
  if (s.cont) return [0, 1, 2, 3].map((i) => s.t0 + s.d * (i / Math.PI)); // a bar of π steps: 3 and a bit
  return Array.from({ length: s.n }, (_, i) => s.t0 + s.d * Math.pow(i / s.n, s.warp));
}
export const III_EVENTS = (() => {
  const rnd = mulberry32(1729);
  const notes = [], drums = [];
  let walk = 0, prevN = 12;
  for (const s of III_SEGS) {
    const times = stepTimes(s); const N = times.length;
    const stepDur = s.d / N;
    const kick = euclid(Math.min(7, Math.max(3, Math.round(N * 0.3))), N);
    const snr = euclid(Math.min(4, Math.max(2, Math.round(N * 0.15))), N);
    const sRot = Math.floor(N / 2) + (s.i % 2 ? 1 : -1);
    const hat = euclid(Math.min(24, Math.max(5, Math.round(N * 0.6))), N);
    const mel = euclid(Math.min(28, Math.max(7, Math.round(N * 0.7))), N);
    for (let i = 0; i < N; i++) {
      const t = times[i];
      const tn = tuningAt(t + 1e-6);
      const jit = () => (rnd() - 0.5) * 0.012;
      if (kick[i]) { drums.push({ t, type: 'kick', vel: i === 0 ? 1 : 0.75 + 0.25 * rnd() }); drums.push({ t, type: 'bass', f: padChord(tn)[0] / 2, vel: 1 }); }
      const sn = snr[(i + N - sRot) % N];
      if (sn) drums.push({ t: t + jit(), type: 'snare', vel: 0.8 + 0.2 * rnd() });
      else if (rnd() < 0.09) drums.push({ t: t + jit(), type: 'snare', vel: 0.25 });
      if (hat[(i + 1) % N]) {
        const rat = rnd() < 0.16 ? 3 : 1;
        for (let r = 0; r < rat; r++) drums.push({ t: t + jit() + r * stepDur / rat, type: 'hat', vel: (0.45 + 0.55 * rnd()) * (r ? 0.7 : 1), open: rnd() < 0.08 });
      }
      // fill into the next tuning: an accelerating snare roll
      if (i >= N - Math.max(2, Math.round(N * 0.12)) && s.i < III_SEGS.length - 1) {
        for (let r = 0; r < 4; r++) drums.push({ t: t + r * stepDur / 4, type: 'snare', vel: 0.3 + 0.5 * ((i - (N - 3)) / 3) });
      }
      // melody: a random walk in the current tuning
      if (mel[i] || s.cont) {
        const n = tn.n, P = tn.P;
        if (Math.round(n) !== prevN) { walk = Math.round(walk / prevN * n); prevN = Math.round(n); }
        const fifth = Math.max(1, stepsFor(n, P, P === 3 ? 7 / 3 : 3 / 2));
        const r = rnd();
        if (r < 0.14) walk += (rnd() < 0.5 ? -fifth : fifth);
        else { const d = 1 + Math.floor(rnd() * 3); walk += rnd() < 0.55 ? d : -d; }
        const lo = -Math.floor(n * 0.5), hi = Math.ceil(n * 1.6);
        if (walk < lo) walk = lo + (lo - walk); if (walk > hi) walk = hi - (walk - hi);
        const freq = 256 * Math.pow(P, walk / n);
        notes.push({ t, freq, step: walk, n, P, seg: s.i, vel: 0.55 + 0.45 * rnd(), pan: rnd() * 2 - 1 });
        if (rnd() < 0.18) notes.push({ t: t + 0.004, freq: freq * Math.pow(P, fifth / n), step: walk + fifth, n, P, seg: s.i, vel: 0.5, pan: -0.5 + rnd() });
      }
    }
  }
  drums.sort((a, b) => a.t - b.t); notes.sort((a, b) => a.t - b.t);
  return { notes, drums };
})();
export const III_NOTES = III_EVENTS.notes;
export const III_DRUMS = III_EVENTS.drums;

// ───────────────────────── IV. rhythm is harmony, slowed down
export const RHY_K = 12;
export const IV_ACC = 7;              // seconds of accelerando
export const R_MAX = F0;              // 1 Hz → 64 Hz: 60 bpm → 3840 bpm
const LNR = Math.log(R_MAX);
export function rhyRate(t) {
  const u = (t - T.IV) / IV_ACC;
  if (u <= 0) return 1; if (u >= 1) return R_MAX;
  return Math.exp(LNR * u);
}
export function rhyPhase(t) { // cycles elapsed since T.IV (integral of rate)
  const u = (t - T.IV) / IV_ACC;
  if (u <= 0) return (t - T.IV);
  if (u >= 1) return (R_MAX - 1) * IV_ACC / LNR + R_MAX * (t - T.IV - IV_ACC);
  return (Math.exp(LNR * u) - 1) * IV_ACC / LNR;
}
export const rhyEnvelope = (t) => ramp(t, T.IV - 0.02, T.IV + 0.01) * (1 - ramp(t, T.V - 0.1, T.V + 0.35));

// ───────────────────────── V. the undertone is the overtone in a mirror
export const V_MIRROR_END = T.V + 2.2;             // otonal → utonal
export const V_CONVERGE = [T.V + 2.5, T.V + 3.2];  // → B♯, comma-sharp
export const V_WOBBLE = [T.V + 3.2, T.V + 4.1];    // the callback: 3.49 Hz again, against a C
export const V_SETTLE = [T.V + 4.1, T.V + 4.8];    // the sigh down to 1/1
export const V_CENTER = [T.V + 4.3, T.V + 5.0];    // camera: home becomes the centre of the world
export const V_WIND = [T.V + 4.8, T.V + 5.3];      // wind the sound around its own period
export const V_BLOOM = [T.V + 5.3, T.V + 7.3];     // partials arrive; the waveform becomes a spark
export const V_FADE = [T.V + 7.9, T.END - 0.15];

// THE SPARK. home (256 Hz) is the 12th harmonic of 21.33 Hz, home's 12th undertone.
// wound around one period of 21.33 Hz, a sum of these partials draws a 12-rayed sun:
// carriers 12·24·36·48 sharpen the rays; sidebands (±1..3) make their lengths organic.
export const F_UNDER = HOME / 12;
export const SPARK_R0 = 0.43, SPARK_A = 0.57;
export const SPARK_GAIN = 0.15;
export const SPARK = (() => {
  const car = [[12, 1], [24, 0.5], [36, 0.2], [48, 0.06]];
  const env = [[1, 0.2, 0.3], [2, 0.21, 1.9], [3, 0.16, 4.0]];
  const m = new Map();
  const add = (n, a, psi) => { const o = m.get(n) || { re: 0, im: 0 }; o.re += a * Math.cos(psi); o.im += a * Math.sin(psi); m.set(n, o); };
  for (const [h, c] of car) { add(h, c, 0); for (const [j, mj, ps] of env) { add(h + j, c * mj / 2, ps); add(h - j, c * mj / 2, -ps); } }
  const out = [...m.entries()].map(([n, o]) => ({ n, amp: Math.hypot(o.re, o.im), psi: Math.atan2(o.im, o.re) }));
  out.sort((x, y) => y.amp - x.amp);
  out.forEach((p, i) => { p.rank = i; p.t = V_BLOOM[0] + (i === 0 ? 0 : 0.15 + i * 0.062); p.f = p.n * F_UNDER; });
  return out;
})();
// normaliser so the final shape's rays reach exactly R0 + A
export const SPARK_NORM = (() => { let mx = 0; for (let i = 0; i < 1440; i++) { const th = TAU_ * i / 1440; let w = 0; for (const p of SPARK) w += p.amp * Math.cos(p.n * th + p.psi); mx = Math.max(mx, w); } return mx; })();
export const sparkIn = (p, t) => p.rank === 0 ? 1 : smooth(ramp(t, p.t, p.t + 0.55));
// the twelve mirror voices become the twelve strongest spark partials (voice 1 stays home: n = 12)
export const gliderOf = (k) => SPARK[k - 1];
export function mirrorFreq(k, t) {
  const oton = F0 * k, uton = F0 * 16 / k;
  const u = smooth(ramp(t, T.V + 0.05, V_MIRROR_END));
  let lf = lerp(Math.log(oton), Math.log(uton), u);
  const c = smooth(ramp(t, V_CONVERGE[0], V_CONVERGE[1]));
  const wander = Math.log(HOME * COMMA) + (k % 2 ? 1 : -1) * 0.0012 * k * (1 - ramp(t, V_CONVERGE[1] - 0.2, V_WOBBLE[0] + 0.3));
  lf = lerp(lf, wander, c);
  lf = lerp(lf, Math.log(HOME), smooth(ramp(t, V_SETTLE[0], V_SETTLE[1])));
  const p = gliderOf(k);
  lf = lerp(lf, Math.log(p.f), smooth(ramp(t, p.t - 0.25, p.t + 0.6)));
  return Math.exp(lf);
}
export function mirrorAmp(k, t) {
  const a = ramp(t, T.V - 0.25, T.V + 0.15);
  const p = gliderOf(k);
  const settle = smooth(ramp(t, V_SETTLE[0], V_SETTLE[1]));
  // twelve voices on one frequency would interfere at random; they dissolve into voice 1, which carries home
  const base = k === 1 ? lerp(0.19, 0.3, settle) : (0.19 / Math.pow(k, 0.55)) * (1 - settle);
  const b = smooth(ramp(t, p.t - 0.25, p.t + 0.6));
  return a * lerp(base, p.amp * SPARK_GAIN * 1.6, b) * (1 - ramp(t, V_FADE[0], V_FADE[1]));
}
export const sparkAmp = (p, t) => p.amp * SPARK_GAIN * 1.6 * sparkIn(p, t) * (1 - ramp(t, V_FADE[0], V_FADE[1]));
// the shape itself, for the visuals: winding j of the current sound, θ in radians
export function sparkW(th, t, j = 0) {
  let w = 0;
  for (let i = 0; i < SPARK.length; i++) {
    const p = SPARK[i];
    let n = p.n, a = p.amp * sparkIn(p, t);
    if (i < RHY_K) { const f = mirrorFreq(i + 1, t); n = f / F_UNDER; a = mirrorAmp(i + 1, t) / (SPARK_GAIN * 1.6) ; }
    if (a < 1e-4) continue;
    w += a * Math.cos(n * (th + TAU_ * j) + p.psi);
  }
  return w / SPARK_NORM;
}
// helpers for visuals
export function sectionAt(t) {
  if (t < T.II) return 0; if (t < T.III) return 1; if (t < T.IV) return 2; if (t < T.V) return 3; return 4;
}
export const AXIOMS = [
  ['I', 'every tone is a gravity well'],
  ['II', 'stack the fifths until they lie'],
  ['III', 'twelve is a rounding error'],
  ['IV', 'rhythm is harmony, slowed down'],
  ['V', 'the undertone is the overtone in a mirror'],
];

// ───────────────────────── a secret for whoever reads the spectrogram
// the heart curve, drawn by two gliding sines: x → time, y → log-frequency.
// it is mirror-symmetric, which is the whole point of axiom V.
export const HEART = { t0: T.V + 0.6, t1: T.V + 2.8, fLo: 3400, fHi: 16500 };
const heartTab = (() => {
  const up = [], lo = [];
  for (let i = 0; i <= 2000; i++) {
    const th = Math.PI * i / 2000;
    const x = 16 * Math.pow(Math.sin(th), 3);
    const y = 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th);
    (th <= Math.PI / 2 ? up : lo).push([x, y]);
  }
  lo.reverse();
  return { up, lo };
})();
function heartY(tab, ax) {
  let a = 0, b = tab.length - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (tab[m][0] <= ax) a = m; else b = m; }
  const [x0, y0] = tab[a], [x1, y1] = tab[b];
  return x1 === x0 ? y0 : y0 + (y1 - y0) * (ax - x0) / (x1 - x0);
}
export function heartFreq(which, t) {
  const x = lerp(-16, 16, clamp((t - HEART.t0) / (HEART.t1 - HEART.t0), 0, 1));
  const y = heartY(which === 'top' ? heartTab.up : heartTab.lo, Math.abs(x));
  return HEART.fLo * Math.pow(HEART.fHi / HEART.fLo, (y + 17.5) / 30);
}
export const heartAmp = (t) => 0.0045 * ramp(t, HEART.t0 - 0.02, HEART.t0 + 0.03) * (1 - ramp(t, HEART.t1 - 0.03, HEART.t1 + 0.02));
