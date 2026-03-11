/**
 * AnalysisTick.ts — 10fps orchestrator for all Phase 2 + Phase 3 + Phase 4 analysis modules.
 *
 * runAnalysisTick is called by CanvasRenderer's rAF loop when the 100ms time gate
 * fires. It pulls fresh FFT data from both analysers, then runs all Phase 2,
 * Phase 3, and Phase 4 modules in order:
 *
 *   1. Activity scoring  — computeActivityScore + pushHistory per instrument
 *   2. Role classification — classifyRole + updateTimeInRole per instrument
 *   3. Keyboard/guitar disambiguation — only when both are in the lineup
 *   4. Cross-correlation — Pearson r edge weights for all instrument pairs
 *   5. Chord detection — extractAndMatchChord (Phase 3)
 *   6. Tension scoring — updateTension with displayed chord function (Phase 3)
 *   7. Drum onset detection — detectDrumOnset (Phase 4)
 *   8. Bass onset detection — detectBassOnset (Phase 4)
 *   9. BPM derivation — updateBpm via autocorrelation (Phase 4)
 *  10. Rubato gate — applyRubatoGate via IOI CV (Phase 4)
 *  11. Pocket score — updatePocketScore via bass↔drums sync (Phase 4)
 *  12. Pitch detection — updatePitchState for keyboard and guitar (Phase 8)
 *
 * CRITICAL: This function must NOT allocate any new typed arrays. All buffers
 * (historyBuffer, prevRawFreqData, rawTimeDataFloat) are pre-allocated in
 * initAnalysisState() and reused here on every tick.
 *
 * The caller (CanvasRenderer) is responsible for checking the 100ms time gate.
 * This function assumes that guard has already passed.
 */

import type { AudioStateRef, RoleLabel } from './types';
import type { ChordFunction } from './types';
import { computeActivityScore, pushHistory } from './InstrumentActivityScorer';
import { classifyRole, updateTimeInRole } from './RoleClassifier';
import { disambiguate } from './KbGuitarDisambiguator';
import { pearsonR, computeEdgeWeight } from './CrossCorrelationTracker';
import { extractAndMatchChord, CHORD_TEMPLATES } from './ChordDetector';
import { updateTension } from './TensionScorer';
import { detectDrumOnset, computeDrumFlux } from './DrumTransientDetector';
import { updateBpm, detectBassOnset } from './BpmTracker';
import { applyRubatoGate } from './SwingAnalyzer';
import { updatePocketScore } from './PocketScorer';
import { updatePitchState } from './PitchDetector';

// ---------------------------------------------------------------------------
// Chord display label maps (module-level constants — zero allocations in tick)
// ---------------------------------------------------------------------------

/** Plain English description of each chord function (CHORD-09, CHORD-10) */
const FUNCTION_LABELS: Record<ChordFunction, string> = {
  tonic:       'home -- relaxed and stable',
  subdominant: 'color -- adding warmth',
  dominant:    'tension -- wants to resolve',
  altered:     'altered -- maximum tension',
};

/** Family label shown at low confidence (CHORD-07) */
const TYPE_DISPLAY: Record<string, string> = {
  major: '', minor: 'm', maj7: 'maj7', m7: 'm7',
  dom7: '7', dim7: 'dim7', m7b5: 'm7b5', alt: 'alt',
};

const FAMILY_LABELS: Record<ChordFunction, string> = {
  tonic:       'major chord',
  subdominant: 'minor chord',
  dominant:    'dominant chord',
  altered:     'altered chord',
};

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
 *   6. Chord detection — extractAndMatchChord (Phase 3)
 *   7. Tension scoring — updateTension with displayed chord function (Phase 3)
 *      Chord/tension pushed to onChordChange only when displayedChordIdx changes
 *   8. Save current rawFreqData as prevRawFreqData for next tick's spectral flux
 *
 * @param state           - AudioStateRef (lives in useRef, never in React state)
 * @param onRoleChange    - Optional callback fired when an instrument's role changes
 * @param onChordChange   - Optional callback fired when displayed chord changes
 * @param onTensionUpdate - Optional callback fired every tick with current tension
 * @param onBeatUpdate    - Optional callback fired when BPM or pocket score changes (Phase 4)
 * @param onMelodyUpdate  - Optional callback fired with keyboard/guitar melodic state (Phase 8)
 */
