# Phase 11: Gap Closures - Research

**Researched:** 2026-03-12
**Domain:** iOS AudioContext gesture fix, dead code removal, console.log audit, defensive rendering
**Confidence:** HIGH

## Summary

Phase 11 closes four known v1.0 gaps. Each fix is narrow and surgical — no new libraries needed, no architectural changes. The research examined the actual codebase to identify exactly what needs to change in each file.

FIX-01 (iOS AudioContext for loadExample) is the most nuanced fix. The `loadExample` function in `App.tsx` is an `async` function wired directly to `onClick`. On iOS Safari, the user-gesture context is consumed by the first `await` (the `fetch` for example-info.json), so `createAudioContext()` called later in `loadAudioBuffer` fails silently or produces a suspended context that never resumes. The fix is to create the AudioContext synchronously at the top of the click handler (before any `await`), exactly mirroring what `FileUpload.handleButtonClick` already does.

FIX-02 (dead code removal) is straightforward: `InstrumentRoleOverlay.tsx` is not imported or used anywhere in `App.tsx` or any other file. The file can be deleted outright. Comments in `NodeDetailPanel.tsx` reference it by name — those comments should be cleaned up too.

FIX-03 (console.log removal) found two hot-path `console.log` calls: one in `AnalysisTick.ts` on every role change (10fps path), one in `CanvasRenderer.ts` on call-response detection (60fps path). `drawCommunicationEdges.ts` already has no console.log. Both are pure deletions — no behavioral change.

FIX-04 (pocket line guard) requires understanding when `state.beat` is non-null but neither bass nor drums is in the lineup. In `App.tsx`, `initBeatState()` is called unconditionally after calibration regardless of lineup. `CanvasRenderer` already guards `drawPocketLine` with `bassIdx >= 0 && drumsIdx >= 0` — so the visual line itself won't draw. The bug is that `AnalysisTick.ts` (Phase 4 section) looks up frequency bands named `drums_high`, `ride`, and `bass`, and those bands ARE present in `FrequencyBandSplitter` regardless of lineup (bands are built from sampleRate, not lineup). So the `if (drumsHighBand && rideBand && bassBand)` guard passes even without drums/bass in the lineup, and `updatePocketScore` runs, producing `lastDrumOnsetSec` changes that trigger `CanvasRenderer`'s beat pulse logic on lines 376-385 — this causes `animState.lastSeenDrumOnsetSec` lookups on nodes that don't exist as drums, potentially causing visual glitches. The fix is to add a lineup presence check in `AnalysisTick.ts` Phase 4 section before running beat/pocket logic.

**Primary recommendation:** Fix all four gaps with minimal, targeted edits. No new dependencies. Test on iOS Safari after FIX-01.

## Standard Stack

No new libraries required. All fixes are pure code edits within the existing stack.

### Core (existing, unchanged)
| File | Fix | Change Type |
|------|-----|-------------|
| `src/App.tsx` | FIX-01 | Add synchronous AudioContext creation before first await in loadExample |
| `src/components/InstrumentRoleOverlay.tsx` | FIX-02 | Delete file |
| `src/audio/AnalysisTick.ts` | FIX-01 (indirect), FIX-03, FIX-04 | Remove console.log; add lineup guards |
| `src/canvas/CanvasRenderer.ts` | FIX-03 | Remove console.log |

### No Installation Needed
All fixes are in existing files. No `npm install` step.

## Architecture Patterns

### FIX-01: iOS AudioContext — Synchronous Creation Before Await

**The rule:** On iOS Safari, `new AudioContext()` must be called in the synchronous call stack of a user gesture. Any `await` consumes the gesture token.

**Current broken flow in `loadExample`:**
```
onClick -> loadExample() [async]
  -> await fetch('/examples/example-info.json')   // gesture consumed here
  -> await fetch(`/examples/${info.audioFile}`)
  -> await loadAudioBuffer(...)
     -> createAudioContext()                       // TOO LATE — gesture gone
```

**Fixed flow:**
```
onClick -> loadExample() [async]
  -> new AudioContextClass() SYNCHRONOUSLY        // gesture still on stack
  -> audioStateRef.current.audioCtx = ctx         // store before any await
  -> await fetch('/examples/example-info.json')
  -> await fetch(...)
  -> await loadAudioBuffer(...)                    // finds audioCtx already set, skips creation
```

**Pattern already used in `FileUpload.handleButtonClick`:**
```typescript
// Pre-create AudioContext synchronously within user gesture.
const AudioContextClass =
  window.AudioContext ??
  (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

if (!AudioContextClass) { /* error */ return; }

if (!audioStateRef.current.audioCtx) {
  const ctx = new AudioContextClass({ sampleRate: 44100 });
  audioStateRef.current.audioCtx = ctx;
  audioStateRef.current.sampleRate = ctx.sampleRate;
}
// NOW await is safe
```

