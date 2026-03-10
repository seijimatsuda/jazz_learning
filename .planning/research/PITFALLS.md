# Domain Pitfalls: Browser-Based Jazz Audio Visualization

**Domain:** Browser-based real-time audio analysis + Canvas visualization (React + Web Audio API + Meyda.js)
**Researched:** 2026-03-10
**Confidence note:** Web Audio API and Canvas pitfalls verified against MDN official documentation (HIGH confidence). Meyda.js-specific pitfalls from training knowledge only — WebFetch to meyda.js.org was blocked (MEDIUM/LOW confidence, flagged per pitfall). iOS Safari behavior verified via MDN autoplay guide (HIGH confidence).

---

## Critical Pitfalls

Mistakes that cause rewrites or make the app non-functional on iOS Safari.

---

### Pitfall 1: AudioContext Created Outside User Gesture on iOS Safari

**What goes wrong:** `new AudioContext()` is created at module load time or in a React `useEffect` on mount — before any user interaction. On iOS Safari, the AudioContext starts in `suspended` state and calling `resume()` without being inside a direct user gesture handler fails silently or throws. Audio never plays. The app appears broken.

**Why it happens:** iOS Safari enforces an extremely strict autoplay policy: the Web Audio API AudioContext must be created or resumed from within the synchronous call stack of a user gesture event (tap, click, keydown). `useEffect` on mount is NOT a user gesture. `setTimeout` callbacks from user gestures are NOT user gestures. Only the direct event handler counts.

**Consequences:** The entire audio pipeline fails on iOS. No FFT, no visualization, nothing. This is the most common reason React + Web Audio apps don't work on iPhone.

**Prevention:**
- Do NOT call `new AudioContext()` at module scope or in `useEffect()` on mount.
- Create the AudioContext inside the `onClick`/`onTouchStart` handler of your "Upload and Analyze" or "Play" button.
- After creation, check `audioCtx.state` and call `audioCtx.resume()` in the same handler if state is `'suspended'`.
- Store the context in a React `useRef` so it persists across renders without being recreated.

```typescript
// WRONG — breaks on iOS Safari
const audioCtx = new AudioContext(); // at module scope

// WRONG — breaks on iOS Safari
useEffect(() => {
  const audioCtx = new AudioContext(); // not a user gesture
}, []);

// CORRECT
const audioCtxRef = useRef<AudioContext | null>(null);
const handlePlayButton = () => {
  if (!audioCtxRef.current) {
    audioCtxRef.current = new AudioContext();
  }
  if (audioCtxRef.current.state === 'suspended') {
    audioCtxRef.current.resume();
  }
  // ... start analysis
};
```

**Detection (warning signs):**
- Audio works on desktop Chrome but not on iPhone.
- `audioCtx.state` logs as `'suspended'` after creation.
- Console shows no errors but no audio plays on iOS.
- `audioCtx.resume()` appears to succeed but audio still doesn't play.

**Phase:** Address in Phase 1 (Audio Pipeline foundation). Build iOS-first, not as an afterthought.

**Confidence:** HIGH — verified via MDN autoplay guide. Multiple sources confirm iOS Safari requires direct user gesture.

---

### Pitfall 2: Meyda.js Uses ScriptProcessorNode by Default (Deprecated, Main-Thread Blocking)

**What goes wrong:** Meyda.js historically used `ScriptProcessorNode` for audio feature extraction in browser mode. `ScriptProcessorNode` is officially deprecated and runs audio callbacks on the main JavaScript thread. This means every Meyda analysis frame (at ~43ms intervals for 2048 buffer size at 44100Hz) fires a JavaScript callback on the main thread. When Canvas animation is also running on the main thread via `requestAnimationFrame`, the two compete for main-thread time. The result is audio glitches, dropped frames, and jank.

**Why it happens:** `AudioWorklet` is the modern replacement but requires HTTPS, worklet file loading, and a more complex setup. Meyda added AudioWorklet support but teams frequently use the default ScriptProcessorNode path because it's simpler to set up.

