import { create } from 'zustand';

interface AppState {
  // File state
  fileName: string | null;
  isFileLoaded: boolean;

  // UI state (not audio hot-path — audio state lives in useRef)
  isCalibrating: boolean;
  currentTime: number;        // updated at ~10fps for UI display, NOT the source of truth
  duration: number;

  // Phase 2: instrument role labels for UI display
  instrumentRoles: Record<string, string>;  // instrument name → current role label

  // Phase 3: chord detection and tension state for UI display
  currentChord: string;               // display chord name, e.g. 'Cmaj7', 'dominant chord', or '--'
  chordConfidence: 'low' | 'medium' | 'high';
  chordFunction: string;              // plain English, e.g. 'home -- relaxed and stable'
  currentTension: number;             // 0.0-1.0

  // Phase 4: beat detection, BPM, and pocket score for UI
  currentBpm: number | null;          // null when rubato/low confidence, otherwise rounded integer
  pocketScore: number;                // 0.0-1.0, rolling 8-beat average
  timingOffsetMs: number;             // positive = drums ahead, negative = drums behind

  // Actions
  setFile: (name: string, duration: number) => void;
  setCalibrating: (val: boolean) => void;
  setCurrentTime: (time: number) => void;
  setInstrumentRole: (instrument: string, role: string) => void;
  setChordInfo: (chord: string, confidence: 'low' | 'medium' | 'high', fn: string) => void;
  setTension: (tension: number) => void;
  setBeatInfo: (bpm: number | null, pocket: number, offset: number) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  fileName: null,
  isFileLoaded: false,
  isCalibrating: false,
  currentTime: 0,
  duration: 0,
  instrumentRoles: {},

  // Phase 3 initial state
  currentChord: '--',
  chordConfidence: 'low',
  chordFunction: '',
  currentTension: 0,

  // Phase 4 initial state
  currentBpm: null,
  pocketScore: 0,
  timingOffsetMs: 0,

  setFile: (name, duration) => set({ fileName: name, isFileLoaded: true, duration }),
  setCalibrating: (val) => set({ isCalibrating: val }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setInstrumentRole: (instrument, role) => set((state) => ({
    instrumentRoles: { ...state.instrumentRoles, [instrument]: role }
  })),
  setChordInfo: (chord, confidence, fn) => set({ currentChord: chord, chordConfidence: confidence, chordFunction: fn }),
  setTension: (tension) => set({ currentTension: tension }),
  setBeatInfo: (bpm, pocket, offset) => set({ currentBpm: bpm, pocketScore: pocket, timingOffsetMs: offset }),
  reset: () => set({
    fileName: null,
    isFileLoaded: false,
    isCalibrating: false,
    currentTime: 0,
    duration: 0,
    instrumentRoles: {},
    currentChord: '--',
    chordConfidence: 'low',
    chordFunction: '',
    currentTension: 0,
    currentBpm: null,
    pocketScore: 0,
    timingOffsetMs: 0,
  }),
}));
