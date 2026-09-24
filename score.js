// COMMA — a treatise in five axioms.
// Shared, deterministic score. Imported by both the AudioWorklet and the visuals,
// so what you see is computed from exactly the same numbers as what you hear.

export const F0 = 64;          // the tonic. 2^6 Hz. chosen by a computer, for a computer.
export const HOME = 256;       // 1/1 in the singing register
export const DUR = 30;
export const COMMA = 531441 / 524288; // (3/2)^12 / 2^7  ≈ 23.46 cents of heartbreak
export const COMMA_CENTS = 1200 * Math.log2(COMMA);

export const T = { I: 0, II: 4.5, III: 11.5, IV: 18, V: 25.5, END: 30 };

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

// ───────────────────────── I. every tone is a gravity well
export const PARTIALS = 16;
export const partialOnset = (k) => 0.35 + (k - 1) * 0.23;
export function droneAmp(k, t) {
  const on = ramp(t, partialOnset(k), partialOnset(k) + 0.9);
  let a = on * 0.34 / Math.pow(k, 0.85);
  if (k === 7 || k === 11 || k === 13) a *= 1.35; // the far-out ones get a spotlight
  // after axiom I: upper partials leave, the low ones hum under the fifths
  if (k > 3) a *= 1 - ramp(t, 4.6, 6.4);
  else a *= 1 - 0.55 * ramp(t, 4.6, 6.0);
  a *= 1 - ramp(t, 11.25, 11.5);
  return a;
}

// ───────────────────────── II. stack the fifths until they lie
export const NOTE_NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'];
export function fold(f, lo) { while (f >= 2 * lo) f /= 2; while (f < lo) f *= 2; return f; }
export const FIFTHS = (() => {
  const out = []; let t = 4.7, d = 0.62;
  for (let n = 0; n <= 12; n++) {
    const num = Math.pow(3, n), raw = F0 * Math.pow(1.5, n);
    const freq = fold(raw, HOME);
    const den = Math.round(num * HOME / freq); // ratio to 1/1 is num/den, den a power of two
    out.push({ n, t, freq, name: NOTE_NAMES[n], num, den });
    t += d; d *= 0.93;
  }
  return out;
})();
export const COMMA_T = FIFTHS[12].t;     // ≈ 9.85 — B♯ arrives, and it isn't C
export const LYDIAN_T = FIFTHS[6].t;     // the seventh fifth completes Lydian
export const TEAR_T = 11.38;

