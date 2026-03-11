---
phase: 01-audio-pipeline-foundation
verified: 2026-03-11T00:24:07Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "User can upload an MP3 or WAV file on both iOS Safari and desktop Chrome, and playback begins without silent failure"
    status: failed
    reason: "FileUpload.handleButtonClick checks AudioContextClass availability but never calls new AudioContextClass() — the AudioContext is instantiated inside handleFileChange (an async onChange handler), which fires as a separate event after file picker dismissal. iOS Safari requires AudioContext creation to happen within the synchronous call stack of the original user gesture. The comment claims 'pre-authorized' but no actual instantiation occurs in the click handler."
    artifacts:
      - path: "src/components/FileUpload.tsx"
        issue: "handleButtonClick (lines 34–51) constructs AudioContextClass as a local variable but never calls new AudioContextClass(). createAudioContext() is deferred to handleFileChange (line 73), which is async and triggered by a separate onChange event — outside the iOS gesture window."
    missing:
      - "Call new AudioContextClass() (or createAudioContext()) synchronously inside handleButtonClick before fileInputRef.current?.click()"
      - "Store the pre-created AudioContext on audioStateRef so handleFileChange can reuse it instead of creating a new one"
      - "Pass the pre-created context into createAudioContext or refactor so the iOS gesture requirement is actually satisfied"
---

# Phase 1: Audio Pipeline Foundation — Verification Report

**Phase Goal:** Users can upload a jazz recording and have it analyzed by a cross-platform, iOS-safe audio pipeline that never breaks on iPhone
**Verified:** 2026-03-11T00:24:07Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can upload MP3/WAV on iOS Safari and desktop Chrome, playback begins without silent failure | ✗ FAILED | `handleButtonClick` checks constructor availability but never instantiates AudioContext. `createAudioContext()` called at line 73 of FileUpload.tsx inside async `handleFileChange` — outside the iOS gesture window |
| 2 | Transport controls (play, pause, seek) work correctly, timeline scrubber tracks position | ✓ VERIFIED | `handlePlay` and `handlePause` in TransportControls.tsx have full AudioBufferSourceNode lifecycle management; `handleSeek` in Timeline.tsx correctly stops/restarts source from target offset; 10fps polling via `setInterval` drives position display |
| 3 | 3-second calibration pass runs on load and sets per-instrument thresholds before playback starts | ✓ VERIFIED | `runCalibrationPass` in App.tsx triggered via `useEffect` on `isFileLoaded`; transport disabled during calibration via `isCalibrating` Zustand flag; `isCalibrated` flag set on audioStateRef after completion |
| 4 | Canvas runs at 60fps, no shadowBlur, no per-frame GC, HiDPI scaling correct | ✓ VERIFIED | `setupHiDPI()` uses `window.devicePixelRatio`; offscreen glow via `createGlowLayer` (drawImage compositing); zero `shadowBlur` usages in codebase; all typed arrays pre-allocated in AudioEngine; one warning: `getByteFrequencyData` called per-node (6x/frame) instead of once per frame |
| 5 | All FFT bin math uses hzToBin(hz, audioCtx.sampleRate, fftSize) — no hardcoded indices | ✓ VERIFIED | `hzToBin` is the only bin computation path; called in `buildDefaultBands` with `audioCtx.sampleRate` read-back; `audioStateRef.sampleRate = audioCtx.sampleRate` set after context creation; no hardcoded bin indices found anywhere |

