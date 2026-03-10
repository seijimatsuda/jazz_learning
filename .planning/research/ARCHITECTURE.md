# Architecture Patterns: Browser-Based Real-Time Audio Analysis + Visualization

**Domain:** Browser audio analysis + Canvas visualization (React app)
**Researched:** 2026-03-10
**Confidence:** HIGH (verified against MDN official documentation)

---

## Recommended Architecture

The system has two concurrent execution loops that must never block each other:

1. **Audio Analysis Loop** — reads AnalyserNode data, runs DSP algorithms, produces structured state. Runs at audio clock rate (decoupled from display).
2. **Render Loop** — reads the latest state snapshot, draws Canvas frame. Runs at requestAnimationFrame rate (target 60fps).

These two loops communicate through a **shared state object** (plain mutable ref, not React state). This is the central design decision of the entire architecture.

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN THREAD                              │
│                                                                  │
│  AudioContext                                                    │
│       │                                                          │
│  MediaElementSource (audio element)                             │
│       │                                                          │
│  AnalyserNode (FFT 4096)  ─────────────────────────────────┐    │
│       │                                                     │    │
│  audioContext.destination                                   │    │
│  (audio plays normally)                                     │    │
│                                                             │    │
│  ┌────────────────────────────────────────────┐             │    │
│  │  ANALYSIS LOOP  (~10fps, setInterval)      │             │    │
│  │                                            │             │    │
│  │  getByteFrequencyData(fftBuffer)  ◄────────┘             │    │
│  │          │                                                │    │
│  │  FrequencyBandSplitter                                    │    │
│  │  (slice fftBuffer into band ranges)                      │    │
│  │          │                                                │    │
│  │  Meyda feature extraction                                 │    │
│  │  (chroma, RMS, ZCR, spectralFlux per band)               │    │
│  │          │                                                │    │
│  │  InstrumentActivityScorer                                 │    │
│  │  (0.0–1.0 per instrument)                                 │    │
│  │          │                                                │    │
│  │  RoleClassifier                                           │    │
│  │  (solo/comp/hold/silent)                                  │    │
│  │          │                                                │    │
│  │  ChordDetector                                            │    │
│  │  (chroma → cosine similarity → template match)           │    │
│  │          │                                                │    │
│  │  BeatDetector                                             │    │
│  │  (dual-stream: drum transients + bass onsets)            │    │
│  │          │                                                │    │
│  │  PocketScorer                                             │    │
│  │  (bass ↔ drums sync ±80ms)                               │    │
│  │          │                                                │    │
│  │  ──► audioStateRef.current = newSnapshot ◄──────┐        │    │
│  │                                                  │        │    │
│  └──────────────────────────────────────────────────┘        │    │
│                                                               │    │
│  ┌────────────────────────────────────────────────────────┐   │    │
│  │  RENDER LOOP  (requestAnimationFrame, ~60fps)          │   │    │
│  │                                                        │   │    │
│  │  read audioStateRef.current (zero-copy, no re-render)  │   │    │
│  │          │                                              │   │    │
│  │  CanvasRenderer                                        │   │    │
│  │  (node graph, glows, ripples, edges, tension meter)    │   │    │
│  │          │                                              │   │    │
│  │  canvasRef.current.getContext('2d')                    │   │    │
│  │          │                                              │   │    │
│  │  clearRect → draw background → draw edges → draw nodes │   │    │
│  │                                                        │   │    │
│  └────────────────────────────────────────────────────────┘   │    │
│                                                                │    │
│  React Component Tree (UI only — not in render loop)          │    │
│  (BandSetupPanel, TensionMeter, ChordDisplay, Timeline)       │    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `AudioPipeline` | Creates AudioContext, MediaElementSource, AnalyserNode. Manages start/stop/seek. Returns AnalyserNode ref. | `AnalysisLoop` (provides node), `React` (lifecycle) |
| `AnalysisLoop` | Reads FFT data at ~10fps. Orchestrates all DSP modules. Writes to `audioStateRef`. | `AudioPipeline` (reads AnalyserNode), `CanvasRenderer` (writes shared state), `Meyda` |
| `FrequencyBandSplitter` | Slices 4096-bin FFT array into per-instrument frequency ranges. Returns typed subarray views. | `AnalysisLoop` (called inline) |
| `InstrumentActivityScorer` | Calculates 0.0–1.0 activity score per instrument from band RMS + spectral features. | `AnalysisLoop` |
| `RoleClassifier` | Maps activity + context → role enum (solo/comp/hold/silent). Stateful — maintains role history. | `AnalysisLoop` |
| `ChordDetector` | Extracts chroma vector, runs cosine similarity against chord templates, applies 300ms smoothing. | `AnalysisLoop` |
| `BeatDetector` | Parallel drum transient (6–10kHz spectral flux) + bass onset (20–250Hz RMS delta) detection. Derives BPM. | `AnalysisLoop` |
| `PocketScorer` | Cross-correlates drum hit timestamps with bass onset timestamps within ±80ms window. | `BeatDetector`, `AnalysisLoop` |
| `audioStateRef` | Plain mutable object (React ref). Holds latest analysis snapshot. Never triggers re-renders. | Written by `AnalysisLoop`, read by `CanvasRenderer` |
| `CanvasRenderer` | Canvas 2D drawing engine. Node layout, edge rendering, glow effects, ripple animation, tension tint. | Reads `audioStateRef`, owns `canvasRef` |
| React UI components | Band setup, chord display, tension meter, timeline, chord log, node detail panel. | Read from `audioStateRef` via `useEffect` polling or React state synced from analysis loop |