**Consequences:**
- Audio analysis callbacks can delay Canvas RAF callbacks, causing dropped frames.
- Canvas RAF callbacks can delay audio callbacks, causing audio buffer underruns and glitches.
- The interaction worsens as feature count increases (chroma, RMS, ZCR, spectral centroid all computed per callback).
- On lower-powered iOS devices the problem is significantly worse than desktop.

**Prevention:**
- Verify which Meyda.js mode you're using. Check if AudioWorklet mode is available in current Meyda version (verify with Context7 before implementation — Meyda may have fully migrated to AudioWorklet in recent versions, or may still default to ScriptProcessorNode).
- If Meyda still exposes a ScriptProcessorNode path, use AudioWorklet mode explicitly even though setup is harder.
- Keep the Meyda feature set minimal: request only `['rms', 'chroma', 'zcr', 'spectralCentroid', 'spectralFlux']`. Each additional feature adds main-thread cost.
- Separate concerns: run Meyda analysis at a lower rate (every N frames) rather than on every audio buffer. Decouple analysis rate from Canvas frame rate.

**Detection (warning signs):**
- Audio sounds stuttery or has periodic dropouts.
- Canvas framerate drops below 60fps consistently, not just on complex scenes.
- Chrome DevTools shows long tasks in main thread around audio callback timing.
- Performance profiler shows `ScriptProcessorNode` in the call stack.

**Phase:** Address in Phase 1 (Audio Pipeline). Architecture decision affects everything downstream.

**Confidence:** MEDIUM — ScriptProcessorNode deprecation is HIGH confidence (verified via MDN). Whether current Meyda version defaults to AudioWorklet is LOW confidence (need to verify with Context7 during implementation).

---

### Pitfall 3: AudioContext Sample Rate Mismatch with Uploaded Audio

**What goes wrong:** iOS Safari's default AudioContext sample rate is `48000 Hz`, not `44100 Hz`. Many jazz recordings are mastered at `44100 Hz`. When you feed a 44100Hz MP3 into a 48000Hz AudioContext, the browser performs sample rate conversion transparently. However, this changes the relationship between your FFT bin count and actual frequencies. If you hardcode frequency band boundaries in Hz (e.g., "bass is 20-250Hz"), you must calculate bin indices from Hz using `sampleRate / fftSize`, not from a hardcoded assumption. Getting this wrong means your bass frequency band is actually measuring 200-270Hz instead of 20-250Hz, invalidating all frequency-band splitting.

**Why it happens:** Developers test on desktop Chrome at 44100Hz and never notice. iOS uses 48000Hz as hardware default. The AudioContext `sampleRate` property reflects the actual rate after creation — but teams forget to read it and hardcode bin math.

**Consequences:**
- All frequency band boundaries are wrong by a 48/44.1 = 1.088x scaling factor on iOS.
- Bass activity scoring picks up low midrange instead of bass.
- Drum transient detection in the 6-10kHz range is actually measuring ~6.5-10.9kHz.
- Pocket score and instrument role detection are systematically wrong on iOS.

**Prevention:**
- Never hardcode FFT bin indices. Always compute them from `audioContext.sampleRate` and `analyserNode.fftSize`.
- Create a utility function: `hzToBin(hz, sampleRate, fftSize) => Math.round(hz * fftSize / sampleRate)`.
- You can request a specific sample rate at AudioContext creation (`new AudioContext({ sampleRate: 44100 })`), but this may not be honored on all devices — always read back `audioCtx.sampleRate` after creation.

```typescript
// WRONG — hardcoded for 44100Hz, breaks on iOS 48000Hz
const BASS_LOW_BIN = 1;   // ~20 Hz
const BASS_HIGH_BIN = 11; // ~250 Hz

// CORRECT — computed from actual context sample rate
const hzToBin = (hz: number, sr: number, fftSize: number) =>
  Math.round(hz * fftSize / sr);
const BASS_LOW_BIN = hzToBin(20, audioCtx.sampleRate, analyser.fftSize);
const BASS_HIGH_BIN = hzToBin(250, audioCtx.sampleRate, analyser.fftSize);
```

**Detection (warning signs):**
- Results on iOS differ systematically from desktop Chrome for the same audio.
- `console.log(audioCtx.sampleRate)` returns 48000 on iOS, 44100 on desktop Chrome.
- Bass frequency band appears "quieter" on iOS despite audible bass in the recording.

