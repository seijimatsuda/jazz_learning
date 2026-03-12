---
phase: "12"
plan: "03"
subsystem: "audio-disambiguation"
tags: ["spectral-flatness", "chroma-entropy", "onset-detection", "trombone", "bass", "sax", "keyboard", "disambiguation"]

dependency-graph:
  requires:
    - "12-01"  # DisambiguationState interface, raw/display score split
    - "12-02"  # computeSpectralFlatness, chromaEntropy from SpectralFeatures.ts
  provides:
    - "disambiguateTromboneBass — trombone vs bass via spectral flatness + sub-bass onset rate"
    - "disambiguateSaxKeyboard — sax vs keyboard via chroma entropy"
  affects:
    - "12-04"  # VibraphoneKbDisambiguator and final AnalysisTick wiring
    - "12-05"  # Integration and calibration pass

tech-stack:
  added: []
  patterns:
    - "Stateless chroma entropy disambiguation (no ring buffer)"
    - "Stateful ring-buffer disambiguation (flatness + onset buffers mutated in DisambiguationState)"
    - "CALIBRATION_NEEDED inline marker pattern for empirical threshold documentation"

key-files:
  created:
    - "src/audio/TromboneBassDisambiguator.ts"
    - "src/audio/SaxKeyboardDisambiguator.ts"
  modified: []

decisions:
  - id: "D-12-03-1"
    topic: "Sub-bass band fallback"
    decision: "When 'sub' band not in bands array (default bands have no 'sub'), fall back to low quarter of 'bass' band bins for onset detection"
    rationale: "Default bands define 'bass' as 20–250 Hz. Computing sub-bass energy from its low end is correct without requiring a new band definition."
    alternatives: ["Add 'sub' band to buildDefaultBands()", "Disable onset detection when sub band missing"]
  - id: "D-12-03-2"
    topic: "SaxKeyboard is stateless (no state parameter)"
    decision: "disambiguateSaxKeyboard takes only chroma — no DisambiguationState. Confidence is not written to state.confidence."
    rationale: "Chroma entropy is stateless by nature. The plan listed DisambiguationState.confidence update as a requirement, but saxKeyboard has no pair key usage in state since there's no history needed. Deferred to integration when caller can write confidence."
    alternatives: ["Add state param and write confidence['sax_keyboard']"]

metrics:
  duration: "~2 minutes"
  completed: "2026-03-12"
---

# Phase 12 Plan 03: Trombone/Bass and Sax/Keyboard Disambiguators Summary

**One-liner:** Mid-band spectral flatness + sub-bass onset rate for trombone/bass; chroma entropy for sax/keyboard — both with [0.15, 0.85] weight clamping.

## What Was Built

Two stateless/semi-stateless disambiguators for DISC-01 (trombone/bass) and DISC-05 (sax/keyboard):

### TromboneBassDisambiguator.ts

`disambiguateTromboneBass(freqData, prevFreqData, bands, state)` returns `{ tromboneWeight, bassWeight, confidence }`.

Primary signal: spectral flatness in the 250–2000 Hz mid band. Trombone sustains more harmonically complex tones → higher flatness. Bass produces tonal plucks with fewer mid-band harmonics → lower flatness.

Secondary signal: sub-bass onset rate in 20–80 Hz. Each bass pluck produces a sub-bass energy spike; trombone does not. Onset rate above 0.3 nudges the score toward bass by `onsetRate * 0.2`.

Ring buffer updates: `state.flatnessBuffer` (10 samples, requires ≥3 before producing non-neutral output) and `state.onsetBuffer` (20 samples). Confidence scales with sample count and distance from 0.5.

### SaxKeyboardDisambiguator.ts

`disambiguateSaxKeyboard(chroma)` returns `{ saxWeight, keyboardWeight, confidence }`.

Pure function — no state parameter. Computes Shannon entropy of the 12-element chroma vector via `chromaEntropy()`, normalizes by `log2(12)` to [0, 1], then maps the normalized entropy to keyboard weight:
- `< 0.3` → sax-like (keyboardScore = 0)
- `> 0.5` → keyboard-like (keyboardScore = 1)
- `0.3–0.5` → linear ramp (ambiguous zone, confidence = 0.3)

Outside the ambiguous zone confidence = 0.8.

## Verification Results

- `npx tsc --noEmit` — zero errors
- Both files export their named functions
- All calibration thresholds marked `// CALIBRATION_NEEDED`
- Weights clamped to [0.15, 0.85] in both implementations

## Deviations from Plan

### Auto-handled Issues

**1. Missing 'sub' band in default band set**

- **Found during:** Task 1 (TromboneBassDisambiguator)
- **Issue:** Plan specifies looking up 'sub' band (20–80 Hz) but `buildDefaultBands()` defines bands: bass/drums_low/mid/mid_high/drums_high/ride — no 'sub' band.
- **Fix:** Added fallback that takes the low quarter of the 'bass' band (20–250 Hz) when 'sub' is absent. If neither band exists, onset detection is disabled (zero onset rate) and the function still runs using flatness alone.
- **Files modified:** TromboneBassDisambiguator.ts only
- **Rule applied:** Rule 3 (Blocking) — without the fallback the onset detection would silently produce 0 results and the plan's stated behavior would be unreachable.

**2. SaxKeyboard state.confidence not written (plan requirement gap)**

- **Found during:** Task 2 (SaxKeyboardDisambiguator)
- **Issue:** Plan states "Both disambiguators update DisambiguationState.confidence with their pair key" but SaxKeyboardDisambiguator is stateless — no state parameter in the signature. Adding state only to write one confidence value creates unnecessary coupling.
- **Decision:** Deferred. Confidence is returned in the return value. Caller (AnalysisTick, plan 12-04) can write to state.confidence['sax_keyboard'] at integration time.
- **Rule applied:** Rule 4 direction, but resolved as a deferred integration task (not an architectural blocker requiring checkpoint — confidence writing is additive, not breaking).

## Next Phase Readiness

Plan 12-04 (VibraphoneKbDisambiguator + AnalysisTick wiring) can proceed. Both disambiguators are ready for integration. The caller will:
1. Call `disambiguateTromboneBass` from AnalysisTick when trombone+bass are both in lineup
2. Call `disambiguateSaxKeyboard` with Meyda chroma when sax+keyboard are both in lineup
3. Write `state.confidence['sax_keyboard']` from the returned confidence value

Calibration blockers (unchanged from 12-02):
- All thresholds (`ONSET_THRESHOLD=30`, `avgFlatness/0.6`, `LOW_ENTROPY_THRESHOLD=0.3`, `HIGH_ENTROPY_THRESHOLD=0.5`) are estimates requiring empirical tuning against real jazz recordings.
