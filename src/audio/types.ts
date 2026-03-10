// FrequencyBand defines a named frequency range with bin indices (computed at runtime from sampleRate)
export interface FrequencyBand {
  name: string;           // e.g. 'bass', 'midLow', 'mid', 'midHigh', 'high'
  lowHz: number;          // lower frequency bound in Hz
  highHz: number;         // upper frequency bound in Hz
  lowBin: number;         // computed FFT bin index (set after AudioContext creation)
  highBin: number;        // computed FFT bin index (set after AudioContext creation)
}

// CalibrationThresholds per frequency band — set by 3-second calibration pass
export interface CalibrationThresholds {
  band: string;
  peak: number;
  average: number;
  solo: number;           // 0.75 * peak
  comping: number;        // 0.40 * peak
  holding: number;        // 0.10 * peak
}

// Transport state for play/pause/seek with AudioBufferSourceNode
export interface TransportState {
  buffer: AudioBuffer | null;
  sourceNode: AudioBufferSourceNode | null;
  startTime: number;      // audioCtx.currentTime when play() was called
  pauseOffset: number;    // accumulated playback position in seconds
  isPlaying: boolean;
  duration: number;       // total track duration in seconds
}

// The main audio state ref — lives in useRef, NEVER in React state or Zustand
export interface AudioStateRef {
  audioCtx: AudioContext | null;
  sampleRate: number;                    // read-back value from audioCtx.sampleRate
  fftSize: number;                       // 4096
  transport: TransportState;
  smoothedAnalyser: AnalyserNode | null;
  rawAnalyser: AnalyserNode | null;
  smoothedFreqData: Uint8Array | null;   // pre-allocated typed array
  rawFreqData: Uint8Array | null;        // pre-allocated typed array
  rawTimeData: Uint8Array | null;        // pre-allocated typed array
  bands: FrequencyBand[];
  calibration: CalibrationThresholds[];
  isCalibrated: boolean;
  tensionHeatmap: Float32Array | null;   // pre-computed on load
}

// Factory function for initial AudioStateRef
export function createInitialAudioState(): AudioStateRef {
  return {
    audioCtx: null,
    sampleRate: 44100,
    fftSize: 4096,
    transport: {
      buffer: null,
      sourceNode: null,
      startTime: 0,
      pauseOffset: 0,
      isPlaying: false,
      duration: 0,
    },
    smoothedAnalyser: null,
    rawAnalyser: null,
    smoothedFreqData: null,
    rawFreqData: null,
    rawTimeData: null,
    bands: [],
    calibration: [],
    isCalibrated: false,
    tensionHeatmap: null,
  };
}
