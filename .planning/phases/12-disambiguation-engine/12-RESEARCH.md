# Phase 12: Disambiguation Engine - Research

**Researched:** 2026-03-12
**Domain:** Web Audio API / DSP — per-instrument activity score disambiguation
**Confidence:** HIGH (codebase verified directly; DSP formulas from authoritative sources)

---

## Summary

Phase 12 adds a disambiguation layer on top of the existing activity scoring pipeline. The codebase already has a working precedent in `KbGuitarDisambiguator.ts` (keyboard/guitar pair using ZCR + spectral flux). Phase 12 generalizes the pattern to four new instrument pairs and adds a raw/display score split so disambiguators cannot cascade-suppress each other.

The research confirmed three critical facts: (1) Meyda's `spectralFlatness` extractor silently produces wrong results when any FFT bin is zero — `Math.log(0)` returns `-Infinity`, which collapses `Math.exp(-Infinity/N)` to `0`, making the ratio always return `0` regardless of the actual spectrum. A hand-rolled version with explicit zero-skip is required. (2) Meyda's `spectralFlux` extractor starts its loop at `-(bufferSize/2)`, producing negative array indices and reading `undefined` — it is `@ts-nocheck` annotated and acknowledges internal bugs. Hand-rolled spectral flux already exists in `KbGuitarDisambiguator.ts` and is the correct approach. (3) Tremolo detection at 10fps (100ms frames) is fundamentally limited: the Nyquist rate for 10fps is 5 Hz, which is exactly in the middle of the 3–7 Hz vibraphone motor range. Detection is marginal and must be treated as probabilistic, not deterministic.

**Primary recommendation:** Follow the wave build order prescribed in requirements. Implement all disambiguators as pure functions with pre-allocated Float32Array state (matching the pattern in `BeatState`, `TensionState`, etc.). Never call Meyda for spectralFlatness or spectralFlux.

---

## Standard Stack

No new libraries are required. Phase 12 is entirely hand-rolled DSP on top of the existing stack.

### Core (already installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Web Audio API | browser native | FFT via AnalyserNode, Uint8Array freq data | In use |
| Meyda | 5.6.3 | ZCR only (spectralFlatness/spectralFlux are broken) | In use |
| TypeScript | 5.x | Type safety for pre-allocated state | In use |
| Vite | current | Build | In use |

### What Meyda Can Be Used For (Phase 12)
- `zcr` — verified correct (used in KbGuitarDisambiguator)
- `chroma` — verified correct (used in ChordDetector)
- **NOT** `spectralFlatness` — Math.log(0) collapses result to 0 silently
- **NOT** `spectralFlux` — negative array index bug, @ts-nocheck file

### What Must Be Hand-Rolled
| Feature | Reason | Pattern to Follow |
|---------|--------|-------------------|
| spectralFlatness | Math.log(0) → -Infinity → wrong output | See Code Examples below |
| spectralFlux | Negative index bug, ts-nocheck | Already done in KbGuitarDisambiguator.ts |
| envelope amplitude buffer | Tremolo detection | New Float32Array ring buffer |
| Shannon entropy of chroma | Sax/keyboard disambiguation | Pure function on chroma[12] |
| spectral centroid (band-limited) | Horn ordering | Pure function on ampSpectrum slice |

**Installation:** No new packages needed.

---

## Architecture Patterns

### File Structure (new files for Phase 12)
```
src/audio/
├── types.ts                      # MODIFIED: add DisambiguationState, raw/display score split
├── instrumentFamilies.ts         # NEW: INSTRUMENT_FAMILIES constant, pair detection helpers
├── SpectralFeatures.ts           # NEW: hand-rolled spectralFlatness, spectralCentroid (band-limited)
├── TromboneBassDisambiguator.ts  # NEW: onset timing + spectral flatness
├── SaxKeyboardDisambiguator.ts   # NEW: band-limited chroma entropy
├── VibesKeyboardDisambiguator.ts # NEW: stateful tremolo detection (trickiest)
├── HornSectionDisambiguator.ts   # NEW: spectral centroid hierarchy (3+ horns)
├── DisambiguationEngine.ts       # NEW: orchestrator — runs all applicable disambiguators
└── AnalysisTick.ts               # MODIFIED: call DisambiguationEngine after activity scoring
```

