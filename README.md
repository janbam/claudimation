# COMMA — a treatise in five axioms

A ~45-second claudimation (3.6 s of title, then 41.8 s of piece). Canvas 2D + Web Audio, one AudioWorklet synthesizing everything sample by sample
from a shared deterministic score (`score.js`), so the visuals are computed from the same numbers you hear.

```
python3 serve.py              # worklets need http, not file:// (and no-store, or Chrome caches the worklet)
open http://localhost:8765/    # speed slider · click · space = replay · esc = back · R = record webm
```

| axiom | time | idea |
|---|---|---|
| I   | 0–4.5   | **every tone is a gravity well** — 64 Hz (2⁶, chosen by a computer) grows its harmonic series on a rainbow pitch helix (angle = pitch class = hue, C = Claude orange). Every partial pings as it lands; 7, 11, 13 show their cents off 12-TET. |
| II  | 4.5–12.6 | **stack the fifths until they lie** — modal plucked strings (stiff inharmonic partials, pluck-position comb, frequency-dependent decay). Seven fifths make Lydian. The twelfth is B♯: the world ducks, C and B♯ call and answer, then sound together and wobble at 3.49 Hz while the camera dives into the 23.46¢ gap. Then the tear. |
| III | 12.6–25.3 | **twelve is a rounding error** — *the bar has as many steps as the octave has notes*. 12-EDO in 12/16 (3 straight bars), 19 in 19/16, 31 in 31/32, 53 in 53/64, Bohlen–Pierce 13ED3 in 13/16, π-EDO in π/4. Each tuning gets ×0.78 the time of the last (3.6 → 1.05 s) while the groove loosens: rubato, jitter, ghost notes, ratchets, off-grid kicks. |
| IV  | 25.3–32.8 | **rhythm is harmony, slowed down** — a Cowell rhythmicon: partial k pulses k times per cycle, accelerating 60 → 3840 bpm until the polyrhythm *is* the harmonic chord on 64 Hz. |
| V   | 32.8–41.8 | **the undertone is the overtone in a mirror** — 64·k glides to 1024/k; every voice crosses 1/1 (256 Hz) at the same instant. Everyone lands 23.46¢ sharp, wobbles, sighs to 1/1. Then: 256 Hz is the 12th harmonic of 21.33 Hz, and the helix that's been there all along gets *wound*: its angle becomes the phase of a 21.33 Hz period, every point slides to the waveform's value there (a Klangzylinder). The home octave becomes the outline, the others become echo windings; as the voices glide onto 28 phase-locked partials, the winding blooms into the twelve-rayed spark. `sparkW` in `score.js` is the same sum the worklet plays. |

**Speed.** The slider on the start screen (or `?speed=0.9`) changes tempo, never pitch. Things that are real frequencies stay real: the comma still beats at 3.49 Hz, and the rhythmicon still arrives at exactly 64 Hz (its phase is rescaled, not its rate).

**The room.** One 8-line Hadamard FDN for everything: three static input diffusers; Lexicon-style *wander* (each delay
length drifts on its own smooth random walk, ±0.17 ms, so the modes never sit still — ≤ 0.7¢ of drift, only in the tail,
35× below the 3.49 Hz comma beat); output taps picked by measurement so the diffuse tail is decorrelated (the first
version's taps gave an anti-phase tail that cancelled in mono); and a Dimension-D-style widener on the return only
(7/9.3 ms, ±0.2 ms on opposite 0.3 Hz LFOs, high-passed polarity-inverted crossfeed). The dry signal is never modulated:
the beating is the point.

**Offline render** (deterministic, frame-exact, any resolution):

```
python3 render.py                                   # 1920x1080 · 60 fps · speed 1 · 2x supersampled · h264 crf 12 → comma.mp4
python3 render.py -W 3840 -H 2160 --ss 1 --speed 0.9 -o comma-4k.mp4
python3 render.py --codec prores -o comma.mov       # ProRes 422 HQ 10-bit + 24-bit PCM, for editing
```

It launches headless Chrome on `index.html?render&w=…&h=…&fps=…&speed=…&ss=…`, which renders the audio with an
OfflineAudioContext, then draws every frame at exactly t = i/fps and streams raw RGBA to `render.py` → ffmpeg.
The layout is computed at a logical height of 1080, so 720p and 4K frame identically. `--browser` opens it in your
normal browser instead.

`lab.html` renders the piece offline and draws a log-frequency spectrogram (`?from=32&to=42.3&fmin=40&fmax=20000` to zoom, `&speed=0.8` too).
Look between 33.4 and 35.6 s, above 3 kHz. `lab.html?polar=41&from=32` winds the rendered audio at 21.33 Hz — the spark, from the sound itself.

`index.html?frame=21.5` draws a single frozen frame; `index.html?t=18` plays from an offset.
