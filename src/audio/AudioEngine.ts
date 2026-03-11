/**
 * AudioEngine.ts — iOS-safe AudioContext creation, file decoding, and dual AnalyserNode setup.
 *
 * CRITICAL iOS rules:
 * - createAudioContext MUST be called from within a user gesture handler
 * - Use 'click' event, NOT 'touchstart'
 * - Always read back audioCtx.sampleRate after creation (iOS may ignore the
 *   constructor sampleRate option and return 48000 instead of 44100)
 */

/**
 * Creates an AudioContext in an iOS-safe way.
 *
 * Must be called directly from a click event handler — not in a setTimeout,
 * not in a Promise.then, not in an async function that was awaited before
 * reaching this call. The user gesture must still be on the call stack.
 *
 * @returns The newly created (and resumed) AudioContext
 * @throws Error if AudioContext is not supported
 */
export async function createAudioContext(): Promise<AudioContext> {
  const AudioContextClass =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error('AudioContext is not supported in this browser.');
  }

  // Request 44100 Hz — iOS Safari may ignore this and create at 48000 Hz.
  // Always read back audioCtx.sampleRate instead of assuming.
  const audioCtx = new AudioContextClass({ sampleRate: 44100 });

  // iOS Safari starts AudioContext in 'suspended' state on first creation.
  // resume() must be called within the same user gesture.
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  // Log actual sample rate — may differ from 44100 on iOS/Android
  console.log(
    `[AudioEngine] AudioContext created. Requested: 44100 Hz, Actual: ${audioCtx.sampleRate} Hz, State: ${audioCtx.state}`
  );

  // Watch for interruptions (phone call, tab background on iOS, etc.)
  audioCtx.addEventListener('statechange', () => {
    console.log(`[AudioEngine] AudioContext state changed to: ${audioCtx.state}`);
    if (audioCtx.state === 'interrupted') {
      console.warn('[AudioEngine] AudioContext interrupted (iOS). Will resume on next user gesture.');
    }
  });

  return audioCtx;
}

/**
 * Decodes an audio File (MP3 or WAV) into an AudioBuffer.
 *
 * @param audioCtx - An active AudioContext (must be 'running')
 * @param file - The audio file selected by the user
 * @returns Decoded AudioBuffer ready for playback or analysis
 * @throws Descriptive Error if reading or decoding fails
 */
export async function decodeAudioFile(audioCtx: AudioContext, file: File): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;

  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    throw new Error(
      `Failed to read file "${file.name}" into memory: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let audioBuffer: AudioBuffer;

  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    throw new Error(
      `Failed to decode audio data from "${file.name}". ` +
        `Ensure the file is a valid MP3 or WAV. ` +
        `Browser error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  console.log(
    `[AudioEngine] Decoded "${file.name}": ` +
      `${audioBuffer.duration.toFixed(2)}s, ` +
      `${audioBuffer.numberOfChannels} ch, ` +
      `${audioBuffer.sampleRate} Hz`
  );

  return audioBuffer;
}

/**
 * Creates a dual AnalyserNode pair: one smoothed (for visualization) and one
 * raw (for transient/beat detection).
 *
 * - smoothed: smoothingTimeConstant=0.8 — exponential moving average, good for
 *   stable frequency display. minDecibels/maxDecibels set to maximize dynamic range.
 * - raw: smoothingTimeConstant=0.0 — no smoothing, each frame reflects instantaneous
 *   FFT snapshot. Used for onset and transient detection.
 *
 * Neither analyser is connected to destination here — use connectSourceToGraph for that.
 *
 * @param audioCtx - Active AudioContext
 * @param fftSize - FFT size (e.g. 4096); determines frequency resolution
 * @returns Object containing both AnalyserNodes
 */
export function createDualAnalysers(
  audioCtx: AudioContext,
  fftSize: number
): { smoothed: AnalyserNode; raw: AnalyserNode } {
  const smoothed = audioCtx.createAnalyser();
  smoothed.fftSize = fftSize;
  smoothed.smoothingTimeConstant = 0.8;
  smoothed.minDecibels = -90;
  smoothed.maxDecibels = -10;

  const raw = audioCtx.createAnalyser();
  raw.fftSize = fftSize;
  raw.smoothingTimeConstant = 0.0;
  // raw uses default minDecibels/maxDecibels (-100, -30)

  console.log(
    `[AudioEngine] Created dual analysers: fftSize=${fftSize}, ` +
      `smoothed.smoothing=0.8, raw.smoothing=0.0`
  );

  return { smoothed, raw };
}

/**
 * Connects an AudioBufferSourceNode to both analysers.
 *
 * Graph topology:
 *   source → smoothed → destination   (smoothed drives the output speakers)
 *   source → raw                      (raw is tap-only, NOT connected to destination)
 *
 * raw must NOT be connected to destination — it's a silent measurement tap.
 * Connecting it would double the audio output volume.
 *
 * @param audioCtx - Active AudioContext
 * @param source - AudioBufferSourceNode to connect
 * @param smoothed - Smoothed AnalyserNode (connected to destination)
 * @param raw - Raw AnalyserNode (silent tap, NOT to destination)
 */
export function connectSourceToGraph(
  audioCtx: AudioContext,
  source: AudioBufferSourceNode,
  smoothed: AnalyserNode,
  raw: AnalyserNode
): void {
  source.connect(smoothed);
  smoothed.connect(audioCtx.destination);
  source.connect(raw);
  // raw is intentionally NOT connected to destination

  console.log('[AudioEngine] Source connected: source→smoothed→destination, source→raw (silent tap)');
}

/**
 * Returns the current playback position in seconds.
 *
 * - If playing: pauseOffset + elapsed time since source.start() was called
 * - If paused:  pauseOffset (last known position)
 *
 * Clamped to [0, duration] to prevent out-of-range values.
 *
 * @param audioCtx - Active AudioContext (needed for currentTime)
 * @param transport - TransportState from AudioStateRef
 * @returns Current position in seconds
 */
export function getCurrentPosition(
  audioCtx: AudioContext,
  transport: { startTime: number; pauseOffset: number; isPlaying: boolean; duration: number }
): number {
  let position: number;
  if (transport.isPlaying) {
    position = transport.pauseOffset + (audioCtx.currentTime - transport.startTime);
  } else {
    position = transport.pauseOffset;
  }
  return Math.max(0, Math.min(position, transport.duration));
}

/**
 * Pre-allocates typed arrays for FFT frequency and time domain data.
 *
 * These arrays are reused every animation frame to avoid GC pressure.
 * All arrays are sized to fftSize/2 (the number of frequency bins in a
 * getByteFrequencyData result).
 *
 * @param fftSize - FFT size (e.g. 4096); arrays will have fftSize/2 elements
 * @returns Object with three pre-allocated Uint8Arrays
 */
export function allocateTypedArrays(fftSize: number): {
  smoothedFreqData: Uint8Array;
  rawFreqData: Uint8Array;
  rawTimeData: Uint8Array;
} {
  const binCount = fftSize / 2;
  return {
    smoothedFreqData: new Uint8Array(binCount),
    rawFreqData:      new Uint8Array(binCount),
    rawTimeData:      new Uint8Array(binCount),
  };
}
