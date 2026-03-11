---
phase: 03-chord-detection-harmonic-analysis
plan: "02"
subsystem: audio
tags: [tension, lerp, ring-buffer, zustand, chord-function, harmonic-analysis]

# Dependency graph
requires:
  - phase: 03-01
    provides: ChordDetector with CHORD_TEMPLATES, ChordFunction type, TensionState type in types.ts
provides:
  - TensionScorer module: chord function → tension range mapping, lerp smoothing, ring buffer history, ghost line accessor
  - Zustand store extended with currentChord, chordConfidence, chordFunction, currentTension, setChordInfo, setTension
affects:
  - 03-03 (AnalysisTick integration wires updateTension into 10fps loop)
  - 03-04 (tension meter UI reads currentTension from Zustand)
  - 03-05 (chord display reads currentChord/chordConfidence/chordFunction from Zustand)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-allocated Float32Array ring buffer with head pointer — zero per-tick allocations (TENS-03)"
    - "Midpoint lerp smoothing: tension += LERP_RATE * (target - tension) per 10fps tick (TENS-02)"
    - "Ghost line via ring buffer index arithmetic: (head - GHOST_OFFSET + HISTORY_CAP * 2) % HISTORY_CAP (TENS-05)"
    - "Zustand chord/tension fields updated only when AnalysisTick has new data — avoids continuous mutations during silence"

key-files:
  created:
    - src/audio/TensionScorer.ts
  modified:
    - src/store/useAppStore.ts

key-decisions:
  - "Ghost index arithmetic uses +HISTORY_CAP*2 before modulo — ensures positive result regardless of head position near 0"
  - "Target is midpoint of TENSION_TARGETS range — avoids snapping to edges; lerp moves smoothly through the range"
  - "chordFunction field is plain English string (not ChordFunction type) — UI displays human-readable label not enum key"
  - "reset() clears chord to '--' and confidence to 'low' (not null) — avoids conditional rendering in chord display components"

patterns-established:
  - "TensionState fields all scalar/Float32Array — no object allocations in hot path"
  - "initTensionState factory pattern matches initChordState from 03-01 — consistent init/update pattern"

# Metrics
duration: 1min 14s
completed: 2026-03-11
---

# Phase 3 Plan 02: TensionScorer and Zustand Chord/Tension State Summary

**TensionScorer maps chord functions to lerp-smoothed tension (0-1) via a 32-slot Float32Array ring buffer, with a 3-second ghost line accessor; Zustand store extended with chord name, confidence, function label, and tension value for React UI consumption.**

## Performance

- **Duration:** 1 min 14s
- **Started:** 2026-03-11T03:39:21Z
- **Completed:** 2026-03-11T03:40:35Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## Accomplishments

- TensionScorer.ts created with TENSION_TARGETS mapping all 4 ChordFunction values to tension ranges, LERP_RATE=0.05 per tick smoothing, HISTORY_CAP=32 ring buffer, and getGhostTension returning 30-tick-ago value (or 0 if not enough samples)
- Zero per-tick allocations enforced: all Float32Array buffers pre-allocated in initTensionState(); updateTension and getGhostTension operate purely on existing buffers
- Zustand store extended with currentChord, chordConfidence, chordFunction, currentTension fields plus setChordInfo (atomic 3-field update) and setTension actions; reset() clears all Phase 3 state

## Task Commits

1. **Task 1: Create TensionScorer** - `b8c15fe` (feat)
2. **Task 2: Extend Zustand store with chord/tension UI state** - `677f094` (feat)

## Files Created/Modified

- `src/audio/TensionScorer.ts` - Chord function to tension mapping, lerp smoothing at 0.05/frame, 32-slot ring buffer, ghost line accessor for 30-tick lookback
- `src/store/useAppStore.ts` - Added currentChord/chordConfidence/chordFunction/currentTension fields with setChordInfo/setTension actions and reset() updates

## Decisions Made

- Ghost index arithmetic: `(tensionHistoryHead - GHOST_OFFSET + HISTORY_CAP * 2) % HISTORY_CAP` — adding `HISTORY_CAP * 2` before modulo prevents negative remainders when head is near 0; `* 2` rather than `* 1` because GHOST_OFFSET (30) > HISTORY_CAP (32) is not possible here but the pattern is defensive
- Target is midpoint of TENSION_TARGETS range (`(lo + hi) / 2`) — lerp smoothly traverses the tension zone rather than snapping to range extremes
- `chordFunction` in Zustand is `string` not `ChordFunction` — AnalysisTick (03-03) will compute the plain-English label (e.g. "home -- relaxed and stable") before pushing to Zustand; this decouples UI from the enum
- `reset()` sets `currentChord` to `'--'` and `chordConfidence` to `'low'` — avoids null checks in chord display components

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TensionScorer ready to be called from AnalysisTick (03-03) each 10fps tick
- Zustand actions ready for AnalysisTick to call after each chord/tension update
- Ghost tension available for tension visualization in 03-04/03-05
- All TENS-01, TENS-02, TENS-03, TENS-05 requirements satisfied

---
*Phase: 03-chord-detection-harmonic-analysis*
*Completed: 2026-03-11*
