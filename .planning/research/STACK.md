# Technology Stack

**Project:** Jazz Learning — Browser-based audio analysis and visualization
**Researched:** 2026-03-10 (v1.0), updated 2026-03-11 (v1.1 milestone)
**Research method:** npm registry queries, MDN browser-compat-data package inspection, Meyda.js source analysis, instrument acoustics sources (physics.unsw.edu.au, soundshockaudio.com)

---

## v1.1 Milestone: What Changes and What Does Not

**No new npm dependencies required for flexible instrument lineup.** All needed capabilities
are present in the existing stack. One library (`d3-force`) is considered below and explicitly
rejected for this milestone.

| Category | v1.1 Action | Rationale |
|----------|-------------|-----------|
| React, Vite, TS, Tailwind, Zustand | No change | All sufficient |
| Meyda.js 5.6.3 | No upgrade | ZCR, chroma, spectralCentroid, spectralRolloff all correct in 5.6.3 |
| Web Audio API + Canvas 2D | No change | Existing pipeline fully sufficient |
| d3-force | Do NOT add | Circular layout handles 2–8 nodes cleanly; force-directed adds runtime complexity with no visual benefit for fully-connected graphs at this scale |
| `FrequencyBandSplitter.ts` | Extend | Add 3 new bands: `brass_low`, `brass_high`, `vibes` |
| `InstrumentActivityScorer.ts` | Extend | Extend `InstrumentName` union + `INSTRUMENT_BAND_MAP` |
| `NodeLayout.ts` | Refactor | Replace hardcoded switch(2\|3\|4) with circular formula for 2–8 |
| New file: `BrassWindDisambiguator.ts` | Create | Chroma-entropy + spectral rolloff disambiguation for sax vs. keyboard |

---

## New Instruments: Frequency Profiles

All fundamental ranges are physically fixed by instrument construction (HIGH confidence,
physics.unsw.edu.au acoustics resources). Spectral centroid estimates are MEDIUM confidence
(vary by player, dynamic level, playing style).

### Tenor Saxophone

| Parameter | Value | Notes |
|-----------|-------|-------|
| Fundamental range | 110–830 Hz | Low Bb2 (110 Hz) to high F#5 (~740 Hz); altissimo to ~1.2 kHz |
| Harmonic structure | Strong 2nd, 3rd, 4th harmonics; conical bore → even harmonics present | Distinguishes from clarinet (cylindrical = odd harmonics only) |
| Presence/body band | 200–2000 Hz | Core tone; overlaps the `mid` band extensively |
| Brightness | 3–10 kHz | Upper harmonics extend here; brighter than vibes, darker than trumpet |
| Spectral centroid approx | ~1000–2500 Hz | Increases at louder dynamics; brightness tracks dynamics |
| ZCR characteristic | Low | Continuous reed vibration → sustained, tonal — similar to keyboard, NOT guitar-like |
| Spectral flux characteristic | Low sustained; narrow spike on tongued attacks | Tongued attacks produce brief flux spikes, not the broad strumming flux of guitar |

**Alto saxophone:** Fundamental range ~147–1109 Hz (concert pitch). Same spectral shape as tenor, higher.

**Primary challenge — overlap with keyboard:** Both instruments occupy 200–2000 Hz, both have
low ZCR, both have low sustained spectral flux. The existing ZCR+flux approach from
`KbGuitarDisambiguator.ts` is NOT sufficient. See disambiguation section below.

### Trumpet (Bb)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Fundamental range | 185–1175 Hz | F#3 (185 Hz) to C6 (~1175 Hz) |
| Harmonic structure | Rich, 8+ harmonics; bell radiates higher frequencies preferentially | Brighter at loud dynamics — upper harmonics grow faster than fundamental |
| Presence/attack band | 1–5 kHz | Characteristic "bite" and cut lives here |
| Air/brilliance | 5–15 kHz | Significant upper harmonic energy distinguishes trumpet from trombone |
| Spectral centroid approx | ~1500–4000 Hz | Higher centroid than trombone or sax |
| ZCR characteristic | Low | Sustained brass tone; not useful for brass-vs-brass disambiguation |
| Spectral flux characteristic | Low sustained; spikes on articulation | Similar to sax |

