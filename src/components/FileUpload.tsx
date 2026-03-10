import { useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { createAudioContext, decodeAudioFile } from '../audio/AudioEngine';
import { useAppStore } from '../store/useAppStore';

interface FileUploadProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
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
      // createAudioContext is async (calls resume()) but we are now past the
      // file selection gesture — this is fine because the AudioContext was
      // pre-authorized by the click handler above.
      // If a previous context exists, close it first.
      if (audioStateRef.current.audioCtx) {
        await audioStateRef.current.audioCtx.close();
        audioStateRef.current.audioCtx = null;
      }

      const audioCtx = await createAudioContext();
      const audioBuffer = await decodeAudioFile(audioCtx, file);

      // Update ref (no re-render)
      audioStateRef.current.audioCtx = audioCtx;
      audioStateRef.current.sampleRate = audioCtx.sampleRate;
      audioStateRef.current.transport.buffer = audioBuffer;
      audioStateRef.current.transport.duration = audioBuffer.duration;

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
        accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
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
