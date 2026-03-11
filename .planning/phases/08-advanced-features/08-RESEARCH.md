# Phase 8: Advanced Features - Research

**Researched:** 2026-03-11
**Domain:** Pitch detection (Web Audio API), call-and-response detection, timeline annotations, session export (JSON + Canvas PNG), pre-loaded example tracks
**Confidence:** MEDIUM-HIGH

---

## Summary

Phase 8 adds four distinct capability areas on top of the established architecture: (1) pitch detection for keyboard and guitar to enable melodic vs. energetic activity distinction; (2) call-and-response detection and a conversation log panel; (3) user annotations on the timeline; and (4) session export (JSON + PNG) plus pre-loaded example tracks.

The existing codebase has strong, well-structured foundations. The AnalysisTick orchestrator pattern, the Zustand store, the ChordLogPanel drawer pattern, and the Timeline component are all directly reusable or extensible for this phase. No new third-party libraries are needed — everything can be built from existing Web Audio API primitives, Canvas API, and the project's own patterns.

The biggest technical risk is pitch detection accuracy on polyphonic content. The project processes a stereo mix without stem separation, so pitch detection on keyboard/guitar bands will pick up bleed from other instruments. The recommended approach is autocorrelation on the mid-range frequency bands (not full-spectrum), with a "pitch stability" heuristic (pitch must hold across 3+ frames) to distinguish melodic activity from transient/energetic activity. YIN is more accurate than naive autocorrelation for polyphonic scenarios but is more expensive to compute — given that fftSize=4096 is fixed, autocorrelation on a 2048-sample slice at 10fps is the safer choice.

Export is straightforward: JSON export uses `Blob` + `URL.createObjectURL` + `<a download>`, PNG uses `canvas.toBlob()`. The `download` attribute on anchor tags does not trigger a file download on iOS Safari — instead iOS opens the file inline. The workaround is to detect iOS and either show the data URL in a new window or display the raw JSON/image URL for the user to long-press-save.

**Primary recommendation:** Hand-roll autocorrelation pitch detection on pre-isolated frequency band data (not raw wideband signal), follow existing AnalysisTick patterns for integration, and model all new state (pitch, call-response, annotations) on AudioStateRef + Zustand separation established in prior phases.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API | Browser-native | `getFloatTimeDomainData` for pitch analysis | Already in use; Float32 precision is required for accurate autocorrelation |
| Canvas 2D API | Browser-native | `toBlob()` PNG export | Already used for all visualization; zero new deps |
| Meyda | 5.6.3 (already installed) | ZCR for melodic vs. energetic distinction | Already used in KbGuitarDisambiguator; ZCR is confirmed correct in 5.6.3 |
| Zustand | 5.0.11 (already installed) | Annotations, call-response log, pitch state | Established store pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | — | — | No additional libraries needed; all primitives available |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled autocorrelation | pitchy (npm) | pitchy is accurate but adds a dependency; autocorrelation is 30 lines and sufficient given that we only need "is melodic" boolean, not exact note names |
| Hand-rolled autocorrelation | ml5.js pitch | ml5 is a large bundle (~1MB) and overkill for a binary melodic/energetic flag |
| canvas.toBlob() | html2canvas | html2canvas would capture the whole DOM; we only want the canvas element which we already control |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── audio/
│   ├── PitchDetector.ts          # NEW — autocorrelation on band-filtered time data
│   └── CallResponseDetector.ts   # NEW — sliding window call/response detection
├── canvas/
│   └── (no new files — edge animation reuses EdgeAnimState pattern)
├── components/
│   ├── ConversationLogPanel.tsx  # NEW — mirrors ChordLogPanel drawer pattern
│   └── ExportControls.tsx        # NEW — JSON + PNG export buttons
└── store/
    └── useAppStore.ts             # EXTEND — add annotations, callResponseLog, pitchState slices
```

### Pattern 1: Autocorrelation Pitch Detector (ACF2+ pattern)
**What:** Run autocorrelation on Float32 time-domain samples. Reject signal when RMS < 0.01. Find first peak after initial dip in correlation array. Return Hz or -1 (no pitch detected).
**When to use:** Every AnalysisTick (10fps) for keyboard and guitar instruments when both are in lineup.
**Example:**
```typescript
// Source: cwilso/PitchDetect ACF2+ algorithm (MIT License)
// Adapted for band-isolated use (run on rawTimeDataFloat, gated by band RMS)

