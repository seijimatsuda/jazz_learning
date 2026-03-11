---
phase: 03-chord-detection-harmonic-analysis
plan: "03"
subsystem: audio
tags: [meyda, chord-detection, tension-scoring, zustand, canvas, analysis-tick]

requires:
  - phase: 03-01
    provides: ChordDetector with extractAndMatchChord, CHORD_TEMPLATES, initChordDetector, initChordState
  - phase: 03-02
    provides: TensionScorer with updateTension, initTensionState; Zustand setChordInfo/setTension actions

provides:
  - runAnalysisTick extended with Phase 3 chord detection and tension scoring at 10fps
  - FUNCTION_LABELS and FAMILY_LABELS for confidence-gated chord display (CHORD-07, CHORD-08, CHORD-09, CHORD-10)
  - onChordChange callback wired from VisualizerCanvas → CanvasRenderer → runAnalysisTick → Zustand
  - TensionHeatmap replaced with chord-function-based offline analysis using CHORD_TEMPLATES + Meyda
  - App.tsx Phase 3 initialization: initChordDetector, initChordState, initTensionState after calibration

affects:
  - 03-04 (chord display UI components reading Zustand currentChord/chordConfidence/chordFunction)
  - 03-05 (tension visualization reading Zustand currentTension)
  - All future phases using the tension heatmap timeline

tech-stack:
  added: []
  patterns:
    - "Confidence-gated display: gap<0.05=low (family label), gap<0.15=medium, gap>=0.15=high (full name)"
    - "rawTimeDataFloat always populated before extractAndMatchChord via else-branch in disambiguation block"
    - "onChordChange fires only on displayedChordIdx change to prevent continuous Zustand mutations"
    - "Offline heatmap forces Meyda filter bank rebuild before processing (iOS 48kHz fix)"

key-files:
  created: []
  modified:
    - src/audio/AnalysisTick.ts
    - src/audio/TensionHeatmap.ts
    - src/App.tsx
    - src/canvas/CanvasRenderer.ts
    - src/components/VisualizerCanvas.tsx

key-decisions:
  - "rawTimeDataFloat population moved to explicit else-branch — when disambiguation doesn't run, Phase 3 still needs the float buffer for Meyda chroma extraction"
  - "TENSION_MIDPOINTS for offline heatmap: tonic=0.1, subdominant=0.325, dominant=0.65, altered=0.875 — midpoints of TensionScorer TENSION_TARGETS ranges for consistent visual mapping"
  - "Offline heatmap uses center-of-second windowing: midSample = startSample + windowLen/2, then FFT_SIZE frame around it — avoids boundary artifacts at second edges"
  - "ChordChangeCallback type defined in CanvasRenderer.ts (not types.ts) — callback signature is UI-wiring concern, not audio domain type"

patterns-established:
  - "Phase 3 callback pattern: runAnalysisTick(state, onRoleChange?, onChordChange?) — optional third callback for chord/tension, mirrors Phase 2 role change pattern"
  - "Zustand push only on state change: check displayedChordIdx changed before calling onChordChange — prevents high-frequency mutations in steady-state playback"

duration: 3min
completed: "2026-03-11"
---

# Phase 3 Plan 03: Chord+Tension Pipeline Integration Summary

**ChordDetector and TensionScorer wired into live 10fps analysis loop with confidence-gated display labels, offline tension heatmap replaced with chord-function-based Meyda chroma analysis, and full Phase 3 initialization added to App.tsx calibration chain**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T03:43:18Z
- **Completed:** 2026-03-11T03:46:01Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Extended `runAnalysisTick` with Phase 3 block: calls `extractAndMatchChord` then `updateTension`, maps confidence gap to low/medium/high tiers, formats chord display name with FAMILY_LABELS (low) or root+type (medium/high), pushes to `onChordChange` only on `displayedChordIdx` change
- Replaced spectral centroid proxy `computeTensionHeatmap` with chord-function-based offline analysis: per-second Meyda chroma extraction → cosine similarity vs CHORD_TEMPLATES → tension midpoint mapping
- Added `onChordChange` callback plumbing: `CanvasRenderer.setOnChordChange` → `runAnalysisTick` third arg → `VisualizerCanvas` wires it to `useAppStore.setChordInfo` + `setTension`
- Added Phase 3 initialization in App.tsx: `initChordDetector(sampleRate, fftSize)`, `audioStateRef.current.chord = initChordState()`, `audioStateRef.current.tension = initTensionState()`

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire chord detection and tension into AnalysisTick + add chord display formatting** - `9138650` (feat)
2. **Task 2: Replace TensionHeatmap + wire Phase 3 initialization in App.tsx** - `3629df9` (feat)

**Plan metadata:** (see docs commit below)

## Files Created/Modified

- `src/audio/AnalysisTick.ts` - Phase 3 section added: extractAndMatchChord, updateTension, confidence-gated display logic, onChordChange callback; rawTimeDataFloat always populated via else-branch
- `src/audio/TensionHeatmap.ts` - Replaced spectral centroid proxy with CHORD_TEMPLATES cosine similarity + Meyda chroma offline analysis; tensionToColor unchanged
- `src/App.tsx` - Imports and calls initChordDetector, initChordState, initTensionState after calibration
- `src/canvas/CanvasRenderer.ts` - Added ChordChangeCallback type, onChordChange private field, setOnChordChange setter; passes callback to runAnalysisTick
- `src/components/VisualizerCanvas.tsx` - setOnChordChange wired to push chord/tension to Zustand

## Decisions Made

- **[D-03-03-1]** rawTimeDataFloat population moved to explicit else-branch in disambiguation block — when no keyboard+guitar are present, Phase 3 (extractAndMatchChord) still needs the float buffer for Meyda chroma extraction. Previously ChordDetector had a fallback zero-check, but that was fragile; the else-branch guarantees population unconditionally.
- **[D-03-03-2]** Offline heatmap uses center-of-second windowing (midSample = startSample + windowLen/2, then FFT_SIZE frame centered there) — avoids boundary effects at second transitions vs. taking the raw start of each second.
- **[D-03-03-3]** TENSION_MIDPOINTS: tonic=0.1, subdominant=0.325, dominant=0.65, altered=0.875 — exact midpoints of TensionScorer TENSION_TARGETS ranges so offline and live tension values align on same scale.
- **[D-03-03-4]** ChordChangeCallback type defined locally in CanvasRenderer.ts — it is a UI callback signature, not an audio domain type; keeping it out of types.ts avoids coupling the audio module to UI concerns.

## Deviations from Plan

None — plan executed exactly as written. The `rawTimeDataFloat` else-branch population was already implied by the plan's "rawTimeDataFloat is always populated before extractAndMatchChord runs (guard added in AnalysisTick)" must-have truth; implemented as described.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Chord detection fully integrated: `state.chord.displayedChordIdx` updated at 10fps, `state.tension.currentTension` lerp-smoothed
- Zustand `currentChord`, `chordConfidence`, `chordFunction`, `currentTension` populated on every chord change event
- Ready for 03-04: chord display UI components can read Zustand state directly
- Ready for 03-05: tension visualization can read `currentTension` and `tensionHeatmap` from Zustand/audioStateRef
- Concern carried forward: Meyda chroma quality on iOS 48kHz vs desktop 44.1kHz — filter bank rebuild applied in both live (03-01) and offline (03-03) paths, but empirical test with real jazz on device still needed

---
*Phase: 03-chord-detection-harmonic-analysis*
*Completed: 2026-03-11*
