---
phase: 12-disambiguation-engine
plan: 05
subsystem: audio
tags: [disambiguation, canvas, zustand, typescript, tutti-guard, confidence-indicator]

# Dependency graph
requires:
  - phase: 12-01
    provides: rawActivityScore/displayActivityScore on InstrumentAnalysis, DisambiguationState interface + initDisambiguationState, instrumentFamilies.ts helpers
  - phase: 12-02
    provides: SpectralFeatures.ts pure functions (computeSpectralFlatness, computeBandCentroid, chromaEntropy)
  - phase: 12-03
    provides: TromboneBassDisambiguator, SaxKeyboardDisambiguator
  - phase: 12-04
    provides: VibesKeyboardDisambiguator, HornSectionDisambiguator
provides:
  - DisambiguationEngine orchestrator (runDisambiguationEngine) with tutti guard and pair-presence guards
  - DisambiguationState initialized alongside AnalysisState on lineup change (App.tsx)
  - Full disambiguation pipeline wired into AnalysisTick after kb/guitar and before cross-correlation
  - disambiguationConfidence and isTutti fields in Zustand store (setDisambiguationInfo action)
  - Canvas confidence indicator: node dims to 0.5 alpha when pair confidence < 0.5 (DISC-04)
affects: [phase-13-visual, calibration-pass, ui-panels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Disambiguation engine follows stesso callback wiring pattern as onMelodyUpdate / onBeatUpdate
    - globalAlpha wrapper around drawNode for per-node confidence dimming (no per-frame allocations)
    - Pair key mapping (getInstrumentPairKey) centralizes instrument-to-disambiguator lookup in renderer

key-files:
  created:
    - src/audio/DisambiguationEngine.ts
  modified:
    - src/audio/AnalysisTick.ts
    - src/App.tsx
    - src/store/useAppStore.ts
    - src/canvas/CanvasRenderer.ts
    - src/components/VisualizerCanvas.tsx
    - src/audio/HornSectionDisambiguator.ts
    - src/audio/VibesKeyboardDisambiguator.ts

key-decisions:
  - "Confidence indicator uses ctx.globalAlpha on entire drawNode call (circle + label), not label-only — drawNode does not expose separate label path, and full-node dimming is acceptable minimal indicator"
  - "getInstrumentPairKey in CanvasRenderer only returns a horn_section key for trumpet (not trombone/sax) — those instruments already have dedicated pair keys; trumpet has no standalone pair"
  - "onDisambiguationUpdate fires every tick (not change-gated) — confidence values change smoothly and Zustand should reflect real-time state"
  - "SaxKeyboard runs only when chroma is non-null — chroma comes from state.chord.chromaBuffer, so no chroma = no sax/keyboard disambiguation that tick (graceful degradation)"

patterns-established:
  - "Disambiguation engine initialized in App.tsx calibration callback, same lifecycle block as initAnalysisState and other state objects"
  - "All 4 disambiguators imported via index in DisambiguationEngine.ts — single orchestrator, no scattered imports in AnalysisTick"

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 12 Plan 05: Disambiguation Engine Integration Summary

**DisambiguationEngine orchestrator wires all 4 disambiguators into the live analysis pipeline, with tutti guard, pair-presence guards, Zustand confidence exposure, and per-node confidence dimming on canvas**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T23:02:40Z
- **Completed:** 2026-03-12T23:07:10Z
- **Tasks:** 3
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- Created `DisambiguationEngine.ts` orchestrating all 4 disambiguators with tutti guard (DISC-FND-04) and pair-presence guards (DISC-FND-05)
- Replaced temporary `displayActivityScore = activityScore` fallback in AnalysisTick with real engine call; added `onDisambiguationUpdate` callback parameter
- DisambiguationState initialized alongside AnalysisState in App.tsx calibration block; confidence flows to Zustand via new `disambiguationConfidence` and `isTutti` fields
- Canvas renders confidence indicator: node dims to 50% alpha when disambiguator pair confidence < 0.5 (DISC-04)

## Task Commits

Each task was committed atomically:

1. **Task 1: DisambiguationEngine orchestrator** - `33441a4` (feat)
2. **Task 2: Wire into AnalysisTick and init lifecycle** - `2748bdc` (feat)
3. **Task 3: Confidence to Zustand + canvas indicator** - `ac813ff` (feat)

## Files Created/Modified
- `src/audio/DisambiguationEngine.ts` — Orchestrator; exports runDisambiguationEngine with tutti guard, 4 disambiguator calls, weight application
- `src/audio/AnalysisTick.ts` — Added runDisambiguationEngine import, replaced fallback, added onDisambiguationUpdate parameter
- `src/App.tsx` — Added initDisambiguationState import, initialized state.disambiguation alongside state.analysis
- `src/store/useAppStore.ts` — Added disambiguationConfidence, isTutti state fields, setDisambiguationInfo action, reset entries
- `src/canvas/CanvasRenderer.ts` — Added setOnDisambiguationUpdate, getInstrumentPairKey helper, globalAlpha confidence dimming in node loop
- `src/components/VisualizerCanvas.tsx` — Wired renderer.setOnDisambiguationUpdate to Zustand setDisambiguationInfo
- `src/audio/HornSectionDisambiguator.ts` — Fixed missing `type` keyword on FrequencyBand import (verbatimModuleSyntax)
- `src/audio/VibesKeyboardDisambiguator.ts` — Fixed missing `type` keyword on DisambiguationState/FrequencyBand imports

## Decisions Made
- Confidence indicator applies `ctx.globalAlpha` to entire `drawNode` call (circle + label together) rather than label-only — `drawNode` does not expose a separate label rendering path, and full-node dimming is a valid minimal confidence indicator
- `getInstrumentPairKey` maps trumpet → `horn_section`, trombone/bass → `trombone_bass` only when both are in lineup — guards against false positives in small lineups
- `onDisambiguationUpdate` fires every tick (not change-gated) — confidence values are continuous and real-time Zustand updates are appropriate; Zustand mutations are cheap

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed verbatimModuleSyntax import errors in HornSectionDisambiguator and VibesKeyboardDisambiguator**
- **Found during:** Task 3 (npm run build verification)
- **Issue:** Both files used value-import syntax (`import { Type }`) for TypeScript type-only imports, violating the project's `verbatimModuleSyntax` tsconfig option — build failed with TS1484
- **Fix:** Changed to `import type { ... }` in both files
- **Files modified:** `src/audio/HornSectionDisambiguator.ts`, `src/audio/VibesKeyboardDisambiguator.ts`
- **Verification:** `npm run build` succeeded (290.68 kB bundle, 0 errors)
- **Committed in:** `ac813ff` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — pre-existing import syntax error in 12-04 files)
**Impact on plan:** Auto-fix essential for build to pass. No scope creep.

## Issues Encountered
None beyond the blocking import syntax fix above.

## Next Phase Readiness
- Phase 12 (Disambiguation Engine) is now fully complete — all 5 plans executed
- DisambiguationEngine is live in the analysis pipeline; displayActivityScore reflects real disambiguation weights
- Confidence values are in Zustand for future UI panels (e.g., disambiguation confidence readout)
- Calibration pass needed: grep CALIBRATION_NEEDED across TromboneBassDisambiguator, SaxKeyboardDisambiguator, VibesKeyboardDisambiguator, HornSectionDisambiguator before production tuning
- Phase 13 (Visual) can now proceed — displayActivityScore is the authoritative display value

---
*Phase: 12-disambiguation-engine*
*Completed: 2026-03-12*
