# COMMA — a treatise in five axioms

A 30-second claudimation. Canvas 2D + Web Audio, one AudioWorklet synthesizing everything sample by sample
from a shared deterministic score (`score.js`), so the visuals are computed from the same numbers you hear.

```
python3 -m http.server 8765   # worklets need http, not file://
open http://localhost:8765/    # click · space = replay · R = record comma.webm
```

| axiom | time | idea |
|---|---|---|
| I   | 0–4.5   | **every tone is a gravity well** — 64 Hz (2⁶, chosen by a computer) grows its harmonic series on a pitch helix (angle = pitch class, radius = register). 7, 11, 13 glow gold with their cents-deviation from 12-TET. |
| II  | 4.5–11.5 | **stack the fifths until they lie** — Karplus–Strong fifths, accelerating. Seven make Lydian (maximum gravity, G. Russell, more or less). Twelve draw a {12/7} star that doesn't close: B♯ lands 23.46¢ above C and beats against it at 3.49 Hz. Then the tear. |
| III | 11.5–18 | **twelve is a rounding error** — an algorithmic FM-bell torrent through 12 → 19 → 31 → 53-EDO → Bohlen–Pierce 13ED3 (odd-harmonic timbre, as the theory demands) → a continuous slide down to π-EDO. |
| IV  | 18–25.5 | **rhythm is harmony, slowed down** — a Cowell rhythmicon: partial k pulses k times per cycle, accelerating 60 → 3840 bpm until the polyrhythm *is* the harmonic chord on 64 Hz. Orbits smear into rings, outermost first. |
| V   | 25.5–30 | **the undertone is the overtone in a mirror** — 64·k glides to 1024/k. Every voice crosses 1/1 (256 Hz = √(64k·1024/k)) at the same instant. Everyone arrives home 23.46¢ sharp, sighs, and resolves. Coda: a spark of twelve fifths and one comma. |

`lab.html` renders the piece offline and draws a log-frequency spectrogram (`?from=24&to=30.3&fmin=40&fmax=20000` to zoom).
Look between 26 and 28.5 s, above 3 kHz.

`index.html?frame=21.5` draws a single frozen frame; `index.html?t=18` plays from an offset.
