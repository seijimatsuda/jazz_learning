# Phase 7: React UI Panels & Key Detection - Research

**Researched:** 2026-03-11
**Domain:** React UI panels, Canvas-based mini-charts, key detection from chord history, Zustand state extension
**Confidence:** HIGH (all findings verified against live codebase; no new external libraries needed)

---

## Summary

Phase 7 builds on a fully established architecture. The project uses React 19, Zustand 5, Tailwind 4 (CSS-first), and Canvas API. All audio analysis runs in a `useRef`-based `AudioStateRef`; UI components receive data either from Zustand (for infrequent role/chord changes) or by polling `audioStateRef` via `setInterval` at ~10fps (for continuous numeric data). No new npm packages are required — all charting (sparklines, pie charts, bar/beat grid) should be drawn on `<canvas>` elements to stay consistent with the existing Canvas-first pattern and avoid React re-render overhead.

The existing data plumbing is already rich. `ChordState.chordLog` (capped at 1000 entries) stores timestamped chord detections with confidence gaps — perfect raw material for both the Chord Log panel (UI-10..12) and key detection (KEY-01..03). `InstrumentAnalysis.historyBuffer` is a pre-allocated 100-slot Float32Array ring buffer (10s at 10fps) for sparklines. `InstrumentAnalysis.timeInRole` is a cumulative `Record<RoleLabel, number>` — directly usable for pie charts. `BeatState.bpm` and `BeatState.lastDownbeatSec` drive the bar/beat grid (KEY-03). The `INSTRUMENT_ORDER` constant from `NodeLayout.ts` defines canvas-to-instrument mapping needed for click-to-open node detail.

The key design constraint is **no state duplication** — never copy audioStateRef data into Zustand for high-frequency reads. The pattern is: (1) poll `audioStateRef` directly via `setInterval` inside the component that needs it, (2) push to Zustand only on discrete events (role change, chord change, BPM change). Phase 7 must follow this exactly.

**Primary recommendation:** Build all mini-charts (sparkline, pie, bar/beat grid) on `<canvas>` elements drawn with the 2D API. Use `setInterval` polling inside detail panels. Add a `selectedInstrument` field to Zustand for node-click state. Implement key detection as a pure function over `chordLog` entries in a new `KeyDetector.ts` module.

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | Component tree, event handlers | Already in project |
| Zustand | 5.0.11 | Discrete UI state (chord, role, BPM, selectedInstrument) | Already established pattern |
| Tailwind 4 | 4.2.1 | CSS-first utility styling | Already in project, CSS-only via @tailwindcss/vite |
| Canvas 2D API | native | Sparklines, pie chart, bar/beat grid | Existing pattern, iOS-safe |

### Supporting (no new packages)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AudioContext.currentTime | native | Chord log timestamps, seek target | Already on audioStateRef |
| ResizeObserver | native | Mini-canvas resize | Used in VisualizerCanvas already |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas sparkline | Recharts/SVG sparkline | Recharts adds ~120KB, triggers React reconciliation on every update. Canvas draw at 10fps is cheaper and consistent with existing pattern. |
| Canvas pie chart | react-minimal-pie-chart or SVG | Adding a package for a single pie chart is overkill; a <200 line Canvas draw function suffices. |
| setInterval polling | Zustand subscription | Zustand subscriptions require putting high-frequency floats into Zustand state, which the codebase explicitly avoids (see useAudioRef.ts comments). |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── audio/
│   └── KeyDetector.ts          # NEW — key detection from chordLog rolling window
├── components/
│   ├── BandSetupPanel.tsx       # NEW — 07-01: instrument add/remove lineup
│   ├── TensionMeterDisplay.tsx  # NEW — 07-02: ChordDisplay enhancement (BPM display already there)
│   ├── NodeDetailPanel.tsx      # NEW — 07-03: sparkline, pie, most-active partner
│   ├── ChordLogPanel.tsx        # NEW — 07-06: expandable drawer, clickable entries
│   └── Timeline.tsx             # MODIFY — 07-04: add bar/beat grid overlay
├── store/
│   └── useAppStore.ts           # MODIFY — add selectedInstrument, lineup, chordLog mirror, detectedKey
└── canvas/
    └── CanvasRenderer.ts        # MODIFY — emit node click events to Zustand
