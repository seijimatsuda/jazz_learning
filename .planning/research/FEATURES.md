# Feature Landscape: Jazz Audio Visualization

**Domain:** Browser-based music analysis and visualization for jazz ensemble audio
**Researched:** 2026-03-11 (v1.1 milestone update — flexible instrument lineup + dynamic canvas layout)
**Confidence note:** Research conducted with WebSearch (2026-03-11). Frequency range data cross-referenced with
DPA Microphones acoustic characteristics reference and published EQ charts. Node graph layout patterns
verified against Cytoscape.js and D3/force-graph documentation via WebSearch. Instrument role detection
findings from ISMIR 2018 paper (CNN-based jazz solo instrument classification) and 2025 lead instrument
detection paper (arxiv). Claims about Web Audio API and Canvas API behavior are HIGH confidence from
existing v1.0 implementation experience plus spec knowledge.

---

## Milestone Context: v1.1 Additions

v1.1 adds four new instruments (saxophone, trumpet, trombone, vibraphone) to the existing four (keyboard,
bass, drums, guitar). Users select 2–8 instruments before playback. The canvas node graph must adapt its
layout to variable node counts.

**Existing features not being replaced:**
- Audio upload pipeline, Web Audio API, frequency band splitting, calibration
- Activity scoring, role classification (soloing/comping/holding/silent)
- Chord detection, tension scoring, beat/pocket detection
- Canvas node graph (currently 4-node diamond), role-based visuals, edges, glows
- Full React UI panels, chord log, tension meter, timeline, annotations, export
- iOS Safari compatibility

**v1.1 scope boundary:** This milestone is about selection UX and layout adaptation. Analysis accuracy
improvements for new instruments are a separate concern (v1.2+).

---

## What This Domain Comparison Tells Us

No directly comparable browser-based jazz analysis tool with flexible instrument selection exists.
The closest references are:

- **SessionBand** — instrument removal from backing tracks (mix control, not analysis). Pattern: toggle
  instruments in/out of a session before playback starts. Per-instrument on/off toggle is the dominant
  convention for "choose which instruments are active."
- **DAW mixer channel strips** — per-track activate/deactivate pattern. Industry convention: instruments
  are listed vertically, toggled individually, never selected by dragging or modal picker for a session
  of known instruments.
- **Force-directed / circular graph layouts** — d3-force, Cytoscape.js, force-graph (npm) all support
  variable node counts. For 2–8 nodes, circular layout (evenly spaced polygon) is the standard choice.
  Force-directed layout is better for 10+ nodes with cluster structure; circular is simpler and more
  predictable for small fixed counts.
- **Jazz ensemble pedagogy** — instruments are known ahead of time (band setup). Users configure lineup
  once per session, not dynamically during playback. Configuration is a pre-session step.

**Confidence:** MEDIUM — SessionBand is a real comparison; DAW channel strip conventions are HIGH
confidence from industry knowledge; no direct jazz analysis tool competitor with this feature set found.

---

## Table Stakes

Features users must have for flexible lineup to feel correct. Missing = product feels broken or half-built.

