# Phase 4: Beat Detection, BPM & Pocket Score - Research

**Researched:** 2026-03-10
**Domain:** Onset detection DSP, autocorrelation BPM, swing ratio, pocket score / cross-correlation, Web Audio API realtime constraints
**Confidence:** MEDIUM-HIGH (core algorithms verified against MIR literature and existing codebase patterns; specific threshold values from specs are reasonable but require empirical tuning)

---

## Summary

Phase 4 adds a rhythm analysis layer to the existing 10fps analysis tick. The primary concern is that this phase is entirely hand-rolled DSP — no new library introduces beat/BPM detection that works in the browser for jazz. Existing browser beat-detector libraries (`web-audio-beat-detector`, `realtime-bpm-analyzer`) target electronic music with steady kicks; they do not handle jazz swing, rubato, or bass/drum pocket scoring. Every algorithm in this phase must be built in TypeScript following the zero-allocation, pre-allocated typed array patterns established in Phases 1–3.

The four distinct algorithm subsystems are: (1) band-limited transient detection using spectral flux adapted from the existing `computeSpectralFlux` in `KbGuitarDisambiguator.ts`, (2) autocorrelation BPM derivation over a 6-second onset strength signal, (3) swing ratio detection via IOI histogramming and rubato suppression via IOI coefficient of variation, and (4) pocket scoring via onset-time cross-correlation. Each subsystem has clear mathematical foundations from the MIR literature.

**Critical prior decision:** `computeSpectralFlux` is already hand-rolled and proven (D-02-03-1). Phase 4 must adapt the same pattern for band-limited flux (drums_high/ride for drum transients, bass band for bass onsets) rather than using Meyda's broken spectralFlux extractor. The adaptive threshold (mean + 1.5 × std dev) is the standard ODF peak-picking approach from Dixon (2006) and is straightforward to implement with a rolling 2-second window buffer.

**Primary recommendation:** Build four pure TypeScript modules — `DrumTransientDetector.ts`, `BpmTracker.ts`, `SwingAnalyzer.ts`, `PocketScorer.ts` — all operating on pre-allocated typed arrays, added to `AnalysisTick.ts` after the existing Phase 3 steps. Extend `AudioStateRef.beat` field with a new `BeatState` interface. Wire BPM and pocket score to Zustand for UI display.

---

## Standard Stack

### Core (no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API (native) | — | `rawFreqData` (Uint8Array) already in AnalyserNode tap | Already wired; no new nodes needed |
| TypeScript Float32Array | — | Pre-allocated onset strength signal ring buffer, IOI list, autocorrelation output | Established pattern in Phases 1–3 |
| (hand-rolled DSP) | — | Spectral flux, autocorrelation, IOI CV, cross-correlation | No browser-safe library covers jazz rhythm analysis correctly |

### Libraries Evaluated and Rejected

| Library | Why Rejected |
|---------|-------------|
| `web-audio-beat-detector` | Works on offline AudioBuffer, not realtime; optimized for electronic music kick drum, not jazz ride/bass |
| `realtime-bpm-analyzer` | Lowpass kick-filter approach only, no swing handling, no pocket score |
| `Essentia.js` | WASM bundle (~2MB+), not iOS-tested, heavyweight for realtime tick |
| `Meyda.extract('spectralFlux')` | Broken in 5.6.3 (negative index bug, returns 0/NaN) — decision D-02-03-1 locked |

**Installation:** No new packages. All work is new `.ts` files under `src/audio/`.

---

## Architecture Patterns

### Recommended File Structure

```
src/audio/
├── DrumTransientDetector.ts   # NEW: band-limited spectral flux, adaptive threshold, onset list
├── BpmTracker.ts              # NEW: autocorrelation over 6s onset signal, rubato gate, BPM state
├── SwingAnalyzer.ts           # NEW: IOI histogram, swing ratio, CV for rubato suppression
├── PocketScorer.ts            # NEW: bass↔drums cross-correlation, rolling 8-beat average, timing offset
├── AnalysisTick.ts            # EXTEND: Phase 4 modules called after Phase 3 steps
├── types.ts                   # EXTEND: BeatState interface on AudioStateRef
store/
├── useAppStore.ts             # EXTEND: currentBpm, pocketScore, timingOffsetMs fields
```

