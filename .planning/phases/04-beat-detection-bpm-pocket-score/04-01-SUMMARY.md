---
phase: 04-beat-detection-bpm-pocket-score
plan: 01
subsystem: audio
tags: [spectral-flux, onset-detection, beat-detection, typed-arrays, zero-allocation, ring-buffer]

# Dependency graph
requires:
  - phase: 03-chord-detection-harmonic-analysis
    provides: TensionState pattern for pre-allocated ring buffer architecture on AudioStateRef
  - phase: 02-instrument-activity-analysis
    provides: FrequencyBand type with lowBin/highBin; drums_high and ride band definitions
provides:
  - BeatState interface with 9 pre-allocated Float32Array buffers on types.ts
  - AudioStateRef.beat field (BeatState | null)
  - DrumTransientDetector module with initBeatState, computeDrumFlux, adaptiveThreshold, detectDrumOnset
affects:
  - 04-02-bpm-derivation (reads drumOnsetTimes, ioiBuffer, acBuffer, bpmHistory)
  - 04-03-swing-detection (reads drumOnsetTimes, beatCounter, lastDownbeatSec)
  - 04-04-pocket-scoring (reads pocketBuffer, pocketScore, timingOffsetMs)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-allocated ring buffer pattern: all Float32Array buffers allocated in initBeatState, zero allocations in per-tick functions"
    - "Band-limited spectral flux: half-wave rectified over specific bands (drums_high + ride) not full spectrum"
    - "Adaptive threshold: mean + 1.5x stddev over rolling window, Infinity guard for cold-start"
    - "Rising-edge gate: onset fires only when flux > threshold AND flux > prevFlux"

key-files:
  created:
    - src/audio/DrumTransientDetector.ts
  modified:
    - src/audio/types.ts

key-decisions:
  - "D-04-01-1: drums_high (2000-8000Hz) + ride (6000-10000Hz) for drum flux — not snare fundamental (200-800Hz) which overlaps bass/piano"
  - "D-04-01-2: adaptiveThreshold returns Infinity when n<3 — prevents cold-start false onsets during first 300ms"
  - "D-04-01-3: OSS buffer populated every tick (not just on onset) — downstream autocorrelation needs full signal density"
  - "D-04-01-4: beatCounter starts at 0 and increments on onset then wraps mod 4; downbeat fires when counter==0 after increment"

patterns-established:
  - "Zero per-tick allocation: all typed arrays pre-allocated in init function, mutated in-place each tick"
  - "Rising-edge gate pattern for onset detection: threshold check AND flux > prevFlux prevents double-trigger on decaying tail"

# Metrics
duration: 2min
completed: 2026-03-10
---

# Phase 4 Plan 1: Beat Detection Foundation Summary

**Band-limited drum transient detector with adaptive threshold (mean + 1.5x stddev) over drums_high + ride bands, zero per-tick allocation ring buffer architecture for all Beat Detection state**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-10T07:34:47Z
- **Completed:** 2026-03-10T07:36:48Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- BeatState interface with 9 pre-allocated Float32Array buffers (ossBuffer 60, drumFluxBuffer 20, bassFluxBuffer 20, drumOnsetTimes 20, acBuffer 30, pocketBuffer 8, ioiBuffer 19, bpmHistory 3) — zero allocations after initBeatState
- AudioStateRef extended with `beat: BeatState | null` field; createInitialAudioState returns `beat: null`
- computeDrumFlux: half-wave rectified spectral flux over drums_high (2000-8000Hz) and ride (6000-10000Hz) bands (BEAT-01)
- adaptiveThreshold: mean + 1.5x stddev over rolling 20-sample window; returns Infinity when n<3 (BEAT-02)
- detectDrumOnset: flux > threshold AND rising-edge gate; stores timestamps in pre-allocated ring buffer; beat counter mod 4 fires downbeat (BEAT-07)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add BeatState interface and extend AudioStateRef** - `1761806` (feat)
2. **Task 2: Create DrumTransientDetector** - `083ddfa` (feat)

## Files Created/Modified

- `src/audio/types.ts` - BeatState interface added (9 pre-allocated Float32Array fields); AudioStateRef.beat field; createInitialAudioState returns beat: null
- `src/audio/DrumTransientDetector.ts` - New module: initBeatState, computeDrumFlux, adaptiveThreshold, detectDrumOnset

## Decisions Made

- **D-04-01-1**: Used drums_high (2000-8000Hz) + ride (6000-10000Hz) for drum flux, NOT snare fundamental (200-800Hz). The 200-800Hz range overlaps heavily with bass guitar, piano comping, and vocal fundamentals in jazz — false-positive rate would be unacceptable. Snare crack transients are better represented at 2-8kHz.
- **D-04-01-2**: adaptiveThreshold returns Infinity when fewer than 3 samples in window. This prevents false onset firings during the first 200-300ms of analysis before the threshold window has meaningful data.
- **D-04-01-3**: OSS buffer receives flux every tick regardless of onset detection. Downstream autocorrelation (04-02) needs full signal density, not just onset timestamps.
- **D-04-01-4**: beatCounter increments on every onset then wraps mod 4; downbeat event fires when counter==0 post-increment. This means beat 1 is the first onset detected after a wrap, matching musical convention.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DrumTransientDetector ready for integration into AnalysisTick.ts (04-02 will add the per-tick call)
- drumOnsetTimes ring buffer ready for IOI extraction and BPM derivation (04-02)
- acBuffer pre-allocated for autocorrelation-based BPM (04-02)
- pocketBuffer and pocketScore fields ready for pocket scoring (04-04)
- No blockers. All Phase 4 plans can proceed sequentially.

---
*Phase: 04-beat-detection-bpm-pocket-score*
*Completed: 2026-03-10*