---

## Data Flow

Audio data flows in one direction through the analysis pipeline, then into a shared state object that both the render loop and React UI read from.

```
FILE INPUT
    │
    ▼
<audio> element (src = objectURL)
    │
    ▼
MediaElementSource node
    │
    ▼
AnalyserNode (fftSize=4096, frequencyBinCount=2048)
    │
    ▼ (getByteFrequencyData into Uint8Array[2048])
FrequencyBandSplitter
    ├── bass band:    bins 0–23     (20–250Hz)
    ├── drums band:   bins 23–95    (250–1kHz + high: 570–930 for ride)
    ├── guitar band:  bins 95–325   (1kHz–3.4kHz, filtered by ZCR)
    └── keys band:    bins 95–475   (1kHz–5kHz, filtered by ZCR)
    │
    ▼ (parallel per-instrument)
Meyda feature extraction (per-band)
    ├── rms, zcr, spectralCentroid, spectralFlux, chroma (full-spectrum)
    │
    ▼
InstrumentActivityScorer
    │── activity[bass] = 0.0–1.0
    │── activity[drums] = 0.0–1.0
    │── activity[guitar] = 0.0–1.0
    └── activity[keys] = 0.0–1.0
    │
    ▼ (with disambiguation)
RoleClassifier
    │── roles = {bass: 'holding', drums: 'comping', guitar: 'soloing', keys: 'silent'}
    │── call/response detection (guitar → keys within 2–4s)
    │
    ▼ (parallel)
ChordDetector                          BeatDetector
    │── chroma vector                      │── drumHits[] (timestamps)
    │── bestMatch: 'Cmaj7'                 │── bassOnsets[] (timestamps)
    │── function: 'tonic'                  │── bpm: 124
    │── confidence: 0.82                   └── lastBeat: timestamp
    │── tensionScore: 0.3
    │
    ▼
PocketScorer
    │── pocketScore: 0.0–1.0
    └── sync quality: 'tight' | 'loose' | 'dragging'
    │
    ▼
audioStateRef.current = {
    timestamp, activity, roles, chroma, chord, tensionScore,
    bpm, pocketScore, beatPhase, callResponseEvents[]
}
    │
    ├──► CanvasRenderer (reads every rAF frame, ~60fps)
    └──► React UI components (reads via setInterval or rAF side effect, ~10fps)
```