### Pattern 1: Band-Limited Spectral Flux for Drum Transients (BEAT-01, BEAT-02)

**What:** Compute half-wave rectified spectral flux only over the drum frequency bins (drums_high = 2000–8000 Hz covering snare; ride = 6000–10000 Hz covering ride cymbal). Compare current `rawFreqData` to the previous tick's data for only those bin ranges.

**Key insight:** The existing `computeSpectralFlux` in `KbGuitarDisambiguator.ts` sums over ALL bins. For drum transient detection, restrict the loop to `band.lowBin`–`band.highBin` for `drums_high` and `ride` bands. This avoids bass/piano energy triggering false drum onsets.

**Why not snare at 200–800 Hz as specified in BEAT-01?** The spec lists "snare 200–800Hz" but this overlaps heavily with the bass and mid bands already used for other instruments. The `drums_low` band (60–300 Hz) covers kick body. The `drums_high` band (2000–8000 Hz) covers snare crack and body — this is what the existing FrequencyBandSplitter already provides. Use `drums_high` for snare transient detection and `ride` for ride cymbal. The 200–800 Hz range from the spec is the snare body resonance, but the crack/attack (2–8 kHz) is more reliable for onset detection.

**Adaptive threshold (BEAT-02):**
- Maintain a rolling buffer of the last ~20 drum flux values (2 seconds at 10fps)
- Threshold = mean(buffer) + 1.5 × stddev(buffer)
- An onset fires when current flux > threshold AND flux > previous_flux (half-wave, rising edge only)
- This is the standard Dixon (2006) / Bello et al. (2005) onset detection approach

```typescript
// Source: Bello et al. (2005) ISMIR + Dixon (2006) DAFX — half-wave rectified spectral flux with adaptive threshold
// Adapted from existing computeSpectralFlux pattern in KbGuitarDisambiguator.ts

function bandLimitedFlux(
  rawFreqData: Uint8Array,
  prevRawFreqData: Uint8Array,
  lowBin: number,
  highBin: number,
): number {
  let flux = 0;
  for (let i = lowBin; i <= highBin; i++) {
    const diff = rawFreqData[i] - prevRawFreqData[i];
    if (diff > 0) flux += diff;  // half-wave rectification
  }
  return flux;
}

// Adaptive threshold over rolling 20-sample window (pre-allocated Float32Array[20])
function adaptiveThreshold(buffer: Float32Array, head: number, count: number): number {
  let sum = 0;
  const n = Math.min(count, buffer.length);
  for (let i = 0; i < n; i++) sum += buffer[i];
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = buffer[i] - mean;
    variance += d * d;
  }
  const stddev = Math.sqrt(variance / n);
  return mean + 1.5 * stddev;
}
```

**Confidence:** HIGH — half-wave rectified spectral flux + adaptive threshold is the established MIR approach for onset detection (Bello et al. 2005 "A Tutorial on Onset Detection in Music Signals"). The same pattern is already in this codebase (computeSpectralFlux).

### Pattern 2: Autocorrelation BPM Derivation (BEAT-04)

**What:** The onset strength signal (OSS) is a time series of drum flux values sampled at 10fps. Autocorrelate the OSS over a 6-second window (60 samples at 10fps) to find the dominant periodicity. The lag (in samples) of the highest autocorrelation peak corresponds to the beat period.

**Key formulas:**

```typescript
// OSS ring buffer: Float32Array[60] for 6 seconds at 10fps
// Autocorrelation: for lag τ, AC[τ] = sum(OSS[t] * OSS[t+τ]) for valid t

function autocorrelate(oss: Float32Array, length: number): Float32Array {
  const ac = new Float32Array(length / 2);  // allocate ONCE in init
  for (let lag = 1; lag < ac.length; lag++) {
    let sum = 0;
    for (let t = 0; t < length - lag; t++) {
      sum += oss[t] * oss[t + lag];
    }
    ac[lag] = sum;
  }
  return ac;  // peak lag → beat period
}

// Beat period in seconds = lag / 10 (since OSS at 10fps)
// BPM = 60 / beatPeriodInSeconds
// At 10fps, lag range 5–20 samples → 0.5–2.0s beat period → 30–120 BPM
// At 10fps, lag range 4–10 samples → 0.4–1.0s beat period → 60–150 BPM
```