```

### Pattern 1: Polling AudioStateRef for High-Frequency Data
**What:** Use `setInterval(..., 100)` inside a component to read `audioStateRef.current` and `setState` locally — never put raw activity scores or sparkline data into Zustand.
**When to use:** For NodeDetailPanel sparkline (100ms interval reads `historyBuffer`), pie chart (reads `timeInRole`), most-active partner (reads `edgeWeights`).
**Example (from InstrumentRoleOverlay.tsx — the existing pattern):**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    const instruments = audioStateRef.current.analysis?.instruments;
    if (!instruments) return;
    const scores: Record<string, number> = {};
    for (const inst of instruments) scores[inst.instrument] = inst.activityScore;
    setActivityScores(scores);
  }, 100);
  return () => clearInterval(interval);
}, [audioStateRef]);
```

### Pattern 2: Canvas Mini-Chart (Sparkline)
**What:** Render a `<canvas>` element inside NodeDetailPanel. On each 100ms poll interval, call a draw function that clears and redraws the sparkline from the ring buffer.
**When to use:** Activity sparkline (last 10 seconds = 100 samples from `historyBuffer`).
**Key detail:** Ring buffer extraction order — `historyBuffer` is circular with `historyHead` as write pointer. To read in chronological order: `for (i = 0; i < historySamples; i++) { idx = (historyHead - historySamples + i + 100) % 100; values[i] = historyBuffer[idx]; }`
**Example:**
```typescript
function drawSparkline(ctx: CanvasRenderingContext2D, w: number, h: number, history: Float32Array, head: number, samples: number) {
  ctx.clearRect(0, 0, w, h);
  if (samples === 0) return;
  ctx.beginPath();
  for (let i = 0; i < samples; i++) {
    const idx = ((head - samples + i) % 100 + 100) % 100;
    const x = (i / (samples - 1)) * w;
    const y = h - history[idx] * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#818cf8';
  ctx.stroke();
}
```

### Pattern 3: Canvas Pie Chart (Time-in-Role)
**What:** Draw arc segments on a `<canvas>` proportional to `timeInRole` values. Read `timeInRole` from `audioStateRef.current.analysis.instruments`.
**When to use:** Role breakdown pie in NodeDetailPanel.
**Role colors (from InstrumentRoleOverlay.tsx):** soloing → `#f59e0b`, comping → `#3b82f6`, holding → `#6b7280`, silent → `#374151`
**Example:**
```typescript
function drawPie(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, timeInRole: Record<string, number>) {
  const roles = ['soloing', 'comping', 'holding', 'silent'];
  const colors = { soloing: '#f59e0b', comping: '#3b82f6', holding: '#6b7280', silent: '#374151' };
  const total = roles.reduce((s, k) => s + (timeInRole[k] ?? 0), 0);
  if (total === 0) return;
  let startAngle = -Math.PI / 2;
  for (const role of roles) {
    const angle = ((timeInRole[role] ?? 0) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + angle);
    ctx.fillStyle = colors[role as keyof typeof colors];
    ctx.fill();
    startAngle += angle;
  }
}
```

### Pattern 4: Node Click → Detail Panel
**What:** CanvasRenderer must handle mouse click events to detect which node was clicked. The click target is the `<canvas>` element. On click, compute distance from each node center and open the detail panel by pushing `selectedInstrument` to Zustand.
**When to use:** Instrument node click (UI-04..07).
**Key detail:** Canvas element is in `VisualizerCanvas.tsx`. Add a click handler to the `<canvas>` element. CanvasRenderer exposes node positions via `getNodePositions()` or VisualizerCanvas can read from `INSTRUMENT_ORDER` + `computeNodePositions(4)` directly. Pass a callback similar to `setOnRoleChange`.
**Zustand shape addition needed:**
```typescript
selectedInstrument: string | null;       // null = no panel open
setSelectedInstrument: (name: string | null) => void;
```

