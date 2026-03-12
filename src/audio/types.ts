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

// DisambiguationState: stateful buffers for instrument disambiguation (Phase 12)
// All Float32Array buffers are pre-allocated in initDisambiguationState — zero allocations after init.
export interface DisambiguationState {
  tremoloRmsBuffer: Float32Array;   // length 20 (2s at 10fps)
  tremoloRmsHead: number;
  tremoloRmsSamples: number;
  flatnessBuffer: Float32Array;     // length 10 (1s at 10fps)
  flatnessHead: number;
  flatnessSamples: number;
  onsetBuffer: Float32Array;        // length 20 (onset detection for trombone/bass)
  onsetBufferHead: number;
  onsetBufferSamples: number;
  tuttiFrameCount: number;
  isTutti: boolean;
  confidence: Record<string, number>; // key: 'trombone_bass', etc.
}

export function initDisambiguationState(): DisambiguationState {
  return {
    tremoloRmsBuffer: new Float32Array(20),
    tremoloRmsHead: 0,
    tremoloRmsSamples: 0,
    flatnessBuffer: new Float32Array(10),
    flatnessHead: 0,
    flatnessSamples: 0,
    onsetBuffer: new Float32Array(20),
    onsetBufferHead: 0,
    onsetBufferSamples: 0,
    tuttiFrameCount: 0,
    isTutti: false,
    confidence: {},
  };
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
  lastSyncEventSec: number;         // audioCtx.currentTime of last confirmed sync pair, -1 if none
}

// PitchState: per-instrument pitch detection state (Phase 8)
// All Float32Array buffers are pre-allocated in initInstrumentPitchState — zero allocations after init.
export interface InstrumentPitchState {
  pitchHz: number;              // current detected pitch, -1 if none
  prevPitchHz: number;          // previous tick's pitch
  stablePitchHz: number;        // stable pitch when isMelodic, -1 otherwise
  pitchFrameCount: number;      // consecutive frames with matching pitch
  isMelodic: boolean;           // true when pitchFrameCount >= 3
  correlationBuffer: Float32Array; // pre-allocated, length = fftSize
}

/**
 * PitchAnalysisState: holds per-instrument pitch detection state for all melodic
 * instruments in the current lineup. The instruments field is a dynamic Record
 * keyed by instrument name — not limited to keyboard/guitar (v1.1 generalization).
 */
export interface PitchAnalysisState {
  instruments: Record<string, InstrumentPitchState>;
}

// CallResponseEntry: a single call-and-response event (Phase 8)
export interface CallResponseEntry {
  callSec: number;       // audioCtx.currentTime when keyboard went melodic
  responseSec: number;   // audioCtx.currentTime when guitar responded
  gapSec: number;        // responseSec - callSec
}

// CallResponseState: sliding window state for call-response detection (Phase 8)
export interface CallResponseState {
  lastKbMelodicSec: number;          // -1 = no active call
  lastDetectedResponseSec: number;   // debounce: don't log same response twice
}

// InstrumentAnalysis: per-instrument analysis state, updated at 10fps
export interface InstrumentAnalysis {
  instrument: string;           // 'bass' | 'drums' | 'keyboard' | 'guitar'
  bandNames: string[];          // which FrequencyBand names this instrument owns
  activityScore: number;        // 0.0–1.0, updated at 10fps (legacy — will be phased out after disambiguation integration)
  rawActivityScore: number;     // pre-disambiguation score — used by correlator and role classifier
  displayActivityScore: number; // post-disambiguation score — used by canvas and Zustand
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
  prevRawFreqData: Uint8Array<ArrayBuffer>;          // pre-allocated for spectral flux (fftSize/2)
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
  smoothedFreqData: Uint8Array<ArrayBuffer> | null;   // pre-allocated typed array
  rawFreqData: Uint8Array<ArrayBuffer> | null;        // pre-allocated typed array
  rawTimeData: Uint8Array<ArrayBuffer> | null;        // pre-allocated typed array
  bands: FrequencyBand[];
  calibration: CalibrationThresholds[];
  isCalibrated: boolean;
  tensionHeatmap: Float32Array | null;   // pre-computed on load
  analysis: AnalysisState | null;        // Phase 2: per-instrument activity and role state
  chord: ChordState | null;             // Phase 3: chord detection state
  tension: TensionState | null;         // Phase 3: harmonic tension state
  beat: BeatState | null;              // Phase 4: beat detection and pocket scoring state
  pitch: PitchAnalysisState | null;    // Phase 8: pitch detection for keyboard and guitar
  callResponse: CallResponseState | null; // Phase 8: call-and-response detection state
  disambiguation: DisambiguationState | null; // Phase 12: disambiguation engine state
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
    pitch: null,
    callResponse: null,
    disambiguation: null,
  };
}
