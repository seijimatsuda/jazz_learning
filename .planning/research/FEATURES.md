# Feature Landscape: Jazz Audio Visualization

**Domain:** Browser-based music analysis and visualization for jazz ensemble audio
**Researched:** 2026-03-10
**Confidence note:** WebSearch and WebFetch were unavailable. All findings derive from training knowledge of audio analysis tools (Meyda, Essentia, Sonic Visualiser, Peaks.js, Transcribe!, iReal Pro, Band-in-a-Box, Amazing Slow Downer, WaveformJS, Audiogram), jazz pedagogy literature, and the Web Audio API specification. Confidence levels reflect honest assessment of knowledge currency. Claims about specific library APIs should be verified with Context7 before implementation.

---

## What Users Expect in This Domain

Before categorizing, it helps to understand who builds tools like this and what conventions have emerged:

**Existing tools this competes with / complements:**
- **Transcribe!** (desktop) — waveform, loop regions, slow-down, pitch shift. Table stakes setter.
- **Amazing Slow Downer** — tempo manipulation without pitch change. Mobile-first.
- **Sonic Visualiser** — spectrogram, chroma, beat tracking, annotation. Research-grade, desktop only.
- **iReal Pro** — chord charts, backing tracks, no analysis. Musician gold standard for chart playback.
- **Band-in-a-Box** — harmony analysis, auto-accompaniment. Desktop, complex.
- **Peaks.js** — waveform viewer for web. UI component, not analysis tool.
- **Meyda** — audio feature extraction library, not a product.

None of these are jazz-specific analysis + visualization tools in the browser. The closest is Sonic Visualiser (research) + iReal Pro (charts). This app occupies a novel intersection: **real-time ensemble communication visualization for jazz, browser-native, musically meaningful for practitioners.**

Confidence: MEDIUM — tool landscape is stable but there may be newer entrants post-August 2025.

---

## Table Stakes

Features users expect from any audio analysis/visualization tool. Missing = product feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Waveform display with playhead | Standard in every audio tool since 1990s. Users orient by visual waveform | Low | Peaks.js or Canvas draw. Scrubbing required |
| Play / pause / seek controls | Minimum viable player. Without this, no one trusts the tool works | Low | Web Audio API. iOS user-gesture requirement is a known gotcha |
| Audio upload (MP3/WAV) | Without file input, tool has no content to work with | Low | FileReader API. 50MB limit reasonable |
| BPM / tempo display | First thing any musician asks about a track | Medium | Dual-stream beat detection already in spec |
| Chord name display | Jazz musicians read chords not Roman numerals by default | Medium | Template matching is in spec. Display is table stakes; the analysis accuracy is the hard part |
| Smooth, artifact-free animation | Choppy or flickering visualization destroys trust even if analysis is correct | High | 60fps Canvas with analysis at lower sample rate. Already addressed in spec |
| Mobile/iOS compatibility | Jazz musicians use iPhones. Broken on Safari = non-starter for this audience | Medium | iOS AudioContext user gesture requirement. Already flagged in spec |
| Loading state / progress feedback | Large audio files take time. No spinner = users think it crashed | Low | Progress bar during analysis passes |
| Error handling for unsupported formats | M4A, FLAC, AIFF are common jazz file formats. Graceful rejection is expected | Low | File type validation with clear messaging |

**Confidence:** HIGH — these are universal across all audio tools I'm aware of.

---

## Jazz-Specific Table Stakes

Features expected specifically by jazz students, musicians, and educators. Missing = product misses the audience.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Extended chord vocabulary (maj7, m7, dom7, dim7, m7b5, alt) | Standard jazz harmony. Showing "C major" instead of "Cmaj7" signals the tool doesn't understand jazz | Medium | Already in spec: 8 chord types via template matching |
| Chord function labels (tonic/subdominant/dominant/altered) | How jazz musicians think about harmony — function over root name | Medium | Already in spec. Requires key detection to be meaningful |
| Key detection | All chord function analysis depends on knowing the key center | High | Bayesian or template-matching key detection. In spec but worth flagging as hard |
| Instrument role labeling (soloing/comping/holding/silent) | Jazz ensemble pedagogy centers on role awareness. Students study this explicitly | High | Core differentiator — see below |
| Rhythmic pocket / groove score | "Are the bass and drums in the pocket?" is how jazz educators evaluate rhythm sections | High | Unique feature — see differentiators |