function detectPitch(buf: Float32Array, sampleRate: number): number {
  // RMS gate — reject silence / pure noise
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return -1;

  // Autocorrelation
  const SIZE = buf.length;
  const c = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE - i; j++)
      c[i] += buf[j] * buf[j + i];

  // Find first dip then first peak
  let d = 0;
  while (d < SIZE && c[d] > c[d + 1]) d++;
  let maxVal = -1, maxPos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }

  // Parabolic interpolation for sub-sample accuracy
  const x1 = c[maxPos - 1], x2 = c[maxPos], x3 = c[maxPos + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const T0 = a ? maxPos - b / (2 * a) : maxPos;

  return sampleRate / T0;
}
```
**CRITICAL NOTE:** The AudioStateRef already has `rawTimeDataFloat` (Float32Array, fftSize=4096) pre-allocated and populated each tick by AnalysisTick. Use this buffer directly — do NOT allocate a new one. The autocorrelation itself DOES allocate `new Float32Array(SIZE)` — this is the one unavoidable allocation per tick for pitch detection if we follow ACF2+. Pre-allocate `c` as a module-level buffer (same size as fftSize) to avoid per-tick allocation.

### Pattern 2: Melodic vs. Energetic Distinction
**What:** A note is "melodic" if pitch is stable across N consecutive frames. It is "energetic" if band RMS is high but pitch is unstable/absent.
**When to use:** After pitch detection passes, before call-response detection.
**Example:**
```typescript
// PitchState per instrument on AudioStateRef
interface InstrumentPitchState {
  pitchHz: number;          // -1 = no pitch detected
  stablePitchHz: number;    // -1 = not yet stable; set when 3+ consecutive frames agree
  pitchFrameCount: number;  // how many consecutive frames have detected the same pitch
  isMelodic: boolean;       // true if stable pitch detected
}

// A pitch is "same" if within 50 cents (2^(50/1200) ≈ 1.029 ratio)
function pitchesMatch(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const ratio = a > b ? a / b : b / a;
  return ratio < 1.029;
}
```

### Pattern 3: Call-and-Response Detection (Sliding Window)
**What:** Keyboard melodic activity followed by guitar melodic activity within a 2–4 second window. Log the exchange with timestamps.
**When to use:** Every AnalysisTick after melodic state is updated.
**Example:**
```typescript
// CallResponseState on AudioStateRef
interface CallResponseState {
  lastKbMelodicSec: number;    // audioCtx.currentTime when keyboard last went melodic; -1 = none
  callResponseLog: Array<{
    callSec: number;           // keyboard melodic onset
    responseSec: number;       // guitar melodic response
  }>;
  logMaxLen: number;           // cap at 200
  lastDetectedResponseSec: number; // debounce — don't log same response twice
}

