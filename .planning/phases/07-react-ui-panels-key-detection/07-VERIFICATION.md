---
phase: 07-react-ui-panels-key-detection
verified: 2026-03-11T20:59:22Z
status: passed
score: 5/5 must-haves verified
gaps: []
human_verification:
  - test: "Add/remove instrument and confirm node graph position reflects lineup after file load"
    expected: "Node graph shows selected instruments; removing an instrument before load hides it; locked badge appears after load"
    why_human: "Node graph layout uses INSTRUMENT_ORDER (static 4-instrument diamond) regardless of lineup — visual mismatch cannot be verified structurally"
  - test: "Click a canvas instrument node; verify NodeDetailPanel opens with sparkline and pie chart"
    expected: "Panel slides open showing role badge, 10-second sparkline with visible waveform, and pie chart with time-in-role segments"
    why_human: "Canvas pixel hit detection and mini-canvas rendering require visual inspection during live playback"
  - test: "Expand chord log during playback and click an entry"
    expected: "Playback jumps to that timestamp; audio restarts from the clicked moment"
    why_human: "Seek correctness under play/pause state requires runtime verification"
  - test: "Play audio for ~30 seconds; verify detected key appears in chord log header and chord function in ChordDisplay"
    expected: "Key label shows (e.g. 'Key: C major'), chord display shows italic function string (e.g. 'Cmaj7 is the I chord in C major')"
    why_human: "Key detection quality depends on actual audio content and algorithm convergence — structural wiring is verified but result accuracy is runtime"
  - test: "Verify BPM display and role legend on canvas during playback"
    expected: "Bottom-left shows quarter note symbol with numeric BPM; top-left shows colored circles with Soloing/Comping/Holding/Silent labels"
    why_human: "Canvas overlay requires visual inspection; values update in rAF loop, not React state"
---

# Phase 7: React UI Panels & Key Detection — Verification Report

