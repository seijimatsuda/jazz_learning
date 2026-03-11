import { useEffect } from 'react';
import { useAudioRef } from './hooks/useAudioRef';
import { FileUpload } from './components/FileUpload';
import { TransportControls } from './components/TransportControls';
import { Timeline } from './components/Timeline';
import { useAppStore } from './store/useAppStore';
import { runCalibrationPass } from './audio/CalibrationPass';

function App() {
  const audioStateRef = useAudioRef();
  const { isFileLoaded, fileName, isCalibrating, setCalibrating } = useAppStore();

  // Auto-run calibration after file upload
  useEffect(() => {
    if (!isFileLoaded) return;

    const state = audioStateRef.current;

    // Don't re-run if already calibrated (e.g. hot reload)
    if (state.isCalibrated) return;

    // Guard: must have all required state before calibrating
    if (!state.audioCtx || !state.transport.buffer || !state.rawAnalyser || !state.rawFreqData) {
      console.warn('[App] File loaded but audio state not ready for calibration.');
      return;
    }

    runCalibrationPass(state, setCalibrating).catch((err) => {
      console.error('[App] Calibration failed:', err);
      setCalibrating(false);
    });
  }, [isFileLoaded, audioStateRef, setCalibrating]);

  return (
    <div
      className="min-h-screen flex flex-col items-center gap-8 py-10 px-4"
      style={{ backgroundColor: '#0a0a0f' }}
    >
      <h1 className="text-4xl font-bold text-white tracking-wide text-center">
        Jazz Communication Visualizer
      </h1>

      {/* File upload — always visible */}
      <FileUpload audioStateRef={audioStateRef} />

      {/* File info + transport — shown after load */}
      {isFileLoaded && (
        <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
          {/* File name */}
          <div
            className="px-6 py-3 rounded-lg text-center w-full"
            style={{ backgroundColor: '#13131f', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            <p className="text-white font-medium text-base truncate" title={fileName ?? ''}>
              {fileName}
            </p>
          </div>

          {/* Calibration status */}
          {isCalibrating && (
            <p className="text-sm font-medium animate-pulse" style={{ color: '#a78bfa' }}>
              Calibrating... (3 seconds)
            </p>
          )}

          {/* Transport controls — enabled only after calibration */}
          {!isCalibrating && (
            <TransportControls audioStateRef={audioStateRef} />
          )}

          {/* Timeline scrubber — full width */}
          {!isCalibrating && (
            <Timeline audioStateRef={audioStateRef} />
          )}
        </div>
      )}
    </div>
  );
}

export default App;