// In AnalysisTick, after pitch state update:
// 1. If keyboard isMelodic → record lastKbMelodicSec = audioCtx.currentTime
// 2. If guitar isMelodic and lastKbMelodicSec > 0:
//    gap = now - lastKbMelodicSec
//    if (gap >= 2.0 && gap <= 4.0 && now !== lastDetectedResponseSec):
//      push to callResponseLog, set lastDetectedResponseSec = now
```

### Pattern 4: Animated Purple Edge on Call-and-Response
**What:** When a call-response is detected, trigger an animated state on the `guitar_keyboard` EdgeAnimState for ~2s.
**When to use:** Same tick as call-response log push.
**How it integrates:** The existing `guitar_keyboard` edge already has type `melodic` (purple, #a855f7) and `EdgeAnimState`. Add a `callResponseFlashIntensity` field to `EdgeAnimState` that CanvasRenderer reads to drive a stronger glow/animation. This mirrors the existing `flashIntensity` and `resolutionFlashIntensity` pattern exactly.

### Pattern 5: Timeline Click-to-Annotate
**What:** Modify `Timeline.tsx` to handle a second interaction mode. On click, check if Shift is held (or a mode toggle button is active). If annotation mode is active, open a small text input overlay at click position instead of seeking.
**When to use:** USER-01 requirement.
**Annotation data structure:**
```typescript
// In Zustand store
interface Annotation {
  id: string;          // crypto.randomUUID() or Date.now().toString()
  timeSec: number;     // position on timeline
  text: string;
}
// Store field: annotations: Annotation[]
// Store action: addAnnotation, removeAnnotation
```
Annotations render as small markers (colored diamonds or triangles) on the timeline bar, overlaid similarly to beat grid ticks.

### Pattern 6: JSON Export
**What:** Serialize all analysis state + annotations to JSON, trigger browser download.
**When to use:** USER-02 requirement. Export button in ExportControls component.
```typescript
// No new library needed
function exportSessionJSON(audioStateRef, annotations) {
  const payload = {
    exportedAt: new Date().toISOString(),
    fileName: store.getState().fileName,
    duration: audioStateRef.current.transport.duration,
    detectedKey: store.getState().detectedKey,
    detectedKeyMode: store.getState().detectedKeyMode,
    currentBpm: store.getState().currentBpm,
    chordLog: audioStateRef.current.chord?.chordLog ?? [],
    callResponseLog: audioStateRef.current.callResponse?.callResponseLog ?? [],
    tensionHeatmap: Array.from(audioStateRef.current.tensionHeatmap ?? []),
    annotations,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, 'jazz-session.json');
  URL.revokeObjectURL(url);
}
```

### Pattern 7: PNG Export
**What:** Capture the visualizer canvas as PNG.
**When to use:** USER-03 requirement.
```typescript
// Source: MDN HTMLCanvasElement.toBlob documentation (HIGH confidence)
function exportCanvasPNG(canvas: HTMLCanvasElement) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'jazz-visualizer.png');
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

### Pattern 8: Pre-loaded Example Tracks (USER-04)
**What:** A bundled audio file with a companion JSON file containing expert annotations.
**How it works:** The audio file is placed in `public/examples/`. On app load, offer a "Load Example" button that fetches the audio file via `fetch()`, creates an `ArrayBuffer`, and feeds it through the same `AudioEngine.loadAudioBuffer` path as FileUpload. The companion JSON is fetched and hydrated into the Zustand annotations store.
**Key decision:** The audio file must be small enough to bundle (<5MB recommended). A 90-second clip at 128kbps MP3 is ~1.4MB.

### Anti-Patterns to Avoid
- **Running full-spectrum autocorrelation at 10fps on 4096 samples:** The naive O(n²) ACF2+ on 4096 samples is ~16M operations/tick. Pre-allocate the correlation buffer and only run on a 2048-sample window (half the fftSize). At 44.1kHz, 2048 samples = 46ms — sufficient for detecting pitches down to ~22Hz (the guitar low E fundamental is 82Hz, keyboard low A is 27.5Hz).
- **Using `Meyda.extract('spectralFlux')` for pitch analysis:** Already documented as broken in 5.6.3 (D-02-03-1). Do not use it anywhere.
- **Per-tick allocation of correlation buffer:** Must be pre-allocated as a module-level or AudioStateRef-level buffer. The comment in AnalysisTick.ts states "This function must NOT allocate any new typed arrays."
- **Using `a.download` for iOS Safari file download:** iOS Safari opens the file in-browser rather than downloading. Detect iOS (`/iPad|iPhone|iPod/.test(navigator.userAgent)`) and show the data URL directly in a new window, or display instructions to long-press-save.
- **Mutating AudioStateRef from React components:** All write operations to AudioStateRef-resident state (pitchState, callResponseState) must happen inside AnalysisTick or callbacks from it — never from React event handlers. Annotations live in Zustand only (no audio hot-path involvement).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canvas download (PNG) | Custom serializer | `canvas.toBlob()` | Built-in, async, handles HiDPI canvas correctly |
| JSON download | Manual encoding | `new Blob([JSON.stringify(...)])` + `URL.createObjectURL` | 5 lines, no dependencies |
| Pitch detection | YIN from scratch | ACF2+ autocorrelation (30 lines) | YIN adds ~200 lines for modest accuracy gain; ACF2+ is sufficient for binary melodic/energetic flag |
| Unique annotation IDs | Custom counter | `crypto.randomUUID()` | Browser-native, collision-proof |

