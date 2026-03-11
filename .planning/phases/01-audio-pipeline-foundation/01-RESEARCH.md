# Phase 01: Audio Pipeline Foundation - Research

**Researched:** 2026-03-10
**Domain:** Web Audio API, iOS Safari compatibility, Canvas performance, Vite + React + TypeScript scaffold
**Confidence:** MEDIUM-HIGH (most claims verified via official docs or authoritative sources; Meyda internals confirmed via GitHub issue + official API reference)

---

## Summary

Phase 01 establishes the entire audio processing foundation: scaffold, file ingestion, AudioContext lifecycle, dual AnalyserNode wiring, frequency-bin math, calibration pass, transport controls, and performance baseline. The decisions locked before research (Canvas API, Meyda.js, frequency band splitting, iOS-first) are well-supported by current library versions and platform capabilities.

The two highest-risk items are **Meyda's ScriptProcessorNode dependency** (confirmed still true in v5.6.3, the deprecated API is not hidden by default, but browsers continue to support it) and **iOS AudioContext sampleRate behavior** (requesting 44100 via constructor option is partially honored — always read `audioCtx.sampleRate` back after creation because Safari may ignore the hint). Both risks are known, bounded, and can be handled with explicit defensive code in Plan 01-02 and 01-03.

The pre-computed tension heatmap (AUDIO-07) requires an `OfflineAudioContext` rendering pass over the full decoded buffer — this is a standard Web Audio pattern but needs to run after `decodeAudioData` completes and before first playback. It should be sequenced carefully in Plan 01-04 alongside the 3-second calibration pass to avoid doubling memory pressure.

**Primary recommendation:** Scaffold with `npm create vite@latest -- --template react-ts`, add Tailwind v4 via `@tailwindcss/vite` plugin (single `@import "tailwindcss"` in CSS), use Zustand 5 for UI state only, and keep all Web Audio API objects in a stable `useRef`-backed `audioStateRef` that never triggers React re-renders in the hot path.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | 6.x (create-vite 8.3.0) | Build tool + dev server | Fastest HMR for React/TS; port 5555 via `--port` |
| React | 19.x (via react-ts template) | UI framework | Project decision |
| TypeScript | 5.x | Type safety | Project decision |
| Tailwind CSS | 4.x | Utility CSS | CSS-first config via `@tailwindcss/vite` plugin |
| Zustand | 5.0.x | UI state management | Lightweight, no provider boilerplate; v5 uses `useSyncExternalStore` |
| Meyda | 5.6.3 | Audio feature extraction | Provides chroma, RMS, ZCR, spectral flux out of the box; last release April 2024 |
| Web Audio API | Native browser | AudioContext, AnalyserNode, decodeAudioData | No install; iOS Safari compatible from iOS 6+ |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tailwindcss/vite | 4.x | Tailwind Vite plugin | Required for Tailwind v4 — replaces PostCSS config |
| FileReader API | Native | File upload to ArrayBuffer | Used in Plan 01-02 for MP3/WAV ingestion |
| OfflineAudioContext | Native | Full-track precompute | Used in Plan 01-04 for tension heatmap generation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Meyda 5.6.3 | Essentia.js (WASM) | Essentia is more accurate but requires WASM bundle, heavier, less tested on iOS |
| Meyda 5.6.3 | Hand-rolled FFT feature math | Don't hand-roll — Meyda chroma/ZCR/spectral flux are non-trivial DSP correctly implemented |
| AudioBufferSourceNode | HTMLAudioElement | HTMLAudioElement doesn't expose AnalyserNode tap; AudioBufferSourceNode is required for FFT analysis |
| Zustand | React Context for audio state | Audio state must NOT live in React state — use `useRef` for hot-path data, Zustand only for UI-triggering state |

### Installation