### Pattern 5: Lineup State Management (BandSetupPanel)
**What:** `lineup` lives in Zustand (not audioStateRef). When user changes lineup pre-load, Zustand updates. After calibration, lineup is passed to `initAnalysisState`. The BandSetupPanel renders before file load only (or shows a "locked" state after load).
**Zustand shape addition needed:**
```typescript
lineup: InstrumentName[];   // default: ['bass', 'drums', 'keyboard', 'guitar']
setLineup: (lineup: InstrumentName[]) => void;
```
**Key detail:** Current `App.tsx` hardcodes `['bass', 'drums', 'keyboard', 'guitar']` on line 45. Phase 7 replaces this with `useAppStore.getState().lineup`.

### Pattern 6: Chord Log Panel
**What:** Read `audioStateRef.current.chord.chordLog` directly via polling, render timestamped entries. On click, call `Timeline`'s seek logic (same pattern as `Timeline.handleSeek`).
**When to use:** ChordLogPanel (07-06). Poll at 2fps (500ms interval) — chord log changes slowly.
**Key detail:** The seek function needs access to `audioStateRef` + the same `connectSourceToGraph` used in `Timeline.tsx`. Extract seek into a shared hook `useSeek(audioStateRef)` to avoid duplication.
**Tension color coding** — reuse `tensionToColor` from `TensionHeatmap.ts` or define tension-based color locally (same thresholds as `ChordDisplay.tsx`).

### Pattern 7: Key Detection (KeyDetector.ts)
**What:** Pure function over the last N chord log entries. Tally root/mode occurrences weighted by confidence gap. The most frequent root + mode combination gives the detected key.
**Algorithm (standard musicology approach — Krumhansl-Schmuckler simplified):**
1. Sum the `confidenceGap` values for each chord's root across the last W seconds (rolling window, W=30s recommended for jazz).
2. The pitch class with highest cumulative weight is the tonal center.
3. Check whether the most common chord type at that root is major (ionian) or minor (dorian/aeolian).
4. Chord function relative to key: tonic = I, subdominant = IV/II, dominant = V/VII.
**Implementation notes:**
- Input: `chordLog: Array<{audioTimeSec, chordIdx, confidenceGap}>`, `currentTimeSec: number`
- Output: `{ key: string | null, mode: 'major' | 'minor' | null, confidence: number }`
- Filter log to last W seconds: `entries = chordLog.filter(e => e.audioTimeSec >= currentTimeSec - W)`
- Use `CHORD_TEMPLATES[chordIdx].root` and `.type` to get note name and chord type
- Map detected chord to function relative to key using interval arithmetic (semitone distance)

### Pattern 8: Bar/Beat Grid Overlay on Timeline
**What:** Draw tick marks on the Timeline canvas (or as `<div>` absolute-positioned children) at every beat derived from `bpm` and `lastDownbeatSec`.
**Algorithm:** `beatInterval = 60 / bpm`. Starting from `lastDownbeatSec`, project beats forward and backward to cover the timeline. For each beat position, convert to `(timeSec / duration) * 100%` and draw a vertical line.
**When to use:** Only when `currentBpm !== null` (not rubato). Bar lines every 4 beats.