**Key insight:** Everything in this phase is built from browser primitives and existing codebase patterns. The discipline is in integration (hooking new state into AnalysisTick correctly), not in finding new libraries.

---

## Common Pitfalls

### Pitfall 1: Pitch Detection False Positives on Mix Bleed
**What goes wrong:** Guitar and keyboard share the mid/mid_high bands (250–3000Hz). When drums hit, the transient energy across all bands causes autocorrelation to return a spurious pitch value.
**Why it happens:** Autocorrelation on a mixed signal detects the dominant periodic component, which under a drum transient may be the snare tone or room resonance.
**How to avoid:** Gate pitch detection on band-isolated RMS. Only attempt autocorrelation when the instrument-specific band energy is above the calibration `comping` threshold (0.40 * peak). Use the 3-frame stability window — a real melodic note persists; a transient doesn't.
**Warning signs:** Call-response events firing during drum fills or cymbal crashes.

### Pitfall 2: Call-and-Response Window Too Tight
**What goes wrong:** A 2–4 second window misses jazz exchanges where the "response" comes 4.5 seconds after the "call" (common in ballads at 60 BPM where phrases are 4 bars apart).
**Why it happens:** Jazz phrase lengths are BPM-dependent. At 60 BPM, 2 bars = 8 seconds.
**How to avoid:** The spec says 2–4s — implement exactly that for now. Log it as a parameter that can be tuned. The window is appropriate for uptempo jazz (120–200 BPM) which is the primary target.
**Warning signs:** Zero call-response events on slow ballads.

### Pitfall 3: iOS Safari `a.download` Non-Behavior
**What goes wrong:** On iOS, clicking an anchor with a `download` attribute opens the file in Safari's PDF/image viewer rather than triggering a download.
**Why it happens:** iOS Safari does not support the `download` attribute on anchor tags for user-facing download dialogs.
**How to avoid:** Detect iOS before calling triggerDownload. On iOS, use `window.open(url, '_blank')` to open the JSON/PNG in a new tab where the user can long-press to save. For JSON specifically, consider showing the raw data in a `<textarea>` the user can copy.
**Warning signs:** On iOS simulator, clicking "Export JSON" opens a new tab with raw JSON text instead of downloading.

### Pitfall 4: Canvas toBlob Captures the HiDPI Canvas
**What goes wrong:** The CanvasRenderer uses `setupHiDPI()` which multiplies canvas physical dimensions by `devicePixelRatio`. `toBlob()` captures physical pixels, so on a 2x display the exported PNG is 2x the logical size.
**Why it happens:** `toBlob()` operates on the canvas backing store, which is at physical resolution.
**How to avoid:** This is actually correct behavior — the high-res PNG is better quality. Just document that exported images may be 2x the logical canvas size. If a specific logical size is needed, create an offscreen canvas at logical dimensions and draw the visualizer canvas into it scaled.
**Warning signs:** Exported PNG dimensions are twice what the user sees on screen.

### Pitfall 5: AudioStateRef Mutation from Annotation React Handler
**What goes wrong:** If annotations (timeSec, text) were stored on AudioStateRef instead of Zustand, React click handlers would mutate a ref, bypassing Zustand subscriptions and breaking export.
**Why it happens:** Temptation to co-locate all session data.
**How to avoid:** Annotations have nothing to do with the audio hot-path. They belong exclusively in Zustand. Only data that changes at 10fps and is read by CanvasRenderer should live on AudioStateRef.

