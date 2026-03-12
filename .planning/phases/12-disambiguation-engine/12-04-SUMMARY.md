---
phase: 12-disambiguation-engine
plan: 04
subsystem: audio
tags: [typescript, disambiguation, vibraphone, tremolo, horn-section, spectral-centroid, rms-variance]

# Dependency graph
requires:
  - phase: 12-01
    provides: DisambiguationState with tremoloRmsBuffer (Float32Array(20)), tremoloRmsHead, tremoloRmsSamples
  - phase: 12-02
    provides: computeBandCentroid pure function in SpectralFeatures.ts

provides:
  - VibesKeyboardDisambiguator.ts — DISC-02 stateful tremolo detection via RMS variance
  - HornSectionDisambiguator.ts — DISC-03 spectral centroid hierarchy for 3+ horns
  - pushRmsSample, computeRmsVariance, disambiguateVibesKeyboard exports
  - disambiguateHornSection export

affects:
  - 12-05 (integration plan wiring all disambiguators into AnalysisTick)
  - Phase 13 (visual disambiguation display)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honest confidence capping: MAX_CONFIDENCE = 0.5 when Nyquist limits detection reliability"
    - "Weight convention [0.15, 0.85]: all disambiguation weight pairs clamped to this range"
    - "Guard-first disambiguation: return empty weights at confidence 0 when preconditions not met"
    - "CALIBRATION_NEEDED marker: empirical threshold constants annotated for future tuning pass"
    - "Inverse distance weighting: 1/(1+distance) maps spectral centroid proximity to horn weights"

key-files:
  created:
    - src/audio/VibesKeyboardDisambiguator.ts
    - src/audio/HornSectionDisambiguator.ts
  modified: []

key-decisions:
  - "VibesKeyboardDisambiguator defaults to LOW confidence (0.5 cap) — tremolo at 10fps is near Nyquist and motor-off vibes are acoustically indistinguishable from keyboard"
  - "RMS variance normalization constant 1.0 is CALIBRATION_NEEDED — requires empirical tuning against vibraphone recordings"
  - "HornSectionDisambiguator guards on hornInstruments.length < 3 — fewer than 3 horns uses simpler pair-disambiguation path"
  - "Expected centroid positions {trombone: 900, saxophone: 1400, trumpet: 2250} are literature-derived CALIBRATION_NEEDED estimates"
  - "Both high-activity penalty and proximity penalty can stack, potentially reducing confidence to 0.35 or lower in tutti passages"

patterns-established:
  - "Honest confidence: disambiguators that operate near the limits of detectability must cap confidence at a principled value, not inflate it"
  - "CALIBRATION_NEEDED annotation: all empirical threshold constants require this comment so future calibration pass can find them via grep"

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 12 Plan 04: Vibes/Keyboard and Horn Section Disambiguators Summary

**Stateful tremolo RMS variance for vibes/keyboard (confidence capped at 0.5 for Nyquist honesty) and spectral centroid hierarchy for 3+ horn sections with inverse distance weighting**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-12T23:00:00Z
- **Completed:** 2026-03-12T23:08:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- VibesKeyboardDisambiguator: pushes mid-band RMS into a 20-frame ring buffer, computes variance, maps to vibes/keyboard weights, caps confidence at 0.5 with explicit Nyquist rationale
- HornSectionDisambiguator: guards on 3+ horns, computes spectral centroid via computeBandCentroid, assigns inverse distance weights to trombone/saxophone/trumpet, applies proximity and high-activity confidence penalties
- Both disambiguators follow the [0.15, 0.85] weight clamping convention established in KbGuitarDisambiguator

## Task Commits

Each task was committed atomically:

1. **Task 1: VibesKeyboardDisambiguator.ts — stateful tremolo detection** - `7af24eb` (feat)
2. **Task 2: HornSectionDisambiguator.ts — spectral centroid hierarchy** - `a981b86` (feat)

**Plan metadata:** (docs commit — see final step)

## Files Created/Modified

- `src/audio/VibesKeyboardDisambiguator.ts` — DISC-02: pushRmsSample, computeRmsVariance, disambiguateVibesKeyboard; MAX_CONFIDENCE=0.5 cap with Nyquist comment
- `src/audio/HornSectionDisambiguator.ts` — DISC-03: disambiguateHornSection; CALIBRATION_NEEDED centroid table, proximity/high-activity penalties, weight floor/ceiling clamp

## Decisions Made

- Confidence capped at 0.5 for VibesKeyboard — tremolo at 10fps sits near Nyquist (5 Hz), and motor-off vibes are acoustically indistinguishable. Capping is a principled honesty bound.
- RMS variance normalization denominator set to 1.0 with CALIBRATION_NEEDED annotation — arbitrary before empirical measurement.
- Horn centroid expected values {900, 1400, 2250 Hz} are acoustic literature estimates, all marked CALIBRATION_NEEDED for a future tuning pass.
- `disambiguateHornSection` returns empty weights (not equal weights) at confidence 0 when < 3 horns — caller should skip weight application entirely in that case.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- DISC-02 and DISC-03 complete. All four disambiguation pairs now have implementations:
  - DISC-01 (KB/Guitar): KbGuitarDisambiguator (existing)
  - DISC-02 (Vibes/Keyboard): VibesKeyboardDisambiguator (this plan)
  - DISC-03 (Horn Section): HornSectionDisambiguator (this plan)
  - DISC-04 (Trombone/Bass): TromboneBassDisambiguator (Plan 03)
- Ready for 12-05 integration plan that wires all four disambiguators into AnalysisTick
- Calibration pass needed before production use: search for CALIBRATION_NEEDED across all four disambiguators

---
*Phase: 12-disambiguation-engine*
*Completed: 2026-03-12*
