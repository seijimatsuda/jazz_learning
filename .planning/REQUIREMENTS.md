# Requirements: Jazz Communication Visualizer

**Defined:** 2026-03-10
**Core Value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching

## v1 Requirements

### Audio Pipeline

- [ ] **AUDIO-01**: User can upload MP3 or WAV file via file picker, decoded to AudioBuffer
- [ ] **AUDIO-02**: AudioContext created inside user gesture handler (iOS Safari compatible)
- [ ] **AUDIO-03**: 3-second calibration pass analyzes peak/average energy per frequency band before playback
- [ ] **AUDIO-04**: Calibration sets SOLO (0.75×peak), COMPING (0.40×peak), HOLDING (0.10×peak) thresholds per band
- [ ] **AUDIO-05**: Transport controls: play, pause, seek to any position
- [ ] **AUDIO-06**: Timeline scrubber shows current position within track duration
- [ ] **AUDIO-07**: Pre-computed tension heatmap generated on load (full-track chroma analysis → tension arc)
- [ ] **AUDIO-08**: Dual AnalyserNode setup (smoothed for visualization, raw for transient detection)
- [ ] **AUDIO-09**: Sample-rate-aware FFT bin computation (hzToBin uses audioCtx.sampleRate, never hardcoded)

### Instrument Analysis

- [ ] **INST-01**: Frequency band splitting per instrument type (bass 20–250Hz, drums 60–300Hz+2–8kHz+6–10kHz, keyboard 250–2000Hz, guitar 300–3000Hz)
- [ ] **INST-02**: Per-instrument activity score (0.0–1.0) computed every analysis frame (~10fps)
- [ ] **INST-03**: Role classification per instrument per frame: soloing / comping / holding / silent
- [ ] **INST-04**: Keyboard vs guitar disambiguation using zero-crossing rate + spectral flux when both present
- [ ] **INST-05**: If only one mid-range instrument in lineup, full mid-range assigned to it
- [ ] **INST-06**: Cross-correlation communication edge detection between all instrument pairs (2-second sliding window)
- [ ] **INST-07**: Edge suppression when cross-correlation weight < 0.3
- [ ] **INST-08**: Rolling 10-second activity history per instrument
- [ ] **INST-09**: Cumulative time-in-role tracking per instrument since playback started

### Chord Detection

- [ ] **CHORD-01**: Chroma vector extraction (12 pitch classes) every ~100ms via Meyda.js
- [ ] **CHORD-02**: Bass frequency band weighted more heavily for root detection
- [ ] **CHORD-03**: Template matching against 8 chord types: major, minor, maj7, m7, dom7, dim7, m7b5, alt
- [ ] **CHORD-04**: Cosine similarity scoring with confidence = gap between best and second-best match
- [ ] **CHORD-05**: 300ms rolling window smoothing before display
- [ ] **CHORD-06**: Chord display only updates when new detection holds for >200ms (flicker prevention)
- [ ] **CHORD-07**: Low confidence → display chord family only (e.g. "dominant chord" not "G7")
- [ ] **CHORD-08**: Medium/high confidence → display full chord name + plain English function
- [ ] **CHORD-09**: Chord function assignment: tonic / subdominant / dominant / altered
- [ ] **CHORD-10**: Plain English labels per function ("home — relaxed and stable", "tension — wants to resolve", etc.)
- [ ] **CHORD-11**: Timestamped chord history log maintained during playback

### Tension System

- [ ] **TENS-01**: Tension score (0.0–1.0) derived from chord function (tonic=0.0–0.2, subdominant=0.2–0.45, dominant=0.55–0.75, altered=0.75–1.0)
- [ ] **TENS-02**: Tension score lerps toward target at 0.05 per frame (smooth movement)
- [ ] **TENS-03**: Rolling tension history maintained for meter smoothing
- [ ] **TENS-04**: Vertical tension meter: full-height gradient bar (blue→amber→orange→red)
- [ ] **TENS-05**: Ghost line on tension meter shows level from 3 seconds ago
- [ ] **TENS-06**: Tension heatmap on timeline (blue=low, red=high) pre-computed on file load

