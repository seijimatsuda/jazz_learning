---
phase: 01
plan: 03
subsystem: audio-analysis
tags: [web-audio-api, analyser-node, fft, frequency-bands, typed-arrays, ios-safe]

dependency-graph:
  requires: ["01-01", "01-02"]
  provides: ["dual-analyser-nodes", "frequency-band-splitter", "pre-allocated-typed-arrays"]
  affects: ["01-04", "01-05"]

tech-stack:
  added: []
  patterns:
    - "Dual AnalyserNode split: smoothed (0.8) for visualization, raw (0.0) for transients"
    - "Runtime hzToBin using audioCtx.sampleRate — never hardcoded"
    - "Pre-allocated Uint8Array reuse for GC-pressure-free animation loop"

key-files:
  created:
    - src/audio/FrequencyBandSplitter.ts
  modified:
    - src/audio/AudioEngine.ts
    - src/components/FileUpload.tsx

decisions:
  - id: D-01-03-1
    choice: "raw AnalyserNode NOT connected to destination"
    rationale: "Connecting raw to destination would double audio output volume; raw is a silent measurement tap only"
  - id: D-01-03-2
    choice: "connectSourceToGraph deferred to play time (Plan 01-04)"
    rationale: "Source nodes are created fresh on each play; connecting at load time would reference a stale source node"
  - id: D-01-03-3
    choice: "6 overlapping frequency bands including drums_low/drums_high"
    rationale: "Kick and snare span multiple bands; overlapping lets beat detection read from dedicated drum bands without sacrificing melodic analysis"

metrics:
  duration: "~3 minutes"
  completed: "2026-03-10"
---

# Phase 01 Plan 03: Dual AnalyserNode Setup and FrequencyBandSplitter Summary

**One-liner:** Dual AnalyserNode graph (smoothed=0.8 for viz, raw=0.0 for transients) with runtime hzToBin using audioCtx.sampleRate, 6 jazz-instrument frequency bands, and pre-allocated Uint8Array typed arrays stored in audioStateRef.

## What Was Built

### FrequencyBandSplitter.ts (new file)

- `hzToBin(hz, sampleRate, fftSize)` — converts Hz to FFT bin index using runtime sampleRate, clamped to `[0, fftSize/2 - 1]`
- `buildDefaultBands(sampleRate, fftSize)` — creates 6 named bands (bass, drums_low, mid, mid_high, drums_high, ride) with bin indices computed at runtime; logs band config to console on creation
- `getBandEnergy(freqData, band)` — averages Uint8Array values across `[lowBin, highBin]`, returns normalized `[0.0, 1.0]`

### AudioEngine.ts additions

- `createDualAnalysers(audioCtx, fftSize)` — creates smoothed analyser (smoothingTimeConstant=0.8, minDecibels=-90, maxDecibels=-10) and raw analyser (smoothingTimeConstant=0.0)
- `connectSourceToGraph(audioCtx, source, smoothed, raw)` — connects source→smoothed→destination and source→raw (raw is silent tap, NOT to destination)
- `allocateTypedArrays(fftSize)` — pre-allocates `smoothedFreqData`, `rawFreqData`, `rawTimeData` as `Uint8Array(fftSize/2)`

### FileUpload.tsx updates

After `createAudioContext` + `decodeAudioFile`:
1. Calls `createDualAnalysers` → stores `smoothedAnalyser`, `rawAnalyser` on ref
2. Calls `allocateTypedArrays` → stores `smoothedFreqData`, `rawFreqData`, `rawTimeData` on ref
3. Calls `buildDefaultBands(audioCtx.sampleRate, fftSize)` → stores `bands` on ref
4. `connectSourceToGraph` is NOT called here — deferred to play time in Plan 01-04

## Commits

| Hash | Description |
|------|-------------|
| cf28b84 | feat(01-03): create FrequencyBandSplitter with hzToBin |
| 371c7f9 | feat(01-03): add dual AnalyserNode setup and pre-allocated typed arrays |

## Verification

- `npx tsc --noEmit` — zero errors after both tasks
- All 6 frequency bands log to console on file load (verifiable in browser dev tools)
- Band bin indices computed from `audioCtx.sampleRate` — iOS 48kHz handled automatically

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

Plan 01-04 (transport / play-pause) can now:
- Call `connectSourceToGraph` at play time with a fresh `AudioBufferSourceNode`
- Read `audioStateRef.current.smoothedAnalyser` and `rawAnalyser` directly
- Fill pre-allocated `smoothedFreqData` and `rawFreqData` via `getByteFrequencyData`
- Fill `rawTimeData` via `getByteTimeDomainData`
- Access `audioStateRef.current.bands` for per-band energy during the animation loop
