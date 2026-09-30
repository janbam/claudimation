# COMMA — a treatise in five axioms

A ~60-second claudimation by Opus 5.5, with janbam the human: 3.6 s of title, 46.2 s of piece, then 9 s of room ringing out over the last frame. Canvas 2D + Web Audio, one AudioWorklet synthesizing everything sample by sample
from a shared deterministic score (`score.js`), so the visuals are computed from the same numbers you hear.

```
python3 serve.py              # worklets need http, not file:// (and no-store, or Chrome caches the worklet)
open http://localhost:8765/    # speed slider · click · space = replay · esc = back · R = record webm
```

| axiom | time | idea |
|---|---|---|
| I   | 0–5.0 | **every tone is a gravity well** — 64 Hz (2⁶, chosen by a computer) grows its harmonic series on a rainbow pitch helix (angle = pitch class = hue, C = Claude orange). Every partial pings as it lands; 7, 11, 13 show their cents off 12-TET. |
| II  | 5.0–14.0 | **stack the fifths until they lie** — modal plucked strings. Seven fifths make Lydian. The twelfth is B♯: the world ducks, C and B♯ call and answer, then wobble at 3.49 Hz while the camera dives into the 23.46¢ gap. One quarter before III's first beat the wobble *falls*: both notes glide down four octaves in 2.5 s (256 → 16 Hz), so the beating slows with them (3.49 → 0.22 Hz) until it's gone; the fall pours into II's own room, which opens as it falls. III's room starts empty. |
| III | 14.0–24.8 | **twelve is a rounding error** — *the bar has as many steps as the octave has notes*; just beat and melody. 12-EDO in 12/16: one bar per second, 12 steps/s (180 bpm), three straight bars. Then 19/16, 31/32, 53/64, Bohlen–Pierce 13/16, each tuning ×0.78 as long as the last, the groove loosening as it goes. The π/4 bar is one second again: π-EDO steps are 1200/π = 382¢, so its four notes climb to 1146¢ — a leading tone 54¢ under the octave. Step π, the octave, doesn't fit in the bar: it lands on the downbeat of IV, with a 909 sub drop 64 → 16 Hz. |
| IV  | 24.8–33.1 | **rhythm is harmony, slowed down** — a Cowell rhythmicon: partial k pulses k times per cycle, 60 → 3840 bpm (1 cycle per second at first, like the bars of III), until the polyrhythm *is* the harmonic chord on 64 Hz. (All of IV sits 4 dB lower than it used to: −5.3 dB in, −4 dB out through the saturating master.) |
| V   | 33.1–46.2 (+9 s) | **the undertone is the overtone in a mirror** — 64·k glides to 1024/k; every voice crosses 1/1 at the same instant, lands 23.46¢ sharp, wobbles, sighs to 1/1. Then the helix gets *wound*: its angle becomes the phase of one period of 21.33 Hz (1/1 is its 12th harmonic), every point slides to the waveform's value there — a Klangzylinder — and blooms into the twelve-rayed spark as the voices lock onto 28 partials. The layers melt into one flat orange shape, which fades over twelve comma-beats (12 / 3.49 Hz = 3.44 s) while the sound pours into a growing room (RT60 ≈ 2 → 9 s). The picture stands still; the room rings on for 9 s. |

(times are real seconds at speed 1.0, after the title.)

**Speed.** The slider on the start screen (or `?speed=1.1`) changes tempo, never pitch. 1.0 is score time × 0.9 (`BASE_SPEED`) — 0.9 was the right tempo, so that's what 1.0 means now. Things that are real frequencies stay real: the comma still beats at 3.49 Hz, and the rhythmicon still arrives at exactly 64 Hz (its phase is rescaled, not its rate).

**The room.** One 8-line Hadamard FDN for everything: three static input diffusers; Lexicon-style *wander* (each delay
length drifts on its own smooth random walk, ±0.17 ms, so the modes never sit still — ≤ 0.7¢ of drift, only in the tail,
35× below the 3.49 Hz comma beat); output taps picked by measurement so the diffuse tail is decorrelated (the first
version's taps gave an anti-phase tail that cancelled in mono); and a Dimension-D-style widener on the return only
(7/9.3 ms, ±0.2 ms on opposite 0.3 Hz LFOs, high-passed polarity-inverted crossfeed). The dry signal is never modulated:
the beating is the point.

**Master.** Drive into a tanh saturation (the same colour the piece always had) with the ceiling at 0.79: small signals
+2 dB, the IV climax (12 pulses aligning once per cycle) rounds off instead of ducking. Measured on the render:
−11.4 LUFS integrated, −1.9 dBTP, LRA 6.1 LU. (A glue compressor and a lookahead limiter were tried; both turned
the IV crescendo into a slump.)

**Offline render** (deterministic, frame-exact, any resolution):

```
python3 render.py                                   # 2560x1440 · 60 fps · 1.5x supersampled · h264 crf 16 (aq-mode 3) + AAC 320k → comma.mp4
python3 render.py -W 1920 -H 1080 --ss 2                # 1080p
python3 render.py -W 3840 -H 2160 --ss 1 -o comma-4k.mp4
python3 render.py --codec prores -o comma.mov       # ProRes 422 HQ 10-bit + 24-bit PCM, for editing
```

It launches headless Chrome on `index.html?render&w=…&h=…&fps=…&speed=…&ss=…`, which renders the audio with an
OfflineAudioContext, then draws every frame at exactly t = i/fps and streams raw RGBA to `render.py` → ffmpeg.
1440p is the default because YouTube serves 1440p uploads with VP9/AV1 at a higher bitrate, even to 1080p viewers.
The layout is computed at a logical height of 1080, so 720p and 4K frame identically. `--browser` opens it in your
normal browser instead.

`lab.html` renders the piece offline and draws a log-frequency spectrogram (`?from=32&to=42.3&fmin=40&fmax=20000` to zoom, `&speed=0.8` too).
Look between 33.4 and 35.6 s, above 3 kHz. `lab.html?polar=41&from=32` winds the rendered audio at 21.33 Hz — the spark, from the sound itself.

`index.html?frame=21.5` draws a single frozen frame; `index.html?t=18` plays from an offset.

---

Free under the [Comma License](LICENSE.md): do anything with it, just don't cause harm or discontent. PRs and friendly chats in the issues are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).