// ───────────────────────── III. twelve is a rounding error
export const GRID = 0.1;       // 16ths at 150 bpm
export const III_STEPS = 64;
// tuning of step i of the grid: { n, period, label }
const TUN = [
  { n: 12, P: 2, label: '12-EDO', sub: 'the default. a rounding error.' },
  { n: 19, P: 2, label: '19-EDO', sub: 'better thirds, stranger seconds' },
  { n: 31, P: 2, label: '31-EDO', sub: 'Huygens was right and nobody listened' },
  { n: 53, P: 2, label: '53-EDO', sub: 'Mercator’s comma-eater' },
  { n: 13, P: 3, label: '13ED3', sub: 'Bohlen–Pierce: the octave is fired' },
];
// numeric tuning at time t (hot path: no allocation for fixed segments)
export function tuningAt(t) {
  const s = (t - T.III) / GRID;
  if (s < 12) return TUN[0]; if (s < 24) return TUN[1]; if (s < 36) return TUN[2]; if (s < 48) return TUN[3]; if (s < 56) return TUN[4];
  const u = clamp((s - 56) / 8, 0, 1);
  return { n: Math.exp(lerp(Math.log(24), Math.log(Math.PI), u * u)), P: 2, cont: true, u };
}
export function tuningLabel(tn) {
  if (!tn.cont) return tn;
  return { ...tn, label: tn.n.toFixed(5) + '-EDO', sub: tn.u > 0.97 ? 'π-EDO. irrational. unrepentant.' : 'n need not be an integer' };
}
export const stepsFor = (n, P, r) => Math.round(n * Math.log(r) / Math.log(P));
export function padChord(tn) {
  const rs = tn.P === 3 ? [1, 5 / 3, 7 / 3, 3] : [1, 5 / 4, 3 / 2, 7 / 4];
  return rs.map((r) => 128 * Math.pow(tn.P, stepsFor(tn.n, tn.P, r) / tn.n));
}
export const III_NOTES = (() => {
  const rnd = mulberry32(1729);
  const out = []; let s = 0; let prevN = 12;
  for (let i = 0; i < III_STEPS * 2; i++) {
    const t = T.III + i * GRID / 2;
    const tn = tuningAt(t + 1e-6);
    // carry the walk across tunings by proportion of the period
    if (tn.n !== prevN) { s = Math.round(s / prevN * tn.n); prevN = tn.n; }
    const n = tn.n;
    const fifth = Math.max(1, stepsFor(n, tn.P, tn.P === 3 ? 7 / 3 : 3 / 2));
    const r = rnd();
    if (r < 0.14) s += (rnd() < 0.5 ? -fifth : fifth);
    else { const d = 1 + Math.floor(rnd() * 3); s += rnd() < 0.55 ? d : -d; }
    const lo = -Math.floor(n * 0.5), hi = Math.ceil(n * 1.6);
    if (s < lo) s = lo + (lo - s); if (s > hi) s = hi - (s - hi);
    const density = 0.55 + 0.4 * (i / (III_STEPS * 2));
    if (i % 2 === 0 || rnd() < density) {
      const freq = 256 * Math.pow(tn.P, s / n);
      out.push({ t, freq, step: s, n, P: tn.P, vel: 0.55 + 0.45 * rnd(), pan: rnd() * 2 - 1 });
    }
  }
  return out;
})();
const E38 = [1, 0, 0, 1, 0, 0, 1, 0];
export const III_DRUMS = (() => {
  const out = [];
  for (let i = 0; i < III_STEPS; i++) {
    const t = T.III + i * GRID;
    if (E38[i % 8]) out.push({ t, type: 'kick' });
    if (i % 8 === 4) out.push({ t, type: 'clap' });
    out.push({ t, type: 'hat', vel: i % 2 ? 0.45 : 0.8 });
    if (i >= 56) { out.push({ t: t + GRID / 3, type: 'hat', vel: 0.5 }); out.push({ t: t + 2 * GRID / 3, type: 'hat', vel: 0.6 }); }
  }
  return out;
})();

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
export const V_MIRROR_END = 27.7;
export const V_CONVERGE = [27.9, 28.6];
export const V_SETTLE = [28.75, 29.3];
export function mirrorFreq(k, t) {
  const oton = F0 * k, uton = F0 * 16 / k;
  const u = smooth(ramp(t, T.V + 0.05, V_MIRROR_END));
  let lf = lerp(Math.log(oton), Math.log(uton), u);
  const c = smooth(ramp(t, V_CONVERGE[0], V_CONVERGE[1]));
  const wander = Math.log(HOME * COMMA) + (k % 2 ? 1 : -1) * 0.0015 * k * (1 - ramp(t, V_CONVERGE[1], V_SETTLE[0]));
  lf = lerp(lf, wander, c);
  const s = smooth(ramp(t, V_SETTLE[0], V_SETTLE[1]));
  lf = lerp(lf, Math.log(HOME), s);
  return Math.exp(lf);
}
export function mirrorAmp(k, t) {
  const a = ramp(t, T.V - 0.25, T.V + 0.15) * (1 - 0.6 * ramp(t, 29.1, 29.4)) * (1 - ramp(t, 29.3, 29.95));
  return a * 0.2 / Math.pow(k, 0.55);
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
export const HEART = { t0: 26.25, t1: 28.45, fLo: 3400, fHi: 16500 };
const heartTab = (() => {
  const up = [], lo = [];
  for (let i = 0; i <= 2000; i++) {
    const th = Math.PI * i / 2000;
    const x = 16 * Math.pow(Math.sin(th), 3);
    const y = 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th);
    (th <= Math.PI / 2 ? up : lo).push([x, y]);
  }
  lo.reverse(); // both branches now ascend in x (0 → 16)
  return { up, lo };
})();
function heartY(tab, ax) { // ax in [0,16]
  let a = 0, b = tab.length - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (tab[m][0] <= ax) a = m; else b = m; }
  const [x0, y0] = tab[a], [x1, y1] = tab[b];
  return x1 === x0 ? y0 : y0 + (y1 - y0) * (ax - x0) / (x1 - x0);
}
export function heartFreq(which, t) {
  const x = lerp(-16, 16, clamp((t - HEART.t0) / (HEART.t1 - HEART.t0), 0, 1));
  const y = heartY(which === 'top' ? heartTab.up : heartTab.lo, Math.abs(x));
  const u = (y + 17.5) / 30;
  return HEART.fLo * Math.pow(HEART.fHi / HEART.fLo, u);
}
export const heartAmp = (t) => 0.0045 * ramp(t, HEART.t0 - 0.02, HEART.t0 + 0.03) * (1 - ramp(t, HEART.t1 - 0.03, HEART.t1 + 0.02));
