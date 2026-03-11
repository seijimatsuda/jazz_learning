// RoleLabel: per-instrument role classification output
export type RoleLabel = 'soloing' | 'comping' | 'holding' | 'silent';

// ChordFunction: harmonic function of a chord in context (Phase 3)
export type ChordFunction = 'tonic' | 'subdominant' | 'dominant' | 'altered';

// ChordState: per-tick chord detection state (Phase 3)
// All Float32Array buffers are pre-allocated in initChordState — zero allocations after init.
export interface ChordState {
  chromaBuffer: Float32Array;       // length 12, pre-allocated; raw chroma from Meyda each tick
  chromaHistory: Float32Array;      // length 36 (3 frames x 12), pre-allocated; ring buffer for 300ms smoothing
  chromaHistoryHead: number;        // ring buffer write index 0-2
  smoothedChroma: Float32Array;     // length 12, pre-allocated; averaged over 3-frame window
  pendingChordIdx: number;          // index into CHORD_TEMPLATES, -1 = none
  pendingHoldCount: number;         // ticks the pending chord has been stable
  displayedChordIdx: number;        // -1 = no chord detected; updated after 200ms hold gate
  confidenceGap: number;            // best - second-best cosine sim score (CHORD-04)
  chordLog: Array<{                 // CHORD-11: timestamped chord history
    audioTimeSec: number;
    chordIdx: number;
    confidenceGap: number;
  }>;
  chordLogMaxLen: number;           // cap at 1000 entries
}

// TensionState: harmonic tension tracking state (Phase 3)
// All Float32Array buffers are pre-allocated — zero allocations after init.
export interface TensionState {
  currentTension: number;           // 0.0-1.0, lerp-smoothed
  tensionHistory: Float32Array;     // length 32 (3s at 10fps + margin), pre-allocated
  tensionHistoryHead: number;       // ring buffer write index
  tensionHistorySamples: number;    // how many valid samples written
}

// BeatState: beat detection and pocket scoring state (Phase 4)
// All Float32Array buffers are pre-allocated in initBeatState — zero allocations after init.
export interface BeatState {
  // Onset strength signal (OSS) ring buffer — 6 seconds at 10fps = 60 samples
  ossBuffer: Float32Array;          // length 60
  ossHead: number;                  // ring buffer write index
  ossSamples: number;               // valid sample count (capped at 60)

  // Drum flux adaptive threshold window — 2 seconds at 10fps = 20 samples
  drumFluxBuffer: Float32Array;     // length 20 — rolling drum flux values
  drumFluxHead: number;
  drumFluxSamples: number;

  // Bass flux buffer for bass onset adaptive threshold — same pattern
  bassFluxBuffer: Float32Array;     // length 20

  // IOI tracking — last 20 drum onset timestamps (seconds, from audioCtx.currentTime)
  drumOnsetTimes: Float32Array;     // length 20, pre-allocated
  drumOnsetHead: number;
  drumOnsetCount: number;

  // Last detected onset times (scalars, not ring buffers)
  lastBassOnsetSec: number;         // -1 if none
  lastDrumOnsetSec: number;         // -1 if none

  // Autocorrelation output — length 30 (half of OSS buffer)
  acBuffer: Float32Array;           // length 30, pre-allocated

  // Pocket score ring buffer — 8 beats
  pocketBuffer: Float32Array;       // length 8
  pocketHead: number;
  pocketSamples: number;

  // BPM update timing
  ticksSinceAcUpdate: number;       // counts to 20 -> 2 seconds

  // Previous tick values for delta/rising-edge detection
  prevDrumFlux: number;
  prevBassRms: number;

  // IOI buffer for CV computation — pre-allocated
  ioiBuffer: Float32Array;          // length 19 (max IOIs from 20 onsets)

  // BPM median smoothing — last 3 estimates
  bpmHistory: Float32Array;         // length 3
  bpmHistoryHead: number;
  bpmHistorySamples: number;

  // Outputs (read by Zustand bridge and CanvasRenderer)
  bpm: number | null;               // null when rubato/low confidence
  ioiCV: number;                    // 0.0+ IOI coefficient of variation
  pocketScore: number;              // 0.0-1.0
  timingOffsetMs: number;           // positive = drums ahead
  lastDownbeatSec: number;          // audioCtx.currentTime of last detected beat 1
  beatCounter: number;              // 0-3, increments on drum onset
}

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
  chord: ChordState | null;             // Phase 3: chord detection state
  tension: TensionState | null;         // Phase 3: harmonic tension state
  beat: BeatState | null;              // Phase 4: beat detection and pocket scoring state
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
    chord: null,
    tension: null,
    beat: null,
  };
}