### Beat Detection & Pocket

- [ ] **BEAT-01**: Drum transient detection via spectral flux (ride 6–10kHz + snare 200–800Hz)
- [ ] **BEAT-02**: Adaptive threshold for drum onsets (mean + 1.5× std dev over last 2 seconds)
- [ ] **BEAT-03**: Bass note onset detection via RMS energy delta (20–250Hz band)
- [ ] **BEAT-04**: BPM derivation via autocorrelation over 6-second window, updated every 2 seconds
- [ ] **BEAT-05**: Rubato/free sections: BPM = null, display "♩ = —"
- [ ] **BEAT-06**: Swing ratio detection to prevent double-tempo BPM reporting
- [ ] **BEAT-07**: Downbeat detection (every 4th drum beat = beat 1 of bar)
- [ ] **BEAT-08**: Pocket score: rolling average of last 8 bass↔drums sync scores within ±80ms window
- [ ] **BEAT-09**: Timing offset measurement (drums ahead = positive ms, drums behind = negative ms)
- [ ] **BEAT-10**: Pocket score suppressed when BPM confidence is low (rubato tracks)

### Node Graph Visualization

- [ ] **VIZ-01**: Canvas-based node graph with dynamic layout (2=horizontal, 3=triangle, 4=diamond)
- [ ] **VIZ-02**: Dark background (#0a0a0f) with nodes labeled below by instrument name
- [ ] **VIZ-03**: Bass node: larger radius, deep amber (#b45309) breathing glow on 1-beat cycle
- [ ] **VIZ-04**: Bass node: glow brightens on bass onset, deep slow ring expands over 800ms
- [ ] **VIZ-05**: Bass node: pocket score drives glow intensity (high=warm amber, low=cool blue shift)
- [ ] **VIZ-06**: Drums node: sharp +6px radius nudge on beat, lerps back over 180ms
- [ ] **VIZ-07**: Drums node: crisp ripple on beat (fast circle, white-blue #e0f2fe, 300ms fade)
- [ ] **VIZ-08**: Drums node: 2× ripple on downbeat with 500ms fade
- [ ] **VIZ-09**: Drums node: ±3px orbit effect when timing offset > 30ms
- [ ] **VIZ-10**: All nodes: pulse on drum beat (+2px), stronger pulse on downbeat (+4px)
- [ ] **VIZ-11**: Canvas background subtle pulse on each beat (#0a0a0f → #0d0d18, 200ms)
- [ ] **VIZ-12**: Role-based node states: soloing=large/amber/glow, comping=medium/blue-teal/slow, holding=small-med/gray-blue, silent=small/dark
- [ ] **VIZ-13**: Glow rendering via offscreen canvas compositing (NOT shadowBlur — iOS performance)

### Edge Visualization

- [ ] **EDGE-01**: Bass↔drums pocket line always visible regardless of correlation score
- [ ] **EDGE-02**: Pocket line: thick green (#4ade80) with flowing dashes when pocket > 0.7
- [ ] **EDGE-03**: Pocket line: medium yellow (#fde68a) with wobble when pocket 0.4–0.7
- [ ] **EDGE-04**: Pocket line: thin gray-blue static when pocket < 0.4
- [ ] **EDGE-05**: Pocket line: bright flash on each confirmed sync event
- [ ] **EDGE-06**: Pocket line floating label: "deep in the pocket" / "locked in" / "swinging loose" / "playing free"
- [ ] **EDGE-07**: Communication edges: thick animated (>0.7), medium subtle (0.4–0.7), thin static (0.3–0.4), hidden (<0.3)
- [ ] **EDGE-08**: Edge color by type: green=rhythmic, purple=melodic, blue=support
- [ ] **EDGE-09**: Tension tinting: edges shift amber/orange when tension > 0.6, red when > 0.8
- [ ] **EDGE-10**: Resolution flash: edges briefly flash cool blue/white when tension drops below 0.3

### UI Panels

- [ ] **UI-01**: Left panel: band setup with dropdown to add keyboard/bass/drums/guitar
- [ ] **UI-02**: Each instrument row shows icon, name, frequency band label, remove button
- [ ] **UI-03**: "Load Audio" file picker + "Calibrate & Play" button
- [ ] **UI-04**: Node detail panel on instrument click: name, icon, current role badge
- [ ] **UI-05**: Node detail: activity sparkline (last 10 seconds)
- [ ] **UI-06**: Node detail: role breakdown pie chart (% time in each role since playback start)
- [ ] **UI-07**: Node detail: "Most active with" showing highest-synced partner
- [ ] **UI-08**: Role legend with color/role key
- [ ] **UI-09**: BPM display in bottom corner of canvas (♩ = 124 or ♩ = —)
- [ ] **UI-10**: Chord log: expandable drawer below timeline
- [ ] **UI-11**: Chord log entries: timestamp | chord name | function | confidence, color-coded by tension
- [ ] **UI-12**: Chord log entries clickable to jump playback to that moment

### Key Detection

- [ ] **KEY-01**: Rolling window key detection from chord history
- [ ] **KEY-02**: Display chord function relative to detected key (e.g. "G7 is the V chord in C major")
- [ ] **KEY-03**: Bar/beat grid overlay on timeline derived from detected BPM

### Melody Analysis

- [ ] **MEL-01**: Pitch detection (YIN/autocorrelation) on keyboard/guitar frequency band
- [ ] **MEL-02**: Distinguish melodic activity (pitch movement) from energetic activity (just loud)
- [ ] **MEL-03**: Call-and-response detection: keyboard melodic activity → guitar within 2–4s window
- [ ] **MEL-04**: Animated purple "conversation" edge between instruments during call/response
- [ ] **MEL-05**: Conversation log panel: timestamped call/response moments, clickable to jump

### User Features

- [ ] **USER-01**: User can annotate moments on the timeline with text notes
- [ ] **USER-02**: Export session as JSON (all analysis data + annotations)
- [ ] **USER-03**: Export session as image (canvas screenshot)
- [ ] **USER-04**: Pre-loaded example tracks with expert annotations

### Cross-Cutting

- [ ] **XCUT-01**: iOS Safari compatible (AudioContext, Canvas, Web Audio API)
- [ ] **XCUT-02**: 60fps Canvas animation with no jank during audio analysis
- [ ] **XCUT-03**: All typed arrays pre-allocated (no per-frame garbage collection)
- [ ] **XCUT-04**: Retina/HiDPI canvas scaling (devicePixelRatio aware)

## v2 Requirements

### Social / Sharing

- **SOC-01**: Share analysis session via URL
- **SOC-02**: Collaborative annotations (multiple users)

### Advanced Analysis

- **ADV-01**: MIDI export from detected chords
- **ADV-02**: Comparative analysis (two recordings side by side)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend / server | All processing in-browser by design |
| Stem separation / source isolation | Requires ML models too heavy for client-side |
| Real-time microphone capture | Completely different product with latency/noise problems |
| Native mobile app | Web-only, iOS Safari compatible instead |
| MIDI input | Different use case (live performance vs recording analysis) |
| Roman numeral notation | Jazz musicians read chord names, not Roman numerals |
| "Solo/mute" buttons per instrument | Implies stem isolation capability that doesn't exist |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDIO-01 | Pending | Pending |
| AUDIO-02 | Pending | Pending |
| AUDIO-03 | Pending | Pending |
| AUDIO-04 | Pending | Pending |
| AUDIO-05 | Pending | Pending |
| AUDIO-06 | Pending | Pending |
| AUDIO-07 | Pending | Pending |
| AUDIO-08 | Pending | Pending |
| AUDIO-09 | Pending | Pending |
| INST-01 | Pending | Pending |
| INST-02 | Pending | Pending |
| INST-03 | Pending | Pending |
| INST-04 | Pending | Pending |
| INST-05 | Pending | Pending |
| INST-06 | Pending | Pending |
| INST-07 | Pending | Pending |
| INST-08 | Pending | Pending |
| INST-09 | Pending | Pending |
| CHORD-01 | Pending | Pending |
| CHORD-02 | Pending | Pending |
| CHORD-03 | Pending | Pending |
| CHORD-04 | Pending | Pending |
| CHORD-05 | Pending | Pending |
| CHORD-06 | Pending | Pending |
| CHORD-07 | Pending | Pending |
| CHORD-08 | Pending | Pending |
| CHORD-09 | Pending | Pending |
| CHORD-10 | Pending | Pending |
| CHORD-11 | Pending | Pending |
| TENS-01 | Pending | Pending |
| TENS-02 | Pending | Pending |
| TENS-03 | Pending | Pending |
| TENS-04 | Pending | Pending |
| TENS-05 | Pending | Pending |
| TENS-06 | Pending | Pending |
| BEAT-01 | Pending | Pending |
| BEAT-02 | Pending | Pending |
| BEAT-03 | Pending | Pending |
| BEAT-04 | Pending | Pending |
| BEAT-05 | Pending | Pending |
| BEAT-06 | Pending | Pending |
| BEAT-07 | Pending | Pending |
| BEAT-08 | Pending | Pending |
| BEAT-09 | Pending | Pending |
| BEAT-10 | Pending | Pending |
| VIZ-01 | Pending | Pending |
| VIZ-02 | Pending | Pending |
| VIZ-03 | Pending | Pending |
| VIZ-04 | Pending | Pending |
| VIZ-05 | Pending | Pending |
| VIZ-06 | Pending | Pending |
| VIZ-07 | Pending | Pending |
| VIZ-08 | Pending | Pending |
| VIZ-09 | Pending | Pending |
| VIZ-10 | Pending | Pending |
| VIZ-11 | Pending | Pending |
| VIZ-12 | Pending | Pending |
| VIZ-13 | Pending | Pending |
| EDGE-01 | Pending | Pending |
| EDGE-02 | Pending | Pending |
| EDGE-03 | Pending | Pending |
| EDGE-04 | Pending | Pending |
| EDGE-05 | Pending | Pending |
| EDGE-06 | Pending | Pending |
| EDGE-07 | Pending | Pending |
| EDGE-08 | Pending | Pending |
| EDGE-09 | Pending | Pending |
| EDGE-10 | Pending | Pending |
| UI-01 | Pending | Pending |
| UI-02 | Pending | Pending |
| UI-03 | Pending | Pending |
| UI-04 | Pending | Pending |
| UI-05 | Pending | Pending |
| UI-06 | Pending | Pending |
| UI-07 | Pending | Pending |
| UI-08 | Pending | Pending |
| UI-09 | Pending | Pending |
| UI-10 | Pending | Pending |
| UI-11 | Pending | Pending |
| UI-12 | Pending | Pending |
| KEY-01 | Pending | Pending |
| KEY-02 | Pending | Pending |
| KEY-03 | Pending | Pending |
| MEL-01 | Pending | Pending |
| MEL-02 | Pending | Pending |
| MEL-03 | Pending | Pending |
| MEL-04 | Pending | Pending |
| MEL-05 | Pending | Pending |
| USER-01 | Pending | Pending |
| USER-02 | Pending | Pending |
| USER-03 | Pending | Pending |
| USER-04 | Pending | Pending |
| XCUT-01 | Pending | Pending |
| XCUT-02 | Pending | Pending |
| XCUT-03 | Pending | Pending |
| XCUT-04 | Pending | Pending |

**Coverage:**
- v1 requirements: 83 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 83

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after initial definition*
