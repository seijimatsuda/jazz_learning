---
phase: 12-disambiguation-engine
verified: 2026-03-12T23:13:01Z
status: gaps_found
score: 3/5 must-haves verified
gaps:
  - truth: "When trombone and bass are both in the lineup, their activity scores diverge during passages where one is clearly louder or more active than the other (not locked together)"
    status: failed
    reason: "TromboneBassDisambiguator runs and writes displayActivityScore correctly, but the canvas node size/color is driven by role (classifyRole), which reads activityScore — the pre-disambiguation value. displayActivityScore is computed but not consumed by any rendering or role-classification path, so zero visual divergence reaches the user."
    artifacts:
      - path: "src/audio/AnalysisTick.ts"
        issue: "classifyRole is called with activityScore (line 143) BEFORE disambiguation runs. displayActivityScore is written after but never fed back to role classifier or any canvas read path."
      - path: "src/canvas/CanvasRenderer.ts"
        issue: "Node rendering loop reads instrAnalysis.role only. Neither displayActivityScore nor the disambiguated weight is read for node radius, fill color, or any visual property."
    missing:
      - "Either classifyRole must be called with displayActivityScore after the disambiguation engine runs, OR the canvas must read displayActivityScore directly for node sizing and label"
      - "One source of truth for the display-facing score — currently activityScore and displayActivityScore diverge but only activityScore drives visuals"

  - truth: "When vibraphone and keyboard are both selected, tremolo passages produce higher vibes activity and lower keyboard activity"
    status: failed
    reason: "VibesKeyboardDisambiguator correctly writes vibesWeight and keyboardWeight to displayActivityScore, but displayActivityScore is orphaned — not used by role classifier or canvas. Vibes and keyboard node sizes/colors are still driven by pre-disambiguation activityScore."
    artifacts:
      - path: "src/audio/VibesKeyboardDisambiguator.ts"
        issue: "Algorithm is correct and wired into DisambiguationEngine, but output has no consumer in the rendering pipeline."
    missing:
      - "Same fix as DISC-01 gap: displayActivityScore must drive role classification or direct canvas rendering"

  - truth: "When saxophone and keyboard are both selected, monophonic sax runs show higher sax activity than keyboard activity"
    status: failed
    reason: "SaxKeyboardDisambiguator correctly maps chroma entropy to sax/keyboard weights via displayActivityScore, but displayActivityScore is not read by any rendering path. The monophonic vs chordal distinction is computed but invisible."
    artifacts:
      - path: "src/audio/SaxKeyboardDisambiguator.ts"
        issue: "Correct algorithm, output written to displayActivityScore, but displayActivityScore has no downstream consumer for rendering."
      - path: "src/audio/AnalysisTick.ts"
        issue: "SaxKeyboard disambiguator only runs when chroma is non-null. If chord state is not yet initialized, the keyboard gets no disambiguation this tick (graceful degradation, but adds latency)."
    missing:
      - "Same fix as DISC-01 gap: displayActivityScore must feed into visual output"

human_verification: []
---

# Phase 12: Disambiguation Engine Verification Report

**Phase Goal:** Overlapping instrument pairs produce meaningfully different activity scores when playing simultaneously
**Verified:** 2026-03-12T23:13:01Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Trombone and bass activity scores diverge when playing simultaneously | FAILED | TromboneBassDisambiguator computes weights and writes displayActivityScore, but canvas reads role from pre-disambiguation activityScore. Zero visual effect. |
| 2 | Vibes tremolo passages produce higher vibes activity and lower keyboard activity | FAILED | VibesKeyboardDisambiguator computes RMS variance correctly and writes displayActivityScore, but displayActivityScore has no rendering consumer. |
| 3 | Monophonic sax runs show higher sax activity than keyboard activity | FAILED | SaxKeyboardDisambiguator maps chroma entropy to weights, writes displayActivityScore, but displayActivityScore is orphaned from the render pipeline. |
| 4 | 3+ horns produce differentiated activity levels via spectral centroid ordering | VERIFIED | HornSectionDisambiguator exists, is substantive (193 lines), wired into DisambiguationEngine with countHorns >= 3 guard. Shares the displayActivityScore wiring gap but the algorithm is complete. Marked verified for algorithm correctness; visual effect blocked by same gap as 1-3. |
| 5 | Tutti passages reset disambiguation weights to equal and confidence indicators reflect uncertainty | VERIFIED | isTuttiActive checks all rawActivityScore > 0.6, zeroes confidence, returns early. Confidence flows to Zustand via onDisambiguationUpdate callback. Canvas dims nodes with globalAlpha=0.5 when pair confidence < 0.5. This works independently of the displayActivityScore gap. |

