import * as S from './score.js';

// ───────────────────────── palette
const BG = '#0e0d0b';
const CREAM = [239, 232, 218];
const ORANGE = [217, 119, 87];
const GOLD = [232, 180, 90];
const BLUE = [127, 163, 199];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const MONO = 'ui-monospace, "JetBrains Mono", "DejaVu Sans Mono", monospace';
const TAU = Math.PI * 2;
const { ramp, smooth, clamp, lerp } = S;

const cv = document.getElementById('c');
const g = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, U = 0, CX = 0, CY = 0;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  U = Math.min(W, H) * 0.44; CX = W / 2; CY = H / 2 + H * 0.01;
}
window.addEventListener('resize', resize); resize();

// grain
const grain = document.createElement('canvas'); grain.width = grain.height = 256;
{ const gg = grain.getContext('2d'); const id = gg.createImageData(256, 256); const r = S.mulberry32(7);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } gg.putImageData(id, 0, 0); }

// ───────────────────────── pitch helix: angle = pitch class, radius = register
const helixR = (f) => U * (0.06 + 0.125 * Math.log2(f / 32));
const helixA = (f) => TAU * Math.log2(f / S.F0) - Math.PI / 2;
const helix = (f) => { const r = helixR(f), a = helixA(f); return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
const polar = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];

function dot(x, y, r, col, a, glow = 3) {
  if (a <= 0.003) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r * glow);
  gr.addColorStop(0, rgba(col, a * 0.55)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * glow, 0, TAU); g.fill();
  g.fillStyle = rgba(mix(col, CREAM, 0.35), a); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function text(s, x, y, { font = MONO, size = 11, col = CREAM, a = 1, align = 'left', base = 'alphabetic', ls = 0, weight = 400, italic = false } = {}) {
  if (a <= 0.003) return;
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base;
  g.letterSpacing = ls + 'px'; g.fillStyle = rgba(col, a); g.fillText(s, x, y); g.letterSpacing = '0px';
}
const sup = (n) => String(n).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join('');
const centsOff = (ratio) => { let c = (1200 * Math.log2(ratio)) % 100; if (c > 50) c -= 100; return c; };
const fmtC = (c) => (c >= 0 ? '+' : '−') + Math.abs(c).toFixed(1) + '¢';