### Pattern 1: Raw/Display Score Split (DISC-FND-01)

The current `InstrumentAnalysis.activityScore` is both the computed and displayed value. Phase 12 must split this. The raw score is computed from band energy; the display score is raw × disambiguation weight.

**How `AnalysisTick.ts` currently works (the pattern to preserve):**
```typescript
// Current (Phase 2):
instr.activityScore = computeActivityScore(...);  // single value, used for role and display

// Phase 12 target:
// 1. Compute raw score (same as now)
// 2. Store raw score in new rawActivityScore field
// 3. Disambiguators read rawActivityScore, write displayActivityScore
// 4. Role classification uses rawActivityScore (not display)
// 5. History ring buffer uses rawActivityScore (prevents cascade)
// 6. Zustand + canvas reads displayActivityScore
```

Add to `InstrumentAnalysis` in `types.ts`:
```typescript
rawActivityScore: number;     // pre-disambiguation, used by correlator and role classifier
displayActivityScore: number; // post-disambiguation, used by canvas and Zustand
```

### Pattern 2: DisambiguationState (DISC-FND-03)

Pre-allocated Float32Array ring buffers, same pattern as `BeatState`:
```typescript
// In types.ts (add alongside BeatState, TensionState, etc.)
export interface DisambiguationState {
  // Tremolo detection buffer — 20 frames = 2 seconds at 10fps
  // Stores per-frame RMS amplitude of the mid band
  tremoloRmsBuffer: Float32Array;     // length 20
  tremoloRmsHead: number;
  tremoloRmsSamples: number;

  // Spectral flatness history for trombone/bass pair — 10 frames = 1 second
  flatnessBuffer: Float32Array;       // length 10
  flatnessHead: number;
  flatnessSamples: number;

  // Tutti guard: counts consecutive frames where all instruments > 0.6
  tuttiFrameCount: number;
  isTutti: boolean;

  // Per-pair confidence output (read by UI for DISC-04 indicators)
  confidence: Record<string, number>; // key: 'trombone_bass', 'sax_keyboard', etc.
}
```

### Pattern 3: Tutti Detection Guard (DISC-FND-04)

```typescript
// Tutti = all instruments in lineup have rawActivityScore > 0.6
// When tutti is active, all disambiguators return equal weights (0.5/0.5 for pairs)
// This prevents false precision when everything is loud and overlapping

function isTuttiActive(instruments: InstrumentAnalysis[], threshold = 0.6): boolean {
  return instruments.every(i => i.rawActivityScore > threshold);
}
```

### Pattern 4: Disambiguator Guard (DISC-FND-05)

Each disambiguator only runs when its pair is present. This matches the existing pattern in `AnalysisTick.ts` for kb/guitar:
```typescript
// Example: TromboneBassDisambiguator
const hasTrombone = instrs.some(i => i.instrument === 'trombone');
const hasBass     = instrs.some(i => i.instrument === 'bass');
if (hasTrombone && hasBass && !isTutti) {
  runTromboneBassDisambiguator(...);
}
```

