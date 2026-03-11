# Roadmap: Jazz Communication Visualizer

## Overview

The build proceeds as a strict dependency chain through the audio pipeline, then fans out into parallel analysis modules, Canvas rendering, and React UI. The goal is a browser-native tool accurate enough that a jazz musician recognizes what is happening in the music by watching the visualization alone. Eight phases deliver that from scaffolding through advanced analysis features, with iOS Safari compatibility as a zero-tolerance constraint baked into Phase 1 — not deferred.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Audio Pipeline Foundation** - iOS-safe AudioContext, dual AnalyserNode, FrequencyBandSplitter, audioStateRef shape, all performance constraints locked in
- [x] **Phase 2: Instrument Activity Analysis** - Per-instrument frequency band analysis, activity scoring, role classification, cross-correlation edge detection
- [x] **Phase 3: Chord Detection & Harmonic Analysis** - Chroma extraction, 8-chord template matching, tension scoring, smoothing and confidence display
- [x] **Phase 4: Beat Detection, BPM & Pocket Score** - Dual-stream beat detection, swing ratio handling, BPM derivation, pocket score with rubato suppression
- [x] **Phase 5: Canvas Node Graph** - Animated node graph with role-based visuals, beat-synchronized pulse, offscreen glow compositing, layout engine
- [ ] **Phase 6: Edge Visualization** - Pocket line rendering, communication edges, tension tinting, resolution flash
- [ ] **Phase 7: React UI Panels & Key Detection** - All React panels (band setup, node detail, chord log, tension meter, timeline), key detection, chord function labels
- [ ] **Phase 8: Advanced Features** - Melody and call-and-response analysis, user annotations, export, pre-loaded example tracks

## Phase Details

### Phase 1: Audio Pipeline Foundation
**Goal**: Users can upload a jazz recording and have it analyzed by a cross-platform, iOS-safe audio pipeline that never breaks on iPhone
**Depends on**: Nothing (first phase)
**Requirements**: AUDIO-01, AUDIO-02, AUDIO-03, AUDIO-04, AUDIO-05, AUDIO-06, AUDIO-07, AUDIO-08, AUDIO-09, XCUT-01, XCUT-02, XCUT-03, XCUT-04
**Success Criteria** (what must be TRUE):
  1. User can upload an MP3 or WAV file on both iOS Safari and desktop Chrome, and playback begins without silent failure
  2. Transport controls (play, pause, seek) work correctly, and the timeline scrubber tracks current position
  3. The 3-second calibration pass runs on load and sets per-instrument thresholds before playback starts
  4. Canvas animation runs at 60fps on desktop and does not drop below 40fps on iPhone (no shadowBlur, no per-frame GC, HiDPI scaling correct)
  5. All FFT bin math uses `hzToBin(hz, audioCtx.sampleRate, fftSize)` — no hardcoded indices — confirmed by reading `audioCtx.sampleRate` on both platforms
**Plans**: 5 plans in 5 waves (sequential dependency chain)

Plans:
- [x] 01-01-PLAN.md — Vite + React + TypeScript scaffold, Tailwind 4, Zustand, Meyda.js, core types (Wave 1)
- [x] 01-02-PLAN.md — iOS-safe AudioContext, FileReader upload, decodeAudioData, useAudioRef hook (Wave 2)
- [x] 01-03-PLAN.md — Dual AnalyserNode setup, FrequencyBandSplitter, hzToBin, typed array pre-allocation (Wave 3)
- [x] 01-04-PLAN.md — CalibrationPass, transport controls (play/pause/seek), timeline scrubber (Wave 4)
- [x] 01-05-PLAN.md — Canvas renderer, offscreen glow, tension heatmap, HiDPI scaling, iOS smoke test (Wave 5)