**Phase:** Address in Phase 1 (Audio Pipeline). Frequency bin math is a foundational calculation used everywhere.

**Confidence:** HIGH — AudioContext sampleRate behavior verified via MDN. Sample rate mismatch is a well-documented iOS Web Audio issue. The specific behavior of `{ sampleRate: 44100 }` constructor option not being honored is MEDIUM confidence (MDN mentions the option but does not explicitly document whether iOS Safari honors it).

---

### Pitfall 4: AnalyserNode `minDecibels`/`maxDecibels` Clipping Silent Content

**What goes wrong:** `getByteFrequencyData()` scales the linear FFT output into a 0-255 byte range using `minDecibels` (default: -100 dB) and `maxDecibels` (default: -30 dB). Any frequency content outside this range is clipped to 0 or 255. For jazz recordings with wide dynamic range (rubato piano solos, softly played bass lines), significant portions of the spectrum fall below -100 dB and return as 0 even when audio is present. Conversely, loud transients from drum hits saturate at 255 and lose dynamic distinction.

**Why it happens:** Teams copy the standard AnalyserNode example from MDN (which uses `Uint8Array` and `getByteFrequencyData`) and never tune `minDecibels`/`maxDecibels` for their actual audio material. Jazz has extreme dynamic range compared to electronic music.

**Consequences:**
- Soft passages show no activity in all frequency bands, even when instruments are playing.
- The harmonic tension score drops to zero during quiet sections because chroma extraction reads near-zero values.
- Activity scoring for comping piano (plays softly under a soloist) may flatline.
- Beat detection misses soft kick drum hits.

**Prevention:**
- Use `getFloatFrequencyData(Float32Array)` for analysis instead of `getByteFrequencyData`. Float data gives the actual dB values (-Infinity to 0) without clipping.
- Or tune `minDecibels` and `maxDecibels` per-track during the calibration pass: compute peak/RMS values, then set range to `[peak - 70, peak + 5]` dynamically.
- The 3-second calibration pass in the spec is exactly the right time to measure dynamic range and set these parameters.

**Detection (warning signs):**
- All analysis goes silent/zero on quiet passages even though audio is audible.
- Confidence scores for chord detection drop to 0 during soft sections.
- Chroma vectors return all-zeros during piano-only passages.

**Phase:** Address in Phase 1 (Audio Pipeline) during calibration pass implementation.

**Confidence:** HIGH — AnalyserNode `minDecibels`/`maxDecibels` clipping behavior verified via MDN AnalyserNode documentation.

---

## Moderate Pitfalls

Mistakes that produce incorrect analysis results or cause performance degradation.

---

### Pitfall 5: Garbage Collection Jank from Per-Frame Array Allocation

**What goes wrong:** Inside the `requestAnimationFrame` loop, new `Float32Array` or `Uint8Array` buffers are allocated on every frame: `const data = new Float32Array(analyser.frequencyBinCount)`. At 60fps, this allocates 60 typed arrays per second. JavaScript's garbage collector eventually sweeps them, causing frame time spikes of 10-50ms that appear as visible jank — especially noticeable on iOS where GC pauses are longer.

**Why it happens:** The MDN AnalyserNode docs show the correct pattern (allocate once outside the loop), but it is easy to write the allocation inside the loop accidentally, especially in React where closures and effects can re-create functions.

**Consequences:**
- Periodic jank spikes (every 5-30 seconds) regardless of scene complexity.
- On iOS, GC pauses are more pronounced and the jank is more visible.
- The beat pulse animation stutters exactly when the GC fires, which is jarring because it breaks rhythmic sync.

**Prevention:**
- Allocate ALL typed arrays (`Float32Array`, `Uint8Array`) ONCE in `useRef` or in a module-level constant.
- The RAF callback only calls `analyser.getFloatFrequencyData(dataArrayRef.current)` — it never creates new arrays.
- Apply the same discipline to any intermediate computation buffers used in chroma calculation, smoothing, etc.

