// COMMA — a treatise in five axioms.
// Shared, deterministic score. Imported by both the AudioWorklet and the visuals,
// so what you see is computed from exactly the same numbers as what you hear.

export const F0 = 64;          // the tonic. 2^6 Hz. chosen by a computer, for a computer.
export const HOME = 256;       // 1/1 in the singing register
export const COMMA = 531441 / 524288; // (3/2)^12 / 2^19  ≈ 23.46 cents of heartbreak
export const COMMA_CENTS = 1200 * Math.log2(COMMA);
export const BEAT_HZ = HOME * COMMA - HOME; // 3.49 wobbles per second

// III: six tunings, each segment shorter than the last (≈ ×0.8), the groove getting stranger
// real time = score time / BASE_SPEED. (0.9 was the right tempo, so 0.9 is now what "1.0" means.)
export const BASE_SPEED = 0.9;
// 12-EDO: one 12/16 bar per real second (12 steps/s, 180 bpm) — and the π/4 bar is one second too.
// in between, each tuning gets ×0.78 of the time of the last.
const III_D = [3, 2.33, 1.83, 1.44, 1.17, 1.0].map((d) => d * BASE_SPEED);
const III_LEN = III_D.reduce((a, b) => a + b);
export const T = { I: 0, II: 4.5, III: 12.6, IV: 12.6 + III_LEN, V: 12.6 + III_LEN + 7.5, END: 12.6 + III_LEN + 7.5 + 8.5 + 12 / BEAT_HZ * BASE_SPEED + 0.2 }; // the fade lasts twelve comma-beats
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
// each tuning gets less time than the last; c = complexity 0 → 1 (straight → unhinged)
export const III_SEGS = (() => {
  const defs = [
    { num: 12, den: 16, bars: 3, n: 12, P: 2, label: '12-EDO', warp: 1.0, sub: 'the default. a rounding error.' },
    { num: 19, den: 16, bars: 1.5, n: 19, P: 2, label: '19-EDO', warp: 1.12, sub: 'better thirds, stranger seconds' },
    { num: 31, den: 32, bars: 1, n: 31, P: 2, label: '31-EDO', warp: 0.85, sub: 'Huygens was right and nobody listened' },
    { num: 53, den: 64, bars: 1, n: 53, P: 2, label: '53-EDO', warp: 1.3, sub: 'the comma-eater' },
    { num: 13, den: 16, bars: 1, n: 13, P: 3, label: '13ED3', warp: 0.72, sub: 'Bohlen–Pierce: the octave is fired' },
    { num: Math.PI, den: 4, bars: 1, n: 24, P: 2, label: 'π-EDO', warp: 1, sub: 'π notes per octave. why not.', cont: true, meter: 'π/4' },
  ];
  let t = T.III;
  return defs.map((d, i) => { const s = { ...d, meter: d.meter || d.num + '/' + d.den, i, c: i / (defs.length - 1), d: III_D[i], bd: III_D[i] / d.bars, t0: t, t1: t + III_D[i] }; t += III_D[i]; return s; });
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
// step times, bar by bar, rubato-warped (only once things get weird: warp fades in with c)
export const barPhase = (s, t) => { const u = clamp((t - s.t0) / s.bd, 0, s.bars); const b = Math.min(Math.floor(u), Math.ceil(s.bars) - 1); return { bar: b, u: u - b }; };
function stepTimes(s) {
  const out = [], w = lerp(1, s.warp, s.c);
  for (let b = 0; b < s.bars; b++) {
    const b0 = s.t0 + b * s.bd;
    if (s.cont) { for (let i = 0; i < 4; i++) out.push({ t: b0 + s.bd * (i / Math.PI), i, N: 4, bar: b }); continue; } // π steps: 3 and a bit
    const N = s.bars - b < 1 ? Math.round(s.n * (s.bars - b)) : s.n; // a half bar is a half bar
    for (let i = 0; i < N; i++) out.push({ t: b0 + s.bd * Math.pow(i / s.n, w), i, N: s.n, bar: b, last: b >= s.bars - 1 && i >= N - Math.max(2, Math.round(s.n * 0.12)) });
  }
  return out;
}
export const III_EVENTS = (() => {
  const rnd = mulberry32(1729);
  const notes = [], drums = [];
  let walk = 0, prevN = 12;
  for (const s of III_SEGS) {
    const steps = stepTimes(s), c = s.c;
    const N = s.cont ? 4 : s.n, stepDur = s.bd / N;
    // 12: a straight groove. from there, Euclid takes over and the rules loosen
    const straight = s.i === 0;
    const kick = straight ? [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0] : euclid(Math.min(7, Math.max(3, Math.round(N * 0.3))), N);
    const snr = straight ? [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0] : euclid(Math.min(4, Math.max(2, Math.round(N * 0.15))), N);
    const sRot = straight ? 0 : Math.floor(N / 2) + (s.i % 2 ? 1 : -1);
    const hat = straight ? Array(12).fill(1) : euclid(Math.min(24, Math.max(5, Math.round(N * lerp(0.75, 0.6, c)))), N);
    const mel = straight ? [1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1] : euclid(Math.min(28, Math.max(7, Math.round(N * 0.7))), N);
    if (s.cont) { // an accelerating, swelling snare roll pulls into IV
      for (let j = 0; j < 18; j++) drums.push({ t: s.t0 + s.d * Math.sqrt(j / 18), type: 'snare', vel: 0.22 + 0.6 * (j / 17) ** 1.5 });
    }
    for (const st of steps) {
      const { t, i } = st;
      const tn = tuningAt(t + 1e-6);
      const jit = () => (rnd() - 0.5) * 0.014 * c;
      if (kick[i]) { drums.push({ t, type: 'kick', vel: i === 0 ? 1 : 0.8 + 0.2 * rnd() * c }); drums.push({ t, type: 'bass', f: padChord(tn)[0] / 2, vel: 1 }); }
      if (!straight && c > 0.5 && rnd() < 0.1 * c) drums.push({ t: t + stepDur * 0.5, type: 'kick', vel: 0.55 }); // off-grid kick
      const sn = snr[(i + N - sRot) % N];
      if (sn) drums.push({ t: t + jit(), type: 'snare', vel: 0.8 + 0.2 * rnd() });
      else if (rnd() < 0.12 * c) drums.push({ t: t + jit(), type: 'snare', vel: 0.25 });
      if (hat[(i + (straight ? 0 : 1)) % N]) {
        const rat = rnd() < 0.2 * c ? (c > 0.7 && rnd() < 0.5 ? 4 : 3) : 1;
        const accent = straight ? (i % 3 === 0 ? 0.9 : 0.5) : 0.45 + 0.55 * rnd();
        for (let r = 0; r < rat; r++) drums.push({ t: t + jit() + r * stepDur / rat, type: 'hat', vel: accent * (r ? 0.7 : 1), open: straight ? i === 11 : rnd() < 0.1 * c + 0.02 });
      }
      // fill into the next tuning: an accelerating snare roll
      if (st.last && s.i < III_SEGS.length - 1) {
        const rr = straight ? 2 : 4;
        for (let r = 0; r < rr; r++) drums.push({ t: t + r * stepDur / rr, type: 'snare', vel: 0.3 + 0.4 * rnd() });
      }
      // melody: a random walk in the current tuning
      if (s.cont) {
        // π-EDO: step = 1200/π = 382¢. steps 0,1,2,3 climb to 1146¢, 54¢ under the octave: a leading tone.
        // step π (the octave) doesn't fit in the bar. it lands on the downbeat of IV.
        notes.push({ t, freq: 256 * Math.pow(2, i / Math.PI), step: i, n: Math.PI, P: 2, seg: s.i, vel: 0.6 + 0.13 * i, pan: (i - 1.5) * 0.3 });
      } else if (mel[i % mel.length]) {
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
export const V_CLEAN = [T.V + 7.8, T.V + 8.6];      // the layers melt into one flat orange shape
export const V_FADE = [T.V + 8.5, T.V + 8.5 + 12 / BEAT_HZ * BASE_SPEED]; // 12 wobbles of the comma: 3.44 s
export const vFade = (t) => Math.pow(1 - ramp(t, V_FADE[0], V_FADE[1]), 1.7); // closer to an even fade in dB

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
  return a * lerp(base, p.amp * SPARK_GAIN * 1.6, b) * vFade(t);
}
export const sparkAmp = (p, t) => p.amp * SPARK_GAIN * 1.6 * sparkIn(p, t) * vFade(t);
// the shape itself, for the visuals: winding j of the current sound, θ in radians
export function sparkW(th, t, j = 0) {
  let w = 0;
  for (let i = 0; i < SPARK.length; i++) {
    const p = SPARK[i];
    let n = p.n, a = sparkAmp(p, t) / (SPARK_GAIN * 1.6);
    if (i < RHY_K) { const f = mirrorFreq(i + 1, t); n = f / F_UNDER; a = mirrorAmp(i + 1, t) / (SPARK_GAIN * 1.6) ; }
    if (a < 1e-4) continue;
    w += a * Math.cos(n * (th + TAU_ * j) + p.psi);
  }
  return w / SPARK_NORM / Math.max(1e-3, vFade(t)); // the picture doesn't fade with the sound
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