**Overlap with guitar:** Guitar upper harmonics and trumpet fundamentals share 300–1200 Hz.
Disambiguation: trumpet's spectral rolloff is significantly higher (energy extends to 15 kHz)
vs. clean jazz guitar (falls off above ~4 kHz). Trumpet ZCR is lower than guitar (plucked vs. sustained breath).

### Trombone (Tenor)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Fundamental range | 82–466 Hz | E2 (82 Hz) to Bb4 (466 Hz) — lowest of the four new instruments |
| Harmonic structure | Fundamental often weak; whole-tube instrument, even + odd harmonics present | Lower spectral centroid than trumpet by approximately an octave |
| Presence band | 200–1500 Hz | Body of sound; overlaps `bass`, `mid`, and `mid_high` |
| Air/shimmer | 2–8 kHz | Upper harmonics considerably lower energy here than trumpet |
| Spectral centroid approx | ~600–1500 Hz | Clearly lower than trumpet |
| ZCR characteristic | Low | Same as trumpet/sax |

**Overlap with bass:** Trombone fundamentals (82–300 Hz) fall inside the existing `bass`
band (20–250 Hz). When both bass and trombone are in the lineup, assign trombone
`['brass_low', 'mid']` — averaging across both bands spans its full range. Spectral centroid
disambiguates: upright bass centroid ~80–300 Hz; trombone centroid ~300–1500 Hz.

### Vibraphone

| Parameter | Value | Notes |
|-----------|-------|-------|
| Fundamental range | 131–2093 Hz | C3 (131 Hz) to C7 (2093 Hz) — widest range of new instruments |
| Harmonic structure | Mostly INHARMONIC partials; bar modes at ~2x, ~3.9x fundamental (NOT integer multiples) | Key distinguishing feature from all other instruments in this app |
| Resonator effect | Resonators amplify fundamental but NOT upper partials | Results in strong fundamental with suppressed harmonics — "hollow" spectrum |
| Spectral flatness | Low (concentrated fundamental + sparse inharmonic partials) | Very different from keyboard polyphonic chords (denser spectrum) |
| Spectral centroid approx | ~300–2000 Hz | Stays close to fundamental due to resonator suppression of upper partials |
| ZCR characteristic | Low-moderate; struck then decaying | Attack transient then fast decay — distinct from sustained wind instruments |
| Spectral flux characteristic | Moderate; struck percussion spike then fast decay | Attack-then-decay pattern distinguishable from sustained wind instruments |

**Overlap with keyboard:** Vibes and keyboard share most of the same frequency range.
Key disambiguation: vibraphone's partials are NOT at integer multiples of f0 (inharmonic);
keyboard piano strings are near-harmonic. `spectralFlatness` — vibes will show lower flatness
(sparse strong peaks) vs. keyboard polyphonic chords (denser spectrum). Chroma entropy also
applies: vibes is effectively monophonic in jazz contexts.

---

## New Frequency Bands Required

`buildDefaultBands()` in `FrequencyBandSplitter.ts` must be extended. Current bands were
designed for the 4-instrument lineup. New instruments need additional band coverage.
**Do NOT rename or remove existing bands** — existing instruments reference band names by
string key.

```
Existing bands (no change):
  bass:       20–250 Hz
  drums_low:  60–300 Hz
  mid:        250–2000 Hz
  mid_high:   300–3000 Hz
  drums_high: 2000–8000 Hz
  ride:       6000–10000 Hz

New bands to append:
  brass_low:  80–500 Hz       trombone fundamentals, trumpet low register
  brass_high: 1000–6000 Hz    trumpet/trombone upper harmonics, presence zone
  vibes_band: 130–2100 Hz     vibraphone fundamental range (named vibes_band to avoid clash)
```

---

## Updated INSTRUMENT_BAND_MAP

