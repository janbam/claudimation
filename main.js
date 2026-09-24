import * as S from './score.js';

// ───────────────────────── colour: every pitch class has a hue (Scriabin was right, probably). C is Claude.
const TAU = Math.PI * 2;
const { ramp, smooth, clamp, lerp } = S;
function hsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const pcOf = (f) => ((Math.log2(f / S.F0) % 1) + 1) % 1;
const hueOf = (f) => 15 + 360 * pcOf(f);
const pcol = (f, s = 0.92, l = 0.64) => hsl(hueOf(f), s, l);
const CLAUDE = [217, 119, 87], CREAM = [248, 240, 228], GOLD = [255, 200, 90], INK = [10, 8, 20];
const MAGENTA = [255, 70, 170], CYAN = [70, 225, 255];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "JetBrains Mono", "DejaVu Sans Mono", monospace';
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const noise1 = (x) => { const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };

const cv = document.getElementById('c');
const g = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, U = 0, CX = 0, CY = 0;
const params = new URLSearchParams(location.search);
let SPEED = (+(params.get('speed') || 1)) * S.BASE_SPEED; // tempo factor (user 1.0 = 0.9 internally). pitches never change
const beatPh = (t, t0) => TAU * S.BEAT_HZ * (t - t0) / SPEED; // 3.49 Hz is a real frequency difference
const rhyPh = (t) => S.rhyPhase(t) / SPEED; // pulse rates are real Hz (64 Hz = the tonic)
let FIXED = null; // render mode: exact output size, ss = supersampling
function resize() {
  // render mode lays out at a logical height of 1080 and scales: 720p, 1080p and 4K all look the same
  const k = FIXED ? FIXED.h / 1080 : 1;
  DPR = FIXED ? k * FIXED.ss : Math.min(2, window.devicePixelRatio || 1);
  W = FIXED ? FIXED.w / k : window.innerWidth; H = FIXED ? 1080 : window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  U = Math.min(W, H) * 0.44; CX = W / 2; CY = H / 2;
}
window.addEventListener('resize', resize); resize();

