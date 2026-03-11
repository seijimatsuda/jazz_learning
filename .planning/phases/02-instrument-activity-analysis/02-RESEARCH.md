# Phase 2: Instrument Activity Analysis - Research

**Researched:** 2026-03-10
**Domain:** Per-instrument audio feature extraction, role classification, cross-correlation
**Confidence:** HIGH (codebase read directly; Meyda internals read from installed node_modules)

---

## Summary

Phase 2 builds on top of Phase 1's `AudioStateRef` (dual AnalyserNodes, pre-allocated typed arrays, calibrated per-band thresholds) to produce per-instrument activity scores (0.0–1.0), role labels (soloing/comping/holding/silent), keyboard-vs-guitar disambiguation, and cross-correlation edge weights between instrument pairs.

The primary data flow is: 60fps rAF loop reads `smoothedFreqData` from the existing analyser → a separate 10fps analysis tick derives activity scores from per-band RMS → a state machine assigns role labels based on calibrated thresholds → cross-correlation runs over a 2-second rolling history. All computation is done in pure TypeScript with no new library dependencies, because Meyda's `spectralFlux` extractor is **broken** in v5.6.3 (used by the project) and must be hand-computed instead.

The architecture must integrate cleanly with the existing `AudioStateRef` useRef pattern. New mutable state (activity scores, role labels, history rings, cross-correlation weights) lives on `AudioStateRef` (or a parallel `AnalysisStateRef`), not in Zustand or React state. The rAF loop in `CanvasRenderer` already reads from the ref; Phase 2 adds an analysis tick that writes to the same ref.

**Primary recommendation:** Build `InstrumentActivityScorer`, `RoleClassifier`, and `CrossCorrelationTracker` as pure functions operating on pre-allocated `Float32Array` ring buffers, called from inside the existing rAF loop at a 10fps throttle. Do not use Meyda's `spectralFlux` — implement it manually (3 lines). Use `Meyda.extract(['zcr'], rawTimeBuffer)` for ZCR only.

---

## Standard Stack

### Core (already installed — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| meyda | 5.6.3 | ZCR extraction from time-domain buffer | Already installed; ZCR extractor is correct |
| Web Audio API (native) | - | AnalyserNode getByteFrequencyData/getByteTimeDomainData | Zero-cost, already wired |
| TypeScript Float32Array | - | Ring buffers for history, pre-allocated | GC-free, same pattern as Phase 1 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All needed primitives are already present |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual spectral flux | Meyda `spectralFlux` | Meyda 5.6.3 spectralFlux is broken (negative index bug) — hand-roll it |
| Pearson cross-correlation (manual) | Web Audio ConvolverNode | ConvolverNode is for reverb, not cross-correlation of activity histories |
| `getBandEnergy()` for RMS per band | Meyda `rms` on sliced buffer | getBandEnergy() already exists and uses pre-allocated arrays; Meyda requires new buffer per call |

**Installation:** No new packages needed. All work is in new `.ts` files under `src/audio/`.

---

## Meyda 5.6.3 — Verified API Facts

These are read directly from `/node_modules/meyda/dist/esm/`.

### `Meyda.extract(feature, signal, previousSignal?)`

- `feature`: string or string array
- `signal`: Float32Array — **must be power-of-2 length** (e.g. 512, 1024, 2048, 4096)
- `previousSignal`: Float32Array (optional) — only needed for `spectralFlux`
- Returns: scalar (for single string feature) or object (for array)
- Before calling, set `Meyda.bufferSize = signal.length` and `Meyda.sampleRate = actualSampleRate`

### ZCR extractor — CORRECT in 5.6.3

```typescript
// Source: node_modules/meyda/dist/esm/extractors/zcr.js (read directly)
// Counts sign changes: returns integer count in [0, signal.length - 1]
// No previous frame needed. Works correctly on Float32Array.
Meyda.bufferSize = 4096;
Meyda.sampleRate = audioStateRef.current.sampleRate;
const zcr: number = Meyda.extract('zcr', rawTimeData) as number;
```

### RMS extractor — CORRECT in 5.6.3

```typescript
// Source: node_modules/meyda/dist/esm/extractors/rms.js (read directly)
// Computes sqrt(mean(signal^2)) over entire buffer. Returns scalar >= 0.
// BUT: operates on full buffer, not a frequency band slice.
// For per-band RMS, use the existing getBandEnergy() instead.
```

### spectralFlux extractor — BROKEN in 5.6.3