```bash
npm create vite@latest jazz-viz -- --template react-ts
cd jazz-viz
npm install tailwindcss @tailwindcss/vite
npm install zustand
npm install meyda
npm install --save-dev @types/meyda
```

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5555 },
})
```

**src/index.css:**
```css
@import "tailwindcss";
```

Node.js requirement: v20.19+ or v22.12+

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── audio/
│   ├── AudioEngine.ts       # AudioContext, AnalyserNodes, source management
│   ├── FrequencyBandSplitter.ts  # hzToBin, per-band range slicing
│   ├── CalibrationPass.ts   # 3-second calibration, threshold computation
│   └── types.ts             # audioStateRef interface
├── canvas/
│   ├── CanvasRenderer.ts    # rAF loop, devicePixelRatio, offscreen glow
│   └── offscreen/
│       └── glowLayer.ts     # Pre-rendered glow compositing
├── store/
│   └── useAppStore.ts       # Zustand store — UI state only (not audio hot-path)
├── hooks/
│   └── useAudioRef.ts       # Returns stable audioStateRef, never re-renders
└── components/
    ├── FileUpload.tsx
    ├── TransportControls.tsx
    └── Timeline.tsx
```

### Pattern 1: AudioContext Inside User Gesture (iOS-Safe)

**What:** Create AudioContext on first user interaction (click/touchend), not on page load. iOS Safari silently fails if AudioContext is created outside a user gesture handler.

**When to use:** Always. This is not optional for iOS Safari.

```typescript
// Source: MDN Web Audio API + mattmontag.com/web/unlock-web-audio-in-safari
let audioCtx: AudioContext | null = null;

async function initAudioContext(): Promise<AudioContext> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  // Request 44100 — iOS may or may not honor it; always read back
  audioCtx = new AudioContextClass({ sampleRate: 44100 });

  // Always verify — iOS sometimes ignores the constructor hint
  const actualSampleRate = audioCtx.sampleRate;
  console.log('AudioContext sampleRate:', actualSampleRate); // May be 48000 on some iOS

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  return audioCtx;
}

// Attach to user gesture — use touchend not touchstart (touchstart may be scroll)
uploadButton.addEventListener('click', async () => {
  await initAudioContext();
});
```

### Pattern 2: Dual AnalyserNode Setup

**What:** Two AnalyserNodes tapped from the same source — one smoothed (for visualization), one raw (for transient/beat detection).

**When to use:** Required per AUDIO-08. Both share identical `fftSize`; only `smoothingTimeConstant` differs.

```typescript
// Source: MDN AnalyserNode documentation
function createDualAnalysers(audioCtx: AudioContext) {
  const fftSize = 4096; // project requirement

  const smoothed = audioCtx.createAnalyser();
  smoothed.fftSize = fftSize;
  smoothed.smoothingTimeConstant = 0.8;  // for visualization
  smoothed.minDecibels = -90;
  smoothed.maxDecibels = -10;

  const raw = audioCtx.createAnalyser();
  raw.fftSize = fftSize;
  raw.smoothingTimeConstant = 0.0;  // no smoothing — transient detection

  return { smoothed, raw };
}

// Connect: source → splitter → [smoothed, raw] → destination
source.connect(smoothed);
source.connect(raw);
smoothed.connect(audioCtx.destination);
```

### Pattern 3: Sample-Rate-Aware hzToBin

**What:** Never hardcode FFT bin indices. Always compute from `audioCtx.sampleRate` read after context creation.

**When to use:** Any time a Hz frequency maps to an FFT bin (AUDIO-09 / XCUT-01).

```typescript
// Formula verified: bin = Math.round(hz * fftSize / sampleRate)
// Source: MDN AnalyserNode.frequencyBinCount, DSP first principles
function hzToBin(hz: number, sampleRate: number, fftSize: number): number {
  return Math.round(hz * fftSize / sampleRate);
}

// Example: 48kHz context, fftSize=4096
// Bin count = 2048, Nyquist = 24000 Hz, bin width = ~11.7 Hz
// Snare low (200 Hz) → bin 17
// Ride high (10000 Hz) → bin 853
// (at 44.1kHz these shift slightly — hence always use audioCtx.sampleRate)
```

### Pattern 4: AudioBufferSourceNode Transport Controls (Play/Pause/Seek)

**What:** AudioBufferSourceNode is one-shot (cannot restart). Implement transport by tracking `startOffset`, destroying and recreating the source node on each play/seek action. Keep the `AudioBuffer` reference — never re-decode.

