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

  // Actions
  setFile: (name: string, duration: number) => void;
  setCalibrating: (val: boolean) => void;
  setCurrentTime: (time: number) => void;
  setInstrumentRole: (instrument: string, role: string) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  fileName: null,
  isFileLoaded: false,
  isCalibrating: false,
  currentTime: 0,
  duration: 0,
  instrumentRoles: {},

  setFile: (name, duration) => set({ fileName: name, isFileLoaded: true, duration }),
  setCalibrating: (val) => set({ isCalibrating: val }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setInstrumentRole: (instrument, role) => set((state) => ({
    instrumentRoles: { ...state.instrumentRoles, [instrument]: role }
  })),
  reset: () => set({
    fileName: null,
    isFileLoaded: false,
    isCalibrating: false,
    currentTime: 0,
    duration: 0,
    instrumentRoles: {},
  }),
}));
