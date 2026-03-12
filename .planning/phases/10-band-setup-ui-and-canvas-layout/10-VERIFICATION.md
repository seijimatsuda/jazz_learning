---
phase: 10-band-setup-ui-and-canvas-layout
verified: 2026-03-12T06:19:36Z
status: gaps_found
score: 3/4 must-haves verified
gaps:
  - truth: "The band setup panel shows all 8 instruments as toggleable options and enforces a 2-8 count constraint"
    status: partial
    reason: "Toggle logic and count badge are fully implemented, but BandSetupPanel.tsx retains AVAILABLE_INSTRUMENTS and BAND_LABELS constants that are no longer used after the phase-10-01 rewrite. With noUnusedLocals: true in tsconfig.app.json, these produce TS6133 errors that fail tsc -b (exit code 2). The SUMMARY claimed 'build-verified' but the build fails."
    artifacts:
      - path: "src/components/BandSetupPanel.tsx"
        issue: "Line 15: AVAILABLE_INSTRUMENTS declared but never read (TS6133). Line 28: BAND_LABELS declared but never read (TS6133). Both constants were preserved from the pre-phase-10 implementation per decision D-10-01-3, but their presence causes a build failure under the project's strict tsconfig."
    missing:
      - "Remove or prefix-underscore AVAILABLE_INSTRUMENTS constant (or move it to a shared constants file if kept for future reference)"
      - "Remove or prefix-underscore BAND_LABELS constant (or move it to a shared constants file if kept for future reference)"
human_verification:
  - test: "Visual readability at 320px width (2 instruments)"
    expected: "Bass at center, one peer to the right — two nodes with readable labels and no overlap"
    why_human: "Cannot verify visual spacing programmatically; gap at 2-instrument count=1 ring node is deterministic (x=0.75) but label overlap and touch-target size need visual confirmation on iOS"
  - test: "Visual readability at 320px width (8 instruments)"
    expected: "Bass at center, 7 nodes on elliptical ring — all labels readable, no adjacent label collision"
    why_human: "At rx=0.34 on 320px canvas, horizontal radius=109px. With 7 ring nodes, center-to-center gap ~97px. Whether that remains legible at DPR=2 on a physical iPhone screen requires device test"
  - test: "Edge auto-hide at 6+ instruments"
    expected: "Switching from 5 to 6 instruments causes weak edges (weight < 0.45 but >= 0.30) to fade out — canvas stays uncluttered"
    why_human: "Dynamic threshold logic exists in code (instrumentCount > 5 ? 0.45 : 0.30) but requires a real audio session to verify the visual effect"
---

# Phase 10: Band Setup UI and Canvas Layout — Verification Report

**Phase Goal:** Users can select any combination of 2-8 instruments in the setup UI and see a readable canvas layout that adapts to the lineup
**Verified:** 2026-03-12T06:19:36Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Band setup panel shows all 8 instruments as toggleable options with 2-8 count enforcement | PARTIAL | Toggle logic, family grouping, count badge, and vibes/keyboard conflict prevention are fully implemented. However two unused constants (AVAILABLE_INSTRUMENTS, BAND_LABELS) from the pre-rewrite version were retained per D-10-01-3 and cause TS6133 errors that fail `tsc -b` under `noUnusedLocals: true` |
| 2 | Node graph arranges instruments in circular layout readable at both 2 and 8 instruments on 320px iOS screen | VERIFIED (code) / ? HUMAN (visual) | computeNodePositions() implements deterministic ellipse (rx=0.34, ry=0.17) for counts 2-8 with documented iOS geometry calculation in code comments. Visual confirmation on device still needed |
| 3 | Bass always occupies gravitational center regardless of instrument count | VERIFIED | CanvasRenderer constructor reorders lineup: `bassIdx > 0 ? ['bass', ...lineup.filter(i => i !== 'bass')] : [...lineup]`. computeNodePositions() always returns position[0] = {x:0.5, y:0.5}. When bass is absent, first instrument takes center — consistent fallback |
| 4 | At 6-8 instruments, weak edges auto-hide and non-animated edges batch-render without canvas stuttering | VERIFIED (code) | Dynamic threshold `instrumentCount > 5 ? 0.45 : 0.30` at line 125 of drawCommunicationEdges.ts. Non-animated edges batched in single pass (Pass 2) with rgba() opacity encoding — no per-edge save/restore. Animated edges still isolated with save/restore for iOS setLineDash. Module-level 28-slot pre-allocated buffer confirmed at lines 66-78. CanvasRenderer passes `this.instrumentOrder.length` as final arg at line 478 |