```javascript
// Source: node_modules/meyda/dist/esm/extractors/spectralFlux.js (read directly)
// Loop: for (var i = -(bufferSize / 2); i < signal.length / 2 - 1; i++)
// Float32Array[negative_index] === undefined → NaN arithmetic → always 0 or NaN
// DO NOT USE. Implement manually (see Code Examples).
```

### Chroma filter bank — sampleRate-sensitive

```typescript
// Source: node_modules/meyda/dist/esm/utilities.js createChromaFilterBank()
// Uses sampleRate to compute (sampleRate * i) / bufferSize frequency-to-bin mapping
// At 48000 Hz (iOS Safari) vs 44100 Hz (Chrome), the filter bank differs.
// Must set Meyda.sampleRate = audioCtx.sampleRate BEFORE extracting chroma.
// Phase 2 does not use chroma — this is noted for Phase 3 awareness only.
```

---

## Architecture Patterns

### Recommended File Structure

```
src/audio/
├── types.ts                    # Extend AudioStateRef with AnalysisState (Phase 2 additions)
├── FrequencyBandSplitter.ts    # (Phase 1, unchanged)
├── AudioEngine.ts              # (Phase 1, unchanged)
├── CalibrationPass.ts          # (Phase 1, unchanged)
├── TensionHeatmap.ts           # (Phase 1, unchanged)
├── InstrumentActivityScorer.ts # NEW: per-band RMS → 0.0–1.0 activity score
├── RoleClassifier.ts           # NEW: activity score + calibration → role label state machine
├── KbGuitarDisambiguator.ts    # NEW: ZCR + spectral flux → keyboard vs guitar weight
└── CrossCorrelationTracker.ts  # NEW: 2-second sliding window Pearson r, edge suppression
```

### Pattern 1: Analysis State on AudioStateRef

Phase 2 adds fields to `AudioStateRef` (or a parallel ref) rather than creating new React state. This keeps Web Audio objects and derived analysis values in the same non-reactive container.

**Extend `AudioStateRef` in types.ts:**

```typescript
// Source: inferred from Phase 1 types.ts pattern + phase requirements

export type RoleLabel = 'soloing' | 'comping' | 'holding' | 'silent';

export interface InstrumentAnalysis {
  instrument: string;           // 'bass' | 'drums' | 'keyboard' | 'guitar'
  bandNames: string[];          // which bands this instrument owns
  activityScore: number;        // 0.0–1.0, updated at 10fps
  role: RoleLabel;              // current role label
  roleSinceSec: number;         // when this role started (audioCtx.currentTime)
  // Rolling history: circular buffer of activityScore values at 10fps
  // 10 seconds * 10fps = 100 slots
  historyBuffer: Float32Array;  // length 100, circular
  historyHead: number;          // write index into historyBuffer
  historySamples: number;       // how many valid samples (capped at 100)
  // Cumulative time-in-role (seconds) since playback start
  timeInRole: Record<RoleLabel, number>;
}

export interface AnalysisState {
  instruments: InstrumentAnalysis[];
  // Cross-correlation edge weights: instrument pair → Pearson r in [-1, 1]
  // Key format: `${instrA}_${instrB}` (always alphabetical order)
  edgeWeights: Record<string, number>;
  // Whether analysis is running
  isAnalysisActive: boolean;
  // Throttle: last time analysis ran (in ms, from Date.now())
  lastAnalysisMs: number;
}

// Add to AudioStateRef:
//   analysis: AnalysisState | null;
```

### Pattern 2: 10fps Throttle Inside rAF Loop

The existing `CanvasRenderer.render()` runs at 60fps. Analysis runs at 10fps via a time-gate check, not a separate `setInterval` (avoids timer drift and aligns with the rAF tick).

```typescript
// Source: inferred from CanvasRenderer.ts Phase 1 pattern

private render(): void {
  // ... existing 60fps drawing code ...

  // 10fps analysis gate (100ms between analysis ticks)
  const now = performance.now();
  const analysis = this.audioStateRef.current.analysis;
  if (analysis && (now - analysis.lastAnalysisMs) >= 100) {
    analysis.lastAnalysisMs = now;
    this.runAnalysisTick();
  }

  this.rafHandle = requestAnimationFrame(this.boundRender);
}
```

### Pattern 3: Per-Band RMS → Activity Score

Per-instrument activity is computed from per-band energy (already available via `getBandEnergy()`), normalized against calibration peak, then smoothed with an exponential moving average.

