---
phase: 03-chord-detection-harmonic-analysis
verified: 2026-03-11T03:58:09Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Chord name format — TYPE_DISPLAY map added, displayName now produces 'C', 'Cm', 'G7' etc."
    - "Tension staleness — onTensionUpdate callback fires every tick, wired CanvasRenderer → Zustand setTension"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Load a jazz file with clear tonal sections, confirm chord name for a known chord passage"
    expected: "Display shows jazz-standard symbols: 'Cmaj7', 'Cm7', 'G7', 'C' (plain major), 'Cm' (plain minor) — not 'Cmajor', 'Cminor', 'Gdom7'"
    why_human: "Requires audio playback and musical ear judgment — chroma extraction accuracy cannot be verified programmatically"
  - test: "Play back a file and observe the ChordDisplay tension number and the vertical canvas meter simultaneously"
    expected: "Both the React text number and the canvas bar rise and fall in sync, continuously — no freezing between chord changes"
    why_human: "Dynamic rendering behavior requires visual observation during playback"
  - test: "Load a file without pressing play, check the Timeline scrubber immediately after calibration completes"
    expected: "Colored horizontal bands (blue through red) visible across the full scrubber before any playback"
    why_human: "Visual rendering check — data flow is verified structurally but visual presence requires eyes-on confirmation"
---

# Phase 3: Chord Detection and Harmonic Analysis — Verification Report

