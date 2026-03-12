# Roadmap: Jazz Communication Visualizer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-03-11) → [Archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Flexible Lineup** — Phases 9-11 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) — SHIPPED 2026-03-11</summary>

### Phase 1: Audio Pipeline Foundation
**Goal**: Users can upload a jazz recording and the app ingests it into a Web Audio analysis pipeline
**Plans**: 5 plans

Plans:
- [x] 01-01: Vite + React project scaffold with TypeScript
- [x] 01-02: Web Audio API pipeline (AudioContext, AnalyserNode, FFT)
- [x] 01-03: iOS Safari AudioContext compatibility layer
- [x] 01-04: 3-second calibration pass and frequency band splitter
- [x] 01-05: Audio playback controls and file upload UI

### Phase 2: Instrument Activity Analysis
**Goal**: The app scores each instrument's activity level and classifies its current role in real time
**Plans**: 5 plans

Plans:
- [x] 02-01: InstrumentActivityScorer with per-band RMS scoring
- [x] 02-02: Role classification (soloing/comping/holding/silent)
- [x] 02-03: Keyboard vs guitar disambiguation via ZCR + spectral flux
- [x] 02-04: AnalysisTick orchestrator (10fps loop)
- [x] 02-05: audioStateRef pattern wiring

### Phase 3: Chord Detection & Harmonic Analysis
**Goal**: The app identifies the current chord and assigns a harmonic tension score in real time
**Plans**: 5 plans

Plans:
- [x] 03-01: Chroma vector extraction from AnalyserNode
- [x] 03-02: Chord template matching (8 chord types)
- [x] 03-03: Chord function labels and key detection
- [x] 03-04: Harmonic tension scoring (0.0–1.0) with smoothing
- [x] 03-05: Tension heatmap pre-computation for timeline

### Phase 4: Beat Detection, BPM & Pocket Score
**Goal**: The app tracks the beat, displays BPM, and scores bass/drums rhythmic synchronization
**Plans**: 4 plans

Plans:
- [x] 04-01: Dual-stream onset detection
- [x] 04-02: BPM derivation with swing ratio handling
- [x] 04-03: Pocket score (bass ↔ drums ±80ms window)
- [x] 04-04: Rubato suppression and beat confidence display

### Phase 5: Canvas Node Graph
**Goal**: Instrument roles and communication are rendered as an animated node graph on canvas
**Plans**: 5 plans

Plans:
- [x] 05-01: Canvas scaffolding and rAF loop at 60fps
- [x] 05-02: Node layout (4-node diamond), positions, and click detection
- [x] 05-03: Role-based node visual states (glow, ripple, orbit)
- [x] 05-04: Bass gravitational center with amber breathing glow
- [x] 05-05: Beat-synchronized canvas pulse

### Phase 6: Edge Visualization
**Goal**: Communication edges between instruments are rendered with tension-tinted colors and the pocket line is always visible
**Plans**: 3 plans

Plans:
- [x] 06-01: Cross-correlation edge scoring between instrument pairs
- [x] 06-02: Tension-tinted edges with resolution flash
- [x] 06-03: Pocket line (always visible, animated, floating label)

### Phase 7: React UI Panels & Key Detection
**Goal**: Users can view chord logs, tension meter, key detection, and node detail in the full React UI
**Plans**: 6 plans

Plans:
- [x] 07-01: Vertical tension meter with color gradient
- [x] 07-02: Timeline scrubber with tension heatmap and bar/beat grid
- [x] 07-03: Chord log drawer (timestamped, clickable)
- [x] 07-04: Band setup panel and node detail panel
- [x] 07-05: Key detection with chord function relative to key
- [x] 07-06: BPM display and role legend

### Phase 8: Advanced Features
**Goal**: Users can annotate, export, and detect melodic call-and-response in their recordings
**Plans**: 5 plans

Plans:
- [x] 08-01: Pitch detection (melody tracking)
- [x] 08-02: Call-and-response detection
- [x] 08-03: User annotations on timeline
- [x] 08-04: Export session as JSON or image
- [x] 08-05: loadExample with example track

</details>

### 🚧 v1.1 Flexible Lineup (In Progress)

**Milestone Goal:** Support any jazz combo instrument combination (2-8 instruments) with dynamic canvas layout, replacing the hardcoded 4-instrument limitation, plus v1.0 gap closures.

