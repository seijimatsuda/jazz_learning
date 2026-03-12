# Requirements: Jazz Communication Visualizer v1.2

**Defined:** 2026-03-12
**Core Value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching

## v1.2 Requirements

### Disambiguation Foundation

- [x] **DISC-FND-01**: Raw activity scores are preserved separately from disambiguated display scores (prevents cascade suppression)
- [x] **DISC-FND-02**: Hand-rolled spectralFlatness extractor replaces broken Meyda implementation (Math.log(0) bug)
- [x] **DISC-FND-03**: Disambiguation state uses pre-allocated Float32Array ring buffers initialized per lineup composition
- [x] **DISC-FND-04**: Tutti detection guard sets all disambiguators to equal weight when all instruments active >0.6
- [x] **DISC-FND-05**: Each disambiguator only runs when its relevant instrument pair is present in the lineup

### Instrument Pair Disambiguation

- [x] **DISC-01**: Trombone vs bass disambiguation via onset timing and spectral flatness
- [x] **DISC-02**: Vibraphone vs keyboard disambiguation via tremolo modulation detection (3-7 Hz amplitude modulation)
- [x] **DISC-03**: Horn section disambiguation via spectral centroid hierarchy (trombone < sax < trumpet) when 3+ horns present
- [x] **DISC-04**: Disambiguation confidence indicator visible per instrument when analysis is uncertain
- [x] **DISC-05**: Saxophone and keyboard disambiguation via band-limited chroma entropy when both present

### Visual Family Identity

- [ ] **VIS-01**: Instrument family color coding via ring stroke on canvas nodes (fill remains role-based)
- [ ] **VIS-02**: Family-sorted circular layout clusters related instruments (horns together, rhythm together)
- [ ] **VIS-03**: Edge animation style varies by communication type (rhythmic: beat-pulse, melodic: gradient, support: opacity breathe)

### Tech Debt

- [ ] **DEBT-01**: Remove edge fallback operator (`?? 'support'` in drawCommunicationEdges.ts) that never triggers for valid lineups
- [ ] **DEBT-02**: Add crash guard for malformed pair keys in drawCommunicationEdges.ts
- [ ] **DEBT-03**: Address single-read lineup pattern brittleness in VisualizerCanvas

## Future Requirements (v1.3+)

- Per-instrument calibration windows
- Session preset templates (quartet, quintet, etc.)
- Disambiguation debug overlay for development/calibration
- Adaptive threshold learning from user feedback

## Out of Scope

| Feature | Reason |
|---------|--------|
| >80% accuracy claims on mixed stereo | Physically unachievable without stem separation |
| Per-instrument isolated confidence scores | Implies stem separation capability |
| Automatic threshold adaptation | Too complex without ML, manual calibration only |
| ML-based instrument classification | Too heavy for browser (TF.js, ONNX), out of scope entirely |
| Mid-playback lineup changes | Requires re-calibration and full state reset |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-FND-01 | Phase 12 | Complete |
| DISC-FND-02 | Phase 12 | Complete |
| DISC-FND-03 | Phase 12 | Complete |
| DISC-FND-04 | Phase 12 | Complete |
| DISC-FND-05 | Phase 12 | Complete |
| DISC-01 | Phase 12 | Complete |
| DISC-02 | Phase 12 | Complete |
| DISC-03 | Phase 12 | Complete |
| DISC-04 | Phase 12 | Complete |
| DISC-05 | Phase 12 | Complete |
| VIS-01 | Phase 13 | Pending |
| VIS-02 | Phase 13 | Pending |
| VIS-03 | Phase 13 | Pending |
| DEBT-01 | Phase 14 | Pending |
| DEBT-02 | Phase 14 | Pending |
| DEBT-03 | Phase 14 | Pending |

**Coverage:**
- v1.2 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after roadmap creation*