### Anti-Patterns to Avoid
- **Reading `activityScore` from `InstrumentAnalysis` during disambiguation**: use `rawActivityScore` only. Disambiguation weights applied to `displayActivityScore` must never feed back into the next round's raw computation.
- **Allocating new Float32Arrays inside the disambiguation functions**: all buffers go in `DisambiguationState`, allocated once in an `initDisambiguationState()` factory (matching `initBeatState`, `initChordState` patterns).
- **Calling `Meyda.extract('spectralFlatness', ...)` or `Meyda.extract('spectralFlux', ...)`**: both are broken. See SpectralFeatures.ts.
- **Assuming 10fps is sufficient for tremolo frequency detection**: use the amplitude envelope approach, not frequency-domain modulation detection.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZCR computation | custom ZCR loop | `Meyda.extract('zcr', ...)` | Already proven correct in codebase |
| Chroma extraction | custom filter bank | `Meyda.extract('chroma', ...)` | Already proven correct in codebase |
| FFT | custom FFT | `AnalyserNode.getByteFrequencyData()` | Browser-native, 0 allocation |
| Pearson correlation | custom correlator | existing `pearsonR` in `CrossCorrelationTracker.ts` | Already implemented |
| Ring buffer library | npm package | Float32Array + head/samples pattern | Already established pattern, no dependencies |

**Key insight:** The codebase has a strong established pattern: pre-allocated Float32Array ring buffers initialized in factory functions, updated in-place during tick. Every new stateful component must follow this exact pattern.

---

## Common Pitfalls

### Pitfall 1: Meyda spectralFlatness Silent Failure
**What goes wrong:** `Meyda.extract('spectralFlatness', ...)` returns 0 or near-0 for almost all real audio because `getByteFrequencyData()` returns a `Uint8Array` with many zero bins (silent bins), and `Math.log(0) = -Infinity`. The geometric mean collapses to 0.
**Why it happens:** Meyda's `spectralFlatness.ts` (line 13): `numerator += Math.log(ampSpectrum[i])` — no zero guard. `Math.exp(-Infinity / N) = 0`, so ratio is always 0 when any bin is 0.
**How to avoid:** Use the hand-rolled `computeSpectralFlatness` function in `SpectralFeatures.ts` that skips zero-valued bins in the log sum.
**Warning signs:** Flatness returns 0.0 constantly regardless of input.

### Pitfall 2: Tremolo Detection at 10fps
**What goes wrong:** Attempting to detect 3–7 Hz amplitude modulation at a 10fps analysis rate.
**Why it happens:** Nyquist theorem: to detect a signal of frequency f, you need a sample rate of at least 2f. At 10fps (10 Hz), the Nyquist limit is 5 Hz. Only tremolo rates from 3–5 Hz are theoretically detectable, and only with substantial noise. 6–7 Hz tremolo is below Nyquist threshold and will alias.
**How to avoid:** Use a 20-frame (2-second) RMS amplitude ring buffer. Compute variance of the RMS amplitude buffer. High variance = likely tremolo. This is a statistical indicator, not a precise frequency measurement. Calibrate confidence accordingly — vibes/keyboard is inherently the lowest-confidence pair.
**Warning signs:** Tremolo detection fires on piano sustain pedal passages or reverb tails.

### Pitfall 3: Cascade Suppression Without Raw/Display Split
**What goes wrong:** Disambiguator A suppresses instrument X's score. Disambiguator B reads X's suppressed score as its raw input. X's score gets double-suppressed.
**Why it happens:** If `activityScore` is both the disambiguation input and output, each disambiguator's output feeds the next one's input.
**How to avoid:** DISC-FND-01 mandates the raw/display split. Disambiguators read `rawActivityScore`, write `displayActivityScore`. Role classifier and cross-correlator always use `rawActivityScore`. Canvas and Zustand read `displayActivityScore`.
**Warning signs:** Instruments whose score locks to 0 when multiple disambiguators are active.

### Pitfall 4: Spectral Centroid Horn Ordering Fails at High Dynamics
**What goes wrong:** Research confirms spectral centroid increases with dynamic level (louder = brighter). So a forte trombone passage can have a higher centroid than a piano trumpet passage, inverting the expected trombone < sax < trumpet hierarchy.
**Why it happens:** Spectral centroid is correlated with fundamental frequency AND dynamic level. At fortissimo, all brass instruments sound brighter.
**How to avoid:** Apply horn centroid ordering only when individual instrument activity scores are moderate (e.g., 0.2–0.7). When any horn is above 0.8 (very loud), reduce centroid disambiguation confidence. This is already implicitly handled by the tutti guard at 0.6.
**Warning signs:** Horn ordering inverts during loud climactic passages.

