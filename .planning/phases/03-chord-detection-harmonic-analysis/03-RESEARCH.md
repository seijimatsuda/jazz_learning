# Phase 3: Chord Detection & Harmonic Analysis - Research

**Researched:** 2026-03-10
**Domain:** Chroma-based chord detection, harmonic tension scoring, Canvas tension meter rendering
**Confidence:** HIGH (all key claims verified by reading installed node_modules source directly and running empirical tests)

---

## Summary

Phase 3 adds chroma vector extraction via Meyda 5.6.3, template-matching chord detection across 96 templates (12 roots × 8 chord types), confidence-gated display, chord-function-to-tension mapping, and a Canvas tension meter. The entire phase has no new library dependencies — Meyda's `chroma` extractor is already installed and confirmed correct, all other work is pure TypeScript on top of Phase 1–2 patterns.

The highest-risk item is the Meyda chroma filter bank caching bug: **when `Meyda.sampleRate` changes (44100 vs 48000), Meyda's filter bank does NOT rebuild** because the invalidation check only tests `chromaFilterBank.length != chromaBands` — length stays 12, so stale filter bank is reused. This was verified empirically (see Code Examples). Using a 44100 filter bank on a 48000-sampled signal causes A to be misread as G# — a full semitone error. The fix is to call `Meyda.chromaFilterBank = undefined` before changing `Meyda.sampleRate`, forcing a rebuild. This must be done once at initialization time using the actual `audioCtx.sampleRate` read-back value.

The chroma extractor requires a Float32Array time-domain signal of power-of-2 length equal to `Meyda.bufferSize`. The project already maintains `analysis.rawTimeDataFloat` (pre-allocated Float32Array of fftSize=4096), populated from `rawTimeData` (Uint8Array) each tick. Phase 3 can use this buffer directly.

**Primary recommendation:** Build `ChordDetector.ts`, `TensionScorer.ts`, and `TensionMeter.ts` as pure TypeScript modules following the same zero-allocation, pre-computed-templates patterns used in Phases 1–2. Force filter bank rebuild at the correct sample rate during init. No new library installs required.

---

## Standard Stack

No new packages needed. All Phase 3 work uses:

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| meyda | 5.6.3 | Chroma extraction via `Meyda.extract('chroma', signal)` | Already installed; chroma extractor verified correct in source |
| Web Audio API (native) | - | AnalyserNode, time-domain float data | Already wired; `rawTimeData` Uint8Array → `rawTimeDataFloat` Float32Array exists |
| TypeScript Float32Array | - | Pre-allocated chord history, chroma buffer, tension history | GC-free, same pattern as Phases 1–2 |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| HTMLCanvasElement | native | Tension meter gradient bar, ghost line, heatmap | Already used in CanvasRenderer; same offscreen pattern |
| Zustand 5.0.11 | - | Expose current chord name + tension to React UI | Already wired; add chord/tension fields to `useAppStore` |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended File Structure

```
src/audio/
├── ChordDetector.ts       # NEW: chroma extraction, template matching, smoothing, history
├── TensionScorer.ts       # NEW: chord function → tension 0.0–1.0, lerp, rolling history
├── types.ts               # EXTEND: add ChordState, TensionState to AudioStateRef
src/canvas/
├── TensionMeter.ts        # NEW: Canvas gradient bar, ghost line rendering
├── TensionHeatmap.ts      # REPLACE: chord-function-based heatmap (replaces spectral centroid proxy)
store/
├── useAppStore.ts         # EXTEND: add currentChord, chordConfidence, currentTension fields
```

### Pattern 1: Template Pre-computation at Initialization

**What:** Build all 96 chord templates (12 roots × 8 types) once at initialization, stored as a `Float32Array[96][12]` equivalent (2D array). Do not rebuild per frame.

**When to use:** Template building calls `createChromaFilterBank` indirectly — no, actually templates are just static numeric arrays. They are computed from the music theory intervals, not from sample rate. Pre-compute once at module load.

