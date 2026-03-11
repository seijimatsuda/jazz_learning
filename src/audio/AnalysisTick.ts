/**
 * AnalysisTick.ts — 10fps orchestrator for all Phase 2 instrument analysis modules.
 *
 * runAnalysisTick is called by CanvasRenderer's rAF loop when the 100ms time gate
 * fires. It pulls fresh FFT data from both analysers, then runs all four Phase 2
 * modules in order:
 *
 *   1. Activity scoring  — computeActivityScore + pushHistory per instrument
 *   2. Role classification — classifyRole + updateTimeInRole per instrument
 *   3. Keyboard/guitar disambiguation — only when both are in the lineup
 *   4. Cross-correlation — Pearson r edge weights for all instrument pairs
 *
 * CRITICAL: This function must NOT allocate any new typed arrays. All buffers
 * (historyBuffer, prevRawFreqData, rawTimeDataFloat) are pre-allocated in
 * initAnalysisState() and reused here on every tick.
 *
 * The caller (CanvasRenderer) is responsible for checking the 100ms time gate.
 * This function assumes that guard has already passed.
 */

import type { AudioStateRef, RoleLabel } from './types';
import { computeActivityScore, pushHistory } from './InstrumentActivityScorer';
import { classifyRole, updateTimeInRole } from './RoleClassifier';
import { disambiguate } from './KbGuitarDisambiguator';
import { pearsonR, computeEdgeWeight } from './CrossCorrelationTracker';

/**
 * Runs one 10fps analysis tick over the current audio state.
 *
 * Steps:
 *   1. Guard: returns early if state is not ready (not calibrated, no analysis state, etc.)
 *   2. Pull fresh FFT data from both analysers into pre-allocated buffers
 *   3. For each instrument: score → history → classify role → update time in role
 *      Role changes push to onRoleChange callback (Zustand bridge via CanvasRenderer)
 *   4. Keyboard/guitar disambiguation (only when both are in lineup)
 *   5. Cross-correlation edge weights for all instrument pairs
 *   6. Save current rawFreqData as prevRawFreqData for next tick's spectral flux
 *
 * @param state         - AudioStateRef (lives in useRef, never in React state)
 * @param onRoleChange  - Optional callback fired when an instrument's role changes
 */
export function runAnalysisTick(
  state: AudioStateRef,
  onRoleChange?: (instrument: string, role: RoleLabel) => void
): void {
  // Guard: must be calibrated and have all required state before analysis can run
  if (
    !state.analysis ||
    !state.smoothedFreqData ||
    !state.rawFreqData ||
    !state.rawTimeData ||
    !state.smoothedAnalyser ||
    !state.rawAnalyser ||
    !state.isCalibrated
  ) {
    return;
  }

  const analysis = state.analysis;

  // Pull fresh FFT data into pre-allocated buffers (zero allocations)
  state.smoothedAnalyser.getByteFrequencyData(state.smoothedFreqData);
  state.rawAnalyser.getByteFrequencyData(state.rawFreqData);
  state.rawAnalyser.getByteTimeDomainData(state.rawTimeData);

  const instrs = analysis.instruments;

  // Per-instrument: activity scoring, history, role classification, time tracking
  for (const instr of instrs) {
    // 1. Compute activity score (EMA smoothed, normalized to calibration peak)
    const newScore = computeActivityScore(
      state.smoothedFreqData,
      instr.bandNames,
      state.bands,
      state.calibration,
      instr.activityScore
    );
    instr.activityScore = newScore;

    // 2. Push score into circular ring buffer history
    pushHistory(instr, newScore);

    // 3. Classify role with hysteresis
    const newRole = classifyRole(newScore, instr.role);

    // 4. Role change detection — push to Zustand ONLY when role actually changes
    if (newRole !== instr.role) {
      instr.role = newRole;
      instr.roleSinceSec = state.audioCtx?.currentTime ?? 0;
      console.log('[AnalysisTick] role change:', instr.instrument, newRole);
      onRoleChange?.(instr.instrument, newRole);
    }

    // 5. Accumulate time in current role (0.1s per 10fps tick)
    updateTimeInRole(instr.timeInRole, instr.role, 0.1);
  }

  // Keyboard/guitar disambiguation — only when both are in the lineup
  const hasKeyboard = instrs.some(i => i.instrument === 'keyboard');
  const hasGuitar   = instrs.some(i => i.instrument === 'guitar');

  if (hasKeyboard && hasGuitar) {
    // Convert Uint8Array time domain data to Float32Array in [-1, 1] range.
    // rawTimeData is now correctly allocated as fftSize=4096 bytes (fixed in AudioEngine).
    // rawTimeDataFloat is pre-allocated in initAnalysisState — zero allocations here.
    for (let i = 0; i < state.fftSize; i++) {
      analysis.rawTimeDataFloat[i] = (state.rawTimeData[i] - 128) / 128;
    }

    const { keyboardWeight, guitarWeight } = disambiguate(
      state.rawFreqData,
      analysis.prevRawFreqData,
      analysis.rawTimeDataFloat,
      state.sampleRate,
      state.fftSize
    );

    const kb = instrs.find(i => i.instrument === 'keyboard');
    const gt = instrs.find(i => i.instrument === 'guitar');

    if (kb) kb.activityScore *= keyboardWeight;
    if (gt) gt.activityScore *= guitarWeight;
  }

  // Cross-correlation edge weights for all instrument pairs
  for (let a = 0; a < instrs.length; a++) {
    for (let b = a + 1; b < instrs.length; b++) {
      const key = [instrs[a].instrument, instrs[b].instrument].sort().join('_');
      const r = pearsonR(
        instrs[a].historyBuffer,
        instrs[a].historyHead,
        instrs[a].historySamples,
        instrs[b].historyBuffer,
        instrs[b].historyHead,
        instrs[b].historySamples
      );
      analysis.edgeWeights[key] = computeEdgeWeight(r);
    }
  }

  // Save current rawFreqData as previous for next tick's spectral flux computation
  analysis.prevRawFreqData.set(state.rawFreqData);
}