**When to use:** Required for AUDIO-05, AUDIO-06.

```typescript
// Source: webaudioapi.com/book + MDN AudioBufferSourceNode.start()
interface TransportState {
  buffer: AudioBuffer;
  sourceNode: AudioBufferSourceNode | null;
  startTime: number;       // audioCtx.currentTime when play() was called
  pauseOffset: number;     // accumulated playback position in seconds
  isPlaying: boolean;
}

function play(state: TransportState, audioCtx: AudioContext) {
  const source = audioCtx.createBufferSource();
  source.buffer = state.buffer;
  source.connect(audioCtx.destination);
  source.start(0, state.pauseOffset);
  state.sourceNode = source;
  state.startTime = audioCtx.currentTime;
  state.isPlaying = true;
}

function pause(state: TransportState, audioCtx: AudioContext) {
  if (!state.isPlaying || !state.sourceNode) return;
  const elapsed = audioCtx.currentTime - state.startTime;
  state.pauseOffset += elapsed;
  state.sourceNode.stop();
  state.sourceNode = null;
  state.isPlaying = false;
}

function seek(state: TransportState, audioCtx: AudioContext, positionSecs: number) {
  if (state.sourceNode) {
    state.sourceNode.stop();
    state.sourceNode = null;
  }
  state.pauseOffset = positionSecs;
  if (state.isPlaying) play(state, audioCtx);
}

// Current position (for scrubber UI):
function currentPosition(state: TransportState, audioCtx: AudioContext): number {
  if (!state.isPlaying) return state.pauseOffset;
  return state.pauseOffset + (audioCtx.currentTime - state.startTime);
}
```

### Pattern 5: devicePixelRatio HiDPI Canvas Scaling (XCUT-04)

**What:** Set canvas internal pixel dimensions to `CSS size × devicePixelRatio`, then `ctx.scale(dpr, dpr)` so all drawing coordinates stay in CSS pixels.

```typescript
// Source: web.dev/articles/canvas-hidipi + MDN devicePixelRatio
function setupHiDPICanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}
```

### Pattern 6: Pre-Computed Tension Heatmap via OfflineAudioContext (AUDIO-07)

**What:** After `decodeAudioData`, render the full `AudioBuffer` through an `OfflineAudioContext` + Meyda offline extractor to generate a chroma array across the whole track. This produces the timeline heatmap before playback starts.

**When to use:** On file load, after decoding, before playback. Run in a Promise chain — do not block the main thread during this render.

```typescript
// Source: MDN OfflineAudioContext
async function precomputeChromaMap(buffer: AudioBuffer): Promise<Float32Array[]> {
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start();
  // NOTE: Meyda offline extraction (Meyda.extract()) works on raw Float32Array slices
  // Slice the buffer in ~512-sample windows, call Meyda.extract('chroma', slice)
  // Accumulate into array for heatmap rendering
  // OfflineAudioContext.startRendering() can help with processing pipeline
  return []; // populated with per-window chroma vectors
}
```

### Pattern 7: Canvas Glow Without shadowBlur (XCUT-02 performance)

**What:** `shadowBlur` is expensive on iOS — triggers off-screen pass every frame. Instead, pre-render glow to a separate offscreen canvas and composite it using `drawImage` with reduced opacity.

**When to use:** Any animated glow effect in Phase 01 canvas baseline.

```typescript
// Source: MDN Optimizing Canvas + ecosystem research
// Pre-render glow once (or when radius/color changes)
function createGlowLayer(radius: number, color: string): HTMLCanvasElement {
  const offscreen = document.createElement('canvas');
  const size = radius * 4;
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return offscreen;
}

// In rAF loop: drawImage the cached glow layer — no per-frame blur computation
ctx.globalAlpha = glowIntensity;
ctx.drawImage(cachedGlowLayer, x - radius*2, y - radius*2);
ctx.globalAlpha = 1.0;
```

