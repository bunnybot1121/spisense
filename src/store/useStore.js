import { create } from 'zustand';

export const useStore = create((set, get) => ({
  currentScene: 'preloader', // starts at preloader, then 'entry' after loaded
  activeProject: null,
  currentMode: 'engineer',
  dialogueText: '',

  // ─── Player Controls State ───
  playerAction: 'idle', // 'idle' | 'runForward' | 'runBackward' | 'strafeLeft' | 'strafeRight' | 'swinging'
  isSwinging: false,
  swingPhase: null, // null | 'start' | 'loop' | 'end'
  activeKeys: new Set(),

  // ─── Character State ───
  characterPosition: [0, 0, 0],
  moveSpeed: 0, // current speed (smoothed)
  lateralOffset: 0, // current strafe offset

  // ─── Setters ───
  setDialogue: (text) => set({ dialogueText: text }),
  setScene: (scene) => set({ currentScene: scene }),
  setCharacterPosition: (position) => set({ characterPosition: position }),

  setPlayerAction: (action) => set({ playerAction: action }),

  startSwing: () => set({
    isSwinging: true,
    swingPhase: 'start',
    playerAction: 'swinging',
  }),

  endSwing: () => set({
    swingPhase: 'end',
  }),

  finishSwing: () => set({
    isSwinging: false,
    swingPhase: null,
    playerAction: 'idle',
  }),

  // Key tracking for multi-key support
  pressKey: (key) => {
    const keys = new Set(get().activeKeys);
    keys.add(key);
    set({ activeKeys: keys });
  },

  releaseKey: (key) => {
    const keys = new Set(get().activeKeys);
    keys.delete(key);
    set({ activeKeys: keys });
  },
}));
