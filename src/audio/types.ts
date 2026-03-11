// RoleLabel: per-instrument role classification output
export type RoleLabel = 'soloing' | 'comping' | 'holding' | 'silent';

// InstrumentAnalysis: per-instrument analysis state, updated at 10fps
export interface InstrumentAnalysis {
  instrument: string;           // 'bass' | 'drums' | 'keyboard' | 'guitar'
  bandNames: string[];          // which FrequencyBand names this instrument owns
  activityScore: number;        // 0.0–1.0, updated at 10fps
  role: RoleLabel;              // current role label
  roleSinceSec: number;         // audioCtx.currentTime when this role started
  historyBuffer: Float32Array;  // length 100, circular ring buffer (10s * 10fps)
  historyHead: number;          // write index into historyBuffer
  historySamples: number;       // how many valid samples written (capped at 100)
  timeInRole: Record<RoleLabel, number>; // cumulative seconds in each role
}

// AnalysisState: top-level analysis state container on AudioStateRef
export interface AnalysisState {
  instruments: InstrumentAnalysis[];
  edgeWeights: Record<string, number>;  // key: 'instrA_instrB' (alphabetical), value: Pearson r
  isAnalysisActive: boolean;
  lastAnalysisMs: number;               // performance.now() of last 10fps tick
  prevRawFreqData: Uint8Array;          // pre-allocated for spectral flux (fftSize/2)
  rawTimeDataFloat: Float32Array;       // pre-allocated for Meyda ZCR (fftSize)
}

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
  analysis: AnalysisState | null;        // Phase 2: per-instrument activity and role state
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
    analysis: null,
  };
}