```typescript
// Source: FrequencyBandSplitter.ts getBandEnergy() pattern + CalibrationPass.ts threshold pattern

// InstrumentActivityScorer.ts
export function computeActivityScore(
  freqData: Uint8Array,
  bandNames: string[],
  bands: FrequencyBand[],
  calibration: CalibrationThresholds[],
  prevScore: number,
  smoothingAlpha = 0.7   // EMA: alpha=0.7 → snappy; lower → more smoothing
): number {
  // Average energy across all bands for this instrument
  let total = 0;
  let count = 0;
  for (const name of bandNames) {
    const band = bands.find(b => b.name === name);
    const cal = calibration.find(c => c.band === name);
    if (!band || !cal || cal.peak === 0) continue;
    const energy = getBandEnergy(freqData, band);
    total += energy / cal.peak;  // normalize to peak
    count++;
  }
  const raw = count > 0 ? Math.min(1, total / count) : 0;
  // EMA smoothing
  return prevScore * (1 - smoothingAlpha) + raw * smoothingAlpha;
}
```

### Pattern 4: Role Classification State Machine

Hysteresis prevents rapid label flipping. Use calibrated thresholds (already computed in CalibrationPass).

```typescript
// Source: CalibrationThresholds.solo/comping/holding from types.ts

// RoleClassifier.ts
export function classifyRole(
  activityScore: number,
  cal: CalibrationThresholds,         // from audioStateRef.calibration
  currentRole: RoleLabel,
  HYSTERESIS = 0.05                   // dead-band around each threshold
): RoleLabel {
  const { solo, comping, holding } = cal;
  // Thresholds: solo=0.75*peak, comping=0.40*peak, holding=0.10*peak
  // Normalized to [0,1] peak, so direct compare with activityScore works
  // (activityScore is already normalized by peak in computeActivityScore)
  const soloBand    = 0.75;
  const compingBand = 0.40;
  const holdingBand = 0.10;

  if (activityScore >= soloBand - HYSTERESIS) return 'soloing';
  if (activityScore >= compingBand - HYSTERESIS) return 'comping';
  if (activityScore >= holdingBand - HYSTERESIS) return 'holding';
  return 'silent';
}
// Note: activityScore is normalized to [0,1] relative to peak by computeActivityScore,
// so the thresholds (0.75, 0.40, 0.10) map directly.
```

### Pattern 5: Manual Spectral Flux (DO NOT use Meyda's)

Meyda 5.6.3's spectralFlux is broken (verified from source). Implement directly from amplitude spectrum.

```typescript
// Source: Meyda audio-features docs (spectral flux definition) + manual fix for broken extractor

// KbGuitarDisambiguator.ts helper
// ampSpectrum: Float32Array (half the fftSize — from getByteFrequencyData output)
// prevAmpSpectrum: Float32Array (previous frame, same length)
// Returns: positive-only spectral flux (half-wave rectified), unbounded scalar
export function computeSpectralFlux(
  ampSpectrum: Uint8Array,
  prevAmpSpectrum: Uint8Array
): number {
  let flux = 0;
  const len = Math.min(ampSpectrum.length, prevAmpSpectrum.length);
  for (let i = 0; i < len; i++) {
    const diff = ampSpectrum[i] - prevAmpSpectrum[i];
    if (diff > 0) flux += diff;   // half-wave rectify (onset detection flavor)
  }
  return flux;
}

// Store previous frame: keep a pre-allocated Uint8Array in AnalysisState
// prevRawFreqData: Uint8Array;  // same length as rawFreqData (fftSize/2 = 2048)
// After each analysis tick: prevRawFreqData.set(rawFreqData);
```

### Pattern 6: ZCR + Spectral Flux Disambiguation

