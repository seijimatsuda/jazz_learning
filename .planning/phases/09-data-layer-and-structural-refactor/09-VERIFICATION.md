---
phase: 09-data-layer-and-structural-refactor
verified: 2026-03-12T05:20:11Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "All 28 possible instrument pairs have defined edge type entries (no silent fallback to a default)"
    status: partial
    reason: "All 28 entries exist in EDGE_TYPE, satisfying the count requirement. However drawCommunicationEdges.ts line 150 contains `?? 'support'` — a silent fallback to 'support' if any key is missing. The fallback contradicts the success criterion's parenthetical 'no silent fallback to a default' but does not cause a crash. The 28-entry count means the fallback will never trigger at runtime for valid lineups, making this partial rather than failed."
    artifacts:
      - path: "src/canvas/edges/drawCommunicationEdges.ts"
        issue: "Line 150: `const edgeType = EDGE_TYPE[key] ?? 'support';` — fallback exists even though 28 entries cover all valid pairs"
    missing:
      - "Strictly speaking, the criterion 'no silent fallback' is not satisfied by code structure even though it is satisfied by data completeness. If the criterion means 'runtime behavior never falls back', it passes. If it means 'the fallback operator must be absent from code', it fails."

  - truth: "INST-08 requirement satisfied — saxophone and keyboard are disambiguated via chroma entropy when both present"
    status: failed
    reason: "REQUIREMENTS.md defines INST-08 as 'Saxophone and keyboard are disambiguated via chroma entropy when both present'. The codebase only implements keyboard/guitar disambiguation (KbGuitarDisambiguator.ts). No saxophone/keyboard chroma-entropy disambiguation exists. NOTE: The ROADMAP attributed INST-08 to plan 09-03 with a different meaning (canvas PAIRS IIFE fix), creating a mismatch between the requirement definition and its phase attribution. The canvas crash site was fixed; the requirement as written was not."
    artifacts:
      - path: "src/audio/AnalysisTick.ts"
        issue: "Lines 152-176: only keyboard/guitar disambiguation runs; no saxophone/keyboard disambiguation path exists"
      - path: "src/audio/KbGuitarDisambiguator.ts"
        issue: "Module is scoped to keyboard/guitar only — filename confirms scope"
    missing:
      - "A disambiguation mechanism for saxophone + keyboard when both are in the lineup"
      - "OR: explicit decision that INST-08 is intentionally deferred (the requirement definition and roadmap attribution are in conflict)"
---

# Phase 9: Data Layer and Structural Refactor — Verification Report

**Phase Goal:** The analysis and render pipeline correctly handles any lineup of 2-8 instruments without crashing or silently failing
**Verified:** 2026-03-12T05:20:11Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A lineup of any 8-instrument combination compiles with no TypeScript errors | VERIFIED | `npx tsc --noEmit` produces zero output (clean) |
| 2 | The canvas does not crash for any instrument count from 2 to 8 | VERIFIED | `computeNodePositions` handles `case 2` through `case 8`; `CanvasRenderer` constructor derives all state from lineup parameter; no hardcoded count |
| 3 | The pocket line does not throw when bass or drums is absent | VERIFIED | CanvasRenderer lines 440-442: `bassIdx >= 0 && drumsIdx >= 0` guard before `drawPocketLine`; constructor lines 159-163: `bass_drums` edgeAnimState created only when both present |
| 4 | The analysis pipeline initializes only instruments in the active lineup — no phantom scoring | VERIFIED | `initAnalysisState` maps `lineup.map(name => ...)` — only provided names are allocated; App.tsx initializes pitch state via `lineup.filter(inst => inst !== 'drums')` loop |
| 5 | All 28 possible instrument pairs have defined edge type entries (no silent fallback) | PARTIAL | EDGE_TYPE has exactly 28 entries covering all C(8,2) pairs; however `drawCommunicationEdges.ts:150` retains `?? 'support'` fallback — the data is complete but the code path for "no fallback" exists |