### Pitfall 6: Pre-allocated Pitch Correlation Buffer Size Mismatch
**What goes wrong:** The AnalysisTick currently operates on fftSize=4096 (fixed by D-01-01-3). The ACF2+ pitch algorithm needs a buffer of the same size as the time-domain input. If the pre-allocated buffer is wrong size, the algorithm silently produces wrong results.
**Why it happens:** The ACF2+ correlation buffer `c` must be `Float32Array(fftSize)` not `Float32Array(fftSize/2)`.
**How to avoid:** Pre-allocate the correlation buffer as `Float32Array(fftSize)` (4096 elements) in a `initPitchState()` factory function on AudioStateRef, matching the existing pattern for all other pre-allocated buffers.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Extending AudioStateRef with PitchState
```typescript
// Source: types.ts existing pattern (all new state follows this shape)
interface InstrumentPitchState {
  pitchHz: number;           // current pitch, -1 if not detected
  prevPitchHz: number;       // previous tick's pitch
  pitchFrameCount: number;   // consecutive frames with matching pitch
  isMelodic: boolean;        // true when pitchFrameCount >= 3
  correlationBuffer: Float32Array;  // pre-allocated, length = fftSize
}

interface PitchAnalysisState {
  keyboard: InstrumentPitchState;
  guitar: InstrumentPitchState;
}

// On AudioStateRef: pitch: PitchAnalysisState | null
```

### Extending useAppStore for Annotations and Call-Response
```typescript
// Source: existing useAppStore.ts pattern
interface Annotation {
  id: string;
  timeSec: number;
  text: string;
}

interface CallResponseEntry {
  callSec: number;
  responseSec: number;
  gapSec: number;
}

// Add to AppState:
annotations: Annotation[];
callResponseLog: CallResponseEntry[];

// Add actions:
addAnnotation: (timeSec: number, text: string) => void;
removeAnnotation: (id: string) => void;
setCallResponseLog: (log: CallResponseEntry[]) => void;
```

### AnalysisTick Integration Point
```typescript
// Source: AnalysisTick.ts existing callback pattern
// Add a new callback parameter:
export function runAnalysisTick(
  state: AudioStateRef,
  onRoleChange?: ...,
  onChordChange?: ...,
  onTensionUpdate?: ...,
  onBeatUpdate?: ...,
  onMelodyUpdate?: (kbMelodic: boolean, gtMelodic: boolean, callResponse: CallResponseEntry | null) => void
): void { ... }
```

### Annotation Markers on Timeline
```typescript
// Source: Timeline.tsx beatGrid tick rendering pattern
// Annotations render as small diamond/triangle markers at their timeSec position:
{annotations.map((ann) => {
  const pct = (ann.timeSec / duration) * 100;
  return (
    <div
      key={ann.id}
      title={ann.text}
      style={{
        position: 'absolute',
        left: `${pct}%`,
        top: 0,
        bottom: 0,
        width: '3px',
        backgroundColor: '#f59e0b',  // amber — distinguishable from beat grid
        cursor: 'pointer',
        zIndex: 2,
      }}
    />
  );
})}
```

### iOS Detection for Export
```typescript
// Source: navigator.userAgent pattern — LOW confidence (training data), verify on device
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

function triggerDownload(url: string, filename: string) {
  if (isIOS) {
    window.open(url, '_blank');
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getByteTimeDomainData` for pitch | `getFloatTimeDomainData` preferred | ~2021 (widely available) | 8-bit vs 32-bit precision; for pitch detection, float is meaningfully better |
| `toDataURL` for canvas export | `toBlob()` preferred | ~2020 | `toBlob` is async, doesn't block UI, better for large canvases |
| `a.download` universal | iOS Safari ignores `download` | iOS 12-13 era | Need iOS-specific workaround for downloads |

**Deprecated/outdated:**
- Meyda `spectralFlux` extractor: broken in 5.6.3 (D-02-03-1 decision). Already hand-rolled in `KbGuitarDisambiguator.ts`. Do not use Meyda for any new spectral flux computations.

---

## Open Questions

1. **Keyboard frequency range for pitch detection**
   - What we know: Keyboard occupies `mid` (250–2000Hz) and `mid_high` (300–3000Hz) bands. Piano's melodic range is roughly C2 (65Hz) through C7 (2093Hz).
   - What's unclear: The low end of the keyboard range (below 250Hz) is masked by the bass band. Pitches below 250Hz on keyboard won't be detected by band-gated autocorrelation.
   - Recommendation: For call-and-response detection, restrict pitch detection to the 250–2000Hz range (the `mid` band). This covers C4 (261Hz) through C7 (2093Hz) — the most melodically active octaves for jazz piano comping. Accept that low bass-register piano notes won't trigger melodic detection.