**Score:** 4/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audio/AudioEngine.ts` | iOS-safe AudioContext, decodeAudioFile, dual analysers, typed array pre-allocation | ✓ VERIFIED | 209 lines; exports `createAudioContext`, `decodeAudioFile`, `createDualAnalysers`, `connectSourceToGraph`, `getCurrentPosition`, `allocateTypedArrays`; all substantive |
| `src/audio/FrequencyBandSplitter.ts` | hzToBin, buildDefaultBands, getBandEnergy | ✓ VERIFIED | 95 lines; all three functions exported and substantive; bins computed from runtime sampleRate |
| `src/audio/CalibrationPass.ts` | 3-second silent calibration, per-band thresholds | ✓ VERIFIED | 139 lines; full implementation with interval sampling, threshold computation (solo/comping/holding), silent tap pattern |
| `src/audio/TensionHeatmap.ts` | Pre-computed tension heatmap | ✓ VERIFIED | 165 lines; offline spectral centroid variance computation; `tensionToColor` helper for timeline rendering |
| `src/audio/types.ts` | AudioStateRef, TransportState, FrequencyBand, CalibrationThresholds | ✓ VERIFIED | 71 lines; all interfaces defined with correct shape; `createInitialAudioState` factory function |
| `src/canvas/CanvasRenderer.ts` | rAF loop, HiDPI setup, node rendering, no shadowBlur | ✓ VERIFIED | 205 lines; `setupHiDPI` with `devicePixelRatio`; offscreen glow via `createGlowLayer`; rAF loop with `destroy()` cleanup |
| `src/canvas/offscreen/glowLayer.ts` | Offscreen radial gradient glow, no shadowBlur | ✓ VERIFIED | 46 lines; radial gradient on off-DOM canvas; returns `HTMLCanvasElement` for `drawImage` reuse |
| `src/components/FileUpload.tsx` | File input, iOS-safe AudioContext creation | ✗ PARTIAL | 160 lines, substantive UI, but iOS gesture requirement not satisfied — AudioContext not instantiated in click handler |
| `src/components/TransportControls.tsx` | Play, pause, AudioBufferSourceNode lifecycle | ✓ VERIFIED | 159 lines; full play/pause with `connectSourceToGraph`; `ended` event handler; `isCalibrated` read from ref (stale-read warning — see anti-patterns) |
| `src/components/Timeline.tsx` | Position tracking, click-to-seek, tension heatmap overlay | ✓ VERIFIED | 183 lines; 10fps polling; full seek with source restart; heatmap rendered as colored segments; playhead dot |
| `src/components/VisualizerCanvas.tsx` | Canvas element, CanvasRenderer lifecycle, ResizeObserver | ✓ VERIFIED | 59 lines; creates `CanvasRenderer` on mount, `ResizeObserver` drives `resize()`, cleanup on unmount |
| `src/hooks/useAudioRef.ts` | Stable ref for audio state, never triggers re-renders | ✓ VERIFIED | 16 lines; returns `useRef(createInitialAudioState())` — correct pattern |
| `src/store/useAppStore.ts` | Zustand store for UI-only state | ✓ VERIFIED | 37 lines; `isFileLoaded`, `isCalibrating`, `currentTime`, `duration`; no Web Audio objects |
| `src/App.tsx` | Orchestrates calibration + heatmap sequence, conditionally renders components | ✓ VERIFIED | 103 lines; `useEffect` on `isFileLoaded` runs calibration then heatmap; `heatmapVersion` state keys Timeline to force re-read |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `FileUpload.tsx` | `AudioEngine.createAudioContext` | `handleFileChange` (line 73) | ✗ PARTIAL | Called in async onChange handler, not in synchronous click handler — iOS gesture requirement violated |
| `FileUpload.tsx` | `FrequencyBandSplitter.buildDefaultBands` | `audioCtx.sampleRate` (line 85) | ✓ WIRED | Passes actual read-back sampleRate, not 44100 constant |
| `App.tsx` | `CalibrationPass.runCalibrationPass` | `useEffect` on `isFileLoaded` | ✓ WIRED | Chains `.then(() => computeTensionHeatmap(...))` correctly |
| `App.tsx` | `TensionHeatmap.computeTensionHeatmap` | Promise chain after calibration | ✓ WIRED | Result stored on `audioStateRef.current.tensionHeatmap`; version bump forces Timeline re-render |
| `TransportControls.tsx` | `AudioEngine.connectSourceToGraph` | `handlePlay` (line 59) | ✓ WIRED | Full play path: create source, connect, start from `pauseOffset` |
| `Timeline.tsx` | `AudioEngine.getCurrentPosition` | setInterval 100ms (line 41) | ✓ WIRED | Reads `audioCtx.currentTime` + `transport` state; updates React state |
| `Timeline.tsx` | `AudioEngine.connectSourceToGraph` | `handleSeek` (line 84) | ✓ WIRED | Seek correctly stops old source, sets new `pauseOffset`, restarts if `wasPlaying` |
| `CanvasRenderer.ts` | `FrequencyBandSplitter.getBandEnergy` | render loop (line 168) | ✓ WIRED | Reads live `smoothedFreqData` from ref; no allocation |
| `CanvasRenderer.ts` | `glowLayer.createGlowLayer` | constructor (line 76) | ✓ WIRED | Glow canvas created once, reused via `drawImage` each frame |

---

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| AUDIO-01: iOS-safe AudioContext creation within user gesture | ✗ BLOCKED | `createAudioContext()` deferred to async `handleFileChange`, not called in click handler |
| AUDIO-02: File input accepts MP3 and WAV | ✓ SATISFIED | `accept` attribute includes `audio/mpeg,audio/wav` + extensions |
| AUDIO-03: `decodeAudioData` for file decoding | ✓ SATISFIED | `decodeAudioFile` uses `audioCtx.decodeAudioData` |
| AUDIO-04: Dual AnalyserNode (smoothed + raw) | ✓ SATISFIED | `createDualAnalysers` creates both; raw NOT connected to destination |
| AUDIO-05: `hzToBin(hz, audioCtx.sampleRate, fftSize)` — no hardcoded indices | ✓ SATISFIED | Verified: only bin path is through `hzToBin` |
| AUDIO-06: Pre-allocated typed arrays, no per-frame GC | ✓ SATISFIED | `allocateTypedArrays` in AudioEngine; no allocations in rAF loop |
| AUDIO-07: 3-second calibration pass before playback | ✓ SATISFIED | `runCalibrationPass` with silent tap, transport gated by `isCalibrated` |
| AUDIO-08: Transport (play/pause/seek) with AudioBufferSourceNode lifecycle | ✓ SATISFIED | Full implementation in TransportControls + Timeline |
| AUDIO-09: `getCurrentPosition` using `audioCtx.currentTime` | ✓ SATISFIED | Implemented in AudioEngine, used in Timeline |
| XCUT-01: iOS Safari AudioContext compatibility | ✗ BLOCKED | Gesture requirement not enforced — see AUDIO-01 |
| XCUT-02: No `shadowBlur` anywhere | ✓ SATISFIED | Verified: zero occurrences in `src/` |
| XCUT-03: HiDPI canvas scaling with `devicePixelRatio` | ✓ SATISFIED | `setupHiDPI` in CanvasRenderer; ResizeObserver calls `resize()` |
| XCUT-04: No per-frame typed array allocation | ✓ SATISFIED | Confirmed: no `new Uint8Array/Float32Array` in render loop |

---

### Anti-Patterns Found

| File | Location | Pattern | Severity | Impact |
|------|----------|---------|----------|--------|
| `src/components/FileUpload.tsx` | `handleButtonClick` (lines 34–51) | iOS gesture requirement claimed but not implemented — `new AudioContextClass()` never called in click handler | BLOCKER | On iOS Safari, AudioContext may be created in suspended state with `resume()` failing silently; user hears no audio after upload |
| `src/components/TransportControls.tsx` | Line 26 | `isCalibrated` read from ref at render time — stale value until next re-render | WARNING | Play button may appear enabled before calibration finishes if no re-render occurs; in practice mitigated by `isCalibrating` Zustand flag being the primary gate |
| `src/canvas/CanvasRenderer.ts` | Lines 163–169 | `getByteFrequencyData(freqData)` called inside per-node loop (6 calls/frame) instead of once before the loop | WARNING | Redundant FFT reads; all 6 calls overwrite the same pre-allocated array, so only the last call's data is actually used for each node's energy — nodes 1–5 compute energy from stale data |
| `src/canvas/CanvasRenderer.ts` | Line 75 | Comment: "matter much for the placeholder" re: glow color | INFO | Cosmetic placeholder comment; not affecting function |

---

### Human Verification Required

#### 1. iOS Safari AudioContext on File Load

**Test:** On an iPhone, tap "Load Audio File", select an MP3. After calibration completes, tap Play.
**Expected:** Audio plays audibly.
**Why human:** The iOS gesture chain defect identified above (AudioContext created in `onChange`, not `click`) may or may not manifest depending on iOS version. Some iOS versions treat file-picker-dismiss as preserving gesture context; others do not. Must test on device.

#### 2. Canvas Frame Rate on iPhone

**Test:** Load a 3-minute jazz track on an iPhone. Watch the visualizer animate during playback for 30 seconds.
**Expected:** Animation is smooth with no visible jank or dropped-frame stuttering.
**Why human:** `requestAnimationFrame` performance cannot be verified statically; requires device measurement.

#### 3. Tension Heatmap Rendering

**Test:** Load any MP3. Before pressing Play, inspect the timeline scrubber.
**Expected:** The scrubber background shows colored segments (blue through red gradient) representing pre-computed tension.
**Why human:** Visual rendering of `tensionToColor` output requires visual inspection.

---

### Gaps Summary

One gap blocks goal achievement:

**Truth 1 fails (iOS-safe upload):** `FileUpload.handleButtonClick` (lines 34–51) constructs `AudioContextClass` as a local variable to check browser support but never calls `new AudioContextClass()`. The actual `createAudioContext()` call happens at line 73 of `handleFileChange` — an async function triggered by the file input's `onChange` event, which fires after the user dismisses the file picker. On iOS Safari, the original click gesture is considered consumed before `onChange` fires. The fix requires instantiating the AudioContext synchronously inside `handleButtonClick`, storing it on `audioStateRef`, and then reusing that existing instance (skipping re-creation) in `handleFileChange`.

The `CanvasRenderer` also calls `getByteFrequencyData` 6 times per frame in a per-node loop. Since all 6 calls overwrite the same `freqData` array, nodes 1–5 each compute their energy from data that was immediately overwritten by the next iteration — meaning all nodes except the last one are reading stale FFT data. This is a correctness bug (all nodes will show the same "ride" band energy level from the final overwrite), though visually it may not be obvious until Phase 2 adds per-instrument differentiation.

---

_Verified: 2026-03-11T00:24:07Z_
_Verifier: Claude (gsd-verifier)_