The `InstrumentName` type and `INSTRUMENT_BAND_MAP` in `InstrumentActivityScorer.ts` must
be extended:

```typescript
// Extend InstrumentName union
export type InstrumentName =
  | 'bass' | 'drums' | 'keyboard' | 'guitar'         // existing
  | 'saxophone' | 'trumpet' | 'trombone' | 'vibes';   // new

// Add to INSTRUMENT_BAND_MAP
saxophone: ['mid'],
trumpet:   ['mid_high', 'brass_high'],
trombone:  ['brass_low', 'mid'],
vibes:     ['mid', 'vibes_band'],
```

**Band fallback logic (extending `resolveBandsForInstrument`):**
The existing INST-05 logic gives solo keyboard/guitar the full mid range. New rules:
- Saxophone alone (no keyboard): claim `['mid', 'mid_high']`
- Trombone alone (no bass): claim `['bass', 'brass_low', 'mid']`
- One brass instrument (trumpet or trombone) alone: claim `['brass_low', 'brass_high']`

---

## Disambiguation Strategy: Sax vs. Keyboard

The existing ZCR+flux approach from `KbGuitarDisambiguator.ts` is **not sufficient** here.
Both sax and keyboard: low ZCR, low sustained spectral flux, overlapping frequency bands.

**Primary signal: Chroma Polyphony Score** (uses `Meyda.extract('chroma', ...)`)

`chroma` returns a 12-element Float32Array of pitch-class energy. Compute Shannon entropy
of the chroma distribution to score polyphony:

```typescript
// New file: BrassWindDisambiguator.ts
function chromaPolyphonyScore(chroma: Float32Array): number {
  // Shannon entropy — high (>0.5) = polyphonic (keyboard), low (<0.3) = monophonic (sax/vibes)
  let entropy = 0;
  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  for (const c of chroma) {
    const p = c / sum;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy / Math.log2(12); // normalize to [0, 1]
}
```

`Meyda.extract('chroma', ...)` is confirmed correct in Meyda 5.6.3.

**Important Meyda API note:** `chroma` is a frequency-domain feature. Per Meyda docs, it
accepts the amplitude spectrum as input (not time-domain Float32Array). Verify against
`meyda.js.org/audio-features.html` before calling. The `rawTimeDataFloat` buffer is correct
for time-domain features (ZCR); for chroma, pass the amplitude spectrum.

**Secondary signal: Spectral Rolloff**

`Meyda.extract('spectralRolloff', ...)` returns the frequency (Hz) below which 99% of
spectral energy sits.
- Keyboard mid-register chord: rolloff ~2500–4000 Hz (broad harmonic spread across multiple notes)
- Saxophone mid-register note: rolloff ~1500–2500 Hz (narrower, single-note harmonic series)

Use rolloff as a secondary confirmation, not primary.

**Vibes vs. Keyboard disambiguation:**
Use `spectralFlatness` as primary signal. Vibes has sparse inharmonic peaks → low flatness.
Keyboard polyphony produces denser spectrum → higher flatness. Chroma entropy is also
applicable (vibes is monophonic in most jazz contexts).

---

## Layout Algorithm: Circular Layout for 2–8 Nodes

**Decision: extend the existing circular/geometric layout in `NodeLayout.ts`. Do not add d3-force.**

**Why circular wins over force-directed for this use case:**

1. For a fully-connected graph (all-pairs edges, which this app uses), force-directed physics
   with uniform edge weights and uniform repulsion converges to a near-circle anyway. The physics
   simulation is doing work to arrive at the same result a direct formula produces instantly.

2. No runtime simulation loop. Circular layout is O(n) — compute angles, done. Force-directed
   needs ~100–300 ticks to settle per layout change. Even off-frame, it adds state complexity.

3. Deterministic. Semantic adjacency (drums near bass for the pocket-line edge) can be encoded
   directly into node ordering before angle assignment.

4. `NodeLayout.ts` already uses geometric layouts (triangle for 3, diamond for 4). Extending
   to 5–8 is a direct continuation of that pattern.

**Circular layout formula to replace the current switch statement:**

