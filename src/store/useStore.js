import { create } from 'zustand';

export const useStore = create((set, get) => ({
  currentScene: 'preloader', // starts at preloader, then 'entry' after loaded
  activeProject: null,
  currentMode: 'engineer',
  dialogueText: '',

  // ─── Player Controls State ───
  playerAction: 'idle', // 'idle' | 'runForward' | 'runBackward' | 'strafeLeft' | 'strafeRight' | 'swinging' | 'webShoot'
  isSwinging: false,
  swingPhase: null, // null | 'start' | 'loop' | 'end'
  activeKeys: new Set(),

  // ─── Character State ───
  characterPosition: [0, 0, 0],
  moveSpeed: 0, // current speed (smoothed)
  lateralOffset: 0, // current strafe offset

  // ─── Sci-Fi Aiming & Dynamic Raycast Target State ───
  isAiming: false,
  hasTarget: false,
  targetPoint: null, // THREE.Vector3
  isDynamicSwinging: false,
  dynamicSwingTarget: null, // THREE.Vector3
  dynamicSwingStart: null, // THREE.Vector3

  // ─── Web Zip State ───
  isWebZipping: false,
  webZipTarget: null, // THREE.Vector3
  webZipStart: null, // THREE.Vector3
  aimTargets: [], // pre-compiled meshes to raycast against

  // ─── Free Movement & Building Collisions State ───
  freePosition: null, // THREE.Vector3 (free position in city)
  solidObstacles: [], // array of THREE.Box3 (world bounding boxes of solid buildings)
  swingLandingPoint: null, // THREE.Vector3 projected landing coordinate

  // ─── Setters ───
  setDialogue: (text) => set({ dialogueText: text }),
  setScene: (scene) => set({ currentScene: scene }),
  setCharacterPosition: (position) => set({ characterPosition: position }),

  setPlayerAction: (action) => set({ playerAction: action }),

  setAiming: (isAiming) => set({ isAiming }),
  setTarget: (hasTarget, targetPoint) => set({ hasTarget, targetPoint }),

  startWebZip: (targetPoint) => set({
    isWebZipping: true,
    webZipTarget: targetPoint,
    isSwinging: false,
    swingPhase: null,
    playerAction: 'webZip',
  }),

  finishWebZip: () => set({
    isWebZipping: false,
    playerAction: 'hanging',
  }),

  startSwing: () => set({
    isSwinging: true,
    swingPhase: 'start',
    playerAction: 'swinging',
  }),

  startDynamicSwing: (targetPoint) => set({
    isDynamicSwinging: true,
    dynamicSwingTarget: targetPoint,
    isSwinging: true,
    swingPhase: 'start',
    playerAction: 'swinging',
  }),

  endSwing: () => set({
    swingPhase: 'end',
  }),

  finishSwing: () => {
    const state = get();
    if (state.isDynamicSwinging) {
      set({
        isDynamicSwinging: false,
        dynamicSwingTarget: null,
        dynamicSwingStart: null,
        isSwinging: false,
        swingPhase: null,
        playerAction: 'idle',
      });
    } else {
      set({
        isSwinging: false,
        swingPhase: null,
        playerAction: 'idle',
      });
    }
  },

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

  // Cinematic Showcase System State
  activeShowcaseProject: null,
  showcasePhase: 'idle',
  showcaseCameraPosition: null,
  showcaseCameraLookAt: null,
  showcasePlatformPos: null,
  showcaseProjectRotationY: 0,
}));

