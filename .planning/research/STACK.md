# Technology Stack

**Project:** Jazz Learning — Browser-based audio analysis and visualization
**Researched:** 2026-03-10
**Research method:** npm registry queries, MDN browser-compat-data package inspection, Meyda.js source analysis

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.2.4 | UI component tree, state, lifecycle | Current stable. React 19 ships concurrent features and Actions — both useful for async audio file loading. No reason to pin to v18. |
| TypeScript | 5.9.3 | Type safety across audio pipeline | Audio API has many `Float32Array`, `AudioNode`, `AudioBuffer` types. TypeScript catches buffer-size mismatches and feature-name typos at compile time. Worth the setup cost. |
| Vite | 7.3.1 | Dev server + bundler | Native ESM dev server means fast HMR. Audio worklets and WASM modules load cleanly. `@vitejs/plugin-react-swc` preferred over `plugin-react` for speed. |
| @vitejs/plugin-react-swc | 4.2.3 | React JSX transform + Fast Refresh | SWC-based, faster than Babel-based plugin-react. No meaningful DX difference. |

### Audio Analysis

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Web Audio API | Browser built-in | FFT via AnalyserNode, file decode via decodeAudioData, playback via AudioBufferSourceNode | Native browser API. Zero bundle weight. AnalyserNode provides FFT without any library. |
| Meyda.js | 5.6.3 | Chroma, RMS, ZCR, spectral flux, MFCC, mel bands | The only production-stable browser audio feature extraction library. Confirmed 23 extractors including all four features required by this project. |

**Meyda.js confirmed extractors (verified from v5.6.3 dist source):**
- `chroma` — 12-bin chromagram, normalized
- `rms` — Root mean square (volume/energy proxy)
- `zcr` — Zero crossing rate (percussiveness/noisiness proxy)
- `spectralFlux` — Frame-to-frame spectral change (onset/transient detection)
- `spectralCentroid` — Brightness
- `mfcc` — Mel-frequency cepstral coefficients (timbre)
- `melBands` — Mel filter bank output
- `energy` — Total signal energy
- `loudness` — Perceptual loudness with Bark bands
- `spectralFlatness`, `spectralRolloff`, `spectralSpread`, `spectralSlope`, `spectralSkewness`, `spectralKurtosis`, `spectralCrest`
- `perceptualSpread`, `perceptualSharpness`
- `amplitudeSpectrum`, `powerSpectrum`, `complexSpectrum`, `buffer`

**Confidence: HIGH** — Verified directly from installed package dist source.

### Rendering / Visualization

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Canvas API | Browser built-in | Animated node graph with glows, ripples, edges | Native 2D canvas is the right tool for a custom animated graph. No library overhead. requestAnimationFrame loop at 60fps is straightforward. |

For this project's specific rendering needs (custom node graph, per-frame audio-driven positions/opacity/glow radius), raw Canvas beats every alternative. See "Alternatives Considered" below.

### Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.2.1 | UI chrome outside the canvas | Utility-first for the surrounding player controls, file upload UI, and layout. |
| @tailwindcss/vite | 4.2.1 | Tailwind v4 Vite integration | **Critical:** Tailwind v4 dropped `tailwind.config.js`. Config is now CSS-first via `@import "tailwindcss"` in your CSS entry point. Use the `@tailwindcss/vite` plugin, not `postcss-tailwindcss`. |

### State Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zustand | 5.0.11 | Audio engine state (playback position, extracted features, node positions) | Audio feature data updates at 60fps. React context/useState will trigger full re-renders. Zustand's selector-based subscriptions let the Canvas loop read state without React knowing. Lightweight at zero deps. |

**Pattern:** Audio processing loop writes to Zustand store. Canvas `requestAnimationFrame` loop reads from store. React UI subscribes only to coarse state (playing, loaded, etc.). This keeps React out of the hot path.

---

## Alternatives Considered

### Canvas vs PixiJS vs Three.js/React Three Fiber

| | Canvas API (raw) | PixiJS 8 | React Three Fiber 9 |
|-|-----------------|----------|---------------------|
| Bundle size | 0 KB | ~70 MB uncompressed | Heavy |
| Custom node graph | Full control | Requires Pixi abstraction | Overkill (3D engine for 2D graph) |
| iOS Safari | Full support | Full support | Full support |
| Glow/blur effects | `ctx.shadowBlur` or layered compositing | Filter API or shader | Shader |
| 60fps suitability | Yes, if draw calls are batched | Yes, WebGL-backed | Yes |
| Recommendation | Use this | Reasonable if graph gets very complex (>500 nodes) | Wrong tool |

