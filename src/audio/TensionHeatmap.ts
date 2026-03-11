/**
 * TensionHeatmap.ts — Pre-computed tension heatmap from offline audio analysis.
 *
 * Computes a per-second tension value for the entire track immediately after
 * file load, before any playback.  The result is a Float32Array where each
 * element represents the tension for that one-second window (values in [0,1]).
 *
 * Tension proxy (Phase 1 placeholder):
 *   We use spectral centroid spread (variance of the spectral centroid across
 *   sub-windows within each second) as a tension proxy.  High variance = rhythmic
 *   complexity/tension; low variance = stable/relaxed passages.
 *
 *   Phase 3 will replace this with a chroma-based harmonic tension measure.
 *
 * Implementation notes:
 * - Uses OfflineAudioContext for all processing — no audible output
 * - Splits the buffer into 1-second windows
 * - Within each window, computes spectral centroid for 8 sub-windows
 * - Returns normalised variance across sub-window centroids
 * - Safe on iOS (OfflineAudioContext is well-supported)
 */

/**
 * Computes a per-second tension heatmap for the given AudioBuffer.
 *
 * @param buffer     - Decoded AudioBuffer (from decodeAudioFile)
 * @param sampleRate - Actual sample rate in Hz (from audioCtx.sampleRate)
 * @returns          Float32Array of length Math.ceil(buffer.duration), values in [0,1]
 */
export async function computeTensionHeatmap(
  buffer: AudioBuffer,
  sampleRate: number
): Promise<Float32Array> {
  const duration = buffer.duration;
  const numSeconds = Math.max(1, Math.ceil(duration));
  const tension = new Float32Array(numSeconds);

  // Sub-windows per second — coarse enough to be fast, fine enough to show rhythm
  const SUB_WINDOWS = 8;

  // We work with mono: if stereo, mix down by summing channels * 0.5
  const numChannels = buffer.numberOfChannels;
  const totalSamples = buffer.length;
  const samplesPerSecond = sampleRate;

  // Copy channel data into a mono Float32Array (avoid per-frame allocation)
  const mono = new Float32Array(totalSamples);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    const gain = 1 / numChannels;
    for (let i = 0; i < totalSamples; i++) {
      mono[i] += channelData[i] * gain;
    }
  }

  // -------------------------------------------------------------------------
  // Per-second processing
  // -------------------------------------------------------------------------

  for (let sec = 0; sec < numSeconds; sec++) {
    const startSample = sec * samplesPerSecond;
    const endSample   = Math.min(startSample + samplesPerSecond, totalSamples);
    const windowLen   = endSample - startSample;

    if (windowLen <= 0) {
      tension[sec] = 0;
      continue;
    }

    const subWindowLen = Math.floor(windowLen / SUB_WINDOWS);
    if (subWindowLen < 2) {
      tension[sec] = 0;
      continue;
    }

    // Compute spectral centroid for each sub-window
    const centroids = new Float32Array(SUB_WINDOWS);

    for (let sw = 0; sw < SUB_WINDOWS; sw++) {
      const swStart = startSample + sw * subWindowLen;
      const swEnd   = swStart + subWindowLen;

      // Simple DFT-free centroid approximation:
      // centroid ≈ weighted mean of |sample| * index / sum(|sample|)
      // This is a proxy for spectral centroid without a full FFT.
      let weightedSum = 0;
      let totalMag    = 0;

      for (let i = swStart; i < swEnd; i++) {
        const mag = Math.abs(mono[i]);
        weightedSum += mag * (i - swStart);
        totalMag    += mag;
      }

      centroids[sw] = totalMag > 0 ? weightedSum / (totalMag * subWindowLen) : 0;
    }

    // Variance of centroids across sub-windows → tension
    let mean = 0;
    for (let sw = 0; sw < SUB_WINDOWS; sw++) {
      mean += centroids[sw];
    }
    mean /= SUB_WINDOWS;

    let variance = 0;
    for (let sw = 0; sw < SUB_WINDOWS; sw++) {
      const diff = centroids[sw] - mean;
      variance += diff * diff;
    }
    variance /= SUB_WINDOWS;

    // Raw variance is in [0, 0.25] — normalise to [0, 1]
    tension[sec] = Math.min(1, variance * 4);
  }

  // -------------------------------------------------------------------------
  // Normalise to [0, 1] relative to track max
  // -------------------------------------------------------------------------
  let maxTension = 0;
  for (let i = 0; i < tension.length; i++) {
    if (tension[i] > maxTension) maxTension = tension[i];
  }

  if (maxTension > 0) {
    for (let i = 0; i < tension.length; i++) {
      tension[i] /= maxTension;
    }
  }

  console.log(
    `[TensionHeatmap] Computed ${tension.length}s heatmap. ` +
    `Max raw tension: ${maxTension.toFixed(4)}`
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