```typescript
// WRONG — allocates every frame
function drawFrame() {
  requestAnimationFrame(drawFrame);
  const data = new Float32Array(analyser.frequencyBinCount); // GC victim
  analyser.getFloatFrequencyData(data);
}

// CORRECT — allocate once
const dataRef = useRef(new Float32Array(analyser.frequencyBinCount));
function drawFrame() {
  requestAnimationFrame(drawFrame);
  analyser.getFloatFrequencyData(dataRef.current); // reuse
}
```

**Detection (warning signs):**
- Chrome DevTools performance profile shows periodic long GC events (gray bars in the timeline).
- Frame time is normally 5-8ms but spikes to 20-50ms periodically.
- The jank pattern is regular (happens on a fixed interval, not triggered by complex scenes).

**Phase:** Address in Phase 1 (Audio Pipeline) and Phase 2 (Canvas Visualization). The discipline must be built in from the start — retrofitting is error-prone.

**Confidence:** HIGH — pattern verified via MDN Canvas optimization docs and Web Audio API visualization examples.

---

### Pitfall 6: Chroma Vector Accuracy on Rootless Jazz Voicings

**What goes wrong:** Template matching for jazz chord detection assumes each chord type has a characteristic chroma vector profile. However, jazz pianists routinely play rootless voicings (e.g., a Cmaj7 voiced as E-G-B-D with no C). The chroma vector for this voicing has strong energy on E, G, B, D — which pattern-matches better to E minor or G major than C major. The chord detector reports the wrong chord consistently for a skilled jazz pianist's comping style.

**Why it happens:** Chord template matching was developed primarily for pop/rock, where root-position triads and seventh chords with the root present are standard. Jazz harmony routinely inverts this assumption, especially for piano and guitar comping behind a soloist.

**Consequences:**
- Chord detection accuracy drops to 40-60% for jazz recordings with active piano comping.
- Chord log shows wrong chord names, undermining user trust.
- Chord function labeling (tonic/dominant/subdominant) is wrong because the root identification is wrong.
- Tension scoring based on chord templates is miscalibrated.

**Prevention:**
- Do not present chord detection results as authoritative. Always show confidence score (gap between top-2 matches).
- Consider chroma-based approach rather than root-based: label chords by their interval content (e.g., "major 7th quality" rather than "Cmaj7") when root is ambiguous.
- The 300ms smoothing window already in the spec helps reduce per-frame noise but does not solve rootless voicing ambiguity.
- Add explicit "low confidence" state to chord display — show "Unknown" or "~Cmaj7?" when confidence gap is below threshold (e.g., < 0.15).
- Verify whether any current Meyda chroma extraction or third-party jazz chord library handles rootless voicings better. Check Context7 for current Meyda chroma API during implementation.

**Detection (warning signs):**
- Chord labels flip rapidly between two or three related chords (e.g., Cmaj7 → Em → G alternating every beat).
- Confidence scores are consistently low (below 0.3) even when the music has clear harmonic movement.
- User testing with a jazz musician reveals consistent chord name errors.

**Phase:** Address in Phase 2 (Chord Detection). Design for graceful degradation — build the "Unknown" display state from the start.

**Confidence:** HIGH for the rootless voicing problem being real (well-documented in MIR literature). MEDIUM for specific confidence threshold values (0.15 is an estimate from training knowledge; calibrate empirically).

---

### Pitfall 7: Beat Detection Failure on Swing Rhythm and Rubato

**What goes wrong:** Standard beat detection algorithms (spectral flux, onset strength) assume evenly-spaced beats (straight time). Jazz swing rhythm has a ternary subdivision — eighth notes are played roughly in a 2:1 ratio (long-short), not 1:1. This produces onset patterns that offset from the beat grid. Tempo estimation algorithms trained on straight-time music will report the swing eighth as a beat, giving a BPM reading double the actual tempo.

**Rubato passages** (common in jazz ballads and solo piano introductions) have no steady pulse at all. Beat detection on rubato produces meaningless IOI (inter-onset interval) estimates and should be suppressed, not displayed.

**Consequences:**
- BPM displays "248 BPM" for a 124 BPM swing tune (counting eighth notes instead of quarter notes).
- Beat-synchronized canvas pulse fires on the wrong beat subdivisions, creating visual sync that looks wrong to a jazz musician.
- Pocket score (bass ↔ drums cross-correlation) is computed against a false beat grid, producing garbage output.
- Bar/beat grid overlay is offset from musical bars.