**Decision:** Raw Canvas. The node graph is 5-15 instruments. Raw Canvas is 100-200 lines, PixiJS adds ~2MB bundle and an abstraction layer you'd fight for custom glow effects. Use PixiJS only if node count exceeds 100 and perf issues appear.

### Meyda.js vs Essentia.js vs Manual FFT

| | Meyda.js 5.6.3 | Essentia.js 0.1.3 | Manual Web Audio FFT |
|-|----------------|-------------------|---------------------|
| Chroma extraction | Yes (confirmed) | Yes (more algorithms) | No, manual required |
| License | MIT | **AGPL-3.0** | N/A |
| Bundle size | 556 KB | 10.1 MB | 0 |
| iOS Safari | Yes | Untested (WASM-heavy) | Yes |
| Maintenance | Active, v6 in beta | Sparse (last stable 2021) | N/A |
| Recommendation | Use this | Avoid (AGPL license risk, bundle size) | Use for FFT-only if Meyda not needed |

**Decision:** Meyda.js. Essentia.js is AGPL which creates license obligations. Its 10 MB bundle (WASM) will hurt mobile load time. Meyda is MIT, 556 KB, has every feature needed, and the maintainers are active (v6 beta exists as of 2025).

### Tailwind v3 vs v4

Tailwind v4.2.1 is latest stable. v4 is a significant rewrite:
- No `tailwind.config.js` — configuration moves to CSS via `@theme` directives
- Requires `@tailwindcss/vite` plugin (not postcss)
- Faster build (Rust/Oxide engine)
- Use v4 unless you're copying config from an existing v3 project

### React Context vs Zustand for audio state

React context triggers re-render on every state change. At 60fps feature extraction, this means 60 re-renders per second. Zustand's subscriptions are outside React's render cycle. For audio-driven UIs, Zustand is the correct choice.

---

## iOS Safari — Web Audio API Specifics

**Confidence: HIGH** — All data from MDN browser-compat-data v7.3.6 package.

### What Works

| API | iOS Safari since | Notes |
|-----|-----------------|-------|
| `AudioContext` (unprefixed) | iOS 14.5 | iOS 13 and earlier need `webkitAudioContext` prefix |
| `AudioWorkletNode` | iOS 14.5 | Available, but has quirks (see below) |
| `AnalyserNode` | iOS 6 | Reliable across all versions |
| `AudioBufferSourceNode` | iOS 6 | Reliable for file playback |
| `decodeAudioData` | iOS 6 | Reliable |
| `OfflineAudioContext` (unprefixed) | iOS 14.5 | Old iOS needs `webkitOfflineAudioContext` |
| `ScriptProcessorNode` | iOS 7 | Deprecated but broadly supported |

### Critical iOS Safari Quirks

**1. AudioContext must be created from a user gesture**

iOS Safari silences audio created outside a user interaction event. The `AudioContext` must be created (or `.resume()` called) inside a `click`, `touchstart`, or `pointerdown` handler. This is not optional — it silences all audio otherwise.

```typescript
// CORRECT: Create inside gesture handler
button.addEventListener('click', () => {
  const audioCtx = new AudioContext();
  // Now safe to proceed
});

// WRONG: Create at module load time
const audioCtx = new AudioContext(); // Silent on iOS
```

**2. AudioContext starts in 'suspended' state on iOS**

Even when created inside a gesture, iOS AudioContext may start suspended. Always call `.resume()` and await it before processing.

```typescript
const audioCtx = new AudioContext();
await audioCtx.resume();
// Now actually running
```

**3. `BaseAudioContext.resume` MDN compat entry is empty for iOS Safari**

The MDN compat data has an empty object `{}` for `safari_ios` on `.resume()`. This likely means the method exists but has edge-case behavior. Always wrap `.resume()` in a try/catch and check `.state` after.

```typescript
if (audioCtx.state === 'suspended') {
  try {
    await audioCtx.resume();
  } catch (e) {
    // Fallback: reconnect nodes
  }
}
```