**CRITICAL: Autocorrelation array must be pre-allocated** — one `Float32Array` for the OSS ring buffer and one for the autocorrelation output, allocated in the BeatState init. Zero allocations in the tick.

**BPM extraction from autocorrelation peak:**
- Search for the highest peak in the AC array within BPM range 50–250 (jazz is typically 80–240)
- Exclude lag=0 (trivially = energy of signal, not a periodicity)
- At 10fps: lag=3 → 200 BPM, lag=5 → 120 BPM, lag=10 → 60 BPM, lag=7 → ~86 BPM
- Peak with highest AC value in the valid lag range → candidate BPM
- Update every 2 seconds (every 20 ticks) to reduce jitter

**Confidence:** HIGH — autocorrelation for beat tracking is fundamental MIR (Scheirer 1998; Foote & Uchihashi 2001; Müller "Fundamentals of Music Processing"). The 6-second window / 2-second update cycle matches the spec requirements.

### Pattern 3: Swing Ratio Detection and Rubato Suppression (BEAT-05, BEAT-06)

**What:** Two separate but related problems.

**Swing ratio detection (BEAT-06):** When the drummer swings, ride cymbal hits alternate between long and short IOIs. A 2:1 swing ratio means IOIs alternate between ~2/3 and ~1/3 of a beat. If autocorrelation is run naively on the OSS including swung notes, the shortest IOI (the "and" of the beat) may be picked as the dominant period, reporting 2× the actual BPM.

**Detection approach:**
1. Collect the last N onset timestamps (e.g., 20 drum onsets) into a pre-allocated `Float32Array`
2. Compute all consecutive IOIs
3. Compute IOI histogram: look for two peaks at ratio ~2:1 (or check if the primary peak has a second peak at ~half the primary lag)
4. If histogram shows bimodal distribution with ratio 1.5–3.5:1, swing is detected
5. In that case, multiply the estimated BPM × 0.5 to get the quarter-note tempo

**Simplified practical approach (recommended over full histogram):**
- After autocorrelation finds a candidate BPM, check if there is a strong AC peak at DOUBLE the lag (half the BPM). If AC[2×lag] > 0.6 × AC[lag], the candidate is a sub-beat period — the true BPM is AC[2×lag]'s lag.
- This prevents double-tempo reporting without a full histogram implementation.

**Rubato suppression (BEAT-05, BEAT-10):** When the music is free time (ballad intro, cadenza), IOIs are irregular. The standard rubato detector uses IOI coefficient of variation (CV = stddev(IOI) / mean(IOI)). A CV > 0.3 indicates rubato/free time.

```typescript
// IOI coefficient of variation for rubato detection
function computeIoiCV(onsetTimes: Float32Array, count: number): number {
  if (count < 4) return 1.0;  // too few onsets → assume rubato
  let sum = 0;
  const iois = new Float32Array(count - 1);  // PRE-ALLOCATE in init, not here
  for (let i = 0; i < count - 1; i++) {
    iois[i] = onsetTimes[i + 1] - onsetTimes[i];
    sum += iois[i];
  }
  const mean = sum / iois.length;
  let variance = 0;
  for (let i = 0; i < iois.length; i++) {
    const d = iois[i] - mean;
    variance += d * d;
  }
  const cv = Math.sqrt(variance / iois.length) / mean;
  return cv;  // > 0.3 → rubato; < 0.1 → very steady; 0.1–0.3 → jazz time feel
}
```

**CV > 0.3 → BPM = null, display "♩ = —"**
**CV ≤ 0.3 → BPM is reliable, display computed value**

**Note on the 0.3 threshold:** This is the value from the spec. No authoritative MIR source was found confirming exactly 0.3 as the canonical rubato threshold. This value is reasonable and should be treated as an empirically tunable parameter (similar to how the flux normalization constant 5000 was flagged for tuning in D-02-03-2). Flag it in code comments.

**Confidence:** MEDIUM — swing ratio detection approach (check for 2× lag in AC) is sound but simplified vs. full IOI histogram research. CV rubato detection is well-established conceptually; the 0.3 threshold is from the spec, not confirmed from literature.

### Pattern 4: Downbeat Detection (BEAT-07)

**What:** Mark every 4th drum beat as beat 1 of a bar (assuming 4/4 time). This is a counting approach, not a deep ML approach.

