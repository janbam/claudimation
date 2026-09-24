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
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
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
// pop-in sticker: a rotated label with overshoot. age = time since it appeared
function sticker(s, x, y, age, life, o = {}) {
  if (age < 0 || age > life) return;
  const { bg = GOLD, fg = INK, size = 15, rot = -0.05, font = SANS, weight = 800 } = o;
  const pop = age < 0.25 ? 1 + 0.35 * Math.sin(Math.min(1, age / 0.25) * Math.PI) * (1 - age / 0.25) : 1;
  const sc = Math.min(1, age / 0.08) * pop;
  const a = 1 - ramp(age, life - 0.25, life);
  g.save(); g.translate(x, y); g.rotate(rot + 0.02 * Math.sin(age * 6)); g.scale(sc, sc);
  g.font = `${weight} ${size}px ${font}`; const w = g.measureText(s).width + size * 1.1, h = size * 1.7;
  g.fillStyle = rgba(bg, 0.95 * a); g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h * 0.3); g.fill();
  g.fillStyle = rgba(fg, a); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, 0, size * 0.06);
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
const KICKS = [...S.III_DRUMS.filter((d) => d.type === 'kick').map((d) => d.t)];
{ // rhythmicon downbeats while still slow enough to be beats
  for (let c = 0; ; c++) { let lo = S.T.IV, hi = S.T.V; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (S.rhyPhase(m) < c) lo = m; else hi = m; } if (S.rhyRate(hi) > 4.5 || hi >= S.T.V - 0.01) break; KICKS.push(hi); }
  KICKS.push(S.T.V); KICKS.sort((a, b) => a - b);
}
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
  if (t > S.WOBBLE_T && t < S.TEAR_T) { const w = ramp(t, S.WOBBLE_T, S.WOBBLE_T + 0.3); rot += 0.012 * w * Math.sin(TAU * S.BEAT_HZ * (t - S.WOBBLE_T)); zoom *= 1 + 0.02 * w * Math.cos(TAU * S.BEAT_HZ * (t - S.WOBBLE_T)); }
  // III/IV: kicks punch
  const ke = kickEnv(t);
  if (t > S.T.III && t < S.T.V + 1) { zoom *= 1 + 0.035 * ke; shake += 5 * ke; }
  if (t > S.T.III && t < S.T.IV) shake += 2.5 * snareEnv(t);
  // IV: lean in towards the drop
  const lean = ramp(t, S.T.V - 1.8, S.T.V) * (1 - ramp(t, S.T.V, S.T.V + 0.4));
  zoom *= 1 + 0.12 * lean; rot += 0.06 * lean;
  // V: impact
  if (t > S.T.V) shake += 22 * Math.exp(-(t - S.T.V) / 0.25);
  // V: home becomes the centre of the world
  const [hx, hy] = helix(S.HOME);
  const c = smooth(ramp(t, S.V_CENTER[0], S.V_CENTER[1]));
  fx = lerp(fx, hx, c); fy = lerp(fy, hy, c);
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
  const gr = g.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
  gr.addColorStop(0, rgba(hsl(hue, 0.7, lum), amt)); gr.addColorStop(1, rgba(INK, 0));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // the comma: the whole room wobbles at 3.49 Hz
  if (t > S.WOBBLE_T && t < S.TEAR_T) {
    const w = ramp(t, S.WOBBLE_T, S.WOBBLE_T + 0.3) * (0.5 + 0.5 * Math.cos(TAU * S.BEAT_HZ * (t - S.WOBBLE_T)));
    g.fillStyle = rgba(GOLD, 0.08 * w); g.fillRect(0, 0, W, H);
  }
  // III: kick strobe in the colour of the last note
  if (sec === 2) {
    const n = S.III_NOTES.filter((x) => x.t <= t).at(-1);
    if (n) { g.fillStyle = rgba(pcol(n.freq, 1, 0.5), 0.16 * kickEnv(t)); g.fillRect(0, 0, W, H); }
  }
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
    if (far) sticker((c >= 0 ? '+' : '−') + Math.abs(c).toFixed(1) + '¢ off the piano!', x + 12 * Math.cos(ang + 0.6) + 60, y + 12 * Math.sin(ang + 0.6) + 24, on, 1.6, { bg: col, size: 11, rot: 0.06 });
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
    if (t > S.WOBBLE_T && hot) beat = 0.5 + 0.5 * Math.cos(TAU * S.BEAT_HZ * (t - S.WOBBLE_T) + (last ? 0 : Math.PI));
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
  sticker('LYDIAN!', CX, CY - U * 0.05, t - S.LYDIAN_T, 1.6, { bg: hsl(200, 0.9, 0.62), size: 30, rot: -0.07 });
  sticker('the first seven fifths = maximum gravity', CX, CY + U * 0.09, t - S.LYDIAN_T - 0.12, 1.5, { bg: CREAM, size: 12, rot: 0.03, weight: 600 });
  // the comma scene
  for (const c of S.COMMA_CALLS) {
    const age = t - c.t;
    const s = c.who === 'both' ? 'together now…' : c.who + '!';
    sticker(s, c.who === 'C' ? CX - U * 0.45 : c.who === 'B♯' ? CX + U * 0.45 : CX, c.who === 'both' ? CY + U * 0.08 : CY - U * 0.25, age, c.who === 'both' ? 1.0 : 0.6, { bg: c.who === 'C' ? CLAUDE : GOLD, size: c.who === 'both' ? 22 : 34, rot: c.who === 'C' ? -0.1 : 0.1 });
  }
  if (t > S.WOBBLE_T) {
    const u = ramp(t, S.WOBBLE_T, S.WOBBLE_T + 0.25), ph = TAU * S.BEAT_HZ * (t - S.WOBBLE_T);
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
    sticker('wob · wob · wob — ' + S.BEAT_HZ.toFixed(2) + ' per second', CX, CY + U * 0.27, t - S.WOBBLE_T - 0.35, 3, { bg: MAGENTA, fg: [255, 255, 255], size: 16, rot: -0.04 });
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
  const u = clamp((t - seg.t0) / seg.d, 0, 1), up = seg.cont ? u : Math.pow(u, 1 / seg.warp);
  const ah = TAU * up - Math.PI / 2;
  const hg = g.createLinearGradient(CX, CY, ...polar(R0, ah)); hg.addColorStop(0, rgba(col0, 0)); hg.addColorStop(1, rgba(col0, 0.9 * fa));
  g.strokeStyle = hg; g.lineWidth = 3; g.beginPath(); g.moveTo(CX, CY); g.lineTo(...polar(R0 + 30, ah)); g.stroke();
  g.strokeStyle = rgba(CREAM, (0.2 + 0.6 * se) * fa); g.lineWidth = 1 + 3 * se; g.beginPath(); g.arc(CX, CY, R0 * (1.18 + 0.05 * se), 0, TAU); g.stroke();
  // pad chord polygon
  const pc = S.padChord(tn); g.beginPath();
  pc.forEach((f, i) => { const a = TAU * ((Math.log(f / 128) / Math.log(P)) % 1) - Math.PI / 2; const p = polar(R0 * 0.55 * (1 + 0.08 * ke), a); i ? g.lineTo(...p) : g.moveTo(...p); });
  g.closePath(); g.fillStyle = rgba(col0, 0.14 * fa); g.fill(); g.strokeStyle = rgba(col0, 0.7 * fa); g.lineWidth = 2; g.stroke();
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
  sticker(seg.sub, CX, CY + U * 1.02, age - 0.1, seg.d - 0.05, { bg: col0, size: 14, rot: seg.i % 2 ? 0.04 : -0.04 });
  if (seg.i === 1) sticker('NEW RULE: the bar has as many steps as the octave has notes', CX, H * 0.08, age - 0.05, seg.d, { bg: CREAM, size: 14, rot: 0.02 });
}