**iOS OffscreenCanvas note:** `OffscreenCanvas` (transferToImageBitmap path) is fully supported only from **iOS Safari 17.0+**. The offscreen HTMLCanvasElement glow strategy above (using a regular off-DOM canvas element) is safe on all iOS versions including iOS 16 and below.

### Anti-Patterns to Avoid

- **Creating AudioContext on page load:** Fails silently on iOS. Must be inside a user gesture handler.
- **Hardcoded FFT bin indices:** e.g., `data[150]` for 3kHz. Wrong at 48kHz vs 44.1kHz. Always use `hzToBin()`.
- **Reading `audioCtx.sampleRate` as 44100 without verifying:** iOS may return 48000 even when 44100 is requested in constructor. Always read back.
- **Reusing AudioBufferSourceNode after stop():** Cannot be restarted. Always create a new node.
- **Storing AudioContext or AnalyserNode in React state (useState/Zustand):** Triggers re-renders. Use `useRef` for all Web Audio objects.
- **Per-frame `shadowBlur` on iOS:** Causes compositing pass every frame — fails the 40fps iOS floor. Use offscreen gradient compositing instead.
- **Per-frame garbage collection (new Float32Array() in rAF):** Pre-allocate all typed arrays once outside the loop (XCUT-03).
- **Forgetting to handle iOS "interrupted" state:** When user leaves app/tab, AudioContext state becomes "interrupted" — listen to `statechange` event and call `resume()` on next gesture.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chroma extraction | Custom FFT → pitch class binning | `Meyda.extract('chroma', signal)` | Chroma binning with proper frequency wrapping is non-trivial; Meyda handles normalization |
| ZCR computation | Count zero crossings manually | `Meyda.extract('zcr', signal)` | Already implemented and tested |
| Spectral flux | Frame-to-frame spectral diff | `Meyda.extract('spectralFlux', signal)` | Correct handling of previous-frame state is subtle |
| RMS energy | Manual squared sum | `Meyda.extract('rms', signal)` | Trivial but saves code |
| iOS AudioContext unlock | Custom gesture-listener unlock loop | Pattern 1 above (or `standardized-audio-context` npm pkg) | Edge cases in touchstart vs touchend ordering |
| Audio file decoding | Manual MP3/WAV parsing | `audioCtx.decodeAudioData(arrayBuffer)` | Browser handles codec negotiation |

**Key insight:** Meyda's feature extractors are the single most fragile part of this phase to hand-roll. The chroma algorithm requires proper constant-Q frequency spacing and normalization across sample rates — implementing correctly is ~200–400 lines of validated DSP. Use Meyda.

---

## Common Pitfalls

### Pitfall 1: iOS AudioContext "Suspended" Silent Failure

**What goes wrong:** AudioContext created outside user gesture stays suspended. All audio calls succeed (no error thrown) but produce silence. Hard to debug.

**Why it happens:** iOS enforces user gesture requirement at OS level — not just a browser hint.

**How to avoid:** Create AudioContext inside the file-picker click handler. Check `audioCtx.state === 'suspended'` after creation and call `await audioCtx.resume()`.

**Warning signs:** Audio decoded successfully (decodeAudioData resolves) but no sound, AnalyserNode returns all-zero arrays.

### Pitfall 2: Meyda ScriptProcessorNode Deprecation Warning

**What goes wrong:** Browser console shows deprecation warning for ScriptProcessorNode when Meyda analyzer is running. Could trigger in future browser versions to become an error.

**Why it happens:** Meyda 5.6.3 (April 2024, latest) still uses ScriptProcessorNode internally. AudioWorklet migration is open issue #286 with no resolution date.

**How to avoid:** Accept the deprecation warning for now — ScriptProcessorNode still works in all major browsers. Plan note: if Meyda drops a 6.x with AudioWorklet, migrate then. Do NOT attempt to wrap Meyda in a custom AudioWorklet for this phase.

**Warning signs:** None at runtime, but check for `ScriptProcessorNode is deprecated` in console — expected and acceptable.

### Pitfall 3: Wrong sampleRate in hzToBin Breaks Frequency Band Splitting

**What goes wrong:** If 44100 is assumed but iOS returns 48000, all frequency bands shift. Bass band (20–250 Hz) leaks into wrong bins. Calibration thresholds computed on wrong data.