**Confidence:** HIGH — these map directly to how jazz is taught and discussed.

---

## Differentiators

Features that set this product apart. Not universally expected, but high value for the target audience. These are what make the tool worth building.

### Tier 1: Core Differentiators (must ship)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Animated node graph (instrument communication) | No existing tool visualizes ensemble conversation as a network. Makes abstract interaction concrete | High | Canvas-based. Already in spec. The signature feature |
| Pocket score (bass ↔ drums sync) | Quantifies the most fundamental jazz groove relationship. Educators have no existing tool for this | High | ±80ms window cross-correlation. In spec |
| Harmonic tension arc (0.0–1.0 continuous) | Maps harmonic tension as a time-series — shows build/release arcs across a song | High | Chroma → tension scoring with smoothing. In spec |
| Tension-tinted edges | Visual encoding of harmonic state in the relationship graph itself. No existing tool does this | Medium | Color mapping on Canvas edges. In spec |
| Role-based node visual states | Each instrument's visual behavior reflects its musical role. Soloists look different than compers | Medium | Size/glow/animation state machine per role. In spec |
| Beat-synchronized canvas pulse | The visualization breathes with the music. Converts analysis into felt rhythm | Medium | requestAnimationFrame + beat trigger. In spec |

### Tier 2: Strong Differentiators (high value, phase 2+)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Call-and-response detection | Formalizes a core jazz concept (musical conversation) into a timestamped log | High | Pitch detection + timing window + heuristic. In spec as v1.5 |
| Conversation log panel | Makes call/response history browseable and educational | Medium | Depends on call-and-response detection |
| Timeline tension heatmap | Lets users navigate directly to harmonically interesting moments | Medium | Pre-computed tension values → Canvas heatmap strip. In spec |
| Bar/beat grid overlay | Aligns chord/tension events to musical time (bars), not wall-clock time | High | Requires accurate beat detection + meter inference. In spec |
| Pre-loaded example tracks with expert annotations | Allows educators to assign specific tracks. Enables "compare your analysis to expert" | Medium | Content curation work, not engineering. High pedagogical value |
| Annotation on timeline | Users mark moments they want to study or discuss | Low | Click-to-annotate on timeline. In spec |
| Export (JSON/image) | Enables classroom use, assignment submission, sharing | Low | JSON = analysis data; image = Canvas screenshot. In spec |

### Tier 3: Nice-to-Have Differentiators (phase 3+, defer unless validated)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Node detail panel (sparklines, role breakdown pie) | Deep dive into single instrument behavior | Medium | In spec. Valuable but not launch-critical |
| Keyboard vs guitar disambiguation | Reduces a common misclassification in mixed-stem analysis | High | ZCR + spectral flux heuristic. In spec. Accuracy may disappoint |
| Pitch detection for melody (YIN/autocorrelation) | Enables melodic analysis, interval detection | High | On mixed recordings, YIN will extract dominant pitch only |
| Confidence badges on chord labels | Teaches users when to trust the analysis. Prevents false confidence | Low | Gap between top-2 template matches. In spec |

**Confidence:** HIGH for feature categorization rationale. MEDIUM for complexity estimates (actual complexity depends on library behavior on iOS Safari specifically).

---

## Anti-Features