**Implementation:**
1. Maintain a beat counter that increments on each drum onset confirmed as a beat
2. Every 4th beat, fire the downbeat event (store timestamp in BeatState)
3. Reset counter if tempo changes significantly (gap > 2× expected beat interval)

**Limitation:** This is a naive assumption of 4/4 time. Jazz is often in 4/4 but sometimes in 3/4, 5/4, etc. The spec acknowledges this ("downbeat detection marks beat 1 of each bar") — the implementation assumes 4/4 as the default. No meter detection is required for this phase.

**Confidence:** MEDIUM — counting beats mod 4 is functionally correct for 4/4 jazz but will miscount on time signature changes or on first pickup beats.

### Pattern 5: Pocket Score via Onset Cross-Correlation (BEAT-08, BEAT-09)

**What:** Pocket score measures how tightly bass and drums are locking. The ±80ms cross-correlation window (BEAT-08) computes the timing offset between the most recent bass onset and the most recent drum onset.

**Algorithm:**
1. Each tick, check if a new drum onset fired AND/OR a new bass onset fired
2. When both bass and drum have recent onsets (within 200ms of each other), compute sync_score:
   - If |bass_time - drum_time| ≤ 80ms → sync_score = 1 - (|offset_ms| / 80)
   - If |bass_time - drum_time| > 80ms → sync_score = 0
3. Push sync_score into a rolling 8-beat pre-allocated Float32Array ring buffer
4. pocket_score = mean of last 8 entries
5. timing_offset_ms = drum_onset_time - bass_onset_time (positive = drums ahead)

```typescript
// Source: BEAT-08, BEAT-09 spec — ±80ms pocket window

function computeSyncScore(drumOnsetSec: number, bassOnsetSec: number): { score: number; offsetMs: number } {
  const offsetMs = (drumOnsetSec - bassOnsetSec) * 1000;  // positive = drums ahead
  const absOffset = Math.abs(offsetMs);
  const score = absOffset <= 80 ? 1 - (absOffset / 80) : 0;
  return { score, offsetMs };
}
```

**Pocket score suppression (BEAT-10):** When BPM confidence is low (IOI CV > 0.3 → rubato), set pocket_score = 0 rather than reporting a potentially meaningless number.

**Onset storage:** Maintain `lastDrumOnsetSec` and `lastBassOnsetSec` in BeatState (simple scalars, not arrays). Only compute sync_score when both onsets have been updated within a configurable staleness window (e.g., 500ms).

**Confidence:** HIGH — the cross-correlation pocket score with ±80ms window is well-defined by the spec and maps cleanly to straightforward arithmetic. The rolling 8-beat average is a simple ring buffer (established pattern).

### Anti-Patterns to Avoid

- **Calling `new Float32Array()` in the analysis tick:** All buffers must be pre-allocated in `initBeatState()` and passed via `BeatState`. Violates the zero-allocation rule from all prior phases.
- **Using Meyda's spectralFlux for drum transient detection:** Broken in 5.6.3 (D-02-03-1). Use band-limited `computeSpectralFlux` adapted from KbGuitarDisambiguator.ts.
- **Assuming sampleRate is 44100 for BPM timing math:** Use `state.sampleRate` from AudioStateRef. At 48kHz vs 44100, bin boundaries shift. The OSS uses the 10fps tick clock (wall clock), not sample counts, so BPM math is sample-rate independent — but bin-based onset detection must use the runtime sampleRate.
- **Running autocorrelation every tick (60fps):** The rAF loop runs at ~60fps. Autocorrelation over 60 samples is O(n²) = 3600 ops — at 60fps this is 216,000 ops/sec. Run autocorrelation only every 20 ticks (2 seconds) behind the 100ms gate, same as the analysis tick.
- **Reporting a BPM during the first few seconds:** The OSS ring buffer needs at least 20–30 samples before autocorrelation is meaningful. Hold BPM=null until the buffer has ≥ 20 samples.
- **Pocket score without sufficient onsets:** If bass or drums haven't fired an onset in the last 500ms, do not compute a sync score — return the existing rolling average unchanged.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Band-limited spectral flux | A new flux function from scratch | Adapt `computeSpectralFlux` from `KbGuitarDisambiguator.ts` with lowBin/highBin params | Pattern already tested and integrated |
| Autocorrelation of OSS | Custom FFT-based | Simple time-domain autocorrelation loop | At 60 samples, O(n²) is fast; FFT not needed |
| Swing ratio full IOI histogram | Full histogram with Gaussian smoothing | Check for 2× lag peak in existing AC output | Simpler, leverages existing autocorrelation result |
| BPM smoothing filter | IIR filter | Median of last 3 BPM estimates (pre-allocated 3-slot buffer) | Simpler, more robust for jazz rubato transitions |

