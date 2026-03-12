/**
 * DisambiguationEngine.ts — Orchestrator that runs all applicable disambiguators per tick.
 *
 * Implements DISC-FND-04 (tutti guard) and DISC-FND-05 (pair presence guard).
 *
 * Algorithm per tick:
 *   1. Initialize displayActivityScore = activityScore for all instruments.
 *   2. Tutti guard — if all instruments are simultaneously active (rawActivityScore > 0.6),
 *      set isTutti = true, zero out confidence values, and return early.
 *   3. For each applicable disambiguator pair (guarded by hasInstrumentPair / countHorns):
 *      a. Call the disambiguator.
 *      b. Apply returned weights to displayActivityScore of the relevant instruments.
 *      c. Store confidence in DisambiguationState.confidence.
 *
 * Disambiguators run in this order:
 *   - TromboneBass    (flatness + sub-bass onset)
 *   - SaxKeyboard     (chroma entropy — only when chroma available)
 *   - VibesKeyboard   (RMS variance / tremolo detection)
 *   - HornSection     (spectral centroid ordering — only when 3+ horns)
 *
 * CRITICAL: This function mutates `state` and `instrs[*].displayActivityScore` in place.
 * No new typed arrays are allocated here — all ring buffers live in DisambiguationState.
 */

import type { InstrumentAnalysis, FrequencyBand, DisambiguationState } from './types';
import { hasInstrumentPair, countHorns, isTuttiActive, HORN_INSTRUMENTS } from './instrumentFamilies';
import { disambiguateTromboneBass } from './TromboneBassDisambiguator';
import { disambiguateSaxKeyboard } from './SaxKeyboardDisambiguator';
import { disambiguateVibesKeyboard } from './VibesKeyboardDisambiguator';
import { disambiguateHornSection } from './HornSectionDisambiguator';

/**
 * Runs one tick of the full disambiguation pipeline over the instrument lineup.
 *
 * @param instrs        - Per-instrument analysis objects (displayActivityScore mutated in place)
 * @param freqData      - Current frame frequency magnitude data (Uint8Array, 0–255)
 * @param prevFreqData  - Previous frame frequency magnitude data (Uint8Array, 0–255)
 * @param bands         - FrequencyBand array from buildDefaultBands()
 * @param sampleRate    - Audio context sample rate (e.g. 44100)
 * @param fftSize       - FFT size (e.g. 4096)
 * @param state         - DisambiguationState — mutated in place (ring buffers + confidence)
 * @param chroma        - Array of 12 chroma bin values, or null if unavailable
 */
export function runDisambiguationEngine(
  instrs: InstrumentAnalysis[],
  freqData: Uint8Array,
  prevFreqData: Uint8Array,
  bands: FrequencyBand[],
  sampleRate: number,
  fftSize: number,
  state: DisambiguationState,
  chroma: number[] | null,
): void {
  // Step 1: Initialize displayActivityScore from activityScore for all instruments.
  // activityScore already includes kb/guitar weights from KbGuitarDisambiguator.
  for (const instr of instrs) {
    instr.displayActivityScore = instr.activityScore;
  }

  // Step 2: Tutti guard (DISC-FND-04).
  // If all instruments are simultaneously loud, disambiguation is unreliable.
  if (isTuttiActive(instrs)) {
    state.tuttiFrameCount++;
    state.isTutti = true;
    // Zero out confidence values — no reliable signal during tutti
    for (const key of Object.keys(state.confidence)) {
      state.confidence[key] = 0;
    }
    return;
  }

  // Not tutti: reset flags
  state.tuttiFrameCount = 0;
  state.isTutti = false;

  // Step 3: Trombone / bass pair (DISC-01)
  if (hasInstrumentPair(instrs, 'trombone', 'bass')) {
    const { tromboneWeight, bassWeight, confidence } = disambiguateTromboneBass(
      freqData,
      prevFreqData,
      bands,
      state,
    );

    state.confidence['trombone_bass'] = confidence;

    const trombone = instrs.find(i => i.instrument === 'trombone');
    const bass = instrs.find(i => i.instrument === 'bass');
    if (trombone) trombone.displayActivityScore *= tromboneWeight;
    if (bass) bass.displayActivityScore *= bassWeight;
  }

  // Step 4: Saxophone / keyboard pair (DISC-05)
  // Only runs when chroma is available (requires chord state to be initialized).
  if (hasInstrumentPair(instrs, 'saxophone', 'keyboard') && chroma !== null) {
    const { saxWeight, keyboardWeight, confidence } = disambiguateSaxKeyboard(chroma);

    state.confidence['sax_keyboard'] = confidence;

    const sax = instrs.find(i => i.instrument === 'saxophone');
    const keyboard = instrs.find(i => i.instrument === 'keyboard');
    if (sax) sax.displayActivityScore *= saxWeight;
    if (keyboard) keyboard.displayActivityScore *= keyboardWeight;
  }

  // Step 5: Vibes / keyboard pair (DISC-02)
  if (hasInstrumentPair(instrs, 'vibes', 'keyboard')) {
    const { vibesWeight, keyboardWeight, confidence } = disambiguateVibesKeyboard(
      freqData,
      bands,
      state,
    );

    state.confidence['vibes_keyboard'] = confidence;

    const vibes = instrs.find(i => i.instrument === 'vibes');
    const keyboard = instrs.find(i => i.instrument === 'keyboard');
    if (vibes) vibes.displayActivityScore *= vibesWeight;
    if (keyboard) keyboard.displayActivityScore *= keyboardWeight;
  }

  // Step 6: Horn section (DISC-03) — only when 3+ horns are present.
  if (countHorns(instrs) >= 3) {
    // Build horn instrument list with rawActivityScore for the disambiguator
    const hornInstruments = instrs
      .filter(i => HORN_INSTRUMENTS.has(i.instrument))
      .map(i => ({ instrument: i.instrument, rawActivityScore: i.rawActivityScore }));

    const { weights, confidence } = disambiguateHornSection(
      freqData,
      hornInstruments,
      bands,
      sampleRate,
      fftSize,
    );

    state.confidence['horn_section'] = confidence;

    // Only apply weights when confidence > 0 (guard from HornSectionDisambiguator)
    if (confidence > 0 && Object.keys(weights).length > 0) {
      for (const instr of instrs) {
        if (HORN_INSTRUMENTS.has(instr.instrument) && weights[instr.instrument] !== undefined) {
          instr.displayActivityScore *= weights[instr.instrument];
        }
      }
    }
  }
}