**Why it happens:** iOS sometimes ignores `{ sampleRate: 44100 }` constructor option, returning 48000.

**How to avoid:** Always read `audioCtx.sampleRate` after creation. Pass `audioCtx.sampleRate` explicitly to every `hzToBin()` call. Never use a module-level constant.

**Warning signs:** Calibration thresholds seem wrong on iOS compared to desktop. Instrument band activity scores don't match audible content.

### Pitfall 4: Meyda sampleRate Parameter Confusion

**What goes wrong:** Meyda's `sampleRate` constructor option does NOT change how audio is processed — it tells feature extractors what to assume the sample rate is for metadata-dependent calculations. If you pass `sampleRate: 44100` but the AudioContext is running at 48000, chroma bin mapping may be slightly off.

**Why it happens:** Meyda doesn't read `audioContext.sampleRate` automatically — the value must be passed correctly.

**How to avoid:** Always pass `sampleRate: audioCtx.sampleRate` (the read-back value, not a hardcoded constant) to `Meyda.createMeydaAnalyzer()`.

**Warning signs:** Chroma vectors on iOS differ from desktop for the same audio file — first thing to check.

### Pitfall 5: iOS requestAnimationFrame Throttled in Low Power Mode

**What goes wrong:** On iOS in Low Power Mode, `requestAnimationFrame` is throttled to 30fps regardless of content. The 40fps floor requirement (success criterion 4) cannot be met in this mode.

**Why it happens:** iOS OS-level power management throttles rAF.

**How to avoid:** Target 60fps with the performance strategies (no shadowBlur, typed array pre-allocation, HiDPI scaling, offscreen glow). The 40fps floor is the realistic floor outside Low Power Mode. Document this limitation.

**Warning signs:** rAF timestamp deltas consistently ~33ms (30fps) on iPhone despite no code changes.

### Pitfall 6: OfflineAudioContext Doubles Memory During Heatmap Precompute

**What goes wrong:** Running the full-track OfflineAudioContext while also holding the decoded AudioBuffer in memory doubles RAM usage. On older iPhones, this can cause OOM crashes.

**Why it happens:** OfflineAudioContext creates its own rendered buffer equal in size to the source buffer.

**How to avoid:** For the tension heatmap (AUDIO-07), consider using Meyda's offline extraction directly on the raw `Float32Array` channel data from the `AudioBuffer` (no OfflineAudioContext needed for offline Meyda). Slice the buffer in `bufferSize`-sample windows and call `Meyda.extract('chroma', slice)` synchronously. This avoids the second full-buffer copy.

**Warning signs:** App crashes or Safari kills tab immediately after decoding large files on older iPhones.

---

## Code Examples

### Complete iOS-Safe AudioContext + File Upload Pipeline

```typescript
// Source: MDN Web Audio API, mattmontag.com unlock pattern, webaudioapi.com transport pattern
let audioCtx: AudioContext | null = null;
let decodedBuffer: AudioBuffer | null = null;

async function handleFileUpload(file: File): Promise<void> {
  // Step 1: Create AudioContext inside user gesture (this function called from click handler)
  const AudioCtxClass = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  audioCtx = new AudioCtxClass({ sampleRate: 44100 });

  // Step 2: Always read back actual sample rate
  const sampleRate = audioCtx.sampleRate; // May differ from 44100 on iOS

  // Step 3: Resume if suspended
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // Step 4: Decode file
  const arrayBuffer = await file.arrayBuffer();
  decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  // Step 5: Run calibration and heatmap precompute (non-blocking)
  await Promise.all([
    runCalibrationPass(audioCtx, decodedBuffer, sampleRate),
    precomputeTensionHeatmap(decodedBuffer, sampleRate),
  ]);
}
```

### hzToBin Usage Pattern