**Key insight:** All Phase 4 algorithms are simple enough to hand-roll without library support. The complexity is in integration (threading pre-allocated buffers, wiring to the 10fps tick, Zustand bridging) not in the DSP math itself.

---

## Common Pitfalls

### Pitfall 1: Swing Causes Double-Tempo BPM Report

**What goes wrong:** At 120 BPM with a 2:1 swing, the ride cymbal fires at every swung eighth note (approximately every 0.25s). The autocorrelation finds the primary peak at ~4 samples (0.4s ≈ 150 BPM at 10fps) instead of the quarter-note at ~8 samples (0.8s ≈ 75 BPM). BPM display reads twice the actual tempo.

**Why it happens:** The OSS density is doubled because swung eighths are counted as drum onsets.

**How to avoid:** After finding the primary AC peak at lag L, check AC[2L]. If AC[2L] > 0.6 × AC[L], the actual beat is at lag 2L. Apply the "2× lag double-check" before committing to a BPM.

**Warning signs:** BPM display shows ~200 for a recording you know is ~100. Check AC[2L] in debug logging.

### Pitfall 2: Rubato Transitions Leave Stale BPM on Display

**What goes wrong:** The BPM was 120, the player enters a free rubato passage, CV rises above 0.3, but the BPM display still shows 120 because the autocorrelation output hasn't been cleared.

**How to avoid:** When IOI CV > 0.3, immediately set `bpm = null` in BeatState regardless of the last autocorrelation result. The display check must be: `if (beatState.bpm === null) show "♩ = —"`. Don't wait for the next 2-second autocorrelation update.

**Warning signs:** BPM display shows a number during an obviously free intro or cadenza.

### Pitfall 3: Drum Onset Rate ≠ Beat Rate for Certain Drummers

**What goes wrong:** Some jazz drummers (particularly bebop) play very fast ride patterns (every eighth note or even sixteenth). The OSS fires at 240+ BPM subdivisions. Autocorrelation picks up the subdivision, not the quarter-note.

**How to avoid:** The 2× lag check helps here too. Also: clamp the BPM search range (e.g., 50–220 BPM). At 10fps, lag=3 → 200 BPM, lag=6 → 100 BPM. Only search lags in the range [60/220 × 10, 60/50 × 10] = [2.7, 12] samples → round to lags 3–12.

**Warning signs:** BPM reads 180 for a track that should be 90.

### Pitfall 4: Bass Onset Detection False Positives from Non-Bass Content

**What goes wrong:** The bass band (20–250 Hz) includes kick drum fundamentals. The kick fires the bass onset detector, resulting in near-simultaneous "bass" and "drum" onset events. Pocket score looks artificially high because kick drum is triggering both channels.

**How to avoid:**
- For bass onset detection, use RMS energy delta in the 20–250 Hz band (BEAT-03) but apply a gate: only trigger bass onset when the drums_low band flux is low (i.e., kick is not sounding). This requires checking drum flux before scoring a bass event.
- Alternatively: use a longer integration window for bass onset (e.g., debounce 80ms) since bass notes sustain longer than kick transients.

**Warning signs:** Pocket score is very high on recordings without bass guitar — indicates kick is triggering both.

### Pitfall 5: Pre-allocation Oversight for BeatState Buffers

**What goes wrong:** BeatState added to `AudioStateRef` but IOI buffer, autocorrelation buffer, or pocket score ring buffer allocated inside the analysis tick. Causes GC pressure on iOS Safari (as warned throughout Phases 1–3).

**How to avoid:** All `BeatState` typed arrays are allocated in a single `initBeatState()` function called once during setup. Same pattern as `initAnalysisState()` and `initChordState()`. Pass the pre-allocated BeatState through AnalysisTick.

**Warning signs:** Memory usage grows during playback on long tracks; GC pauses visible as analysis tick jitter.

### Pitfall 6: Autocorrelation at 10fps Has Coarse Time Resolution