### Anti-Patterns to Avoid
- **Putting historyBuffer values into Zustand:** The ring buffer data changes every 100ms. Storing in Zustand causes continuous reconciliation. Read directly from `audioStateRef`.
- **Allocating arrays in the rAF loop:** All sparkline/pie data reads happen in React setInterval callbacks, not inside `CanvasRenderer.render()`.
- **Opening NodeDetailPanel from inside CanvasRenderer:** CanvasRenderer should only call a callback (like `onRoleChange`). React components respond to Zustand updates. CanvasRenderer calls `onNodeClick(instrumentName)` → VisualizerCanvas wires → Zustand `setSelectedInstrument`.
- **Re-running calibration when lineup changes after load:** Lineup changes are pre-load only. After load, the `analysis` state is fixed. BandSetupPanel should disable remove/add buttons once `isFileLoaded === true`.
- **Calling `ChordDisplay` with direct audioStateRef access:** The existing `ChordDisplay` reads Zustand — this pattern is correct. The new TensionMeter display should follow the same pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sparkline charting | Custom SVG or Recharts | Canvas 2D draw function (30 lines) | Consistent with existing Canvas-first pattern; zero dependencies |
| Pie chart | react-minimal-pie-chart | Canvas arc drawing (40 lines) | Same reason; `timeInRole` is already a plain Record |
| Color-coding by tension | Custom thresholds | `tensionToColor()` from `TensionHeatmap.ts` already exists | DRY; thresholds already tuned |
| Seek-on-click | New audio seek logic | Extract shared `useSeek` hook from `Timeline.tsx` existing logic | Exact same AudioBufferSourceNode stop/restart pattern needed |
| Ring buffer read-out | Slice/copy | In-place index math `((head - samples + i) % size + size) % size` | Consistent with zero-allocation constraint |
| iOS AudioContext unlock | Custom gesture handler | Already handled in `AudioEngine.ts` | Don't duplicate |

**Key insight:** This phase is almost entirely a UI layer over already-computed data. The audio analysis is complete. The main risk is accidental performance regression from polling too aggressively or putting high-frequency data into Zustand.

---

## Common Pitfalls

### Pitfall 1: Wrong Ring Buffer Read Order
**What goes wrong:** Sparkline renders in reverse or scrambled chronological order.
**Why it happens:** `historyHead` points to the **next write slot** (not the last written). Reading from `historyHead` forward gives newest → oldest, not oldest → newest.
**How to avoid:** Always read with: `idx = ((historyHead - historySamples + i) % historySamples + historySamples) % historySamples`. This maps `i=0` to oldest and `i=historySamples-1` to newest.
**Warning signs:** Sparkline looks jagged/backwards during rapid activity changes.

### Pitfall 2: Canvas HiDPI Scaling for Mini-Charts
**What goes wrong:** Sparkline and pie chart look blurry on Retina/HiDPI displays.
**Why it happens:** Mini `<canvas>` elements need the same `devicePixelRatio` scaling as the main canvas.
**How to avoid:** Apply the same `setupHiDPI` pattern: `canvas.width = cssW * dpr; canvas.height = cssH * dpr; ctx.scale(dpr, dpr)`. Do this on mount and on ResizeObserver callback.
**Warning signs:** Charts look 2x too small on MacBook, blurry on iPhone.

### Pitfall 3: ChordLog Array Mutation During Read
**What goes wrong:** While reading `chordLog` for rendering, a new chord detection pushes to the array (via `extractAndMatchChord`). This can cause stale renders or array length inconsistency.
**Why it happens:** `chordLog` is a regular JS array on `audioStateRef`, mutated at 10fps. React polling at 2fps may read mid-mutation.
**How to avoid:** In ChordLogPanel, snapshot the log to a local array on each poll: `const snapshot = [...(audioStateRef.current.chord?.chordLog ?? [])]`. The spread is a shallow copy done in the React setState callback (not in the hot path).
**Warning signs:** Console errors about array length, chord log flashing/reordering.

### Pitfall 4: Key Detection Running Too Often
**What goes wrong:** Key detection runs every tick (10fps), causing noticeable CPU spikes on mobile.
**Why it happens:** If key detection is wired to the 10fps `onChordChange` callback instead of a separate slower interval.
**How to avoid:** Run key detection in ChordLogPanel's 2fps poll interval (500ms), or trigger it only when `chordLog.length` changes by more than N. Pure function with no side effects — safe to run infrequently.
**Warning signs:** iOS Safari frame rate drops when ChordLogPanel is open.