`loadAudioBuffer` already checks `if (!audioCtx) { audioCtx = await createAudioContext(); }` — if `audioCtx` is pre-set, it skips creation. The fix adds the synchronous creation block to `loadExample` before its first `await`, mirroring FileUpload.

### FIX-02: Dead Code Removal — InstrumentRoleOverlay

**What exists:**
- `src/components/InstrumentRoleOverlay.tsx` — self-contained component, not imported anywhere
- `src/components/NodeDetailPanel.tsx` — references `InstrumentRoleOverlay` only in comments (lines 10, 23)

**What to do:**
1. Delete `src/components/InstrumentRoleOverlay.tsx`
2. Update `NodeDetailPanel.tsx` comments to remove the reference (comments say "same pattern as InstrumentRoleOverlay" — replace with "same pattern as FileUpload")
3. Verify no other imports exist

### FIX-03: console.log Audit — Hot Path Files

**Confirmed console.log locations:**

| File | Line | Call | Hit Frequency |
|------|------|------|---------------|
| `src/audio/AnalysisTick.ts` | 144 | `console.log('[AnalysisTick] role change:', ...)` | Every role change (up to several times/sec) |
| `src/canvas/CanvasRenderer.ts` | 188 | `console.log('[CanvasRenderer] Call-response detected —', ...)` | On each call-response event |
| `src/canvas/edges/drawCommunicationEdges.ts` | none | — | Already clean |

**Action:** Delete both `console.log` calls. The role-change and call-response events are still functional (callbacks fire, Zustand updates, canvas responds) — the log is purely diagnostic.

Note: `AudioEngine.ts` has several `console.log` calls but is NOT in the hot-path list (FIX-03 specification names exactly `AnalysisTick.ts`, `CanvasRenderer.ts`, `drawCommunicationEdges.ts`). Leave `AudioEngine.ts` logs alone.

### FIX-04: Pocket Line Guard — Lineups Without Bass or Drums

**Root cause analysis:**

`initBeatState()` is called unconditionally in `App.tsx` after calibration:
```typescript
audioStateRef.current.beat = initBeatState();  // always set, regardless of lineup
```

`FrequencyBandSplitter.buildDefaultBands()` always creates bands named `bass`, `drums_high`, `ride` — these come from sampleRate math, not lineup. So in `AnalysisTick.ts` Phase 4:
```typescript
const drumsHighBand = state.bands.find(b => b.name === 'drums_high');  // always finds it
const rideBand = state.bands.find(b => b.name === 'ride');              // always finds it
const bassBand = state.bands.find(b => b.name === 'bass');              // always finds it

if (drumsHighBand && rideBand && bassBand && ...) {
  detectDrumOnset(...);  // runs even without drums in lineup
  detectBassOnset(...);  // runs even without bass in lineup
  updatePocketScore(...); // runs — produces pocketScore, updates lastDrumOnsetSec
```

**Effect on CanvasRenderer:** `beat.lastDrumOnsetSec` changes even without drums. The per-node loop in `CanvasRenderer.render()` checks `beat.lastDrumOnsetSec !== animState.lastSeenDrumOnsetSec` — this fires on nodes that aren't drums, causing beat-pulse logic for non-drum nodes. The pocket line itself is safe (guarded by `bassIdx >= 0 && drumsIdx >= 0`), but `CanvasRenderer` also checks `beat.lastDrumOnsetSec !== this.lastSeenGlobalDrumOnset` at the top of `render()` (lines 376-379), which triggers `this.beatPulse = 2` for all nodes. This produces unexpected pulse animations on solo-piano lineups.

**Fix location:** `AnalysisTick.ts` Phase 4 section. Add lineup presence guards:

```typescript
// Phase 4: only run beat detection when drums and bass are in the lineup
const hasDrums = instrs.some(i => i.instrument === 'drums');
const hasBassInst = instrs.some(i => i.instrument === 'bass');

if (state.beat) {
  const beat = state.beat;
  const audioTimeSec = state.audioCtx?.currentTime ?? 0;

  // Only run if both drums and bass are in the lineup
  if (hasDrums && hasBassInst) {
    // ... existing band lookup and onset detection ...
  }
}
```

This is the minimal fix — no structural changes to BeatState or initBeatState. The `beat` object remains allocated but simply won't be updated without the right instruments, so `bpm` stays null, `pocketScore` stays 0, and no spurious pulses fire.