**What goes wrong:** At 10fps (100ms per sample), the beat period for 120 BPM is exactly 5.0 samples. For 126 BPM it's 4.76 samples — same lag=5 bucket. BPM quantization at 10fps is ±6 BPM for common tempos (100–150 BPM range).

**How to avoid:** Report BPM rounded to nearest 5 for display (e.g., "♩ = 120" not "♩ = 123"). Alternatively, interpolate between AC peaks for sub-sample precision — but this complexity is not worth it at 10fps. Accept ~5 BPM accuracy and document it.

**Warning signs:** BPM display changes by exactly 5–10 BPM steps with each 2-second update.

---

## BeatState Interface Design

The new `BeatState` interface on `AudioStateRef` must follow the same pre-allocation pattern as `ChordState` and `TensionState`:

```typescript
// Source: derived from types.ts patterns in this codebase
export interface BeatState {
  // Onset strength signal (OSS) ring buffer — 6 seconds at 10fps = 60 samples
  ossBuffer: Float32Array;          // length 60
  ossHead: number;                  // ring buffer write index
  ossSamples: number;               // valid sample count (capped at 60)

  // Drum flux adaptive threshold window — 2 seconds at 10fps = 20 samples
  drumFluxBuffer: Float32Array;     // length 20 — rolling drum flux values
  drumFluxHead: number;
  drumFluxSamples: number;

  // Bass flux adaptive threshold window — same pattern
  bassFluxBuffer: Float32Array;     // length 20

  // IOI tracking — last 20 drum onset timestamps (seconds, from audioCtx.currentTime)
  drumOnsetTimes: Float32Array;     // length 20, pre-allocated
  drumOnsetHead: number;
  drumOnsetCount: number;

  // Last detected bass onset time (scalar, not ring buffer)
  lastBassOnsetSec: number;         // -1 if none
  lastDrumOnsetSec: number;         // -1 if none

  // Autocorrelation output — length 30 (half of OSS buffer)
  acBuffer: Float32Array;           // length 30, pre-allocated

  // Pocket score ring buffer — 8 beats
  pocketBuffer: Float32Array;       // length 8
  pocketHead: number;
  pocketSamples: number;

  // BPM update timing
  ticksSinceAcUpdate: number;       // counts to 20 → 2 seconds

  // Outputs (read by Zustand bridge and CanvasRenderer)
  bpm: number | null;               // null when rubato/low confidence
  ioiCV: number;                    // 0.0+ IOI coefficient of variation
  pocketScore: number;              // 0.0–1.0
  timingOffsetMs: number;           // positive = drums ahead
  lastDownbeatSec: number;          // audioCtx.currentTime of last detected beat 1
  beatCounter: number;              // 0–3, increments on drum onset
}
```

---

## Integration with AnalysisTick

Phase 4 runs as a new step in `runAnalysisTick`, appended after the existing Phase 3 steps:

```typescript
// In AnalysisTick.ts — after Phase 3 tension update
if (state.beat) {
  runBeatTick(state, audioTimeSec);  // new Phase 4 function
  // Bridge to Zustand via onBeatUpdate callback (add to runAnalysisTick signature)
}
```

The guard pattern matches existing guards:
```typescript
if (!state.beat) return;  // same pattern as !state.chord, !state.tension
```

`AudioStateRef` gets a new field:
```typescript
beat: BeatState | null;  // null until initBeatState() called at file load
```

---

## Zustand Bridge

Two new fields in `useAppStore`:
- `currentBpm: number | null` — null when rubato, number (50–250) when detected
- `pocketScore: number` — 0.0–1.0
- `timingOffsetMs: number` — positive = drums ahead

The BPM display string: `bpm === null ? "♩ = —" : "♩ = " + Math.round(bpm)`

Pocket score suppressed when `bpm === null` (BEAT-10): display `0.0` or hide UI element.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ScriptProcessorNode-based tempo (Meyda 5.x path) | Direct AnalyserNode getByteFrequencyData + hand-rolled flux | Phase 1–2 decisions | No ScriptProcessorNode involvement in beat path |
| offline BPM detection (full buffer) | Realtime OSS ring buffer + AC every 2s | This phase | Works during playback, not just on load |
| Fixed threshold onset detection | Adaptive threshold (mean + 1.5×std) | Standard since Dixon 2006 | Handles dynamic range variation in jazz recordings |

