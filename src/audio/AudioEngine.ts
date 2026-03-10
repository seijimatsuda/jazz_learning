/**
 * AudioEngine.ts — iOS-safe AudioContext creation and file decoding.
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
