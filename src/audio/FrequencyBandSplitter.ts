/**
 * FrequencyBandSplitter.ts — Hz-to-bin conversion and per-band energy extraction.
 *
 * All bin indices are computed at runtime from the actual AudioContext sampleRate.
 * NEVER use hardcoded sampleRate values — iOS Safari may return 48000 instead of 44100.
 */

import type { FrequencyBand } from './types';

/**
 * Converts a frequency in Hz to the corresponding FFT bin index.
 *
 * Formula: bin = round(hz * fftSize / sampleRate)
 * Clamped to [0, fftSize/2 - 1] (valid analyser bin range).
 *
 * @param hz - Frequency in Hz to convert
 * @param sampleRate - Actual sampleRate from audioCtx.sampleRate (NOT hardcoded)
 * @param fftSize - FFT size (e.g. 4096); analyser has fftSize/2 bins
 * @returns FFT bin index clamped to valid range
 */
export function hzToBin(hz: number, sampleRate: number, fftSize: number): number {
  const bin = Math.round((hz * fftSize) / sampleRate);
  const maxBin = fftSize / 2 - 1;
  return Math.max(0, Math.min(bin, maxBin));
}

/**
 * Builds the default set of frequency bands with bin indices computed from the
 * actual runtime sampleRate.
 *
 * Bands are defined for jazz instrument analysis:
 * - bass:       20–250 Hz   (upright bass body, kick fundamental)
 * - drums_low:  60–300 Hz   (kick attack, snare body)
 * - mid:        250–2000 Hz (piano, guitar, sax body)
 * - mid_high:   300–3000 Hz (brass presence, piano upper harmonics)
 * - drums_high: 2000–8000 Hz (hi-hat, snare crack, cymbal body)
 * - ride:       6000–10000 Hz (ride cymbal ping, shimmer)
 *
 * @param sampleRate - Actual sampleRate from audioCtx.sampleRate
 * @param fftSize - FFT size (4096 for ~21.5 Hz resolution at 44.1kHz)
 * @returns Array of FrequencyBand with computed lowBin/highBin indices
 */
export function buildDefaultBands(sampleRate: number, fftSize: number): FrequencyBand[] {
  const definitions: Array<{ name: string; lowHz: number; highHz: number }> = [
    { name: 'bass',       lowHz: 20,   highHz: 250  },
    { name: 'drums_low',  lowHz: 60,   highHz: 300  },
    { name: 'mid',        lowHz: 250,  highHz: 2000 },
    { name: 'mid_high',   lowHz: 300,  highHz: 3000 },
    { name: 'drums_high', lowHz: 2000, highHz: 8000 },
    { name: 'ride',       lowHz: 6000, highHz: 10000 },
  ];

  const bands: FrequencyBand[] = definitions.map(({ name, lowHz, highHz }) => ({
    name,
    lowHz,
    highHz,
    lowBin:  hzToBin(lowHz,  sampleRate, fftSize),
    highBin: hzToBin(highHz, sampleRate, fftSize),
  }));

  // Log band configuration so we can verify correct sampleRate is being used
  console.log(
    `[FrequencyBandSplitter] Built bands at sampleRate=${sampleRate} Hz, fftSize=${fftSize}:`
  );
  bands.forEach(({ name, lowHz, highHz, lowBin, highBin }) => {
    console.log(
      `  ${name.padEnd(12)} ${String(lowHz).padStart(5)} – ${String(highHz).padEnd(5)} Hz  →  bins ${lowBin} – ${highBin}`
    );
  });

  return bands;
}

/**
 * Computes the average energy for a single frequency band from raw FFT data.
 *
 * @param freqData - Uint8Array from analyser.getByteFrequencyData() (values 0–255)
 * @param band - FrequencyBand with lowBin/highBin indices
 * @returns Normalized energy in [0.0, 1.0]; returns 0 if band has no valid bins
 */
export function getBandEnergy(freqData: Uint8Array, band: FrequencyBand): number {
  const { lowBin, highBin } = band;

  if (lowBin >= highBin) {
    return 0;
  }

  let sum = 0;
  for (let i = lowBin; i <= highBin; i++) {
    sum += freqData[i];
  }

  const count = highBin - lowBin + 1;
  return sum / (count * 255);
}