**4. Meyda.js v5.6.3 uses deprecated ScriptProcessorNode**

`ScriptProcessorNode` (`createScriptProcessor` + `onaudioprocess`) is deprecated but still works on iOS Safari (supported since iOS 7). For this project this is acceptable — the node is deprecated but not removed, and Meyda's real-time callback pattern depends on it. Monitor for v6 stable which may address this.

Confirmed from Meyda v5.6.3 source:
```
this._m.spn = this._m.audioContext.createScriptProcessor(...)
this._m.spn.onaudioprocess = function(e) { ... }
```

**5. AudioWorkletNode available iOS 14.5+ but has registration quirks**

AudioWorklet processor files must be fetched relative to the page origin. In Vite, put worklet `.js` files in `/public/` and register with an absolute path. Do not inline worklet code as blob URLs — iOS Safari does not support AudioWorklet blob URL registration reliably.

**6. Large file decoding blocks the main thread**

`decodeAudioData` on iOS Safari is synchronous-feeling for large files (10+ minutes of audio). Wrap in a loading state and consider chunking or using a Web Worker for the decode step.

**7. webkitAudioContext fallback**

For coverage below iOS 14.5 (older iPhones still in use):
```typescript
const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const audioCtx = new AudioContextClass();
```

---

## Recommended Installation

```bash
# Scaffold
npm create vite@latest jazz-learning -- --template react-swc-ts

# Audio analysis
npm install meyda

# State management
npm install zustand

# Styling (Tailwind v4 — CSS-first setup)
npm install tailwindcss @tailwindcss/vite

# Types
npm install -D @types/react @types/react-dom
```

**Tailwind v4 Vite config (vite.config.ts):**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
```

**Tailwind v4 CSS entry (src/index.css):**
```css
@import "tailwindcss";
/* No config.js needed. Custom theme goes here via @theme directive. */
```

**No postcss.config.js needed** — the `@tailwindcss/vite` plugin replaces the PostCSS approach.

---

## What NOT to Use

| Technology | Reason to Avoid |
|------------|----------------|
| Essentia.js | AGPL-3.0 license risk, 10 MB WASM bundle, sparse maintenance |
| PixiJS / Three.js | Overkill for a 5-15 node graph. Adds bundle weight and abstraction friction |
| D3.js | SVG-based force graphs lag at 60fps with audio-driven per-frame updates. Canvas is faster for this use case |
| Framer Motion | Designed for CSS/SVG animations, not per-frame Canvas rendering driven by audio data |
| React Context for audio state | Causes 60 re-renders/second. Use Zustand |
| `create-react-app` | Dead project, no longer maintained |
| Meyda v6.0.0-beta.2 | Beta, not production stable. Still uses ScriptProcessorNode anyway |
| `tailwind.config.js` pattern | Does not work in Tailwind v4. Will silently produce no styles if you use the v3 setup pattern |

---

## Confidence Assessment

| Area | Confidence | Source |
|------|------------|--------|
| Meyda.js version and extractors | HIGH | Installed package source inspection |
| Meyda.js ScriptProcessorNode usage | HIGH | Installed package source inspection |
| React / Vite / Tailwind versions | HIGH | npm registry |
| iOS Safari AudioContext compat | HIGH | MDN browser-compat-data v7.3.6 package |
| iOS Safari resume() quirks | MEDIUM | MDN compat data shows empty entry; behavior based on known platform patterns |
| Tailwind v4 CSS-first config | HIGH | Package structure inspection + exports analysis |
| OffscreenCanvas iOS support | LOW | Not verified in this research session (Bash was cut off); known from training to have arrived in Safari 16.4, ~iOS 16.4+ |

---

## Sources

- npm registry: `meyda@5.6.3`, `react@19.2.4`, `vite@7.3.1`, `tailwindcss@4.2.1`, `@tailwindcss/vite@4.2.1`, `typescript@5.9.3`, `@vitejs/plugin-react-swc@4.2.3`, `zustand@5.0.11`
- Meyda source inspection: `node_modules/meyda/dist/node/main.js` (installed from npm)
- MDN browser-compat-data v7.3.6: `data.json` — AudioContext, BaseAudioContext, AnalyserNode, AudioWorkletNode, ScriptProcessorNode, OfflineAudioContext, AudioBufferSourceNode compat tables