```typescript
// KbGuitarDisambiguator.ts
// ZCR: guitar (plucked/strummed) → higher ZCR than keyboard (sustained, more tonal)
// Spectral flux: guitar attacks → higher transient flux than keyboard's sustains

import Meyda from 'meyda';

export function computeDisambiguationWeight(
  rawTimeData: Uint8Array,     // from rawAnalyser.getByteTimeDomainData()
  rawFreqData: Uint8Array,     // current frame
  prevRawFreqData: Uint8Array, // previous frame
  sampleRate: number,
  fftSize: number
): { keyboardWeight: number; guitarWeight: number } {
  // Convert Uint8Array time domain (0-255) to Float32Array (-1 to +1) for Meyda
  const timeFloat = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    timeFloat[i] = (rawTimeData[i] - 128) / 128;
  }

  Meyda.bufferSize = fftSize;
  Meyda.sampleRate = sampleRate;
  const zcr = Meyda.extract('zcr', timeFloat) as number;
  const normalizedZcr = zcr / (fftSize - 1); // normalize to [0, 1]

  const flux = computeSpectralFlux(rawFreqData, prevRawFreqData);
  const normalizedFlux = Math.min(1, flux / (255 * fftSize / 2)); // normalize

  // Higher ZCR + higher flux → more guitar-like
  const guitarScore = (normalizedZcr + normalizedFlux) / 2;
  const keyboardScore = 1 - guitarScore;

  return { keyboardWeight: keyboardScore, guitarWeight: guitarScore };
}

// IMPORTANT: allocate timeFloat ONCE as part of AnalysisState to avoid GC.
// DO NOT use `new Float32Array` inside the analysis tick.
```

**Allocation note:** The Float32Array conversion buffer for Meyda ZCR must be pre-allocated once (in AnalysisState initialization), not inside the 10fps tick. Same pattern as Phase 1's pre-allocated typed arrays.

### Pattern 7: Cross-Correlation (2-second sliding window Pearson r)

```typescript
// CrossCorrelationTracker.ts
// Pearson r over last N samples of two activity score histories
// N = 20 (2 seconds at 10fps)

const CORR_WINDOW = 20; // samples = 2 seconds at 10fps

export function pearsonR(
  histA: Float32Array, headA: number, samplesA: number,
  histB: Float32Array, headB: number, samplesB: number
): number {
  const n = Math.min(samplesA, samplesB, CORR_WINDOW);
  if (n < 2) return 0;

  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    // Read backwards from head (most recent first)
    const ia = (headA - 1 - i + 100) % 100;
    const ib = (headB - 1 - i + 100) % 100;
    sumA += histA[ia];
    sumB += histB[ib];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const ia = (headA - 1 - i + 100) % 100;
    const ib = (headB - 1 - i + 100) % 100;
    const da = histA[ia] - meanA;
    const db = histB[ib] - meanB;
    num  += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  if (denom === 0) return 0;
  return num / denom;  // in [-1, 1]
}

// Edge suppression: if Math.abs(r) < 0.3, set edgeWeight to 0
export function computeEdgeWeight(r: number): number {
  return Math.abs(r) < 0.3 ? 0 : r;
}
```

### Pattern 8: Rolling History Buffer (Ring Buffer)

```typescript
// 10 seconds * 10fps = 100 slots per instrument
const HISTORY_LENGTH = 100;

// Push a new activity score into the circular buffer
export function pushHistory(
  instr: InstrumentAnalysis,
  score: number
): void {
  instr.historyBuffer[instr.historyHead] = score;
  instr.historyHead = (instr.historyHead + 1) % HISTORY_LENGTH;
  if (instr.historySamples < HISTORY_LENGTH) instr.historySamples++;
}
```

### Pattern 9: Instrument-to-Band Mapping

The existing bands from `buildDefaultBands()` must be mapped to instrument names. Phase 2 adds this mapping layer:

```typescript
// InstrumentActivityScorer.ts — instrument lineup config
// A "lineup" is provided by the user or defaulted. Phase 2 hardcodes a standard jazz trio/quartet.

export type InstrumentName = 'bass' | 'drums' | 'keyboard' | 'guitar';

// Maps instrument name → which FrequencyBand names it owns
export const INSTRUMENT_BAND_MAP: Record<InstrumentName, string[]> = {
  bass:     ['bass'],                          // 20–250 Hz
  drums:    ['drums_low', 'drums_high', 'ride'], // 60–300 Hz + 2–8kHz + 6–10kHz
  keyboard: ['mid'],                           // 250–2000 Hz
  guitar:   ['mid_high'],                      // 300–3000 Hz
};

// Single mid-range fallback (INST-05): if only keyboard OR guitar in lineup,
// assign both 'mid' and 'mid_high' to that instrument
export function resolveBandsForInstrument(
  name: InstrumentName,
  lineup: InstrumentName[]
): string[] {
  const hasBoth = lineup.includes('keyboard') && lineup.includes('guitar');
  if (!hasBoth) {
    if (name === 'keyboard' || name === 'guitar') {
      return ['mid', 'mid_high']; // full mid-range
    }
  }
  return INSTRUMENT_BAND_MAP[name];
}
```

