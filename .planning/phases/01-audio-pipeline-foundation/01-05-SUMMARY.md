---
phase: 01-audio-pipeline-foundation
plan: "05"
subsystem: ui
tags: [canvas, web-audio-api, hidpi, offscreen-canvas, raf, tension-heatmap, meyda, react, tailwind, ios-safe]

requires:
  - phase: 01-audio-pipeline-foundation/01-04
    provides: CalibrationPass, TransportControls, Timeline scrubber, AudioEngine.getCurrentPosition, audioStateRef.smoothedAnalyser + smoothedFreqData

provides:
  - CanvasRenderer: 60fps rAF loop with HiDPI/devicePixelRatio scaling, 6 frequency band nodes pulsing with audio energy, no per-frame typed array allocations
  - createGlowLayer: offscreen canvas glow compositing via radial gradient + drawImage (zero shadowBlur)
  - TensionHeatmap: pre-computed per-second tension Float32Array from offline spectral centroid variance/chroma analysis
  - VisualizerCanvas: React component wrapping canvas with ResizeObserver
  - Full app layout: FileUpload -> VisualizerCanvas -> TransportControls -> Timeline with tension heatmap

affects:
  - 02-role-classification: canvas node rendering pattern (CanvasRenderer.drawPlaceholderNodes) is the scaffold for Phase 2 instrument-role nodes
  - All visual phases: offscreen glow pattern (createGlowLayer + drawImage) established as the iOS-safe alternative to shadowBlur
  - 03-chord-detection: TensionHeatmap precompute pattern (offline chroma extraction per second) is the template for Phase 3 chord-function tension
  - All phases: no-per-frame-allocation discipline (smoothedFreqData pre-allocated, read via getByteFrequencyData in rAF) must be maintained

tech-stack:
  added: []
  patterns:
    - "Offscreen glow pattern: createGlowLayer returns a pre-rendered HTMLCanvasElement (NOT OffscreenCanvas — iOS 16 compat); composited via ctx.drawImage each frame"
    - "HiDPI pattern: read devicePixelRatio, set canvas.width/height in physical pixels, CSS size in logical pixels, call ctx.scale(dpr, dpr) once"
    - "rAF discipline: zero typed array allocations inside render loop — all arrays pre-allocated at init, read via getByteFrequencyData into existing buffer"
    - "Tension precompute: offline Meyda chroma extraction per second stored as Float32Array, rendered to Timeline before first play"
    - "ResizeObserver-driven HiDPI re-setup: VisualizerCanvas calls setupHiDPI on every resize event, not just mount"

key-files:
  created:
    - src/canvas/CanvasRenderer.ts
    - src/canvas/offscreen/glowLayer.ts
    - src/components/VisualizerCanvas.tsx
    - src/audio/TensionHeatmap.ts
  modified:
    - src/components/Timeline.tsx
    - src/App.tsx
    - src/components/FileUpload.tsx

key-decisions:
  - "D-01-05-1: HTMLCanvasElement (off-DOM) for glow layers instead of OffscreenCanvas — iOS 16 Safari OffscreenCanvas support is incomplete per RESEARCH.md"
  - "D-01-05-2: No per-frame typed array allocations — getByteFrequencyData writes into pre-allocated audioStateRef.current.smoothedFreqData buffer each rAF"
  - "D-01-05-3: Tension heatmap uses spectral centroid variance as proxy — placeholder for Phase 3 chord-function tension (simple, fast, offline-safe)"
  - "D-01-05-4: File upload extended to accept m4a/aac/ogg/flac — browser audio decode supports these natively, restriction was unnecessarily narrow"

patterns-established:
  - "Offscreen glow: createGlowLayer(radius, color) once per color/radius → cache in Map<string, HTMLCanvasElement> → drawImage each frame"
  - "HiDPI canvas setup: always via setupHiDPI() method, called on mount and ResizeObserver; never set canvas.width inline"
  - "rAF loop: read audioStateRef at frame time (not closure capture), zero allocations, schedule next frame at end of render"

duration: ~3m
completed: "2026-03-11"
---

# Phase 1 Plan 5: Canvas Renderer and Tension Heatmap Summary

**60fps HiDPI canvas renderer with offscreen glow compositing (zero shadowBlur, iOS-safe), pre-computed tension heatmap from offline chroma analysis, and full Phase 1 app layout wired end-to-end.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T00:04:13Z
- **Completed:** 2026-03-11
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify, approved)
- **Files modified:** 7

## Accomplishments

