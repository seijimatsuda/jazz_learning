---
phase: 03-chord-detection-harmonic-analysis
plan: 01
subsystem: audio
tags: [meyda, chroma, chord-detection, cosine-similarity, ios-fix, float32array, ring-buffer]

# Dependency graph
requires:
  - phase: 02-instrument-activity-analysis
    provides: AudioStateRef with AnalysisState, rawTimeDataFloat pre-allocated in initAnalysisState
  - phase: 01-audio-pipeline-foundation
    provides: FrequencyBandSplitter hzToBin, fftSize=4096, sampleRate read-back pattern
provides:
  - ChordFunction union type ('tonic' | 'subdominant' | 'dominant' | 'altered')
  - ChordState interface with all Float32Array buffers pre-allocated
  - TensionState interface with pre-allocated Float32Array[32] history
  - AudioStateRef extended with chord and tension fields
  - CHORD_TEMPLATES: 96 pre-computed chord templates (12 roots x 8 types, RIGHT rotation)
  - initChordDetector with forced Meyda chromaFilterBank rebuild (iOS fix)
  - extractAndMatchChord: per-tick chroma extraction, bass weighting, smoothing, cosine matching
  - Flicker prevention hold gate (200ms), confidence gap scoring, capped chord log
affects:
  - 03-02 (confidence display + chord function labels reads displayedChordIdx, confidenceGap)
  - 03-03 (tension scoring reads displayedChordIdx and CHORD_TEMPLATES function field)
  - 03-04 (tension meter reads TensionState)
  - 03-05 (chord history panel reads chordLog)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RIGHT rotation for transposing root-C chord templates to all 12 roots"
    - "Meyda chromaFilterBank = undefined before sampleRate assignment (iOS sampleRate fix)"
    - "Ring buffer for 3-frame chroma smoothing: Float32Array[36], head tracks modulo 3"
    - "Cosine similarity with confidence gap (best - secondBest) for template matching"
    - "Hold gate pattern: pendingChordIdx + pendingHoldCount for flicker prevention"

key-files:
  created:
    - src/audio/ChordDetector.ts
  modified:
    - src/audio/types.ts

key-decisions:
  - "[D-03-01-1]: RIGHT rotation for chord template transposition — rotateRight([C-major], 7) correctly produces G major at indices 2,7,11"
  - "[D-03-01-2]: Meyda chromaFilterBank forced to undefined before sampleRate — critical iOS fix; stale 44.1kHz bank on 48kHz Safari produces wrong chroma vectors"
  - "[D-03-01-3]: rawTimeDataFloat populated conditionally in extractAndMatchChord — if all-zeros (no kb/guitar disambiguation ran), converts from rawTimeData inline; avoids double-conversion when disambiguation already ran"
  - "[D-03-01-4]: Bass weighting skips if maxEnergy < 20 — prevents noise floor from biasing root detection on silent/quiet segments"
  - "[D-03-01-5]: Chord log push only on displayedChordIdx change (not on every hold confirmation) — avoids duplicate entries when chord is stable across many ticks"

patterns-established:
  - "Pattern: All per-tick typed array buffers pre-allocated in init function, never in hot path"
  - "Pattern: Ring buffer write head uses modulo arithmetic, pre-allocated Float32Array[frames*12]"
  - "Pattern: Hold gate for display stability — pendingX / pendingHoldCount pair, HOLD_TICKS constant"
  - "Pattern: Confidence gap = best - secondBest cosine similarity score for disambiguation quality"

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 3 Plan 01: Chord Detection Core Summary

**96-template cosine-similarity chord detector with Meyda chroma extraction, iOS filter bank fix, bass weighting, 300ms smoothing, and 200ms flicker gate**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T03:34:00Z
- **Completed:** 2026-03-11T03:36:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended types.ts with ChordFunction, ChordState (all Float32Array pre-allocated), and TensionState; AudioStateRef gets chord and tension fields initialized to null
- Pre-computed all 96 chord templates at module load via RIGHT rotation — zero runtime cost per tick
- Forced Meyda chroma filter bank rebuild before sampleRate assignment — critical iOS Safari correctness fix
- Implemented full per-tick pipeline: Meyda chroma extraction, bass band weighting, 3-frame 300ms rolling smoothing, cosine similarity matching against 96 templates, confidence gap, flicker prevention hold gate, capped chord log

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types.ts with ChordFunction, ChordState, TensionState** - `3700235` (feat)
2. **Task 2: Create ChordDetector with templates, Meyda chroma, bass weighting, smoothing, matching, flicker prevention** - `771e6ea` (feat)

## Files Created/Modified
- `src/audio/types.ts` - Added ChordFunction, ChordState, TensionState; extended AudioStateRef with chord/tension fields; createInitialAudioState returns both as null
- `src/audio/ChordDetector.ts` - New module: 96 chord templates, initChordDetector (iOS fix), initChordState (pre-alloc), extractAndMatchChord (zero per-tick allocations)

## Decisions Made

- **[D-03-01-1]**: RIGHT rotation for template transposition — `rotateRight(cMajorVec, 7)` gives G major (indices 2, 7, 11 = 1). Verified correct against note names.
- **[D-03-01-2]**: Meyda chromaFilterBank forced undefined before sampleRate — iOS Safari may run at 48kHz; without this Meyda uses a stale 44.1kHz filter bank producing completely wrong chroma.
- **[D-03-01-3]**: rawTimeDataFloat conversion is conditional — only converts from rawTimeData if the float buffer appears all-zero (kb/guitar disambiguation didn't run). Avoids double-work.
- **[D-03-01-4]**: Bass weighting skips below energy threshold 20 — prevents bias from noise floor on silent segments.
- **[D-03-01-5]**: Chord log push only on actual displayedChordIdx change — prevents duplicate log entries during stable chord holds lasting more than 2 ticks.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled zero errors on both tasks. G major rotation verified correct programmatically.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ChordState and TensionState types ready for 03-02 through 03-05 consumers
- extractAndMatchChord ready to be called from AnalysisTick (03-02 wires it into the tick loop)
- CHORD_TEMPLATES exported for use in confidence display (03-02) and chord function label (03-02/03-03)
- TensionState type ready for tension scoring (03-03) and tension meter (03-04)
- Concern: rawTimeDataFloat population relies on AnalysisTick running kb/guitar disambiguation OR on state.rawTimeData being populated. If neither condition holds (e.g. no instruments detected), chroma extraction returns zeros — acceptable silent-segment behavior.

---
*Phase: 03-chord-detection-harmonic-analysis*
*Completed: 2026-03-11*
