# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** Phase 8 — Advanced Features — In progress (4/5 plans complete)

## Current Position

Phase: 8 of 8 (Advanced Features) — In progress
Plan: 4 of 5 complete (08-03 now also complete — was parallel to 08-04)
Status: In progress — 08-03, 08-04 complete, ready for 08-05
Last activity: 2026-03-11 — Completed 08-03-PLAN.md (Conversation Log Panel — MEL-05)

Progress: [████████████████████████████████████] 95% (40/42 total plans estimated)

## Performance Metrics

**Velocity:**
- Total plans completed: 29
- Average duration: ~2m 15s
- Total execution time: ~68m

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 - Audio Pipeline Foundation | 5/5 COMPLETE | ~12m | ~2m 24s |
| 02 - Instrument Activity Analysis | 5/5 COMPLETE | ~7m 37s | ~1m 31s |
| 03 - Chord Detection & Harmonic Analysis | 5/5 COMPLETE | ~8m 13s | ~1m 38s |
| 04 - Beat Detection, BPM & Pocket Score | 4/4 COMPLETE | ~11m | ~2m 45s |
| 05 - Canvas Node Graph | 5/5 COMPLETE | ~15m | ~3m |
| 06 - Edge Visualization | 3/3 COMPLETE | ~9m | ~3m |