| Feature | Why Expected | Complexity | Dependency on Existing Features |
|---------|--------------|------------|---------------------------------|
| Instrument toggle (on/off per instrument) | Universal pattern in any multi-instrument tool. No other UI convention has been validated for "pick your band" | Low | Band setup panel already exists. Add toggle state per instrument |
| All 8 instruments listed (including new 4) | Users expect to see every possible instrument, enabled or disabled. Hidden instruments create confusion | Low | Band setup panel data model. Add sax/trumpet/trombone/vibes entries |
| Minimum 2 instruments enforced | 1-instrument analysis produces meaningless node graph (no edges, no communication). Users need protection from this state | Low | Validation on band setup panel submission |
| Maximum enforced or clearly communicated | 8 instruments on a canvas is a hard visual limit before node graph becomes unreadable. 9+ is anti-feature territory | Low | Count validation. No frequency bands defined beyond 8 |
| Canvas redraws to match selected count | Node graph must update layout geometry when instrument count changes. A 4-node diamond with 2 nodes visible is broken | Medium | Canvas layout algorithm. Current diamond is hardcoded for 4 |
| Node labels match selected instruments | Each canvas node must show the correct instrument name. "Guitar" node appearing when guitar is deselected is a bug class | Low | Node render logic already ties label to instrument config |
| Edges only between active instruments | Communication edges must not reference deselected instruments. Stale edge data from unselected instruments is a data corruption | Low | Edge detection already per-instrument pair. Filter by active set |
| Pocket score updates to active rhythm pair | If drums or bass is deselected, pocket score concept changes. Show N/A or adapt to available rhythm section | Medium | Pocket detection logic. Needs fallback state when reference instruments absent |
| Layout stable during playback | Node positions must not shift after playback starts. Moving nodes mid-playback destroys visual continuity | Low | Layout computed once at analysis start, then locked |
| iOS Safari canvas resize works | iOS Safari has specific quirks with canvas element resize and devicePixelRatio. Variable node count means variable canvas layout recalculation | Medium | Existing iOS Safari compatibility work. Extends to resize behavior |

**Confidence:** HIGH for toggle/listing/validation features. MEDIUM for canvas resize on iOS (known quirk
territory, not yet tested with variable layout).

---

## Jazz-Specific Table Stakes for New Instruments

Features that make the new instruments feel musically correct, not just present.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|---------------------------------|
| Correct frequency band assignment for sax | Alto sax: 125Hz–880Hz fundamental + harmonics to ~4kHz. Tenor sax: 110Hz–622Hz. Using guitar's frequency band (200Hz–6kHz ZCR-based) will misclassify | Medium | New frequency band config. Different from existing 4. Cannot reuse guitar band directly |
| Correct frequency band for trumpet | 165Hz–1047Hz fundamental, harmonics prominent 1kHz–5kHz. Bright, piercing quality distinguishes it from sax in upper midrange | Medium | Trumpet bright harmonic profile enables ZCR-based horn disambiguation from keyboards |
| Correct frequency band for trombone | 82Hz–466Hz fundamental, lowest of the horns. Overlaps bass range below 150Hz. Needs low-end anchor | Medium | Risk of confusion with bass guitar in lower octaves. Needs activity threshold calibration |
| Correct frequency band for vibraphone | 131Hz–2093Hz. Mallet percussion, not unlike piano in harmonic content but with distinct attack envelope | Medium | High transient attack (like drums) but tonal (like keyboard). Closest existing analog is keyboard band but needs separate config |
| Vibraphone role classification | Vibraphone can solo, comp (chords), or hold (sustain pedal). Same role taxonomy as keyboard applies | Low | Existing role classifier applies if frequency band is correct. Same 4-state model |
| Horn role classification (soloing/comping/holding/silent) | Horns are typically monophonic soloists in jazz but can play background figures (comping-adjacent). Soloists have high activity + dominant spectral energy | Medium | Existing role model applies. Horns rarely "comp" — activity score + spectral dominance is sufficient signal |
| Visual differentiation between horn types | Sax node vs. trumpet node vs. trombone node must look distinct. Same circular node with just a label is the minimum; color coding per instrument family is better | Low | Color/icon differentiation. Existing role-based visual system stays. Add instrument-type color layer |

**Confidence:** HIGH for frequency ranges (verified against multiple EQ charts and acoustic references).
MEDIUM for role classifier applicability to new instruments (inference from existing architecture, not tested).

---

## Differentiators

Features that make v1.1 more than "just added more instruments."