**Deprecated:**
- Using Meyda's spectralFlux for any onset detection: broken in 5.6.3, do not use.
- `web-audio-beat-detector` / `realtime-bpm-analyzer`: not appropriate for jazz (kick-optimized, no swing handling).

---

## Open Questions

1. **Adaptive threshold multiplier (1.5× std dev)**
   - What we know: 1.5–2.0× is the range commonly cited in onset detection literature (Bello et al. 2005)
   - What's unclear: Whether 1.5 is the right value for jazz drum kit spectral flux; kick+ride energy profile differs from electronic music
   - Recommendation: Start with 1.5, flag as `DRUM_THRESHOLD_MULTIPLIER` constant for tuning. Same pattern as flux normalization constant 5000 in D-02-03-2.

2. **IOI CV rubato threshold (0.3)**
   - What we know: 0.3 is from the spec; no specific authoritative MIR source was found confirming this exact value for jazz rubato
   - What's unclear: Whether 0.3 correctly separates "loose jazz time feel" (CV ~0.15–0.25) from "true rubato" (CV > 0.3). Very loose swingers may have CV > 0.3 even on a steady tempo.
   - Recommendation: Flag as `RUBATO_CV_THRESHOLD = 0.3` constant. Acceptable to start here; tune after testing on real recordings.