export function runAnalysisTick(
  state: AudioStateRef,
  onRoleChange?: (instrument: string, role: RoleLabel) => void,
  onChordChange?: (chord: string, confidence: 'low' | 'medium' | 'high', fn: string, tension: number, chordIdx: number) => void,
  onTensionUpdate?: (tension: number) => void,
  onBeatUpdate?: (bpm: number | null, pocketScore: number, timingOffsetMs: number) => void,
  onMelodyUpdate?: (kbMelodic: boolean, gtMelodic: boolean) => void
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
  } else {
    // Guarantee rawTimeDataFloat is populated even when disambiguation doesn't run.
    // extractAndMatchChord (Phase 3) needs it for Meyda chroma extraction.
    for (let i = 0; i < state.fftSize; i++) {
      analysis.rawTimeDataFloat[i] = (state.rawTimeData[i] - 128) / 128;
    }
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

  // ---------------------------------------------------------------------------
  // Phase 3: Chord detection and tension scoring
  // ---------------------------------------------------------------------------

  if (state.chord && state.tension) {
    const prevDisplayedChordIdx = state.chord.displayedChordIdx;

    // Read audioCtx time for chord log timestamping
    const audioTimeSec = state.audioCtx?.currentTime ?? 0;

    // Extract chroma and match against 96 chord templates
    extractAndMatchChord(state, audioTimeSec);

    // Determine displayed chord info
    const chordState  = state.chord;
    const displayIdx  = chordState.displayedChordIdx;
    const gap         = chordState.confidenceGap;

    // Map confidence gap to tier (CHORD-04)
    const confidence: 'low' | 'medium' | 'high' =
      gap < 0.05  ? 'low'    :
      gap < 0.15  ? 'medium' :
                    'high';

    // Get displayed chord function (default to tonic when no chord yet)
    let displayedFunction: ChordFunction = 'tonic';
    let displayName = '--';

    if (displayIdx >= 0 && displayIdx < CHORD_TEMPLATES.length) {
      const tmpl = CHORD_TEMPLATES[displayIdx];
      displayedFunction = tmpl.function;

      if (confidence === 'low') {
        // CHORD-07: low confidence — show chord family only
        displayName = FAMILY_LABELS[displayedFunction];
      } else {
        // CHORD-08: medium/high confidence — show full chord name
        displayName = `${tmpl.root}${TYPE_DISPLAY[tmpl.type] ?? tmpl.type}`;
      }
    }

    // Update tension with the displayed chord's function
    updateTension(state.tension, displayedFunction);

    // Push tension to Zustand every tick (lerp-smoothed value changes continuously)
    if (onTensionUpdate) {
      onTensionUpdate(state.tension.currentTension);
    }

    // Push chord info to Zustand only when displayedChordIdx changes (avoids continuous mutations)
    if (displayIdx !== prevDisplayedChordIdx && onChordChange) {
      const fnLabel = displayIdx >= 0 ? FUNCTION_LABELS[displayedFunction] : '';
      onChordChange(displayName, confidence, fnLabel, state.tension.currentTension, displayIdx);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 4: Beat detection, BPM, and pocket score
  // ---------------------------------------------------------------------------

  if (state.beat) {
    const beat = state.beat;
    const audioTimeSec = state.audioCtx?.currentTime ?? 0;

    // Look up frequency bands by name (not hardcoded bin indices)
    const drumsHighBand = state.bands.find(b => b.name === 'drums_high');
    const rideBand = state.bands.find(b => b.name === 'ride');
    const bassBand = state.bands.find(b => b.name === 'bass');

    if (drumsHighBand && rideBand && bassBand && state.rawFreqData && analysis.prevRawFreqData) {
      // 1. Drum onset detection (populates OSS buffer, onset timestamps, beat counter)
      const drumFlux = computeDrumFlux(
        state.rawFreqData,
        analysis.prevRawFreqData,
        drumsHighBand,
        rideBand,
      );
      detectDrumOnset(beat, state.rawFreqData, analysis.prevRawFreqData, drumsHighBand, rideBand, audioTimeSec);

      // 2. Bass onset detection (RMS delta with debounce and kick bleed suppression)
      detectBassOnset(beat, state.rawFreqData, bassBand, audioTimeSec, drumFlux);

      // 3. BPM update (autocorrelation every 2 seconds)
      const prevBpm = beat.bpm;
      const prevPocket = beat.pocketScore;
      updateBpm(beat);

      // 4. Rubato gate (IOI CV check — may null out BPM)
      applyRubatoGate(beat);

      // 5. Pocket score (bass-drums sync scoring)
      updatePocketScore(beat, audioTimeSec);

      // 6. Push to Zustand when values change
      if (onBeatUpdate && (beat.bpm !== prevBpm || beat.pocketScore !== prevPocket)) {
        onBeatUpdate(beat.bpm, beat.pocketScore, beat.timingOffsetMs);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 8: Pitch detection on keyboard and guitar
  // ---------------------------------------------------------------------------

  if (state.pitch) {
    // rawTimeDataFloat is already populated above (by disambiguation or fallback conversion).
    // We use the full-spectrum time-domain data and gate via activity score — not band-filtered.
    // ACF2+ will detect the dominant pitch in the mix; the 3-frame stability window
    // distinguishes real melodic notes from transient energy (drum bleed, etc.).

    const kbInstr = instrs.find(i => i.instrument === 'keyboard');
    const gtInstr = instrs.find(i => i.instrument === 'guitar');

    if (kbInstr && kbInstr.activityScore > 0.15) {
      updatePitchState(state.pitch.keyboard, analysis.rawTimeDataFloat, state.sampleRate);
    } else {
      // Reset melodic state when keyboard is quiet — no pitch detection on silence
      state.pitch.keyboard.isMelodic = false;
      state.pitch.keyboard.pitchFrameCount = 0;
      state.pitch.keyboard.pitchHz = -1;
      state.pitch.keyboard.stablePitchHz = -1;
    }

    if (gtInstr && gtInstr.activityScore > 0.15) {
      updatePitchState(state.pitch.guitar, analysis.rawTimeDataFloat, state.sampleRate);
    } else {
      // Reset melodic state when guitar is quiet — no pitch detection on silence
      state.pitch.guitar.isMelodic = false;
      state.pitch.guitar.pitchFrameCount = 0;
      state.pitch.guitar.pitchHz = -1;
      state.pitch.guitar.stablePitchHz = -1;
    }

    // Push melodic state to Zustand via callback (only fires when pitch state is initialized)
    onMelodyUpdate?.(state.pitch.keyboard.isMelodic, state.pitch.guitar.isMelodic);
  }

  // Save current rawFreqData as previous for next tick's spectral flux computation
  analysis.prevRawFreqData.set(state.rawFreqData);
}