**Alternative considered:** Conditionally skip `initBeatState()` entirely when lineup lacks both instruments. Rejected — it would require null checks in CanvasRenderer that currently assume `beat` may be null but not that it needs to check lineup. The AnalysisTick guard is cleaner.

### Anti-Patterns to Avoid

- **Wrapping `new AudioContext()` in a Promise or `async/await`:** Destroys the gesture context. Always synchronous.
- **Removing the `audioCtx.resume()` call:** Still needed in case iOS suspended the context between creation and the `await audioRes.arrayBuffer()` call.
- **Deleting `console.log` in non-hot-path files (like `AudioEngine.ts`):** Out of scope for FIX-03; those logs are useful startup diagnostics.
- **Adding lineup checks to `initBeatState()`:** The fix belongs in AnalysisTick, not the init function.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| iOS AudioContext gesture gate | Custom gesture manager | The synchronous-creation-before-await pattern | Already proven in FileUpload, zero dependencies |
| Dead code detection | Build-time tree-shaking audit | Direct grep + manual delete | InstrumentRoleOverlay is clearly unused |

**Key insight:** These are maintenance fixes, not feature additions. No new tooling is appropriate.

## Common Pitfalls

### Pitfall 1: Async Erosion of iOS Gesture Context
**What goes wrong:** Developer adds `await` before `new AudioContext()` thinking the gesture is still valid.
**Why it happens:** The iOS gesture window is not timer-based — it closes on the first macrotask boundary, which any `await` introduces.
**How to avoid:** Put `new AudioContextClass()` as the very first line of the click handler body, before any conditional logic or await.
**Warning signs:** AudioContext creates successfully on desktop Chrome, silently fails or stays suspended on iOS Safari.

### Pitfall 2: Incomplete Import Cleanup After File Deletion
**What goes wrong:** `InstrumentRoleOverlay.tsx` is deleted but comments or type references remain, causing confusion in future work.
**Why it happens:** Comments in `NodeDetailPanel.tsx` reference it by name.
**How to avoid:** Grep for `InstrumentRoleOverlay` before marking FIX-02 complete, update the two comments in `NodeDetailPanel.tsx`.
**Warning signs:** TypeScript build passes (no import), but textual references mislead future readers.

### Pitfall 3: console.log Removal Causes Behavioral Change
**What goes wrong:** A console.log wraps logic or has side effects.
**Why it happens:** Rare but possible if the log argument calls a function.
**How to avoid:** Verify both log calls are pure: `console.log('[AnalysisTick] role change:', instr.instrument, newRole)` and `console.log('[CanvasRenderer] Call-response detected — gap:', callResponse.gapSec.toFixed(2), 's')` — both are read-only, no side effects. Safe to delete the entire `console.log(...)` line.
**Warning signs:** None expected — these are pure reads.

### Pitfall 4: Pocket Line Guard Too Aggressive
**What goes wrong:** Adding guards that prevent beat/BPM from computing for lineups that have drums but no bass (or vice versa).
**Why it happens:** The fix applies `hasDrums && hasBassInst` — both required.
**How to avoid:** The pocket score inherently requires both instruments (it measures bass-drums sync). BPM detection uses drum onsets only — it could theoretically run with drums and no bass. But the console error described in FIX-04 success criteria comes from `updatePocketScore` being called when `lastBassOnsetSec === -1`, and from `CanvasRenderer` treating drums-only lineups as "no drums node found" visual glitch. The cleanest fix gates the entire Phase 4 block on both instruments being present.

### Pitfall 5: Missing `audioCtx.resume()` in loadExample Fix
**What goes wrong:** AudioContext is created synchronously but iOS may still suspend it before the `arrayBuffer` decode step.
**Why it happens:** iOS has multiple suspension triggers beyond just creation (tab backgrounding, etc.).
**How to avoid:** After the synchronous creation block, the `loadAudioBuffer` function already calls `await audioCtx.resume()` — this is preserved. No extra resume needed in `loadExample` itself.

## Code Examples

### FIX-01: Synchronous AudioContext Creation in loadExample

```typescript
// Source: FileUpload.handleButtonClick (src/components/FileUpload.tsx lines 78-103)
// Apply same pattern to App.tsx loadExample

async function loadExample() {
  // iOS: create AudioContext synchronously BEFORE any await
  const AudioContextClass =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (AudioContextClass && !audioStateRef.current.audioCtx) {
    const ctx = new AudioContextClass({ sampleRate: 44100 });
    audioStateRef.current.audioCtx = ctx;
    audioStateRef.current.sampleRate = ctx.sampleRate;
  }

  try {
    const infoRes = await fetch('/examples/example-info.json');  // safe to await now
    // ... rest of existing loadExample logic unchanged ...
  }
}
```

