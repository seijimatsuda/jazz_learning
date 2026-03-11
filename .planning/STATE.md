# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** Phase 4 — Beat Detection, BPM & Pocket Score

## Current Position

Phase: 4 of 8 (Beat Detection, BPM & Pocket Score)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-03-10 — Completed 04-03-PLAN.md (SwingAnalyzer: IOI CV rubato gate; PocketScorer: bass-drums sync)

Progress: [██████████████████░░] 45% (18/40 total plans estimated)

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: ~2m 0s
- Total execution time: ~16m 33s

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 - Audio Pipeline Foundation | 5/5 COMPLETE | ~12m | ~2m 24s |
| 02 - Instrument Activity Analysis | 5/5 COMPLETE | ~7m 37s | ~1m 31s |
| 03 - Chord Detection & Harmonic Analysis | 5/5 COMPLETE | ~8m 13s | ~1m 38s |
| 04 - Beat Detection, BPM & Pocket Score | 3/4 | ~8m | ~2m 40s |

**Recent Trend:**
- Last 5 plans: 03-02 (1m 14s), 03-03 (~3m), 03-04 (unknown), 03-05 (~1m), 04-01 (~2m)
- Trend: Consistent sub-3min per plan; Phase 4 in progress

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Canvas API over D3.js — precise per-pixel control needed for glow/ripple animations
- [Init]: Meyda.js for feature extraction — chroma, RMS, ZCR, spectral flux out of the box
- [Init]: Frequency band splitting (not stem separation) — browser-only, no backend
- [Init]: iOS compatible from day one — AudioContext, Canvas, offscreen glow compositing required from Phase 1
- [D-01-01-1]: Tailwind 4 CSS-first via @tailwindcss/vite — no tailwind.config.js needed
- [D-01-01-2]: AudioStateRef in useRef only — Web Audio objects non-serializable, animation loop reads ref at 60fps
- [D-01-01-3]: fftSize=4096 fixed — 2048 frequency bins, ~21.5Hz resolution per bin at 44.1kHz
- [D-01-02-1]: AudioContext created synchronously in click handler before any await — iOS user gesture requirement
- [D-01-02-2]: sampleRate always read from audioCtx.sampleRate after creation — iOS may return 48000 despite requesting 44100
- [D-01-02-3]: Previous AudioContext closed before creating new one — prevents resource leaks on file re-load
- [D-01-03-1]: raw AnalyserNode NOT connected to destination — silent measurement tap only (connecting would double volume)
- [D-01-03-2]: connectSourceToGraph deferred to play time (01-04) — source nodes created fresh on each play
- [D-01-03-3]: 6 overlapping frequency bands including drums_low/drums_high — overlapping lets beat detection use dedicated bands
- [D-01-04-1]: CalibrationPass receives setCalibrating as parameter — keeps audio module Zustand-free and testable
- [D-01-04-2]: Calibration source connected only to rawAnalyser (not destination) — silent pass, no audible noise
- [D-01-04-3]: AudioBufferSourceNode single-use — fresh source created on every play call
- [D-01-04-4]: Timeline 10fps setInterval polling — consistent with ref-based audio state pattern, off React hot-path
- [D-01-05-1]: HTMLCanvasElement (off-DOM) for glow layers instead of OffscreenCanvas — iOS 16 Safari OffscreenCanvas support is incomplete per RESEARCH.md
- [D-01-05-2]: Zero per-frame typed array allocations — getByteFrequencyData writes into pre-allocated audioStateRef.current.smoothedFreqData each rAF frame
- [D-01-05-3]: Tension heatmap uses spectral centroid variance as proxy — placeholder for Phase 3 chord-function tension (fast, offline-safe)
- [D-01-05-4]: File upload extended to accept m4a/aac/ogg/flac — Web Audio API decodeAudioData handles these natively; restriction was unnecessarily narrow for jazz recordings
- [D-02-01-1]: RoleLabel as union type (not enum) — matches existing type convention in types.ts
- [D-02-01-2]: prevRawFreqData and rawTimeDataFloat placed on AnalysisState (not top-level AudioStateRef) — keeps analysis-related state cohesive under one nullable object
- [D-02-01-3]: smoothingAlpha=0.7 as default in computeActivityScore — snappy 10fps response; callers can override
- [D-02-02-1]: Upward role transitions have no hysteresis barrier — instruments enter higher roles immediately at threshold; only downward transitions gated to prevent flicker
- [D-02-02-2]: Hysteresis boundary check uses strict less-than — score exactly equal to (threshold - hysteresis) stays in current role (e.g. 0.05 stays 'holding' when T_HOLD-hysteresis=0.05)
- [D-02-03-1]: computeSpectralFlux is hand-rolled — Meyda 5.6.3 spectralFlux extractor has negative index bug returning 0/NaN; do not replace with Meyda.extract
- [D-02-03-2]: Flux normalization constant 5000 is empirical starting value — flagged for tuning in later phase against real jazz recordings
- [D-02-03-3]: Weight clamping to [0.15, 0.85] applied per-weight independently; sum may exceed 1.0 at extremes — safety margin takes priority over exact sum
- [D-02-04-1]: CORR_WINDOW=20 (2 seconds at 10fps) — long enough for groove lock-in detection, short enough for dynamic role tracking
- [D-02-04-2]: rawTimeData allocation fixed to fftSize (4096 bytes) not fftSize/2 — getByteTimeDomainData fills full fftSize, not half
- [D-02-04-3]: Lineup hardcoded as jazz quartet for Phase 2 — Phase 7 BandSetupPanel will expose this as configurable UI
- [D-02-04-4]: Role changes push to Zustand only on actual change — prevents continuous mutations during steady-state playback
- [D-02-05-1]: Activity scores polled from audioStateRef via 100ms setInterval, not Zustand — high-frequency numeric data; Zustand used only for role labels (occasional changes driving re-renders)
- [D-02-05-2]: !isCalibrating guard on InstrumentRoleOverlay — analysis state null until calibration resolves; guard prevents interval reading undefined
- [D-03-01-1]: RIGHT rotation for chord template transposition — rotateRight(cMajorVec, 7) gives G major (indices 2,7,11=1)
- [D-03-01-2]: Meyda chromaFilterBank forced to undefined before sampleRate — iOS fix; stale 44.1kHz bank on 48kHz Safari produces wrong chroma
- [D-03-01-3]: rawTimeDataFloat populated conditionally in extractAndMatchChord — only converts from rawTimeData if all-zeros (kb/guitar disambiguation didn't run)
- [D-03-01-4]: Bass weighting skips if maxEnergy < 20 — prevents noise floor from biasing root detection
- [D-03-01-5]: Chord log push only on displayedChordIdx change — avoids duplicate entries during stable chord holds
- [D-03-02-1]: Ghost index arithmetic uses +HISTORY_CAP*2 before modulo — ensures positive result regardless of head position near 0
- [D-03-02-2]: Tension target is midpoint of TENSION_TARGETS range — lerp traverses zone smoothly rather than snapping to range extremes
- [D-03-02-3]: chordFunction in Zustand is plain string not ChordFunction enum — AnalysisTick (03-03) computes human-readable label before pushing to UI
- [D-03-02-4]: reset() sets currentChord='--' and chordConfidence='low' (not null) — avoids null checks in chord display components
- [D-03-03-1]: rawTimeDataFloat population moved to explicit else-branch in disambiguation block — guarantees population for Phase 3 Meyda chroma extraction when no keyboard+guitar pair is present
- [D-03-03-2]: Offline heatmap uses center-of-second windowing — centers FFT_SIZE frame at midpoint of each second to avoid boundary artifacts
- [D-03-03-3]: TENSION_MIDPOINTS match TensionScorer TENSION_TARGETS midpoints — tonic=0.1, sub=0.325, dom=0.65, alt=0.875 for consistent offline/live scale
- [D-03-03-4]: ChordChangeCallback type defined in CanvasRenderer.ts not types.ts — UI callback signature is not an audio domain type
- [D-03-04-1]: drawImage from 1-pixel-wide off-DOM gradient canvas for tension fill instead of createLinearGradient per frame — zero gradient allocations in hot rAF path
- [D-03-04-2]: TensionMeter.render() takes currentTension and ghostTension as explicit params — no direct AudioStateRef or Zustand access inside component
- [D-03-04-3]: tensionMeter.resize() called inside CanvasRenderer.resize() propagating height changes — gradient canvas stays in sync with canvas layout
- [D-03-05-1]: No badge rendered when currentChord is '--' — prevents badge showing against placeholder dash on initial/reset state
- [D-03-05-2]: tensionColor thresholds (0.3, 0.6, 0.85) align with TENSION_TARGETS midpoints — tonic=0.1, sub=0.325, dom=0.65, alt=0.875; color bands semantically consistent with tension zone boundaries
- [D-03-05-3]: ChordDisplay in max-w-2xl container (narrower than canvas max-w-4xl) — mirrors file info and transport controls layout
- [D-04-01-1]: drums_high (2000-8000Hz) + ride (6000-10000Hz) for drum flux — not snare fundamental (200-800Hz) which overlaps bass/piano in jazz
- [D-04-01-2]: adaptiveThreshold returns Infinity when n<3 — prevents cold-start false onsets during first 300ms of analysis
- [D-04-01-3]: OSS buffer populated every tick (not just on onset) — downstream autocorrelation needs full signal density
- [D-04-01-4]: beatCounter increments on onset then wraps mod 4; downbeat fires at counter==0 post-increment
- [D-04-02-1]: bassAdaptiveThreshold is local to BpmTracker — DrumTransientDetector.adaptiveThreshold takes BeatState and reads drumFluxBuffer; bass needs separate buffer traversal
- [D-04-02-2]: Kick bleed suppression uses drum mean flux * 0.8 * MULTIPLIER — avoids cross-module coupling, keeps kick gate independently tunable
- [D-04-02-3]: vals[] (3-element) created every 2 seconds in updateBpm — explicitly accepted per 04-RESEARCH.md; per-frame allocation guidance does not restrict 2s cadence
- [D-04-03-1]: RUBATO_CV_THRESHOLD=0.3 is empirical — not from MIR literature; flagged as tunable in code comments
- [D-04-03-2]: computeIoiCV returns 1.0 conservatively on count<4 and ioiCount<3 — defaults to rubato until sufficient onset data accumulates
- [D-04-03-3]: pairGap guard at 200ms in updatePocketScore prevents non-paired onsets from generating sync scores
- [D-04-03-4]: applyRubatoGate sets bpm=null as single suppression signal — downstream pocket scorer and UI both check bpm===null

### Pending Todos

None.

### Blockers/Concerns

- [Phase 4+]: Verify Meyda chroma output quality on iOS (48kHz) vs desktop Chrome (44.1kHz) — chromaFilterBank rebuild applied in 03-01, but empirical test with real jazz still needed
- [All phases]: iOS Safari AudioContext `{ sampleRate: 44100 }` constructor option behavior unconfirmed — always read back `audioCtx.sampleRate` after creation
- [All visual phases]: iOS Low Power Mode caps rAF at 30fps — documented known limitation; test with Low Power Mode OFF
- [Note]: Requirements count discrepancy — REQUIREMENTS.md header says 83 but traceability table contains 96 entries across all categories. All 96 entries are mapped in the roadmap. Reconcile count before Phase 2 planning.

## Session Continuity

Last session: 2026-03-10
Stopped at: Completed 04-03-PLAN.md. SwingAnalyzer and PocketScorer complete. Ready for 04-04 (AnalysisTick wiring: updateBpm → applyRubatoGate → updatePocketScore → Zustand bridge).
Resume file: None