// ───────────────────────── IV. rhythm is harmony, slowed down
function drawIV(t) {
  if (t < S.T.IV - 0.05 || t > S.T.V + 0.5) return;
  const fa = ramp(t, S.T.IV - 0.05, S.T.IV + 0.1) * (1 - ramp(t, S.T.V, S.T.V + 0.25));
  const ph = S.rhyPhase(t), r = S.rhyRate(t);
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
  const beat = Math.exp(-((S.rhyPhase(t) % 1) / r) / 0.1) * (r < 8 ? 1 : 0);
  g.save(); g.translate(CX, CY); const sc = 1 + 0.15 * beat; g.scale(sc, sc);
  text(bpm.toFixed(0), 0, -4, { font: SERIF, size: Math.min(46, W * 0.04) * (1 + 0.35 * ramp(t, S.T.V - 2.5, S.T.V)), align: 'center', base: 'middle', a: fa, col: mix(CREAM, GOLD, ramp(t, S.T.V - 3, S.T.V)), weight: 700, shadow: 20 });
  text('BPM', 0, 26, { font: SANS, size: 11, align: 'center', a: 0.7 * fa, ls: 4, weight: 800 });
  g.restore();
  text('partial k pulses k times per cycle · 1 : 2 : 3 : … : 12', CX, H * 0.07, { size: 12, align: 'center', a: 0.7 * fa * ramp(t, S.T.IV + 1.45, S.T.IV + 1.8) });
  sticker('you hear rhythm', W * 0.8, H * 0.3, t - S.T.IV - 0.3, 2.2, { bg: CYAN, size: 15, rot: 0.05 });
  sticker('you hear… something?', W * 0.2, H * 0.7, t - S.T.IV - 3.2, 1.6, { bg: hsl(280, 0.9, 0.7), size: 15, rot: -0.06 });
  sticker('you hear a CHORD', W * 0.78, H * 0.72, t - S.T.IV - 5.3, 1.7, { bg: GOLD, size: 20, rot: 0.07 });
  sticker('3840 bpm = 64 Hz = the tonic!', CX, H * 0.18, t - S.T.V + 0.75, 0.75, { bg: MAGENTA, fg: [255, 255, 255], size: 18, rot: -0.03 });
}

