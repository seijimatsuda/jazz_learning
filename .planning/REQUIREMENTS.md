# Requirements: Jazz Communication Visualizer v1.1

**Defined:** 2026-03-11
**Core Value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching

## v1.1 Requirements

### Instrument Data Layer

- [ ] **INST-01**: User can select saxophone as an instrument in the band lineup
- [ ] **INST-02**: User can select trumpet as an instrument in the band lineup
- [ ] **INST-03**: User can select trombone as an instrument in the band lineup
- [ ] **INST-04**: User can select vibraphone as an instrument in the band lineup
- [ ] **INST-05**: Each new instrument has defined frequency band mappings for the FFT splitter
- [ ] **INST-06**: Calibration pass adapts to whichever instruments are selected (2-8)
- [ ] **INST-07**: Role classification (soloing/comping/holding/silent) works for all 8 instrument types
- [x] **INST-08**: ~~Saxophone and keyboard are disambiguated via chroma entropy when both present~~ → Deferred to v1.2 (DISC-05). Both share mid band (250-2000 Hz); disambiguation requires empirical calibration on real recordings.

### Band Setup

- [ ] **BAND-01**: User can select any combination of 2-8 instruments before playback
- [ ] **BAND-02**: Band setup panel shows all 8 available instruments as toggles
- [ ] **BAND-03**: Analysis pipeline initializes with only the selected instruments

### Canvas Layout

- [ ] **CANV-01**: Node graph uses circular layout algorithm adapting to 2-8 instruments
- [ ] **CANV-02**: Bass node remains gravitational center regardless of instrument count
- [ ] **CANV-03**: Non-animated edges are batch-rendered for iOS performance at high counts
- [ ] **CANV-04**: Weak communication edges auto-hide when instrument count exceeds 5

### Gap Closures

- [ ] **FIX-01**: loadExample works on iOS Safari (AudioContext gesture fix)
- [ ] **FIX-02**: Dead code removed (InstrumentRoleOverlay)
- [ ] **FIX-03**: console.logs removed from hot paths
- [ ] **FIX-04**: Pocket line gracefully handles lineups without bass or drums

## Future Requirements

### Disambiguation (v1.2)

- **DISC-01**: Trombone vs bass disambiguation via onset timing and spectral flatness
- **DISC-02**: Vibraphone vs keyboard disambiguation via tremolo modulation detection
- **DISC-03**: Horn section disambiguation (sax vs trumpet vs trombone when 3+ horns present)
- **DISC-04**: Instrument family color coding in node graph
- **DISC-05**: Saxophone and keyboard disambiguation via chroma entropy when both present (moved from INST-08)

### Advanced Layout (v1.2+)

- **LAYT-01**: Instrument family spatial grouping (horns cluster, rhythm section clusters)
- **LAYT-02**: Edge animation style varies by communication type (rhythmic, harmonic, melodic)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mid-playback lineup changes | Requires re-calibration and state reset — complexity not justified for v1.1 |
| Stem separation for disambiguation | Requires ML models too heavy for browser — out of scope entirely |
| Big band support (15+ instruments) | Edge count and frequency overlap make analysis unreliable beyond ~8 instruments |
| Vibes/keyboard simultaneous selection | Acoustically indistinguishable via FFT — defer to v1.2 with tremolo detection |
| Force-directed layout | Circular layout is deterministic, faster, and converges to same result for uniform-weight graphs |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INST-01 | Phase 9 | Complete |
| INST-02 | Phase 9 | Complete |
| INST-03 | Phase 9 | Complete |
| INST-04 | Phase 9 | Complete |
| INST-05 | Phase 9 | Complete |
| INST-06 | Phase 9 | Complete |
| INST-07 | Phase 9 | Complete |
| INST-08 | Deferred → v1.2 (DISC-05) | Deferred |
| BAND-01 | Phase 10 | Pending |
| BAND-02 | Phase 10 | Pending |
| BAND-03 | Phase 9 | Complete |
| CANV-01 | Phase 10 | Pending |
| CANV-02 | Phase 10 | Pending |
| CANV-03 | Phase 10 | Pending |
| CANV-04 | Phase 10 | Pending |
| FIX-01 | Phase 11 | Pending |
| FIX-02 | Phase 11 | Pending |
| FIX-03 | Phase 11 | Pending |
| FIX-04 | Phase 11 | Pending |

**Coverage:**
- v1.1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 — phase assignments added for v1.1 roadmap*