**Prevention:**
- The dual-stream beat detection in the spec (drum transients + bass onsets) helps: use the two streams to vote on beat positions rather than trusting a single stream.
- After detecting onset intervals, check for 2:1 swing ratio patterns and halve the BPM if the ratio matches (long-short clustering).
- Compute BPM confidence as IOI consistency (coefficient of variation). If CV is above 0.3, display "—" instead of a BPM number (rubato detected).
- Suppress pocket score display when BPM confidence is below threshold — the spec mentions this but it must be implemented correctly from the start.
- Consider tempo range constraints: jazz standards are typically 60-320 BPM. Reject candidates outside this range.

**Detection (warning signs):**
- BPM reads exactly 2x or 3x the audible tempo.
- Canvas beat pulse fires on every off-beat swing eighth note.
- BPM oscillates wildly on ballad introductions.
- Pocket score shows high variance on clearly well-grooved tracks.

**Phase:** Address in Phase 1 (Beat Detection subfeature) and Phase 2 (Pocket Score). Build the rubato-detection suppression at the same time as beat detection, not afterward.

**Confidence:** MEDIUM — the swing double-tempo problem and rubato suppression are well-known in music information retrieval. Specific algorithm details (IOI clustering approach) are from training knowledge, not verified against a current source.

---

### Pitfall 8: Canvas shadowBlur and Glow Effects Destroying Frame Rate

**What goes wrong:** The spec calls for node glow effects, breathing glows on the bass node, ripple effects on drums, and tension-tinted edges. These are commonly implemented using `ctx.shadowBlur` and `ctx.shadowColor`. `shadowBlur` forces the browser to perform a Gaussian blur on every draw call, which is GPU-expensive and scales with the number of pixels in the blurred region. At 4 instrument nodes plus edges, running `shadowBlur` on every RAF fires a full GPU blur 60x per second. On iOS devices with lower GPU bandwidth, this alone can drop framerate below 30fps.

**Why it happens:** `shadowBlur` looks great in isolation but teams don't test it with multiple overlapping elements at 60fps on lower-powered hardware. Desktop Chrome handles it fine, masking the problem until iOS testing.

**Consequences:**
- Smooth 60fps on desktop Chrome, choppy 15-30fps on iPhone.
- iOS battery drain is significantly worse.
- The visual experience (node breathing, ripple) that defines the app's character becomes unwatchable on target hardware.

**Prevention:**
- Do NOT use `ctx.shadowBlur` for animated elements. Instead, pre-render glow layers to offscreen canvases at multiple intensity levels and composite them.
- Use multiple overlapping circles with decreasing opacity and increasing radius to approximate a glow — this is faster than a Gaussian blur.
- Use the `{ alpha: false }` canvas context option on layers where transparency is not needed.
- Layer the Canvas: static background on one canvas, beat-synced node positions on a second canvas, edge animations on a third. Only clear/redraw the layer that changed.

```typescript
// WRONG — blur on every animated frame
ctx.shadowBlur = 20;
ctx.shadowColor = 'rgba(255, 180, 0, 0.8)';
ctx.arc(x, y, radius, 0, Math.PI * 2);
ctx.fill();
ctx.shadowBlur = 0; // must reset manually — easy to forget

// BETTER — pre-rendered glow compositing
// Draw glow layers from offscreen canvas, then draw crisp node on top
ctx.drawImage(preRenderedGlowCanvas, x - glowRadius, y - glowRadius);
```

**Detection (warning signs):**
- App runs at 60fps on Chrome desktop but 20-30fps on iPhone.
- Chrome DevTools GPU activity spikes during node rendering even when Canvas scene is not complex.
- Removing `shadowBlur` from a single node restores framerate.
- `ctx.shadowBlur = 0` is missing after glow draws, causing all subsequent draws to also be blurred.

**Phase:** Address in Phase 2 (Canvas Visualization). Choose glow rendering strategy before writing any visual code — retrofitting from shadowBlur to compositing is a significant rewrite.