### Pitfall 5: Trombone Overlaps Bass Band
**What goes wrong:** Trombone fundamental frequencies (82–466 Hz, with the fundamental often absent) overlap significantly with the bass band (20–250 Hz). Onset timing is the main discriminator, not just spectral flatness.
**Why it happens:** Trombone is a whole-tube instrument — it can produce fundamentals at 82 Hz. Bass also occupies this region.
**How to avoid:** Combine two signals for trombone/bass disambiguation: (1) spectral flatness in the mid band (250–2000 Hz) — bass has lower harmonics here, trombone has stronger mid presence; (2) onset rate — bass plays isolated notes with clear onsets, trombone sustains with fewer distinct onsets.
**Warning signs:** Trombone and bass scores are identical even when one is clearly louder.

### Pitfall 6: Sax Band-Limited Chroma Entropy
**What goes wrong:** Full-spectrum chroma includes bass and drum energy, making chroma entropy high for all instruments, defeating the sax/keyboard disambiguation.
**Why it happens:** Meyda chroma uses the full FFT spectrum, so kick drum and bass notes appear in chroma bins.
**How to avoid:** Band-limit the chroma computation to 250–2500 Hz (sax fundamental and first few harmonics) before computing entropy. Saxophone playing monophonic runs concentrates energy in a few pitch classes (low entropy in that band). Keyboard playing chords spreads energy across more pitch classes (higher entropy).
**Warning signs:** Entropy is high for both instruments simultaneously during loud passages.

---

## Code Examples

Verified patterns from codebase and corrected formulas:

### Hand-Rolled SpectralFlatness (SpectralFeatures.ts)
```typescript
// Source: Derived from openae.io/standards/features/latest/spectral-flatness/
// with explicit zero-skip to fix Meyda's Math.log(0) bug
// Input: Uint8Array slice (band-limited or full spectrum)
export function computeSpectralFlatness(freqData: Uint8Array, lowBin: number, highBin: number): number {
  let logSum = 0;
  let linSum = 0;
  let count = 0;

  for (let i = lowBin; i <= highBin; i++) {
    const v = freqData[i];
    if (v === 0) continue; // skip zero bins — log(0) = -Infinity
    logSum += Math.log(v);
    linSum += v;
    count++;
  }

  if (count === 0 || linSum === 0) return 0;

  const geometricMean = Math.exp(logSum / count);
  const arithmeticMean = linSum / count;
  return geometricMean / arithmeticMean; // [0, 1], 1 = noise-like, 0 = tonal
}
```

### Band-Limited Spectral Centroid (SpectralFeatures.ts)
```typescript
// Source: Spectral centroid = sum(bin * magnitude) / sum(magnitude), band-limited
// Used for horn section ordering: trombone < sax < trumpet
export function computeBandCentroid(
  freqData: Uint8Array,
  lowBin: number,
  highBin: number,
  sampleRate: number,
  fftSize: number
): number {
  let weightedSum = 0;
  let totalMag = 0;

  for (let i = lowBin; i <= highBin; i++) {
    const mag = freqData[i];
    const hz = (i * sampleRate) / fftSize;
    weightedSum += hz * mag;
    totalMag += mag;
  }

  return totalMag > 0 ? weightedSum / totalMag : 0;
}
```