```typescript
// Confirmed formula: bin = Math.round(hz * fftSize / sampleRate)
// frequencyBinCount = fftSize / 2 (AnalyserNode gives this many bins)
function hzToBin(hz: number, sampleRate: number, fftSize: number): number {
  return Math.round(hz * fftSize / sampleRate);
}

// Band ranges — built with sampleRate from audioCtx.sampleRate (runtime value)
function buildBandRanges(sampleRate: number, fftSize: number) {
  return {
    bass:    [hzToBin(20,   sampleRate, fftSize), hzToBin(250,  sampleRate, fftSize)],
    midLow:  [hzToBin(250,  sampleRate, fftSize), hzToBin(800,  sampleRate, fftSize)],
    mid:     [hzToBin(800,  sampleRate, fftSize), hzToBin(3000, sampleRate, fftSize)],
    midHigh: [hzToBin(3000, sampleRate, fftSize), hzToBin(6000, sampleRate, fftSize)],
    high:    [hzToBin(6000, sampleRate, fftSize), hzToBin(10000,sampleRate, fftSize)],
  };
}
```

### Pre-allocated Typed Arrays (XCUT-03)

```typescript
// Allocate once outside rAF loop — NEVER inside
const fftSize = 4096;
const binCount = fftSize / 2; // 2048

const smoothedFreqData = new Uint8Array(binCount);
const rawFreqData = new Uint8Array(binCount);
const rawTimeData = new Uint8Array(binCount);

function animationFrame() {
  smoothedAnalyser.getByteFrequencyData(smoothedFreqData);  // fills in place
  rawAnalyser.getByteFrequencyData(rawFreqData);
  rawAnalyser.getByteTimeDomainData(rawTimeData);
  // ... render
  requestAnimationFrame(animationFrame);
}
```

### Meyda Analyzer Setup