**Phase Goal:** Users see the current chord name with confidence indicator and a smooth harmonic tension score that rises and falls with the music's harmonic movement
**Verified:** 2026-03-11T03:58:09Z
**Status:** passed
**Re-verification:** Yes — after gap closure (previous score 3/5, now 5/5)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Chord display updates to a recognizable jazz chord name (maj7, m7, dom7, dim7, m7b5, alt) that a musician would agree with | VERIFIED | TYPE_DISPLAY map at AnalysisTick.ts:45-48 converts major→'', minor→'m', dom7→'7'; displayName built as `${tmpl.root}${TYPE_DISPLAY[tmpl.type] ?? tmpl.type}` at line 221 — produces 'C', 'Cm', 'G7', 'Cmaj7' etc. |
| 2 | Low-confidence detections show chord family ("dominant chord") rather than a specific name | VERIFIED | FAMILY_LABELS map at lines 50-55; applied at line 218 when confidence==='low'; produces 'dominant chord', 'minor chord', 'altered chord' |
| 3 | Harmonic tension score (0.0–1.0) moves smoothly without flicker, visibly higher on dominant/altered chords — canvas TensionMeter | VERIFIED | LERP_RATE=0.05 in TensionScorer.ts; TensionMeter reads state.tension.currentTension from ref on every rAF frame |
| 3b | Tension score in ChordDisplay React overlay updates smoothly every tick | VERIFIED | onTensionUpdate callback fires unconditionally every tick at AnalysisTick.ts:229-231; wired through CanvasRenderer.setOnTensionUpdate → VisualizerCanvas line 46-48 → useAppStore.getState().setTension(tension) |
| 4 | Vertical tension meter with blue→amber→orange→red gradient and 3-second ghost line is visible and updating | VERIFIED | TensionMeter.ts: GRADIENT_STOPS with correct colors at line 20; getGhostTension() with GHOST_OFFSET=30 (3s at 10fps); wired in CanvasRenderer.ts lines 229-230 |
| 5 | Pre-computed tension heatmap on timeline is visible on file load, before playback | VERIFIED | computeTensionHeatmap called in App.tsx after calibration; stored on audioStateRef.tensionHeatmap; Timeline.tsx lines 135-152 renders colored segments via Array.from; heatmapVersion key forces re-render after compute |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audio/types.ts` | ChordFunction, ChordState, TensionState; AudioStateRef.chord, AudioStateRef.tension | VERIFIED | All types present — unchanged from initial verification |
| `src/audio/ChordDetector.ts` | 96 templates, Meyda chroma, bass weighting, smoothing, flicker prevention | VERIFIED | 362 lines; 96 templates; HOLD_TICKS=2 — unchanged |
| `src/audio/TensionScorer.ts` | LERP smoothing, ring buffer, getGhostTension | VERIFIED | 112 lines; LERP_RATE=0.05; GHOST_OFFSET=30 — unchanged |
| `src/audio/TensionHeatmap.ts` | Per-second chroma→chord function→tension; pre-computed on load | VERIFIED | 197 lines; computeTensionHeatmap and tensionToColor exported — unchanged |
| `src/audio/AnalysisTick.ts` | TYPE_DISPLAY map for jazz notation; onTensionUpdate fired every tick | VERIFIED | TYPE_DISPLAY at lines 45-48 (gap 1 closed); onTensionUpdate fires unconditionally at lines 229-231 (gap 2 closed) |
| `src/canvas/TensionMeter.ts` | Gradient bar, ghost line, no per-frame allocations | VERIFIED | 185 lines; off-DOM gradient canvas; ghost line rendered — unchanged |
| `src/canvas/CanvasRenderer.ts` | onTensionUpdate field and setOnTensionUpdate method; passes to runAnalysisTick | VERIFIED | onTensionUpdate field at line 81; setOnTensionUpdate method at line 153; passed into runAnalysisTick at line 230 |
| `src/components/ChordDisplay.tsx` | Confidence badge, function label, tension readout | VERIFIED | 124 lines; tension number now receives per-tick updates via Zustand |
| `src/store/useAppStore.ts` | currentChord, chordConfidence, chordFunction, currentTension fields + setTension | VERIFIED | All fields and setTension action present — unchanged |
| `src/App.tsx` | ChordDisplay integrated, initChordDetector/initChordState/initTensionState called | VERIFIED | All 3 init calls after calibration; ChordDisplay placed correctly — unchanged |
| `src/components/Timeline.tsx` | Heatmap rendered as colored segments | VERIFIED | Lines 135-152: tensionHeatmap segments rendered — unchanged |
| `src/components/VisualizerCanvas.tsx` | setOnTensionUpdate wired to Zustand setTension | VERIFIED | Lines 45-48: renderer.setOnTensionUpdate((tension) => useAppStore.getState().setTension(tension)) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| AnalysisTick.ts | TYPE_DISPLAY map | displayName = `${root}${TYPE_DISPLAY[type]}` | WIRED | Line 221 — gap 1 closed |
| AnalysisTick.ts | onTensionUpdate callback | Called unconditionally every tick | WIRED | Lines 229-231 — gap 2 closed |
| CanvasRenderer.ts | onTensionUpdate field | setOnTensionUpdate stores cb; passed to runAnalysisTick | WIRED | Lines 81, 153, 230 |
| VisualizerCanvas.tsx | useAppStore.setTension | renderer.setOnTensionUpdate → setTension | WIRED | Lines 45-48 |
| ChordDetector.ts | FrequencyBandSplitter.ts | hzToBin for bass weighting | WIRED | Unchanged from initial |
| AnalysisTick.ts | ChordDetector.ts | extractAndMatchChord per tick | WIRED | Unchanged |
| AnalysisTick.ts | TensionScorer.ts | updateTension per tick | WIRED | Unchanged |
| CanvasRenderer.ts | TensionMeter.ts | render() in rAF loop | WIRED | Unchanged |
| App.tsx | TensionHeatmap.ts | computeTensionHeatmap after calibration | WIRED | Unchanged |
| Timeline.tsx | audioStateRef.tensionHeatmap | reads ref directly, keyed by heatmapVersion | WIRED | Unchanged |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Chord name display (success criterion 1) | SATISFIED | TYPE_DISPLAY map produces musician-readable jazz symbols |
| Low-confidence chord family label (success criterion 2) | SATISFIED | FAMILY_LABELS map unchanged and correct |
| Smooth tension score in both canvas and React overlay (success criterion 3) | SATISFIED | Canvas: rAF loop; React overlay: per-tick Zustand push via onTensionUpdate |
| Vertical tension meter visible and updating (success criterion 4) | SATISFIED | Blue→amber→orange→red gradient + ghost line — unchanged |
| Pre-computed tension heatmap on Timeline before playback (success criterion 5) | SATISFIED | computeTensionHeatmap → tensionHeatmap ref → Timeline colored segments — unchanged |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | No TODO/FIXME/placeholder markers in any phase 3 file |

### Human Verification Required

#### 1. Chord Name Accuracy
**Test:** Load a jazz file with a clear chord passage (e.g., a Cmaj7 or G7 voicing). Observe what name appears in ChordDisplay.
**Expected:** Jazz-standard symbols — 'C' for plain major, 'Cm' for plain minor, 'G7' for dominant, 'Cmaj7' for major seventh. The old 'Cmajor', 'Cminor', 'Gdom7' forms should no longer appear.
**Why human:** Requires audio playback and musical knowledge to validate chroma extraction accuracy.

#### 2. Tension Overlay Smoothness (Gap 2 Regression Check)
**Test:** Play a recording and watch both the vertical canvas meter (right edge) and the tension number in the ChordDisplay overlay simultaneously.
**Expected:** Both the React text number and the canvas bar move continuously — no freezing between chord changes. They should track each other closely since both now derive from the same per-tick lerp value.
**Why human:** Dynamic rendering requires visual observation; programmatic verification confirmed the call path but not the perceived smoothness.

#### 3. Heatmap Visibility Before Playback
**Test:** Upload a file, wait for calibration to complete, do not press play. Check the Timeline scrubber.
**Expected:** Colored bands (blue through red) visible across the full scrubber immediately after calibration — no playback required.
**Why human:** Visual check — data flow verified structurally.

### Gaps Summary

Both gaps from the previous verification have been closed:

**Gap 1 (closed) — Chord name format:** TYPE_DISPLAY map added at AnalysisTick.ts lines 45-48 with entries for all 8 chord types. The displayName assignment at line 221 uses `TYPE_DISPLAY[tmpl.type] ?? tmpl.type` — musicians will now see 'C', 'Cm', 'G7' instead of 'Cmajor', 'Cminor', 'Gdom7'.

**Gap 2 (closed) — Tension overlay staleness:** The `onTensionUpdate` parameter was added to `runAnalysisTick` (AnalysisTick.ts lines 81, 229-231). It fires every tick unconditionally, outside the chord-transition guard. The callback is stored as `CanvasRenderer.onTensionUpdate` (line 81), exposed via `setOnTensionUpdate` (line 153), passed into `runAnalysisTick` at line 230, and wired in VisualizerCanvas.tsx lines 45-48 to call `useAppStore.getState().setTension(tension)` — giving ChordDisplay a fresh tension value every 100ms.

No regressions detected. All previously passing truths and artifacts remain intact.

---
_Verified: 2026-03-11T03:58:09Z_
_Verifier: Claude (gsd-verifier)_