```typescript
// Replace computeNodePositions(count: 2 | 3 | 4) with:
export function computeNodePositions(count: number): NodePosition[] {
  if (count < 2 || count > 8) throw new Error(`Lineup must be 2-8 instruments, got ${count}`);
  const cx = 0.50;
  const cy = 0.50;
  const rx = 0.30;       // horizontal radius — leaves margin for node labels
  const ry = 0.30;       // vertical radius
  const startAngle = -Math.PI / 2; // start at top (12 o'clock position)
  return Array.from({ length: count }, (_, i) => ({
    x: cx + rx * Math.cos(startAngle + (2 * Math.PI * i) / count),
    y: cy + ry * Math.sin(startAngle + (2 * Math.PI * i) / count),
  }));
}
```

**Node ordering within the circle:** Sort instruments into semantic order before computing
positions so that rhythm-section instruments remain adjacent (preserving the pocket-line
edge semantics):

```
Recommended sort order: [drums, bass, trombone, saxophone, vibes, keyboard, guitar, trumpet]
                          (grouped: rhythm section → low horns → melodic center → high)
```

Instruments not in the lineup are simply absent from the array — the formula adapts.

**Backward compatibility note:** The existing `INSTRUMENT_ORDER` constant and
`computeNodePositions(count: 2 | 3 | 4)` are referenced in `CanvasRenderer.ts` and
`NodeLayout.ts`. The refactor must either maintain the existing function signature for
n=2,3,4 (returning the same fractional positions) or update all call sites.

**When force-directed layout WOULD make sense:** If a future milestone adds cluster-based
layout (e.g., "rhythm section cluster" vs. "horn section cluster" with intra-cluster short
edges and inter-cluster long edges). At that point, `d3-force` v3.0.0 (pure ESM, Vite-compatible)
with `@types/d3-force` from DefinitelyTyped is the right tool. Not needed now.

---

## Instrument Frequency Profile Quick Reference

| Instrument | Fundamental Hz | Primary Bands | Key Spectral Signature | Primary Disambiguator |
|------------|---------------|---------------|----------------------|-----------------------|
| Bass | 40–300 | bass | Sub-bass energy; low ZCR; low centroid | Centroid < 300 Hz |
| Drums | 60–10000 | drums_low, drums_high, ride | High ZCR; high flux; wideband | High ZCR + wideband flux |
| Keyboard | 28–4186 | mid, mid_high | Polyphonic chroma; moderate centroid; sustained | High chroma entropy |
| Guitar | 82–1175 | mid_high | High ZCR; high flux; mid-high centroid | High ZCR + high flux |
| Saxophone | 110–1200 | mid | Monophonic chroma; narrow rolloff; sustained reed | Low chroma entropy |
| Trumpet | 185–1175 | mid_high, brass_high | High centroid; bright harmonics to 15 kHz | High spectral rolloff |
| Trombone | 82–466 | brass_low, mid | Low centroid; overlaps bass register | Centroid 300–1500 Hz |
| Vibes | 131–2093 | mid, vibes_band | Inharmonic partials; strong fundamental; attack-decay | Low spectral flatness; flux spike + decay |

---

## Existing Stack (Full, No Changes)

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.2.0 | UI component tree, state, lifecycle | Current stable. Concurrent features useful for async audio file loading. |
| TypeScript | 5.9.3 | Type safety across audio pipeline | Catches buffer-size mismatches and feature-name typos at compile time. |
| Vite | 7.3.1 | Dev server + bundler | Native ESM dev server. Audio worklets and WASM load cleanly. Fast HMR. |

### Audio Analysis

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Web Audio API | Browser built-in | FFT via AnalyserNode, decode via decodeAudioData, playback via AudioBufferSourceNode | Native, zero bundle weight. |
| Meyda.js | 5.6.3 | ZCR, chroma, spectralCentroid, spectralRolloff, spectralFlatness, rms | Only production-stable browser audio feature extraction library. MIT license. |