#### Phase 9: Data Layer and Structural Refactor
**Goal**: The analysis and render pipeline correctly handles any lineup of 2-8 instruments without crashing or silently failing
**Depends on**: Phase 8 (v1.0 complete)
**Requirements**: INST-01, INST-02, INST-03, INST-04, INST-05, INST-06, INST-07, INST-08, BAND-03
**Success Criteria** (what must be TRUE):
  1. A lineup containing any combination of 8 supported instruments (keyboard, bass, drums, guitar, saxophone, trumpet, trombone, vibraphone) compiles cleanly with no TypeScript errors
  2. The canvas does not crash or produce a blank frame for any instrument count from 2 to 8
  3. The pocket line does not throw when bass or drums is absent from the lineup
  4. The analysis pipeline initializes only the instruments in the active lineup — no phantom scoring for unselected instruments
  5. All 28 possible instrument pairs have defined edge type entries (no silent fallback to a default)
**Plans**: TBD

Plans:
- [ ] 09-01: Expand InstrumentName union and frequency band definitions (INST-01–05)
- [ ] 09-02: Generalize InstrumentActivityScorer and calibration for variable lineups (INST-06, INST-07, BAND-03)
- [ ] 09-03: Replace PAIRS IIFE, fix CanvasRenderer constructor, and add circular layout for 2-8 (INST-08, CANV-01 partial)
- [ ] 09-04: Guard pocket line and update AnalysisTick/App.tsx pitch wiring

#### Phase 10: Band Setup UI and Canvas Layout
**Goal**: Users can select any combination of 2-8 instruments in the setup UI and see a readable canvas layout that adapts to the lineup
**Depends on**: Phase 9
**Requirements**: BAND-01, BAND-02, CANV-01, CANV-02, CANV-03, CANV-04
**Success Criteria** (what must be TRUE):
  1. The band setup panel shows all 8 instruments as toggleable options and enforces a 2-8 count constraint
  2. The node graph arranges instruments in a circular layout that remains readable at both 2 and 8 instruments on a 320px-wide iOS screen
  3. Bass always occupies the gravitational center position regardless of how many instruments are selected
  4. At 6-8 instruments, weak communication edges auto-hide and non-animated edges are batch-rendered without canvas stuttering
**Plans**: TBD

Plans:
- [ ] 10-01: BandSetupPanel — add 4 instruments, family grouping, count badge, 2-8 validation (BAND-01, BAND-02)
- [ ] 10-02: Circular layout engine and VisualizerCanvas wiring (CANV-01, CANV-02)
- [ ] 10-03: Edge batching, dynamic threshold, and node scaling (CANV-03, CANV-04)

#### Phase 11: Gap Closures
**Goal**: The four v1.0 known gaps are resolved and the codebase is production-clean
**Depends on**: Phase 10
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04
**Success Criteria** (what must be TRUE):
  1. Tapping "Load Example" on an iOS Safari browser loads and begins playing the example track without an AudioContext error
  2. The InstrumentRoleOverlay component and all its imports are gone from the codebase
  3. No console.log calls appear in any hot-path file (AnalysisTick.ts, CanvasRenderer.ts, drawCommunicationEdges.ts)
  4. Loading a recording with a lineup that omits bass or drums does not produce a console error or visual glitch on the pocket line
**Plans**: TBD

Plans:
- [ ] 11-01: iOS AudioContext gesture fix for loadExample and dead code removal (FIX-01, FIX-02)
- [ ] 11-02: console.log audit and pocket line guard (FIX-03, FIX-04)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Audio Pipeline Foundation | v1.0 | 5/5 | Complete | 2026-03-10 |
| 2. Instrument Activity Analysis | v1.0 | 5/5 | Complete | 2026-03-11 |
| 3. Chord Detection & Harmonic Analysis | v1.0 | 5/5 | Complete | 2026-03-11 |
| 4. Beat Detection, BPM & Pocket Score | v1.0 | 4/4 | Complete | 2026-03-10 |
| 5. Canvas Node Graph | v1.0 | 5/5 | Complete | 2026-03-10 |
| 6. Edge Visualization | v1.0 | 3/3 | Complete | 2026-03-11 |
| 7. React UI Panels & Key Detection | v1.0 | 6/6 | Complete | 2026-03-11 |
| 8. Advanced Features | v1.0 | 5/5 | Complete | 2026-03-11 |
| 9. Data Layer and Structural Refactor | v1.1 | 0/4 | Not started | - |
| 10. Band Setup UI and Canvas Layout | v1.1 | 0/3 | Not started | - |
| 11. Gap Closures | v1.1 | 0/2 | Not started | - |