### Pitfall 5: BandSetupPanel After File Load
**What goes wrong:** User removes an instrument after calibration — `initAnalysisState` is not re-run, so the canvas still shows the old node and the analysis state is stale.
**Why it happens:** The lineup is read once by `App.tsx` after calibration completes. Post-calibration changes to Zustand lineup have no effect on the running analysis.
**How to avoid:** Disable add/remove buttons when `isFileLoaded === true`. Show a tooltip: "Load a new file to change the lineup." The `BandSetupPanel` is locked once calibration begins.
**Warning signs:** Node count mismatch between canvas and panel.

### Pitfall 6: Multiple AudioContext Resume on iOS
**What goes wrong:** Opening ChordLogPanel or BandSetupPanel triggers a re-render that tries to resume AudioContext before user gesture.
**Why it happens:** AudioContext is gesture-gated on iOS. Any component that accesses `audioStateRef.current.audioCtx` must not call `.resume()` outside a click handler.
**How to avoid:** Only read from `audioCtx` in UI components (never call `.resume()` from panels). Resume is already handled in `TransportControls`.

---

## Code Examples

Verified patterns from the live codebase:

### Reading historyBuffer for Sparkline
```typescript
// Source: InstrumentActivityScorer.ts — historyBuffer is length 100, historySamples capped at 100
// InstrumentAnalysis shape: { historyBuffer: Float32Array, historyHead: number, historySamples: number }
function readHistoryChronological(instr: InstrumentAnalysis): number[] {
  const { historyBuffer, historyHead, historySamples } = instr;
  const out: number[] = [];
  for (let i = 0; i < historySamples; i++) {
    const idx = ((historyHead - historySamples + i) % 100 + 100) % 100;
    out.push(historyBuffer[idx]);
  }
  return out;
}
```

### Reading timeInRole for Pie Chart
```typescript
// Source: types.ts — timeInRole: Record<RoleLabel, number>
// RoleLabel = 'soloing' | 'comping' | 'holding' | 'silent'
const instr = audioStateRef.current.analysis?.instruments.find(i => i.instrument === selected);
const timeInRole = instr?.timeInRole ?? { soloing: 0, comping: 0, holding: 0, silent: 0 };
const totalTime = Object.values(timeInRole).reduce((a, b) => a + b, 0);
```

### Most Active Partner from edgeWeights
```typescript
// Source: types.ts — AnalysisState.edgeWeights: Record<string, number>
// Key format: alphabetical instrument pair 'bass_drums', 'bass_guitar', etc.
function getMostActivePartner(instrument: string, edgeWeights: Record<string, number>): string | null {
  let best = -1;
  let partner: string | null = null;
  for (const [key, weight] of Object.entries(edgeWeights)) {
    const parts = key.split('_');
    if (!parts.includes(instrument)) continue;
    if (weight > best) {
      best = weight;
      partner = parts.find(p => p !== instrument) ?? null;
    }
  }
  return partner;
}
```

### Wiring Node Click Callback (CanvasRenderer extension pattern)
```typescript
// Extend CanvasRenderer.ts — same pattern as setOnRoleChange
private onNodeClick?: (instrument: string) => void;
setOnNodeClick(cb: (instrument: string) => void): void { this.onNodeClick = cb; }

// In VisualizerCanvas.tsx — add to canvas element:
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;  // fractional
  const y = (e.clientY - rect.top) / rect.height;
  for (let i = 0; i < nodePositions.length; i++) {
    const dx = x - nodePositions[i].x;
    const dy = y - nodePositions[i].y;
    // threshold in fractional units ~ 40px / 800px = 0.05
    if (Math.sqrt(dx*dx + dy*dy) < 0.05) {
      useAppStore.getState().setSelectedInstrument(INSTRUMENT_ORDER[i]);
      break;
    }
  }
});
```