// ───────────────────────── pitch helix (world space): angle = pitch class, radius = register
const helixR = (f) => U * (0.06 + 0.125 * Math.log2(f / 32));
const helixA = (f) => TAU * Math.log2(f / S.F0) - Math.PI / 2;
const helix = (f) => { const r = helixR(f), a = helixA(f); return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
const polar = (r, a, cx = CX, cy = CY) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

// ───────────────────────── primitives
function glow(x, y, r, col, a) {
  if (a <= 0.003) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function dot(x, y, r, col, a, halo = 4) {
  if (a <= 0.003) return;
  const op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter';
  glow(x, y, r * halo, col, a * 0.6);
  g.globalCompositeOperation = op;
  g.fillStyle = rgba(mix(col, [255, 255, 255], 0.45), a); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function text(s, x, y, o = {}) {
  const { font = MONO, size = 11, col = CREAM, a = 1, align = 'left', base = 'alphabetic', ls = 0, weight = 400, italic = false, shadow = 0 } = o;
  if (a <= 0.003) return;
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base;
  g.letterSpacing = ls + 'px';
  if (shadow) { g.shadowColor = rgba(col, a * 0.8); g.shadowBlur = shadow; }
  g.fillStyle = rgba(col, a); g.fillText(s, x, y);
  g.shadowBlur = 0; g.letterSpacing = '0px';
}
// caption: plain text that eases in and out. (was a sticker; stickers were too cartoonish)
function sticker(s, x, y, age, life, o = {}) {
  if (age < 0 || age > life) return;
  const { bg = GOLD, size = 15, weight = 600, pulse = 0 } = o;
  const a = smooth(age / 0.18) * (1 - ramp(age, life - 0.3, life));
  const dy = 6 * (1 - smooth(age / 0.3));
  g.save(); g.translate(x, y + dy); if (pulse) g.scale(1 + pulse, 1 + pulse);
  text(s, 0, 0, { font: SANS, size, align: 'center', base: 'middle', col: bg, a, weight, ls: 0.5, shadow: 12 });
  g.restore();
}
// deterministic particles: a burst is a pure function of (origin, birth time, seed)
function burst(x, y, age, n, col, seed, speed = 160, life = 0.9, size = 2.2) {
  if (age < 0 || age > life) return;
  const op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter';
  const k = 4.5, d = (1 - Math.exp(-age * k)) / k;
  for (let i = 0; i < n; i++) {
    const a = TAU * hash(seed * 13.1 + i * 7.7), v = speed * (0.35 + hash(seed * 3.3 + i * 1.9));
    const px = x + Math.cos(a) * v * d, py = y + Math.sin(a) * v * d + 40 * age * age;
    const al = (1 - age / life) * (0.5 + 0.5 * hash(i + seed));
    g.fillStyle = rgba(Array.isArray(col[0]) ? col[i % col.length] : col, al); g.beginPath(); g.arc(px, py, size * (1 - age / life * 0.6), 0, TAU); g.fill();
  }
  g.globalCompositeOperation = op;
}
function rainbowHelix(a, f0 = 32, f1 = 4096, lw = 1.2) {
  if (a <= 0) return;
  g.lineWidth = lw;
  const N = 420, o0 = Math.log2(f0 / 32), o1 = Math.log2(f1 / 32);
  let [px, py] = helix(f0);
  for (let i = 1; i <= N; i++) {
    const f = 32 * Math.pow(2, lerp(o0, o1, i / N)); const [x, y] = helix(f);
    g.strokeStyle = rgba(pcol(f, 0.8, 0.6), a); g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    px = x; py = y;
  }
}

// ───────────────────────── rhythm helpers for the visuals
let KICKS = [];
function initKicks() {
  KICKS = S.III_DRUMS.filter((d) => d.type === 'kick').map((d) => d.t); // rhythmicon downbeats while still slow enough to be beats
  for (let c = 0; ; c++) { let lo = S.T.IV, hi = S.T.V; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (rhyPh(m) < c) lo = m; else hi = m; } if (S.rhyRate(hi) > 4.5 || hi >= S.T.V - 0.01) break; KICKS.push(hi); }
  KICKS.push(S.T.V); KICKS.sort((a, b) => a - b);
}
initKicks();
const SNARES = S.III_DRUMS.filter((d) => d.type === 'snare' && d.vel > 0.5).map((d) => d.t);
function lastBefore(arr, t) { let r = -1e9; for (const x of arr) { if (x <= t) r = x; else break; } return r; }
const kickEnv = (t) => Math.exp(-(t - lastBefore(KICKS, t)) / 0.09);
const snareEnv = (t) => Math.exp(-(t - lastBefore(SNARES, t)) / 0.07);

// ───────────────────────── camera
function camera(t) {
  let fx = CX, fy = CY, zoom = 1, rot = 0, shake = 0;
  // II: zoom into the comma
  const [cxC, cyC] = helix(S.HOME), [cxB, cyB] = helix(S.FIFTHS[12].freq);
  const cz = smooth(ramp(t, S.COMMA_T + 0.05, S.COMMA_T + 0.7)) * (1 - smooth(ramp(t, S.TEAR_T - 0.05, S.TEAR_T + 0.12)));
  fx = lerp(fx, (cxC + cxB) / 2, cz); fy = lerp(fy, (cyC + cyB) / 2 + U * 0.05, cz); zoom *= lerp(1, 2.6, cz);
  if (t > S.WOBBLE_T && t < S.TEAR_T) { const w = ramp(t, S.WOBBLE_T, S.WOBBLE_T + 0.3); rot += 0.012 * w * Math.sin(beatPh(t, S.WOBBLE_T)); zoom *= 1 + 0.02 * w * Math.cos(beatPh(t, S.WOBBLE_T)); }
  // III/IV: kicks punch
  const ke = kickEnv(t);
  if (t > S.T.III && t < S.T.V + 1) { zoom *= 1 + 0.035 * ke; shake += 5 * ke; }
  if (t > S.T.III && t < S.T.IV) shake += 2.5 * snareEnv(t);
  // III → IV: the landing
  if (t > S.T.IV) { const e = Math.exp(-(t - S.T.IV) / 0.18); shake += 14 * e; zoom *= 1 + 0.05 * e; }
  // IV: lean in towards the drop
  const lean = ramp(t, S.T.V - 1.8, S.T.V) * (1 - ramp(t, S.T.V, S.T.V + 0.4));
  zoom *= 1 + 0.12 * lean; rot += 0.06 * lean;
  // V: impact
  if (t > S.T.V) shake += 22 * Math.exp(-(t - S.T.V) / 0.25);
  // V: frame the spark (it grows out of the helix centre) with room for the title below
  const e = smooth(ramp(t, S.V_WIND[0], S.V_BLOOM[0] + 1.2));
  fy = lerp(fy, CY + H * 0.065, e); zoom *= lerp(1, 0.86, e);
  const sx = shake * noise1(t * 38), sy = shake * noise1(t * 41 + 9);
  return { fx, fy, zoom, rot, sx, sy };
}
function applyCam(c) { g.translate(CX + c.sx, CY + c.sy); g.scale(c.zoom, c.zoom); g.rotate(c.rot); g.translate(-c.fx, -c.fy); }

// ───────────────────────── backgrounds
function background(t) {
  g.fillStyle = rgba(INK, 1); g.fillRect(0, 0, W, H);
  const sec = S.sectionAt(t);
  const hues = [265, 195, 320, 285, 220];
  let hue = hues[sec], lum = 0.16, amt = 0.55;
  if (sec === 2) { const tn = S.tuningAt(t); hue = 320 + tn.i * 47; amt = 0.45 + 0.5 * kickEnv(t); }
  if (sec === 3) { amt = 0.4 + 0.5 * ramp(t, S.T.IV + 3, S.T.V); hue = lerp(285, 330, ramp(t, S.T.IV, S.T.V)); }
  if (t > S.V_SETTLE[0]) { hue = lerp(220, 18, ramp(t, S.V_SETTLE[0], S.V_BLOOM[0])); }
  if (t > S.V_FADE[0]) amt *= 0.2 + 0.8 * S.vFade(t); // the room goes dark with the logo
  const gr = g.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
  gr.addColorStop(0, rgba(hsl(hue, 0.7, lum), amt)); gr.addColorStop(1, rgba(INK, 0));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // the comma: the whole room wobbles at 3.49 Hz
  if (t > S.WOBBLE_T && t < S.TEAR_T) {
    const w = ramp(t, S.WOBBLE_T, S.WOBBLE_T + 0.3) * (0.5 + 0.5 * Math.cos(beatPh(t, S.WOBBLE_T)));
    g.fillStyle = rgba(GOLD, 0.08 * w); g.fillRect(0, 0, W, H);
  }
  // III: kick strobe in the colour of the last note
  if (sec === 2) {
    const n = S.III_NOTES.filter((x) => x.t <= t).at(-1);
    if (n) { g.fillStyle = rgba(pcol(n.freq, 1, 0.5), 0.16 * kickEnv(t)); g.fillRect(0, 0, W, H); }
  }
  if (t > S.T.IV && t < S.T.IV + 0.5) { g.fillStyle = rgba(CLAUDE, 0.35 * Math.exp(-(t - S.T.IV) / 0.1)); g.fillRect(0, 0, W, H); }
  // IV → V: the drop
  const imp = t - S.T.V;
  if (imp > 0 && imp < 0.6) { g.fillStyle = rgba([255, 255, 255], 0.85 * Math.exp(-imp / 0.12)); g.fillRect(0, 0, W, H); }
}

// ───────────────────────── I. every tone is a gravity well
function drawI(t) {
  const staff = ramp(t, 0.1, 1.4) * (1 - ramp(t, S.T_COMMA_DUCK, S.T_COMMA_DUCK + 0.4) * 0.8);
  rainbowHelix(0.16 * staff);
  for (let k = 1; k <= S.PARTIALS; k++) {
    const on = t - S.partialOnset(k);
    const amp = S.droneAmp(k, t), norm = Math.min(1.2, amp / (0.3 / Math.pow(k, 0.85)));
    const vis = Math.max(norm, on > 0 && on < 1.2 ? 1 - on / 1.2 : 0);
    if (vis < 0.003 || on < 0) continue;
    const f = S.F0 * k, [x, y] = helix(f), col = pcol(f);
    const far = k === 7 || k === 11 || k === 13;
    const lg = g.createLinearGradient(CX, CY, x, y); lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(1, rgba(col, 0.35 * vis));
    g.strokeStyle = lg; g.lineWidth = 1.5; g.beginPath(); g.moveTo(CX, CY); g.lineTo(x, y); g.stroke();
    if (on < 1) { g.strokeStyle = rgba(col, 0.8 * (1 - on)); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 4 + on * 70, 0, TAU); g.stroke(); }
    burst(x, y, on, 14, col, k, 120, 0.8, 2);
    const pulse = 1 + 0.5 * Math.exp(-on / 0.15) + 0.12 * Math.sin(t * TAU * (0.3 + k * 0.05));
    dot(x, y, (2.5 + 7 / Math.sqrt(k)) * pulse, col, Math.min(1, vis));
    const la = Math.min(1, vis) * (t < 5 ? 1 : 0.35) * ramp(on, 0.05, 0.3);
    let c = (1200 * Math.log2(k)) % 100; if (c > 50) c -= 100;
    const ang = helixA(f);
    text(k + '/1', x + 12 * Math.cos(ang + 0.6) + 5, y + 12 * Math.sin(ang + 0.6) + 4, { size: far ? 13 : 10, col: far ? col : CREAM, a: la * (far ? 1 : 0.6), weight: far ? 700 : 400 });
    if (far) sticker((c >= 0 ? '+' : '−') + Math.abs(c).toFixed(1) + '¢', x + 12 * Math.cos(ang + 0.6) + 34, y + 12 * Math.sin(ang + 0.6) + 20, on, 1.6, { bg: col, size: 11 });
  }
  const seed = ramp(t, 0, 0.5) * (1 - ramp(t, S.T_COMMA_DUCK, S.T_COMMA_DUCK + 0.4));
  dot(CX, CY, 3, CREAM, seed * 0.9, 6);
}

// ───────────────────────── II. stack the fifths until they lie
function drawII(t) {
  if (t < S.T.II - 0.1 || t > S.TEAR_T + 0.1) return;
  const F = S.FIFTHS; const fade = 1 - ramp(t, S.TEAR_T - 0.02, S.TEAR_T + 0.08);
  const dim = 1 - 0.75 * ramp(t, S.T_COMMA_DUCK, S.T_COMMA_DUCK + 0.4);
  g.lineWidth = 2;
  for (let i = 1; i < F.length; i++) {
    const u = clamp((t - F[i].t) / 0.14, 0, 1); if (u <= 0) break;
    const [x0, y0] = helix(F[i - 1].freq), [x1, y1] = helix(F[i].freq);
    const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, rgba(pcol(F[i - 1].freq), 0.85 * fade * dim)); lg.addColorStop(1, rgba(pcol(F[i].freq), 0.85 * fade * dim));
    g.strokeStyle = lg; g.beginPath(); g.moveTo(x0, y0); g.lineTo(lerp(x0, x1, u), lerp(y0, y1, u)); g.stroke();
  }
  // Lydian!
  const ly = ramp(t, S.LYDIAN_T, S.LYDIAN_T + 0.2) * (1 - ramp(t, S.LYDIAN_T + 1.4, S.LYDIAN_T + 2.2)) * fade;
  if (ly > 0) {
    const pts = F.slice(0, 7).map((n) => ({ a: ((helixA(n.freq) % TAU) + TAU) % TAU, p: helix(n.freq), f: n.freq })).sort((p, q) => p.a - q.a);
    const cg = g.createConicGradient(-Math.PI / 2, CX, CY);
    for (let i = 0; i <= 12; i++) cg.addColorStop(i / 12, rgba(hsl(15 + 30 * i, 0.9, 0.6), 0.28 * ly));
    g.fillStyle = cg; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p.p) : g.moveTo(...p.p))); g.closePath(); g.fill();
  }
  for (const n of F) {
    const age = t - n.t; if (age < 0) continue;
    const [x, y] = helix(n.freq), a = helixA(n.freq), last = n.n === 12, col = last ? GOLD : pcol(n.freq);
    const hot = last || n.n === 0;
    const al = fade * (hot ? 1 : dim);
    if (age < 1) { g.strokeStyle = rgba(col, 0.8 * (1 - age) * al); g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 4 + age * 80, 0, TAU); g.stroke(); }
    burst(x, y, age, 22, col, 100 + n.n, 200, 1.0, 2.4);
    let beat = 1;
    if (t > S.WOBBLE_T && hot) beat = 0.5 + 0.5 * Math.cos(beatPh(t, S.WOBBLE_T) + (last ? 0 : Math.PI));
    const hit = Math.exp(-age / 0.12);
    dot(x, y, (last ? 6 : 4.5) * (0.75 + 0.5 * beat + 0.6 * hit), col, al * (0.45 + 0.55 * beat));
    const rr = helixR(n.freq) + 28, [lx, ly2] = polar(rr, a + (last ? 0.1 : n.n === 0 ? -0.1 : 0));
    text(n.name, lx, ly2, { font: SERIF, size: hot ? 20 : 16, align: 'center', base: 'middle', col, a: ramp(age, 0, 0.08) * al, weight: 700 });
    if (!hot) text(n.num + '/' + n.den, lx, ly2 + 15, { size: 9, align: 'center', base: 'middle', a: 0.55 * ramp(age, 0, 0.1) * al });
  }
}
// screen-space overlays for II
function drawIIOverlay(t) {
  if (t < S.T.II || t > S.TEAR_T + 0.05) return;
  sticker('Lydian', CX, CY - U * 0.05, t - S.LYDIAN_T, 1.6, { bg: hsl(200, 0.9, 0.7), size: 30, weight: 700 });
  sticker('the first seven fifths = maximum gravity', CX, CY + U * 0.09, t - S.LYDIAN_T - 0.12, 1.5, { bg: CREAM, size: 12, weight: 400 });
  if (t > S.WOBBLE_T) {
    const u = ramp(t, S.WOBBLE_T, S.WOBBLE_T + 0.25), ph = beatPh(t, S.WOBBLE_T);
    const wob = 0.5 + 0.5 * Math.cos(ph);
    // interference panel: C and B♯, and what happens when you add them
    const y0 = H * 0.76, amp = H * 0.045, x0 = W * 0.08, x1 = W * 0.92;
    const car = 46, scroll = (t - S.WOBBLE_T) * 0.35;
    const waves = [[CLAUDE, (x) => Math.sin(TAU * car * x), -amp * 1.3], [GOLD, (x) => Math.sin(TAU * car * S.COMMA * x + 0.4), amp * 1.3],
      [CREAM, null, amp * 4.2]];
    waves.forEach(([col, fn, off], wi) => {
      g.beginPath();
      for (let i = 0; i <= 500; i++) { const xx = i / 500; let v;
        if (wi < 2) v = fn(xx); else { const env = Math.cos(Math.PI * S.BEAT_HZ * (xx * 1.4 + scroll)); v = Math.sin(TAU * car * xx) * env * 1.6; }
        const px = lerp(x0, x1, xx), py = y0 + off + v * amp * (wi === 2 ? 1.1 : 0.55); i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.strokeStyle = rgba(col, u * (wi === 2 ? 0.95 : 0.7)); g.lineWidth = wi === 2 ? 2.2 : 1.4; g.stroke();
    });
    text('C  256.00 Hz', x0, y0 - amp * 1.3 - amp * 0.9, { size: 11, col: CLAUDE, a: u, weight: 700 });
    text('B♯ 259.49 Hz', x0, y0 + amp * 1.3 - amp * 0.9, { size: 11, col: GOLD, a: u, weight: 700 });
    text('C + B♯ =', x0, y0 + amp * 4.2 - amp * 1.9, { size: 11, col: CREAM, a: u, weight: 700 });
    // the headline
    const s = 1 + 0.06 * wob;
    g.save(); g.translate(CX, H * 0.16); g.scale(s, s);
    text('B♯ ≠ C', 0, 0, { font: SERIF, size: Math.min(88, W * 0.08), align: 'center', base: 'middle', col: mix(GOLD, CREAM, wob), a: u, weight: 700, shadow: 30 * wob });
    g.restore();
    text('(3/2)¹² ÷ 2⁷ = 531441/524288 = +23.46¢', CX, H * 0.16 + Math.min(60, W * 0.055), { size: 13, align: 'center', a: 0.85 * u });
    sticker('wob · wob · wob — ' + S.BEAT_HZ.toFixed(2) + ' per second', CX, CY + U * 0.27, t - S.WOBBLE_T - 0.35, 3, { bg: mix(MAGENTA, CREAM, 0.25), size: 16, pulse: 0.04 * wob });
  }
}

// ───────────────────────── III. twelve is a rounding error (the wheel is also the clock)
function drawIII(t) {
  if (t < S.T.III - 0.05 || t > S.T.IV + 0.2) return;
  const fa = ramp(t, S.T.III - 0.05, S.T.III + 0.1) * (1 - ramp(t, S.T.IV - 0.1, S.T.IV + 0.1));
  const tn = S.tuningLabel(S.tuningAt(t)); const seg = S.segAt(t); const n = tn.n, P = tn.P;
  const R0 = U * 0.62, ke = kickEnv(t), se = snareEnv(t);
  const col0 = hsl(320 + seg.i * 47, 0.95, 0.62);
  // conic rainbow halo: each step of the tuning in its own colour
  const cnt = Math.ceil(n - 1e-9);
  for (let i = 0; i < cnt; i++) {
    const a = TAU * i / n - Math.PI / 2, f = 128 * Math.pow(P, i / n), col = pcol(f);
    const len = i === 0 ? 26 : n > 40 ? 10 : 16;
    const [x0, y0] = polar(R0 - len * 0.5, a), [x1, y1] = polar(R0 + len * 0.5 + 8 * ke, a);
    g.strokeStyle = rgba(col, fa * (i === 0 ? 1 : 0.75)); g.lineWidth = i === 0 ? 4 : n > 40 ? 2 : 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.lineCap = 'butt';
  }
  if (tn.cont) { const aL = TAU * (cnt - 1) / n - Math.PI / 2; g.strokeStyle = rgba(GOLD, 0.9 * fa); g.lineWidth = 5; g.beginPath(); g.arc(CX, CY, R0 + 22, aL, TAU - Math.PI / 2); g.stroke();
    text('← the step that doesn’t fit', ...polar(R0 + 40, (aL + TAU - Math.PI / 2) / 2), { size: 11, col: GOLD, a: fa }); }
  // playhead: the bar is the octave
  const u = S.barPhase(seg, t).u, up = seg.cont ? u : Math.pow(u, 1 / lerp(1, seg.warp, seg.c));
  const ah = TAU * up - Math.PI / 2;
  const hg = g.createLinearGradient(CX, CY, ...polar(R0, ah)); hg.addColorStop(0, rgba(col0, 0)); hg.addColorStop(1, rgba(col0, 0.9 * fa));
  g.strokeStyle = hg; g.lineWidth = 3; g.beginPath(); g.moveTo(CX, CY); g.lineTo(...polar(R0 + 30, ah)); g.stroke();
  g.strokeStyle = rgba(CREAM, (0.2 + 0.6 * se) * fa); g.lineWidth = 1 + 3 * se; g.beginPath(); g.arc(CX, CY, R0 * (1.18 + 0.05 * se), 0, TAU); g.stroke();
  // notes as rays of colour
  for (const nt of S.III_NOTES) {
    const age = t - nt.t; if (age < 0) break; if (age > 0.7) continue;
    const pos = nt.step / nt.n, oct = Math.floor(pos), frac = pos - oct;
    const a = TAU * frac - Math.PI / 2, r = R0 + (oct - 0.2) * U * 0.14, e = Math.exp(-age / 0.13), col = pcol(nt.freq);
    const [x, y] = polar(r, a);
    g.strokeStyle = rgba(col, 0.7 * e * fa); g.lineWidth = 2; g.beginPath(); g.moveTo(...polar(R0 * 0.3, a)); g.lineTo(x, y); g.stroke();
    dot(x, y, 3 + 5 * nt.vel * e, col, e * fa);
    burst(x, y, age, 8, col, nt.t * 100, 110, 0.5, 1.8);
  }
  // hats: sparkles on the rim
  for (const d of S.III_DRUMS) { if (d.type !== 'hat') continue; const age = t - d.t; if (age < 0) break; if (age > 0.12) continue;
    const a = TAU * hash(d.t * 97); dot(...polar(R0 * 1.18, a), 1.5, CREAM, (1 - age / 0.12) * fa * d.vel, 3); }
}
function drawIIIOverlay(t) {
  if (t < S.T.III || t > S.T.IV) return;
  const fa = ramp(t, S.T.III, S.T.III + 0.1) * (1 - ramp(t, S.T.IV - 0.1, S.T.IV));
  const tn = S.tuningLabel(S.tuningAt(t)), seg = S.segAt(t), age = t - seg.t0;
  const col0 = hsl(320 + seg.i * 47, 0.95, 0.65), ke = kickEnv(t);
  const pop = 1 + 0.25 * Math.exp(-age / 0.08) + 0.05 * ke;
  g.save(); g.translate(CX, CY - 8); g.scale(pop, pop);
  text(tn.label, 0, 0, { font: SERIF, size: Math.min(58, W * 0.05), align: 'center', base: 'middle', col: tn.cont ? GOLD : CREAM, a: fa, weight: 700, shadow: 18 });
  text('in ' + seg.meter + ' time', 0, Math.min(44, W * 0.04), { font: SANS, size: 15, align: 'center', base: 'middle', col: col0, a: fa, weight: 800, ls: 1 });
  g.restore();
  const stepC = 1200 * Math.log2(tn.P) / tn.n;
  text('1 step = ' + stepC.toFixed(2) + '¢', CX, CY + Math.min(80, W * 0.07), { size: 11, align: 'center', a: 0.7 * fa });
  sticker(seg.sub, CX, CY + U * 1.02, age - 0.1, seg.d - 0.05, { bg: col0, size: 15 });
  if (seg.i === 1) sticker('the bar has as many steps as the octave has notes', CX, H * 0.08, age - 0.05, seg.d, { bg: CREAM, size: 14, weight: 400 });
}

// ───────────────────────── IV. rhythm is harmony, slowed down
function drawIV(t) {
  if (t < S.T.IV - 0.05 || t > S.T.V + 0.5) return;
  const fa = ramp(t, S.T.IV - 0.05, S.T.IV + 0.1) * (1 - ramp(t, S.T.V, S.T.V + 0.25));
  const ph = rhyPh(t), r = S.rhyRate(t);
  const since1 = (ph - Math.floor(ph)) / r;
  if (r < 8) { const e = Math.exp(-since1 / 0.12) * fa * (1 - r / 8); glow(CX, CY, U * 1.2, MAGENTA, 0.25 * e); }
  g.lineCap = 'round';
  for (let k = 1; k <= S.RHY_K; k++) {
    const rk = U * (0.14 + 0.07 * k), col = pcol(S.F0 * k);
    const pk = k * ph, since = (pk - Math.floor(pk)) / (k * r), flash = Math.exp(-since / 0.07);
    const hz = k * r, tone = smooth(Math.log2(hz / 35));
    g.lineWidth = 1 + tone * 3.5;
    g.strokeStyle = rgba(col, (0.12 + 0.35 * flash * (1 - tone) + 0.75 * tone) * fa);
    g.beginPath(); g.arc(CX, CY, rk, 0, TAU); g.stroke();
    if (tone > 0.05) { g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = rgba(col, 0.25 * tone * fa); g.lineWidth = 10 * tone; g.beginPath(); g.arc(CX, CY, rk, 0, TAU); g.stroke(); g.restore(); }
    const a = TAU * (pk % 1) - Math.PI / 2, trail = Math.min(TAU, TAU * hz * 0.02);
    for (let s2 = 0; s2 < 8; s2++) { g.strokeStyle = rgba(col, 0.95 * fa * (1 - tone * 0.7) * (1 - s2 / 8)); g.lineWidth = 3.5;
      g.beginPath(); g.arc(CX, CY, rk, a - trail * (s2 + 1) / 8, a - trail * s2 / 8); g.stroke(); }
    const [x, y] = polar(rk, a);
    dot(x, y, 3 + 3 * flash * (1 - tone), col, fa * (1 - tone * 0.7));
    if (r < 12) burst(...polar(rk, -Math.PI / 2), since, 6, col, k * 1000 + Math.floor(pk), 90, 0.4, 1.8);
    const [tx, ty] = polar(rk, -Math.PI / 2); dot(tx, ty, 2 + 5 * flash, [255, 255, 255], flash * fa * (1 - tone), 3);
  }
  g.lineCap = 'butt';
}
function drawIVOverlay(t) {
  if (t < S.T.IV || t > S.T.V) return;
  const fa = ramp(t, S.T.IV, S.T.IV + 0.1) * (1 - ramp(t, S.T.V - 0.05, S.T.V));
  const r = S.rhyRate(t), bpm = r * 60;
  const beat = Math.exp(-((rhyPh(t) % 1) / r) / 0.1) * (r < 8 ? 1 : 0);
  g.save(); g.translate(CX, CY); const sc = 1 + 0.15 * beat; g.scale(sc, sc);
  text(bpm.toFixed(0), 0, -4, { font: SERIF, size: Math.min(46, W * 0.04) * (1 + 0.35 * ramp(t, S.T.V - 2.5, S.T.V)), align: 'center', base: 'middle', a: fa, col: mix(CREAM, GOLD, ramp(t, S.T.V - 3, S.T.V)), weight: 700, shadow: 20 });
  text('BPM', 0, 26, { font: SANS, size: 11, align: 'center', a: 0.7 * fa, ls: 4, weight: 800 });
  g.restore();
  text('partial k pulses k times per cycle · 1 : 2 : 3 : … : 12', CX, H * 0.07, { size: 12, align: 'center', a: 0.7 * fa * ramp(t, S.T.IV + 1.45, S.T.IV + 1.8) });
  sticker('3840 bpm = 64 Hz = the tonic', CX, H * 0.18, t - S.T.V + 0.75, 0.75, { bg: mix(MAGENTA, CREAM, 0.3), size: 18 });
}

// ───────────────────────── V. the mirror, the comma again, and the spark
// the ending isn't a new object: the pitch helix itself gets wound into the waveform.
// the helix angle already *is* a phase: x = 2π·(octave − 3) counts periods of 21.33 Hz, so every
// point slides radially from its pitch radius to the waveform's value at that phase (a Klangzylinder).
// the home octave (256–512 Hz) becomes the outline, the other octaves become the echo windings.
const morphAmt = (t) => smooth(ramp(t, S.V_WIND[0] - 0.4, S.V_BLOOM[0] + 1.0));
const lockAmt = (t) => smooth(ramp(t, S.V_BLOOM[1] - 0.6, S.V_BLOOM[1] + 0.8));
function sparkGeom(t) {
  const Ssz = U * 0.95;
  return { R0: 0.47 * Ssz * lerp(0.5, 1, smooth(ramp(t, S.V_WIND[0], S.V_BLOOM[0] + 0.8))), A: 0.44 * Ssz, gap: lerp(10, 3, lockAmt(t)) };
}
function morphR(oct, t, m, G, echo = true) {
  const rh = U * (0.06 + 0.125 * oct); if (m <= 0) return rh;
  const rs = G.R0 + G.A * S.sparkW(TAU * (oct - 3), t, 0) + (echo ? (oct - 3.5) * G.gap : 0);
  return lerp(rh, Math.max(1, rs), m);
}
function mpos(f, t, m, G) { const oct = Math.log2(f / 32), r = morphR(oct, t, m, G), a = helixA(f); return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; }
function windingHelix(t, alpha, m, G) {
  if (alpha <= 0.003) return;
  const N = 840; g.lineWidth = lerp(1.2, 1.6, m); g.lineCap = 'round';
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const oct = 7 * i / N, f = 32 * Math.pow(2, oct), r = morphR(oct, t, m, G), a = helixA(f);
    const p = [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    if (prev) { const d = Math.abs(oct - 3.5) / 3.5; g.strokeStyle = rgba(pcol(f, 0.85, 0.62), alpha * (1 - 0.6 * m * d)); g.beginPath(); g.moveTo(...prev); g.lineTo(...p); g.stroke(); }
    prev = p;
  }
  g.lineCap = 'butt';
}
function drawV(t) {
  if (t < S.T.V - 0.3) return;
  const m = morphAmt(t), G = sparkGeom(t), end = S.vFade(t), clean = ramp(t, S.V_CLEAN[0], S.V_CLEAN[1]);
  const fa = ramp(t, S.T.V - 0.1, S.T.V + 0.2);
  const fm = fa * (1 - ramp(t, S.V_WIND[0] - 0.2, S.V_WIND[1])); // mirror furniture yields to the winding
  const mir = smooth(ramp(t, S.T.V + 0.05, S.V_MIRROR_END));
  if (fm > 0) {
    g.strokeStyle = rgba(CREAM, 0.35 * fm * (1 - ramp(t, S.V_CONVERGE[0], S.V_CONVERGE[1]))); g.setLineDash([4, 6]); g.lineWidth = 1.2;
    g.beginPath(); g.arc(CX, CY, helixR(S.HOME), 0, TAU); g.stroke(); g.beginPath(); g.moveTo(CX, CY - U * 1.05); g.lineTo(CX, CY + U * 1.05); g.stroke(); g.setLineDash([]);
    const ia = t - S.T.V; if (ia > 0 && ia < 1.2) { burst(CX, CY, ia, 90, [MAGENTA, CYAN, GOLD, CLAUDE, [150, 255, 120]], 777, 700, 1.2, 3); g.strokeStyle = rgba(CREAM, 1 - ia / 1.2); g.lineWidth = 4 * (1 - ia / 1.2); g.beginPath(); g.arc(CX, CY, ia * U * 1.6, 0, TAU); g.stroke(); }
  }
  // the helix: present all along, now becoming the thing itself
  windingHelix(t, fa * lerp(0.22, 0.8, m) * (1 - clean), m, G);
  drawSparkBody(t, m, G, end, clean);
  // C reference during the wobble
  const cref = ramp(t, S.V_CONVERGE[1] - 0.3, S.V_WOBBLE[0]) * (1 - ramp(t, S.V_SETTLE[0], S.V_SETTLE[1]));
  if (cref > 0) { const [x, y] = helix(S.HOME); dot(x, y, 6, CLAUDE, cref * fa); }
  // the voices ride the helix while it winds; they fade as their partials lock
  const fv = fa * (1 - ramp(t, S.V_BLOOM[1] - 0.3, S.V_BLOOM[1] + 0.5));
  if (fv <= 0.003) return;
  for (let k = 1; k <= S.RHY_K; k++) {
    const amp = S.mirrorAmp(k, t); const vis = k === 1 ? 1 : Math.min(1, amp / 0.05 + 0.05);
    g.lineWidth = 2.2; g.lineCap = 'round';
    let prev = null;
    for (let j = 0; j <= 40; j++) { const tt = Math.max(S.T.V, t - j * 0.011); const f = S.mirrorFreq(k, tt); const p = mpos(f, t, m, G);
      if (prev) { g.strokeStyle = rgba(pcol(f), 0.7 * fv * vis * (1 - j / 40)); g.beginPath(); g.moveTo(...prev); g.lineTo(...p); g.stroke(); } prev = p; }
    g.lineCap = 'butt';
    const f = S.mirrorFreq(k, t); const [x, y] = mpos(f, t, m, G);
    let beat = 1; if (t > S.V_WOBBLE[0] && t < S.V_SETTLE[1]) beat = 0.55 + 0.45 * Math.cos(beatPh(t, S.V_WOBBLE[0]));
    dot(x, y, (3.5 + 3 / Math.sqrt(k)) * (0.8 + 0.3 * beat) * (1 - 0.4 * m), pcol(f), fv * vis * beat);
    const lab = mir < 0.5 ? k + '/1' : '1/' + k;
    text(lab, x + 9, y - 7, { size: 10, a: 0.75 * fm * (1 - ramp(t, S.V_MIRROR_END + 0.2, S.V_MIRROR_END + 0.5)) * Math.abs(mir - 0.5) * 2, col: pcol(f), weight: 700 });
  }
}
// the body of the spark: the home winding, filled; a core grows out of the helix centre
function drawSparkBody(t, m, G, end, clean) {
  const a = smooth(ramp(m, 0.45, 1)) * end; if (a <= 0.003) return;
  const N = 540, pts = [];
  for (let i = 0; i <= N; i++) { const oct = 3 + i / N, r = morphR(oct, t, m, G, false), ang = TAU * (i / N) - Math.PI / 2; pts.push([CX + r * Math.cos(ang), CY + r * Math.sin(ang)]); }
  const breath = 1 + 0.025 * Math.sin((t - S.V_BLOOM[1]) * 2.2) * ramp(t, S.V_BLOOM[1], S.V_BLOOM[1] + 0.5);
  g.save(); g.translate(CX, CY); g.scale(breath, breath); g.translate(-CX, -CY);
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath();
  const rg = g.createRadialGradient(CX, CY, 0, CX, CY, G.R0 + G.A);
  rg.addColorStop(0, rgba(mix([240, 150, 110], CLAUDE, clean), a)); rg.addColorStop(0.5, rgba(CLAUDE, a)); rg.addColorStop(1, rgba(mix([200, 95, 65], CLAUDE, clean), a));
  g.shadowColor = rgba(CLAUDE, 0.8 * a * (1 - 0.5 * clean)); g.shadowBlur = 40; g.fillStyle = rg; g.fill(); g.shadowBlur = 0;
  g.strokeStyle = rgba([255, 190, 150], 0.6 * a * (1 - clean)); g.lineWidth = 1.5; g.stroke();
  // the core: a round window with the helix inside it, turning slowly
  const ca = smooth(ramp(m, 0.6, 1)) * (1 - clean); // the core and its helix melt into the flat orange
  const cr = Math.max(4, (G.R0 - G.A * 0.3) * 0.82) * smooth(ramp(m, 0.6, 1));
  if (cr > 4 && ca > 0.003) {
    const cg = g.createRadialGradient(CX, CY - cr * 0.3, 0, CX, CY, cr);
    cg.addColorStop(0, rgba([255, 214, 180], a * ca)); cg.addColorStop(1, rgba([232, 128, 92], a * ca));
    g.fillStyle = cg; g.beginPath(); g.arc(CX, CY, cr, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(CX, CY, cr * 0.92, 0, TAU); g.clip();
    const rot = (t - S.V_WIND[0]) * 0.5; g.lineWidth = 1.6; let prev = null;
    for (let i = 0; i <= 220; i++) { const u = i / 220, ang = TAU * 3.2 * u + rot, rr = cr * 0.9 * u, p = [CX + rr * Math.cos(ang), CY + rr * Math.sin(ang)];
      if (prev) { g.strokeStyle = rgba(hsl(15 + 360 * 3.2 * u, 0.85, 0.42), a * 0.85 * ca); g.beginPath(); g.moveTo(...prev); g.lineTo(...p); g.stroke(); } prev = p; }
    g.restore();
  }
  g.restore();
}
function drawVOverlay(t) {
  if (t < S.T.V) return;
  const mir = smooth(ramp(t, S.T.V + 0.05, S.V_MIRROR_END));
  const cross = Math.exp(-Math.pow((mir - 0.5) / 0.08, 2)) * (t < S.V_MIRROR_END ? 1 : 0);
  if (cross > 0.02) { g.globalAlpha = Math.min(1, cross * 1.5); sticker('all twelve cross 1/1 at the same instant', CX + U * 0.55, CY - U * 0.62, 0.3, 1, { bg: CYAN, size: 16 }); g.globalAlpha = 1; }
  sticker(mir < 0.5 ? 'OVERTONES  64·k' : 'UNDERTONES  1024/k', W * 0.82, H * 0.86, t - S.T.V - 0.3, 1.9, { bg: mir < 0.5 ? CLAUDE : hsl(215, 0.85, 0.7), size: 14, weight: 700 });
  sticker('home, give or take 23.46¢', CX, H * 0.14, t - S.V_CONVERGE[1] + 0.2, S.V_SETTLE[0] - S.V_CONVERGE[1] + 0.4, { bg: GOLD, size: 22 });
  sticker('…fine. 1/1.', CX, H * 0.9, t - S.V_SETTLE[0] - 0.2, 0.8, { bg: CREAM, size: 22 });
  const a = ramp(t, S.V_WIND[0] + 0.1, S.V_WIND[0] + 0.5) * (1 - ramp(t, S.V_BLOOM[0] + 1.2, S.V_BLOOM[0] + 1.6));
  text('1/1 is the 12th harmonic of 21.33 Hz', CX, H * 0.07, { font: SERIF, italic: true, size: 20, align: 'center', a });
}
// COMMA, once more — and now it has colours
function endTitle(t) {
  const a0 = S.V_BLOOM[1] - 0.3; if (t < a0) return;
  const out = S.vFade(t);
  const size = Math.min(54, W * 0.045), y = H * 0.885;
  g.font = `700 ${size}px ${SERIF}`;
  const gap = size * 0.55, ws = [...'COMMA'].map((c) => g.measureText(c).width), tw = ws.reduce((a, b) => a + b) + gap * 4;
  let x = CX - tw / 2;
  [...'COMMA'].forEach((ch, i) => {
    const d = t - a0 - i * 0.09, a = smooth(d / 0.5) * out;
    text(ch, x + ws[i] / 2, y + 10 * (1 - smooth(d / 0.6)), { font: SERIF, size, align: 'center', base: 'middle', col: hsl(15 + i * 72, 0.95, 0.66), a, weight: 700, shadow: 24 });
    x += ws[i] + gap;
  });
}

// ───────────────────────── chrome: axiom slams, readouts
function axiomTitle(t) {
  const sec = S.sectionAt(t); if (t > S.V_SETTLE[0]) return;
  const t0 = [0.9, S.T.II, S.T.III, S.T.IV, S.T.V][sec];
  const t1 = [S.T.II, S.COMMA_T - 0.2, S.T.IV, S.T.V, S.V_SETTLE[0]][sec];
  const age = t - t0; if (age < 0 || t > t1) return;
  const col = [hsl(265, 0.9, 0.7), hsl(195, 0.9, 0.62), hsl(320, 0.95, 0.66), hsl(285, 0.9, 0.7), hsl(220, 0.9, 0.7)][sec];
  const [num, ax] = S.AXIOMS[sec];
  // slam big near the top, then settle into the corner
  const m = smooth(ramp(age, 1.0, 1.45));
  const x = lerp(CX, Math.max(28, W * 0.035), m), y = lerp(H * 0.13, H - Math.max(46, H * 0.08), m);
  const size = lerp(Math.min(64, W * 0.055), 30, m);
  const pop = age < 0.18 ? 1 + 0.6 * (1 - age / 0.18) : 1;
  const a = Math.min(1, age / 0.06) * (1 - ramp(t, t1 - 0.25, t1));
  g.save(); g.translate(x, y); g.scale(pop, pop);
  const al = m > 0.5 ? 'left' : 'center';
  text('AXIOM ' + num, 0, -size * 0.75, { font: SANS, size: size * 0.32, align: al, col, a, ls: 5, weight: 800 });
  text(ax, 0, size * 0.1, { font: SERIF, italic: true, size: size * 0.62, align: al, a, col: CREAM, shadow: m < 0.5 ? 20 : 0 });
  g.restore();
}
// the title, before anything sounds. tt = real seconds relative to the downbeat (negative = before)
function drawTitle(tt) {
  if (tt > 0.3 || TITLE_PRE <= 0) return;
  const a = ramp(tt, -TITLE_PRE + 0.15, -TITLE_PRE + 1.0) * (1 - ramp(tt, -0.75, 0.15));
  if (a <= 0.003) return;
  const life = tt + TITLE_PRE, size = Math.min(110, W * 0.09), y = CY - size * 0.25;
  const ls = size * (0.32 + 0.04 * life); // the letters drift apart, slowly: 23.46¢ at a time
  text('COMMA', CX + ls / 2, y, { font: SERIF, size, align: 'center', base: 'middle', col: CREAM, a, weight: 400, ls });
  text('a treatise in five axioms', CX, y + size * 0.78, { font: SERIF, italic: true, size: Math.max(16, size * 0.2), align: 'center', a: a * ramp(life, 0.5, 1.2) * 0.9, col: CREAM });
  const cy = y + size * 0.78 + Math.max(34, size * 0.4), cs = Math.max(11, size * 0.11);
  text('a claudimation by Opus 5.5', CX, cy, { font: MONO, size: cs, align: 'center', a: a * ramp(life, 0.9, 1.6) * 0.55, col: CREAM, ls: 3 });
  text('with janbam the human', CX, cy + cs * 1.9, { font: MONO, size: cs, align: 'center', a: a * ramp(life, 1.1, 1.8) * 0.55, col: CREAM, ls: 3 });
}
function chrome(t) {
  const x = Math.max(28, W * 0.035), y = Math.max(34, H * 0.06);
  const hide = 1 - ramp(t, S.V_WIND[0], S.V_WIND[1]);
  const tt = ramp(t, 1.6, 2.2) * hide;
  const word = 'COMMA'; let xx = x;
  g.font = `700 16px ${SERIF}`;
  for (let i = 0; i < word.length; i++) { text(word[i], xx, y, { font: SERIF, size: 16, col: hsl(15 + i * 72, 0.9, 0.66), a: tt, weight: 700 }); xx += g.measureText(word[i]).width + 6; }
  // readouts
  const rx = W - x; const sec = S.sectionAt(t); const L = [];
  if (sec === 0) { L.push('f₀ = 64 Hz = 2⁶'); L.push('chosen by a computer, for a computer'); L.push('partials: ' + clamp(Math.floor((t - 0.35) / 0.23) + 1, 1, 16) + ' / 16'); }
  if (sec === 1) { const n = S.FIFTHS.filter((f) => f.t <= t).length - 1; if (n >= 0) { const F = S.FIFTHS[n]; L.push('(3/2)^' + n + ' → ' + F.name); L.push(F.freq.toFixed(2) + ' Hz'); L.push('pythagorean · octave-reduced'); } }
  if (sec === 2) { const tn = S.tuningLabel(S.tuningAt(t)); L.push(tn.label + ' · ' + tn.meter); if (tn.P === 3) L.push('no octaves. no fifths. 3 : 5 : 7'); else L.push('fifth error ' + Math.abs(1200 * Math.log2(S.padChord(tn)[2] / 128) - 701.955).toFixed(2) + '¢'); }
  if (sec === 3) { L.push('pulse ' + S.rhyRate(t).toFixed(2) + ' Hz'); L.push('1 : 2 : 3 : … : 12'); }
  if (sec === 4 && t < S.V_WIND[0]) { L.push('overtone ↔ undertone'); L.push('64·k  ↔  1024/k'); L.push('mirror axis: 256 Hz'); }
  L.forEach((l, i) => text(l, rx, y + i * 16 - 4, { size: 11, align: 'right', a: (i ? 0.55 : 0.9) * ramp(t, 0.6, 1.2) }));
}

// ───────────────────────── glitch (the tear)
function glitch(t) {
  const u = t - S.TEAR_T; if (u < 0 || u > 0.22) return;
  const e = 1 - u / 0.22, r = S.mulberry32(Math.floor(t * 240)), bw = cv.width, bh = cv.height;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 16; i++) { const sy = Math.floor(r() * bh), sh = Math.floor((0.01 + r() * 0.08) * bh), dx = (r() - 0.5) * 200 * DPR * e; g.drawImage(cv, 0, sy, bw, sh, dx, sy, bw, sh); }
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * e; g.drawImage(cv, 10 * DPR * e, 0); g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over'; g.fillStyle = rgba(MAGENTA, 0.2 * e); g.fillRect(0, 0, bw, bh);
  g.restore();
}

// ───────────────────────── oscilloscope ring (live analyser, or the offline mixdown when rendering)
let analyser = null, wave = new Float32Array(1024), scopeBuf = null, scopeSR = 48000, CUR_TR = 0;
function scope(t) {
  if (t > S.V_WIND[0] || t <= 0) return;
  if (analyser) analyser.getFloatTimeDomainData(wave);
  else if (scopeBuf) { const i0 = Math.max(0, Math.floor(CUR_TR * scopeSR) - wave.length); for (let i = 0; i < wave.length; i++) wave[i] = scopeBuf[i0 + i] || 0; }
  else return;
  const a = 0.22 * ramp(t, 0.3, 1);
  const n = wave.length, R0 = U * 1.1;
  g.lineWidth = 1.2;
  for (let i = 0; i < n; i += 2) { const ang = TAU * i / n - Math.PI / 2, ang2 = TAU * (i + 2) / n - Math.PI / 2;
    g.strokeStyle = rgba(hsl(15 + 360 * i / n + t * 60, 0.9, 0.65), a); g.beginPath(); g.moveTo(...polar(R0 + wave[i] * U * 0.15, ang)); g.lineTo(...polar(R0 + wave[(i + 2) % n] * U * 0.15, ang2)); g.stroke(); }
}

// ───────────────────────── frame. t = score time, tt = real seconds relative to the downbeat (for the title)
export function drawAt(t, tt = t) {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.globalCompositeOperation = 'source-over';
  background(t);
  const cam = camera(t);
  g.save(); applyCam(cam);
  scope(t);
  if (t < S.T.III + 0.1) drawI(t);
  drawII(t); drawIII(t); drawIV(t); drawV(t);
  g.restore();
  g.save(); g.translate(cam.sx * 0.3, cam.sy * 0.3);
  axiomTitle(t);
  drawIIOverlay(t); drawIIIOverlay(t); drawIVOverlay(t); drawVOverlay(t);
  g.restore();
  g.globalAlpha = ramp(tt, -0.2, 0.6); chrome(t); g.globalAlpha = 1; // no furniture during the title
  endTitle(t);
  glitch(t);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const vg = g.createRadialGradient(CX, CY, Math.min(W, H) * 0.35, CX, CY, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  drawTitle(tt);
}
window.drawAt = drawAt;

// ───────────────────────── the clock: real time tr → title for PRE s → score time t = offset + (tr − PRE)·SPEED
const PRE = +(params.get('pre') ?? 3.6);
let OFFSET = +(params.get('t') || 0), TITLE_PRE = PRE;
const preFor = (off) => (off > 0 ? 0 : PRE);
const totalReal = (off = 0) => preFor(off) + (S.DUR + 0.6 - off) / SPEED;
function frameAt(tr, off = OFFSET) {
  const pre = preFor(off); TITLE_PRE = pre; CUR_TR = tr;
  const tt = tr - pre, t = off + tt * SPEED;
  drawAt(clamp(t, 0, S.VIS_END), tt); // after VIS_END the picture stands still; only the room is still ringing
  return t;
}
window.frameAt = frameAt;
function setSpeed(v) { SPEED = clamp(+v || 1, 0.25, 4) * S.BASE_SPEED; initKicks(); }

// ───────────────────────── live playback
const gate = document.getElementById('gate');
let ctx = null, node = null, t0 = 0, playing = false, recorder = null;
async function play(record = false) {
  if (!ctx) { ctx = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 }); await ctx.audioWorklet.addModule('worklet.js'); }
  await ctx.resume();
  if (node) { node.port.postMessage({ type: 'stop' }); node.disconnect(); node = null; } // kill the old processor for real
  t0 = ctx.currentTime + 0.25;
  node = new AudioWorkletNode(ctx, 'comma', { outputChannelCount: [2], processorOptions: { autostart: true, at: t0 + preFor(OFFSET), offset: OFFSET, speed: SPEED } });
  if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; wave = new Float32Array(analyser.fftSize); }
  node.connect(ctx.destination); node.connect(analyser);
  if (record) startRecording();
  playing = true; gate.classList.add('gone');
}
function stop() {
  if (node) { node.port.postMessage({ type: 'stop' }); node.disconnect(); node = null; }
  playing = false; gate.classList.remove('gone');
}
function startRecording() {
  const dest = ctx.createMediaStreamDestination(); node.connect(dest);
  const stream = new MediaStream([...cv.captureStream(60).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const chunks = []; recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 16e6 });
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = 'comma.webm'; a.click(); recorder = null; };
  recorder.start();
}
const nowReal = () => (ctx ? ctx.currentTime - t0 - (ctx.outputLatency || 0) : 0);
function loop() {
  requestAnimationFrame(loop);
  if (!playing) return;
  const tr = Math.max(0, nowReal());
  frameAt(tr);
  if (tr > totalReal(OFFSET) && recorder && recorder.state === 'recording') recorder.stop();
}

