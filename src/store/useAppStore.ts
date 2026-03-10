import { create } from 'zustand';

interface AppState {
  // File state
  fileName: string | null;
  isFileLoaded: boolean;

  // UI state (not audio hot-path — audio state lives in useRef)
  isCalibrating: boolean;
  currentTime: number;        // updated at ~10fps for UI display, NOT the source of truth
  duration: number;

  // Actions
  setFile: (name: string, duration: number) => void;
  setCalibrating: (val: boolean) => void;
  setCurrentTime: (time: number) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  fileName: null,
  isFileLoaded: false,
  isCalibrating: false,
  currentTime: 0,
  duration: 0,

  setFile: (name, duration) => set({ fileName: name, isFileLoaded: true, duration }),
  setCalibrating: (val) => set({ isCalibrating: val }),
  setCurrentTime: (time) => set({ currentTime: time }),
  reset: () => set({
    fileName: null,
    isFileLoaded: false,
    isCalibrating: false,
    currentTime: 0,
    duration: 0,
  }),
}));