function drawHelixStaff(a) {
  if (a <= 0) return;
  g.strokeStyle = rgba(CREAM, 0.07 * a); g.lineWidth = 1; g.beginPath();
  for (let i = 0; i <= 600; i++) { const f = 32 * Math.pow(2, i / 600 * 7); const [x, y] = helix(f); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  // tonic ray
  g.strokeStyle = rgba(ORANGE, 0.1 * a); g.setLineDash([2, 6]); g.beginPath(); g.moveTo(CX, CY); g.lineTo(CX, CY - U * 0.98); g.stroke(); g.setLineDash([]);
  // octave tick labels along the tonic ray
  for (let o = 0; o <= 6; o++) { const f = 64 * Math.pow(2, o); if (f > 4096) break; const [x, y] = helix(f); text(f + '', x - 6, y - 3, { size: 8, a: 0.25 * a, align: 'right' }); }
}

// ───────────────────────── I. gravity well
function drawI(t) {
  const staff = ramp(t, 0.1, 1.2) * (1 - 0.7 * ramp(t, 11.2, 11.6));
  drawHelixStaff(staff);
  for (let k = 1; k <= S.PARTIALS; k++) {
    const amp = S.droneAmp(k, t); const norm = amp / (0.34 / Math.pow(k, 0.85));
    if (norm < 0.003) continue;
    const f = S.F0 * k; const [x, y] = helix(f); const on = t - S.partialOnset(k);
    const far = k === 7 || k === 11 || k === 13;
    const col = far ? GOLD : ORANGE;
    // gravity line to the tonic
    g.strokeStyle = rgba(col, 0.12 * norm); g.lineWidth = 1; g.beginPath(); g.moveTo(CX, CY); g.lineTo(x, y); g.stroke();
    // ripple at birth
    if (on > 0 && on < 1.2) { g.strokeStyle = rgba(col, 0.5 * (1 - on / 1.2)); g.beginPath(); g.arc(x, y, 4 + on * 60, 0, TAU); g.stroke(); }
    const breath = 1 + 0.15 * Math.sin(t * TAU * (0.3 + k * 0.05));
    dot(x, y, (2 + 7 / Math.sqrt(k)) * breath, col, Math.min(1, norm));
    const la = Math.min(1, norm) * (t < 5.2 ? 1 : 0.4) * ramp(on, 0.1, 0.5);
    const c = centsOff(k);
    const lbl = k + '/1' + (Math.abs(c) > 3 ? '  ' + fmtC(c) : '');
    const ang = helixA(f);
    text(lbl, x + 10 * Math.cos(ang + 0.5) + 6, y + 10 * Math.sin(ang + 0.5) + 4, { size: far ? 11 : 9, col: far ? GOLD : CREAM, a: la * (far ? 0.95 : 0.55) });
  }
  // tonic seed
  const seed = ramp(t, 0, 0.5) * (1 - ramp(t, 11.3, 11.5));
  dot(CX, CY, 2.5, CREAM, seed * 0.8, 5);
}

// ───────────────────────── II. fifths
function drawII(t) {
  if (t < S.T.II - 0.1 || t > S.TEAR_T + 0.1) return;
  const F = S.FIFTHS; const fade = 1 - ramp(t, S.TEAR_T - 0.02, S.TEAR_T + 0.08);
  // star polygon {12/7}, drawn progressively
  g.lineWidth = 1.2;
  for (let i = 1; i < F.length; i++) {
    const u = clamp((t - F[i].t) / 0.14, 0, 1); if (u <= 0) break;
    const [x0, y0] = helix(F[i - 1].freq), [x1, y1] = helix(F[i].freq);
    g.strokeStyle = rgba(i <= 6 ? ORANGE : CREAM, (i <= 6 ? 0.55 : 0.35) * fade);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(lerp(x0, x1, u), lerp(y0, y1, u)); g.stroke();
  }
  // Lydian bloom
  const ly = ramp(t, S.LYDIAN_T, S.LYDIAN_T + 0.3) * (1 - ramp(t, S.LYDIAN_T + 1.6, S.LYDIAN_T + 2.6)) * fade;
  if (ly > 0) {
    const pts = F.slice(0, 7).map((n) => ({ a: helixA(n.freq), p: helix(n.freq) })).sort((p, q) => ((p.a % TAU) + TAU) % TAU - ((q.a % TAU) + TAU) % TAU);
    g.fillStyle = rgba(ORANGE, 0.13 * ly); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p.p) : g.moveTo(...p.p))); g.closePath(); g.fill();
    g.strokeStyle = rgba(ORANGE, 0.5 * ly); g.stroke();
    text('LYDIAN', CX, CY - 8, { font: SERIF, size: 26, ls: 10, align: 'center', col: ORANGE, a: ly });
    text('the first seven fifths · maximum gravity', CX, CY + 14, { size: 10, align: 'center', a: 0.7 * ly, ls: 1 });
    text('(G. Russell, more or less)', CX, CY + 30, { size: 9, align: 'center', a: 0.4 * ly, italic: true, font: SERIF });
  }
  // dots
  for (const n of F) {
    const age = t - n.t; if (age < 0) continue;
    const [x, y] = helix(n.freq); const a = helixA(n.freq);
    const last = n.n === 12;
    let beat = 1;
    if (t > S.COMMA_T && (last || n.n === 0)) beat = 0.55 + 0.45 * Math.cos(TAU * (S.HOME * S.COMMA - S.HOME) * (t - S.COMMA_T) + (last ? 0 : Math.PI));
    const col = last ? GOLD : n.n <= 6 ? ORANGE : CREAM;
    if (age < 0.9) { g.strokeStyle = rgba(col, 0.6 * (1 - age / 0.9) * fade); g.lineWidth = 1; g.beginPath(); g.arc(x, y, 3 + age * 50, 0, TAU); g.stroke(); }
    dot(x, y, (last ? 6 : 4.2) * (0.8 + 0.4 * beat), col, fade * (0.5 + 0.5 * beat) * ramp(age, 0, 0.03));
    const la = ramp(age, 0, 0.1) * fade * (last ? 1 : Math.max(0.35, 1 - age * 0.6));
    const rr = helixR(n.freq) + 26;
    const [lx, ly2] = polar(rr, a + (last ? 0.09 : 0));
    text(n.name, lx, ly2, { font: SERIF, size: last ? 18 : 14, align: 'center', base: 'middle', col, a: la });
    if (!last) text(n.num + '/' + n.den, lx, ly2 + 13, { size: 8, align: 'center', base: 'middle', a: la * 0.5 });
  }
  // the comma
  if (t > S.COMMA_T) {
    const u = ramp(t, S.COMMA_T, S.COMMA_T + 0.4) * fade;
    const r0 = helixR(S.HOME), r1 = helixR(S.FIFTHS[12].freq);
    const a0 = helixA(S.HOME), a1 = helixA(S.FIFTHS[12].freq);
    const rr = Math.max(r0, r1) + 60;
    g.strokeStyle = rgba(GOLD, 0.9 * u); g.lineWidth = 2; g.beginPath(); g.arc(CX, CY, rr, a0, a1); g.stroke();
    g.lineWidth = 1; g.strokeStyle = rgba(GOLD, 0.35 * u); g.setLineDash([2, 3]);
    for (const [r, a] of [[r0, a0], [r1, a1]]) { g.beginPath(); g.moveTo(...polar(r, a)); g.lineTo(...polar(rr + 6, a)); g.stroke(); }
    g.setLineDash([]);
    const [tx, ty] = polar(rr + 16, (a0 + a1) / 2);
    text('+' + S.COMMA_CENTS.toFixed(2) + '¢', tx + 4, ty - 4, { font: SERIF, size: 22, col: GOLD, a: u, base: 'bottom' });
    text('B♯ ≠ C', CX, CY - 8, { font: SERIF, size: 30, ls: 4, align: 'center', col: GOLD, a: u });
    text('(3/2)' + sup(12) + ' ÷ 2' + sup(7) + ' = 531441/524288', CX, CY + 16, { size: 10, align: 'center', a: 0.75 * u });
    text('beating at ' + (S.HOME * S.COMMA - S.HOME).toFixed(2) + ' Hz', CX, CY + 32, { size: 10, align: 'center', a: 0.5 * u });
  }
}