// ───────────────────────── offline render: index.html?render&w=1920&h=1080&fps=60&speed=1&ss=2
// renders the audio with an OfflineAudioContext, then every frame deterministically, and streams
// raw RGBA to render.py, which pipes it into ffmpeg. nothing here depends on the machine being fast.
function wavF32(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bytes = n * ch * 4;
  const dv = new DataView(new ArrayBuffer(44 + bytes)); let o = 0;
  const str = (s) => { for (const c of s) dv.setUint8(o++, c.charCodeAt(0)); }, u32 = (v) => { dv.setUint32(o, v, true); o += 4; }, u16 = (v) => { dv.setUint16(o, v, true); o += 2; };
  str('RIFF'); u32(36 + bytes); str('WAVE'); str('fmt '); u32(16); u16(3); u16(ch); u32(sr); u32(sr * ch * 4); u16(ch * 4); u16(32); str('data'); u32(bytes);
  const cs = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { dv.setFloat32(o, cs[c][i], true); o += 4; }
  return dv.buffer;
}
async function render() {
  gate.style.display = 'none';
  const w = +(params.get('w') || 1920), h = +(params.get('h') || 1080), fps = +(params.get('fps') || 60), ss = +(params.get('ss') || 1);
  FIXED = { w, h, ss }; resize();
  cv.style.width = '100vw'; cv.style.height = '100vh'; cv.style.objectFit = 'contain';
  const st = document.createElement('div'); st.style.cssText = 'position:fixed;left:12px;bottom:10px;font:12px ui-monospace,monospace;color:#efe8da;background:#0008;padding:4px 8px;border-radius:4px';
  document.body.appendChild(st); const say = (m) => { st.textContent = m; window.renderStatus = m; };
  const sr = 48000, dur = totalReal(0), N = Math.ceil(dur * fps);
  say(`rendering audio (${dur.toFixed(1)} s at speed ${SPEED})…`);
  const oc = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  await oc.audioWorklet.addModule('worklet.js');
  const n = new AudioWorkletNode(oc, 'comma', { outputChannelCount: [2], processorOptions: { autostart: true, at: PRE, offset: 0, speed: SPEED } });
  n.connect(oc.destination);
  const buf = await oc.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1); scopeBuf = new Float32Array(L.length); for (let i = 0; i < L.length; i++) scopeBuf[i] = 0.5 * (L[i] + R[i]); scopeSR = sr;
  const post = (path, body) => fetch(path, { method: 'POST', body }).then((r) => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.text(); });
  await post('/render/audio', wavF32(buf));
  await post('/render/start', JSON.stringify({ w, h, fps, speed: SPEED, frames: N }));
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const og = out.getContext('2d', { willReadFrequently: true }); og.imageSmoothingQuality = 'high';
  let pending = null; const t0r = performance.now();
  for (let i = 0; i < N; i++) {
    frameAt(i / fps, 0);
    og.drawImage(cv, 0, 0, w, h);
    const px = og.getImageData(0, 0, w, h).data;
    if (pending) await pending;
    pending = post('/render/frame', px);
    if (i % 10 === 0) { const el = (performance.now() - t0r) / 1000; say(`frame ${i}/${N} · ${(i / el).toFixed(1)} fps · eta ${((N - i) / Math.max(0.1, i / el)).toFixed(0)} s`); }
  }
  await pending;
  say('encoding…');
  const res = await post('/render/done', '');
  say('done → ' + res); window.renderDone = res;
}

if (params.has('render')) {
  render().catch((e) => { window.renderDone = 'ERROR ' + e.message; document.body.append('render failed: ' + e.message); });
} else if (params.has('frame')) {
  gate.style.display = 'none';
  const draw = () => drawAt(+params.get('frame'));
  draw(); window.addEventListener('resize', draw);
} else {
  const sp = document.getElementById('speed'), spv = document.getElementById('speedv');
  if (sp) {
    sp.value = SPEED / S.BASE_SPEED;
    const upd = () => { setSpeed(sp.value); spv.textContent = (SPEED / S.BASE_SPEED).toFixed(2) + '×  ·  ' + totalReal(0).toFixed(1) + ' s'; };
    sp.addEventListener('input', upd); sp.addEventListener('click', (e) => e.stopPropagation()); upd();
  }
  gate.addEventListener('click', () => play(false));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); OFFSET = 0; play(false); }
    if (e.key === 'r' || e.key === 'R') { OFFSET = 0; play(true); }
    if (e.key === 'Escape') stop(); // back to the gate, e.g. to change the speed
  });
  loop();
}