### Shannon Entropy of Chroma (SaxKeyboardDisambiguator.ts)
```typescript
// Source: H = -sum(p * log2(p)) over normalized chroma vector
// Band-limited chroma: restrict to bins corresponding to 250–2500 Hz before passing to Meyda
// Saxophone (monophonic): low entropy (few pitch classes active)
// Keyboard (chords): high entropy (multiple pitch classes spread energy)
export function chromaEntropy(chroma: number[]): number {
  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;

  let entropy = 0;
  for (const v of chroma) {
    const p = v / sum;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy; // [0, log2(12)] ≈ [0, 3.585]
  // Normalize: entropy / Math.log2(12) → [0, 1]
}
```

### Tremolo Detection via RMS Variance (VibesKeyboardDisambiguator.ts)
```typescript
// Source: amplitude modulation detection via envelope variance
// At 10fps, detect tremolo by variance of per-frame RMS amplitude
// NOT by frequency analysis (Nyquist limit prevents precise 3-7 Hz detection)

// Each tick: push current mid-band RMS into ring buffer
// After >= 10 samples: compute variance of ring buffer
// High variance (> threshold) = probable tremolo = vibes-active

export function pushRmsSample(state: DisambiguationState, rms: number): void {
  state.tremoloRmsBuffer[state.tremoloRmsHead] = rms;
  state.tremoloRmsHead = (state.tremoloRmsHead + 1) % 20;
  if (state.tremoloRmsSamples < 20) state.tremoloRmsSamples++;
}

export function computeRmsVariance(state: DisambiguationState): number {
  const n = state.tremoloRmsSamples;
  if (n < 5) return 0; // insufficient data

  let sum = 0;
  for (let i = 0; i < n; i++) sum += state.tremoloRmsBuffer[i];
  const mean = sum / n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = state.tremoloRmsBuffer[i] - mean;
    variance += d * d;
  }
  return variance / n;
}
```

### Ring Buffer Init Pattern (from existing codebase, to replicate)
```typescript
// Source: /src/audio/types.ts — BeatState, TensionState patterns
// All Float32Arrays pre-allocated in factory function, never re-allocated in tick

export function initDisambiguationState(): DisambiguationState {
  return {
    tremoloRmsBuffer: new Float32Array(20),
    tremoloRmsHead: 0,
    tremoloRmsSamples: 0,
    flatnessBuffer: new Float32Array(10),
    flatnessHead: 0,
    flatnessSamples: 0,
    tuttiFrameCount: 0,
    isTutti: false,
    confidence: {},
  };
}
// Called when lineup composition changes (not per-tick)
```