**Example:**
```typescript
// Source: verified empirically — rotation pattern confirmed correct
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Base templates in root-C form (C = index 0)
const BASE_TEMPLATES: Record<string, number[]> = {
  major:  [1,0,0,0,1,0,0,1,0,0,0,0],
  minor:  [1,0,0,1,0,0,0,1,0,0,0,0],
  maj7:   [1,0,0,0,1,0,0,1,0,0,0,1],
  m7:     [1,0,0,1,0,0,0,1,0,0,1,0],
  dom7:   [1,0,0,0,1,0,0,1,0,0,1,0],
  dim7:   [1,0,0,1,0,0,1,0,0,1,0,0],
  m7b5:   [1,0,0,1,0,0,1,0,0,0,1,0],
  alt:    [1,0,0,0,1,0,1,0,0,0,1,0],
};

// RIGHT rotation to get root-R form: rotateRight(template, rootSemitones)
// Verified: rotateRight([1,0,0,0,1,0,0,1,0,0,0,0], 7) = [0,0,1,0,0,0,0,1,0,0,0,1] = G major (D=2,G=7,B=11)
function rotateRight(arr: number[], n: number): number[] {
  const len = arr.length;
  const k = n % len;
  return [...arr.slice(len - k), ...arr.slice(0, len - k)];
}

interface ChordTemplate {
  root: string;       // 'C', 'C#', etc.
  type: string;       // 'major', 'minor', etc.
  template: number[]; // length 12, pre-normalized
  function: ChordFunction; // tonic/subdominant/dominant/altered
}

// Build all 96 templates at module load time — zero per-frame cost
const CHORD_TEMPLATES: ChordTemplate[] = [];
for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
  for (const [typeName, baseVec] of Object.entries(BASE_TEMPLATES)) {
    CHORD_TEMPLATES.push({
      root: NOTE_NAMES[rootIdx],
      type: typeName,
      template: rotateRight(baseVec, rootIdx),
      function: assignChordFunction(typeName),
    });
  }
}
```

### Pattern 2: Meyda Chroma Extraction with Mandatory Filter Bank Reset

**What:** Before calling `Meyda.extract('chroma', ...)` for the first time, forcibly invalidate the filter bank so Meyda rebuilds it at the correct sample rate. Do this once during `ChordDetector` initialization.