### Tier 1: Core Differentiators for v1.1 (should ship with milestone)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Circular layout that looks intentional at any count | A 2-node layout (two nodes facing each other) and a 7-node heptagon should both look designed, not like a circle with gaps | Medium | Geometric circular layout: nodes evenly spaced on circle, radius scaled to count. Standard algorithm, no library needed. 2 nodes = horizontal pair, 3 = triangle, 4 = square (replacing current diamond), etc. |
| Instrument family color coding | Horns (sax/trumpet/trombone) share a color family; keyboard/vibes share a color family; rhythm (bass/drums) keep their existing colors | Low | Adds visual grouping without cluttering the node. Makes horn section behavior instantly readable |
| Horn section grouping in selection UI | Group instruments by family in the setup panel (Rhythm / Keyboard-Melodic / Horns). Reduces cognitive load for users who know jazz ensemble conventions | Low | Layout change in band setup panel. No data model change. Depends on existing panel structure |
| Pocket score generalization | When drums+bass present: standard pocket score. When drums present but bass absent: show drums-only rhythmic consistency score. When neither present: hide pocket score. Graceful degradation | Medium | Extends existing pocket detection. Pocket score already exists — needs conditional display logic |
| Node count badge in UI | Show "5 instruments selected" clearly in setup panel. User confirmation before starting analysis. Prevents accidental 2-instrument analysis of an 8-instrument recording | Low | Simple count display. High UX value, trivial to build |

### Tier 2: Strong Differentiators (high value, v1.2+)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Horn disambiguation (sax vs. trumpet vs. trombone) | Three horns in the same frequency band is the hardest analysis problem in this milestone. Distinguishing them on a mixed recording requires harmonic profile analysis | High | Trumpet: bright, strong 1kHz–4kHz harmonics, ZCR high. Trombone: low fundamental dominance, weaker upper harmonics. Alto sax: midrange clarity, smoother harmonic slope. These signatures exist but are subtle on mixed recordings. Flag as LOW confidence until tested |
| Sax vs. keyboard disambiguation | Alto/tenor sax occupies overlapping frequency territory with piano's midrange registers. Existing keyboard/guitar ZCR+spectral flux heuristic may need a new variant for sax | High | Saxophone has narrower harmonic bandwidth than piano. Spectral flatness or centroid delta may help. Research flag for v1.2 |
| Vibes vs. keyboard disambiguation | Vibraphone and piano overlap significantly. Both are polyphonic, both mallet/keyboard in origin. Attack transient duration differs (vibes sustain longer with pedal off) | High | Hardest disambiguation in the new instrument set. Consider treating vibes as a "keyboard-family" node that the user sets manually if confusion is high |
| Edge weight scaling for variable node counts | With 8 nodes and 28 possible edges, the graph becomes unreadable if all edges render. Edge weight threshold should scale with node count | Medium | Render only edges above a dynamic threshold. More nodes = higher threshold to maintain readability |

### Tier 3: Nice-to-Have (v1.3+, defer)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Save/recall band presets | "My quartet: piano, bass, drums, sax" as a saved config | Low-Medium | Requires localStorage. Convenience feature, not core |
| Session template library (quartet, quintet, sextet, big band) | One-click "Miles Davis Quintet" lineup | Low | Content curation. High perceived polish, low engineering cost |
| Custom instrument naming | Users label nodes "John (sax)" not just "Sax" | Low | String field in setup panel. Nice for educators |
| Node drag-to-reposition | Let users manually arrange nodes after layout | Medium | Breaks automatic layout. Adds interaction complexity. Risk of confusion with meaning of node position |

**Confidence:** MEDIUM for Tier 1 features (architecture inference, not tested). LOW for horn disambiguation
complexity estimates (unverified against actual mixed jazz recordings).

---

## Anti-Features