### Phase 2: Instrument Activity Analysis
**Goal**: Users can see each instrument's real-time activity level and role classification update as the music plays, with keyboard vs guitar correctly disambiguated
**Depends on**: Phase 1
**Requirements**: INST-01, INST-02, INST-03, INST-04, INST-05, INST-06, INST-07, INST-08, INST-09
**Success Criteria** (what must be TRUE):
  1. Each instrument shows a 0.0–1.0 activity score that visibly changes with musical content
  2. Role labels (soloing / comping / holding / silent) update at ~10fps and are recognizably correct on a real jazz recording
  3. When both keyboard and guitar are in the lineup, disambiguation via ZCR + spectral flux assigns activity to the correct instrument
  4. Cross-correlation edges between instrument pairs appear and disappear based on whether instruments are interacting, and edges below 0.3 are suppressed
  5. Rolling 10-second activity history and cumulative time-in-role are tracked and available for UI consumption
**Plans**: 5 plans in 4 waves (sequential + parallel + gap closure)

Plans:
- [x] 02-01-PLAN.md — InstrumentActivityScorer — per-band RMS → 0.0–1.0 activity score at 10fps (Wave 1)
- [x] 02-02-PLAN.md — RoleClassifier — activity thresholds → soloing/comping/holding/silent state machine (Wave 2)
- [x] 02-03-PLAN.md — Keyboard vs guitar disambiguation (ZCR + spectral flux) and single-instrument fallback (Wave 2)
- [x] 02-04-PLAN.md — Cross-correlation edge detection (2-second sliding window, weight < 0.3 suppression), rolling history (Wave 3)
- [x] 02-05-PLAN.md — InstrumentRoleOverlay gap closure — visible role labels and activity scores (Wave 4)

### Phase 3: Chord Detection & Harmonic Analysis
**Goal**: Users see the current chord name with confidence indicator and a smooth harmonic tension score that rises and falls with the music's harmonic movement
**Depends on**: Phase 1
**Requirements**: CHORD-01, CHORD-02, CHORD-03, CHORD-04, CHORD-05, CHORD-06, CHORD-07, CHORD-08, CHORD-09, CHORD-10, CHORD-11, TENS-01, TENS-02, TENS-03, TENS-04, TENS-05, TENS-06
**Success Criteria** (what must be TRUE):
  1. Chord display updates to a recognizable jazz chord name (maj7, m7, dom7, dim7, m7b5, alt) that a musician would agree with for clear-harmony passages
  2. Low-confidence detections show chord family ("dominant chord") rather than a specific name, preventing false-positive chord claims
  3. Harmonic tension score (0.0–1.0) moves smoothly without flicker, visibly higher on dominant/altered chords than on tonic chords
  4. The vertical tension meter with blue→amber→orange→red gradient and 3-second ghost line is visible and updating during playback
  5. The pre-computed tension heatmap on the timeline is visible on file load, before playback begins
**Plans**: TBD

Plans:
- [ ] 03-01: ChordDetector — chroma extraction via Meyda, bass band weighting, cosine similarity against 8 chord templates
- [ ] 03-02: Confidence gap scoring, 300ms smoothing, flicker prevention (>200ms hold), low/high confidence display paths
- [ ] 03-03: Chord function assignment (tonic/subdominant/dominant/altered) with plain English labels
- [ ] 03-04: TensionScorer — chord function → tension 0.0–1.0, lerp smoothing, rolling history
- [ ] 03-05: Tension meter Canvas rendering (gradient bar, ghost line, pre-computed heatmap on timeline)

### Phase 4: Beat Detection, BPM & Pocket Score
**Goal**: Users see an accurate BPM reading and pocket score that reflect what the rhythm section is actually doing, with honest "—" display for rubato passages
**Depends on**: Phase 1
**Requirements**: BEAT-01, BEAT-02, BEAT-03, BEAT-04, BEAT-05, BEAT-06, BEAT-07, BEAT-08, BEAT-09, BEAT-10
**Success Criteria** (what must be TRUE):
  1. BPM display shows a correct tempo for straight-time jazz recordings and displays "♩ = —" for free/rubato passages rather than a wrong number
  2. Swing recordings do not report 2× the actual BPM (swing ratio detection is working)
  3. Pocket score (0.0–1.0) is visibly higher on tightly synchronized bass-drums moments and suppressed when BPM confidence is low
  4. Timing offset (bass ahead / drums ahead) in milliseconds is computed and available for edge rendering
  5. Downbeat detection marks beat 1 of each bar and is available to the Canvas renderer