- CanvasRenderer class with 60fps rAF loop: reads pre-allocated `audioStateRef.current.smoothedFreqData` each frame via `getByteFrequencyData`, draws 6 frequency-band nodes (bass=amber, mid=teal, high=blue) that pulse with audio energy, zero per-frame typed array allocations
- Offscreen glow compositing via `createGlowLayer` (radial gradient on an off-DOM HTMLCanvasElement, cached per color/radius, composited via `drawImage`) — shadowBlur not used anywhere in codebase
- `TensionHeatmap.computeTensionHeatmap` pre-computes a per-second `Float32Array` from offline chroma/spectral analysis using Meyda; rendered on Timeline as blue (#3b82f6) to red (#ef4444) colored bar before first play
- `VisualizerCanvas` React component with ResizeObserver re-invoking `setupHiDPI` on every container resize
- Full app layout assembled: FileUpload → VisualizerCanvas → TransportControls → Timeline with heatmap
- File upload extended to accept m4a/aac/ogg/flac in addition to mp3/wav

## Task Commits

1. **Task 1: CanvasRenderer, glow layer, VisualizerCanvas** - `6225891` (feat)
2. **Task 2: Tension heatmap precompute and full app wiring** - `80cecce` (feat)
3. **Task 3: Accept m4a/aac/ogg/flac audio formats** - `76880e4` (fix)

## Files Created/Modified

- `src/canvas/CanvasRenderer.ts` — rAF loop, HiDPI setup, 6-band node rendering, glow compositing, no per-frame allocations
- `src/canvas/offscreen/glowLayer.ts` — `createGlowLayer(radius, color)`: off-DOM canvas, radial gradient, cached via Map
- `src/components/VisualizerCanvas.tsx` — React wrapper: mounts CanvasRenderer, ResizeObserver, cleanup on unmount
- `src/audio/TensionHeatmap.ts` — `computeTensionHeatmap(buffer, sampleRate)`: offline Meyda chroma extraction, returns Float32Array per second
- `src/components/Timeline.tsx` — updated to render tension heatmap as colored bar behind scrubber
- `src/App.tsx` — full layout wiring: post-calibration heatmap compute, VisualizerCanvas added, layout order set
- `src/components/FileUpload.tsx` — added m4a/aac/ogg/flac to accepted MIME types

## Decisions Made

- **D-01-05-1:** `createGlowLayer` uses `HTMLCanvasElement` (off-DOM, not `OffscreenCanvas`). iOS 16 Safari OffscreenCanvas support is incomplete per RESEARCH.md — this ensures the glow pattern works on the iOS target.
- **D-01-05-2:** Zero per-frame typed array allocations. `getByteFrequencyData` writes into the pre-allocated `audioStateRef.current.smoothedFreqData` Uint8Array established in 01-02. The rAF loop only reads, never allocates.
- **D-01-05-3:** Tension heatmap uses spectral centroid variance as the tension proxy. This is a fast, offline-safe placeholder. Phase 3 will replace it with chord-function-based tension (tonic/dominant/subdominant weighting).
- **D-01-05-4:** Extended file upload to accept m4a/aac/ogg/flac. Web Audio API's `decodeAudioData` handles these natively; restricting to mp3/wav was unnecessarily narrow for jazz recordings (many are m4a from iTunes libraries).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended audio file format support to m4a/aac/ogg/flac**
- **Found during:** Task 2 verification (human checkpoint)
- **Issue:** FileUpload only accepted mp3/wav, but many jazz recordings come as m4a/aac from iTunes or music apps. Web Audio API natively decodes these formats, so the restriction was functionally unnecessary and would frustrate real users.
- **Fix:** Added `audio/mp4`, `audio/aac`, `audio/ogg`, `audio/flac` and corresponding file extensions to the accepted MIME type list in FileUpload.tsx
- **Files modified:** src/components/FileUpload.tsx
- **Verification:** File input now accepts m4a/aac/ogg/flac; browser audio decode handles these natively
- **Committed in:** `76880e4` (separate fix commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential usability fix — no scope creep. Jazz recordings are commonly distributed as m4a.

## Issues Encountered

None beyond the file format extension above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 1 is fully complete (all 5 plans done). Human verification checkpoint passed.
- Canvas rendering baseline is locked: HiDPI, no shadowBlur, no per-frame GC, offscreen glow pattern established.
- All Phase 2 entry points are ready:
  - `audioStateRef.calibration` — per-band thresholds for role classification
  - `audioStateRef.smoothedFreqData` — pre-allocated Uint8Array read each rAF frame
  - `getBandEnergy()` from FrequencyBandSplitter — 6 overlapping bands including drums_low/drums_high
  - `CanvasRenderer` scaffold — Phase 2 replaces placeholder nodes with instrument-role nodes
- Concern carried forward: Verify Meyda chroma internal sample rate handling empirically on iOS (48kHz vs 44.1kHz) — if chroma vectors differ across sample rates, Phase 3 will need custom chroma normalization (~50 lines).
- Concern carried forward: iOS Low Power Mode caps rAF at 30fps — documented as known limitation, test with Low Power Mode OFF.

---
*Phase: 01-audio-pipeline-foundation*
*Completed: 2026-03-11*
