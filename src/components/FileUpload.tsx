import { useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { createAudioContext, decodeAudioFile, createDualAnalysers, allocateTypedArrays } from '../audio/AudioEngine';
import { buildDefaultBands } from '../audio/FrequencyBandSplitter';
import { useAppStore } from '../store/useAppStore';

interface FileUploadProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
}

/**
 * loadAudioBuffer — programmatic audio loading for use outside the file picker.
 *
 * Accepts a pre-fetched ArrayBuffer and a display name.
 * Sets up audioStateRef identically to handleFileChange in FileUpload.
 *
 * NOTE: For iOS, the AudioContext must already exist on audioStateRef before calling this
 * (created inside a user gesture handler). This function does NOT create an AudioContext.
 */
export async function loadAudioBuffer(
  audioStateRef: MutableRefObject<AudioStateRef>,
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<void> {
  let audioCtx = audioStateRef.current.audioCtx;
  if (!audioCtx) {
    audioCtx = await createAudioContext();
    audioStateRef.current.audioCtx = audioCtx;
    audioStateRef.current.sampleRate = audioCtx.sampleRate;
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

  const { smoothed, raw } = createDualAnalysers(audioCtx, audioStateRef.current.fftSize);
  const { smoothedFreqData, rawFreqData, rawTimeData } = allocateTypedArrays(audioStateRef.current.fftSize);
  const bands = buildDefaultBands(audioCtx.sampleRate, audioStateRef.current.fftSize);

  audioStateRef.current.audioCtx = audioCtx;
  audioStateRef.current.sampleRate = audioCtx.sampleRate;
  audioStateRef.current.transport.buffer = audioBuffer;
  audioStateRef.current.transport.duration = audioBuffer.duration;
  audioStateRef.current.smoothedAnalyser = smoothed;
  audioStateRef.current.rawAnalyser = raw;
  audioStateRef.current.smoothedFreqData = smoothedFreqData;
  audioStateRef.current.rawFreqData = rawFreqData;
  audioStateRef.current.rawTimeData = rawTimeData;
  audioStateRef.current.bands = bands;

  useAppStore.getState().setFile(fileName, audioBuffer.duration);
}

/**
 * FileUpload — triggers AudioContext creation and file decode on click.
 *
 * iOS requirement: AudioContext creation and file input click MUST happen in the
 * same synchronous call stack initiated by the user's click event. Do NOT await
 * anything before calling fileInput.click() and createAudioContext().
 */
export function FileUpload({ audioStateRef }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFile = useAppStore((s) => s.setFile);

  /**
   * handleButtonClick — called synchronously from user's click gesture.
   *
   * We create the AudioContext HERE (same call stack as click) to satisfy
   * iOS Safari's user gesture requirement, then immediately open the file
   * picker. The AudioContext is stored on the ref so handleFileChange can
   * use it for decoding.
   */
  const handleButtonClick = () => {
    setError(null);

    // Pre-create AudioContext synchronously within user gesture.
    // iOS Safari requires this — if we await anything first, the gesture
    // is considered consumed and AudioContext creation will be blocked/silenced.
    const AudioContextClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      setError('AudioContext is not supported in this browser.');
      return;
    }

    // Create AudioContext NOW — inside the click handler (iOS-safe).
    // Store on ref so handleFileChange can reuse it for decoding.
    if (!audioStateRef.current.audioCtx) {
      const ctx = new AudioContextClass({ sampleRate: 44100 });
      audioStateRef.current.audioCtx = ctx;
      audioStateRef.current.sampleRate = ctx.sampleRate;
      console.log(`[FileUpload] AudioContext created in click handler — sampleRate: ${ctx.sampleRate}`);
    }

    // Open file picker immediately — same synchronous call stack as click.
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be reloaded if needed
    e.target.value = '';

    setIsLoading(true);
    setError(null);

    try {
      // Reuse the AudioContext pre-created in handleButtonClick (iOS-safe).
      // If none exists (shouldn't happen), create one as fallback.
      let audioCtx = audioStateRef.current.audioCtx;
      if (!audioCtx) {
        audioCtx = await createAudioContext();
        audioStateRef.current.audioCtx = audioCtx;
        audioStateRef.current.sampleRate = audioCtx.sampleRate;
      }
      // Resume if suspended (iOS may suspend between click and file selection)
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      const audioBuffer = await decodeAudioFile(audioCtx, file);

      // Create dual analysers (smoothed for viz, raw for transients)
      const { smoothed, raw } = createDualAnalysers(audioCtx, audioStateRef.current.fftSize);

      // Pre-allocate typed arrays — reused every animation frame to avoid GC pressure
      const { smoothedFreqData, rawFreqData, rawTimeData } = allocateTypedArrays(
        audioStateRef.current.fftSize
      );

      // Build frequency bands using actual sampleRate (may be 48000 on iOS)
      const bands = buildDefaultBands(audioCtx.sampleRate, audioStateRef.current.fftSize);

      // Update ref (no re-render)
      // NOTE: connectSourceToGraph is NOT called here — happens at play time (Plan 01-04)
      audioStateRef.current.audioCtx = audioCtx;
      audioStateRef.current.sampleRate = audioCtx.sampleRate;
      audioStateRef.current.transport.buffer = audioBuffer;
      audioStateRef.current.transport.duration = audioBuffer.duration;
      audioStateRef.current.smoothedAnalyser = smoothed;
      audioStateRef.current.rawAnalyser = raw;
      audioStateRef.current.smoothedFreqData = smoothedFreqData;
      audioStateRef.current.rawFreqData = rawFreqData;
      audioStateRef.current.rawTimeData = rawTimeData;
      audioStateRef.current.bands = bands;

      // Update Zustand for UI display (triggers re-render)
      setFile(file.name, audioBuffer.duration);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error loading audio file.';
      setError(message);
      console.error('[FileUpload]', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Hidden file input — accepts MP3 and WAV */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.flac"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Primary button */}
      <button
        onClick={handleButtonClick}
        disabled={isLoading}
        className="
          px-8 py-3
          rounded-lg
          text-white font-semibold text-lg tracking-wide
          transition-all duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-indigo-400
        "
        style={{
          backgroundColor: isLoading ? '#1e1e2e' : '#4f46e5',
          border: '1px solid rgba(99,102,241,0.5)',
        }}
        aria-label="Load audio file"
      >
        {isLoading ? 'Decoding...' : 'Load Audio File'}
      </button>

      {/* Supported formats hint */}
      <p className="text-xs" style={{ color: '#6b7280' }}>
        MP3 or WAV
      </p>

      {/* Error display */}
      {error !== null && (
        <p
          className="text-sm text-center max-w-xs px-4 py-2 rounded"
          style={{ color: '#f87171', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