**Plans**: TBD

Plans:
- [ ] 04-01: Drum transient detection (spectral flux, ride 6–10kHz + snare 200–800Hz, adaptive threshold)
- [ ] 04-02: Bass onset detection (RMS delta, 20–250Hz), BPM derivation via autocorrelation (6-second window)
- [ ] 04-03: Swing ratio detection, rubato suppression (IOI coefficient of variation > 0.3), downbeat inference
- [ ] 04-04: PocketScorer — ±80ms cross-correlation window, rolling 8-beat average, timing offset, rubato suppression gate

### Phase 5: Canvas Node Graph
**Goal**: Users see an animated node graph where each instrument is a visual entity whose size, color, and animation reflect its musical role and beat activity — and the graph breathes with the music
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05, VIZ-06, VIZ-07, VIZ-08, VIZ-09, VIZ-10, VIZ-11, VIZ-12, VIZ-13
**Success Criteria** (what must be TRUE):
  1. The canvas displays 2–4 instrument nodes in the correct layout (horizontal / triangle / diamond) against the dark background (#0a0a0f)
  2. Nodes animate visibly on drum beats — drums node nudges +6px and ripples, all nodes pulse +2px, background lightens briefly
  3. Bass node glows with amber (#b45309) on bass onsets, glow intensity visibly shifts with pocket score (amber = tight, blue = loose)
  4. Role-based node states are visually distinct — a soloing instrument looks clearly different from a comping or silent one
  5. Canvas animation stays smooth at 60fps with no visible jank during simultaneous FFT analysis — confirmed on iPhone hardware
**Plans**: 5 plans in 4 waves

Plans:
- [x] 05-01-PLAN.md — CanvasRenderer refactor: delta-time rAF loop, NodeLayout engine, NodeAnimState types, instrument diamond layout (Wave 1)
- [x] 05-02-PLAN.md — Role-based node drawing: circles sized/colored by role, labels, smooth transitions via lerpExp (Wave 2)
- [x] 05-03-PLAN.md — Bass node animations: breathing glow, onset flash, 800ms ring, pocket-score color shift (Wave 3)
- [x] 05-04-PLAN.md — Drums node animations: +6px beat nudge, crisp ripple, downbeat double-ripple, timing offset orbit (Wave 3)
- [x] 05-05-PLAN.md — Beat-responsive canvas: all-node pulse, background breath, iOS perf verification checkpoint (Wave 4)

### Phase 6: Edge Visualization
**Goal**: Users see the relationships between instruments rendered as animated lines — the pocket line always visible between bass and drums, other edges appearing and fading as instruments communicate
**Depends on**: Phase 5
**Requirements**: EDGE-01, EDGE-02, EDGE-03, EDGE-04, EDGE-05, EDGE-06, EDGE-07, EDGE-08, EDGE-09, EDGE-10
**Success Criteria** (what must be TRUE):
  1. A line between bass and drums is always visible, changes color/weight/animation based on pocket score level, and shows a floating text label ("deep in the pocket" / "locked in" / "swinging loose" / "playing free")
  2. Communication edges between other instrument pairs appear, thicken, and fade as the cross-correlation weight changes, and are hidden below 0.3
  3. Edges visibly shift from their base color toward amber/orange at high harmonic tension and flash cool blue-white when tension resolves
  4. Edge flash on confirmed sync event is visible as a brief bright pulse on the pocket line
**Plans**: 3 plans in 3 waves (sequential dependency chain)

Plans:
- [ ] 06-01-PLAN.md — Edge foundation (EdgeAnimState, edgeTypes, lastSyncEventSec data gap) + pocket line rendering with 3 visual states, sync flash, floating label (Wave 1)
- [ ] 06-02-PLAN.md — Communication edge rendering: weight thresholds, thickness/opacity mapping, edge type coloring, animated vs static states (Wave 2)
- [ ] 06-03-PLAN.md — Tension tinting (amber/orange/red shift on all edges) + resolution flash (blue-white on tension drop) (Wave 3)

### Phase 7: React UI Panels & Key Detection
**Goal**: Users can configure the band lineup, read chord names and tension values in real-time React panels, inspect any instrument's history by clicking its node, and navigate the chord log
**Depends on**: Phase 3, Phase 4, Phase 5
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, UI-09, UI-10, UI-11, UI-12, KEY-01, KEY-02, KEY-03
**Success Criteria** (what must be TRUE):
  1. User can add and remove instruments (keyboard, bass, drums, guitar) from the band setup panel before loading audio, and the node graph reflects the lineup
  2. Clicking an instrument node opens a detail panel showing current role badge, 10-second sparkline, time-in-role pie chart, and most active partner
  3. Chord log below the timeline shows timestamped chord detections color-coded by tension, and clicking any entry jumps playback to that moment
  4. Key detection runs from chord history and displays chord function relative to detected key (e.g. "G7 is the V chord in C major")
  5. BPM display, role legend, and bar/beat grid overlay on the timeline all show correct values during playback
**Plans**: TBD

Plans:
- [ ] 07-01: BandSetupPanel — instrument dropdown, rows with icon/name/band label/remove, lineup state management
- [ ] 07-02: TensionMeter + ChordDisplay + BPM display — reads audioStateRef via 2fps polling, no React re-render in hot path
- [ ] 07-03: Node detail panel — role badge, activity sparkline, time-in-role pie chart, most-active partner
- [ ] 07-04: Timeline scrubber — tension heatmap overlay, bar/beat grid, seek handler
- [ ] 07-05: KEY detection module (rolling chord history), chord function relative to key display
- [ ] 07-06: Chord log panel — expandable drawer, timestamped entries, color-coded by tension, clickable seek

### Phase 8: Advanced Features
**Goal**: Users can detect melodic call-and-response between instruments, annotate moments on the timeline, export sessions, and explore the app via pre-loaded example tracks
**Depends on**: Phase 7
**Requirements**: MEL-01, MEL-02, MEL-03, MEL-04, MEL-05, USER-01, USER-02, USER-03, USER-04
**Success Criteria** (what must be TRUE):
  1. Pitch detection runs on keyboard/guitar frequency bands and distinguishes melodic activity (pitch movement) from energetic activity (just loud)
  2. Call-and-response detection identifies keyboard → guitar exchanges within the 2–4 second window, highlights them with an animated purple edge, and logs them in the conversation panel
  3. User can click any point on the timeline to add a text annotation, which persists for the session
  4. User can export the full session as JSON (all analysis data plus annotations) and as a canvas screenshot PNG
  5. At least one pre-loaded example track with expert annotations is available for users who have not uploaded their own file
**Plans**: TBD

Plans:
- [ ] 08-01: Pitch detection module (YIN/autocorrelation on mid-range bands), melodic vs energetic activity distinction
- [ ] 08-02: Call-and-response detector (2–4s window, keyboard→guitar), animated purple conversation edge
- [ ] 08-03: Conversation log panel — timestamped call/response entries, clickable seek
- [ ] 08-04: User annotations on timeline — click-to-annotate, text input, annotation markers
- [ ] 08-05: Export (JSON session data + annotations, canvas screenshot PNG), pre-loaded example tracks with expert annotations

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Audio Pipeline Foundation | 5/5 | Complete | 2026-03-10 |
| 2. Instrument Activity Analysis | 5/5 | Complete | 2026-03-11 |
| 3. Chord Detection & Harmonic Analysis | 5/5 | Complete | 2026-03-11 |
| 4. Beat Detection, BPM & Pocket Score | 4/4 | Complete | 2026-03-10 |
| 5. Canvas Node Graph | 5/5 | Complete | 2026-03-10 |
| 6. Edge Visualization | 0/3 | Not started | - |
| 7. React UI Panels & Key Detection | 0/6 | Not started | - |
| 8. Advanced Features | 0/5 | Not started | - |
