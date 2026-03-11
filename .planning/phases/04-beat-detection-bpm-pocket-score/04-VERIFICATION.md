---
phase: 04-beat-detection-bpm-pocket-score
verified: 2026-03-11T05:13:28Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 4: Beat Detection, BPM & Pocket Score — Verification Report

**Phase Goal:** Users see an accurate BPM reading and pocket score that reflect what the rhythm section is actually doing, with honest "—" display for rubato passages
**Verified:** 2026-03-11T05:13:28Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | BPM display shows correct tempo for straight-time and "♩ = —" for rubato | VERIFIED | ChordDisplay.tsx line 132: `currentBpm !== null ? currentBpm : '—'`; SwingAnalyzer.applyRubatoGate sets bpm=null when IOI CV > 0.3 |
| 2 | Swing recordings do not report 2× the actual BPM | VERIFIED | BpmTracker.extractBpm lines 148–151: if `ac[doubleLag] > 0.6 * bestVal`, uses 2×lag as true period — prevents sub-beat false positive |
| 3 | Pocket score (0.0–1.0) is higher on tight sync moments and suppressed during rubato | VERIFIED | PocketScorer.updatePocketScore: returns early with pocketScore=0 when bpm===null (BEAT-10); rolling 8-beat average of `1-(|offsetMs|/80)` scores |
| 4 | Timing offset (bass ahead/drums ahead) in ms is computed and available for edge rendering | VERIFIED | PocketScorer line 129: `beat.timingOffsetMs = offsetMs`; positive = drums ahead; stored on BeatState and bridged to Zustand via setBeatInfo |
| 5 | Downbeat detection marks beat 1 and is available to Canvas renderer | VERIFIED | DrumTransientDetector lines 265–268: beatCounter wraps mod 4; lastDownbeatSec set when counter==0; stays on audioStateRef.current.beat (not Zustand) for 60fps canvas reads |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audio/DrumTransientDetector.ts` | Drum onset detection (BEAT-01, BEAT-02, BEAT-07) | VERIFIED | 275 lines; exports initBeatState, computeDrumFlux, adaptiveThreshold, detectDrumOnset; no stubs |
| `src/audio/BpmTracker.ts` | BPM autocorrelation + swing check + bass onset (BEAT-03, BEAT-04, BEAT-06) | VERIFIED | 315 lines; exports runAutocorrelation, extractBpm, updateBpm, computeBassRmsDelta, detectBassOnset; swing check at lines 148–151 |
| `src/audio/SwingAnalyzer.ts` | IOI CV computation + rubato gate (BEAT-05, BEAT-10) | VERIFIED | 115 lines; exports computeIoiCV, applyRubatoGate; RUBATO_CV_THRESHOLD=0.3 exported constant |
| `src/audio/PocketScorer.ts` | Bass-drums sync scoring, rolling average, timing offset (BEAT-08, BEAT-09) | VERIFIED | 141 lines; exports computeSyncScore, updatePocketScore; ±80ms window; rubato suppression present |
| `src/audio/types.ts` | BeatState interface with 9 pre-allocated Float32Array fields | VERIFIED | BeatState defined lines 37–90; all fields present including lastDownbeatSec, beatCounter, timingOffsetMs |
| `src/audio/AnalysisTick.ts` | Phase 4 beat tick wired into 10fps orchestrator | VERIFIED | 297 lines; Phase 4 block at lines 255–293; call order: detectDrumOnset → detectBassOnset → updateBpm → applyRubatoGate → updatePocketScore |
| `src/store/useAppStore.ts` | Zustand fields: currentBpm, pocketScore, timingOffsetMs; setBeatInfo action | VERIFIED | Lines 23–25 declare fields; line 65 implements setBeatInfo; reset() clears all three |
| `src/components/ChordDisplay.tsx` | BPM display with "♩ = —" null rendering; pocket score hidden during rubato | VERIFIED | 150 lines; line 132 handles null/number; line 137 gates pocket score display on currentBpm !== null |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| CanvasRenderer rAF loop | runAnalysisTick | onBeatUpdate param | WIRED | CanvasRenderer.ts line 238: passes this.onBeatUpdate to runAnalysisTick |
| VisualizerCanvas | CanvasRenderer | setOnBeatUpdate | WIRED | VisualizerCanvas.tsx lines 52–54: `renderer.setOnBeatUpdate((bpm, pocket, offset) => useAppStore.getState().setBeatInfo(...))` |
| AnalysisTick | Zustand store | onBeatUpdate callback | WIRED | AnalysisTick.ts line 289–291: fires onBeatUpdate when bpm or pocketScore changes |
| App.tsx | audioStateRef.beat | initBeatState | WIRED | App.tsx line 58: `audioStateRef.current.beat = initBeatState()` after calibration |
| detectDrumOnset | lastDownbeatSec | beatCounter mod 4 | WIRED | DrumTransientDetector.ts lines 265–268: beatCounter wraps; lastDownbeatSec updated at wrap |
| updatePocketScore | beat.bpm null check | rubato suppression | WIRED | PocketScorer.ts lines 98–101: `if (beat.bpm === null) { beat.pocketScore = 0; return; }` |
| applyRubatoGate | beat.bpm | IOI CV > 0.3 | WIRED | SwingAnalyzer.ts lines 111–114: `beat.bpm = null` when ioiCV > RUBATO_CV_THRESHOLD |
| bands lookup | drumsHighBand / rideBand / bassBand | name-based find | WIRED | AnalysisTick.ts lines 260–262: `state.bands.find(b => b.name === '...')` — band names confirmed present in FrequencyBandSplitter.ts |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| BEAT-01: Drum transient detection via spectral flux (ride 6–10kHz + drums_high 2–8kHz) | SATISFIED | DrumTransientDetector.computeDrumFlux; band choice documented with design rationale |
| BEAT-02: Adaptive threshold (mean + 1.5× stddev, Infinity guard) | SATISFIED | DrumTransientDetector.adaptiveThreshold; cold-start guard at n<3 |
| BEAT-03: Bass onset detection via RMS energy delta (20–250Hz) | SATISFIED | BpmTracker.computeBassRmsDelta + detectBassOnset; 80ms debounce; kick bleed suppression |
| BEAT-04: BPM via autocorrelation over 6-second window, updated every 2 seconds | SATISFIED | BpmTracker.runAutocorrelation + updateBpm; AC_UPDATE_INTERVAL=20 ticks; 3-slot median smoothing |
| BEAT-05: Rubato/free sections: BPM = null, display "♩ = —" | SATISFIED | SwingAnalyzer.applyRubatoGate sets bpm=null; ChordDisplay renders '—' when null |
| BEAT-06: Swing ratio detection to prevent double-tempo BPM | SATISFIED | BpmTracker.extractBpm swing check: if AC[2×lag] > 0.6×AC[lag], use 2×lag |
| BEAT-07: Downbeat detection (every 4th drum beat = beat 1) | SATISFIED | DrumTransientDetector.detectDrumOnset: beatCounter mod 4, lastDownbeatSec on counter==0 |
| BEAT-08: Pocket score: rolling 8-beat average within ±80ms window | SATISFIED | PocketScorer: pocketBuffer length 8; score formula `1-(|offsetMs|/80)` |
| BEAT-09: Timing offset measurement (positive = drums ahead) | SATISFIED | PocketScorer line 129: `beat.timingOffsetMs = (drumOnsetSec - bassOnsetSec) * 1000` |
| BEAT-10: Pocket score suppressed when BPM confidence is low | SATISFIED | PocketScorer lines 98–101: immediate 0 return when beat.bpm === null |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| BpmTracker.ts | 143 | `return null` | Info | Expected behavior — null return signals no confident BPM, not a stub |

No blocker or warning anti-patterns found. The single `return null` at BpmTracker.ts:143 is intentional signal behavior (no confident BPM peak found in autocorrelation), not a placeholder.

### Human Verification Required

#### 1. BPM Accuracy on Real Jazz Recording

**Test:** Load a jazz recording with known BPM (e.g. straight-time track at 120 BPM). Play for 10+ seconds and observe the BPM readout.
**Expected:** BPM display shows a value within ±10 BPM of the actual tempo. May take 4–6 seconds to stabilize (2s OSS warmup + 2s first AC update).
**Why human:** Autocorrelation accuracy at 10fps (±5 BPM precision) cannot be verified by static code analysis. Actual drum track is required.

#### 2. Rubato Suppression on Free Jazz Passage

**Test:** Load a recording with free/rubato sections (or a section where the drummer plays freely). Observe the BPM display.
**Expected:** BPM shows "♩ = —" during free passages. Pocket score row is hidden during those same passages.
**Why human:** IOI CV threshold (0.3) is empirical and tuned — real-world behavior depends on actual drum onset pattern variability.

#### 3. Swing Ratio Not Double-Reporting

**Test:** Load a typical jazz swing recording (e.g. 120 BPM with 2-feel or 4-feel swing). Observe the BPM readout.
**Expected:** BPM shows ~120, not ~240 (double-tempo false positive suppressed by swing check).
**Why human:** Swing ratio detection depends on actual autocorrelation peaks from real drum audio — cannot be verified statically.

#### 4. Pocket Score Visible Differentiation

**Test:** Load a recording. Compare pocket score during sections where bass and drums are clearly locked vs. sections where bass plays freely over a steady drum pattern.
**Expected:** Pocket score visibly higher (greener, closer to 1.0) during tight sections; lower (redder, closer to 0.0) during loose sections.
**Why human:** Sync score depends on actual onset timestamps from real audio; ±80ms window behavior requires audio playback to verify.

#### 5. Timing Offset Direction

**Test:** Load a recording. Check timingOffsetMs value (visible in Zustand devtools or console).
**Expected:** Positive values when drums hit before bass; negative when bass is ahead.
**Why human:** Requires a recording where the drummer consistently pushes or lays back to verify sign convention is meaningful.

### Gaps Summary

No gaps found. All five observable truths are fully verified against the codebase:

- All four Phase 4 modules exist, are substantive (115–315 lines each), and export real implementations with no stubs or placeholders.
- The full call chain is wired: AnalysisTick (10fps) → CanvasRenderer → VisualizerCanvas → Zustand → ChordDisplay.
- BPM null rendering ("♩ = —") is correctly implemented with pocket score display gated on BPM availability.
- Downbeat state (`lastDownbeatSec`, `beatCounter`) remains on `audioStateRef.current.beat` (not Zustand) — correct design for 60fps Canvas reads in Phase 5.
- TypeScript compilation passes with zero errors.

The five items in Human Verification Required are all runtime/audio-quality checks — they cannot be verified by static code analysis but do not indicate implementation gaps.

---

_Verified: 2026-03-11T05:13:28Z_
_Verifier: Claude (gsd-verifier)_
