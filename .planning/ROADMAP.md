# Roadmap: Jazz Communication Visualizer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-03-11) → [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Flexible Lineup** — Phases 9-11 (shipped 2026-03-12) → [Archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Instrument Disambiguation** — Phases 12-14 (in progress)

---

### 🚧 v1.2 Instrument Disambiguation (In Progress)

**Milestone Goal:** Improve analysis accuracy by disambiguating overlapping instrument pairs (sax/keyboard, vibes/keyboard, trombone/bass, multi-horn), add instrument family visual identity (color coding, spatial grouping, typed edge animations), and close v1.1 tech debt.

- [ ] **Phase 12: Disambiguation Engine** — Raw/display score split, spectral extractors, and all 4 instrument pair disambiguators
- [ ] **Phase 13: Visual Family Identity** — Instrument family color coding, spatial clustering, and typed edge animations
- [ ] **Phase 14: Tech Debt and Polish** — Remove dead code, add crash guards, fix lineup pattern brittleness

## Phase Details

### Phase 12: Disambiguation Engine
**Goal**: Overlapping instrument pairs produce meaningfully different activity scores when playing simultaneously
**Depends on**: Nothing (first phase of v1.2; builds on v1.1 codebase)
**Requirements**: DISC-FND-01, DISC-FND-02, DISC-FND-03, DISC-FND-04, DISC-FND-05, DISC-01, DISC-02, DISC-03, DISC-04, DISC-05
**Success Criteria** (what must be TRUE):
  1. When trombone and bass are both in the lineup, their activity scores diverge during passages where one is clearly louder or more active than the other (not locked together)
  2. When vibraphone and keyboard are both selected, tremolo passages produce higher vibes activity and lower keyboard activity
  3. When saxophone and keyboard are both selected, monophonic sax runs show higher sax activity than keyboard activity
  4. When 3+ horns are selected, spectral centroid ordering produces differentiated activity levels rather than identical scores
  5. During tutti passages (all instruments active above 0.6), disambiguation weights reset to equal (no false precision) and confidence indicators reflect uncertainty
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD
- [ ] 12-03: TBD

**Build order constraints (from research):**
- Wave 1: types.ts raw/display score split + DisambiguationState buffers + instrumentFamilies.ts constants — MUST land before any disambiguator code
- Wave 2: Hand-rolled spectralFlatness + TromboneBassDisambiguator + SaxKeyboardDisambiguator (chroma entropy with band-limiting)
- Wave 3: VibesKeyboardDisambiguator (tremolo detection, stateful) + HornSectionDisambiguator (spectral centroid hierarchy)

**Research flags:** Phase 12 needs `/gsd:research-phase` — chroma entropy thresholds, spectralFlatness implementation, tremolo window sizing all need deeper investigation during planning.

### Phase 13: Visual Family Identity
**Goal**: Users can visually distinguish instrument families and communication types at a glance on the canvas
**Depends on**: Nothing (independent of Phase 12 — visual changes only, no disambiguation dependency)
**Requirements**: VIS-01, VIS-02, VIS-03
**Success Criteria** (what must be TRUE):
  1. Each instrument node displays a colored ring stroke indicating its family (brass, woodwind, rhythm, keyboard) while the fill color still reflects the current role (soloing/comping/holding/silent)
  2. Instruments from the same family appear adjacent on the circular layout (horns cluster together, rhythm section clusters together) rather than in arbitrary order
  3. Communication edges between instrument pairs animate differently based on type — rhythmic edges pulse with the beat, melodic edges show a gradient flow, support edges breathe in opacity
**Plans**: TBD

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD

### Phase 14: Tech Debt and Polish
**Goal**: Codebase is cleaned up from v1.1 audit findings — no dead code paths, no crash risks from malformed data
**Depends on**: Phase 12, Phase 13 (cleanup runs last to catch any new debt from disambiguation and visual work)
**Requirements**: DEBT-01, DEBT-02, DEBT-03
**Success Criteria** (what must be TRUE):
  1. The `?? 'support'` fallback operator in drawCommunicationEdges.ts is removed and all edge types resolve correctly without it for every valid lineup
  2. Malformed pair keys (e.g., missing instrument, empty string, wrong separator) in drawCommunicationEdges.ts produce a logged warning and skip rendering instead of crashing the canvas
  3. The lineup configuration in VisualizerCanvas is read reactively from state (not captured once on mount), so hot-swapping between recordings with different lineups works without a full remount
**Plans**: TBD

Plans:
- [ ] 14-01: TBD

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
| 9. Data Layer and Structural Refactor | v1.1 | 4/4 | Complete | 2026-03-12 |
| 10. Band Setup UI and Canvas Layout | v1.1 | 3/3 | Complete | 2026-03-12 |
| 11. Gap Closures | v1.1 | 2/2 | Complete | 2026-03-12 |
| 12. Disambiguation Engine | v1.2 | 0/? | Not started | - |
| 13. Visual Family Identity | v1.2 | 0/? | Not started | - |
| 14. Tech Debt and Polish | v1.2 | 0/? | Not started | - |