**Meyda 5.6.3 known bug (documented in KbGuitarDisambiguator.ts):**
`Meyda.extract('spectralFlux', ...)` returns 0 or NaN due to a negative-index bug.
Use the hand-rolled `computeSpectralFlux()` in `KbGuitarDisambiguator.ts` instead.
Do NOT call Meyda's spectralFlux extractor for any instrument — old or new.

### Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Canvas API | Browser built-in | Animated node graph | Custom audio-driven animation. Raw Canvas beats every library for this use case at 2–15 nodes. |

### Styling + State

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.2.1 | UI chrome outside canvas | Utility-first. v4 CSS-first config. |
| Zustand | 5.0.11 | Audio/UI state bridge | Selector-based subscriptions keep Canvas loop outside React render cycle. |

---

## What NOT to Add

| Technology | Reason |
|------------|--------|
| d3-force | Circular layout is correct for n ≤ 8; force-directed adds runtime complexity with no visual benefit for fully-connected uniform-weight graphs |
| Essentia.js | AGPL-3.0 license risk, 10 MB WASM bundle |
| PixiJS / Three.js | Overkill for 2–15 node graph |
| Meyda v6.0.0-beta | Not production stable |
| Any new npm package for v1.1 | None needed |

---

## Confidence Assessment

| Area | Confidence | Source |
|------|------------|--------|
| Instrument fundamental ranges | HIGH | Physics.unsw.edu.au acoustics pages; instrument construction is fixed physics |
| Spectral centroid estimates | MEDIUM | Qualitative from multiple sources; varies by player and dynamics |
| Meyda.js chroma + spectralRolloff correctness | HIGH | Installed package dist source inspection (v1.0 research) |
| Meyda.js spectralFlux bug | HIGH | Confirmed in KbGuitarDisambiguator.ts comment + original research |
| Circular layout algorithm | HIGH | Standard graph drawing formula; O(n) deterministic |
| d3-force ESM + Vite compatibility | HIGH | d3js.org docs; d3-force v3.0.0 adopts `"type": "module"` |
| Vibraphone inharmonic partials | MEDIUM | Wikipedia + general acoustics literature |
| Chroma polyphony score (sax vs keyboard) | MEDIUM | Acoustics reasoning; not empirically tuned yet — thresholds (0.3/0.5) need calibration |

---

## Sources

- [Meyda.js audio features](https://meyda.js.org/audio-features.html) — feature list, chroma, spectralCentroid, spectralRolloff, spectralFlatness (HIGH confidence)
- [d3-force documentation (d3js.org)](https://d3js.org/d3-force) — forces available, ESM, pure module (HIGH confidence)
- [Brass instrument acoustics — UNSW](https://newt.phys.unsw.edu.au/jw/brassacoustics.html) — trumpet/trombone harmonic profiles (HIGH confidence)
- [Saxophone acoustics — UNSW](https://newt.phys.unsw.edu.au/music/saxophone/) — harmonic structure, conical bore (HIGH confidence)
- [Saxophone frequency ranges — johndcook.com](https://www.johndcook.com/blog/2021/02/26/saxophone-ranges/) — fundamental Hz ranges (HIGH confidence)
- [Tenor sax EQ guide — soundshockaudio.com](https://soundshockaudio.com/how-to-eq-tenor-sax/) — frequency zone breakdown (MEDIUM confidence)
- [Vibraphone — Wikipedia (via WebSearch)](https://en.wikipedia.org/wiki/Vibraphone) — inharmonic partials, resonator effect (MEDIUM confidence)
- [Pitch of brass instruments — Wikipedia (via WebSearch)](https://en.wikipedia.org/wiki/Pitch_of_brass_instruments) — trombone/trumpet ranges
- [Circular layout — Wikipedia](https://en.wikipedia.org/wiki/Circular_layout) — standard algorithm reference
- [Musical Instrument Recognition by XGBoost (arxiv.org)](https://arxiv.org/pdf/2206.00901) — spectral features for instrument recognition
- MDN browser-compat-data v7.3.6 (v1.0 research) — iOS Safari Web Audio API compat