### How AnalysisTick.ts Inserts a New Disambiguator (Pattern)
```typescript
// Source: AnalysisTick.ts lines 151-182 — existing kb/guitar guard pattern
// Phase 12 adds DisambiguationEngine call after all activity scores are computed

// After computing all rawActivityScores:
if (state.disambiguation) {
  runDisambiguationEngine(
    instrs,
    state.rawFreqData,
    state.analysis.prevRawFreqData,
    state.bands,
    state.sampleRate,
    state.fftSize,
    state.disambiguation,
  );
  // disambiguationEngine writes displayActivityScore on each instr
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Single `activityScore` field | Raw + display score split | Prevents cascade suppression |
| Meyda spectralFlatness | Hand-rolled with zero-skip | Correct results instead of always-0 |
| No tremolo detection | RMS variance buffer | Probabilistic vibes indicator |
| All pairs always run | Instrument-presence guard | No wasted computation for absent instruments |

**Deprecated/outdated in this phase:**
- Direct mutation of `instr.activityScore` in disambiguation: replaced by `instr.displayActivityScore`
- Calling Meyda for any feature that processes raw FFT data directly (spectralFlatness, spectralFlux)

---

## Instrument-Specific DSP Facts

### Trombone vs Bass (DISC-01)
- Trombone fundamentals: 82–466 Hz (tenor), 58–466 Hz (bass trombone)
- Bass fundamentals: 40–200 Hz (upright bass typical range)
- Key differentiator: Spectral flatness in mid band (250–2000 Hz). Trombone slides/glissandi produce more inharmonic content (higher flatness). Bass plays cleaner, more tonal notes (lower flatness).
- Secondary differentiator: Onset rate. Bass has higher onset rate (walking bass = ~4 onsets/beat). Trombone sustains longer.
- DISC-01 requirement: "onset timing and spectral flatness" — both features are needed.
- Band to use for flatness: mid band (bins for 250–2000 Hz)

### Vibraphone vs Keyboard (DISC-02) — Hardest Pair
- Vibraphone motor rate: 1–12 Hz, typically 3–7 Hz in jazz
- Detection constraint: At 10fps (Nyquist = 5 Hz), only rates 3–5 Hz are theoretically detectable, and only probabilistically via RMS variance.
- Motor-off vibes (bow technique, slow passages): indistinguishable from keyboard. Do not attempt to discriminate.
- The confidence indicator (DISC-04) for this pair must honestly report LOW confidence as the default state.
- Frequency overlap: Both occupy mid (250–2000 Hz) and mid_high (300–3000 Hz) bands.
- Best approach: 20-frame RMS amplitude variance buffer on the mid band. Vibes with motor running shows regular amplitude oscillation; keyboard shows more sustained amplitude.

### Horn Section (DISC-03) — 3+ Horns Required
- Spectral centroid ordering: trombone < saxophone < trumpet (generally)
- This ordering is tone-consistent but dynamic-level-dependent. At forte, all centroids shift higher.
- Practical centroid ranges (from search results, MEDIUM confidence):
  - Trombone: centroid typically 600–1200 Hz (fundamental 82–466 Hz, harmonics to 5 kHz+)
  - Alto/Tenor Sax: centroid typically 800–2000 Hz (range 233–1480 Hz + harmonics)
  - Trumpet: centroid typically 1500–3000 Hz (range 185–1174 Hz + strong upper harmonics)
- Implementation: Compute band-limited spectral centroid for each horn in lineup. Sort by centroid to assign discrimination weights.
- Guard: Only run when 3+ horn instruments are present (trombone, saxophone, trumpet count; vibes/keyboard do not).

### Saxophone vs Keyboard (DISC-05)
- Saxophone: monophonic melodic instrument. When playing runs, energy concentrates in 1–2 pitch classes at a time. Band-limited chroma entropy is LOW.
- Keyboard: chords spread energy across 3–4 pitch classes. Band-limited chroma entropy is HIGHER.
- Band limit for chroma: 250–2500 Hz. This excludes bass/kick contamination.
- Entropy thresholds (LOW confidence — empirical calibration needed): below 0.3 normalized = likely sax solo; above 0.5 normalized = likely keyboard chord; 0.3–0.5 = uncertain.
- Chroma can still be extracted via Meyda (verified correct), then entropy computed separately.

---

## Open Questions

1. **Chroma entropy thresholds (0.3/0.5) for sax/keyboard**
   - What we know: These are estimates from the requirements document
   - What's unclear: Real jazz recordings may have very different entropy distributions. A jazz saxophone player frequently double-stops or plays ornaments that activate multiple pitch classes simultaneously.
   - Recommendation: Implement with configurable thresholds. Flag thresholds as `CALIBRATION_NEEDED` in code comments. Expect first-pass values to need tuning.

2. **Spectral flatness cutoffs for trombone/bass**
   - What we know: Flatness ranges 0 (tonal) to 1 (noise). Trombone should be more "noisy" than bass due to slide positions and harmonic complexity.
   - What's unclear: Actual flatness values for upright bass vs. trombone in a jazz context have not been empirically validated.
   - Recommendation: Start with flatness > 0.3 as "trombone-leaning." Instrument testing at runtime will be required.

3. **Spectral centroid exact ranges for horn ordering**
   - What we know: General ordering is trombone < sax < trumpet. Centroid increases with dynamics.
   - What's unclear: Overlap is substantial at jazz dynamics. A loud trombone and a soft trumpet may have centroids in the same range.
   - Recommendation: Use centroid ordering as a soft weight (not a binary switch). When centroids are within 200 Hz of each other, reduce confidence weight toward 0.5 (equal).

4. **DisambiguationState reset on lineup change**
   - What we know: `initDisambiguationState()` should be called when lineup changes (same as `initAnalysisState()`).
   - What's unclear: The exact hook where lineup changes are handled — likely in `useRef` in `App.tsx` or the canvas setup.
   - Recommendation: Add `state.disambiguation` reset logic in the same location as `state.analysis` is re-initialized when lineup changes.

5. **DISC-04 confidence indicator UI location**
   - What we know: Requires a confidence indicator visible "per instrument."
   - What's unclear: Whether this goes in the canvas node graph (each instrument node) or in a UI panel.
   - Recommendation: Store `confidence` as a Record in `DisambiguationState` (keyed by pair name). Push to Zustand via `onDisambiguationUpdate` callback from `AnalysisTick.ts`. UI implementation is out of scope for DSP research.

---

## Sources

### Primary (HIGH confidence)
- `/Users/seijimatsuda/jazz_learning/node_modules/meyda/src/extractors/spectralFlatness.ts` — confirmed Math.log(0) bug (no zero guard)
- `/Users/seijimatsuda/jazz_learning/node_modules/meyda/src/extractors/spectralFlux.ts` — confirmed `-(bufferSize/2)` negative index bug, `@ts-nocheck`
- `/Users/seijimatsuda/jazz_learning/src/audio/types.ts` — confirmed existing state pattern (BeatState, TensionState ring buffer convention)
- `/Users/seijimatsuda/jazz_learning/src/audio/InstrumentActivityScorer.ts` — confirmed band map, MID_RANGE_INSTRUMENTS, activity score computation
- `/Users/seijimatsuda/jazz_learning/src/audio/KbGuitarDisambiguator.ts` — confirmed existing disambiguator pattern, weight clamping to [0.15, 0.85]
- `/Users/seijimatsuda/jazz_learning/src/audio/AnalysisTick.ts` — confirmed 10fps tick structure, instrument-presence guard pattern
- [openae.io spectral flatness standard](https://openae.io/standards/features/latest/spectral-flatness/) — authoritative formula with log(0) handling

### Secondary (MEDIUM confidence)
- WebSearch: trombone fundamental range 58–466 Hz, multiple sources agree
- WebSearch: saxophone range 233–1480 Hz fundamental, aligns with codebase mid band (250–2000 Hz)
- WebSearch: vibraphone motor rate 1–12 Hz, typically 3–7 Hz in jazz — corroborated by multiple audio plugin and instrument pages
- WebSearch: spectral centroid ordering for brass (smaller instrument = higher centroid) — from Acoustical Society research summary

### Tertiary (LOW confidence — empirical calibration required)
- Chroma entropy thresholds (0.3/0.5 normalized) — from requirements document, not independently validated
- Spectral flatness cutoff for trombone/bass split (0.3) — estimated, unverified against real recordings
- Precise Hz centroid ranges per instrument (600–3000 Hz ranges cited) — from mixing/EQ guides, not acoustic measurement studies

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing codebase fully read, no new libraries needed
- Architecture patterns: HIGH — established ring buffer and disambiguator patterns verified in codebase
- Meyda bug confirmation: HIGH — read source directly, confirmed Math.log(0) and negative index bugs
- Hand-rolled formulas: HIGH — spectralFlatness, spectralCentroid, Shannon entropy are standard DSP
- Tremolo detection feasibility: HIGH — Nyquist argument is mathematical, 10fps = 5 Hz Nyquist limit
- Instrument frequency ranges: MEDIUM — from mixing/audio guides, not acoustic research papers
- Disambiguation thresholds: LOW — estimates only, require empirical calibration on real jazz audio

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable domain; no library updates expected)