// ───────────────────────── V. the mirror, the comma again, and the spark
function drawV(t) {
  if (t < S.T.V - 0.3) return;
  const fa = ramp(t, S.T.V - 0.1, S.T.V + 0.2) * (1 - ramp(t, S.V_WIND[0], S.V_WIND[1] + 0.2));
  if (fa > 0) {
    rainbowHelix(0.22 * fa);
    const mir = smooth(ramp(t, S.T.V + 0.05, S.V_MIRROR_END));
    g.strokeStyle = rgba(CREAM, 0.35 * fa * (1 - ramp(t, S.V_CONVERGE[0], S.V_CONVERGE[1]))); g.setLineDash([4, 6]); g.lineWidth = 1.2;
    g.beginPath(); g.arc(CX, CY, helixR(S.HOME), 0, TAU); g.stroke(); g.beginPath(); g.moveTo(CX, CY - U * 1.05); g.lineTo(CX, CY + U * 1.05); g.stroke(); g.setLineDash([]);
    // impact ring
    const ia = t - S.T.V; if (ia > 0 && ia < 1.2) { burst(CX, CY, ia, 90, [MAGENTA, CYAN, GOLD, CLAUDE, [150, 255, 120]], 777, 700, 1.2, 3); g.strokeStyle = rgba(CREAM, 1 - ia / 1.2); g.lineWidth = 4 * (1 - ia / 1.2); g.beginPath(); g.arc(CX, CY, ia * U * 1.6, 0, TAU); g.stroke(); }
    // C reference during the wobble
    const cref = ramp(t, S.V_CONVERGE[1] - 0.3, S.V_WOBBLE[0]) * (1 - ramp(t, S.V_SETTLE[0], S.V_SETTLE[1]));
    if (cref > 0) { const [x, y] = helix(S.HOME); dot(x, y, 6, CLAUDE, cref * fa); }
    for (let k = 1; k <= S.RHY_K; k++) {
      const amp = S.mirrorAmp(k, t); const vis = k === 1 ? 1 : Math.min(1, amp / 0.05 + 0.05);
      g.lineWidth = 2.2; g.lineCap = 'round';
      let prev = null;
      for (let j = 0; j <= 50; j++) { const tt = Math.max(S.T.V, t - j * 0.009); const f = S.mirrorFreq(k, tt); const p = helix(f);
        if (prev) { g.strokeStyle = rgba(pcol(f), 0.7 * fa * vis * (1 - j / 50)); g.beginPath(); g.moveTo(...prev); g.lineTo(...p); g.stroke(); } prev = p; }
      g.lineCap = 'butt';
      const f = S.mirrorFreq(k, t); const [x, y] = helix(f);
      let beat = 1; if (t > S.V_WOBBLE[0] && t < S.V_SETTLE[1]) beat = 0.55 + 0.45 * Math.cos(TAU * S.BEAT_HZ * (t - S.V_WOBBLE[0]));
      dot(x, y, (3.5 + 3 / Math.sqrt(k)) * (0.8 + 0.3 * beat), pcol(f), fa * vis * beat);
      const lab = mir < 0.5 ? k + '/1' : '1/' + k;
      text(lab, x + 9, y - 7, { size: 10, a: 0.75 * fa * (1 - ramp(t, S.V_MIRROR_END + 0.2, S.V_MIRROR_END + 0.5)) * Math.abs(mir - 0.5) * 2, col: pcol(f), weight: 700 });
    }
  }
  drawSpark(t);
}
// the spark: the actual sound, wound around one period of 21.33 Hz
function drawSpark(t) {
  const a = ramp(t, S.V_WIND[0], S.V_WIND[1]) * (1 - ramp(t, S.DUR - 0.9, S.DUR - 0.1));
  if (a <= 0) return;
  const [hx, hy] = helix(S.HOME);
  const Ssz = U * 0.95, R0 = 0.47 * Ssz * lerp(0.6, 1, smooth(ramp(t, S.V_WIND[0], S.V_BLOOM[0] + 0.4))), A = 0.44 * Ssz;
  const N = 540;
  const shape = (j) => { const pts = []; for (let i = 0; i <= N; i++) { const th = TAU * i / N; const r = R0 + A * S.sparkW(th, t, j) + j * 7; pts.push(polar(Math.max(2, r), th - Math.PI / 2, hx, hy)); } return pts; };
  const path = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); };
  // echo windings (like a Klangzylinder): when the partials aren't locked yet, they disagree and swim
  for (let j = 7; j >= 1; j--) { path(shape(j)); g.strokeStyle = rgba(hsl(15 + j * 40 + (t - S.V_WIND[0]) * 40, 0.9, 0.65), a * (0.5 - j * 0.05)); g.lineWidth = 1.2; g.stroke(); }
  const main = shape(0);
  const breath = 1 + 0.03 * Math.sin((t - S.V_BLOOM[1]) * 2.2) * ramp(t, S.V_BLOOM[1], S.V_BLOOM[1] + 0.5);
  g.save(); g.translate(hx, hy); g.scale(breath, breath); g.translate(-hx, -hy);
  path(main);
  const rg = g.createRadialGradient(hx, hy, 0, hx, hy, R0 + A);
  rg.addColorStop(0, rgba([240, 150, 110], a)); rg.addColorStop(0.5, rgba(CLAUDE, a)); rg.addColorStop(1, rgba([200, 95, 65], a));
  g.fillStyle = rg; g.fill();
  g.shadowColor = rgba(CLAUDE, 0.8 * a); g.shadowBlur = 40; g.strokeStyle = rgba([255, 190, 150], 0.7 * a); g.lineWidth = 1.5; g.stroke(); g.shadowBlur = 0;
  // the core: a round window with the whole piece inside it (the helix, turning slowly)
  const cr = Math.max(8, (R0 - A * 0.3) * 0.82);
  const cg = g.createRadialGradient(hx, hy - cr * 0.3, 0, hx, hy, cr);
  cg.addColorStop(0, rgba([255, 214, 180], a)); cg.addColorStop(1, rgba([232, 128, 92], a));
  g.fillStyle = cg; g.beginPath(); g.arc(hx, hy, cr, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(hx, hy, cr * 0.92, 0, TAU); g.clip();
  const rot = (t - S.V_WIND[0]) * 0.5; g.lineWidth = 1.6;
  let prev = null;
  for (let i = 0; i <= 220; i++) { const u = i / 220; const ang = TAU * 3.2 * u + rot; const rr = cr * 0.9 * u; const p = [hx + rr * Math.cos(ang), hy + rr * Math.sin(ang)];
    if (prev) { g.strokeStyle = rgba(hsl(15 + 360 * 3.2 * u, 0.85, 0.42), a * 0.85); g.beginPath(); g.moveTo(...prev); g.lineTo(...p); g.stroke(); } prev = p; }
  g.restore();
  g.restore();
}
function drawVOverlay(t) {
  if (t < S.T.V) return;
  const mir = smooth(ramp(t, S.T.V + 0.05, S.V_MIRROR_END));
  const cross = Math.exp(-Math.pow((mir - 0.5) / 0.08, 2)) * (t < S.V_MIRROR_END ? 1 : 0);
  if (cross > 0.02) { g.globalAlpha = Math.min(1, cross * 1.5); sticker('all twelve cross 1/1 at the same instant!', CX + U * 0.55, CY - U * 0.62, 0.3, 1, { bg: CYAN, size: 16, rot: -0.04 }); g.globalAlpha = 1; }
  sticker(mir < 0.5 ? 'OVERTONES  64·k' : 'UNDERTONES  1024/k', W * 0.82, H * 0.86, t - S.T.V - 0.3, 1.9, { bg: mir < 0.5 ? CLAUDE : hsl(215, 0.85, 0.65), size: 14, rot: 0.04 });
  sticker('home, give or take 23.46¢', CX, H * 0.14, t - S.V_CONVERGE[1] + 0.2, S.V_SETTLE[0] - S.V_CONVERGE[1] + 0.4, { bg: GOLD, size: 22, rot: -0.05 });
  sticker('…fine. 1/1.', CX, H * 0.86, t - S.V_SETTLE[0] - 0.2, 0.8, { bg: CREAM, size: 22, rot: 0.04 });
  // the reveal
  const r1 = t - S.V_WIND[0];
  if (r1 > 0) {
    const a = ramp(r1, 0.1, 0.5) * (1 - ramp(t, S.V_BLOOM[0] + 1.2, S.V_BLOOM[0] + 1.6));
    text('1/1 is the 12th harmonic of 21.33 Hz', CX, H * 0.07, { font: SERIF, italic: true, size: 20, align: 'center', a });
    text('wind the sound around its own period →', CX, H * 0.07 + 24, { size: 12, align: 'center', a: a * 0.75 });
    const b = ramp(t, S.V_BLOOM[1] - 0.2, S.V_BLOOM[1] + 0.4) * (1 - ramp(t, S.DUR - 1.2, S.DUR - 0.4));
    text('this is what the last chord looks like', CX, H * 0.93, { font: SERIF, italic: true, size: 18, align: 'center', a: b });
    text('COMMA · a treatise in five axioms · a claudimation', CX, H * 0.93 + 22, { size: 10, align: 'center', a: 0.55 * b, ls: 2 });
  }
}