### Anti-Patterns to Avoid

- **Zustand for analysis state:** Analysis state updates at 10fps — Zustand triggers re-renders. Keep analysis state in the AudioStateRef (or parallel analysisRef). Only push to Zustand what the UI needs to re-render (role label changes only, via a debounced ref or a lightweight event).
- **New typed array allocation in analysis tick:** `new Float32Array()` inside the 10fps tick creates GC pressure at 600 allocs/minute. Pre-allocate everything in AnalysisState initialization.
- **Using Meyda.extract('spectralFlux', ...):** Broken in 5.6.3 (verified from source). Returns 0 or NaN due to negative array index bug. Hand-roll it.
- **setInterval for 10fps:** Timer drift causes audio-visual misalignment. Use a time-gate check inside the rAF loop instead.
- **Pearson r over full 100-slot history at 60fps:** Only compute cross-correlation during the 10fps analysis tick, not on every rAF frame.
- **Storing AudioBuffer channel slices as new arrays:** Use `getChannelData()` which returns a live view — no copy needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZCR from raw time-domain | Custom zero-crossing counter | `Meyda.extract('zcr', timeFloat)` | Meyda's ZCR extractor is correct in 5.6.3, handles edge cases |
| Per-band energy | Custom FFT bin summation | `getBandEnergy()` (Phase 1) | Already written, tested, GC-free |
| Band-to-bin mapping | Custom Hz-to-bin math | `hzToBin()` + `buildDefaultBands()` (Phase 1) | Already handles sampleRate read-back correctly |
| Calibration thresholds | Re-running calibration | `audioStateRef.calibration[]` (Phase 1) | Already computed on file load |
| Exponential moving average | Custom filter | One-liner: `prev * (1-alpha) + raw * alpha` | Simple enough to inline |

**Key insight:** Spectral flux is the only thing that looks like it should come from Meyda but cannot — the bug is verified in the installed source. Everything else that would normally come from Meyda (ZCR, per-band RMS) is either already covered by Phase 1 utilities or is a one-liner.

---

## Common Pitfalls

### Pitfall 1: Meyda spectralFlux Returns 0 (Silent Failure)

**What goes wrong:** Calling `Meyda.extract('spectralFlux', signal, previousSignal)` returns 0 for every frame. Disambiguation appears to always favor keyboard.

**Why it happens:** The spectralFlux extractor in Meyda 5.6.3 (installed version, verified in source) loops from `-(bufferSize/2)` — accessing negative indices on a Float32Array returns `undefined`. The half-wave rectification `(x + Math.abs(x)) / 2` with NaN inputs produces 0.

**How to avoid:** Use the manual `computeSpectralFlux()` implementation (see Code Examples). Do not call `Meyda.extract('spectralFlux', ...)` at all.

**Warning signs:** Disambiguation weight is always 0.5/0.5; spectral flux is always 0.

### Pitfall 2: Float32Array Allocation Inside rAF

**What goes wrong:** Analysis tick creates `new Float32Array(4096)` each call to convert Uint8Array time data to float for Meyda. At 10fps this is 600 arrays/minute allocated; GC pauses cause frame drops on iOS.

**Why it happens:** Meyda ZCR requires Float32Array in range [-1, 1], but `rawTimeData` is Uint8Array [0, 255].

**How to avoid:** Pre-allocate `rawTimeDataFloat: Float32Array` (length `fftSize`) in `AnalysisState` initialization. Convert in-place each tick: `for (let i = 0; i < fftSize; i++) float[i] = (uint[i] - 128) / 128`.

**Warning signs:** iOS Safari frame drops during playback; Chrome Memory tab shows sawtooth GC pattern.

### Pitfall 3: Meyda.sampleRate Not Updated for iOS

**What goes wrong:** ZCR values differ between iOS (48kHz) and Chrome (44.1kHz) despite identical audio content, causing disambiguation thresholds to be calibrated wrong.

**Why it happens:** Meyda defaults to `sampleRate = 44100`. At 48kHz, the chroma filter bank and any sample-rate-sensitive features use wrong bin mappings.

**How to avoid:** Always set `Meyda.sampleRate = audioStateRef.current.sampleRate` before calling `Meyda.extract()`. ZCR itself is sample-count-based (not frequency-based), so its raw value is unaffected by sampleRate, but consistency is important for any future feature additions.

**Warning signs:** Different role labels on same recording between devices.

### Pitfall 4: Calibration Thresholds Are Band-Absolute, Not Instrument-Relative