**Phase Goal:** Users can configure the band lineup, read chord names and tension values in real-time React panels, inspect any instrument's history by clicking its node, and navigate the chord log
**Verified:** 2026-03-11T20:59:22Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can add/remove instruments from BandSetupPanel before file load; lineup drives analysis | VERIFIED | `BandSetupPanel.tsx` reads/writes `lineup` via Zustand; `App.tsx:47` reads `useAppStore.getState().lineup` for `initAnalysisState` call |
| 2 | Clicking an instrument node opens NodeDetailPanel with role badge, sparkline, pie chart, and most-active partner | VERIFIED | `VisualizerCanvas.tsx:63-87` click handler sets `selectedInstrument` via Zustand; `NodeDetailPanel.tsx` polls at 100ms and draws both mini-canvases |
| 3 | Chord log shows timestamped entries color-coded by tension; clicking jumps playback | VERIFIED | `ChordLogPanel.tsx` renders entries with `tensionBgColor`; each entry is a button calling `seekTo(entry.audioTimeSec)` via `useSeek` hook |
| 4 | Key detection runs from chord history and displays chord function relative to key | VERIFIED | `KeyDetector.ts` exports `detectKey` and `chordFunctionInKey`; `ChordLogPanel.tsx` calls `detectKey` at 2fps; `ChordDisplay.tsx` calls `chordFunctionInKey` for inline key context |
| 5 | BPM display, role legend, and bar/beat grid overlay on timeline show correct values during playback | VERIFIED | `CanvasRenderer.ts:574-578` calls `drawBpmDisplay` and `drawRoleLegend` on every frame from `beatState`; `Timeline.tsx:129-165` renders beat grid ticks |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/store/useAppStore.ts` | lineup, selectedInstrument, detectedKey, detectedKeyMode fields with setters | VERIFIED | All 4 fields present at lines 29-32; all 3 setters at lines 42-44; reset at lines 101-103; 106 lines total |
| `src/components/BandSetupPanel.tsx` | Dropdown add, instrument rows with icon/name/band/remove, locked state | VERIFIED | 187 lines; dropdown disabled when `isFileLoaded`; remove buttons disabled; "Locked" badge renders; optimization note when lineup != 4 |
| `src/App.tsx` | BandSetupPanel integrated; lineup from Zustand; InstrumentRoleOverlay removed | VERIFIED | BandSetupPanel at line 87; `useAppStore.getState().lineup` at line 47; no InstrumentRoleOverlay import or usage |
| `src/components/ChordDisplay.tsx` | Chord name, confidence badge, tension, BPM, pocket score, key context label | VERIFIED | 174 lines; reads 9 Zustand fields; `chordFunctionInKey` called at line 79; BPM display at lines 149-158 |
| `src/components/NodeDetailPanel.tsx` | Role badge, 10s sparkline canvas, pie chart canvas, most-active partner | VERIFIED | 339 lines; two mini-canvas refs; `drawSparkline` reads ring buffer; `drawPie` iterates ROLE_ORDER; `setInterval` at 100ms |
| `src/components/ChordLogPanel.tsx` | Expandable drawer, timestamped entries, color-coded by tension, seek on click, key detection at 2fps | VERIFIED | 349 lines; `setInterval(500ms)` calls `detectKey`; entries rendered as buttons calling `seekTo`; `tensionBgColor` applied |
| `src/hooks/useSeek.ts` | Reusable seek hook extracted from Timeline | VERIFIED | 46 lines; exports `useSeek` returning `seekTo`; handles play/pause/restart correctly |
| `src/audio/KeyDetector.ts` | `detectKey` pure function with 30s rolling window; `chordFunctionInKey` returning human-readable string | VERIFIED | 192 lines; `detectKey` filters by window, weights by `confidenceGap`, returns key/mode/confidence; `chordFunctionInKey` returns e.g. "G7 is the V chord in C major" |
| `src/audio/ChordDetector.ts` | `NOTE_NAMES` exported for KeyDetector | VERIFIED | Line 46: `export const NOTE_NAMES` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `BandSetupPanel.tsx` | `useAppStore.ts` | `useAppStore((s) => s.lineup)` / `setLineup` | WIRED | Reads and writes lineup; locked on `isFileLoaded` |
| `App.tsx` | `useAppStore.ts` | `useAppStore.getState().lineup` | WIRED | Line 47 reads lineup at calibration time for `initAnalysisState` |
| `VisualizerCanvas.tsx` | `useAppStore.ts` | `setSelectedInstrument` on canvas click | WIRED | Lines 81 and 86 set/clear selectedInstrument |
| `NodeDetailPanel.tsx` | `useAppStore.ts` | `useAppStore((s) => s.selectedInstrument)` | WIRED | Gates render at line 211; drives 100ms poll |
| `NodeDetailPanel.tsx` | `audioStateRef` | `analysis.instruments.find(...)` in setInterval | WIRED | Reads `historyBuffer`, `historyHead`, `historySamples`, `timeInRole`, `edgeWeights` |
| `ChordLogPanel.tsx` | `KeyDetector.ts` | `detectKey(snapshot, currentTimeSec)` at 500ms | WIRED | Line 136; result pushed to Zustand via `setDetectedKey` at line 139 |
| `ChordLogPanel.tsx` | `useSeek` hook | `seekTo(entry.audioTimeSec)` on button click | WIRED | Lines 115 and 271 |
| `ChordDisplay.tsx` | `KeyDetector.ts` | `chordFunctionInKey(root, type, key, mode)` | WIRED | Line 79; renders `keyContextLabel` at line 127 |
| `Timeline.tsx` | `useSeek` hook | `seekTo(targetTime)` on click | WIRED | Lines 37 and 77 |
| `Timeline.tsx` | `audioStateRef.beat` | `beat.bpm`, `beat.lastDownbeatSec` for grid | WIRED | Lines 49-62 poll beat state; lines 129-165 render ticks |
| `CanvasRenderer.ts` | `beatState.bpm` | `drawBpmDisplay(ctx, 20, h-20, beatState?.bpm)` | WIRED | Line 575; reads from `state.beat` in rAF loop at line 316 |
| `CanvasRenderer.ts` | role legend | `drawRoleLegend(ctx, 16, 20)` | WIRED | Line 578; draws all 4 roles every frame |
| `KeyDetector.ts` | `ChordDetector.ts` | `import { NOTE_NAMES, CHORD_TEMPLATES }` | WIRED | Line 23; NOTE_NAMES used in `detectKey` and `chordFunctionInKey` |

### Requirements Coverage

| Requirement | Status | Supporting Artifact |
|-------------|--------|-------------------|
| UI-01 (Band setup panel) | SATISFIED | BandSetupPanel.tsx |
| UI-02 (Lineup drives analysis) | SATISFIED | App.tsx line 47 |
| UI-03 (Chord display, tension, BPM) | SATISFIED | ChordDisplay.tsx |
| UI-04 (Node detail — name + role badge) | SATISFIED | NodeDetailPanel.tsx |
| UI-05 (Node detail — sparkline) | SATISFIED | NodeDetailPanel.tsx drawSparkline |
| UI-06 (Node detail — pie chart) | SATISFIED | NodeDetailPanel.tsx drawPie |
| UI-07 (Node detail — most active partner) | SATISFIED | NodeDetailPanel.tsx edgeWeights logic |
| UI-08 (Role legend on canvas) | SATISFIED | CanvasRenderer.ts drawRoleLegend |
| UI-09 (BPM display on canvas) | SATISFIED | CanvasRenderer.ts drawBpmDisplay |
| UI-10 (Bar/beat grid on timeline) | SATISFIED | Timeline.tsx lines 129-165 |
| UI-11 (Chord log panel, expandable) | SATISFIED | ChordLogPanel.tsx |
| UI-12 (Chord log seek on click) | SATISFIED | ChordLogPanel.tsx button onClick → seekTo |
| KEY-01 (detectKey from chord history) | SATISFIED | KeyDetector.ts detectKey with 30s window |
| KEY-02 (chordFunctionInKey label) | SATISFIED | KeyDetector.ts chordFunctionInKey; wired in ChordDisplay + ChordLogPanel |
| KEY-03 (Key detection at 2fps) | SATISFIED | ChordLogPanel.tsx setInterval(500ms) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `NodeDetailPanel.tsx` | 127 | Comment says "placeholder" for gray circle | Info | Correct fallback behavior when no role data yet; not a stub |

No blocker or warning-level anti-patterns found. The "placeholder" comment at line 127 refers to the correct empty-state gray circle drawn when `timeInRole` totals zero — this is proper defensive rendering, not a TODO.

### Human Verification Required

#### 1. Band Lineup → Node Graph Reflection

**Test:** Remove "guitar" from lineup before loading audio, then load a file.
**Expected:** Node graph shows only 3 instruments; guitar node is absent.
**Why human:** `INSTRUMENT_ORDER` in `NodeLayout.ts` is the static diamond array `['guitar', 'drums', 'keyboard', 'bass']`. The canvas renderer always renders all 4 positions. There is a mismatch between the dynamic `lineup` in Zustand and the fixed `INSTRUMENT_ORDER`. The BandSetupPanel correctly shows the optimization note for non-4 lineups, but the visual node graph may still render 4 nodes even when lineup has fewer instruments. This needs visual confirmation.

#### 2. NodeDetailPanel Mini-Canvases During Playback

**Test:** Load audio, play for 10+ seconds, click a canvas node.
**Expected:** Sparkline shows activity curve for the last 10 seconds; pie chart has colored segments.
**Why human:** Ring buffer reads and canvas rendering require active analysis state.

#### 3. Chord Log Seek Accuracy

**Test:** Expand chord log during playback; click an entry timestamped at, e.g., 1:23.
**Expected:** Playback position jumps to 1:23 and audio resumes from there.
**Why human:** Seek correctness with play/pause state depends on AudioContext timing.

#### 4. Key Detection Convergence

**Test:** Play a jazz recording for 30 seconds; check chord log header and ChordDisplay.
**Expected:** Key label appears (e.g. "Key: F major"); chord display shows italic label (e.g. "Cmaj7 is the V chord in F major").
**Why human:** Key detection quality depends on audio content and algorithm convergence — structural wiring is verified, accuracy is runtime.

#### 5. BPM and Role Legend on Canvas

**Test:** Load and play any audio; observe the canvas overlay.
**Expected:** Bottom-left shows "♩ = 132" (or "♩ = —" for rubato); top-left shows four colored circles with Soloing/Comping/Holding/Silent labels.
**Why human:** Canvas draw calls require visual inspection; cannot be verified from source alone.

### Gaps Summary

No structural gaps found. All 5 observable truths are backed by substantive, wired implementations:

- `useAppStore.ts` fully extended with all Phase 7 fields and correctly resets them.
- `BandSetupPanel.tsx` implements add/remove with locked-state enforcement.
- `App.tsx` reads lineup from Zustand at calibration time (line 47) and renders all Phase 7 components; `InstrumentRoleOverlay` is not imported or rendered.
- `NodeDetailPanel.tsx` polls audioStateRef at 100ms and draws both mini-canvases from real ring buffer data.
- `ChordLogPanel.tsx` runs key detection at 2fps, enriches entries with function labels, and correctly wires each entry to `seekTo`.
- `KeyDetector.ts` is a pure 30-second rolling window algorithm with correct weighted accumulation.
- `useSeek.ts` is properly extracted and used by both `Timeline.tsx` and `ChordLogPanel.tsx`.
- BPM display (`drawBpmDisplay`) and role legend (`drawRoleLegend`) are called every frame directly from `beatState` — no Zustand read in the hot path.
- Bar/beat grid renders in `Timeline.tsx` when BPM is detected.
- TypeScript `tsc --noEmit` passes with zero errors.

One structural observation worth noting: `INSTRUMENT_ORDER` in `NodeLayout.ts` is the fixed array `['guitar', 'drums', 'keyboard', 'bass']`, meaning the canvas always draws 4 nodes regardless of the Zustand `lineup`. The success criterion "the node graph reflects the lineup" may not hold when fewer than 4 instruments are configured. This is flagged in the human verification section rather than as a blocker, since the PLAN explicitly stated "dynamic node count is a future enhancement" and the BandSetupPanel shows a note when lineup count differs from 4.

---

_Verified: 2026-03-11T20:59:22Z_
_Verifier: Claude (gsd-verifier)_
