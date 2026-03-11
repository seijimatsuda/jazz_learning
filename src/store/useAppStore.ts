import { create } from 'zustand';

// Phase 8: user annotations (UI-only, not audio hot-path)
export interface Annotation {
  id: string;
  timeSec: number;
  text: string;
}

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
  currentChordIdx: number;            // index into CHORD_TEMPLATES (-1 when no chord)
  currentTension: number;             // 0.0-1.0

  // Phase 4: beat detection, BPM, and pocket score for UI
  currentBpm: number | null;          // null when rubato/low confidence, otherwise rounded integer
  pocketScore: number;                // 0.0-1.0, rolling 8-beat average
  timingOffsetMs: number;             // positive = drums ahead, negative = drums behind

  // Phase 7: band lineup and UI state
  lineup: string[];                              // default: ['bass', 'drums', 'keyboard', 'guitar']
  selectedInstrument: string | null;             // null = no detail panel open
  detectedKey: string | null;                    // null = no key detected yet
  detectedKeyMode: 'major' | 'minor' | null;    // null = no key detected yet

  // Phase 8: pitch/melody state for UI
  kbIsMelodic: boolean;
  gtIsMelodic: boolean;

  // Phase 8: user annotations
  annotations: Annotation[];

  // Actions
  setFile: (name: string, duration: number) => void;
  setCalibrating: (val: boolean) => void;
  setCurrentTime: (time: number) => void;
  setInstrumentRole: (instrument: string, role: string) => void;
  setChordInfo: (chord: string, confidence: 'low' | 'medium' | 'high', fn: string, chordIdx: number) => void;
  setTension: (tension: number) => void;
  setBeatInfo: (bpm: number | null, pocket: number, offset: number) => void;
  setLineup: (lineup: string[]) => void;
  setSelectedInstrument: (name: string | null) => void;
  setDetectedKey: (key: string | null, mode: 'major' | 'minor' | null) => void;
  setMelodyState: (kbMelodic: boolean, gtMelodic: boolean) => void;
  addAnnotation: (timeSec: number, text: string) => void;
  removeAnnotation: (id: string) => void;
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
  currentChordIdx: -1,
  currentTension: 0,

  // Phase 4 initial state
  currentBpm: null,
  pocketScore: 0,
  timingOffsetMs: 0,

  // Phase 7 initial state
  lineup: ['bass', 'drums', 'keyboard', 'guitar'],
  selectedInstrument: null,
  detectedKey: null,
  detectedKeyMode: null,

  // Phase 8 initial state
  kbIsMelodic: false,
  gtIsMelodic: false,
  annotations: [],

  setFile: (name, duration) => set({ fileName: name, isFileLoaded: true, duration }),
  setCalibrating: (val) => set({ isCalibrating: val }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setInstrumentRole: (instrument, role) => set((state) => ({
    instrumentRoles: { ...state.instrumentRoles, [instrument]: role }
  })),
  setChordInfo: (chord, confidence, fn, chordIdx) => set({ currentChord: chord, chordConfidence: confidence, chordFunction: fn, currentChordIdx: chordIdx }),
  setTension: (tension) => set({ currentTension: tension }),
  setBeatInfo: (bpm, pocket, offset) => set({ currentBpm: bpm, pocketScore: pocket, timingOffsetMs: offset }),
  setLineup: (lineup) => set({ lineup }),
  setSelectedInstrument: (name) => set({ selectedInstrument: name }),
  setDetectedKey: (key, mode) => set({ detectedKey: key, detectedKeyMode: mode }),
  setMelodyState: (kbMelodic, gtMelodic) => set({ kbIsMelodic: kbMelodic, gtIsMelodic: gtMelodic }),
  addAnnotation: (timeSec, text) => set((state) => ({
    annotations: [...state.annotations, {
      id: crypto.randomUUID(),
      timeSec,
      text,
    }]
  })),
  removeAnnotation: (id) => set((state) => ({
    annotations: state.annotations.filter(a => a.id !== id)
  })),
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
    currentChordIdx: -1,
    currentTension: 0,
    currentBpm: null,
    pocketScore: 0,
    timingOffsetMs: 0,
    lineup: ['bass', 'drums', 'keyboard', 'guitar'],
    selectedInstrument: null,
    detectedKey: null,
    detectedKeyMode: null,
    kbIsMelodic: false,
    gtIsMelodic: false,
    annotations: [],
  }),
}));