**Confidence:** HIGH — `shadowBlur` performance impact documented in MDN Canvas optimization guide. iOS GPU bandwidth limitation is MEDIUM confidence (training knowledge, well-established pattern).

---

### Pitfall 9: Meyda Chroma and the "Chroma 12-bin" Frequency Mapping Assumption

**What goes wrong:** Meyda's chroma vector maps FFT bins to 12 pitch classes using a fixed equal-temperament pitch-to-bin mapping. This mapping was designed for 44100Hz sample rate. At 48000Hz (iOS default), the pitch-to-bin mapping is slightly off, causing each pitch class to include energy from adjacent semitones. The effect is subtle but systematic: chroma vectors are "smeared" across neighboring pitch classes, making chord template matching less accurate on iOS.

**Why it happens:** Sample rate affects the relationship between FFT bin frequency and musical pitch. A 2048-point FFT at 44100Hz has bins at `44100/2048 = 21.5 Hz` spacing. At 48000Hz the same FFT has `48000/2048 = 23.4 Hz` spacing. Meyda's chroma algorithm may hardcode the 44100Hz assumption internally. This is a LOW confidence claim — it requires verification with Context7 against current Meyda source.

**Consequences:**
- Chroma accuracy is systematically lower on iOS than desktop Chrome for the same recording.
- Chord detection on iOS shows different (wrong) results compared to desktop even on the same file.
- Debugging is difficult because the error is subtle and statistical, not a crash.

**Prevention:**
- Verify in Context7/Meyda docs whether Meyda reads `audioContext.sampleRate` dynamically or hardcodes 44100Hz for chroma mapping.
- If Meyda hardcodes 44100Hz: force `new AudioContext({ sampleRate: 44100 })` at creation and verify iOS Safari honors the request (check `audioCtx.sampleRate` after creation).
- If iOS Safari ignores the 44100Hz request: consider implementing your own chroma mapping that reads the actual `sampleRate` — this is ~50 lines of JavaScript.

**Detection (warning signs):**
- Same audio file produces different chord detection results on iOS vs desktop Chrome.
- `console.log(audioCtx.sampleRate)` returns 48000 on iOS.
- Chroma vectors for known piano chords have energy spread across adjacent pitch classes rather than the expected 3-4.

**Phase:** Address during Phase 1 (Audio Pipeline setup) — determine sample rate behavior before writing any analysis code.

**Confidence:** LOW for the Meyda internal hardcoding claim (training knowledge only, needs Context7 verification). HIGH for the sample rate difference between iOS and desktop Chrome.

---

## Minor Pitfalls

Mistakes that cause debugging time but are fixable without rewrites.

---

### Pitfall 10: Forgetting to Disconnect AudioNodes on React Component Unmount

**What goes wrong:** React components create AudioContext nodes (AnalyserNode, MediaElementAudioSourceNode) and never call `.disconnect()` on unmount. The Web Audio API maintains these node connections in the audio graph even after the React component is gone. Multiple unmount/remount cycles (e.g., navigating away and back) create duplicate connected nodes, causing the audio to be analyzed multiple times (duplicate chroma extraction, doubled FFT processing) or causing memory leaks.

**Prevention:**
- Return a cleanup function from `useEffect` that calls `node.disconnect()` and optionally `audioCtx.close()`.
- Store all created nodes in `useRef` so the cleanup function has access to them.
- Do NOT call `audioCtx.close()` if you intend to reuse the context — only disconnect the nodes.

**Detection:** Duplicate chord detections on the same audio time position. Audio analysis output doubles in intensity on second play. Memory usage grows with each file load.

**Phase:** Phase 1. Write cleanup from the start.

**Confidence:** HIGH — verified Web Audio API behavior (MDN: disconnected nodes remain in graph).

---

### Pitfall 11: Canvas Size vs CSS Size Blurriness on Retina / iOS Displays

**What goes wrong:** Setting `canvas.style.width = '800px'` without also setting `canvas.width = 800 * devicePixelRatio` and calling `ctx.scale(dpr, dpr)` causes the canvas to render at 1x resolution and then be CSS-upscaled by 2x or 3x on Retina/iOS displays. All nodes, edges, and text look blurry.