```typescript
// Source: meyda.js.org/reference/classes/meyda_wa.MeydaAnalyzer.html
import Meyda from 'meyda';

function createMeydaAnalyzer(audioCtx: AudioContext, source: AudioNode) {
  return Meyda.createMeydaAnalyzer({
    audioContext: audioCtx,
    source: source,
    bufferSize: 512,
    sampleRate: audioCtx.sampleRate,  // Always read-back value, not hardcoded
    featureExtractors: ['chroma', 'rms', 'zcr', 'spectralFlux'],
    callback: (features) => {
      // This runs on ScriptProcessorNode — on main thread
      // Keep computation minimal; push to audioStateRef
    },
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ScriptProcessorNode | AudioWorklet | Deprecated ~2019, fully supported still | Meyda 5.6.3 still uses ScriptProcessorNode — acceptable, browsers still support it |
| PostCSS tailwind.config.js | `@tailwindcss/vite` plugin + `@import "tailwindcss"` | Tailwind v4 (Jan 2025) | Much simpler setup, no PostCSS config needed |
| `window.webkitAudioContext` fallback | `window.AudioContext || window.webkitAudioContext` | iOS Safari adopted standard name in iOS 14.5 | Still need fallback for older iOS |
| OffscreenCanvas in Worker | Regular off-DOM canvas element for glow | N/A | OffscreenCanvas only fully safe on iOS 17+ (Feb 2023) |

**Deprecated/outdated:**
- `tailwind.config.js` with PostCSS directives (`@tailwind base/components/utilities`): Replaced by `@import "tailwindcss"` in Tailwind v4
- `new AudioContext()` on page load: Suspended on iOS, use inside gesture handler

---

## Open Questions

1. **Meyda chroma at 48kHz vs 44.1kHz on iOS**
   - What we know: Meyda requires `sampleRate` parameter to correctly map chroma bins; iOS may return 48000 even when 44100 requested
   - What's unclear: Whether passing `sampleRate: audioCtx.sampleRate` (the read-back value) fully corrects the chroma mapping, or whether there's a residual difference in the internal FFT window assumptions
   - Recommendation: In Plan 01-03 verification, run the same audio file through Meyda on both iOS Safari and desktop Chrome, log the chroma vector for a known chord (e.g., pure C major). If vectors differ by more than 10% on any bin, implement custom chroma remapping (~50 lines). This is the empirical test called out in STATE.md.

2. **Meyda AudioWorklet migration timeline**
   - What we know: GitHub issue #286 is open, last comment Oct 2021, no resolution date. v5.6.3 is latest (April 2024).
   - What's unclear: Whether a v6 with AudioWorklet is planned. Meyda repo activity is low.
   - Recommendation: Accept ScriptProcessorNode for this project. The deprecation warning is cosmetic; browsers will not remove it imminently (MDN says deprecated, not removed). Do not build a custom AudioWorklet wrapper.

3. **iOS Low Power Mode 30fps cap**
   - What we know: iOS throttles rAF to 30fps in Low Power Mode
   - What's unclear: Whether this affects typical jazz student users significantly
   - Recommendation: State this as a known limitation in Plan 01-05 smoke test notes. Target 60fps outside Low Power Mode; document that 40fps success criterion is measured without Low Power Mode active.

4. **Pre-computed heatmap memory strategy (AUDIO-07)**
   - What we know: OfflineAudioContext doubles memory; Meyda offline extraction on raw buffer slices avoids this
   - What's unclear: Exact performance characteristics of slice-based offline Meyda extraction on a 5-10 minute jazz track
   - Recommendation: Use Meyda offline extraction (not OfflineAudioContext) for heatmap precompute. Process buffer in chunks of 512 samples. Add a progress indicator if extraction exceeds ~2 seconds (30+ seconds rule from global instructions applies).

---

## Sources

### Primary (HIGH confidence)

- MDN Web Audio API — AnalyserNode properties (fftSize, frequencyBinCount, smoothingTimeConstant, dual analyser setup)
- MDN AudioBufferSourceNode.start() — offset parameter, one-shot behavior, transport pattern
- MDN OfflineAudioContext — full-track offline rendering
- meyda.js.org/reference/classes/meyda_wa.MeydaAnalyzer.html — confirmed ScriptProcessorNode, confirmed API (createMeydaAnalyzer, featureExtractors, sampleRate parameter)
- meyda.js.org/audio-features.html — confirmed chroma, RMS, ZCR, spectralFlux, MFCC available
- tailwindcss.com/docs/installation/using-vite — exact Tailwind v4 + Vite setup (npm install, vite.config.ts, `@import "tailwindcss"`)
- web.dev/articles/canvas-hidipi — devicePixelRatio canvas scaling pattern
- MDN Window.devicePixelRatio — Math.floor sizing, ctx.scale pattern

### Secondary (MEDIUM confidence)

- github.com/meyda/meyda/issues/286 — ScriptProcessorNode status (last comment 2021, confirmed open)
- github.com/meyda/meyda/issues/1040 — sampleRate parameter behavior clarified by maintainer
- github.com/meyda/meyda/releases — v5.6.3 released April 2024, latest confirmed
- mattmontag.com/web/unlock-web-audio-in-safari — iOS unlock pattern (touchend preferred over touchstart)
- caniuse.com/offscreencanvas — iOS Safari 17.0+ full support confirmed
- WebSearch: Vite 6.x + create-vite 8.3.0 (December 2025), Node.js 20.19+ requirement
- WebSearch: Zustand 5.0.11, useSyncExternalStore integration
- MDN OffscreenCanvas — confirmed "well established since March 2023" but iOS 17+ needed

### Tertiary (LOW confidence — flag for validation)

- iOS requestAnimationFrame throttle to 30fps in Low Power Mode (WebSearch, single source — popmotion.io blog)
- iOS AudioContext constructor `{ sampleRate: 44100 }` partially ignored (WebSearch multiple sources agreeing, but empirical confirmation needed per STATE.md blocker)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Tailwind v4 setup from official docs; Meyda v5.6.3 confirmed latest; Vite 6 confirmed
- Architecture: HIGH — Web Audio API patterns from MDN; hzToBin formula from first principles
- Pitfalls: MEDIUM-HIGH — iOS issues confirmed by multiple sources; Meyda sampleRate issue confirmed by maintainer; shadowBlur cost from official MDN optimization guide
- iOS-specific behavior: MEDIUM — confirmed user gesture requirement; sampleRate hint behavior confirmed inconsistent; Low Power Mode throttle LOW confidence

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable stack, but check Meyda GitHub for any v6 release before executing)