**Score:** 3/4 truths verified (Truth 1 is partial due to build failure)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/BandSetupPanel.tsx` | Toggle UI with 8 instruments, family groups, count badge, 2-8 enforcement | PARTIAL | 152 lines. Toggle logic substantive and correct. Two dead constants cause TS6133 build errors. Exported and imported by App.tsx |
| `src/canvas/nodes/NodeLayout.ts` | computeNodePositions for 2-8 counts, bass-center convention | VERIFIED | 122 lines. computeNodePositions handles counts 2|3|4|5|6|7|8 with special case for count=2. buildPairs() generates all non-pocket pairs. Imported by CanvasRenderer |
| `src/canvas/CanvasRenderer.ts` | Bass-first reordering in constructor, passes instrumentCount to drawCommunicationEdges | VERIFIED | 728 lines. Bass reordering block at lines 146-151. computeNodePositions called at line 154. instrumentOrder.length passed at line 478 |
| `src/canvas/edges/drawCommunicationEdges.ts` | Collect-then-draw 4-pass pattern, dynamic threshold, pre-allocated buffer | VERIFIED | 310 lines. 4 passes confirmed (Collect, Non-animated batch, Animated with save/restore, Flash). hideThreshold computed at line 125. edgeRenderBuf pre-allocated with 28 slots at module level. rgba() opacity encoding in Pass 2 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `BandSetupPanel.tsx` | `useAppStore` (lineup state) | `useAppStore((s) => s.lineup)` / `setLineup` | WIRED | Zustand store access confirmed at lines 46-48 |
| `App.tsx` | `BandSetupPanel` | `import` + JSX render at line 170 | WIRED | Imported at line 7, rendered in JSX at line 170 |
| `VisualizerCanvas.tsx` | `CanvasRenderer` | `new CanvasRenderer(canvas, audioStateRef, lineup)` | WIRED | lineup read from `useAppStore.getState().lineup` at line 35, passed to constructor at line 38 |
| `CanvasRenderer` | `computeNodePositions` | Constructor (line 154) and resize() (line 211) | WIRED | Called with `this.instrumentOrder.length as 2|3|4|5|6|7|8` |
| `CanvasRenderer` | `drawCommunicationEdges` | render() call at line 468 with `this.instrumentOrder.length` as final arg | WIRED | Line 478 confirmed: `this.instrumentOrder.length` passed as `instrumentCount` |
| `CanvasRenderer` constructor | bass-first reorder | `lineup.indexOf('bass')` at line 146, splice at 148 | WIRED | Reorder block present and correct |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|---------------|
| BAND-01: User can select any combination of 2-8 instruments before playback | SATISFIED (logic) | TS build errors do not block runtime in dev mode; logic is correct |
| BAND-02: Band setup panel shows all 8 available instruments as toggles | SATISFIED | All 8 instruments rendered via INSTRUMENT_FAMILIES map |
| CANV-01: Node graph uses circular layout algorithm adapting to 2-8 instruments | SATISFIED | computeNodePositions() covers all counts 2-8 deterministically |
| CANV-02: Bass node remains gravitational center regardless of instrument count | SATISFIED | Bass-first reorder + position[0]={x:0.5,y:0.5} convention verified |
| CANV-03: Non-animated edges batch-rendered for iOS performance at high counts | SATISFIED | Single-pass rgba() batch in Pass 2, no per-edge save/restore |
| CANV-04: Weak communication edges auto-hide when instrument count exceeds 5 | SATISFIED | hideThreshold = instrumentCount > 5 ? 0.45 : 0.30 at line 125 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/BandSetupPanel.tsx` | 15 | `AVAILABLE_INSTRUMENTS` declared but never used (TS6133) | Blocker | Fails `tsc -b` (exit code 2). The project's `npm run build` runs `tsc -b && vite build` — the vite step cannot run |
| `src/components/BandSetupPanel.tsx` | 28 | `BAND_LABELS` declared but never used (TS6133) | Blocker | Same — co-fails with above |
| `src/canvas/CanvasRenderer.ts` | 188 | `console.log('[CanvasRenderer] Call-response detected...')` | Warning | Hot-path console.log (fires on every call-response event). Not a phase 10 regression — present in earlier phases |

**Note:** The other TS errors in the build output (AnalysisTick, CalibrationPass, SwingAnalyzer, TensionMeter, ChordLogPanel, Timeline) are pre-existing from earlier phases — verified by git log showing those files were last modified in phases 2-7. Only the BandSetupPanel TS6133 errors are newly introduced by phase 10-01.

### Human Verification Required

#### 1. Visual readability at 2 instruments on 320px iOS screen

**Test:** Open app on an iPhone (or Chrome DevTools at 320px width), set lineup to bass + one other instrument, observe canvas
**Expected:** Bass at center (x=50%), peer at x=75% — both nodes visible with readable labels, no overlap
**Why human:** Touch-target size, DPR=2 rendering, and font legibility at small canvas width cannot be verified structurally

#### 2. Visual readability at 8 instruments on 320px iOS screen

**Test:** Open app on an iPhone, set all 8 instruments (note: vibes+keyboard conflict means max achievable is 7 via toggle UI — select bass, drums, guitar, saxophone, trumpet, trombone + either keyboard or vibes)
**Expected:** 6-7 nodes on elliptical ring around bass center — labels not colliding, nodes not overlapping
**Why human:** At rx=0.34 on 320px canvas, horizontal radius = 109px. With 7 ring nodes, angular gap ≈ 51 degrees. Physical legibility requires device test

#### 3. Dynamic edge hide at instrument count transition (5→6)

**Test:** With audio playing, toggle from 5 to 6 instruments and observe the canvas
**Expected:** Edges with weight 0.30-0.45 (previously visible as static_thin) fade to hidden over ~300ms
**Why human:** Requires real audio session with cross-correlation weights in the 0.30-0.45 band; cannot simulate analytically

### Gaps Summary

One gap blocking a clean build:

**BandSetupPanel.tsx retains two dead constants** (`AVAILABLE_INSTRUMENTS` and `BAND_LABELS`) that were kept per decision D-10-01-3 ("preserved for future reference") but were not marked with underscore-prefix or moved to a shared constants file. Under `noUnusedLocals: true` in tsconfig.app.json, these produce TS6133 errors that cause `tsc -b` to exit with code 2. The `npm run build` command (`tsc -b && vite build`) therefore fails before Vite runs.

The fix is simple: remove both constants (2 lines each) or move them to a shared constants file. All four success criteria for the phase goal are structurally implemented and logically correct — this is a cleanup gap from the phase-10-01 rewrite, not a missing feature.

---
_Verified: 2026-03-12T06:19:36Z_
_Verifier: Claude (gsd-verifier)_