**Prevention:** On initialization, always:
```typescript
const dpr = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * dpr;
canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);
// CSS dimensions stay as set in Tailwind
```

**Detection:** Node graph looks blurry on iPhone or MacBook Retina display. Zooming in reveals pixelation.

**Phase:** Phase 2 (Canvas Visualization). Set up correctly before drawing anything.

**Confidence:** HIGH — verified via MDN Canvas optimization documentation.

---

### Pitfall 12: `smoothingTimeConstant` Masking Transient Events

**What goes wrong:** The AnalyserNode's `smoothingTimeConstant` (default: 0.8) applies exponential smoothing across frames. At 0.8, a drum transient takes approximately 5 frames (~83ms at 60fps) to decay. This is fine for visualization smoothness but too slow for beat detection and pocket score computation. Using the smoothed analyser data for transient detection causes missed drum hits and wrong onset timing.

**Prevention:**
- Use two separate AnalyserNode instances: one with `smoothingTimeConstant = 0.8` for visualization, one with `smoothingTimeConstant = 0.0` for transient/onset detection.
- Or use `getFloatTimeDomainData()` for onset detection (which is unsmoothed time-domain data) rather than frequency domain data.

**Detection:** Beat detection misses drum hits that are clearly audible. Pocket score variance is higher than expected on well-grooved tracks.

**Phase:** Phase 1 (Audio Pipeline). Architecture decision: one analyser for visualization, one for analysis.

**Confidence:** HIGH — AnalyserNode smoothingTimeConstant behavior verified via MDN AnalyserNode documentation.

---

### Pitfall 13: AudioWorklet Requires HTTPS (Blocks Local Dev Without Proper Setup)

**What goes wrong:** `AudioWorkletNode` and `audioContext.audioWorklet.addModule()` are restricted to secure contexts (HTTPS). Local development with `http://localhost` is generally exempt, but some tools (reverse proxies, tunnels, certain corporate networks with non-standard hosts) break this exemption. If you test your AudioWorklet path via a non-localhost URL, it silently fails.

**Prevention:**
- Use `localhost` (not `127.0.0.1` and not a hostname alias) during development — browsers exempt localhost from the HTTPS requirement.
- In Vite, the dev server on port 5555 at `http://localhost:5555` is safe. Do not expose via a tunnel without HTTPS.
- If using ngrok or similar for iOS Safari testing on a real device: you MUST use HTTPS. Configure ngrok with an HTTPS URL.

**Detection:** `audioContext.audioWorklet.addModule()` rejects with "NotSupportedError" or "SecurityError". AudioWorklet fallback path (ScriptProcessorNode) silently activates when AudioWorklet setup fails.

**Phase:** Phase 1. Document the dev environment setup requirement.

**Confidence:** HIGH — AudioWorklet HTTPS requirement verified via MDN AudioWorklet documentation ("Available only in secure contexts").

---

### Pitfall 14: CORS Required for Audio Files Loaded via `fetch()` for Web Audio API

**What goes wrong:** Loading an audio file from a different origin (CDN, external storage) via `fetch()` and decoding with `audioCtx.decodeAudioData()` requires the server to send `Access-Control-Allow-Origin` headers. Without this, the `fetch()` succeeds but the audio data is "tainted" and `decodeAudioData` fails. This is not relevant for user-uploaded files (which are read locally via `FileReader`), but becomes relevant if pre-loaded example tracks are served from a CDN.

**Prevention:**
- For the core app (user file upload via `FileReader`): no CORS issue.
- For pre-loaded example tracks: serve from the same origin or a CORS-enabled CDN (e.g., Cloudflare R2 with CORS configured, or include the audio in the Vite bundle as assets).

**Detection:** `decodeAudioData` throws "DOMException: The buffer passed to decodeAudioData contains an unknown content type." or similar CORS error in console.

**Phase:** Phase 3 (Pre-loaded example tracks). Not relevant for MVP.