**Score:** 4/5 truths fully verified (Truth 5 is partial; INST-08 as defined in REQUIREMENTS.md is not implemented)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audio/InstrumentActivityScorer.ts` | InstrumentName union with 8 members, INSTRUMENT_BAND_MAP, MID_RANGE_INSTRUMENTS, resolveBandsForInstrument | VERIFIED | Line 23: 8-member union. Lines 36-45: all 8 entries in BAND_MAP. Lines 52-54: MID_RANGE_INSTRUMENTS Set. Lines 67-86: generalized resolveBandsForInstrument |
| `src/audio/types.ts` | PitchAnalysisState with `instruments: Record<string, InstrumentPitchState>` | VERIFIED | Lines 109-111: `instruments: Record<string, InstrumentPitchState>` — no more fixed keyboard/guitar fields |
| `src/canvas/edges/edgeTypes.ts` | 28 EDGE_TYPE entries covering all instrument pairs | VERIFIED | Grep count confirms exactly 28 key:value pairs in EDGE_TYPE object |
| `src/canvas/nodes/NodeLayout.ts` | computeNodePositions handles 2-8, buildPairs utility, PairTuple type exported | VERIFIED | Switch cases 2-8 all present with pre-computed positions. PairTuple and buildPairs exported. |
| `src/canvas/edges/drawCommunicationEdges.ts` | pairs as parameter (no IIFE), uses EDGE_TYPE | VERIFIED | No module-level IIFE. `pairs: PairTuple[]` is explicit parameter. Line 150 reads EDGE_TYPE. |
| `src/canvas/CanvasRenderer.ts` | Accepts lineup parameter, derives all state from lineup | VERIFIED | Constructor takes `lineup: string[]`, uses it to compute nodePositions, nodeAnimStates, pairs, edgeAnimStates |
| `src/components/VisualizerCanvas.tsx` | Reads lineup from Zustand, passes to CanvasRenderer | VERIFIED | Line 35: `useAppStore.getState().lineup`; line 38: `new CanvasRenderer(canvas, audioStateRef, lineup)` |
| `src/components/BandSetupPanel.tsx` | Shows all 8 instruments with icons and labels | VERIFIED | AVAILABLE_INSTRUMENTS array has all 8. INSTRUMENT_ICONS and BAND_LABELS cover all 8. |
| `src/audio/AnalysisTick.ts` | Iterates pitch.instruments record dynamically | VERIFIED | Line 311: `Object.entries(state.pitch.instruments)` loop |
| `src/App.tsx` | Initializes pitch for all melodic instruments (non-drums) | VERIFIED | Lines 72-79: filters lineup to exclude drums, initializes pitchState for each remaining instrument |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `VisualizerCanvas.tsx` | `CanvasRenderer` | `new CanvasRenderer(canvas, audioStateRef, lineup)` | WIRED | Lineup from Zustand flows to renderer at construction |
| `CanvasRenderer` | `drawCommunicationEdges` | `this.pairs` built by `buildPairs(lineup)` | WIRED | Pairs computed at construction, passed as parameter each frame |
| `CanvasRenderer` | `drawPocketLine` | `indexOf('bass') >= 0 && indexOf('drums') >= 0` guard | WIRED | Guard prevents call when rhythm section absent |
| `App.tsx` | `initAnalysisState` | `lineup` from Zustand passed at calibration time | WIRED | Lines 54-55: lineup retrieved from store, passed to initAnalysisState |
| `App.tsx` | `PitchAnalysisState` | `melodicInstruments.filter(...)` loop | WIRED | Lines 72-79: dynamic instrument record built, assigned to `audioStateRef.current.pitch` |
| `AnalysisTick.ts` | `PitchAnalysisState.instruments` | `Object.entries(state.pitch.instruments)` | WIRED | Line 311: iterates all entries in the record |
| `AnalysisTick.ts` | call-response | `kbPitch && gtPitch` presence check | WIRED | Lines 329-346: guarded by both keyboard and guitar being present in pitch record |

---

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| INST-01: User can select saxophone in lineup | SATISFIED | BandSetupPanel AVAILABLE_INSTRUMENTS includes 'saxophone' |
| INST-02: User can select trumpet in lineup | SATISFIED | BandSetupPanel AVAILABLE_INSTRUMENTS includes 'trumpet' |
| INST-03: User can select trombone in lineup | SATISFIED | BandSetupPanel AVAILABLE_INSTRUMENTS includes 'trombone' |
| INST-04: User can select vibraphone in lineup | SATISFIED | BandSetupPanel AVAILABLE_INSTRUMENTS includes 'vibes' |
| INST-05: New instruments have defined frequency band mappings | SATISFIED | INSTRUMENT_BAND_MAP entries for saxophone, trumpet, trombone, vibes all present |
| INST-06: Calibration pass adapts to 2-8 instruments | SATISFIED | Summary confirms CalibrationPass operates per-band, not per-instrument — lineup-agnostic by design |
| INST-07: Role classification works for all 8 instrument types | SATISFIED | `classifyRole` is generic — operates on `activityScore` independent of instrument name |
| INST-08: Saxophone and keyboard disambiguated via chroma entropy | NOT SATISFIED | REQUIREMENTS.md definition: "Saxophone and keyboard are disambiguated via chroma entropy when both present." No such disambiguation exists. Only keyboard/guitar disambiguation (KbGuitarDisambiguator.ts) is implemented. ROADMAP attributed a different deliverable (canvas PAIRS fix) to INST-08, creating a definition/attribution mismatch. |
| BAND-03: Analysis pipeline initializes with only selected instruments | SATISFIED | `initAnalysisState(lineup, fftSize)` maps only the provided lineup array |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/canvas/edges/drawCommunicationEdges.ts` | 150 | `EDGE_TYPE[key] ?? 'support'` fallback | Warning | No runtime impact for valid 8-instrument lineups; silent safety net that could mask future bugs if a new instrument is added to InstrumentName without updating EDGE_TYPE |

---

### Human Verification Required

None — all critical behaviors are verifiable structurally. The TypeScript compiler passing is the authoritative check for Truth 1. The guard patterns are readable from source code. Runtime visual behavior (canvas rendering at 8 instruments) may warrant a smoke test but is not required to confirm goal achievement.

---

### Gaps Summary

**Truth 5 — EDGE_TYPE fallback exists in code:** All 28 pairs are present in the data, satisfying the runtime behavior requirement. The `?? 'support'` operator on line 150 of drawCommunicationEdges.ts is a code-level defense that technically contradicts the success criterion's "no silent fallback to a default" language. This is a warning-level finding, not a blocker, because no valid lineup will trigger the fallback.

**INST-08 — Saxophone/keyboard disambiguation not implemented:** The requirement as written in REQUIREMENTS.md ("Saxophone and keyboard are disambiguated via chroma entropy when both present") has no corresponding code. The ROADMAP incorrectly attributed the canvas PAIRS IIFE fix to the INST-08 ticket. This creates a genuine gap: two instruments that share the `mid` band (keyboard: 250-2000 Hz, saxophone: 250-2000 Hz) have no disambiguation mechanism when both appear in the lineup. This may be intentional deferral but is not documented as such.

**Recommended action:** Clarify INST-08 — either implement saxophone/keyboard disambiguation or mark it as explicitly deferred to a later phase and update REQUIREMENTS.md accordingly.

---

_Verified: 2026-03-12T05:20:11Z_
_Verifier: Claude (gsd-verifier)_