Deliberately out of scope. Each one has been seen as a scope creep trap in similar tools.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| More than 8 instruments simultaneously | Beyond 8 nodes, a circular canvas graph becomes unreadable at any reasonable canvas size. 28 possible edges between 8 nodes is already visually dense | Hard cap at 8. Communicate limit clearly in setup panel. Jazz ensembles larger than octets are rare |
| Dynamic instrument add/remove during playback | Adding or removing a node mid-analysis invalidates all cached activity scores for that instrument. Also visually disorienting | Configuration before analysis only. "Restart analysis" if lineup changes |
| Auto-detection of what instruments are present | AI-based instrument detection on mixed recordings is a server-side ML problem (Demucs-class). In-browser frequency band analysis cannot reliably detect "this recording has a trumpet but no guitar" | User declares lineup explicitly. Frame as feature: "you tell us the band, we analyze the roles" |
| Separate frequency band config UI for users | Users are jazz musicians, not audio engineers. Exposing "edit the 200-6kHz band for guitar" creates support burden | Instrument presets are hardcoded. Internal config only |
| Per-instrument volume normalization | Sounds useful but implies the tool can isolate instruments to normalize them. It cannot. Setting volume levels on a mixed recording changes the mix, not per-instrument levels | No per-instrument volume control. This belongs in a DAW |
| "Add a custom instrument" field | Custom instruments have no frequency band config. A user adding "flugelhorn" gets undefined analysis behavior | Closed instrument list. New instruments added in development releases with tested frequency configs |
| Node graph animation between layout configurations | Animated morph from 4-node diamond to 5-node pentagon when user adds an instrument looks impressive but is disorienting during active analysis | Static layout computed at analysis start. No mid-session layout changes |

**Confidence:** HIGH — these are scope boundary decisions supported by the existing system's design
constraints (browser-only, frequency band splitting, no server-side ML).

---

## Feature Dependencies

New v1.1 features layered on existing dependency tree.

```
Existing foundation (unchanged):
Audio Upload + Web Audio API Pipeline
    → ALL features

Per-Instrument Frequency Band Config (NEW for v1.1)
    → Activity scoring for new instruments (sax, trumpet, trombone, vibes)
    → Role classification for new instruments
    → Communication edge detection for new instruments

Band Setup Panel (EXTENDED in v1.1)
    → Instrument toggle state
    → Active instrument set
    → Node count validation (2-8)

Active Instrument Set (NEW concept in v1.1)
    → Canvas node count
    → Circular layout geometry
    → Edge filtering (only between active instruments)
    → Pocket score display logic (conditional on which instruments active)

Circular Layout Algorithm (NEW in v1.1, replaces hardcoded diamond)
    → Node positions for all downstream canvas rendering
    → Edge endpoints
    → Node label positions
    → Glow/pulse radius calculations

Horn Disambiguation (future, v1.2+)
    → Accurate activity scoring when multiple horns active simultaneously
    → Depends on: per-instrument frequency bands + spectral feature differentiators
```

**Critical note on dependency ordering:** Frequency band config for new instruments must exist before
any analysis of those instruments is meaningful. This is the foundational v1.1 task — everything
else (selection UI polish, layout algorithm, disambiguation) depends on correct frequency band
definitions being in place.

---

## MVP Recommendation for v1.1 Milestone

### Must Ship in v1.1

1. Frequency band definitions for all 4 new instruments (sax, trumpet, trombone, vibraphone)
2. Instrument toggle UI in band setup panel, grouped by family, with 2-8 validation
3. Active instrument set state propagation to all analysis components
4. Circular layout algorithm replacing hardcoded 4-node diamond (handles 2–8 nodes)
5. Edge filtering to active instrument pairs only
6. Pocket score conditional display (show/hide/adapt based on which rhythm instruments are active)
7. Instrument family color coding on nodes
8. Node count confirmation in setup UI

### Defer from v1.1

| Feature | Reason to Defer |
|---------|----------------|
| Horn disambiguation (sax vs. trumpet vs. trombone) | Requires testing on real recordings. Current frequency band approach may misattribute activity. Ship bands first, test, then refine |
| Sax vs. keyboard disambiguation | Same reason. New instrument pair that hasn't been calibrated on real audio |
| Vibes vs. keyboard disambiguation | Hardest of the three. Defer until basic vibes activity scoring is validated |
| Session preset templates | Convenience feature. Build core config first |
| Node drag reposition | Complexity/risk not justified for v1.1 |