### Key Detection Algorithm
```typescript
// Source: ChordDetector.ts — CHORD_TEMPLATES[idx].root, CHORD_TEMPLATES[idx].type
// NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function detectKey(
  chordLog: Array<{audioTimeSec: number, chordIdx: number, confidenceGap: number}>,
  currentTimeSec: number,
  windowSec = 30
): { key: string | null; mode: 'major' | 'minor' | null } {
  const rootWeight = new Float32Array(12);
  const window = chordLog.filter(e => e.audioTimeSec >= currentTimeSec - windowSec);
  for (const entry of window) {
    const tmpl = CHORD_TEMPLATES[entry.chordIdx];
    const rootIdx = NOTE_NAMES.indexOf(tmpl.root);
    if (rootIdx >= 0) rootWeight[rootIdx] += entry.confidenceGap;
  }
  let bestIdx = 0;
  for (let i = 1; i < 12; i++) if (rootWeight[i] > rootWeight[bestIdx]) bestIdx = i;
  if (rootWeight[bestIdx] === 0) return { key: null, mode: null };
  // Determine mode: if majority of chords at this root are minor/m7/m7b5 → minor
  const majorTypes = ['major', 'maj7', 'dom7'];
  let majorW = 0, minorW = 0;
  for (const e of window) {
    const tmpl = CHORD_TEMPLATES[e.chordIdx];
    if (NOTE_NAMES.indexOf(tmpl.root) === bestIdx) {
      majorTypes.includes(tmpl.type) ? (majorW += e.confidenceGap) : (minorW += e.confidenceGap);
    }
  }
  return { key: NOTE_NAMES[bestIdx], mode: majorW >= minorW ? 'major' : 'minor' };
}
```

### Chord Function Relative to Key
```typescript
// Semitone interval from key root to chord root → scale degree
const INTERVAL_TO_DEGREE: Record<number, string> = {
  0: 'I', 2: 'II', 4: 'III', 5: 'IV', 7: 'V', 9: 'VI', 11: 'VII',
};
function chordFunctionLabel(chordRoot: string, keyRoot: string, chordType: string, keyMode: string): string {
  const rootIdx = NOTE_NAMES.indexOf(chordRoot);
  const keyIdx = NOTE_NAMES.indexOf(keyRoot);
  const interval = ((rootIdx - keyIdx) % 12 + 12) % 12;
  const degree = INTERVAL_TO_DEGREE[interval] ?? `?`;
  const suffix = ['dom7', 'alt'].includes(chordType) ? '7' : ['minor', 'm7', 'm7b5'].includes(chordType) ? 'm' : '';
  return `${chordRoot}${chordType === 'dom7' ? '7' : ''} is the ${degree}${suffix} chord in ${keyRoot} ${keyMode}`;
}
```

### Zustand Additions Needed
```typescript
// In useAppStore.ts — add to AppState interface:
lineup: InstrumentName[];
selectedInstrument: string | null;
detectedKey: string | null;
detectedKeyMode: 'major' | 'minor' | null;
// Actions:
setLineup: (lineup: InstrumentName[]) => void;
setSelectedInstrument: (name: string | null) => void;
setDetectedKey: (key: string | null, mode: 'major' | 'minor' | null) => void;
```

### Bar/Beat Grid on Timeline
```typescript
// Timeline.tsx — overlay tick marks when bpm !== null
// beatInterval in seconds; derive pixel positions from (beatTimeSec / duration) ratio
if (currentBpm && lastDownbeatSec > 0) {
  const beatInterval = 60 / currentBpm;
  let t = lastDownbeatSec - Math.floor((lastDownbeatSec - 0) / beatInterval) * beatInterval; // first beat >= 0
  while (t <= duration) {
    const pct = (t / duration) * 100;
    const isMeasure = Math.round((t - lastDownbeatSec) / beatInterval) % 4 === 0;
    // render a <div> at left: `${pct}%` with height 100% and narrow width
    t += beatInterval;
  }
}
```
Note: `lastDownbeatSec` is on `audioStateRef.current.beat.lastDownbeatSec` — poll via setInterval or use the Zustand `currentBpm` as a signal to re-render.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded quartet in App.tsx | Zustand `lineup` state → BandSetupPanel | Phase 7 | App.tsx reads `useAppStore.getState().lineup` instead of literal array |
| No node click handling | Canvas click → Zustand `selectedInstrument` | Phase 7 | NodeDetailPanel conditionally renders |
| ChordLog only on audioStateRef | ChordLog polled into ChordLogPanel | Phase 7 | Timestamped entries visible to user |
| No key context | KeyDetector.ts + detectedKey in Zustand | Phase 7 | Chord function shown relative to key |