---

## Patterns to Follow

### Pattern 1: Decouple Analysis Rate from Render Rate

**What:** Analysis loop runs at ~10fps (setInterval ~100ms). Render loop runs at 60fps via requestAnimationFrame. They share a mutable ref, not React state.

**Why:** Audio DSP at 60fps is expensive. Running chord detection, beat detection, role classification on every render frame would destroy performance. The Canvas can still animate smoothly at 60fps by interpolating between analysis snapshots.

**Implementation:**
```typescript
// Shared state — mutable ref, never triggers React re-render
const audioStateRef = useRef<AudioState>({
  activity: { bass: 0, drums: 0, guitar: 0, keys: 0 },
  roles: { bass: 'silent', drums: 'silent', guitar: 'silent', keys: 'silent' },
  tensionScore: 0,
  pocketScore: 0,
  bpm: null,
  chord: null,
  beatPhase: 0,
});

// Analysis loop — ~10fps
useEffect(() => {
  const interval = setInterval(() => {
    analyser.getByteFrequencyData(fftBuffer);
    const newState = runAnalysisPipeline(fftBuffer, previousStateRef.current);
    audioStateRef.current = newState;
  }, 100);
  return () => clearInterval(interval);
}, [analyser]);

// Render loop — 60fps
useEffect(() => {
  let rafId: number;
  const render = (timestamp: number) => {
    drawFrame(canvasRef.current, audioStateRef.current, timestamp);
    rafId = requestAnimationFrame(render);
  };
  rafId = requestAnimationFrame(render);
  return () => cancelAnimationFrame(rafId);
}, []);
```

### Pattern 2: React Manages Setup, Canvas Manages Animation

**What:** React components control: file selection, band configuration, play/pause, display of chord labels and tension score (from periodic React state syncs). Canvas controls: all animation — nodes, edges, glows, ripples.

**Why:** Trying to drive Canvas animation through React state (`useState` → re-render → draw) creates jank because React's scheduler may batch or delay updates. Canvas animation must bypass React's reconciliation entirely.

**Implementation:**
```typescript
function VisualizerCanvas({ audioStateRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // All animation lives here — never in JSX
    let rafId: number;
    const render = (t: number) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawFrame(ctx, audioStateRef.current, t);
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []); // setup once, never re-runs

  return <canvas ref={canvasRef} width={800} height={600} />;
}
```

### Pattern 3: Canvas Layer Separation

**What:** Use two stacked `<canvas>` elements: one for the static background (gradient, grid), one for animated content (nodes, edges, glows).

**Why:** Redrawing the background on every frame is wasteful. The background only changes when tension score crosses color thresholds — rare. The animated layer clears and redraws every frame.

**Implementation:**
```html
<div style="position: relative">
  <canvas id="bg-layer" style="position: absolute; z-index: 0" />
  <canvas id="anim-layer" style="position: absolute; z-index: 1" />
</div>
```

Background layer redraws only when `tensionScore` band changes. Animation layer redraws every rAF.

### Pattern 4: Typed Arrays for FFT Data (No Allocation in Loops)

**What:** Allocate `Uint8Array` and `Float32Array` buffers once at setup. Reuse them in every analysis tick. Never create new arrays in the animation loop.

**Why:** GC pressure from per-frame allocations causes frame drops. With FFT size 4096, `frequencyBinCount = 2048`. Allocating a new `Uint8Array(2048)` 60 times/second is ~120K allocations/second.

```typescript
// Allocate once
const fftBuffer = new Uint8Array(analyser.frequencyBinCount); // 2048 bytes
const floatBuffer = new Float32Array(analyser.frequencyBinCount);

// Reuse every tick — getByteFrequencyData writes in-place
analyser.getByteFrequencyData(fftBuffer);
```

### Pattern 5: AudioContext Created from User Gesture

**What:** Create `AudioContext` inside the handler for the play button click. Never create it at module load time.