### Rationale

The v1.1 milestone is fundamentally about two things: (1) correct frequency band definitions for the
new instruments, and (2) a canvas layout that adapts gracefully to 2–8 nodes. Everything else is
polish. Ship those two things correctly and the milestone is complete. The disambiguation problems
for new instrument combinations are a known v1.2 research problem — attempting to solve them in v1.1
before testing frequency band configurations on real recordings would be premature optimization.

---

## Instrument Frequency Reference

For implementation of frequency band configs. All values are fundamental range; harmonics extend
further (typically 3–5x the highest fundamental).

| Instrument | Fundamental Range | Harmonic Prominence | Distinguishing Feature |
|------------|------------------|---------------------|------------------------|
| Saxophone (alto) | 125Hz – 880Hz | Harmonics to ~4kHz | Smooth midrange, moderate ZCR |
| Saxophone (tenor) | 110Hz – 622Hz | Harmonics to ~3kHz | Lower than alto, overlaps with guitar midrange |
| Trumpet | 165Hz – 1047Hz | Strong 1kHz–4kHz | High ZCR, bright spectral centroid |
| Trombone | 82Hz – 466Hz | Harmonics to ~2kHz | Low fundamental, competes with bass below 150Hz |
| Vibraphone | 131Hz – 2093Hz | Rich harmonic overtones | High attack transient (mallet), long sustain |
| Keyboard (existing) | 28Hz – 4186Hz | Full spectrum | Wide band, polyphonic, moderate ZCR |
| Bass (existing) | 41Hz – 300Hz | Harmonics to ~1kHz | Low-end dominance, high onset regularity |
| Drums (existing) | 50Hz – 8kHz (transient) | Broadband noise bursts | Transient detection, not pitch |
| Guitar (existing) | 82Hz – 1175Hz | Harmonics to ~5kHz | Higher ZCR than keyboard (string attack) |

**Source:** DPA Microphones Acoustical Characteristics reference, EQ Cheat Sheet data (guitarbuilding.org,
audiorecording.me), physics.illinois.edu impedance spectrum study. Confidence: HIGH for fundamental ranges.
MEDIUM for harmonic prominence descriptions (approximate, instrument-specific).

**Overlap problem summary for v1.1:**
- Trombone overlaps bass: both active below 150Hz. Differentiate by onset pattern (bass = rhythmic
  regular; trombone = longer sustained notes with irregular onsets)
- Trumpet overlaps sax: share 165Hz–880Hz. Trumpet distinguishable by spectral brightness
  (high centroid) and higher ZCR
- Vibes overlaps keyboard: nearly identical frequency range. Cannot be differentiated by band alone —
  requires attack transient analysis or user declaration (acceptable for v1.1)
- Alto sax overlaps guitar: both in 125Hz–1175Hz range. Guitar has higher ZCR from string attack.
  Existing ZCR heuristic from keyboard/guitar disambiguation may extend here

---

## Node Graph Layout Reference

For implementation of circular layout algorithm.

**Node counts 2–8 with recommended geometry:**

| Count | Shape | Node spacing notes |
|-------|-------|--------------------|
| 2 | Horizontal pair (left/right of center) | Not a circle. Direct opposition on horizontal axis |
| 3 | Equilateral triangle | Top node = melody instrument; bottom two = rhythm |
| 4 | Square (replaces current diamond rotation by 45°) | Square is more stable visually than diamond |
| 5 | Pentagon | Equal spacing works well |
| 6 | Hexagon | Natural: front pair + two flanking + rear pair. Very readable |
| 7 | Heptagon | Tight but works at reasonable canvas size |
| 8 | Octagon | Maximum. Node labels need to be tightly sized |

**Radius scaling rule:** Canvas center to node center distance should grow with node count to maintain
minimum node separation. Suggested: `radius = baseRadius + (nodeCount - 2) * 15px` where baseRadius
is sized to leave margin for node diameter + label.