### FIX-03: console.log Removal — AnalysisTick.ts line 144

Remove lines 143-145:
```typescript
// DELETE these lines:
console.log('[AnalysisTick] role change:', instr.instrument, newRole);
```
Keep surrounding logic intact — `instr.role = newRole`, `instr.roleSinceSec`, and `onRoleChange?.(...)` all remain.

### FIX-03: console.log Removal — CanvasRenderer.ts line 188

Remove line 188:
```typescript
// DELETE this line:
console.log('[CanvasRenderer] Call-response detected — gap:', callResponse.gapSec.toFixed(2), 's');
```
Keep surrounding `if (callResponse !== null)` block and `guitarKbEdge.callResponseFlashIntensity = 1.0`.

### FIX-04: Lineup Guard in AnalysisTick.ts Phase 4 Section

```typescript
// Source: src/audio/AnalysisTick.ts Phase 4 section (around line 261)
// Add lineup presence guards before band-based onset detection

if (state.beat) {
  const beat = state.beat;
  const audioTimeSec = state.audioCtx?.currentTime ?? 0;

  // Guard: only run beat/pocket logic when both bass and drums are in the lineup.
  // FrequencyBands for 'bass', 'drums_high', 'ride' always exist (built from sampleRate),
  // but onset detection without the corresponding instruments produces spurious results.
  const hasBassInstrument = instrs.some(i => i.instrument === 'bass');
  const hasDrumsInstrument = instrs.some(i => i.instrument === 'drums');

  if (hasBassInstrument && hasDrumsInstrument) {
    const drumsHighBand = state.bands.find(b => b.name === 'drums_high');
    // ... rest of existing Phase 4 code unchanged ...
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FileUpload creates AudioContext on file change (async) | FileUpload creates AudioContext synchronously in click handler | Phase 1 | Proven iOS-safe pattern |
| InstrumentRoleOverlay rendered role labels in React DOM | Canvas node graph renders roles directly on canvas | Phase 5 | InstrumentRoleOverlay is now dead code |

**Deprecated/outdated:**
- `InstrumentRoleOverlay.tsx`: Replaced by Phase 5 canvas node rendering. Comment in the file says "TEMPORARY: will be replaced by Phase 5". Phase 5 is complete; this is confirmed dead code.

## Open Questions

1. **Should `loadExample` show an error to the user when AudioContext creation fails?**
   - What we know: `FileUpload` sets a React `error` state to display errors; `loadExample` currently just returns silently on failure.
   - What's unclear: Whether adding error display to `loadExample` is in scope for FIX-01 or is a separate enhancement.
   - Recommendation: Keep existing silent-return on `!AudioContextClass` (same as FileUpload does when AudioContext is unsupported). FIX-01 is specifically about the gesture timing, not error UI.

2. **Should BPM detection run for drum-only lineups (drums but no bass)?**
   - What we know: BPM is derived from drum onsets only (`updateBpm` uses `beat.drumOnsetTimes`). Pocket score requires both. The FIX-04 success criterion says "does not produce a console error or visual glitch on the pocket line" — the pocket line is only drawn when bass+drums present.
   - What's unclear: Whether a drums-only lineup should show BPM on the canvas.
   - Recommendation: Gate the entire Phase 4 block on `hasBassInstrument && hasDrumsInstrument` as described. BPM on drums-only lineups is not in the v1.0 success criteria. If needed later, it's a separate feature addition.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/App.tsx`, `src/components/FileUpload.tsx`, `src/audio/AnalysisTick.ts`, `src/canvas/CanvasRenderer.ts`, `src/canvas/edges/drawCommunicationEdges.ts`, `src/canvas/edges/drawPocketLine.ts`, `src/audio/types.ts`, `src/audio/PocketScorer.ts`
- All findings are from reading the actual source files — not inferred from documentation

### Secondary (MEDIUM confidence)
- iOS Safari AudioContext gesture requirement: behavior verified by existing `FileUpload` implementation that already handles it correctly; pattern is stable and well-established

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- FIX-01 root cause: HIGH — traced exact call chain through App.tsx, FileUpload.tsx, AudioEngine.ts
- FIX-02 dead code: HIGH — grep confirmed no imports of InstrumentRoleOverlay anywhere
- FIX-03 console.log locations: HIGH — exact line numbers confirmed by grep
- FIX-04 root cause and fix location: HIGH — traced FrequencyBandSplitter, AnalysisTick Phase 4, CanvasRenderer beat-pulse logic

**Research date:** 2026-03-12
**Valid until:** Stable (these are deterministic code fixes, no external dependencies to drift)