**Why:** iOS Safari and Chrome enforce the autoplay policy — `AudioContext` created outside a user gesture starts in `'suspended'` state and will not process audio until `resume()` is called. iOS Safari requires the creation to happen inside the gesture handler to work at all. This is a blocking constraint that breaks audio entirely if violated.

**Implementation:**
```typescript
const handlePlay = async () => {
  if (!audioContextRef.current) {
    // Create inside user gesture — critical for iOS Safari
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    setupAudioGraph(audioContextRef.current);
  }
  if (audioContextRef.current.state === 'suspended') {
    await audioContextRef.current.resume();
  }
  audioElementRef.current.play();
};
```

### Pattern 6: Meyda as Offline Feature Extractor

**What:** Use Meyda's standalone `Meyda.extract()` function on FFT data slices rather than creating a `MeydaAnalyzer` instance tied to the AudioContext.

**Why:** `MeydaAnalyzer` runs on every audio processing block (128 samples, ~2.9ms at 44.1kHz) — too frequent and expensive for full-spectrum analysis. Calling `Meyda.extract()` on demand inside the 10fps analysis loop gives precise control over when feature extraction happens.

```typescript
// Offline extraction — call when needed, not on every audio block
const features = Meyda.extract(['chroma', 'rms', 'zcr', 'spectralCentroid'],
  bandBuffer); // typed array slice of fftBuffer
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Driving Canvas via React State

**What:** Calling `setState` with audio data to trigger Canvas redraws.
```typescript
// WRONG
const [activity, setActivity] = useState(0);
useEffect(() => {
  setActivity(getLatestActivity()); // triggers re-render
}, [fftData]);
return <CanvasComponent activity={activity} />;
```
**Why bad:** React schedules re-renders asynchronously. Batching, Suspense, Concurrent Mode features all interfere. At 60fps, this fires 60 state updates/second, causing jank and wasted reconciliation cycles.
**Instead:** Use `useRef` for all real-time audio state. Only use `useState` for UI data that legitimately needs React to re-render (chord label display, tension meter value, BPM number).

### Anti-Pattern 2: Creating AudioContext Without User Gesture

**What:** Instantiating AudioContext at app load or in a `useEffect` with no dependency on user interaction.
**Why bad:** iOS Safari will silently fail to process audio. Context state stays `'suspended'`. Audio plays through `<audio>` element but AnalyserNode gets no data. This manifests as a completely blank visualization with no errors.
**Instead:** Create AudioContext inside a click/touch event handler. Gate all audio graph setup on this creation.

### Anti-Pattern 3: Web Worker for AnalyserNode Data

**What:** Attempting to move FFT reading or AnalyserNode access into a Web Worker.
**Why bad:** `AnalyserNode` is a Web Audio API interface that only exists on the main thread (or the audio rendering thread, not a general Worker). You cannot pass an AnalyserNode to a Worker via `postMessage`. The `getByteFrequencyData()` call must happen on the main thread.
**Instead:** Read FFT data on the main thread at ~10fps (not 60fps). The data read itself is fast (copying 2048 bytes). Ship the Uint8Array to a Worker if you need heavy DSP — but for this project's feature set, main-thread DSP at 10fps is adequate (see note on AudioWorklet below).

### Anti-Pattern 4: AudioWorklet for Analysis (Wrong Tool)

**What:** Using `AudioWorkletProcessor` to run chord detection, role classification, and beat detection.
**Why bad:** AudioWorklet is designed for audio synthesis/processing that needs sample-level timing (128 samples at a time, ~2.9ms blocks). Running chord detection and template matching inside an AudioWorklet is possible but adds complexity — the worklet's `process()` method runs at audio clock rate (344 times/second at 44.1kHz). Sending analysis results back to the main thread via `port.postMessage()` at that rate would overwhelm the message queue.
**Instead:** Use `AnalyserNode.getByteFrequencyData()` on the main thread at 10fps. This is the MDN-documented pattern for visualization use cases. AudioWorklet is only worth the complexity if you need custom DSP that AnalyserNode cannot provide (e.g., custom filter banks, pitch shifting). For this project, AnalyserNode + Meyda covers all feature extraction needs.

### Anti-Pattern 5: OffscreenCanvas Worker for Main Visualization

**What:** Transferring the main Canvas to a Web Worker via `transferControlToOffscreen()`.
**Why bad:** OffscreenCanvas in Workers is Baseline Widely Available since March 2023, meaning iOS Safari support may be present but at lower confidence than the main thread Canvas API. More critically, the render loop in a Worker cannot synchronize with the analysis loop state on the main thread without message-passing overhead, which adds latency. For a visualization reading from a shared mutable ref, main-thread rendering is simpler and more predictable.
**Exception:** If profiling reveals Canvas draw calls are blocking the main thread, OffscreenCanvas Worker is a valid optimization. Do not do this preemptively.

### Anti-Pattern 6: Allocating Arrays in the Render/Analysis Loop

**What:** `new Uint8Array(analyser.frequencyBinCount)` inside `requestAnimationFrame` or the analysis interval.
**Why bad:** GC pauses cause frame drops. At 60fps + 10fps that's 70 allocations/second of 2KB+ arrays.
**Instead:** Allocate all typed arrays once at AudioContext setup. Pass refs to them into the analysis functions.

### Anti-Pattern 7: Meyda.analyze() on Full Spectrum for Per-Instrument Features

**What:** Running full-spectrum Meyda analysis and trying to derive per-instrument activity from the combined result.
**Why bad:** Jazz instruments overlap heavily in the frequency domain. Bass guitar and kick drum both have energy below 200Hz. Guitar and piano overlap 200Hz–2kHz. Running chroma on the full spectrum gives you harmonic content of the entire mix, not per-instrument. This is unavoidable at the mix level but must be accounted for in the analysis design.
**Instead:** Slice the FFT buffer into frequency sub-bands before passing to Meyda. Run separate chroma extraction on each band. Accept that overlapping bands reduce per-instrument accuracy — this is a fundamental constraint of working with mixed-down stereo audio (documented in PROJECT.md).

---

## Suggested Build Order

Build order is driven by two dependency constraints:
1. Each DSP module depends on frequency band data, which depends on the audio pipeline.
2. The Canvas renderer depends on `audioStateRef` structure being finalized.

```
Phase 1: Audio Pipeline Foundation
    AudioContext setup (user gesture pattern, iOS safe)
    AnalyserNode configuration (fftSize=4096)
    MediaElementSource from <audio> element
    getByteFrequencyData loop at 10fps
    FrequencyBandSplitter (slice fftBuffer → per-band Uint8Array views)
    [No DSP yet — just verify FFT data flows]