**Edge density concern at 8 nodes:** 8 nodes = 28 possible unique pairs. If all 28 edges render
simultaneously, the graph is a hairball. Recommendation: render only edges with correlation score
above a dynamic threshold. Suggest `threshold = 0.3 + (nodeCount - 4) * 0.05` to scale edge
pruning with density. At 4 nodes this matches current behavior; at 8 nodes fewer edges render.

**Sources:** Circular layout principles from NetworkX documentation and Cambridge Intelligence layout guide.
Force-graph library (vasturiano/force-graph) confirmed to support variable node counts on HTML5 canvas.
Cytoscape.js confirmed to support circular layout. Neither library is recommended for this use case — the
existing hand-coded Canvas implementation is preferable for this app's custom visual design language
(glows, beat pulses, tension-tinted edges). Circular geometry math is simple enough to implement directly.

---

## Complexity Assessment: v1.1 Accuracy Risks

| Analysis Challenge | Risk Level | Mitigation |
|-------------------|-----------|------------|
| Trombone/bass confusion below 150Hz | High | Activity onset timing: trombone phrases are longer, bass is rhythmically regular. Use phrase length as secondary signal |
| Sax/keyboard confusion in 125Hz–880Hz | Medium | ZCR should differentiate (sax is more tonal, lower ZCR than guitar; piano is polyphonic, different ZCR profile). Test on real recordings before v1.1 ships |
| Vibes/keyboard disambiguation | High | Cannot reliably disambiguate from frequency bands alone. Acceptable to label both as "melodic" and let the user know which node is which via their lineup declaration |
| Multiple horns playing simultaneously | High | All horn activity will be attributed to whichever horn's band shows highest energy. This is a known limitation, not a v1.1 bug. Label it: "estimated [instrument] activity" |
| 8-instrument analysis performance | Medium | More instruments = more FFT analysis passes per animation frame. Profile on iOS before shipping 8-instrument support |

**Confidence:** MEDIUM — these risk estimates are based on frequency analysis principles, not tested
against real multi-horn jazz recordings. Phase-specific research into disambiguation is warranted for v1.2.

---

## Sources

- DPA Microphones Acoustical Characteristics reference: https://www.dpamicrophones.com/mic-university/background-knowledge/acoustical-characteristics-of-musical-instruments/
- EQ Cheat Sheet instrument frequency chart: https://guitarbuilding.org/wp-content/uploads/2014/06/Instrument-Sound-EQ-Chart.pdf
- Mixing horns/trumpets/trombone/sax EQ techniques: https://www.audiorecording.me/mixing-horns-trumpets-trombone-sax-eq-techniques-for-best-clarity.html
- Impedance Spectrum for Tenor Sax and Trumpet: https://courses.physics.illinois.edu/phys406/sp2017/NSF_REU_Reports/2007_reu/Impedance_Spectrum_for_a_Tenor_Sax_and_a_Bb_Trumpet.pdf
- Jazz Solo Instrument Classification (ISMIR 2018): https://publica.fraunhofer.de/entities/publication/9da4c9a4-7384-4ea9-87a2-aa2e59dab6ae
- Lead Instrument Detection from Multitrack Music (arxiv 2025): https://arxiv.org/html/2503.03232
- Circular layout NetworkX reference: https://networkx.org/documentation/stable/reference/generated/networkx.drawing.layout.circular_layout.html
- Cambridge Intelligence graph layout guide: https://cambridge-intelligence.com/automatic-graph-layouts/
- force-graph library (vasturiano): https://github.com/vasturiano/force-graph
- Cytoscape.js: https://js.cytoscape.org/
- SessionBand instrument removal feature: https://www.sessionband.net/new-releases-sessionband-music-app/
- Jazz instrument guide (NY Jazz Workshop): https://newyorkjazzworkshop.com/jazz-instruments-guide/
