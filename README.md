# COMMA — a treatise in five axioms

A 35-second claudimation. Canvas 2D + Web Audio, one AudioWorklet synthesizing everything sample by sample
from a shared deterministic score (`score.js`), so the visuals are computed from the same numbers you hear.

```
python3 -m http.server 8765   # worklets need http, not file://
open http://localhost:8765/    # click · space = replay · R = record comma.webm
```

| axiom | time | idea |
|---|---|---|
| I   | 0–4.5   | **every tone is a gravity well** — 64 Hz (2⁶, chosen by a computer) grows its harmonic series on a rainbow pitch helix (angle = pitch class = hue, C = Claude orange). Every partial *pings* as it lands; 7, 11, 13 get stickers with their cents off the piano. |
| II  | 4.5–12.6 | **stack the fifths until they lie** — modal plucked strings (stiff inharmonic partials, pluck-position comb, wooden body). Seven fifths make Lydian. The twelfth is B♯: the world ducks, C and B♯ argue call-and-response, then sound together and *wobble* at 3.49 Hz while the camera dives into the 23.46¢ gap. Then the tear. |
| III | 12.6–19.1 | **twelve is a rounding error** — *the bar has as many steps as the octave has notes*: 12-EDO in 12/16, 19 in 19/16, 31 in 31/32, 53 in 53/64, Bohlen–Pierce 13ED3 in 13/16, and finally π-EDO in π/4. Euclidean drums, rubato, ratchets, 808 tuned to each tuning's chord. |
| IV  | 19.1–26.6 | **rhythm is harmony, slowed down** — a Cowell rhythmicon: partial k pulses k times per cycle, accelerating 60 → 3840 bpm until the polyrhythm *is* the harmonic chord on 64 Hz. |
| V   | 26.6–35.6 | **the undertone is the overtone in a mirror** — 64·k glides to 1024/k; every voice crosses 1/1 (256 Hz) at the same instant. Everyone lands 23.46¢ sharp, wobbles, sighs to 1/1. Then the reveal: 256 Hz is the 12th harmonic of 21.33 Hz. Wind the sound around one period of 21.33 Hz (a polar "Klangzylinder" view) and it's a 12-rippled circle; the voices glide out onto 28 phase-locked partials and the wound waveform blooms into a twelve-rayed spark. The ending *is* the last chord, drawn honestly (`sparkW` in `score.js` is the same sum the worklet plays). |

`lab.html` renders the piece offline and draws a log-frequency spectrogram (`?from=26&to=36&fmin=40&fmax=20000` to zoom).
Look between 27 and 29.5 s, above 3 kHz. `lab.html?polar=35&from=26` winds the rendered audio at 21.33 Hz — the spark, from the sound itself.

`index.html?frame=21.5` draws a single frozen frame; `index.html?t=18` plays from an offset.