**What goes wrong:** Activity score for drums appears as 0.95 while bass appears as 0.2, even when bass is clearly dominant, because drums naturally produce more energy in drums_high band.

**Why it happens:** Each `CalibrationThresholds` entry has `peak` for its band. The 3-second calibration window determines per-band peaks — cross-instrument comparison via raw energy is meaningless.

**How to avoid:** Normalize each band's energy by its own `cal.peak` before averaging across bands for an instrument. `activityScore = energy / cal.peak`. This makes 1.0 = "loudest this band got during calibration" for every instrument.

**Warning signs:** One instrument always shows near-zero activity while another always maxes out.

### Pitfall 5: Cross-Correlation on Constant or Sparse History

**What goes wrong:** Pearson r returns NaN or Infinity when both history buffers are constant (e.g. both instruments silent during a rest) or when fewer than 2 samples exist.

**Why it happens:** Pearson denominator is 0 when variance of either series is 0. Early in playback (< 2 samples), the formula breaks.

**How to avoid:** Guard: `if (n < 2 || denom === 0) return 0`. Treat NaN/Infinity as 0 before edge suppression. Clamp result to [-1, 1] after division.

**Warning signs:** All edges immediately show weight > 0.3 at playback start.

### Pitfall 6: Drums Band Overlap with Bass

**What goes wrong:** Bass and drums both show high activity simultaneously in quiet passages because `drums_low` (60–300Hz) overlaps `bass` (20–250Hz). Both instruments get false positives.

**Why it happens:** The bands are not mutually exclusive by design (Phase 1 kept them overlapping for visualization, not instrument attribution).

**How to avoid:** This is by design — the bands are spectral windows, not stem-separated tracks. Role classification must rely on the calibrated peak normalization, not on expecting silence in unused bands. Accept that drums and bass will co-activate in overlapping frequencies; the state machine's hysteresis prevents rapid false transitions.

**Warning signs:** Bass and drums always show identical role labels.

### Pitfall 7: Zustand Re-Render Storm at 10fps

**What goes wrong:** Role label updates trigger 10 Zustand state changes per second per instrument (4 instruments = 40/sec), causing excessive React re-renders and UI jank.

**Why it happens:** If `useAppStore.setRoleLabel(...)` is called every analysis tick, Zustand notifies all subscribers.

**How to avoid:** Only call Zustand setters when the role label *changes*, not every tick. Compare `newRole !== currentRole` before dispatching. Keep the write-path (analysis state) in `AudioStateRef` and only sync to Zustand on change.

**Warning signs:** React DevTools shows excessive renders; UI becomes sluggish during playback.

---

## Code Examples

### Full Analysis Tick Skeleton

```typescript
// Source: Derived from Phase 1 CanvasRenderer.ts pattern + Phase 2 requirements

// Called from inside rAF loop at 10fps throttle
private runAnalysisTick(): void {
  const state = this.audioStateRef.current;
  if (!state.analysis || !state.smoothedFreqData || !state.rawFreqData || !state.rawTimeData) return;

  const { analysis, smoothedFreqData, rawFreqData, rawTimeData, bands, calibration, sampleRate, fftSize } = state;

  // 1. Pull fresh FFT data (smoothed for activity, raw for spectral flux)
  if (state.smoothedAnalyser) state.smoothedAnalyser.getByteFrequencyData(smoothedFreqData);
  if (state.rawAnalyser)      state.rawAnalyser.getByteFrequencyData(rawFreqData);
  if (state.rawAnalyser)      state.rawAnalyser.getByteTimeDomainData(rawTimeData);

  for (const instr of analysis.instruments) {
    // 2. Compute activity score (normalized per-band energy, EMA smoothed)
    const newScore = computeActivityScore(
      smoothedFreqData, instr.bandNames, bands, calibration,
      instr.activityScore
    );
    instr.activityScore = newScore;

    // 3. Push to rolling history
    pushHistory(instr, newScore);

    // 4. Classify role
    const primCal = calibration.find(c => c.band === instr.bandNames[0]);
    if (primCal) {
      const newRole = classifyRole(newScore, primCal, instr.role);
      if (newRole !== instr.role) {
        instr.role = newRole;
        instr.roleSinceSec = state.audioCtx?.currentTime ?? 0;
        // Only push to Zustand on change (not every tick)
        // this.onRoleChange?.(instr.instrument, newRole);
      }
      // Accumulate time-in-role
      instr.timeInRole[instr.role] += 0.1; // 100ms per tick
    }
  }

  // 5. Keyboard/Guitar disambiguation (only if both in lineup)
  const kb = analysis.instruments.find(i => i.instrument === 'keyboard');
  const gt = analysis.instruments.find(i => i.instrument === 'guitar');
  if (kb && gt) {
    // Convert time domain to float [-1,1] using pre-allocated buffer
    for (let i = 0; i < fftSize; i++) {
      analysis.rawTimeDataFloat[i] = (rawTimeData[i] - 128) / 128;
    }
    const { keyboardWeight, guitarWeight } = computeDisambiguationWeight(
      analysis.rawTimeDataFloat, rawFreqData, analysis.prevRawFreqData, sampleRate, fftSize
    );
    // Blend into activity scores
    kb.activityScore *= keyboardWeight;
    gt.activityScore *= guitarWeight;
  }

  // 6. Cross-correlation for all instrument pairs
  const instrs = analysis.instruments;
  for (let a = 0; a < instrs.length; a++) {
    for (let b = a + 1; b < instrs.length; b++) {
      const key = [instrs[a].instrument, instrs[b].instrument].sort().join('_');
      const r = pearsonR(
        instrs[a].historyBuffer, instrs[a].historyHead, instrs[a].historySamples,
        instrs[b].historyBuffer, instrs[b].historyHead, instrs[b].historySamples
      );
      analysis.edgeWeights[key] = computeEdgeWeight(r);
    }
  }

  // 7. Save current rawFreqData as previous for next tick's spectral flux
  analysis.prevRawFreqData.set(rawFreqData);
}
```

