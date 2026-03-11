---
phase: 05-canvas-node-graph
verified: 2026-03-10T00:00:00Z
status: human_needed
score: 4/5 must-haves verified
human_verification:
  - test: "Confirm canvas animation stays smooth at 60fps with no visible jank during simultaneous FFT analysis on iPhone hardware"
    expected: "All 4 nodes animate smoothly with no dropped frames or stuttering, even when the device is warm or battery-constrained (Low Power Mode OFF)"
    why_human: "iOS device performance cannot be verified programmatically — requires loading the app on real iPhone hardware and playing a jazz track with Low Power Mode OFF. The code is correctly structured (no shadowBlur, offscreen glow canvas via drawImage, all animations frame-rate-independent via lerpExp + deltaMs cap), but actual GPU compositing throughput on A-series silicon must be confirmed by observation."
---

# Phase 5: Canvas Node Graph — Verification Report

**Phase Goal:** Users see an animated node graph where each instrument is a visual entity whose size, color, and animation reflect its musical role and beat activity — and the graph breathes with the music
**Verified:** 2026-03-10T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Canvas displays 2–4 instrument nodes in correct layout (horizontal / triangle / diamond) against #0a0a0f | ✓ VERIFIED | `NodeLayout.ts` exports `computeNodePositions(2\|3\|4)` with all three layouts; `CanvasRenderer` calls `computeNodePositions(4)` for diamond; background RGB starts at `0x0a, 0x0a, 0x0f` (line 312–314) |
| 2 | Nodes animate on drum beats — drums node nudges +6px and ripples, all nodes pulse +2px, background lightens | ✓ VERIFIED | `animState.radiusNudge = 6` on drum onset (L382); `this.beatPulse = 2` globally (L293); background interpolates to `#0d0d18` via `bgPulseProgress` (L312–315); ripple pushed with `durationMs:300, maxRadius:60, color:'#e0f2fe'` (L386–393) |
| 3 | Bass node glows amber (#b45309) on bass onsets, glow color shifts with pocket score | ✓ VERIFIED | `AMBER_RGB = { r: 0xb4, g: 0x53, b: 0x09 }` in `drawGlow.ts`; `pocketToGlowColor()` lerps amber↔blue by pocket score; `glowCanvas` re-created when `|pocketScore - lastPocketScore| > 0.05` (L465–467); `drawGlow` uses `globalCompositeOperation='lighter'` (not shadowBlur) |
| 4 | Role-based node states are visually distinct — soloing looks clearly different from comping/holding/silent | ✓ VERIFIED | `ROLE_BASE_RADIUS`: soloing=52, comping=36, holding=28, silent=18; `ROLE_FILL_COLOR`: soloing=#f59e0b (amber), comping=#0d9488 (teal), holding=#64748b (slate), silent=#1e293b (near-black); smooth `lerpExp(0.15)` transitions between roles |
| 5 | Canvas animation stays smooth at 60fps with no visible jank on iPhone hardware | ? HUMAN NEEDED | Code is structured for iOS perf: no shadowBlur (confirmed), offscreen glow via HTMLCanvasElement drawImage (not OffscreenCanvas — iOS 16 compat explicitly noted), delta-time capped at 100ms, no per-frame allocations. However, 05-05 SUMMARY explicitly documents iOS real-device testing as deferred/untested |

**Score:** 4/5 truths verified (1 requires human on real device)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/canvas/nodes/NodeLayout.ts` | computeNodePositions(2\|3\|4), INSTRUMENT_ORDER | ✓ VERIFIED | 67 lines; exports `NodePosition`, `INSTRUMENT_ORDER`, `computeNodePositions`; all three layout cases implemented |
| `src/canvas/nodes/NodeAnimState.ts` | NodeAnimState interface, factory, lerp/lerpExp, ripple utilities | ✓ VERIFIED | 221 lines; exports `RippleState`, `NodeAnimState`, `createNodeAnimState`, `lerp`, `lerpExp`, `drawAndUpdateRipple`, `updateRipples`; all fields present |
| `src/canvas/nodes/drawNode.ts` | drawNode, ROLE_BASE_RADIUS, ROLE_FILL_COLOR | ✓ VERIFIED | 108 lines; exports all required symbols; role radii 52/36/28/18 and colors amber/teal/slate/near-black |
| `src/canvas/nodes/drawGlow.ts` | drawGlow, pocketToGlowColor, AMBER_RGB, BLUE_RGB | ✓ VERIFIED | 103 lines; `globalCompositeOperation='lighter'`; pocket score correctly maps 1.0→amber, 0.0→blue |
| `src/canvas/CanvasRenderer.ts` | Complete render pipeline: delta-time rAF, diamond layout, all animations | ✓ VERIFIED | 500 lines; delta-time cap `Math.min(rawDelta, 100)` at L279; full bass, drums, all-node, background pipeline |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `CanvasRenderer.ts` | `NodeLayout.ts` | `import computeNodePositions` | ✓ WIRED | L18 import; L117 constructor call; L147 resize call |
| `CanvasRenderer.ts` | `NodeAnimState.ts` | `import createNodeAnimState, lerpExp, updateRipples` | ✓ WIRED | L20 import; factory called in constructor (L120–122); lerpExp used on L304, 351, 373, 461; updateRipples called L428, 477 |
| `CanvasRenderer.ts` | `drawNode.ts` | `import drawNode, getRoleRadius, getRoleFillColor` | ✓ WIRED | L22 import; all three called in render loop at L349, 359, 427, 474, 481 |
| `CanvasRenderer.ts` | `drawGlow.ts` | `import drawGlow, pocketToGlowColor` | ✓ WIRED | L23 import; `drawGlow` called L471; `pocketToGlowColor` called L466 |
| `CanvasRenderer.ts` | `audioStateRef.current.beat.lastBassOnsetSec` | onset detection comparison | ✓ WIRED | L437 `beat.lastBassOnsetSec !== animState.lastSeenBassOnsetSec` |
| `CanvasRenderer.ts` | `audioStateRef.current.beat.pocketScore` | pocket score drives glow color | ✓ WIRED | L433, L455, L465 |
| `CanvasRenderer.ts` | `audioStateRef.current.beat.lastDrumOnsetSec` | per-drums onset + global pulse | ✓ WIRED | L291, L378 |
| `CanvasRenderer.ts` | `audioStateRef.current.beat.lastDownbeatSec` | downbeat double-ripple + +4px pulse | ✓ WIRED | L296, L398 |
| `CanvasRenderer.ts` | `audioStateRef.current.beat.timingOffsetMs` | orbit threshold check | ✓ WIRED | L418 |
| `CanvasRenderer.ts` | `bgPulseProgress` | background color interpolation | ✓ WIRED | Set at L294; decayed at L308; used at L312–315 |
| `VisualizerCanvas.tsx` | `CanvasRenderer` | `new CanvasRenderer(canvas, audioStateRef)` | ✓ WIRED | L14 import; L30 instantiation |
| `glowLayer.ts` | HTMLCanvasElement (not OffscreenCanvas) | `document.createElement('canvas')` | ✓ VERIFIED | iOS 16 compat confirmed; L24 uses `document.createElement` |

---

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| VIZ-01 | ✓ SATISFIED | `computeNodePositions(2\|3\|4)` with horizontal/triangle/diamond layouts |
| VIZ-02 | ✓ SATISFIED | Background base color `#0a0a0f` (computed RGB 0x0a,0x0a,0x0f); 12px monospace labels below each node |
| VIZ-03 | ✓ SATISFIED | `updateBassBreath()` sine cycle [0.2,0.8] modulated by pocket score, synced to BPM |
| VIZ-04 | ✓ SATISFIED | `glowIntensity=1.0` flash on `lastBassOnsetSec` change; 800ms expanding ring (maxRadius=80) |
| VIZ-05 | ✓ SATISFIED | `pocketToGlowColor()` lerps AMBER_RGB↔BLUE_RGB; glowCanvas re-created on >0.05 pocket delta |
| VIZ-06 | ✓ SATISFIED | `radiusNudge=6` on drum onset; `lerpExp(0.92)` decay; snap to 0 below 0.5px |
| VIZ-07 | ✓ SATISFIED | Ripple: `#e0f2fe`, `durationMs:300`, `maxRadius:60` on each drum onset |
| VIZ-08 | ✓ SATISFIED | Second ripple: `durationMs:500`, `maxRadius:90` on `lastDownbeatSec` change |
| VIZ-09 | ✓ SATISFIED | `ORBIT_THRESHOLD_MS=30`, `ORBIT_RADIUS_PX=3`, `ORBIT_SPEED=0.004` rad/ms |
| VIZ-10 | ✓ SATISFIED | Global `beatPulse=2` on drum onset, `beatPulse=4` on downbeat; added to per-node radius target |
| VIZ-11 | ✓ SATISFIED | `bgPulseProgress` drives `#0a0a0f→#0d0d18` RGB interpolation over 200ms linear decay |
| VIZ-12 | ✓ SATISFIED | 4-tier role system: soloing=52px/#f59e0b, comping=36px/#0d9488, holding=28px/#64748b, silent=18px/#1e293b |
| VIZ-13 | ✓ SATISFIED | No `shadowBlur` anywhere in codebase; glow via `createGlowLayer` + `drawImage` + `globalCompositeOperation='lighter'` |

---

### Anti-Patterns Found

None. No TODO/FIXME/placeholder/stub patterns found across all 5 phase artifacts. TypeScript compiles with zero errors (`npx tsc --noEmit` passes clean).

---

### Human Verification Required

#### 1. iPhone Hardware Performance — 60fps Smoothness

**Test:** Open the app at the dev URL on a real iPhone (any model running iOS 16+), upload a jazz recording with clear bass and drums, play for 30+ seconds
**Expected:** All 4 nodes animate without visible stutter or jank — bass breathes, drums ripples expand cleanly, background pulses with beats, role transitions are smooth. No freeze on tab-switch-and-return.
**Why human:** GPU compositing throughput on A-series silicon cannot be verified by static code analysis. The architecture is correctly structured for iOS (HTMLCanvasElement not OffscreenCanvas, no shadowBlur, offscreen glow via drawImage, delta-time capped at 100ms), but actual render performance on device — particularly during simultaneous FFT analysis — requires on-device observation. The 05-05 human checkpoint confirmed desktop visual correctness; iOS hardware was explicitly deferred.
**Extra:** Test with Low Power Mode OFF to avoid GPU throttling masking issues.

---

### Summary

Truths 1–4 are fully verified against the actual code. All 5 node-graph artifacts exist, are substantive, and are correctly wired. All 13 VIZ requirements (VIZ-01 through VIZ-13) are satisfied by real implementation — no stubs, no placeholders, no empty handlers. The delta-time rAF loop, diamond layout, bass glow pipeline, drums animation pipeline, all-node beat pulse, and background breath are all live and connected.

The single unresolved item is Truth 5: 60fps on iPhone hardware. The code is correctly architected for this (iOS-safe rendering patterns throughout), but the 05-05 plan's blocking human-verify checkpoint was approved by the user with iOS explicitly noted as untested/deferred. This cannot be confirmed without running on real device.

---

_Verified: 2026-03-10_
_Verifier: Claude (gsd-verifier)_
