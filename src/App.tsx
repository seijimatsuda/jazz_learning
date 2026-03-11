import { useEffect, useState } from 'react';
import { useAudioRef } from './hooks/useAudioRef';
import { FileUpload } from './components/FileUpload';
import { TransportControls } from './components/TransportControls';
import { Timeline } from './components/Timeline';
import { VisualizerCanvas } from './components/VisualizerCanvas';
import { BandSetupPanel } from './components/BandSetupPanel';
import { ChordDisplay } from './components/ChordDisplay';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { ChordLogPanel } from './components/ChordLogPanel';
import { useAppStore } from './store/useAppStore';
import { runCalibrationPass } from './audio/CalibrationPass';
import { computeTensionHeatmap } from './audio/TensionHeatmap';
import { initAnalysisState } from './audio/InstrumentActivityScorer';
import type { InstrumentName } from './audio/InstrumentActivityScorer';
import { initChordDetector, initChordState } from './audio/ChordDetector';
import { initTensionState } from './audio/TensionScorer';
import { initBeatState } from './audio/DrumTransientDetector';

function App() {
  const audioStateRef = useAudioRef();
  const { isFileLoaded, fileName, isCalibrating, setCalibrating } = useAppStore();
  // Increment to force Timeline re-render after heatmap is ready
  const [heatmapVersion, setHeatmapVersion] = useState(0);

  // Auto-run calibration then heatmap computation after file upload
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

    const buffer = state.transport.buffer;
    const sampleRate = state.sampleRate;

    runCalibrationPass(state, setCalibrating)
      .then(() => {
        // Initialize Phase 2 analysis state with lineup from Zustand BandSetupPanel
        const lineup: InstrumentName[] = useAppStore.getState().lineup as InstrumentName[];
        audioStateRef.current.analysis = initAnalysisState(lineup, audioStateRef.current.fftSize);
        audioStateRef.current.analysis.isAnalysisActive = true;
        console.log('[App] Analysis state initialized for lineup:', lineup);

        // Initialize Phase 3: chord detector, chord state, tension state
        const fftSize = audioStateRef.current.fftSize;
        initChordDetector(sampleRate, fftSize);
        audioStateRef.current.chord   = initChordState();
        audioStateRef.current.tension = initTensionState();
        console.log('[App] Phase 3 chord/tension state initialized.');

        // Initialize Phase 4: beat detection and pocket scoring state
        audioStateRef.current.beat = initBeatState();
        console.log('[App] Phase 4 beat state initialized.');

        return computeTensionHeatmap(buffer, sampleRate);
      })
      .then((heatmap) => {
        audioStateRef.current.tensionHeatmap = heatmap;
        // Bump version to trigger Timeline re-render so it reads the new heatmap
        setHeatmapVersion((v) => v + 1);
        console.log('[App] Tension heatmap stored on audioStateRef.');
      })
      .catch((err) => {
        console.error('[App] Calibration or heatmap failed:', err);
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

      {/* Band setup — visible before file load; locked after */}
      <BandSetupPanel />

      {/* File upload — always visible */}
      <FileUpload audioStateRef={audioStateRef} />

      {/* Visualizer canvas — shown after file load (animates even during calibration) */}
      {isFileLoaded && (
        <div className="w-full max-w-4xl">
          <VisualizerCanvas audioStateRef={audioStateRef} />
        </div>
      )}

      {/* Node detail panel — shown after calibration completes, when a node is selected */}
      {isFileLoaded && !isCalibrating && (
        <div className="w-full max-w-2xl flex justify-center">
          <NodeDetailPanel audioStateRef={audioStateRef} />
        </div>
      )}

      {/* Chord display — shown after calibration completes */}
      {isFileLoaded && !isCalibrating && (
        <div className="w-full max-w-2xl">
          <ChordDisplay />
        </div>
      )}

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

          {/* Timeline scrubber — full width, keyed by heatmapVersion to re-read ref after heatmap ready */}
          {!isCalibrating && (
            <Timeline key={heatmapVersion} audioStateRef={audioStateRef} />
          )}

          {/* Chord log drawer — below timeline, expandable */}
          {!isCalibrating && (
            <ChordLogPanel audioStateRef={audioStateRef} />
          )}
        </div>
      )}
    </div>
  );
}

export default App;