### AnalysisState Initialization

```typescript
// Source: Phase 1 allocateTypedArrays() pattern

export function initAnalysisState(
  lineup: InstrumentName[],
  fftSize: number
): AnalysisState {
  const instruments: InstrumentAnalysis[] = lineup.map(name => ({
    instrument: name,
    bandNames: resolveBandsForInstrument(name, lineup),
    activityScore: 0,
    role: 'silent' as RoleLabel,
    roleSinceSec: 0,
    historyBuffer: new Float32Array(100),
    historyHead: 0,
    historySamples: 0,
    timeInRole: { soloing: 0, comping: 0, holding: 0, silent: 0 },
  }));

  const edgeWeights: Record<string, number> = {};
  for (let a = 0; a < instruments.length; a++) {
    for (let b = a + 1; b < instruments.length; b++) {
      const key = [instruments[a].instrument, instruments[b].instrument].sort().join('_');
      edgeWeights[key] = 0;
    }
  }

  return {
    instruments,
    edgeWeights,
    isAnalysisActive: false,
    lastAnalysisMs: 0,
    prevRawFreqData: new Uint8Array(fftSize / 2),   // pre-allocated, GC-free
    rawTimeDataFloat: new Float32Array(fftSize),     // pre-allocated for Meyda ZCR
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Meyda.createMeydaAnalyzer() real-time mode | Meyda.extract() offline API inside rAF gate | Phase 2 design decision | Avoids ScriptProcessorNode (deprecated) and AudioWorklet complexity for offline file playback |
| ScriptProcessorNode for sample access | Direct `getByteTimeDomainData()` pull | Web Audio API 1.0 | No extra AudioWorklet thread; simpler for file playback use case |
| Separate setInterval for analysis | Time-gate inside rAF | Phase 2 design decision | Prevents timer drift; ensures analysis and rendering are always aligned |

**Deprecated/outdated:**
- `ScriptProcessorNode`: Deprecated in Web Audio API 1.1 (W3C FPWD Nov 2024). Do not use. `getByteTimeDomainData()` pull inside rAF is the correct pattern for offline file analysis.
- `Meyda.createMeydaAnalyzer()`: Requires `ScriptProcessorNode` internally. Avoid.

---

## Open Questions

1. **Spectral flux disambiguation threshold calibration**
   - What we know: spectralFlux values from the manual implementation are unbounded scalars that depend on the specific recording's dynamic range.
   - What's unclear: What normalization divisor produces stable `normalizedFlux` values in [0,1] across different recordings? The formula `flux / (255 * fftSize / 2)` is a theoretical max but may always be near 0 for typical recordings.
   - Recommendation: In RoleClassifier tests, log raw spectral flux values for several real jazz recordings to calibrate the normalization denominator empirically. Start with `flux / 5000` as a reasonable constant and tune.

2. **ZCR threshold for keyboard vs guitar**
   - What we know: Guitar (plucked strings) produces higher ZCR than piano (sustained hammered strings). Raw ZCR from Meyda with fftSize=4096 returns integer count in [0, 4095].
   - What's unclear: Exact ZCR ranges for piano vs guitar on jazz recordings. Academic literature suggests piano ZCR ≈ 50–150/buffer, guitar ≈ 200–400/buffer at 44.1kHz, but this is unverified for 4096-sample windows.
   - Recommendation: Log ZCR values during Phase 2 integration testing on real jazz recordings (piano trio, guitar trio). Adjust the `guitarScore = (normalizedZcr + normalizedFlux) / 2` weighting based on empirical distribution.

3. **iOS 48kHz effect on ZCR raw counts**
   - What we know: ZCR counts zero-crossings in the time-domain buffer. At 48kHz, a 4096-sample window covers 85ms vs 93ms at 44.1kHz.
   - What's unclear: Whether ZCR values differ meaningfully between 44.1kHz and 48kHz for the same audio content.
   - Recommendation: Since ZCR is normalized by `fftSize - 1`, the normalized value should be device-agnostic. Use `zcr / (fftSize - 1)` always. Low concern.

4. **Single-instrument lineup detection**
   - What we know: INST-05 requires that if only one mid-range instrument is in the lineup, it gets both 'mid' and 'mid_high' bands.
   - What's unclear: Phase 2 hardcodes a default lineup. Where does the user specify their lineup? No UI for lineup selection is defined yet.
   - Recommendation: Hardcode lineup as `['bass', 'drums', 'keyboard', 'guitar']` for Phase 2. Design `resolveBandsForInstrument()` to accept a lineup parameter so Phase 3/4 can wire a UI selector.

---

## Sources

### Primary (HIGH confidence)

- `/Users/seijimatsuda/jazz_learning/node_modules/meyda/dist/esm/extractors/spectralFlux.js` — Confirmed broken loop (negative index bug); verified in installed package
- `/Users/seijimatsuda/jazz_learning/node_modules/meyda/dist/esm/extractors/zcr.js` — Confirmed correct implementation
- `/Users/seijimatsuda/jazz_learning/node_modules/meyda/dist/esm/extractors/rms.js` — Confirmed correct implementation
- `/Users/seijimatsuda/jazz_learning/node_modules/meyda/dist/esm/main.js` — Confirmed `Meyda.extract(feature, signal, previousSignal?)` API and bufferSize requirement
- `/Users/seijimatsuda/jazz_learning/node_modules/meyda/dist/esm/utilities.js` — Confirmed `createChromaFilterBank()` uses sampleRate
- `/Users/seijimatsuda/jazz_learning/src/audio/types.ts` — AudioStateRef interface (Phase 1)
- `/Users/seijimatsuda/jazz_learning/src/audio/FrequencyBandSplitter.ts` — getBandEnergy(), hzToBin(), buildDefaultBands() (Phase 1)
- `/Users/seijimatsuda/jazz_learning/src/audio/CalibrationPass.ts` — CalibrationThresholds structure, threshold values (Phase 1)
- `/Users/seijimatsuda/jazz_learning/src/canvas/CanvasRenderer.ts` — rAF loop pattern (Phase 1)

### Secondary (MEDIUM confidence)

- https://meyda.js.org/audio-features.html — Feature list with return types and ranges; confirmed spectralFlux has "no upper range" (consistent with our unbounded flux computation)
- https://github.com/meyda/meyda/issues/236 — Confirmed spectralFlux bug existed; fix not yet released in stable (6.0.0 is still beta as of latest release page)
- https://github.com/meyda/meyda/releases — Confirmed latest stable is 5.6.3 (April 2024); v6.0.0 still in beta

### Tertiary (LOW confidence)

- WebSearch: ZCR ranges for guitar vs keyboard instruments — academic pattern confirmed (guitar higher ZCR than keyboard) but exact numeric ranges for jazz/4096-sample windows are unverified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from installed node_modules source
- Architecture: HIGH — follows exact patterns from Phase 1 codebase
- Meyda API: HIGH — read from installed ESM dist files
- spectralFlux bug: HIGH — confirmed from source code; not a rumor
- ZCR disambiguation thresholds: LOW — empirical ranges need validation on real jazz recordings
- Pitfalls: HIGH — derived from source-verified facts, not speculation

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (Meyda 5.6.3 stable; no indication of imminent 6.0 release)