Phase 2: Core DSP Modules (can develop in parallel after Phase 1)
    InstrumentActivityScorer (RMS per band → 0.0–1.0)
    BeatDetector (dual-stream: spectral flux + RMS delta)
    ChordDetector (chroma extraction → template matching)
    [These are independent — test each with console output before Canvas]

Phase 3: Derived Analysis (depends on Phase 2 outputs)
    RoleClassifier (depends on activity scores + activity history)
    PocketScorer (depends on BeatDetector timestamps)
    TensionScorer (depends on ChordDetector output)
    audioStateRef structure finalized here

Phase 4: Canvas Renderer (depends on Phase 3 — needs stable state shape)
    Node layout engine (position calculation for 2–4 instruments)
    Static node drawing (circles, labels)
    Edge drawing (communication lines)
    Animation layer: glows, ripples, pulse on beat
    Tension tinting on edges

Phase 5: UI Components (depends on Phase 3 state, partially independent)
    BandSetupPanel (instrument configuration)
    TensionMeter (reads tensionScore from state)
    ChordDisplay (reads chord from state)
    Timeline scrubber

Phase 6: Advanced Features (depends on all prior phases)
    Call-and-response detection
    Conversation log
    Key detection + chord function labels
    User annotations + export
```

**Critical path:** Phase 1 → Phase 2 → Phase 3 → Phase 4. These must be sequential. Phase 5 can begin partway through Phase 3 once the state shape is known.

---

## Performance Architecture

### What Runs Where

| Work | Thread | Rate | Rationale |
|------|--------|------|-----------|
| Audio decoding/playback | Audio thread (browser-managed) | Continuous | Handled automatically by `<audio>` element + Web Audio API |
| `getByteFrequencyData()` | Main thread | ~10fps | AnalyserNode access is main-thread only |
| FrequencyBandSplitter | Main thread | ~10fps | Cheap — just array index math |
| Meyda feature extraction | Main thread | ~10fps | Acceptable at 10fps; each call is <1ms for 2048 samples |
| InstrumentActivityScorer | Main thread | ~10fps | Math only — negligible cost |
| RoleClassifier | Main thread | ~10fps | Stateful but cheap |
| ChordDetector (chroma + cosine similarity) | Main thread | ~10fps | ~8 cosine similarity calculations per tick — fast |
| BeatDetector | Main thread | ~10fps | Transient detection over ring buffer — fast |
| PocketScorer | Main thread | ~10fps | Timestamp comparison — trivial |
| Canvas drawing | Main thread | 60fps | Canvas 2D API is main-thread only |
| React UI updates | Main thread | ~2fps | Chord label, tension meter, BPM — low frequency |

**Conclusion:** For this project's analysis feature set, a single-thread architecture (main thread) is appropriate. The analysis pipeline at 10fps combined with Canvas rendering at 60fps is well within main thread budget on modern mobile hardware, provided the anti-patterns above (array allocation in loops, running DSP at 60fps) are avoided.

**When to reconsider:** If profiling shows main thread consistently above 8ms per frame (out of the ~16.7ms budget at 60fps), the analysis loop can be moved to a regular Web Worker by:
1. Copying the `fftBuffer` to the worker via `postMessage(fftBuffer.buffer, [fftBuffer.buffer])` (transferable — zero copy)
2. Running all DSP in the worker
3. Posting results back as a plain object
4. Applying results to `audioStateRef.current` on the main thread

This is an optimization path, not the initial architecture.

---

## iOS Safari Constraints (Verified)

| Constraint | Detail | Mitigation |
|------------|--------|------------|
| AudioContext autoplay | Context created outside user gesture starts `'suspended'`. iOS Safari requires creation inside gesture handler. | Create AudioContext inside play button click handler |
| `webkitAudioContext` prefix | Older iOS Safari versions use `webkitAudioContext` | Use `window.AudioContext || window.webkitAudioContext` |
| Secure context required | `getUserMedia` and AudioContext features require HTTPS | Always serve over HTTPS; localhost is exempt |
| OffscreenCanvas support | Available since iOS 16.4+ (March 2023 baseline) but verify for target iOS versions | Avoid OffscreenCanvas for core rendering; use only as optimization if needed |
| AudioWorklet support | Available in iOS Safari 14.5+ | If using AudioWorklet, test on actual iOS hardware |
| Canvas performance | iOS Safari Canvas 2D is generally well-optimized | Avoid `shadowBlur` on hot paths — expensive on all browsers, especially iOS |

**Source confidence:** MDN official documentation (HIGH). iOS-specific version numbers from MDN baseline dates (MEDIUM — verify against current Can I Use data before shipping).

---

## Sources

- MDN Web Audio API Best Practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices (HIGH)
- MDN AnalyserNode: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode (HIGH)
- MDN AudioWorkletNode: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode (HIGH)
- MDN AudioWorkletProcessor: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor (HIGH)
- MDN Canvas Optimization: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas (HIGH)
- MDN OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas (HIGH)
- MDN Web Workers — Transfer patterns: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers (HIGH)
- MDN requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame (HIGH)
- MDN SharedArrayBuffer: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer (HIGH)
- MDN useRef React docs: https://react.dev/reference/react/useRef (HIGH)
- MDN Web Audio Visualizations: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API (HIGH)