3. **Bass onset detection vs. kick drum bleed**
   - What we know: 20–250 Hz band includes kick drum fundamental (~60–100 Hz). A kick will spike the bass RMS.
   - What's unclear: Whether a simple RMS delta threshold is sufficient to separate bass note onsets from kick transients in a jazz trio recording (where the kick is not heavily mic'd)
   - Recommendation: For plan 04-02, implement bass onset as RMS delta with a debounce gate of 80ms (bass notes don't repeat faster than ~8th notes at 150 BPM = ~100ms apart). This naturally blocks kick bleed since kick recovery is shorter.

4. **Downbeat accuracy with pickup notes**
   - What we know: Counting every 4th drum onset as beat 1 fails if the counting starts mid-bar
   - What's unclear: How to initialize the beat counter correctly without user input
   - Recommendation: Don't attempt to solve this in Phase 4. Initialize beat counter at 0, count from the first detected onset. Mark in docs that downbeat events may be offset by 0–3 beats from the true bar start. The Canvas renderer in Phase 5 can use this as a relative reference.

5. **Autocorrelation resolution at 10fps (BPM quantization)**
   - What we know: At 10fps, BPM precision is ~±6 BPM for 100–150 BPM range
   - What's unclear: Whether users find 5-BPM quantization acceptable for a jazz learning tool, or whether interpolation is needed
   - Recommendation: Display to nearest integer, accept the quantization. Add note in Phase 4 verification that the display will "snap" in 5–10 BPM steps during 2-second updates. This is a known limitation.

---

## Code Examples

### Band-Limited Spectral Flux (Drum Transient)

```typescript
// Source: adapted from computeSpectralFlux in KbGuitarDisambiguator.ts (D-02-03-1)
// Restrict to drums_high (snare crack 2000–8000Hz) and ride (6000–10000Hz) bins
function computeDrumFlux(
  rawFreqData: Uint8Array,
  prevRawFreqData: Uint8Array,
  drumHighBand: FrequencyBand,  // drums_high from buildDefaultBands()
  rideBand: FrequencyBand,      // ride from buildDefaultBands()
): number {
  let flux = 0;
  // Snare / hi-hat body (drums_high band)
  for (let i = drumHighBand.lowBin; i <= drumHighBand.highBin; i++) {
    const diff = rawFreqData[i] - prevRawFreqData[i];
    if (diff > 0) flux += diff;
  }
  // Ride ping (ride band)
  for (let i = rideBand.lowBin; i <= rideBand.highBin; i++) {
    const diff = rawFreqData[i] - prevRawFreqData[i];
    if (diff > 0) flux += diff;
  }
  return flux;
}
```

### Bass Onset Detection (RMS Delta)

```typescript
// Source: BEAT-03 spec — RMS energy delta in bass band (20–250 Hz)
function computeBassRmsDelta(
  rawFreqData: Uint8Array,
  prevBassRms: number,
  bassBand: FrequencyBand,
): { currentRms: number; delta: number } {
  let sumSq = 0;
  const count = bassBand.highBin - bassBand.lowBin + 1;
  for (let i = bassBand.lowBin; i <= bassBand.highBin; i++) {
    const v = rawFreqData[i] / 255;
    sumSq += v * v;
  }
  const currentRms = Math.sqrt(sumSq / count);
  const delta = Math.max(0, currentRms - prevBassRms);  // half-wave rectified
  return { currentRms, delta };
}
```

### Autocorrelation BPM (6s window)

```typescript
// Source: standard OSS autocorrelation — Scheirer (1998) / Müller MIR textbook
// ossBuffer: Float32Array[60], acOut: pre-allocated Float32Array[30]
function runAutocorrelation(ossBuffer: Float32Array, ossLength: number, acOut: Float32Array): void {
  const maxLag = acOut.length;  // 30
  for (let lag = 1; lag < maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let t = 0; t < ossLength - lag; t++) {
      sum += ossBuffer[t] * ossBuffer[t + lag];
      count++;
    }
    acOut[lag] = count > 0 ? sum / count : 0;
  }
}

// Find BPM from AC output
// Valid lags for 50–220 BPM at 10fps: floor(60/220*10)=2 to floor(60/50*10)=12
function extractBpm(acOut: Float32Array, minLag = 3, maxLag = 12): number | null {
  let bestLag = -1;
  let bestVal = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (acOut[lag] > bestVal) {
      bestVal = acOut[lag];
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestVal < 0.01) return null;

  // Swing double-tempo check: if AC[2*lag] is nearly as strong, use 2*lag
  const doubleLag = bestLag * 2;
  if (doubleLag < acOut.length && acOut[doubleLag] > 0.6 * bestVal) {
    bestLag = doubleLag;
  }

  return 60 / (bestLag / 10);  // 10fps → seconds per beat → BPM
}
```

---

## Sources

### Primary (HIGH confidence)

- Existing codebase: `src/audio/KbGuitarDisambiguator.ts` — computeSpectralFlux pattern (verified, in use)
- Existing codebase: `src/audio/types.ts` — BeatState interface design follows ChordState/TensionState patterns
- Existing codebase: `src/audio/AnalysisTick.ts` — integration hook pattern for Phase 4 modules
- Existing codebase: `src/audio/FrequencyBandSplitter.ts` — drums_high and ride bands confirmed; bass band confirmed
- `D-02-03-1`: computeSpectralFlux is hand-rolled — Meyda spectralFlux is broken (locked decision)

### Secondary (MEDIUM confidence)

- Bello et al. (2005) "A Tutorial on Onset Detection in Music Signals" — half-wave rectified spectral flux, adaptive threshold (mean + 1.5×std) — confirmed as standard MIR approach via WebSearch
- Dixon (2006) "Onset Detection Revisited" DAFX — adaptive threshold for peak-picking onset detection functions
- Scheirer (1998) "Tempo and Beat Analysis of Acoustic Musical Signals" — autocorrelation of OSS for beat period detection
- WebSearch: IOI histogram for swing ratio detection — multiple sources confirming bimodal IOI histogram as standard approach for swing detection in jazz (NTNU DAFx submission, ISMIR Dittmar et al. 2015)
- WebSearch: IOI coefficient of variation for rubato detection — concept verified but specific 0.3 threshold not confirmed from literature

### Tertiary (LOW confidence — flag for validation)

- CV > 0.3 rubato threshold (0.3 from spec, not from literature — treat as tunable constant)
- Adaptive threshold multiplier 1.5 (literature says 1.5–2.0; 1.5 chosen as starting point)
- "80ms cross-correlation window" for pocket score (from spec; consistent with research showing <30ms is imperceptible, but exact 80ms window for jazz pocket not sourced from literature)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all hand-rolled on established patterns
- Architecture: HIGH — BeatState interface design follows exact ChordState/TensionState pattern; integration into AnalysisTick is clear
- DSP algorithms: MEDIUM-HIGH — autocorrelation BPM and spectral flux onset detection are well-established; swing/rubato detection is simplified but sound
- Specific thresholds (CV 0.3, 1.5×std, 80ms): LOW-MEDIUM — from spec or MIR range, need empirical tuning

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (no new library dependencies; algorithm validity is stable)