**Confidence:** HIGH — CORS behavior for Web Audio API verified via MDN Using Web Audio API documentation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: AudioContext initialization | iOS Safari user gesture requirement (Pitfall 1) | Create AudioContext inside click handler, never on mount |
| Phase 1: Audio Pipeline architecture | ScriptProcessorNode vs AudioWorklet decision (Pitfall 2) | Decide at project start; check Meyda version with Context7 |
| Phase 1: Frequency band splitting | Sample rate 44100 vs 48000 mismatch (Pitfall 3) | Always compute bin indices from `audioCtx.sampleRate` |
| Phase 1: AnalyserNode setup | Dynamic range clipping on jazz (Pitfall 4) | Use Float32 data or tune min/maxDecibels in calibration |
| Phase 1: Beat detection | Swing double-tempo, rubato suppression (Pitfall 7) | Build rubato confidence gate from the start |
| Phase 1: AnalyserNode for transients | Smoothing constant masking onsets (Pitfall 12) | Two separate AnalyserNodes: one for viz, one for analysis |
| Phase 1: AudioWorklet dev setup | HTTPS requirement blocks testing on device (Pitfall 13) | Use localhost only; configure ngrok with HTTPS for device testing |
| Phase 1: React cleanup | Zombie AudioNodes on unmount (Pitfall 10) | Write useEffect cleanup from day one |
| Phase 2: Canvas glow/animation | shadowBlur destroys iOS framerate (Pitfall 8) | Pre-rendered offscreen glow compositing from the start |
| Phase 2: RAF loop | Per-frame array allocation GC jank (Pitfall 5) | Pre-allocate ALL typed arrays outside the RAF loop |
| Phase 2: Canvas setup | Blurry canvas on Retina/iOS (Pitfall 11) | devicePixelRatio scaling on canvas init |
| Phase 2: Chord display | Rootless voicing misidentification (Pitfall 6) | Show confidence badge always; low-confidence fallback display |
| Phase 2: Chord detection | Meyda chroma sample rate assumption (Pitfall 9) | Verify in Context7; test same file on iOS vs Chrome |
| Phase 3: Example tracks | CORS for CDN-hosted audio (Pitfall 14) | Serve from same origin or CORS-enabled CDN |

---

## Summary: Highest-Risk Items for This Project

Ranked by likelihood of causing a rewrite or major rework:

1. **iOS AudioContext user gesture** (Pitfall 1) — Guaranteed to break if not addressed from day one. Zero forgiveness.
2. **shadowBlur framerate collapse on iOS** (Pitfall 8) — The app's visual character depends on glows. Getting this wrong means the entire Canvas visualization layer needs to be rewritten.
3. **Sample rate 48kHz on iOS** (Pitfall 3) — Silently invalidates all frequency band splitting. Symptoms don't appear until iOS testing.
4. **ScriptProcessorNode vs AudioWorklet** (Pitfall 2) — Architecture decision that's costly to change after analysis code is written.
5. **Swing tempo double-counting** (Pitfall 7) — BPM display is wrong on most jazz recordings. Highly visible to the target audience (jazz musicians).

---

## Sources

**HIGH confidence (verified against MDN official documentation):**
- MDN Web Docs: AudioContext.resume() — https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume
- MDN Web Docs: AnalyserNode — https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- MDN Web Docs: Web Audio API Best Practices — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN Web Docs: Autoplay guide for media and Web Audio APIs — https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- MDN Web Docs: Using AudioWorklet — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
- MDN Web Docs: Optimizing Canvas — https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- MDN Web Docs: Visualizations with Web Audio API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
- MDN Web Docs: ScriptProcessorNode (deprecated) — https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode
- MDN Web Docs: BaseAudioContext.sampleRate — https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/sampleRate

**MEDIUM/LOW confidence (training knowledge, verify before implementation):**
- Meyda.js ScriptProcessorNode vs AudioWorklet default behavior — VERIFY WITH CONTEXT7
- Meyda.js internal chroma frequency mapping and sample rate handling — VERIFY WITH CONTEXT7
- iOS Safari specific 48kHz default sample rate behavior (confirmed pattern, specific behavior of `{ sampleRate: 44100 }` constructor option not officially documented in fetched sources)
- Jazz chord detection accuracy on rootless voicings — from music information retrieval literature (training knowledge)
- Swing beat detection double-tempo problem — from music information retrieval literature (training knowledge)

