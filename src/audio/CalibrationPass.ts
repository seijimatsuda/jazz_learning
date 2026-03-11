/**
 * CalibrationPass.ts — 3-second silent calibration pass.
 *
 * Runs immediately after file load, before playback starts.
 * Uses the rawAnalyser as a silent measurement tap (NOT connected to destination).
 * Computes per-band peak, average, and derived thresholds for role classification.
 *
 * Thresholds computed:
 *   solo    = 0.75 * peak  — instrument is dominant
 *   comping = 0.40 * peak  — instrument is accompanying
 *   holding = 0.10 * peak  — instrument is sustaining/resting
 */

import type { AudioStateRef, CalibrationThresholds } from './types';
import { getBandEnergy } from './FrequencyBandSplitter';

const CALIBRATION_DURATION_S = 3;
const SAMPLE_INTERVAL_MS = 50;

/**
 * Runs a silent 3-second calibration pass over the loaded audio buffer.
 *
 * Creates a temporary AudioBufferSourceNode connected ONLY to rawAnalyser
 * (not to destination — the user hears nothing). Samples per-band energy
 * at 50ms intervals, then computes thresholds.
 *
 * @param audioStateRef - Ref containing audioCtx, rawAnalyser, bands, rawFreqData
 * @param setCalibrating - Zustand setter to update UI calibration state
 * @returns Resolved CalibrationThresholds[] stored on audioStateRef.calibration
 * @throws If audioCtx, rawAnalyser, transport.buffer, or bands are not initialized
 */
export async function runCalibrationPass(
  audioStateRef: AudioStateRef,
  setCalibrating: (val: boolean) => void
): Promise<CalibrationThresholds[]> {
  const { audioCtx, rawAnalyser, transport, bands, rawFreqData } = audioStateRef;

  if (!audioCtx) throw new Error('[CalibrationPass] audioCtx is null — call createAudioContext first.');
  if (!rawAnalyser) throw new Error('[CalibrationPass] rawAnalyser is null — call createDualAnalysers first.');
  if (!transport.buffer) throw new Error('[CalibrationPass] transport.buffer is null — load a file first.');
  if (!rawFreqData) throw new Error('[CalibrationPass] rawFreqData is null — call allocateTypedArrays first.');
  if (bands.length === 0) throw new Error('[CalibrationPass] bands array is empty — call buildDefaultBands first.');

  console.log('[CalibrationPass] Starting 3-second silent calibration pass...');
  setCalibrating(true);

  // Per-band accumulators
  const peaks = new Float32Array(bands.length);
  const sums = new Float32Array(bands.length);
  let sampleCount = 0;

  // Create a silent source: connects ONLY to rawAnalyser, NOT to destination
  const calibSource = audioCtx.createBufferSource();
  calibSource.buffer = transport.buffer;

  // Intentionally do NOT connect to audioCtx.destination — silent calibration tap
  calibSource.connect(rawAnalyser);

  // Use actual buffer duration if shorter than 3s (e.g. short test files)
  const calibDuration = Math.min(CALIBRATION_DURATION_S, transport.buffer.duration);

  return new Promise<CalibrationThresholds[]>((resolve) => {
    // Start silent playback from the beginning
    calibSource.start(0, 0);

    const intervalId = setInterval(() => {
      rawAnalyser.getByteFrequencyData(rawFreqData);

      for (let b = 0; b < bands.length; b++) {
        const energy = getBandEnergy(rawFreqData, bands[b]);
        if (energy > peaks[b]) peaks[b] = energy;
        sums[b] += energy;
      }
      sampleCount++;
    }, SAMPLE_INTERVAL_MS);

    // Stop after calibration duration
    const stopTimeoutId = setTimeout(() => {
      clearInterval(intervalId);

      try {
        calibSource.stop();
      } catch {
        // May already have stopped if buffer was shorter than calibDuration
      }

      // Disconnect silent tap to clean up node graph
      calibSource.disconnect();

      // Compute thresholds
      const thresholds: CalibrationThresholds[] = bands.map((band, b) => {
        const peak = peaks[b];
        const average = sampleCount > 0 ? sums[b] / sampleCount : 0;

        return {
          band: band.name,
          peak,
          average,
          solo:    0.75 * peak,
          comping: 0.40 * peak,
          holding: 0.10 * peak,
        };
      });

      // Store results on the ref
      audioStateRef.calibration = thresholds;
      audioStateRef.isCalibrated = true;

      setCalibrating(false);

      // Log calibration summary
      console.log(
        `[CalibrationPass] Calibration complete. Duration: ${calibDuration.toFixed(2)}s, ` +
        `Samples: ${sampleCount}, Bands: ${thresholds.length}`
      );
      thresholds.forEach(({ band, peak, average, solo, comping, holding }) => {
        console.log(
          `  ${band.padEnd(12)} peak=${peak.toFixed(3)}  avg=${average.toFixed(3)}  ` +
          `solo=${solo.toFixed(3)}  comp=${comping.toFixed(3)}  hold=${holding.toFixed(3)}`
        );
      });

      resolve(thresholds);
    }, calibDuration * 1000);

    // If buffer ends before calibDuration, clean up early
    calibSource.addEventListener('ended', () => {
      clearTimeout(stopTimeoutId);
      clearInterval(intervalId);

      // Only resolve if not already resolved by the main timeout
      // (the 'ended' event may fire slightly before or after the timeout)
      // We use a small guard: if sampleCount is 0, calibration produced no data
      if (sampleCount === 0) {
        console.warn('[CalibrationPass] Buffer ended before any samples were collected.');
      }
    });
  });
}