**Recent Trend:**
- Last 5 plans: 05-05 (~3m), 06-01 (~3m), 06-02 (~2m), 06-03 (~4m)
- Trend: Consistent sub-3min per plan

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
- [D-04-04-1]: onBeatUpdate callback chain goes through CanvasRenderer (setOnBeatUpdate method) and VisualizerCanvas — matches existing pattern for onRoleChange/onChordChange/onTensionUpdate; App.tsx does not call runAnalysisTick directly
- [D-04-04-2]: lastDownbeatSec and beatCounter stay on audioStateRef.current.beat (not Zustand) — Phase 5 canvas reads them at 60fps; Zustand would cause excessive re-renders for frame-rate data
- [D-04-04-3]: onBeatUpdate fires only when BPM or pocket score changes (not every tick) — matches onChordChange pattern; prevents continuous Zustand mutations during steady-state
- [D-05-01-1]: INSTRUMENT_ORDER is [guitar, drums, keyboard, bass] — bass(bottom) and drums(left) adjacent for Phase 6 pocket line
- [D-05-01-2]: Initial baseRadius=28 for all nodes in holding state — role-based sizing deferred to 05-02
- [D-05-01-3]: Ripple utilities in NodeAnimState.ts (not drawGlow.ts) — enables 05-03 and 05-04 to run in parallel as Wave 1 imports
- [D-05-01-4]: bgPulseProgress added to CanvasRenderer now (unused placeholder) — for VIZ-11 wired in 05-05 to avoid later architectural change
- [D-05-02-1]: Initial glowCanvas color set to ROLE_FILL_COLOR['holding'] for all nodes — glow re-creation gated by pocketScore threshold in 05-03; avoids per-frame HTMLCanvasElement allocation
- [D-05-02-2]: INSTRUMENT_COLORS removed from CanvasRenderer — all color authority delegated to ROLE_FILL_COLOR in drawNode.ts (single source of truth)
- [D-05-02-3]: lerpExp factor=0.15 per 16.667ms frame (~200ms transition) — consistent with future nudge/pulse animations in 05-03/04
- [D-05-04-1]: Downbeat double-ripple check inside bpm !== null guard — downbeat fires alongside regular onset on beat 1, both ripples spawn simultaneously
- [D-05-04-2]: Ripple baseX/baseY at unorbited (x, y) coordinates — ripples emanate from node's logical center, not the orbited offset position
- [D-05-04-3]: Beat nudge assigned after decay — ensures fresh onset always restores full +6px regardless of mid-decay state
- [D-05-03-1]: drawGlow reads glowCanvas.width as compositing size — matches createGlowLayer(radius*2) convention; caller owns the radius contract
- [D-05-03-2]: updateBassBreath returns 0.15 static when bpm=null — bass retains faint presence during rubato sections, no harsh on/off
- [D-05-03-3]: Pocket-score gate threshold 0.05 — smallest perceptually meaningful color shift before glowCanvas re-creation; tighter gate causes per-frame HTMLCanvasElement churn
- [D-05-03-4]: finalGlowIntensity = max(breatheIntensity, glowIntensity) — onset always overrides breathing; breath resumes as flash decays via lerpExp
- [D-05-05-1]: Single onset detection before per-node loop — beatPulse and bgPulseProgress set once at top of frame, not rechecked per instrument
- [D-05-05-2]: Downbeat check after drum onset check — downbeat sets beatPulse=4 overriding beat's 2px; bgPulseProgress already set by drum onset (downbeat is coincident)
- [D-05-05-3]: Linear decay for bgPulseProgress (Math.max subtract deltaMs/200) vs lerpExp for beatPulse — linear gives exact 200ms window, lerpExp gives organic snap for radius
- [D-06-01-1]: EdgeAnimState pre-creates two glow canvases at factory time (flashGlowCanvas, resolutionGlowCanvas) — never per frame, mirrors NodeAnimState pattern
- [D-06-01-2]: lastSyncEventSec written when score > 0 in PocketScorer — any non-zero sync pair triggers visual flash (EDGE-05)
- [D-06-01-3]: ctx.save()/ctx.restore() wraps ALL lineDash operations in drawPocketLine — iOS Safari lineDash leaks across draw calls without explicit reset
- [D-06-01-4]: Line terminates at node circumference via normalized direction vector offset — prevents pocket line overlapping node fill circle
- [D-06-01-5]: All 6 edgeAnimStates initialized at CanvasRenderer construction — Plan 02 adds drawCommunicationEdges at same insertion point without architectural change
- [D-06-02-1]: PAIRS pre-computed at module load using nested INSTRUMENT_ORDER loop — zero per-frame allocation; bass_drums excluded as pocket line pair
- [D-06-02-2]: visualState string dispatch ('hidden'/'static_thin'/'subtle'/'animated') — clear intent at each weight threshold without numeric comparisons in draw block
- [D-06-02-3]: nodeRadii 4-element array created in render() per frame — acceptable as small non-typed array from existing values; avoids exposing NodeAnimState internals into edge draw function
- [D-06-02-4]: dashOffset speed 0.04 vs pocket line 0.06 — communication edges animate slightly slower to visually distinguish from the primary pocket line
- [D-06-03-1]: getTintedColor placed in edgeTypes.ts — colocation with TENSION_AMBER_RGB/TENSION_RED_RGB constants it depends on; follows drawGlow.ts pattern
- [D-06-03-2]: tintFactor > 0.01 guard before getTintedColor — skips string allocation when tint is perceptually invisible
- [D-06-03-3]: Resolution flash triggers on all visible edges (weight >= 0.3) plus bass_drums — harmonic resolution illuminates the whole graph
- [D-06-03-4]: prevTension crossing check: prevTension > 0.3 && currentTension <= 0.3 — fires once per resolution event, not continuously
- [D-07-05-1]: NOTE_NAMES not duplicated in KeyDetector — imported from ChordDetector; single source of truth for pitch class names
- [D-07-05-2]: Mode detection splits major-leaning (major, maj7, dom7) vs minor-leaning (all others) — mirrors assignChordFunction logic in ChordDetector
- [D-07-05-3]: confidenceGap as vote weight in detectKey — high-confidence chords drive key inference more than ambiguous ones
- [D-07-05-4]: chordFunctionInKey returns plain string (not enum) — consistent with D-03-02-3 (chordFunction in Zustand is plain string)
- [D-07-04-1]: useSeek takes MutableRefObject<AudioStateRef> as param — hook reads full state (wasPlaying, smoothedAnalyser, rawAnalyser); can't be split to primitive props
- [D-07-04-2]: beatGrid polled inside existing 100ms setInterval — avoids second timer; identity check (bpm + lastDownbeatSec delta < 0.01) prevents spurious re-renders
- [D-07-04-3]: Beat grid at zIndex:0 behind progress fill (zIndex:1) — grid visible through semi-transparent indigo overlay
- [D-07-03-1]: getNodeLayout() returns NodePosition[] reference not copy — positions array is recomputed on resize, not per-frame; returning reference is safe and zero-allocation
- [D-07-03-2]: initMiniCanvas called on selectedInstrument change (not just mount) — canvas element re-mounts when panel appears; ensures correct dpr scaling each time
- [D-07-03-3]: bestWeight threshold 0.3 (same as EDGE-07 communication edge visibility minimum) — consistent partner display threshold
- [D-07-03-4]: timeInRole text percentages read audioStateRef directly in render path — stays current without extra state slice; sparkline/pie drawn on canvas via interval
- [D-07-06-1]: ChordLogPanel uses 500ms setInterval (2fps) separate from 10fps AnalysisTick — key detection is UI-rate, not audio-rate
- [D-07-06-2]: chordLog snapshot via spread operator before processing — prevents mutation during map/reverse operations
- [D-07-06-3]: tensionLevelForFunction uses midpoints (0.1/0.35/0.65/0.85) matching TENSION_TARGETS — consistent tension color semantics across the app
- [D-07-06-4]: getCurrentPosition takes (audioCtx, transport) as separate params (not AudioStateRef) — AudioEngine.ts signature is explicit, not state-object-based
- [D-08-01-1]: correlationBuffer pre-allocated as Float32Array(fftSize=4096) on InstrumentPitchState — follows zero-allocation policy (D-01-05-2); no per-tick allocation in ACF2+
- [D-08-01-2]: Full-spectrum rawTimeDataFloat used for pitch detection gated by activityScore > 0.15 — band-filtering not applied; 3-frame stability window handles transient bleed rejection
- [D-08-01-3]: stablePitchHz field added to InstrumentPitchState (plan had 4 fields; added 5th) — needed by 08-02 call-response detector to track pitch at melodic onset
- [D-08-01-4]: Pitch state initialized only when keyboard AND guitar both in lineup — state.pitch = null otherwise, Phase 8 AnalysisTick block skipped entirely
- [D-08-01-5]: onMelodyUpdate fires every tick when state.pitch non-null (not edge-triggered) — call-response detector needs continuous presence signal, not just change events
- [D-08-02-1]: boundHandleMelodyUpdate pattern — CanvasRenderer intercepts callResponse!=null to set flash=1.0, then forwards to external onMelodyUpdate; avoids polling, preserves callback chain
- [D-08-02-2]: Dual init for callResponse state — explicit in App.tsx plus lazy guard in AnalysisTick (if !state.callResponse); belt-and-suspenders for timing edge cases
- [D-08-02-3]: callResponseFlashIntensity decayed only in CanvasRenderer (not in drawCommunicationEdges) — decay belongs to entity that owns trigger, consistent with resolutionFlashIntensity pattern
- [D-08-02-4]: Purple glow with ctx.globalAlpha = intensity*0.8 then drawGlow(..., 1.0) then globalAlpha restored — avoids full ctx.save()/restore() overhead for simple alpha set
- [D-08-04-1]: Annotation interface defined in useAppStore.ts (not types.ts) — annotations are UI-only, not audio hot-path
- [D-08-04-2]: Annotation input overlay placed outside overflow-hidden scrubber bar in wrapper div — negative-top overlay inside overflow:hidden is clipped entirely
- [D-08-04-3]: Annotation markers at zIndex:2 inside bar — above progress fill (zIndex:1) and beat grid (zIndex:0)
- [D-08-03-1]: ConversationLogPanel subscribes to callResponseLog directly via useAppStore selector (no polling) — entries are pushed as discrete events by onMelodyUpdate; no polling cadence needed unlike chord log
- [D-08-03-2]: onMelodyUpdate Zustand bridge was already wired in VisualizerCanvas.tsx (08-02 Task 2) — Task 2 of 08-03 only required adding ConversationLogPanel to App.tsx JSX

### Pending Todos

None.

### Blockers/Concerns

- [Phase 4+]: Verify Meyda chroma output quality on iOS (48kHz) vs desktop Chrome (44.1kHz) — chromaFilterBank rebuild applied in 03-01, but empirical test with real jazz still needed
- [All phases]: iOS Safari AudioContext `{ sampleRate: 44100 }` constructor option behavior unconfirmed — always read back `audioCtx.sampleRate` after creation
- [All visual phases]: iOS Low Power Mode caps rAF at 30fps — documented known limitation; test with Low Power Mode OFF
- [Note]: Requirements count discrepancy — REQUIREMENTS.md header says 83 but traceability table contains 96 entries across all categories. All 96 entries are mapped in the roadmap. Reconcile count before Phase 2 planning.

## Session Continuity

Last session: 2026-03-11
Stopped at: Completed 08-03-PLAN.md — ConversationLogPanel (MEL-05) complete.
Resume file: None
