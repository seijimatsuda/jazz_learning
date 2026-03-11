/**
 * TensionHeatmap.ts — Pre-computed tension heatmap from offline chord-function analysis.
 *
 * Computes a per-second tension value for the entire track immediately after
 * file load, before any playback.  The result is a Float32Array where each
 * element represents the tension for that one-second window (values in [0,1]).
 *
 * Tension implementation (Phase 3):
 *   For each second, extracts a 12-element chroma vector using Meyda.extract('chroma').
 *   Matches against CHORD_TEMPLATES via cosine similarity to determine chord function.
 *   Maps chord function to a tension midpoint:
 *     tonic       → 0.100  (home, relaxed and stable)
 *     subdominant → 0.325  (color, gentle pull)
 *     dominant    → 0.650  (tension, wants to resolve)
 *     altered     → 0.875  (altered, maximum tension)
 *
 * iOS fix:
 *   Forces Meyda.chromaFilterBank to undefined before setting sampleRate to ensure
 *   the filter bank is rebuilt with the correct sampleRate (iOS may be 48kHz).
 *
 * Implementation notes:
 * - Mixes down to mono before processing
 * - Forces Meyda filter bank rebuild before the first extraction
 * - Safe on iOS (pure JS, no OfflineAudioContext required)
 */

import Meyda from 'meyda';
import { CHORD_TEMPLATES } from './ChordDetector';
import type { ChordFunction } from './types';

// ---------------------------------------------------------------------------
// Tension midpoint per chord function
// ---------------------------------------------------------------------------

const TENSION_MIDPOINTS: Record<ChordFunction, number> = {
  tonic:       0.100,
  subdominant: 0.325,
  dominant:    0.650,
  altered:     0.875,
};

// ---------------------------------------------------------------------------
// Private: cosineSim between a Float32 chroma and a number[] template
// ---------------------------------------------------------------------------

function cosineSim(chroma: number[], template: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < 12; i++) {
    dot   += chroma[i] * template[i];
    normA += chroma[i] * chroma[i];
    normB += template[i] * template[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Private: matchChordFunction — returns the best-matching chord function
// ---------------------------------------------------------------------------

function matchChordFunction(chroma: number[]): ChordFunction {
  let bestIdx   = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < CHORD_TEMPLATES.length; i++) {
    const score = cosineSim(chroma, CHORD_TEMPLATES[i].template);
    if (score > bestScore) {
      bestScore = score;
      bestIdx   = i;
    }
  }

  return CHORD_TEMPLATES[bestIdx].function;
}

/**
 * Computes a per-second chord-function-based tension heatmap for the given AudioBuffer.
 *
 * @param buffer     - Decoded AudioBuffer (from decodeAudioFile)
 * @param sampleRate - Actual sample rate in Hz (from audioCtx.sampleRate)
 * @returns          Float32Array of length Math.ceil(buffer.duration), values in [0,1]
 */
export async function computeTensionHeatmap(
  buffer: AudioBuffer,
  sampleRate: number
): Promise<Float32Array> {
  const duration    = buffer.duration;
  const numSeconds  = Math.max(1, Math.ceil(duration));
  const tension     = new Float32Array(numSeconds);

  // FFT buffer size for Meyda chroma extraction.
  // Must be a power of 2. 4096 matches our live fftSize for consistency.
  const FFT_SIZE = 4096;

  // -------------------------------------------------------------------------
  // Force Meyda filter bank rebuild with correct sampleRate (iOS fix)
  // Without this, a stale 44.1kHz bank on a 48kHz device produces wrong chroma.
  // -------------------------------------------------------------------------
  (Meyda as any).chromaFilterBank = undefined;
  Meyda.bufferSize = FFT_SIZE;
  Meyda.sampleRate = sampleRate;

  // -------------------------------------------------------------------------
  // Mix down to mono — average all channels into a single Float32Array
  // -------------------------------------------------------------------------
  const numChannels  = buffer.numberOfChannels;
  const totalSamples = buffer.length;

  const mono = new Float32Array(totalSamples);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    const gain = 1 / numChannels;
    for (let i = 0; i < totalSamples; i++) {
      mono[i] += channelData[i] * gain;
    }
  }

  // -------------------------------------------------------------------------
  // Per-second processing: extract chroma, match chord function, assign tension
  // -------------------------------------------------------------------------
  const frame = new Float32Array(FFT_SIZE);

  for (let sec = 0; sec < numSeconds; sec++) {
    const startSample = Math.floor(sec * sampleRate);
    const endSample   = Math.min(startSample + sampleRate, totalSamples);
    const windowLen   = endSample - startSample;

    if (windowLen <= 0) {
      tension[sec] = TENSION_MIDPOINTS.tonic;
      continue;
    }

    // Center a FFT_SIZE window around the middle of this second.
    // If window is shorter than FFT_SIZE, pad with zeros.
    const midSample  = startSample + Math.floor(windowLen / 2);
    const frameStart = midSample - Math.floor(FFT_SIZE / 2);

    for (let i = 0; i < FFT_SIZE; i++) {
      const sampleIdx = frameStart + i;
      frame[i] = (sampleIdx >= 0 && sampleIdx < totalSamples)
        ? mono[sampleIdx]
        : 0;
    }

    // Extract 12-element chroma vector
    const chromaRaw = Meyda.extract('chroma', frame) as number[] | null;

    if (!chromaRaw || chromaRaw.length !== 12) {
      tension[sec] = TENSION_MIDPOINTS.tonic;
      continue;
    }

    // Match chord function via cosine similarity and map to tension midpoint
    const fn = matchChordFunction(chromaRaw);
    tension[sec] = TENSION_MIDPOINTS[fn];
  }

  console.log(
    `[TensionHeatmap] Computed ${tension.length}s chord-function heatmap ` +
    `(sampleRate=${sampleRate})`
  );

  return tension;
}

/**
 * Maps a tension value in [0,1] to a CSS color string.
 *
 * Blue (low tension) → Purple → Red (high tension)
 *
 * @param t - Tension value in [0,1]
 * @returns  CSS rgba color string
 */
export function tensionToColor(t: number): string {
  // Clamp
  const v = Math.max(0, Math.min(1, t));

  if (v < 0.5) {
    // Blue → Purple: interpolate from (59,130,246) to (139,92,246)
    const blend = v * 2;
    const r = Math.round(59  + blend * (139 - 59));
    const g = Math.round(130 + blend * (92  - 130));
    const b = Math.round(246);
    return `rgba(${r},${g},${b},0.8)`;
  } else {
    // Purple → Red: interpolate from (139,92,246) to (239,68,68)
    const blend = (v - 0.5) * 2;
    const r = Math.round(139 + blend * (239 - 139));
    const g = Math.round(92  + blend * (68  - 92));
    const b = Math.round(246 + blend * (68  - 246));
    return `rgba(${r},${g},${b},0.8)`;
  }
}