// ───────────────────────── III. EDO wheel
function drawIII(t) {
  if (t < S.T.III - 0.05 || t > S.T.IV + 0.2) return;
  const fa = ramp(t, S.T.III - 0.05, S.T.III + 0.1) * (1 - ramp(t, S.T.IV - 0.1, S.T.IV + 0.15));
  const tn = S.tuningLabel(S.tuningAt(t)); const n = tn.n, P = tn.P;
  const beat = (t - S.T.III) / S.GRID; const inBar = beat % 8;
  const kickPulse = Math.exp(-((beat % 8) - (inBar >= 6 ? 6 : inBar >= 3 ? 3 : 0)) * 0.9);
  const R0 = U * 0.52 * (1 + 0.025 * kickPulse);
  // background pulse
  const bgp = g.createRadialGradient(CX, CY, 0, CX, CY, U * 1.3);
  bgp.addColorStop(0, rgba(ORANGE, 0.06 * kickPulse * fa)); bgp.addColorStop(1, rgba(ORANGE, 0));
  g.fillStyle = bgp; g.fillRect(0, 0, W, H);
  // ring and ticks
  g.strokeStyle = rgba(CREAM, 0.18 * fa); g.lineWidth = 1; g.beginPath(); g.arc(CX, CY, R0, 0, TAU); g.stroke();
  const cnt = Math.ceil(n - 1e-9);
  for (let i = 0; i < cnt; i++) {
    const a = TAU * i / n - Math.PI / 2; const major = i === 0;
    const len = major ? 18 : n > 40 ? 6 : 10;
    const [x0, y0] = polar(R0 - len * 0.5, a), [x1, y1] = polar(R0 + len * 0.5, a);
    g.strokeStyle = rgba(major ? ORANGE : CREAM, (major ? 0.9 : 0.5) * fa); g.lineWidth = major ? 2 : 1;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  // fractional EDO: the step that does not fit
  if (tn.cont) {
    const aLast = TAU * (cnt - 1) / n - Math.PI / 2, aEnd = TAU - Math.PI / 2;
    g.strokeStyle = rgba(GOLD, 0.8 * fa); g.lineWidth = 3; g.beginPath(); g.arc(CX, CY, R0 + 14, aLast, aEnd); g.stroke();
  }
  // 12-EDO ghost for comparison
  if (n !== 12) for (let i = 0; i < 12; i++) { const a = TAU * i / 12 - Math.PI / 2; const [x, y] = polar(R0 - 24, a); g.fillStyle = rgba(CREAM, 0.18 * fa); g.fillRect(x - 1, y - 1, 2, 2); }
  // pad chord polygon
  const pc = S.padChord(tn); g.beginPath();
  pc.forEach((f, i) => { const a = TAU * ((Math.log(f / 128) / Math.log(P)) % 1) - Math.PI / 2; const p = polar(R0 * 0.62, a); i ? g.lineTo(...p) : g.moveTo(...p); });
  g.closePath(); g.fillStyle = rgba(ORANGE, 0.08 * fa); g.fill(); g.strokeStyle = rgba(ORANGE, 0.45 * fa); g.lineWidth = 1; g.stroke();
  // notes
  for (const nt of S.III_NOTES) {
    const age = t - nt.t; if (age < 0) break; if (age > 0.6) continue;
    const pos = nt.step / nt.n; const oct = Math.floor(pos); const frac = pos - oct;
    const a = TAU * frac - Math.PI / 2; const r = R0 + (oct - 0.25) * U * 0.16;
    const e = Math.exp(-age / 0.12);
    const [x, y] = polar(r, a); const [xi, yi] = polar(R0, a);
    g.strokeStyle = rgba(ORANGE, 0.5 * e * fa); g.lineWidth = 1.5; g.beginPath(); g.moveTo(CX, CY); g.lineTo(x, y); g.stroke();
    dot(x, y, 3 + 5 * nt.vel * e, nt.P === 3 ? BLUE : ORANGE, e * fa);
    dot(xi, yi, 2, CREAM, e * fa * 0.8, 2);
  }
  // readout
  const big = Math.min(64, W * 0.06);
  text(tn.label, CX, CY + 10, { font: SERIF, size: big * 0.62, align: 'center', base: 'middle', col: tn.cont ? GOLD : CREAM, a: fa, ls: 2 });
  const stepC = 1200 * Math.log2(P) / n;
  text('1 step = ' + stepC.toFixed(2) + '¢' + (P === 3 ? '   period = 3/1' : ''), CX, CY + 10 + big * 0.55, { size: 10, align: 'center', a: 0.6 * fa });
  text(tn.sub, CX, CY + 10 + big * 0.55 + 16, { font: SERIF, italic: true, size: 12, align: 'center', a: 0.55 * fa });
}

// ───────────────────────── IV. rhythmicon
function drawIV(t) {
  if (t < S.T.IV - 0.05 || t > S.T.V + 0.6) return;
  const fa = ramp(t, S.T.IV - 0.05, S.T.IV + 0.1) * (1 - ramp(t, S.T.V - 0.05, S.T.V + 0.5));
  const ph = S.rhyPhase(t), r = S.rhyRate(t);
  // downbeat flash
  const since1 = (ph - Math.floor(ph)) / r;
  if (r < 8) { const e = Math.exp(-since1 / 0.12) * fa * (1 - r / 8); const gr = g.createRadialGradient(CX, CY, 0, CX, CY, U); gr.addColorStop(0, rgba(ORANGE, 0.12 * e)); gr.addColorStop(1, rgba(ORANGE, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  for (let k = 1; k <= S.RHY_K; k++) {
    const rk = U * (0.12 + 0.068 * k);
    const pk = k * ph; const since = (pk - Math.floor(pk)) / (k * r);
    const flash = Math.exp(-since / 0.07);
    const hz = k * r;
    const tone = smooth(Math.log2(hz / 35)); // fusion front: 35→70 Hz, pulses stop being events
    const col = mix(ORANGE, GOLD, k / 12);
    g.lineWidth = 1 + tone * 2.2;
    g.strokeStyle = rgba(CREAM, (0.08 + 0.25 * flash * (1 - tone)) * fa);
    g.beginPath(); g.arc(CX, CY, rk, 0, TAU); g.stroke();
    if (tone > 0) { g.strokeStyle = rgba(col, tone * 0.8 * fa); g.beginPath(); g.arc(CX, CY, rk, 0, TAU); g.stroke(); }
    const a = TAU * (pk % 1) - Math.PI / 2;
    const trail = Math.min(TAU, TAU * hz * 0.02);
    g.lineCap = 'round'; g.lineWidth = 2.5;
    for (let s2 = 0; s2 < 8; s2++) {
      g.strokeStyle = rgba(col, 0.9 * fa * (1 - tone * 0.7) * (1 - s2 / 8));
      g.beginPath(); g.arc(CX, CY, rk, a - trail * (s2 + 1) / 8, a - trail * s2 / 8); g.stroke();
    }
    g.lineCap = 'butt';
    const [x, y] = polar(rk, a);
    dot(x, y, 2.5 + 3 * flash * (1 - tone), col, fa * (1 - tone * 0.7));
    // pulse mark at top
    const [tx, ty] = polar(rk, -Math.PI / 2);
    dot(tx, ty, 2 + 4 * flash, CREAM, flash * fa * (1 - tone), 3);
    text(k + '', CX + 6, CY - rk + 4, { size: 8, a: 0.35 * fa * (1 - tone) });
  }
  // readout
  const bpm = r * 60;
  text(bpm < 1000 ? bpm.toFixed(0) : bpm.toFixed(0), CX, CY - 2, { font: SERIF, size: 30, align: 'center', base: 'middle', a: fa, col: r > 60 ? GOLD : CREAM });
  text(r >= 63.9 ? 'bpm = 64 Hz = the tonic' : 'bpm', CX, CY + 18, { size: 9, align: 'center', a: 0.6 * fa, ls: 2 });
}

// ───────────────────────── V. mirror
function drawV(t) {
  if (t < S.T.V - 0.3) return;
  const fa = ramp(t, S.T.V - 0.2, S.T.V + 0.3) * (1 - ramp(t, 29.2, 29.45));
  const mir = smooth(ramp(t, S.T.V + 0.05, S.V_MIRROR_END));
  drawHelixStaff(fa * 0.8);
  // the mirror: 256 Hz circle (register axis) + tonic axis (pitch-class axis)
  g.strokeStyle = rgba(BLUE, 0.3 * fa * (1 - ramp(t, 28.2, 28.8))); g.setLineDash([3, 5]); g.beginPath(); g.arc(CX, CY, helixR(S.HOME), 0, TAU); g.stroke(); g.setLineDash([]);
  g.strokeStyle = rgba(BLUE, 0.25 * fa * (1 - ramp(t, 28.2, 28.8))); g.setLineDash([4, 6]); g.beginPath(); g.moveTo(CX, CY - U * 1.02); g.lineTo(CX, CY + U * 1.02); g.stroke(); g.setLineDash([]);
  for (let k = 1; k <= S.RHY_K; k++) {
    const col = mix(ORANGE, BLUE, mir);
    // trail: sample the score backwards in time (deterministic, no history needed)
    g.beginPath();
    for (let j = 0; j <= 90; j++) { const tt = Math.max(S.T.V, t - j * 0.006); const p = helix(S.mirrorFreq(k, tt)); j ? g.lineTo(...p) : g.moveTo(...p); }
    g.strokeStyle = rgba(col, 0.45 * fa); g.lineWidth = 1.5; g.stroke();
    const f = S.mirrorFreq(k, t); const [x, y] = helix(f);
    dot(x, y, 3.5 + 3 / Math.sqrt(k), col, fa);
    const lab = mir < 0.5 ? k + '/1' : '1/' + k;
    text(lab, x + 8, y - 6, { size: 9, a: 0.6 * fa * (1 - ramp(t, 27.8, 28.1)) * Math.abs(mir - 0.5) * 2, col });
  }
  // the moment every voice crosses 1/1
  const cross = Math.exp(-Math.pow((mir - 0.5) / 0.05, 2)) * fa;
  if (cross > 0.01) { const [x, y] = helix(S.HOME); g.strokeStyle = rgba(CREAM, 0.7 * cross); g.lineWidth = 1; g.beginPath(); g.arc(x, y, 14 + (1 - cross) * 20, 0, TAU); g.stroke();
    text('all twelve cross 1/1 at once', x + 22, y + 4, { size: 10, a: cross }); }
  // captions
  const c1 = ramp(t, S.T.V + 0.1, S.T.V + 0.5) * (1 - ramp(t, 27.6, 27.9));
  text(mir < 0.5 ? 'otonal  64·k' : 'utonal  1024/k', CX, CY + U * 1.02 + 2, { size: 10, align: 'center', a: 0.55 * c1, ls: 2 });
  const conv = ramp(t, 28.0, 28.4) * (1 - ramp(t, 28.95, 29.15));
  const [hx, hy] = helix(S.HOME * S.COMMA);
  text('home, give or take ' + S.COMMA_CENTS.toFixed(2) + '¢', hx + 18, hy - 10, { font: SERIF, italic: true, size: 15, col: GOLD, a: conv });
}

// ───────────────────────── coda: the spark. twelve fifths and one comma
function drawCoda(t) {
  const a = ramp(t, 29.2, 29.45) * (1 - ramp(t, 29.85, 30.2));
  if (a <= 0) return;
  const grow = smooth(ramp(t, 29.25, 29.6));
  g.lineCap = 'round';
  for (let n = 0; n <= 12; n++) {
    const pc = n === 12 ? S.COMMA_CENTS / 1200 : (n * 7 % 12) / 12;
    const ang = TAU * pc - Math.PI / 2;
    const len = U * 0.26 * grow * (0.55 + 0.45 * (((n * 5) % 7) / 6)) * (n === 12 ? 0.62 : 1);
    const wdt = U * (n === 12 ? 0.022 : 0.038) * grow;
    g.strokeStyle = rgba(n === 12 ? GOLD : ORANGE, a); g.lineWidth = wdt;
    g.beginPath(); g.moveTo(CX, CY); g.lineTo(...polar(len, ang)); g.stroke();
  }
  g.lineCap = 'butt';
  text('1/1', CX, CY + U * 0.42, { font: SERIF, size: 26, align: 'center', a: a * ramp(t, 29.4, 29.6), ls: 6 });
  text('COMMA · a claudimation', CX, CY + U * 0.42 + 24, { size: 9, align: 'center', a: 0.5 * a * ramp(t, 29.5, 29.7), ls: 3 });
}

// ───────────────────────── chrome: axiom captions, timeline, readouts
function drawChrome(t) {
  const sec = S.sectionAt(t); const t0 = [S.T.I, S.T.II, S.T.III, S.T.IV, S.T.V][sec]; const t1 = [S.T.II, S.T.III, S.T.IV, S.T.V, 29.2][sec];
  const a = ramp(t, t0 + 0.05, t0 + 0.45) * (1 - ramp(t, t1 - 0.25, t1));
  const [num, ax] = S.AXIOMS[sec];
  const x = Math.max(28, W * 0.04), y = H - Math.max(40, H * 0.07);
  text('AXIOM', x, y - 46, { size: 9, a: 0.45 * a, ls: 4 });
  text(num, x, y - 12, { font: SERIF, size: 34, col: ORANGE, a, ls: 2 });
  text(ax, x, y + 12, { font: SERIF, italic: true, size: 17, a: 0.9 * a });
  // title
  const ta = ramp(t, 0.2, 1.2);
  text('COMMA', x, Math.max(40, H * 0.07), { font: SERIF, size: 15, ls: 8, a: 0.8 * ta * (t > 29.2 ? 1 - ramp(t, 29.2, 29.5) : 1) });
  text('a treatise in five axioms', x, Math.max(40, H * 0.07) + 16, { size: 9, a: 0.4 * ta * (t > 29.2 ? 1 - ramp(t, 29.2, 29.5) : 1), ls: 1 });
  // readout (top right)
  const rx = W - Math.max(28, W * 0.04), ry = Math.max(40, H * 0.07);
  const lines = [];
  if (sec === 0) { lines.push('f₀ = 64 Hz = 2' + sup(6)); lines.push('chosen by a computer, for a computer'); const k = clamp(Math.floor((t - 0.35) / 0.23) + 1, 1, 16); lines.push('partials: ' + k + ' / 16'); }
  if (sec === 1) { const n = S.FIFTHS.filter((f) => f.t <= t).length - 1; if (n >= 0) { const F = S.FIFTHS[n]; lines.push('(3/2)' + sup(n) + ' → ' + F.name); lines.push(F.freq.toFixed(2) + ' Hz'); lines.push('pythagorean · octave-reduced'); } }
  if (sec === 2) { const tn = S.tuningLabel(S.tuningAt(t)); lines.push(tn.label); if (tn.P === 3) { lines.push('no octaves. no fifths. 3 : 5 : 7'); lines.push('tritave-based'); } else { const d = Math.abs(1200 * Math.log2(S.padChord(tn)[2] / 128) - 701.955); lines.push('fifth error ' + d.toFixed(2) + '¢'); lines.push('octave-based'); } }
  if (sec === 3) { const r = S.rhyRate(t); lines.push('pulse ' + r.toFixed(2) + ' Hz'); lines.push('1 : 2 : 3 : … : 12'); lines.push(r < 20 ? 'you hear rhythm' : r < 45 ? 'you hear… something' : 'you hear a chord'); }
  if (sec === 4) { lines.push('overtone ↔ undertone'); lines.push('64·k  ↔  1024/k'); lines.push('axis of symmetry: 256 Hz'); }
  const ca = (sec === 4 ? 1 - ramp(t, 29.0, 29.3) : 1) * ramp(t, 0.4, 1.2);
  lines.forEach((l, i) => text(l, rx, ry + i * 15, { size: 10, align: 'right', a: (i ? 0.45 : 0.85) * ca }));
  // timeline
  const tlw = Math.min(W * 0.28, 320), tx = rx - tlw, ty = H - Math.max(40, H * 0.07) + 8;
  g.fillStyle = rgba(CREAM, 0.12); g.fillRect(tx, ty, tlw, 1);
  g.fillStyle = rgba(ORANGE, 0.8); g.fillRect(tx, ty, tlw * clamp(t / S.DUR, 0, 1), 1);
  [S.T.I, S.T.II, S.T.III, S.T.IV, S.T.V].forEach((s, i) => { const xx = tx + tlw * s / S.DUR; g.fillStyle = rgba(CREAM, 0.35); g.fillRect(xx, ty - 3, 1, 7);
    text(S.AXIOMS[i][0], xx + 3, ty - 5, { font: SERIF, size: 9, a: i === sec ? 0.9 : 0.3, col: i === sec ? ORANGE : CREAM }); });
  text(t.toFixed(2) + ' s', rx, ty + 16, { size: 9, align: 'right', a: 0.35 });
}

// ───────────────────────── glitch (the tear)
function glitch(t) {
  const u = t - S.TEAR_T; if (u < 0 || u > 0.22) return;
  const e = 1 - u / 0.22; const r = S.mulberry32(Math.floor(t * 240));
  const bw = cv.width, bh = cv.height;
  for (let i = 0; i < 14; i++) {
    const sy = Math.floor(r() * bh), sh = Math.floor((0.01 + r() * 0.08) * bh); const dx = (r() - 0.5) * 160 * DPR * e;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cv, 0, sy, bw, sh, dx, sy, bw, sh); g.restore();
  }
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * e; g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(cv, 8 * DPR * e, 0); g.restore();
  g.fillStyle = rgba(GOLD, 0.15 * e); g.fillRect(0, 0, W, H);
}

// ───────────────────────── analyser ring (live only)
let analyser = null, wave = null;
function drawScope(t) {
  if (!analyser) return;
  analyser.getFloatTimeDomainData(wave);
  const a = 0.14 * ramp(t, 0.3, 1) * (1 - ramp(t, 29.3, 29.9));
  g.strokeStyle = rgba(CREAM, a); g.lineWidth = 1; g.beginPath();
  const n = wave.length, R0 = U * 1.08;
  for (let i = 0; i <= n; i++) { const v = wave[i % n]; const ang = TAU * i / n - Math.PI / 2; const p = polar(R0 + v * U * 0.12, ang); i ? g.lineTo(...p) : g.moveTo(...p); }
  g.stroke();
}

// ───────────────────────── frame
export function drawAt(t) {
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  // vignette
  const vg = g.createRadialGradient(CX, CY, U * 0.2, CX, CY, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(40,34,28,0.35)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  drawScope(t);
  if (t < S.T.III + 0.1) drawI(t);
  drawII(t); drawIII(t); drawIV(t); drawV(t); drawCoda(t);
  drawChrome(t);
  glitch(t);
  // grain
  g.save(); g.globalAlpha = 0.045; g.globalCompositeOperation = 'overlay';
  const ox = (Math.random() * 256) | 0, oy = (Math.random() * 256) | 0;
  for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) g.drawImage(grain, x, y);
  g.restore();
}
window.drawAt = drawAt;

// ───────────────────────── playback
const params = new URLSearchParams(location.search);
const gate = document.getElementById('gate');
let ctx = null, node = null, startAt = 0, offset = +(params.get('t') || 0), playing = false, recorder = null;

async function play(record = false) {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 });
    await ctx.audioWorklet.addModule('worklet.js');
  }
  await ctx.resume();
  if (node) { node.disconnect(); node = null; }
  startAt = ctx.currentTime + 0.25;
  node = new AudioWorkletNode(ctx, 'comma', { outputChannelCount: [2], processorOptions: { autostart: true, at: startAt, offset } });
  analyser = ctx.createAnalyser(); analyser.fftSize = 1024; wave = new Float32Array(analyser.fftSize);
  node.connect(ctx.destination); node.connect(analyser);
  if (record) startRecording();
  playing = true; gate.classList.add('gone');
}
function startRecording() {
  const dest = ctx.createMediaStreamDestination(); node.connect(dest);
  const stream = new MediaStream([...cv.captureStream(60).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const chunks = []; recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 16e6 });
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = 'comma.webm'; a.click(); recorder = null; };
  recorder.start();
}
const now = () => (ctx ? ctx.currentTime - startAt + offset - (ctx.outputLatency || 0) : 0);

function loop() {
  requestAnimationFrame(loop);
  if (!playing) return;
  const t = now();
  drawAt(Math.max(0, Math.min(t, S.DUR)));
  if (t > S.DUR + 0.4 && recorder && recorder.state === 'recording') recorder.stop();
}

if (params.has('frame')) {
  gate.style.display = 'none';
  const draw = () => drawAt(+params.get('frame'));
  draw(); window.addEventListener('resize', draw);
} else {
  gate.addEventListener('click', () => play(false));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); offset = 0; play(false); }
    if (e.key === 'r' || e.key === 'R') { offset = 0; play(true); }
  });
  loop();
}