**Deprecated/outdated:**
- `InstrumentRoleOverlay.tsx`: Marked as temporary in Phase 2; should be removed or hidden in Phase 7 once BandSetupPanel + NodeDetailPanel replace its function.

---

## Open Questions

1. **Node click hit detection on HiDPI canvas**
   - What we know: Canvas mouse events give CSS pixel coordinates; node positions are fractional [0,1].
   - What's unclear: Whether the click handler should be on the `<canvas>` element or on an absolutely-positioned `<div>` overlay. The overlay approach avoids DPR confusion.
   - Recommendation: Use an absolutely-positioned `<div>` overlay matching canvas bounds, with transparent `<button>` elements at each node position (accessible, avoids DPR math).

2. **ChordLogPanel seek and audioStateRef availability**
   - What we know: `Timeline.tsx` contains the seek logic using `connectSourceToGraph` from `AudioEngine.ts`.
   - What's unclear: Whether ChordLogPanel should receive `audioStateRef` as a prop or use a shared `useSeek` hook.
   - Recommendation: Extract `useSeek(audioStateRef)` as a hook returning a `seekTo(timeSec: number)` function. Both Timeline and ChordLogPanel consume it. This avoids prop drilling.

3. **Key detection window size for jazz**
   - What we know: Jazz frequently modulates. A 30s window may span a modulation.
   - What's unclear: Optimal window size for real-time jazz key tracking.
   - Recommendation: Use 30s as default; expose as a configurable constant in `KeyDetector.ts`. Keep confidence display on the UI so users can see when key is uncertain.

4. **BandSetupPanel layout within existing App.tsx structure**
   - What we know: App.tsx currently renders all components in a single-column flex layout.
   - What's unclear: Whether Phase 7 requires a two-column layout (left panel + canvas) or keeps single-column with an accordion.
   - Recommendation: Keep single-column; show BandSetupPanel above FileUpload before file load. After load, collapse it or show a "locked" read-only view.

---

## Sources

### Primary (HIGH confidence)
- Live codebase at `/Users/seijimatsuda/jazz_learning/src/` — all type shapes, data flow, and existing patterns verified by direct reading
- `types.ts` — `ChordState`, `InstrumentAnalysis`, `BeatState`, `AnalysisState`, `AudioStateRef` interfaces
- `AnalysisTick.ts` — exact data that flows through the 10fps tick; what's available at what point
- `ChordDetector.ts` — `CHORD_TEMPLATES`, `chordLog` structure
- `NodeLayout.ts` — `INSTRUMENT_ORDER`, `computeNodePositions`
- `CanvasRenderer.ts` — existing callback pattern (`setOnRoleChange`, `setOnChordChange`, `setOnBeatUpdate`)
- `Timeline.tsx` — existing seek logic (reusable)
- `useAppStore.ts` — current Zustand state shape
- `InstrumentRoleOverlay.tsx` — established polling pattern (the template for Node detail polling)

### Secondary (MEDIUM confidence)
- Krumhansl-Schmuckler key-finding algorithm concept — standard musicology; simplified weighting approach is well-documented in digital signal processing literature

### Tertiary (LOW confidence)
- Window size (30s) for jazz key detection — common recommendation in academic literature; not verified for this specific application

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, all existing; verified from package.json
- Architecture: HIGH — every pattern has a direct precedent in the live codebase
- Pitfalls: HIGH — ring buffer ordering and HiDPI verified from existing Canvas code; iOS issues verified from ChordDetector.ts comments
- Key detection algorithm: MEDIUM — simplified musicology approach, not benchmarked against DFL dataset

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable; no external dependencies to go stale)