**When to use:** Always — the default Meyda sampleRate is 44100 but iOS Safari may produce 48000. Not resetting causes a 1-semitone pitch-class error (A reads as G#).

**Example:**
```typescript
// Source: verified by reading node_modules/meyda/src/main.ts + empirical test
// The invalidation check is: typeof this.chromaFilterBank == 'undefined' || this.chromaFilterBank.length != this.chromaBands
// Length stays 12 when sampleRate changes — filter bank does NOT auto-rebuild.
// Fix: delete the cached filter bank before setting new sampleRate.

export function initChordDetector(sampleRate: number, bufferSize: number): void {
  // Force Meyda to rebuild its chroma filter bank at the correct sample rate.
  // CRITICAL: delete first, then set sampleRate. Order matters.
  (Meyda as any).chromaFilterBank = undefined;
  Meyda.bufferSize = bufferSize; // must equal fftSize = 4096
  Meyda.sampleRate = sampleRate; // actual audioCtx.sampleRate (44100 or 48000)
  // Trigger filter bank build by running a dummy extract (or it builds lazily on first real call)
  // Lazy build is fine — Meyda will build it on first extract() call with the correct sampleRate
}
```

### Pattern 3: Zero-Allocation Chroma Extraction Per Tick

**What:** Call `Meyda.extract('chroma', rawTimeDataFloat)` inside the 10fps analysis tick. Meyda returns a `number[]` (not typed array) — this is an unavoidable allocation inside Meyda itself, but the result array is 12 elements and short-lived. Store result into a pre-allocated `Float32Array` immediately.

**When to use:** Every 10fps tick when `state.isCalibrated` and audio is playing.

**Example:**
```typescript
// Source: node_modules/meyda/src/extractors/chroma.ts (read directly)
// chroma returns number[] of length 12, normalized to [0,1] max=1.0
// The rawTimeDataFloat buffer (Float32Array, length=fftSize=4096) is already
// populated by AnalysisTick.ts from rawTimeData (Uint8Array):
//   analysis.rawTimeDataFloat[i] = (state.rawTimeData[i] - 128) / 128;

function extractChroma(rawTimeDataFloat: Float32Array): Float32Array {
  const result = Meyda.extract('chroma', rawTimeDataFloat) as number[];
  // Copy into pre-allocated buffer to avoid keeping the number[] allocation alive
  const chromaBuf = state.chord.chromaBuffer; // pre-allocated Float32Array(12)
  for (let i = 0; i < 12; i++) {
    chromaBuf[i] = result[i];
  }
  return chromaBuf;
}
```

### Pattern 4: Bass Band Weighting for Root Detection (CHORD-02)

**What:** Meyda chroma gives equal weight to all octaves. For root detection, downweight upper octaves and upweight the bass register. Use the existing `rawFreqData` (Uint8Array from `rawAnalyser`) to extract which pitch class is dominant in the bass band (20–250 Hz), then blend that bias into the chroma vector.

**Implementation approach:** Rather than modifying the chroma filter bank (complex), apply a post-processing weight: identify the loudest bin in the bass band (bins 0–23 at 44100, 0–21 at 48000), find its pitch class (bin → Hz → semitone), and multiply that pitch class's chroma weight by a bass boost factor (e.g. 1.5). This is done with the existing `hzToBin` function.

**Example:**
```typescript
// Source: FrequencyBandSplitter.ts hzToBin pattern + empirical bin calculation
// Bass band: 20–250 Hz
// At 44100/4096: bins 1–23; at 48000/4096: bins 1–21
// Bass weight factor: 1.5 (boosts root detection without overwhelming chroma signal)

function applyBassWeighting(
  chroma: Float32Array,        // 12-element, values [0,1]
  rawFreqData: Uint8Array,     // fftSize/2 bins from rawAnalyser
  sampleRate: number,
  fftSize: number
): void {
  const bassHighBin = hzToBin(250, sampleRate, fftSize);
  let maxBin = 1; // skip DC (bin 0)
  let maxEnergy = 0;
  for (let bin = 1; bin <= bassHighBin; bin++) {
    if (rawFreqData[bin] > maxEnergy) {
      maxEnergy = rawFreqData[bin];
      maxBin = bin;
    }
  }
  if (maxEnergy < 20) return; // no meaningful bass signal

  // Convert bin to Hz then to pitch class (semitone % 12)
  const hz = (maxBin * sampleRate) / fftSize;
  const semitone = Math.round(12 * Math.log2(hz / 16.352)) % 12; // C0 = 16.352 Hz
  const pitchClass = ((semitone % 12) + 12) % 12;
  chroma[pitchClass] = Math.min(1.0, chroma[pitchClass] * 1.5);
}
```

### Pattern 5: 300ms Rolling Window Chroma Smoothing (CHORD-05)

**What:** Maintain a rolling buffer of the last 3 chroma vectors (3 × 100ms ticks = 300ms). Average them before template matching. This smooths transient noise without losing chord changes.

**When to use:** Every analysis tick, before cosine similarity scoring.

**Example:**
```typescript
// Pre-allocated: chromaHistory Float32Array(36) = 3 frames × 12 values
// Write current frame, compute average

function updateChromaHistory(history: Float32Array, head: number, newChroma: Float32Array): void {
  const offset = head * 12;
  for (let i = 0; i < 12; i++) {
    history[offset + i] = newChroma[i];
  }
}

function smoothedChroma(history: Float32Array, smoothed: Float32Array): void {
  for (let i = 0; i < 12; i++) {
    smoothed[i] = (history[i] + history[12 + i] + history[24 + i]) / 3;
  }
}
```

### Pattern 6: Cosine Similarity + Confidence Gap Scoring (CHORD-03, CHORD-04)

**What:** For each of the 96 pre-built templates, compute cosine similarity against the smoothed chroma. Best match = current chord. Confidence = gap between 1st and 2nd best score.

**Example:**
```typescript
// Source: verified empirically — cosine similarity with [1,0,0,0,1,0,0,1,0,0,0,0] vs C-major chroma gives 0.98
function cosineSim(chroma: Float32Array, template: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < 12; i++) {
    dot  += chroma[i] * template[i];
    magA += chroma[i] * chroma[i];
    magB += template[i] * template[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// Returns { bestIdx, bestScore, confidenceGap }
function matchChord(chroma: Float32Array): { bestIdx: number; bestScore: number; confidenceGap: number } {
  let best1Score = -1, best2Score = -1, best1Idx = 0;
  for (let i = 0; i < CHORD_TEMPLATES.length; i++) {
    const s = cosineSim(chroma, CHORD_TEMPLATES[i].template);
    if (s > best1Score) { best2Score = best1Score; best1Score = s; best1Idx = i; }
    else if (s > best2Score) { best2Score = s; }
  }
  return { bestIdx: best1Idx, bestScore: best1Score, confidenceGap: best1Score - best2Score };
}
```

### Pattern 7: Flicker Prevention via Hold Gate (CHORD-06)

**What:** A detected chord only becomes the "displayed chord" when it has been stable for >200ms (2 ticks at 10fps). Maintain a `pendingChord` and `pendingHoldCount` on the `ChordState`.

**Example:**
```typescript
// Source: requirements CHORD-06
const HOLD_TICKS = 2; // 200ms at 10fps

function updateDisplayChord(state: ChordState, candidate: number): void {
  if (candidate === state.pendingChordIdx) {
    state.pendingHoldCount++;
    if (state.pendingHoldCount >= HOLD_TICKS) {
      state.displayedChordIdx = state.pendingChordIdx;
      // push to chord history log (CHORD-11)
    }
  } else {
    state.pendingChordIdx = candidate;
    state.pendingHoldCount = 1;
  }
}
```

### Pattern 8: Tension Lerp Smoothing (TENS-01, TENS-02)

**What:** Map chord function to tension target, lerp current tension toward target at 0.05/frame.

**Verified:** At 0.05/frame from 0.0 → 1.0, after 10 frames (1 second): 0.4013. After 30 frames (3 seconds): 0.7854. Fast enough for musical perception.

**Example:**
```typescript
// Source: requirements TENS-01, TENS-02 + empirical verification
const TENSION_TARGETS: Record<ChordFunction, [number, number]> = {
  tonic:       [0.0,  0.2 ],
  subdominant: [0.2,  0.45],
  dominant:    [0.55, 0.75],
  altered:     [0.75, 1.0 ],
};

const LERP_RATE = 0.05;

function updateTension(state: TensionState, chordFunction: ChordFunction): void {
  const [lo, hi] = TENSION_TARGETS[chordFunction];
  // Target is midpoint of range
  const target = (lo + hi) / 2;
  state.currentTension += (target - state.currentTension) * LERP_RATE;
}
```

### Pattern 9: Tension Heatmap Replacement (TENS-06)

**What:** Phase 3 replaces the spectral centroid proxy in `TensionHeatmap.ts` with a chord-function-based heatmap. The heatmap is pre-computed on file load using `Meyda.extract` over offline frames.

**Approach:** Slide a 4096-sample window over the decoded AudioBuffer (step = ~4096 samples = ~93ms), extract chroma each step, match chord, map function to tension midpoint value, write to `Float32Array[numSeconds]`.

**Important:** This offline pass uses `Meyda.extract` with no AudioContext (offline mode). Meyda's `extract` function operates on raw Float32Array — no AudioContext needed. Must set `Meyda.bufferSize` and `Meyda.sampleRate` correctly before each call (same filter bank fix applies).

### Anti-Patterns to Avoid

- **Per-frame chroma filter bank rebuild:** Never call `(Meyda as any).chromaFilterBank = undefined` inside the rAF loop. Do it once at init.
- **Allocating template arrays per tick:** Templates are static constants. Build at module load, reuse forever.
- **Using `new Float32Array(12)` inside the 10fps tick:** Use the pre-allocated `chromaBuffer` on `ChordState`.
- **Assuming sampleRate is always 44100:** All Hz↔bin math must use `state.sampleRate` (the read-back value). iOS may deliver 48000.
- **Calling `Meyda.extract` with wrong `bufferSize`:** Meyda will throw "Buffer size must be power of 2" if `Meyda.bufferSize !== signal.length`. Set `Meyda.bufferSize = 4096` once at init and leave it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chroma extraction | Custom FFT + filter bank | `Meyda.extract('chroma', signal)` | Meyda's chroma is correct, tested, handles windowing; custom filter bank math is 50+ lines with subtle octave-weight tuning |
| Hanning window | Manual windowing | Meyda's internal windowing (applied automatically in `extract`) | Meyda applies the hanning window before its internal FFT — no need to pre-window the signal |
| Canvas gradient for tension meter | Custom color interpolation | `ctx.createLinearGradient` with color stops | Canvas 2D gradient is hardware-accelerated; custom interpolation in JS is unnecessary |

**Key insight:** Meyda's `extract()` handles windowing, FFT, and chroma filter bank internally. The caller only needs a raw time-domain Float32Array of length equal to `Meyda.bufferSize`. The signal does NOT need to be pre-windowed.

---

## Common Pitfalls

### Pitfall 1: Stale Meyda Chroma Filter Bank on iOS

**What goes wrong:** Meyda builds its chroma filter bank lazily and caches it. The invalidation check is `typeof this.chromaFilterBank == 'undefined' || this.chromaFilterBank.length != this.chromaBands`. Since `chromaBands` defaults to 12 and never changes, the filter bank is NEVER rebuilt when `sampleRate` changes. On iOS (48000 Hz), the 44100 filter bank causes a 1-semitone pitch-class error (A → G#).

**Why it happens:** Read directly from `node_modules/meyda/src/main.ts` lines 334–338. Confirmed empirically: `Meyda.sampleRate = 48000` then `extract('chroma', ...)` returns identical results to 44100 until filter bank is force-invalidated.

**How to avoid:** At `ChordDetector` initialization:
```typescript
(Meyda as any).chromaFilterBank = undefined; // force rebuild
Meyda.bufferSize = 4096;
Meyda.sampleRate = audioCtx.sampleRate; // actual read-back value
```

**Warning signs:** If chord detection systematically reads chords a semitone flat/sharp on iOS compared to desktop.

### Pitfall 2: Wrong Template Rotation Direction

**What goes wrong:** Using left-rotation instead of right-rotation when building root-relative templates. `rotateLeft(cMajor, 7)` gives positions [0, 5, 9] (wrong). `rotateRight(cMajor, 7)` gives [2, 7, 11] = D, G, B = G major (correct).

**Why it happens:** The chroma vector is in absolute pitch space (index 0 = C, index 7 = G). To shift the root from C to G (up 7 semitones), the template must shift RIGHT by 7 positions.

**How to avoid:** Use `rotateRight(template, rootSemitones)` = `[...template.slice(len - n), ...template.slice(0, len - n)]`. Verified empirically.

**Warning signs:** All 12-root templates produce identical cosine similarity scores, or correct chord body detected on wrong root.

### Pitfall 3: Meyda.extract Allocates on Every Call (Expected, Not a Bug)

**What goes wrong:** Treating Meyda chroma as zero-allocation. It allocates a `number[]` of length 12 each call (inside `chromaFilterBank.map(...)`). This is expected and acceptable (small, short-lived).

**Why it happens:** Meyda's chroma extractor uses `Array.map`. Read directly from source `extractors/chroma.ts` line 17.

**How to avoid:** Accept the allocation. Immediately copy result into a pre-allocated `Float32Array(12)` on `ChordState`. Don't hold references to the returned `number[]`.

### Pitfall 4: Chord History Log Growing Without Bound (CHORD-11)

**What goes wrong:** Appending every chord change to a plain array `[]` without bounding. A 3-hour playback session would accumulate thousands of entries and cause memory pressure.

**How to avoid:** Bound the chord history log to the last N entries (e.g. 1000 changes max) using a circular buffer pattern or `array.splice(0, 1)` when limit exceeded. Pre-allocate as a fixed-length array with a head pointer.

### Pitfall 5: Ghost Line Requiring Previous Tension History Access

**What goes wrong:** TENS-05 requires the tension level from "3 seconds ago." If tension history is stored as a single scalar, this is impossible without a time-indexed buffer.

**How to avoid:** Pre-allocate a `Float32Array` tension history ring buffer of capacity `Math.ceil(3 / 0.1) + 2 = 32 slots` (3 seconds at 10fps). On every tick, read the value from 30 ticks ago as the ghost line position.

### Pitfall 6: Canvas Gradient Creation Inside rAF Loop

**What goes wrong:** Calling `ctx.createLinearGradient(...)` inside the render loop creates a new gradient object each frame.

**How to avoid:** Create the gradient once during `TensionMeter` initialization. Store it as a class field. On each frame, only update `fillStyle` to the stored gradient and render.

---

## Code Examples

### Meyda Chroma Extraction (Verified API)

```typescript
// Source: node_modules/meyda/src/main.ts + node_modules/meyda/src/extractors/chroma.ts
// Chroma returns number[] length 12, max-normalized to [0, 1]
// Input: Float32Array of length Meyda.bufferSize (must equal 4096 for this project)
// rawTimeDataFloat is pre-allocated on AnalysisState and already populated by AnalysisTick

import Meyda from 'meyda';

// Call ONCE at init — force correct filter bank
(Meyda as any).chromaFilterBank = undefined;
Meyda.bufferSize = 4096;
Meyda.sampleRate = state.sampleRate; // actual audioCtx.sampleRate

// Per tick (inside runAnalysisTick, after rawTimeDataFloat is populated):
const chromaRaw = Meyda.extract('chroma', state.analysis.rawTimeDataFloat) as number[];
// chromaRaw is a number[12], max-normalized; copy to pre-allocated buffer immediately
```

### Canvas Tension Meter Gradient (Verified Canvas API)

```typescript
// Source: MDN Canvas 2D createLinearGradient (standard Web API)
// Vertical gradient bar: full canvas height, blue=low, red=high
// Create ONCE at init, reuse every frame

function createTensionGradient(ctx: CanvasRenderingContext2D, height: number): CanvasGradient {
  const grad = ctx.createLinearGradient(0, height, 0, 0); // bottom to top
  grad.addColorStop(0.0,  '#3b82f6'); // blue   — tonic (low tension)
  grad.addColorStop(0.35, '#f59e0b'); // amber  — subdominant
  grad.addColorStop(0.65, '#f97316'); // orange — dominant
  grad.addColorStop(1.0,  '#ef4444'); // red    — altered (max tension)
  return grad;
}
```

### TensionHeatmap Pre-computation (Offline Mode)

```typescript
// Source: TensionHeatmap.ts existing pattern + Meyda offline extract
// Replace spectral centroid proxy with chord-function tension
// Process decoded AudioBuffer directly — no AudioContext needed for Meyda.extract

export async function computeChordTensionHeatmap(
  buffer: AudioBuffer,
  sampleRate: number
): Promise<Float32Array> {
  const FRAME_SIZE = 4096;
  const HOP = FRAME_SIZE; // non-overlapping, ~93ms at 44100
  const numSeconds = Math.ceil(buffer.duration);
  const tension = new Float32Array(numSeconds);

  // Force correct filter bank for this sampleRate
  (Meyda as any).chromaFilterBank = undefined;
  Meyda.bufferSize = FRAME_SIZE;
  Meyda.sampleRate = sampleRate;

  // Mix down to mono
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    const gain = 1 / buffer.numberOfChannels;
    for (let i = 0; i < buffer.length; i++) mono[i] += data[i] * gain;
  }

  // Map each second to chord-function tension
  for (let sec = 0; sec < numSeconds; sec++) {
    const startSample = Math.floor(sec * sampleRate);
    const slice = mono.subarray(startSample, startSample + FRAME_SIZE);
    if (slice.length < FRAME_SIZE) { tension[sec] = 0; continue; }

    const chroma = Meyda.extract('chroma', slice) as number[];
    const matchResult = matchChord(Float32Array.from(chroma));
    const fn = CHORD_TEMPLATES[matchResult.bestIdx].function;
    const [lo, hi] = TENSION_TARGETS[fn];
    tension[sec] = (lo + hi) / 2;
  }

  return tension;
}
```

### ChordState Shape for AudioStateRef Extension

```typescript
// Extend types.ts — add to AudioStateRef and initAnalysisState

export type ChordFunction = 'tonic' | 'subdominant' | 'dominant' | 'altered';

export interface ChordState {
  chromaBuffer: Float32Array;       // length 12, pre-allocated
  chromaHistory: Float32Array;      // length 36 (3 frames × 12), pre-allocated
  chromaHistoryHead: number;        // ring buffer write index 0–2
  smoothedChroma: Float32Array;     // length 12, pre-allocated
  pendingChordIdx: number;          // index into CHORD_TEMPLATES, -1 = none
  pendingHoldCount: number;         // ticks pending chord has been stable
  displayedChordIdx: number;        // -1 = no chord detected
  confidenceGap: number;            // best - second-best cosine sim score
  chordLog: Array<{                 // CHORD-11: timestamped history
    audioTimeSec: number;
    chordIdx: number;
    confidenceGap: number;
  }>;
  chordLogMaxLen: number;           // cap at 1000 entries
}

export interface TensionState {
  currentTension: number;           // 0.0–1.0, lerp-smoothed
  tensionHistory: Float32Array;     // length 32 (3s at 10fps + margin), pre-allocated
  tensionHistoryHead: number;       // ring buffer write index
  tensionHistorySamples: number;    // how many valid samples written
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| TensionHeatmap: spectral centroid variance proxy | Chord-function-based tension per second | Replace `computeTensionHeatmap` in TensionHeatmap.ts with chord-matching version |
| No chord detection | Template-matching chord detector with confidence | New module ChordDetector.ts |
| No harmonic tension | Lerp-smoothed tension from chord function | New module TensionScorer.ts |

---

## Open Questions

1. **Meyda chroma accuracy for jazz harmony**
   - What we know: Meyda chroma is max-normalized — the loudest pitch class is always 1.0. This is good for chord matching but loses absolute magnitude info (e.g. can't distinguish a loud E from a quiet E as root candidates).
   - What's unclear: Whether jazz extended chords (9ths, 11ths, 13ths) produce chroma vectors that accidentally match simpler templates (e.g. a Cmaj9 might match G major via shared notes).
   - Recommendation: Start with the 8-type template set as specified. The confidence gap scoring will flag ambiguous detections as low-confidence, triggering the "chord family only" display path (CHORD-07). This is the designed fallback — trust the requirements.

2. **Meyda bufferSize = 4096 vs chroma frequency resolution**
   - What we know: At fftSize=4096, the lowest reliable frequency bin is ~10.7 Hz (44100/4096). Below A0 (27.5 Hz), chroma is unreliable. This affects bass guitar low open strings.
   - What's unclear: Whether this causes systematic errors in bass pitch class detection specifically (since bass weighting CHORD-02 uses the bass band 20–250 Hz).
   - Recommendation: The bass weighting is a bias, not a hard replacement for chroma. If the bass bin is unreliable, the weighting factor (1.5×) on the detected bin simply doesn't activate cleanly. Acceptable for MVP.

3. **Chord history log type (CHORD-11)**
   - What we know: Requirement says "timestamped chord history log maintained during playback." No format specified.
   - What's unclear: Whether this needs to be accessible from UI (Zustand) or stays on AudioStateRef.
   - Recommendation: Keep it on AudioStateRef (same pattern as all audio data). Expose only the most recent entry to Zustand for UI display.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/meyda/src/extractors/chroma.ts` — chroma extractor source, verified correct; returns max-normalized `number[12]`
- `node_modules/meyda/src/main.ts` — `extract()` implementation; chroma filter bank cache invalidation logic verified (lines 334–338)
- `node_modules/meyda/src/utilities.ts` — `createChromaFilterBank()` implementation; `sampleRate` is a parameter, confirming different filter banks for different rates
- Empirical test: `Meyda.sampleRate = 48000` with existing filter bank causes A (bin 38) to be classified as G# — confirmed 1-semitone error
- Empirical test: correct template rotation is RIGHT rotation by rootSemitones — G major = rotateRight(cMajor, 7) gives D=2, G=7, B=11
- Empirical test: cosine similarity correctly scores C-major-like chroma at 0.98 vs C-major template, 0.67 vs C-minor
- Empirical test: lerp at 0.05/frame, 10 frames: reaches 0.4013 (1 - 0.95^10 = 0.4013 confirmed)
- `src/audio/types.ts` — AudioStateRef, AnalysisState; `rawTimeDataFloat: Float32Array` confirmed pre-allocated at fftSize length
- `src/audio/AnalysisTick.ts` — confirms rawTimeDataFloat is populated from rawTimeData each tick; Phase 3 can reuse this buffer

### Secondary (MEDIUM confidence)
- `src/audio/TensionHeatmap.ts` — existing placeholder; has comment "Phase 3 will replace this with a chroma-based harmonic tension measure" — confirms replacement scope
- `src/store/useAppStore.ts` — Zustand store pattern; Phase 3 adds `currentChord`, `chordConfidence`, `currentTension` fields following same pattern as `instrumentRoles`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; Meyda chroma verified by reading source
- Meyda filter bank bug: HIGH — confirmed by reading source AND empirical test proving stale filter bank causes 1-semitone error on iOS
- Template rotation direction: HIGH — confirmed empirically; rotateRight gives correct G major
- Architecture: HIGH — follows established patterns from Phases 1–2 verbatim
- Canvas tension meter: HIGH — standard Canvas 2D gradient API, no surprises
- Jazz chord accuracy: MEDIUM — template matching is known-good for simple chords; extended jazz chords may trigger low-confidence path frequently (acceptable by design)

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (Meyda 5.6.3 is stable; no expected updates)
