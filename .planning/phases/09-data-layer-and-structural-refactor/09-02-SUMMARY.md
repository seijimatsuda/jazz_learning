---
phase: 09-data-layer-and-structural-refactor
plan: "02"
subsystem: ui
tags: [typescript, react, band-setup, instrument-lineup, activity-scoring, calibration]

requires:
  - phase: 09-01
    provides: InstrumentName expanded to 8 members, MID_RANGE_INSTRUMENTS set, resolveBandsForInstrument generalized

provides:
  - Confirmed generic scorer/calibration for any 2-8 instrument lineup (zero code changes needed)
  - BandSetupPanel shows all 8 instruments with icons and frequency labels

affects:
  - 09-03 (AnalysisTick.ts — iterates instruments array; now sees 8-instrument lineups)
  - 09-04 (App.tsx — uses BandSetupPanel and lineup from store)
  - 10-01 (canvas node positions for 5-8 nodes)

tech-stack:
  added: []
  patterns:
    - "Generic lineup iteration: all scorer/calibration code iterates arrays, never hardcodes instrument names"
    - "AVAILABLE_INSTRUMENTS constant drives UI options; adding instrument = one-line constant change"

key-files:
  created: []
  modified:
    - src/components/BandSetupPanel.tsx

key-decisions:
  - "Task 1 audit: zero code changes needed — initAnalysisState, computeActivityScore, classifyRole, runCalibrationPass all iterate generically"
  - "vibes and guitar share same icon (musical note) — no distinct vibraphone or trombone emoji in Unicode"

patterns-established:
  - "CalibrationPass calibrates per-frequency-band, not per-instrument — completely lineup-agnostic by design"

duration: 5min
completed: 2026-03-12
---

# Phase 9 Plan 02: Scorer Generalization Audit and BandSetupPanel 8-Instrument Expansion Summary

**Confirmed all scorer/calibration functions are lineup-agnostic by design, and expanded BandSetupPanel from 4 to 8 selectable instruments with icons and frequency range labels.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-12T05:07:21Z
- **Completed:** 2026-03-12T05:07:57Z
- **Tasks:** 2 (1 read-only audit, 1 code change)
- **Files modified:** 1

## Accomplishments

- Audited initAnalysisState, computeActivityScore, classifyRole, and runCalibrationPass — all confirmed fully generic for any 2-8 instrument lineup; zero code changes required
- Expanded BandSetupPanel AVAILABLE_INSTRUMENTS to all 8: keyboard, bass, drums, guitar, saxophone, trumpet, trombone, vibes
- Added icons and frequency range labels for all 4 new instruments
- App builds cleanly with zero TypeScript errors in modified files

## Task Commits

1. **Task 1: Verify scorer and calibration generalization** — read-only audit, no commit needed
2. **Task 2: Expand BandSetupPanel to 8 instruments** — `01af9ba` (feat)

**Plan metadata:** (docs commit, see below)

## Files Created/Modified

- `src/components/BandSetupPanel.tsx` — Added 4 instruments to AVAILABLE_INSTRUMENTS, INSTRUMENT_ICONS, and BAND_LABELS

## Decisions Made

- Task 1 audit finding: CalibrationPass operates on frequency bands (not instruments), making it inherently lineup-agnostic. No changes needed or appropriate.
- vibes and guitar share the musical note emoji (U+1F3B5) — no vibraphone emoji exists in Unicode; trombone uses musical notes (U+1F3B6). This is acceptable for v1.1; Phase 10 can use custom SVG icons if desired.

## Deviations from Plan

None — plan executed exactly as written. Task 1 audit confirmed the prediction that zero code changes would be needed in scorer/calibration files.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02 complete: scorer/calibration confirmed generic, BandSetupPanel shows all 8 instruments
- Plans 03-04 must fix the four crash sites (PAIRS IIFE in drawCommunicationEdges.ts, computeNodePositions count switch, CanvasRenderer hardcoded 4-node constructor, pocket line indexOf(-1) throw) before the app is fully functional with 8 instruments
- Existing TypeScript errors in AnalysisTick.ts and App.tsx are expected and tracked for Plan 04

---
*Phase: 09-data-layer-and-structural-refactor*
*Completed: 2026-03-12*