2. **Guitar frequency range for pitch detection**
   - What we know: Guitar fundamentals range from E2 (82Hz) through E5 (659Hz). Guitar occupies `mid` (250–2000Hz) and `mid_high` (300–3000Hz) bands. The low E string (82Hz) is in the bass band.
   - What's unclear: The E2 and B2 strings on guitar (82–247Hz) will not be detected by the band-gated approach.
   - Recommendation: Accept this limitation. The melodically interesting guitar register (D3 through E5, 147–659Hz) is well within the `mid` band. Rhythm guitar activity in the low register will still be detected if it has sufficient `mid` band energy.

3. **Call-and-response debounce**
   - What we know: A call-response event should be logged once per exchange, not once per tick during overlapping melodic windows.
   - What's unclear: How long to debounce. If keyboard is melodic for 3 seconds, and guitar responds after 2.5 seconds, does the response expire the "call" or allow another response?
   - Recommendation: After a call-response event is logged, reset `lastKbMelodicSec = -1`. A new call requires new keyboard melodic onset. This prevents cascading false detections.

4. **Example track audio file licensing**
   - What we know: The app needs at least one pre-loaded audio track. Bundling a copyrighted jazz recording is not possible.
   - What's unclear: Whether a Creative Commons jazz recording suitable for demonstration exists at appropriate length/quality.
   - Recommendation: Use a short (60–90s) royalty-free jazz clip from Free Music Archive (freemusicarchive.org) or similar CC0/CC-BY source. Alternatively, generate a short demonstration track using a free DAW. Document the source in `public/examples/README.txt`. This is a content decision, not a code decision — the code for loading it is straightforward.

5. **Conversation log panel vs. chord log panel layout**
   - What we know: ChordLogPanel is an expandable drawer below the timeline. A second drawer (ConversationLog) would be a third drawer stacked below it.
   - What's unclear: Whether the UI is getting too tall with three drawers (ChordLog + ConversationLog + possible AnnotationList).
   - Recommendation: ConversationLogPanel follows the exact same expandable drawer pattern as ChordLogPanel. The stack of drawers is acceptable since users choose which to expand. Annotations are shown directly on the timeline bar (no separate drawer needed).

---

## Sources

### Primary (HIGH confidence)
- MDN Web Docs: `HTMLCanvasElement.toBlob()` — PNG export pattern, iOS widely available status
- MDN Web Docs: `HTMLCanvasElement.toDataURL()` — performance warning, fallback info
- MDN Web Docs: `AnalyserNode.getFloatTimeDomainData()` — Float32 precision advantage for pitch detection
- MDN Web Docs: `Blob` constructor — JSON export pattern
- Existing codebase (`src/audio/types.ts`, `src/audio/AnalysisTick.ts`, `src/store/useAppStore.ts`, `src/components/ChordLogPanel.tsx`, `src/components/Timeline.tsx`) — all architectural patterns are HIGH confidence from direct code inspection

### Secondary (MEDIUM confidence)
- cwilso/PitchDetect README + GitHub (ACF2+ algorithm description) — algorithm structure confirmed, exact implementation parameters from primary source
- Meyda.js audio features documentation — feature capabilities confirmed at current version

### Tertiary (LOW confidence)
- iOS Safari `a.download` non-behavior — widely reported community pattern; not verified against current iOS 17/18 Safari release notes. Validate on actual iOS device.
- 50-cent pitch matching threshold — common musicology constant, not verified against specific Web Audio API guidance.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing
- Architecture: HIGH — directly mirrors established patterns from prior phases
- Pitfalls: MEDIUM — iOS export behavior is LOW confidence (needs device validation); pitch detection pitfalls are MEDIUM (theory-based, need empirical tuning)
- Open questions: 5 flagged, all have clear resolution paths

**Research date:** 2026-03-11
**Valid until:** 2026-06-11 (stable domain — Web Audio API, Canvas API change slowly)