// ───────────────────────── chrome: title, axiom slams, timeline
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
function titleCard(t) {
  if (t > 2.2) return;
  const a = ramp(t, 0.05, 0.3) * (1 - ramp(t, 1.4, 2.0));
  const letters = 'COMMA'.split(''); const size = Math.min(120, W * 0.1);
  g.font = `700 ${size}px ${SERIF}`; const w = g.measureText('COMMA').width + size * 0.4 * 4;
  let x = CX - w / 2;
  letters.forEach((ch, i) => {
    const d = t - 0.05 - i * 0.07; const pop = d < 0 ? 0 : d < 0.2 ? 1 + 0.4 * Math.sin(d / 0.2 * Math.PI) : 1;
    const cw = g.measureText(ch).width;
    g.save(); g.translate(x + cw / 2, CY - U * 0.05); g.scale(pop, pop);
    text(ch, 0, 0, { font: SERIF, size, align: 'center', base: 'middle', col: hsl(15 + i * 72, 0.95, 0.66), a: a * (d > 0 ? 1 : 0), weight: 700, shadow: 30 });
    g.restore(); x += cw + size * 0.4;
  });
  text('a treatise in five axioms', CX, CY - U * 0.05 + size * 0.75, { font: SERIF, italic: true, size: 20, align: 'center', a: a * ramp(t, 0.4, 0.7) });
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
  // timeline, coloured by axiom
  const tlw = Math.min(W * 0.26, 300), tx = rx - tlw, ty = H - Math.max(40, H * 0.07) + 8;
  const secs = [S.T.I, S.T.II, S.T.III, S.T.IV, S.T.V, S.DUR], hues = [265, 195, 320, 285, 220];
  for (let i = 0; i < 5; i++) { const a0 = tx + tlw * secs[i] / S.DUR, a1 = tx + tlw * secs[i + 1] / S.DUR;
    g.fillStyle = rgba(hsl(hues[i], 0.8, 0.6), 0.25 * hide); g.fillRect(a0, ty, a1 - a0 - 2, 2);
    const p = clamp((t - secs[i]) / (secs[i + 1] - secs[i]), 0, 1); g.fillStyle = rgba(hsl(hues[i], 0.95, 0.65), 0.95 * hide); g.fillRect(a0, ty, (a1 - a0 - 2) * p, 2);
    text(S.AXIOMS[i][0], a0, ty - 6, { font: SERIF, size: 10, a: (i === sec ? 1 : 0.35) * hide, col: hsl(hues[i], 0.9, 0.7), weight: 700 }); }
  text(t.toFixed(2) + ' s', rx, ty + 17, { size: 10, align: 'right', a: 0.4 * hide });
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

// ───────────────────────── live oscilloscope ring (live only)
let analyser = null, wave = null;
function scope(t) {
  if (!analyser || t > S.V_WIND[0]) return;
  analyser.getFloatTimeDomainData(wave);
  const a = 0.22 * ramp(t, 0.3, 1);
  const n = wave.length, R0 = U * 1.1;
  g.lineWidth = 1.2;
  for (let i = 0; i < n; i += 2) { const v = wave[i], ang = TAU * i / n - Math.PI / 2, ang2 = TAU * (i + 2) / n - Math.PI / 2;
    g.strokeStyle = rgba(hsl(15 + 360 * i / n + t * 60, 0.9, 0.65), a); g.beginPath(); g.moveTo(...polar(R0 + v * U * 0.15, ang)); g.lineTo(...polar(R0 + wave[(i + 2) % n] * U * 0.15, ang2)); g.stroke(); }
}

// ───────────────────────── frame
export function drawAt(t) {
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
  titleCard(t); axiomTitle(t);
  drawIIOverlay(t); drawIIIOverlay(t); drawIVOverlay(t); drawVOverlay(t);
  g.restore();
  chrome(t);
  glitch(t);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const vg = g.createRadialGradient(CX, CY, Math.min(W, H) * 0.35, CX, CY, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
}
window.drawAt = drawAt;

// ───────────────────────── playback
const params = new URLSearchParams(location.search);
const gate = document.getElementById('gate');
let ctx = null, node = null, startAt = 0, offset = +(params.get('t') || 0), playing = false, recorder = null;

async function play(record = false) {
  if (!ctx) { ctx = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 }); await ctx.audioWorklet.addModule('worklet.js'); }
  await ctx.resume();
  if (node) { node.port.postMessage({ type: 'stop' }); node.disconnect(); node = null; } // kill the old processor for real
  startAt = ctx.currentTime + 0.25;
  node = new AudioWorkletNode(ctx, 'comma', { outputChannelCount: [2], processorOptions: { autostart: true, at: startAt, offset } });
  if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; wave = new Float32Array(analyser.fftSize); }
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