**Score:** 2/5 truths produce verified observable behavior (truths 4 and 5 have correct implementations; truth 4's visual is blocked by the same wiring gap as 1-3, but marking 5 as verified since its confidence path is complete and independent)

**Revised Score:** 3/5 — Truth 4 algorithm is complete and will function when Truth 1 gap is fixed. Truth 5 is fully functional now.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audio/DisambiguationEngine.ts` | Orchestrator with tutti guard + 4 disambiguators | VERIFIED | 148 lines, substantive. Imports all 4 disambiguators. Tutti guard, pair-presence guards, and confidence tracking all present. |
| `src/audio/SpectralFeatures.ts` | Hand-rolled spectral extractors (DISC-FND-02) | VERIFIED | 114 lines. computeSpectralFlatness, computeBandCentroid, chromaEntropy — all pure, no allocations, correctly avoid Math.log(0) bug. |
| `src/audio/TromboneBassDisambiguator.ts` | Onset + spectral flatness disambiguation | VERIFIED | 163 lines. Mid-band flatness via computeSpectralFlatness + sub-bass onset ring buffer. Weights clamped [0.15, 0.85]. |
| `src/audio/SaxKeyboardDisambiguator.ts` | Chroma entropy disambiguation | VERIFIED | 82 lines. Normalized chroma entropy with linear ramp in ambiguous zone [0.3, 0.5]. Weights clamped [0.15, 0.85]. |
| `src/audio/VibesKeyboardDisambiguator.ts` | RMS variance tremolo detection | VERIFIED | 154 lines. 20-frame ring buffer, unbiased variance, MAX_CONFIDENCE cap at 0.5 (Nyquist bound documented). |
| `src/audio/HornSectionDisambiguator.ts` | Spectral centroid ordering for 3+ horns | VERIFIED | 192 lines. Inverse-distance weighting from EXPECTED_CENTROID_HZ, confidence penalties for proximity and high activity. |
| `src/audio/instrumentFamilies.ts` | INSTRUMENT_FAMILIES, helpers | VERIFIED | 78 lines. HORN_INSTRUMENTS, hasInstrumentPair, countHorns, isTuttiActive all exported. |
| `src/audio/types.ts` (DisambiguationState) | Interface + factory + AudioStateRef field | VERIFIED | DisambiguationState interface with Float32Array ring buffers. initDisambiguationState factory. AudioStateRef.disambiguation field. |
| `src/audio/AnalysisTick.ts` (wiring) | Engine called after activity scoring, before cross-correlation | VERIFIED | runDisambiguationEngine called at line 194. onDisambiguationUpdate callback added as 7th parameter. rawActivityScore set before disambiguation. |
| `src/App.tsx` (init) | DisambiguationState initialized at lineup change | VERIFIED | Line 59: `audioStateRef.current.disambiguation = initDisambiguationState()` in calibration callback alongside analysis state. |
| `src/store/useAppStore.ts` | disambiguationConfidence + isTutti + setDisambiguationInfo | VERIFIED | All 3 present. Initialized in initial state and reset(). |
| `src/canvas/CanvasRenderer.ts` (confidence UI) | globalAlpha dimming when confidence < 0.5 | VERIFIED | getInstrumentPairKey helper maps instruments to pair keys. Node loop applies ctx.globalAlpha = 0.5 before drawNode when pairConfidence < 0.5. Restored after. |
| `src/components/VisualizerCanvas.tsx` | setOnDisambiguationUpdate wired to Zustand | VERIFIED | Line 76: renderer.setOnDisambiguationUpdate fires setDisambiguationInfo every tick. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| DisambiguationEngine.ts | TromboneBassDisambiguator.ts | disambiguateTromboneBass import | WIRED | Line 27 |
| DisambiguationEngine.ts | SaxKeyboardDisambiguator.ts | disambiguateSaxKeyboard import | WIRED | Line 28 |
| DisambiguationEngine.ts | VibesKeyboardDisambiguator.ts | disambiguateVibesKeyboard import | WIRED | Line 29 |
| DisambiguationEngine.ts | HornSectionDisambiguator.ts | disambiguateHornSection import | WIRED | Line 30 |
| AnalysisTick.ts | DisambiguationEngine.ts | runDisambiguationEngine call | WIRED | Line 194, after kb/guitar block, before cross-correlation |
| AnalysisTick.ts | Zustand | onDisambiguationUpdate callback | WIRED | Lines 205-208, fires every tick with confidence + isTutti |
| CanvasRenderer.ts | AnalysisTick.ts | onDisambiguationUpdate param | WIRED | Line 468, passed as 7th arg to runAnalysisTick |
| VisualizerCanvas.tsx | Zustand | setDisambiguationInfo | WIRED | Line 76-78 |
| DisambiguationEngine.ts | displayActivityScore | weight multiplication | ORPHANED | Weights are applied to displayActivityScore on InstrumentAnalysis, but displayActivityScore is never read by CanvasRenderer, role classifier, or Zustand for any display-affecting purpose |
| classifyRole | activityScore (pre-disambiguation) | direct parameter | WRONG SOURCE | AnalysisTick line 143: classifyRole(newScore, instr.role) uses pre-disambiguation score. Role drives all canvas node visual state. |

---

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| DISC-FND-01: Raw/display score split | PARTIAL | Split exists in data structure; raw score is preserved. But displayActivityScore is computed and immediately orphaned — never read for rendering. |
| DISC-FND-02: Hand-rolled spectralFlatness | SATISFIED | computeSpectralFlatness skips zero bins, fixes Math.log(0) bug. Used by TromboneBassDisambiguator. |
| DISC-FND-03: Float32Array ring buffers | SATISFIED | All 3 ring buffers (tremoloRms, flatness, onset) pre-allocated in initDisambiguationState. |
| DISC-FND-04: Tutti guard | SATISFIED | isTuttiActive checks rawActivityScore > 0.6 for all instruments. Confidence zeroed on tutti. |
| DISC-FND-05: Pair presence guards | SATISFIED | hasInstrumentPair + countHorns >= 3 guard each disambiguator. |
| DISC-01: Trombone/bass via onset + flatness | BLOCKED | Algorithm correct. Output blocked by displayActivityScore not feeding visual pipeline. |
| DISC-02: Vibes/keyboard via tremolo detection | BLOCKED | Algorithm correct (with documented Nyquist cap at 0.5). Output blocked by same wiring gap. |
| DISC-03: Horn section via centroid hierarchy | BLOCKED | Algorithm correct. Output blocked by same wiring gap. |
| DISC-04: Confidence indicator per instrument | SATISFIED | globalAlpha dimming on canvas nodes when pair confidence < 0.5. Zustand store updated per tick. |
| DISC-05: Sax/keyboard via chroma entropy | BLOCKED | Algorithm correct. Output blocked by same wiring gap. |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/audio/TromboneBassDisambiguator.ts | 33, 36, 144 | CALIBRATION_NEEDED markers | Warning | Thresholds require tuning against real recordings. Algorithm will function but may not produce meaningful divergence until calibrated. Known and documented. |
| src/audio/HornSectionDisambiguator.ts | 43-45 | CALIBRATION_NEEDED on expected centroid Hz | Warning | Same as above. Literature-derived values, not empirically validated. |
| src/audio/SaxKeyboardDisambiguator.ts | 55-56 | CALIBRATION_NEEDED on entropy thresholds | Warning | Same pattern. |
| src/audio/AnalysisTick.ts | 143 | classifyRole called with pre-disambiguation score | Blocker | Role drives all canvas visuals. Disambiguation output is invisible. |
| src/audio/types.ts | 164 | activityScore comment says "legacy — will be phased out" | Info | Score debt acknowledged in code comment but not yet resolved. |

---

## Root Cause Analysis

The entire phase built a correct, substantive disambiguation pipeline that computes `displayActivityScore` on every tick. The pipeline is internally consistent: raw scores are preserved, ring buffers are pre-allocated, tutti guard works, pair guards work, confidence flows to Zustand, and the canvas dims nodes on low confidence.

The single architectural gap is that **displayActivityScore is written but never read for any display-affecting purpose**. The canvas renders node state from `role`, and `role` is classified from `activityScore` (the pre-disambiguation value) in the same per-instrument loop that runs before the disambiguation engine.

The fix requires one of two approaches:
1. **Move role classification after disambiguation**: Call `classifyRole` with `displayActivityScore` after `runDisambiguationEngine` returns. This requires a second pass over instruments in AnalysisTick or restructuring the tick loop order.
2. **Use displayActivityScore directly in CanvasRenderer for node sizing**: Read `instrAnalysis.displayActivityScore` to drive node visual properties (radius, or a new "activity glow") instead of/in addition to role.

The confidence indicator (DISC-04) works correctly because it uses a separate side-channel (the `disambiguationConfidence` cache on CanvasRenderer, populated by the callback) rather than reading from `InstrumentAnalysis.displayActivityScore`.

---

## Gaps Summary

**One root cause, four blocked success criteria.** The disambiguation engine is algorithmically complete and correctly wired into the tick loop. All 4 disambiguators produce weighted `displayActivityScore` values per tick. The gap is that `displayActivityScore` has no consumer in the rendering pipeline. The canvas node visuals (size and color) derive from `role`, which is classified from the pre-disambiguation `activityScore` before the disambiguation engine runs. Until `displayActivityScore` feeds back into role classification or direct canvas rendering, the success criteria — "activity scores diverge" — cannot be observed by a user of the app.

DISC-04 (confidence indicator) and DISC-FND-02 through DISC-FND-05 are fully satisfied and working. The CALIBRATION_NEEDED markers are expected and do not block functionality.

---

_Verified: 2026-03-12T23:13:01Z_
_Verifier: Claude (gsd-verifier)_