Things to deliberately NOT build. Common mistakes in this domain that waste time or undermine the product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Stem separation / source isolation | Too computationally heavy for browser. Demucs/Spleeter require server. Latency would be minutes, not seconds. Sets wrong expectation about what the tool can do | Stay with frequency-band splitting. Set expectation: "analysis works on mixed recordings" |
| Real-time microphone analysis | Live analysis of jazz rehearsal sounds appealing but is a completely different product. Mic input has latency, gain, noise issues. Audience is listeners/students not live performers | Stick to file upload. Scope creep risk is high |
| MIDI export or score generation | Lead sheet/notation generation from audio is an unsolved problem at high accuracy. Low accuracy output would discredit the tool | Display chord names. If notation is needed, use iReal Pro export (well-established) |
| Instrument isolation "solo/mute" buttons | Implies the app can isolate instruments, which it cannot (mixed stereo). Users will misunderstand frequency-band splitting as true stem isolation | Rename all concepts to "frequency band" language or "estimated [instrument] activity" |
| Roman numeral notation by default | Jazz musicians read chord names (Cmaj7, F#m7b5), not Roman numerals (Imaj7, #ivo7). Roman numerals confuse non-theory users | Show chord name primary, function label secondary. Roman numerals optional |
| Pitch-perfect chord accuracy guarantee | Chroma matching on mixed recordings has real limits. Comping pianists, guitar voicings, and upper extensions are hard | Surface confidence scores always. Never show a chord without confidence indicator |
| Note-level transcription (MIDI roll, piano roll) | Requires stem separation + high-accuracy pitch detection. Not achievable in browser on mixed recordings | Stay at chord level. Note-level is a different product category |
| Comprehensive equalizer / DSP tools | This is an analysis/visualization tool, not a DAW. Adding EQ, compression, effects creates scope creep into a different market | Keep audio playback clean. Speed/pitch adjustment (Amazing Slow Downer style) is the only DSP that's directly educational |
| Social features (sharing, playlists, accounts) | Backend requirement violates "no backend" constraint. Also adds authentication complexity with low educational ROI in v1 | File-based export covers sharing. Accounts can be added post-validation if users request |
| Multiple simultaneous file analysis | Comparing two takes sounds useful but multiplies analysis complexity and UI complexity. Not validated need | Single file per session. Comparison can be done by opening two tabs |

**Confidence:** HIGH — these are validated anti-patterns from adjacent domains (DAWs, music education tools, audio analysis research tools). The "stem isolation" false expectation is especially important to manage based on how Spleeter/Demucs got adopted.

---

## Feature Dependencies

```
MUST exist before → depends-on feature

Audio Upload + Web Audio Pipeline
    → ALL features (nothing works without audio)

Beat Detection (drum transient + bass onset)
    → BPM display
    → Pocket score (needs both streams)
    → Beat-synchronized canvas pulse
    → Bar/beat grid overlay
    → Timeline heat-map alignment

Chroma Vector Extraction
    → Chord template matching
    → Key detection
    → Harmonic tension scoring

Key Detection
    → Chord function labels (tonic/subdominant/dominant/altered)
    → Bar/beat grid overlay (need to know meter context)

Chord Template Matching
    → Chord log
    → Chord label display
    → Chord function labels

Harmonic Tension Scoring
    → Tension-tinted edges
    → Vertical tension meter
    → Timeline tension heatmap

Per-Instrument Activity Scoring
    → Role classification (soloing/comping/holding/silent)
    → Node visual states (role drives appearance)
    → Communication edge detection

Communication Edge Detection
    → Node graph (edges require edge weights)
    → Tension-tinted edges

Role Classification
    → Call-and-response detection (need to know who is soloing vs comping)
    → Node detail panel (role breakdown pie)

Call-and-Response Detection
    → Conversation log panel
```

**Critical path:** Audio upload → Beat detection → Chroma extraction → Chord matching → Key detection → Tension scoring → Visualization layer. Everything else is additive.

---

## MVP Recommendation

For a first working version that a jazz musician would recognize as musically meaningful:

### Must Ship in MVP

1. Audio upload + Web Audio API pipeline (nothing works without this)
2. Waveform display with playhead and transport controls
3. Beat detection + BPM display (establishes rhythmic ground truth)
4. Chroma extraction + chord template matching + chord display with confidence
5. Key detection + chord function labels
6. Harmonic tension score + vertical tension meter
7. Per-instrument activity + role classification
8. Node graph with role-based visual states and beat pulse
9. Pocket score (bass ↔ drums) with dedicated edge display
10. iOS Safari compatibility (non-negotiable per constraints)

### Defer to Post-MVP

| Feature | Reason to Defer |
|---------|----------------|
| Call-and-response detection | High complexity, depends on pitch detection quality on mixed audio |
| Conversation log panel | Depends on call-and-response |
| Bar/beat grid overlay | Requires meter inference (common time vs. 3/4 vs. 5/4) — jazz uses many meters |
| Pitch detection (YIN) | Accuracy on mixed recordings will be low and may undermine trust |
| Pre-loaded example tracks | Content work, not engineering. Can add post-launch |
| User annotations | Nice-to-have, not core to value proposition |
| Export (JSON/image) | Defer to after core experience is validated |
| Node detail panel (sparklines/pie) | Enhances but does not define the core experience |

### Rationale for This MVP Scope

The tension meter + chord display + node graph + pocket score form a coherent, musically meaningful unit. A jazz musician watching the visualization should be able to say "yes, that's a II-V-I" and "yes, the bass and drums are in the pocket" based on what they see. That's the validation signal. Features that add analysis depth (call-and-response, pitch detection, annotation) are best added after this core loop is proven accurate enough to trust.

---

## Complexity Assessment: Analysis Accuracy Risks

These features are in-scope but have accuracy risks on mixed-down stereo recordings that deserve explicit acknowledgment:

| Analysis Feature | Accuracy Risk | Mitigating Design |
|-----------------|---------------|-------------------|
| Chord detection | Guitar/piano voicings with upper extensions (9, 11, 13) will pattern-match to wrong root. Rootless voicings (common in jazz piano) are hard | Show confidence always. "Low confidence" is an honest display, not a failure |
| Key detection | Jazz modulation, modal tunes, Coltrane changes — key center shifts frequently | Rolling key detection window. Show uncertainty during transitions |
| Instrument role (keyboard vs. guitar) | Frequency overlap is real. A comping pianist and rhythm guitarist occupy similar bands | ZCR + spectral flux helps but will misclassify. Frame as "estimated" |
| Pocket score on rubato sections | Cross-correlation requires consistent pulse. Rubato passages (no steady beat) will produce meaningless pocket scores | Suppress pocket score display when BPM confidence is below threshold |
| Call-and-response timing | The 2–4s window is a heuristic. Overlapping call-and-response (common in jazz) breaks the model | Treat as "detected moments" not "all moments" |

**Confidence:** HIGH — these are known limitations of frequency-domain analysis on polyphonic audio, well-documented in music information retrieval literature.

---

## Sources

All findings from training knowledge (knowledge cutoff August 2025). No external sources could be verified (WebSearch and WebFetch unavailable during this research session).

**Tools whose feature sets informed this analysis:**
- Meyda.js (browser audio feature extraction) — audio feature vocabulary
- Sonic Visualiser + Vamp plugins — analysis feature conventions
- Transcribe! — waveform tool UX conventions
- iReal Pro — jazz chord display conventions
- Peaks.js — browser waveform display conventions
- Essentia (UPF) — music analysis algorithm catalog
- Amazing Slow Downer — jazz practice tool UX conventions

**Research gaps (verify before implementation):**
- Current state of browser-based chord detection accuracy benchmarks (post-2024 papers)
- Whether any new jazz analysis tools have launched 2025–2026 (potential competitors/references)
- Meyda.js current version chroma vector API (verify with Context7 before implementing)
- Web Audio API changes in Safari 18+ regarding AudioContext initialization on iOS
