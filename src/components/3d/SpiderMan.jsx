import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useGLTF, useAnimations, Grid, Html } from '@react-three/drei';
import { useStore } from '../../store/useStore';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import * as THREE from 'three';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';

// ─── Animation name resolver ───
// Fuzzy-matches animation names from the GLB
function findAnim(actions, ...keywords) {
  const names = Object.keys(actions);
  for (const kw of keywords) {
    const found = names.find((n) => n.toLowerCase().includes(kw.toLowerCase()));
    if (found) return found;
  }
  return null;
}

// ─── Movement Constants ───
const MOVE_SPEED = 0.052; // path fraction per second when running (increased to match scene motion)
const STRAFE_SPEED = 1.2; // lateral offset speed (units/sec)
const MAX_STRAFE = 1.5; // max lateral offset from path
const ACCELERATION = 4.0; // speed ramp up factor
const DECELERATION = 6.0; // speed ramp down factor
const ROTATION_SMOOTHING = 10.0; // rotation slerp speed
const SWING_SPEED = 0.098; // faster movement while swinging (increased to match scene motion)
const SWING_LIFT = 4.0; // vertical lift during swing

// ─── Keyboard Control Set mappings ───
const KEY_FORWARD = new Set(['w', 'W', 'ArrowUp']);
const KEY_BACKWARD = new Set(['s', 'S', 'ArrowDown']);
const KEY_LEFT = new Set(['a', 'A', 'ArrowLeft']);
const KEY_RIGHT = new Set(['d', 'D', 'ArrowRight']);

export default function SpiderMan({
  spiderCtrl,
  cameraCtrl,
  lightCtrl,
  neonCtrl,
  pathPoints,
  debugVisuals,
  segmentAnimations: segAnimData,
  // Editor props
  editorMode = false,
  spiderManPos,
  isSelected = false,
  onSelect,
  onAnimationsLoaded,
  activeAnimation,
  onActiveAnimationChange,
  graphicsPreset = 'Balanced',
  enableShadows = true,
  ...props
}) {
  const group = useRef();
  const { scene, animations } = useGLTF('/src/assets/spiderman.glb');
  const { actions, mixer } = useAnimations(animations, group);
  const currentScene = useStore((s) => s.currentScene);
  const playerAction = useStore((s) => s.playerAction);
  const isSwinging = useStore((s) => s.isSwinging);
  const isAiming = useStore((s) => s.isAiming);
  const swingPhase = useStore((s) => s.swingPhase);
  const finishSwing = useStore((s) => s.finishSwing);

  // ─── Rapier Physics Hook & Refs ───
  const rigidBodyRef = useRef();
  const { rapier, world, rigidBodyStates } = useRapier();
  const prevPositionRef = useRef(new THREE.Vector3());
  const swingVelocityRef = useRef(new THREE.Vector3());
  const needsVelocitySeedRef = useRef(false);
  const jumpImpulseAppliedRef = useRef(false);
  const prevEditorModeRef = useRef(editorMode);

  const getBodyType = () => {
    const type = editorMode
      ? "fixed"
      : (currentScene === 'entry'
          ? "kinematicPosition"
          : (isSwinging || useStore.getState().isWebZipping || useStore.getState().activeShowcaseProject
              ? "kinematicPosition"
              : "dynamic"));
    console.log('[SpiderMan getBodyType] Resolved body type:', { type, editorMode, currentScene });
    return type;
  };




  // ─── Animation tracking ───
  const currentActionRef = useRef(null);
  const currentAnimName = useRef('');
  const prevPlayerAction = useRef('idle');

  // ─── Movement state ───
  const initialPosition = useMemo(() => {
    return [spiderManPos?.x ?? 0, spiderManPos?.y ?? 0, spiderManPos?.z ?? 0];
  }, [spiderManPos?.x, spiderManPos?.y, spiderManPos?.z]);
  const fractionRef = useRef(0); // position along path (0-1)
  const speedRef = useRef(0); // current movement speed
  const lateralOffsetRef = useRef(0); // strafe offset
  const targetRotationRef = useRef(new THREE.Quaternion());
  const swingProgressRef = useRef(0); // swing animation progress
  const swingYRef = useRef(0); // vertical swing offset
  const swingWebRef = useRef();
  const shootWebRef = useRef();
  const webZipProgressRef = useRef(0);
  const webThread1Ref = useRef();
  const webThread2Ref = useRef();
  const aimYawRef = useRef(0);
  const playYawRef = useRef(0);
  const smoothedLookTargetRef = useRef(new THREE.Vector3());
  const aimPitchRef = useRef(0);
  const justStartedAiming = useRef(false);
  const lastTouchRef = useRef({ x: 0, y: 0 });
  const isPointerDownRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const isInitializedRef = useRef(false);
  const jumpProgressRef = useRef(1);
  const dynamicSwingTargetGroundYRef = useRef(0);
  const dynamicSwingCamDirRef = useRef(new THREE.Vector3());

  // ─── Dynamic Swing and Targeting ───
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const centerMouse = useMemo(() => new THREE.Vector2(0, 0), []);
  const dynamicSwingStartRef = useRef(null);
  const dynamicSwingStartFracRef = useRef(0);
  const frameCountRef = useRef(0);

  // ─── Resolved animation map ───
  const animMap = useMemo(() => {
    if (!actions || Object.keys(actions).length === 0) return {};
    return {
      idle: findAnim(actions, 'idle', 'stand', 'rest'),
      run: findAnim(actions, 'run', 'jog', 'sprint', 'walk'),
      walk: findAnim(actions, 'walk', 'run'),
      swingStart: findAnim(actions, 'swingStart', 'swing_start', 'swingstart', 'webswing', 'swing'),
      swingEnd: findAnim(actions, 'swingEnd', 'swing_end', 'swingend', 'land', 'landing'),
      swingLoop: findAnim(actions, 'swingLoop', 'swing_loop', 'swingloop', 'swing', 'fly'),
      jumpUp: findAnim(actions, 'jumpUp', 'jump_up', 'jumpup', 'jump'),
      strafeLeft: findAnim(actions, 'strafeLeft', 'strafe_left', 'starfeLeft', 'left', 'dodge'),
      strafeRight: findAnim(actions, 'strafeRight', 'strafe_right', 'starfeRight', 'starferight', 'right', 'dodge'),
      moonwalk: findAnim(actions, 'moonwalk'),
      hip_hop: findAnim(actions, 'hip_hop'),
      webShoot: findAnim(actions, 'braceDrop', 'jumpUp'),
    };
  }, [actions]);

  // ─── Character Lighting Controls (Leva) ───
  const charLight = useControls('Character Lighting', {
    match_scene: { value: true, label: 'Match Environment' },
    key_intensity: { value: 5, min: 0, max: 30, step: 0.5, label: 'Key Intensity', hidden: (get) => get('Character Lighting.match_scene') },
    key_color: { value: '#ffffff', label: 'Key Color', hidden: (get) => get('Character Lighting.match_scene') },
    key_x: { value: 0, min: -0.1, max: 0.1, step: 0.002, label: 'Key X', hidden: (get) => get('Character Lighting.match_scene') },
    key_y: { value: 0.03, min: -0.1, max: 0.1, step: 0.002, label: 'Key Y', hidden: (get) => get('Character Lighting.match_scene') },
    key_z: { value: 0.04, min: -0.1, max: 0.1, step: 0.002, label: 'Key Z', hidden: (get) => get('Character Lighting.match_scene') },
    key_distance: { value: 0.2, min: 0.01, max: 1, step: 0.01, label: 'Key Distance', hidden: (get) => get('Character Lighting.match_scene') },
    fill_intensity: { value: 2, min: 0, max: 20, step: 0.5, label: 'Fill Intensity', hidden: (get) => get('Character Lighting.match_scene') },
    fill_color: { value: '#ffffff', label: 'Fill Color', hidden: (get) => get('Character Lighting.match_scene') },
    fill_x: { value: -0.04, min: -0.1, max: 0.1, step: 0.002, label: 'Fill X', hidden: (get) => get('Character Lighting.match_scene') },
    fill_y: { value: 0.02, min: -0.1, max: 0.1, step: 0.002, label: 'Fill Y', hidden: (get) => get('Character Lighting.match_scene') },
    fill_z: { value: 0, min: -0.1, max: 0.1, step: 0.002, label: 'Fill Z', hidden: (get) => get('Character Lighting.match_scene') },
    fill_distance: { value: 0.15, min: 0.01, max: 1, step: 0.01, label: 'Fill Distance', hidden: (get) => get('Character Lighting.match_scene') },
    rim_intensity: { value: 3, min: 0, max: 20, step: 0.5, label: 'Rim Intensity', hidden: (get) => get('Character Lighting.match_scene') },
    rim_color: { value: '#ffffff', label: 'Rim Color', hidden: (get) => get('Character Lighting.match_scene') },
    rim_x: { value: 0.03, min: -0.1, max: 0.1, step: 0.002, label: 'Rim X', hidden: (get) => get('Character Lighting.match_scene') },
    rim_y: { value: 0.03, min: -0.1, max: 0.1, step: 0.002, label: 'Rim Y', hidden: (get) => get('Character Lighting.match_scene') },
    rim_z: { value: -0.04, min: -0.1, max: 0.1, step: 0.002, label: 'Rim Z', hidden: (get) => get('Character Lighting.match_scene') },
    rim_distance: { value: 0.15, min: 0.01, max: 1, step: 0.01, label: 'Rim Distance', hidden: (get) => get('Character Lighting.match_scene') },
  });

  // ─── Keep original materials — just enable shadows ───
  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        console.log(`[SpiderMan Mesh] Name: ${child.name}, Visible: ${child.visible}, Material: ${child.material ? child.material.name : 'none'}, Material Opacity: ${child.material ? child.material.opacity : 'n/a'}, Material Transparent: ${child.material ? child.material.transparent : 'n/a'}`);
      }
    });
  }, [scene]);

  // Report available animations to parent
  useEffect(() => {
    if (actions && onAnimationsLoaded) {
      const names = Object.keys(actions);
      console.log('[SpiderMan] Available animations:', names);
      console.log('[SpiderMan] Resolved animation map:', animMap);
      onAnimationsLoaded(names);
    }
  }, [actions, onAnimationsLoaded, animMap]);

  // ─── Crossfade to a new animation ───
  const playAnimation = useCallback((animName, options = {}) => {
    if (!animName || !actions[animName]) return;
    if (currentAnimName.current === animName) return;

    const { fadeIn = 0.2, fadeOut = 0.2, loop = true, clampWhenFinished = false, timeScale = 1 } = options;

    // Fade out current
    if (currentActionRef.current) {
      currentActionRef.current.fadeOut(fadeOut);
    }

    // Fade in new
    const newAction = actions[animName];
    newAction.reset();
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    newAction.clampWhenFinished = clampWhenFinished;
    newAction.timeScale = timeScale;
    newAction.fadeIn(fadeIn).play();

    currentActionRef.current = newAction;
    currentAnimName.current = animName;
  }, [actions]);

  // ─── Play selected animation in editor mode ───
  useEffect(() => {
    if (!editorMode || !actions || !activeAnimation) return;
    if (currentAnimName.current === activeAnimation) return;
    playAnimation(activeAnimation);
  }, [actions, activeAnimation, editorMode, playAnimation]);

  // Play default animation in editor mode (only if no activeAnimation set)
  useEffect(() => {
    if (!editorMode || activeAnimation) return;
    const idleName = animMap.idle || Object.keys(actions)[0];
    if (idleName) playAnimation(idleName);
    return () => {
      if (currentActionRef.current) {
        currentActionRef.current.fadeOut(0.3);
        currentActionRef.current = null;
        currentAnimName.current = '';
      }
    };
  }, [actions, editorMode, activeAnimation, animMap, playAnimation]);

  // Play idle animation in play mode on mount
  useEffect(() => {
    if (editorMode) return;
    if (!actions || Object.keys(actions).length === 0) return;
    const idleName = animMap.idle || Object.keys(actions)[0];
    if (idleName) playAnimation(idleName);
  }, [editorMode, actions, animMap, playAnimation]);

  // Reset rigid body ref and initialization state when toggling modes or scenes
  useEffect(() => {
    rigidBodyRef.current = null;
    isInitializedRef.current = false;
  }, [editorMode, currentScene]);

  // ─── Handle player action changes → animation transitions ───
  useEffect(() => {
    if (editorMode) return;
    if (prevPlayerAction.current === playerAction && !isSwinging) return;
    prevPlayerAction.current = playerAction;

    // Swing phases
    if (isSwinging) {
      if (swingPhase === 'start') {
        const anim = animMap.swingStart || animMap.jumpUp || animMap.idle;
        if (anim) playAnimation(anim, { loop: false, clampWhenFinished: true, fadeIn: 0.15 });
      } else if (swingPhase === 'loop') {
        const anim = animMap.swingLoop || animMap.swingStart || animMap.jumpUp;
        if (anim) playAnimation(anim, { fadeIn: 0.2 });
      } else if (swingPhase === 'end') {
        const anim = animMap.swingEnd || animMap.jumpUp || animMap.idle;
        if (anim) playAnimation(anim, { loop: false, clampWhenFinished: true, fadeIn: 0.15 });
      }
      return;
    }

    // Normal movement animations
    switch (playerAction) {
      case 'runForward': {
        const anim = animMap.run || animMap.walk || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.15 });
        break;
      }
      case 'runBackward': {
        const anim = animMap.run || animMap.walk || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.15, timeScale: -1 });
        break;
      }
      case 'strafeLeft': {
        const anim = (currentScene === 'city' && !isAiming)
          ? animMap.run
          : (animMap.strafeLeft || animMap.run || animMap.walk || animMap.idle);
        if (anim) playAnimation(anim, { fadeIn: 0.15 });
        break;
      }
      case 'strafeRight': {
        const anim = (currentScene === 'city' && !isAiming)
          ? animMap.run
          : (animMap.strafeRight || animMap.run || animMap.walk || animMap.idle);
        if (anim) playAnimation(anim, { fadeIn: 0.15 });
        break;
      }
      case 'webShoot': {
        const anim = animMap.webShoot || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.1, timeScale: 1.5 });
        break;
      }
      case 'webZip': {
        // Handled dynamically in useFrame to crossfade between swingStart and swingEnd
        break;
      }
      case 'hanging': {
        const anim = actions['hanging'] ? 'hanging' : animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.15 });
        break;
      }
      case 'moonwalk': {
        const anim = animMap.moonwalk || animMap.run || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.15 });
        break;
      }
      case 'hip_hop': {
        const anim = animMap.hip_hop || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.15 });
        break;
      }
      case 'jump': {
        jumpProgressRef.current = 0;
        const anim = animMap.jumpUp || animMap.idle;
        if (anim) playAnimation(anim, { loop: false, clampWhenFinished: true, fadeIn: 0.1 });
        break;
      }
      default: {
        const anim = animMap.idle || Object.keys(actions)[0];
        if (anim) playAnimation(anim, { fadeIn: 0.25 });
        break;
      }
    }
  }, [editorMode, playerAction, isSwinging, swingPhase, animMap, playAnimation, actions]);

  // ─── Mouse Aiming (Movement Delta) and Pointer Lock Listeners ───
  useEffect(() => {
    const handlePointerDown = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('.editor-panel') || e.target.closest('.game-controls-container') || e.target.closest('[class*="leva"]')) return;
      isPointerDownRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    const handlePointerMove = (e) => {
      const storeState = useStore.getState();
      if (storeState.isAiming) {
        aimYawRef.current -= e.movementX * 0.0015;
        aimPitchRef.current = Math.max(-0.6, Math.min(0.6, aimPitchRef.current - e.movementY * 0.0015));
      } else if (isPointerDownRef.current) {
        const dx = e.clientX - lastPointerRef.current.x;
        const dy = e.clientY - lastPointerRef.current.y;
        aimYawRef.current -= dx * 0.0025;
        aimPitchRef.current = Math.max(-0.6, Math.min(0.6, aimPitchRef.current - dy * 0.0025));
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleTouchStart = (e) => {
      if (e.touches.length > 0) {
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        
        aimYawRef.current -= dx * 0.002;
        aimPitchRef.current = Math.max(-0.6, Math.min(0.6, aimPitchRef.current - dy * 0.002));

        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    // Subscribe to aiming state to request PointerLock
    const unsub = useStore.subscribe(
      (state) => state.isAiming,
      (isAiming) => {
        const canvas = document.querySelector('canvas');
        if (isAiming) {
          if (canvas && canvas.requestPointerLock) {
            canvas.requestPointerLock().catch(() => {});
          }
        } else {
          if (document.exitPointerLock && document.pointerLockElement === canvas) {
            document.exitPointerLock();
          }
        }
      }
    );

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      unsub();
    };
  }, []);

  // ─── Handle swing end → finish after animation plays ───
  useEffect(() => {
    if (swingPhase !== 'end') return;
    const timer = setTimeout(() => {
      finishSwing();
    }, 800); // allow end animation to play
    return () => clearTimeout(timer);
  }, [swingPhase, finishSwing]);



  // ─── Keyboard shortcuts for animations (1-9, 0) — editor only ───
  useEffect(() => {
    if (!editorMode || !actions) return;
    const names = Object.keys(actions);

    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      const num = parseInt(e.key);
      if (!isNaN(num)) {
        const idx = num === 0 ? 9 : num - 1;
        if (idx < names.length && onActiveAnimationChange) {
          onActiveAnimationChange(names[idx]);
        }
      }
      if (e.key === 'n' || e.key === 'N') {
        const currentIdx = names.indexOf(currentAnimName.current);
        const nextIdx = (currentIdx + 1) % names.length;
        if (onActiveAnimationChange) onActiveAnimationChange(names[nextIdx]);
      }
      if (e.key === 'p' || e.key === 'P') {
        const currentIdx = names.indexOf(currentAnimName.current);
        const prevIdx = (currentIdx - 1 + names.length) % names.length;
        if (onActiveAnimationChange) onActiveAnimationChange(names[prevIdx]);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [editorMode, actions, onActiveAnimationChange]);

  // Build path curve
  const pathCurve = useMemo(() => {
    if (!pathPoints || pathPoints.length < 2) return null;
    const vectors = pathPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    return new THREE.CatmullRomCurve3(vectors);
  }, [pathPoints]);

  // Path fraction syncing is now handled synchronously in the useFrame initialization block
  // to avoid race conditions during play mode entry.

  // ─── Temp vectors (reuse to avoid GC) ───
  const _posOnCurve = useMemo(() => new THREE.Vector3(), []);
  const _tangent = useMemo(() => new THREE.Vector3(), []);
  const _lateral = useMemo(() => new THREE.Vector3(), []);
  const _lookTarget = useMemo(() => new THREE.Vector3(), []);
  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const _camTarget = useMemo(() => new THREE.Vector3(), []);
  const _worldPos = useMemo(() => new THREE.Vector3(), []);
  const _targetQuat = useMemo(() => new THREE.Quaternion(), []);
  const _matrix = useMemo(() => new THREE.Matrix4(), []);

  useFrame((state, delta) => {
    frameCountRef.current++;
    if (!group.current) return;

    // Read store states and active keys at the very beginning of the frame
    // to avoid Temporal Dead Zone errors due to hoisting.
    const storeState = useStore.getState();
    const currentScene = storeState.currentScene;
    const currentAction = storeState.playerAction;
    const currentlySwinging = storeState.isSwinging;
    const currentlyZipping = storeState.isWebZipping;
    const isAiming = storeState.isAiming;
    const isDynamic = storeState.isDynamicSwinging;
    const activeKeys = storeState.activeKeys || new Set();

    // Resolve rigidBodyRef.current manually to support React 18 where RigidBody lacks forwardRef
    let resolved = !!rigidBodyRef.current;
    if (!resolved && group.current.parent && rigidBodyStates) {
      for (const s of rigidBodyStates.values()) {
        if (s.object === group.current.parent || s.object === group.current.parent.parent) {
          const wasResolved = !!rigidBodyRef.current;
          rigidBodyRef.current = s.rigidBody;
          if (!wasResolved && rigidBodyRef.current) {
            group.current.position.set(0, 0, 0);
          }
          resolved = true;
          break;
        }
      }
    }
    if (!resolved) {
      rigidBodyRef.current = null;
    }

    // ─── Cinematic Showcase Mode ───
    if (storeState.activeShowcaseProject) {
      const platformPos = storeState.showcasePlatformPos || new THREE.Vector3(0, 0.05, 35);
      const currentPos = rigidBodyRef.current 
        ? rigidBodyRef.current.translation() 
        : new THREE.Vector3(spiderManPos.x, spiderManPos.y, spiderManPos.z);
      
      const current3D = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);
      const target3D = platformPos.clone();
      
      const distance = current3D.distanceTo(target3D);
      const dt = Math.min(delta, 0.05);

      if (distance > 0.04) {
        const moveDir = target3D.clone().sub(current3D).normalize();
        const moveDist = Math.min(distance, dt * 3.5);
        current3D.addScaledVector(moveDir, moveDist);

        // Face the platform center
        const targetAngle = Math.atan2(moveDir.x, moveDir.z);
        _targetQuat.setFromAxisAngle(_up, targetAngle);
        group.current.quaternion.slerp(_targetQuat, 0.15);

        // Run/walk towards center
        const walkAnim = animMap.run || animMap.walk || animMap.idle;
        if (walkAnim && currentAnimName.current !== walkAnim) {
          playAnimation(walkAnim, { fadeIn: 0.15 });
        }
      } else {
        // Arrived at platform center
        current3D.copy(target3D);

        // Rotate to face camera (opposite direction of the platform's Y rotation offset)
        const radRotY = THREE.MathUtils.degToRad(storeState.showcaseProjectRotationY ?? 0);
        // Face camera (angle radRotY + Math.PI)
        const targetAngle = radRotY + Math.PI;
        _targetQuat.setFromAxisAngle(_up, targetAngle);
        group.current.quaternion.slerp(_targetQuat, 0.08);

        // CONFIDENT HERO IDLE POSE
        const heroAnim = animMap.hip_hop || animMap.idle || Object.keys(actions)[0];
        if (heroAnim && currentAnimName.current !== heroAnim) {
          playAnimation(heroAnim, { fadeIn: 0.25 });
        }

        // Advance to next cinematic phases automatically based on arrival
        if (storeState.showcasePhase === 'character_move') {
          useStore.setState({ showcasePhase: 'camera_move' });
        }
      }

      if (rigidBodyRef.current) {
        rigidBodyRef.current.setNextKinematicTranslation({ x: current3D.x, y: current3D.y, z: current3D.z });
      }
      group.current.position.set(0, 0, 0);

      useStore.setState({
        characterPosition: [current3D.x, current3D.y, current3D.z],
        freePosition: current3D.clone()
      });

      // Override camera position and target
      if (storeState.showcaseCameraPosition && storeState.showcaseCameraLookAt) {
        state.camera.position.lerp(storeState.showcaseCameraPosition, 0.08);
        smoothedLookTargetRef.current.lerp(storeState.showcaseCameraLookAt, 0.08);
        state.camera.lookAt(smoothedLookTargetRef.current);
      }

      // Track main directional light to player position
      const dirLight = state.scene.getObjectByName('mainDirLight');
      if (dirLight) {
        dirLight.position.set(
          current3D.x + (lightCtrl?.directional_x ?? -8.4),
          current3D.y + (lightCtrl?.directional_y ?? 5.1),
          current3D.z + (lightCtrl?.directional_z ?? 12.2)
        );
        dirLight.target.position.copy(current3D);
        dirLight.target.updateMatrixWorld();
      }
      return;
    }

    // ─── Editor Mode ───
    if (editorMode) {
      if (rigidBodyRef.current && group.current.parent && group.current.parent.parent) {
        const parentPos = group.current.parent.parent.position;
        rigidBodyRef.current.setTranslation({ x: parentPos.x, y: parentPos.y, z: parentPos.z }, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
        // Reset local position of the RigidBody Three.js object to prevent double-positioning
        group.current.parent.position.set(0, 0, 0);
      }
      prevEditorModeRef.current = true;
      isInitializedRef.current = false;
      fractionRef.current = 0;
      speedRef.current = 0;
      lateralOffsetRef.current = 0;
      group.current.position.set(0, 0, 0);
      group.current.scale.setScalar(spiderCtrl?.scale ?? 100);
      const rotYDeg = spiderCtrl?.rotation_y ?? 0;
      group.current.rotation.y = THREE.MathUtils.degToRad(rotYDeg);
      return;
    }

    prevEditorModeRef.current = false;

    // Prevent running play mode frame updates before initialization is complete
    if (!isInitializedRef.current) {
      if (group.current && rigidBodyRef.current) {
        // 1. Sync starting path fraction and lateral offset synchronously
        let synced = false;
        if (currentScene !== 'city') {
          if (pathCurve && spiderManPos) {
            let minDistance = Infinity;
            let closestFraction = 0;
            const samples = 100;
            const tempVector = new THREE.Vector3();
            const targetVector = new THREE.Vector3(spiderManPos.x, spiderManPos.y, spiderManPos.z);
            
            for (let i = 0; i <= samples; i++) {
              const t = i / samples;
              pathCurve.getPointAt(t, tempVector);
              const dist = tempVector.distanceTo(targetVector);
              if (dist < minDistance) {
                minDistance = dist;
                closestFraction = t;
              }
            }

            // Calculate starting lateral offset at closestFraction
            pathCurve.getPointAt(closestFraction, tempVector);
            const tangentVec = new THREE.Vector3();
            pathCurve.getTangentAt(closestFraction, tangentVec);
            const upVec = new THREE.Vector3(0, 1, 0);
            const lateralVec = new THREE.Vector3().crossVectors(tangentVec, upVec).normalize();

            const diffVec = new THREE.Vector3().subVectors(targetVector, tempVector);
            const lateralOffset = diffVec.dot(lateralVec);

            fractionRef.current = closestFraction;
            // Keep lateral offset clamped to MAX_STRAFE to prevent clipping walls at spawn
            lateralOffsetRef.current = THREE.MathUtils.clamp(lateralOffset, -MAX_STRAFE, MAX_STRAFE);
            console.log(`[SpiderMan Physics Init] Synced starting path fraction to ${closestFraction.toFixed(3)} and lateral offset to ${lateralOffsetRef.current.toFixed(3)} based on editor position:`, spiderManPos);
            synced = true;
          }
        } else {
          synced = true; // City scene doesn't need path curve
        }

        if (synced) {
          // 2. Set initial physics body translation
          if (spiderManPos) {
            rigidBodyRef.current.setTranslation(
              { x: spiderManPos.x, y: spiderManPos.y, z: spiderManPos.z },
              true
            );
            rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
            rigidBodyRef.current.wakeUp();
            console.log(`[SpiderMan Physics] useFrame initialized position at:`, spiderManPos);
          }

          // 3. Set initial rotation and yaw refs
          const rotYDeg = spiderCtrl?.rotation_y ?? 0;
          const initialRotY = THREE.MathUtils.degToRad(rotYDeg);
          group.current.rotation.y = initialRotY;
          
          aimYawRef.current = initialRotY;
          playYawRef.current = initialRotY;
          if (spiderManPos) {
            smoothedLookTargetRef.current.set(spiderManPos.x, spiderManPos.y + 1, spiderManPos.z);
          }

          isInitializedRef.current = true;
          group.current.position.set(0, 0, 0);
        } else {
          // Path curve not ready, keep model aligned and wait
          if (group.current) {
            group.current.position.set(0, 0, 0);
          }
          return;
        }
      } else {
        // Wait until rigidBody is resolved before doing anything, keeping model aligned
        if (group.current) {
          group.current.position.set(0, 0, 0);
        }
        return;
      }
    }
    // (Store states and active keys are read at the start of useFrame)

    if (currentlySwinging || currentlyZipping) {
      const euler = new THREE.Euler().setFromQuaternion(group.current.quaternion, 'YXZ');
      playYawRef.current = euler.y;
    }

    let hasForward = [...activeKeys].some(k => KEY_FORWARD.has(k));
    let hasBackward = [...activeKeys].some(k => KEY_BACKWARD.has(k));
    let hasLeft = [...activeKeys].some(k => KEY_LEFT.has(k));
    let hasRight = [...activeKeys].some(k => KEY_RIGHT.has(k));

    // Mobile / touch controls fallback if no movement keys are pressed
    if (!hasForward && !hasBackward && !hasLeft && !hasRight) {
      if (currentAction === 'runForward') hasForward = true;
      else if (currentAction === 'runBackward') hasBackward = true;
      else if (currentAction === 'strafeLeft') hasLeft = true;
      else if (currentAction === 'strafeRight') hasRight = true;
    }

    const dt = Math.min(delta, 0.05); // cap delta to prevent jumps
    const scale = spiderCtrl?.scale ?? 100;

    // ─── 1. Sci-Fi Aiming & Raycasting Target Check (Throttled & Optimized) ───
    if (isAiming && !currentlySwinging && !currentlyZipping) {
      const shouldRaycast = (frameCountRef.current % 2 === 0); // Always throttle raycasting to every 2 frames for smooth performance

      if (shouldRaycast) {
        raycaster.setFromCamera(centerMouse, state.camera);
        const targets = storeState.aimTargets;

        if (targets && targets.length > 0) {
          const intersects = raycaster.intersectObjects(targets, false);
          // Find first intersection that is high enough (y > 3.5 for city, y > 0.5 for alley) and within range (dist < 60)
          const minHeight = currentScene === 'city' ? 3.5 : 0.5;
          const validHit = intersects.find((hit) => {
            const dist = state.camera.position.distanceTo(hit.point);
            return hit.point.y > minHeight && dist < 60;
          });

          if (validHit) {
            useStore.setState({ hasTarget: true, targetPoint: validHit.point });
          } else {
            useStore.setState({ hasTarget: false, targetPoint: null });
          }
        } else {
          useStore.setState({ hasTarget: false, targetPoint: null });
        }
      }
    } else if (!isAiming && !currentlySwinging && !currentlyZipping) {
      if (storeState.hasTarget) {
        useStore.setState({ hasTarget: false, targetPoint: null });
      }
    }

    let finalX = 0;
    let finalY = 0;
    let finalZ = 0;

    const currentlyKinematic = (currentlySwinging || currentlyZipping || currentScene === 'entry');
    const currentBodyPos = rigidBodyRef.current ? rigidBodyRef.current.translation() : new THREE.Vector3(spiderManPos.x, spiderManPos.y, spiderManPos.z);

    // Get character facing direction for local camera orientation
    const charForward = new THREE.Vector3(0, 0, 1).applyQuaternion(group.current.quaternion).normalize();
    const charRight = new THREE.Vector3(1, 0, 0).applyQuaternion(group.current.quaternion).normalize();

    if (currentlyKinematic) {
      if (currentlyZipping && storeState.webZipTarget) {
        // Initialize zip start position
        if (!dynamicSwingStartRef.current) {
          dynamicSwingStartRef.current = new THREE.Vector3(currentBodyPos.x, currentBodyPos.y, currentBodyPos.z);
          useStore.setState({ webZipStart: dynamicSwingStartRef.current });
          webZipProgressRef.current = 0;
        }

        // Progress zip physics interpolation (slowed down for smoother swing animation blending)
        webZipProgressRef.current = Math.min(webZipProgressRef.current + dt * 1.25, 1);
        const t = webZipProgressRef.current;
        const startPos = dynamicSwingStartRef.current;

        // Trajectory with a pendulum swing-like lift arc
        finalX = THREE.MathUtils.lerp(startPos.x, storeState.webZipTarget.x, t);
        finalZ = THREE.MathUtils.lerp(startPos.z, storeState.webZipTarget.z, t);
        
        const liftAmount = 2.2;
        const swingY = Math.sin(t * Math.PI) * liftAmount;
        finalY = THREE.MathUtils.lerp(startPos.y, storeState.webZipTarget.y, t) + swingY;

        // Play swing start and end animations during the zip
        if (t < 0.6) {
          const anim = animMap.swingStart || animMap.jumpUp || animMap.idle;
          if (anim && currentAnimName.current !== anim) {
            playAnimation(anim, { loop: false, clampWhenFinished: true, fadeIn: 0.15 });
          }
        } else {
          const anim = animMap.swingEnd || animMap.jumpUp || animMap.idle;
          if (anim && currentAnimName.current !== anim) {
            playAnimation(anim, { loop: false, clampWhenFinished: true, fadeIn: 0.15 });
          }
        }

        // Orient Spider-Man facing the zip target horizontally
        const dirToTarget = storeState.webZipTarget.clone().sub(startPos);
        dirToTarget.y = 0;
        if (dirToTarget.lengthSq() > 0.001) {
          const targetAngle = Math.atan2(dirToTarget.x, dirToTarget.z);
          _targetQuat.setFromAxisAngle(_up, targetAngle);
          const rotSlerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.22, dt * 60), 0, 1);
          group.current.quaternion.slerp(_targetQuat, rotSlerp);
        }

        // Complete zip and land
        if (t >= 1) {
          dynamicSwingStartRef.current = null;
          webZipProgressRef.current = 0;

          // Offset 0.45m away from the wall to prevent clipping
          const offsetDir = new THREE.Vector3().subVectors(startPos, storeState.webZipTarget).normalize();
          const finalHangingPos = storeState.webZipTarget.clone().addScaledVector(offsetDir, 0.45);
          useStore.setState({ freePosition: finalHangingPos });

          // Update path fraction & lateral offset in Alley scene so we release/drop down locally
          if (currentScene !== 'city' && pathCurve) {
            let minDistance = Infinity;
            let closestFraction = 0;
            const samples = 100;
            const tempVector = new THREE.Vector3();
            
            for (let i = 0; i <= samples; i++) {
              const sampleT = i / samples;
              pathCurve.getPointAt(sampleT, tempVector);
              const dist = tempVector.distanceTo(finalHangingPos);
              if (dist < minDistance) {
                minDistance = dist;
                closestFraction = sampleT;
              }
            }
            fractionRef.current = closestFraction;
            
            // Set lateralOffsetRef to project from the new path segment coordinates
            pathCurve.getPointAt(closestFraction, tempVector);
            pathCurve.getTangentAt(closestFraction, _tangent);
            _lateral.crossVectors(_tangent, _up).normalize();
            
            const diff = new THREE.Vector3().subVectors(finalHangingPos, tempVector);
            lateralOffsetRef.current = diff.dot(_lateral);
          }

          storeState.finishWebZip();
        }
      } else if (currentAction === 'hanging') {
        // Lock position at the wall clinging coordinates
        if (storeState.freePosition) {
          finalX = storeState.freePosition.x;
          finalY = storeState.freePosition.y;
          finalZ = storeState.freePosition.z;
        } else {
          finalX = currentBodyPos.x;
          finalY = currentBodyPos.y;
          finalZ = currentBodyPos.z;
        }

        // Face the wall
        if (storeState.webZipTarget && storeState.freePosition) {
          const dirToWall = storeState.webZipTarget.clone().sub(storeState.freePosition);
          dirToWall.y = 0;
          if (dirToWall.lengthSq() > 0.001) {
            const targetAngle = Math.atan2(dirToWall.x, dirToWall.z);
            _targetQuat.setFromAxisAngle(_up, targetAngle);
            group.current.quaternion.copy(_targetQuat); // snap facing the wall
          }
        }
      } else if (isDynamic && storeState.dynamicSwingTarget) {
        // Dynamic Aimed Swing logic
        if (!dynamicSwingStartRef.current) {
          dynamicSwingStartRef.current = new THREE.Vector3(currentBodyPos.x, currentBodyPos.y, currentBodyPos.z);
          dynamicSwingStartFracRef.current = fractionRef.current;
          useStore.setState({ dynamicSwingStart: dynamicSwingStartRef.current });
          swingProgressRef.current = 0;

          // Raycast once at the start of the swing to find the ground height!
          let targetGroundY = 0;
          const targets = storeState.aimTargets || [];
          if (targets.length > 0) {
            const rayStart = new THREE.Vector3(storeState.dynamicSwingTarget.x, 200, storeState.dynamicSwingTarget.z);
            const rayDir = new THREE.Vector3(0, -1, 0);
            raycaster.set(rayStart, rayDir);
            const intersects = raycaster.intersectObjects(targets, true);
            const validHit = intersects.find((hit) => hit.point.y > 0.05 && hit.point.y < 100);
            if (validHit) {
              targetGroundY = validHit.point.y;
            }
          }
          dynamicSwingTargetGroundYRef.current = targetGroundY;
        }

        // Progress swing (reduced speed from 1.15 to 0.85)
        swingProgressRef.current = Math.min(swingProgressRef.current + dt * 0.85, 1);
        const t = swingProgressRef.current;
        const startPos = dynamicSwingStartRef.current;

        // Update swingPhase in store based on progress t (start and end only)
        let currentPhase = 'start';
        if (t >= 0.75) {
          currentPhase = 'end';
        }
        if (storeState.swingPhase !== currentPhase) {
          useStore.setState({ swingPhase: currentPhase });
        }

        if (currentScene === 'city') {
          // In free roaming mode, swing towards the target horizontally and land under it or on the building's roof
          const targetLand = storeState.dynamicSwingTarget.clone();
          targetLand.y = dynamicSwingTargetGroundYRef.current;
          
          finalX = THREE.MathUtils.lerp(startPos.x, targetLand.x, t);
          finalZ = THREE.MathUtils.lerp(startPos.z, targetLand.z, t);
          
          const liftAmount = Math.max(5.0, (storeState.dynamicSwingTarget.y - targetLand.y) * 0.5);
          const swingY = Math.sin(t * Math.PI) * liftAmount;
          finalY = THREE.MathUtils.lerp(startPos.y, targetLand.y, t) + swingY;

          // Orient facing forward towards target
          const dirToTarget = targetLand.clone().sub(startPos);
          dirToTarget.y = 0;
          if (dirToTarget.lengthSq() > 0.001) {
            const targetAngle = Math.atan2(dirToTarget.x, dirToTarget.z);
            _targetQuat.setFromAxisAngle(_up, targetAngle);
            const rotSlerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.18, dt * 60), 0, 1);
            group.current.quaternion.slerp(_targetQuat, rotSlerp);
          }

          // End dynamic swing -> update freePosition directly to landing spot
          if (t >= 1) {
            finishSwing();
            dynamicSwingStartRef.current = null;
            useStore.setState({ freePosition: new THREE.Vector3(finalX, targetLand.y, finalZ) });
          }
        } else {
          // Path mode dynamic swing (alley training phase)
          if (!pathCurve) return;
          const startFrac = dynamicSwingStartFracRef.current;
          const targetFrac = Math.min(1.0, startFrac + 0.16);
          fractionRef.current = THREE.MathUtils.lerp(startFrac, targetFrac, t);
          pathCurve.getPointAt(fractionRef.current, _posOnCurve);
          pathCurve.getTangentAt(fractionRef.current, _tangent);

          finalX = THREE.MathUtils.lerp(startPos.x, _posOnCurve.x, t);
          finalZ = THREE.MathUtils.lerp(startPos.z, _posOnCurve.z, t);

          const liftAmount = Math.max(4.5, (storeState.dynamicSwingTarget.y - _posOnCurve.y) * 0.45);
          const swingY = Math.sin(t * Math.PI) * liftAmount;
          finalY = THREE.MathUtils.lerp(startPos.y, _posOnCurve.y, t) + swingY;

          const lateralToBuilding = storeState.dynamicSwingTarget.clone().sub(_posOnCurve);
          lateralToBuilding.y = 0;
          const buildingPull = lateralToBuilding.multiplyScalar(Math.sin(t * Math.PI) * 0.22);
          finalX += buildingPull.x;
          finalZ += buildingPull.z;

          if (t >= 1) {
            finishSwing();
            dynamicSwingStartRef.current = null;
          }
        }
      } else if (currentlySwinging && currentScene === 'city') {
        // Regular Swing in City scene (kinematic)
        if (!dynamicSwingStartRef.current) {
          dynamicSwingStartRef.current = new THREE.Vector3(currentBodyPos.x, currentBodyPos.y, currentBodyPos.z);
          swingProgressRef.current = 0;

          // Calculate and cache camDir once at the start of the swing
          const camDir = new THREE.Vector3();
          state.camera.getWorldDirection(camDir);
          camDir.y = 0;
          camDir.normalize();
          dynamicSwingCamDirRef.current.copy(camDir);

          // Raycast once at the start of the swing to find the landing ground height
          const targetLand = dynamicSwingStartRef.current.clone().add(camDir.multiplyScalar(8.0));
          let targetGroundY = 0;
          const targets = storeState.aimTargets || [];
          if (targets.length > 0) {
            const rayStart = new THREE.Vector3(targetLand.x, 200, targetLand.z);
            const rayDir = new THREE.Vector3(0, -1, 0);
            raycaster.set(rayStart, rayDir);
            const intersects = raycaster.intersectObjects(targets, true);
            const validHit = intersects.find((hit) => hit.point.y > 0.05 && hit.point.y < 100);
            if (validHit) {
              targetGroundY = validHit.point.y;
            }
          }
          dynamicSwingTargetGroundYRef.current = targetGroundY;
        }

        swingProgressRef.current = Math.min(swingProgressRef.current + dt * 0.85, 1);
        const t = swingProgressRef.current;
        const startPos = dynamicSwingStartRef.current;
        const camDir = dynamicSwingCamDirRef.current;

        const targetLand = startPos.clone().add(camDir.clone().multiplyScalar(8.0));
        targetLand.y = dynamicSwingTargetGroundYRef.current;

        finalX = THREE.MathUtils.lerp(startPos.x, targetLand.x, t);
        finalZ = THREE.MathUtils.lerp(startPos.z, targetLand.z, t);
        const swingY = Math.sin(t * Math.PI) * 4.0;
        finalY = THREE.MathUtils.lerp(startPos.y, targetLand.y, t) + swingY;

        if (camDir.lengthSq() > 0.001) {
          const targetAngle = Math.atan2(camDir.x, camDir.z);
          _targetQuat.setFromAxisAngle(_up, targetAngle);
          const rotSlerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.18, dt * 60), 0, 1);
          group.current.quaternion.slerp(_targetQuat, rotSlerp);
        }

        if (t >= 1) {
          finishSwing();
          dynamicSwingStartRef.current = null;
          useStore.setState({ freePosition: new THREE.Vector3(finalX, targetLand.y, finalZ) });
        }
      } else {
        // Snapped Path Mode (Alley scene training & editor preview)
        dynamicSwingStartRef.current = null;

        if (pathCurve) {
          let targetSpeed = 0;
          let targetLateral = lateralOffsetRef.current;

          if (currentlySwinging) {
            targetSpeed = SWING_SPEED;
          } else {
            // Speed logic based on W/S or touch controls
            if (hasForward) {
              targetSpeed = MOVE_SPEED;
            } else if (hasBackward) {
              targetSpeed = -MOVE_SPEED * 0.6;
            } else {
              targetSpeed = 0;
            }

            // Lateral offset logic based on A/D or touch controls
            if (hasLeft) {
              targetLateral = Math.max(lateralOffsetRef.current - STRAFE_SPEED * dt, -MAX_STRAFE);
            } else if (hasRight) {
              targetLateral = Math.min(lateralOffsetRef.current + STRAFE_SPEED * dt, MAX_STRAFE);
            }
          }

          if (Math.abs(targetSpeed) > Math.abs(speedRef.current)) {
            speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, ACCELERATION * dt);
          } else {
            speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, DECELERATION * dt);
          }

          if (Math.abs(speedRef.current) < 0.001) speedRef.current = 0;

          fractionRef.current += speedRef.current * dt;
          fractionRef.current = THREE.MathUtils.clamp(fractionRef.current, 0, 1);

          pathCurve.getPointAt(fractionRef.current, _posOnCurve);
          pathCurve.getTangentAt(fractionRef.current, _tangent);
          _lateral.crossVectors(_tangent, _up).normalize();

          // Cast rays to detect walls in the Alley/Path mode and prevent clipping
          let limitLeft = -MAX_STRAFE;
          let limitRight = MAX_STRAFE;
          const targets = storeState.aimTargets || [];
          if (targets.length > 0) {
            const rayStart = _posOnCurve.clone().add(new THREE.Vector3(0, 0.8, 0)); // hip height
            
            // Raycast right
            const rayDirRight = _lateral.clone().normalize();
            raycaster.set(rayStart, rayDirRight);
            const intersectsRight = raycaster.intersectObjects(targets, true);
            const hitRight = intersectsRight.find(h => h.distance < MAX_STRAFE + 1.0);
            if (hitRight) {
              limitRight = Math.max(0.0, hitRight.distance - 0.45);
            }

            // Raycast left
            const rayDirLeft = _lateral.clone().negate().normalize();
            raycaster.set(rayStart, rayDirLeft);
            const intersectsLeft = raycaster.intersectObjects(targets, true);
            const hitLeft = intersectsLeft.find(h => h.distance < MAX_STRAFE + 1.0);
            if (hitLeft) {
              limitLeft = -Math.max(0.0, hitLeft.distance - 0.45);
            }
          }

          // Smoothly center lateral offset if side keys are released
          if (!hasLeft && !hasRight) {
            targetLateral = THREE.MathUtils.lerp(lateralOffsetRef.current, 0, 2.0 * dt);
          }

          // Clamp lateral offset to detected wall limits
          targetLateral = THREE.MathUtils.clamp(targetLateral, limitLeft, limitRight);
          lateralOffsetRef.current = targetLateral;

          finalX = _posOnCurve.x + _lateral.x * lateralOffsetRef.current;
          finalZ = _posOnCurve.z + _lateral.z * lateralOffsetRef.current;
          finalY = _posOnCurve.y;

          let jumpY = 0;
          if (currentAction === 'jump') {
            jumpProgressRef.current = Math.min(jumpProgressRef.current + dt * 1.55, 1);
            jumpY = Math.sin(jumpProgressRef.current * Math.PI) * 3.0;
            if (jumpProgressRef.current >= 1) {
              useStore.setState({ playerAction: 'idle' });
            }
          }

          if (currentlySwinging) {
            swingProgressRef.current = Math.min(swingProgressRef.current + dt * 1.1, 1);
            const arcT = swingProgressRef.current;
            swingYRef.current = SWING_LIFT * Math.sin(arcT * Math.PI);
            finalY += swingYRef.current + jumpY;
          } else {
            swingProgressRef.current = 0;
            swingYRef.current = THREE.MathUtils.lerp(swingYRef.current, 0, 5.0 * dt);
            finalY += swingYRef.current + jumpY;
          }
        }
      }

      // Calculate velocity
      const currentPos = new THREE.Vector3(finalX, finalY, finalZ);
      if (dt > 0) {
        const velocity = new THREE.Vector3()
          .subVectors(currentPos, prevPositionRef.current)
          .multiplyScalar(1 / dt);
        swingVelocityRef.current.copy(velocity);
      }
      
      // Kinematic collision prevention check (only in City Scene to prevent clipping buildings)
      if (currentScene === 'city' && currentlyKinematic && prevPositionRef.current.lengthSq() > 0.001) {
        const nextPos = new THREE.Vector3(finalX, finalY, finalZ);
        const moveDir = new THREE.Vector3().subVectors(nextPos, prevPositionRef.current);
        const moveDist = moveDir.length();
        if (moveDist > 0.01) {
          const targets = storeState.aimTargets || [];
          raycaster.set(prevPositionRef.current, moveDir.normalize());
          const intersects = raycaster.intersectObjects(targets, true);
          const hit = intersects.find(h => h.distance < moveDist + 0.35); // 0.35m buffer
          if (hit) {
            const offsetDir = moveDir.clone().negate().normalize();
            finalX = hit.point.x + offsetDir.x * 0.35;
            finalY = hit.point.y + offsetDir.y * 0.35;
            finalZ = hit.point.z + offsetDir.z * 0.35;
            currentPos.set(finalX, finalY, finalZ);
            
            // Cancel swing/zip on collision
            if (currentlySwinging) {
              finishSwing();
            } else if (currentlyZipping) {
              storeState.finishWebZip();
            }
            dynamicSwingStartRef.current = null;
            useStore.setState({ freePosition: new THREE.Vector3(finalX, finalY, finalZ) });
          }
        }
      }

      prevPositionRef.current.copy(currentPos);

      // Apply translation to kinematic body
      if (rigidBodyRef.current) {
        if (rigidBodyRef.current.bodyType() === 2) {
          rigidBodyRef.current.setNextKinematicTranslation({ x: finalX, y: finalY, z: finalZ });
          group.current.position.set(0, 0, 0); // Reset fallback offset
        } else {
          // Fallback during transition frames
          group.current.position.set(finalX, finalY, finalZ);
        }
      } else {
        // Fallback during transition frames when rigidBody is null
        group.current.position.set(finalX, finalY, finalZ);
      }

      // Sync to store
      useStore.setState({ characterPosition: [finalX, finalY, finalZ], freePosition: new THREE.Vector3(finalX, finalY, finalZ) });
      needsVelocitySeedRef.current = true;
    } else {
      // Dynamic State (free roaming street/rooftop movement in City scene)
      dynamicSwingStartRef.current = null;
      
      // Raycast down from capsule center to verify if player is grounded
      let isGrounded = false;
      if (rigidBodyRef.current) {
        const pos = rigidBodyRef.current.translation();
        const ray = new rapier.Ray(
          { x: pos.x, y: pos.y + 1.1, z: pos.z }, // capsule center
          { x: 0, y: -1, z: 0 } // downward
        );
        const hit = world.castRay(
          ray,
          1.15, // 1.1m center + 0.05m tolerance
          true,
          undefined,
          undefined,
          undefined,
          (collider) => !collider.parent() || collider.parent().handle !== rigidBodyRef.current.handle
        );
        isGrounded = hit !== null;
      }
      
      // Update playYawRef based on A/D steering inputs
      const turnSpeed = 3.2; // turn rate in radians/sec
      if (hasLeft) {
        playYawRef.current += turnSpeed * dt;
      }
      if (hasRight) {
        playYawRef.current -= turnSpeed * dt;
      }

      // Compute movement speed & direction
      let moveSpeedVal = 6.4; // standard speed (increased from 4.8)
      if (hasBackward && !hasForward) {
        moveSpeedVal = 3.2; // slower backward (increased from 2.4)
      }

      const charFacingDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(_up, playYawRef.current).normalize();
      const moveVec = new THREE.Vector3(0, 0, 0);

      if (hasForward) {
        moveVec.copy(charFacingDir);
      } else if (hasBackward) {
        moveVec.copy(charFacingDir).negate();
      }

      // Read current velocity from RigidBody to preserve gravity (y component)
      const currentVel = rigidBodyRef.current ? rigidBodyRef.current.linvel() : { x: 0, y: 0, z: 0 };
      
      let targetX = 0;
      let targetZ = 0;

      if (moveVec.lengthSq() > 0.001) {
        moveVec.normalize().multiplyScalar(moveSpeedVal);
        targetX = moveVec.x;
        targetZ = moveVec.z;
        speedRef.current = MOVE_SPEED;
      } else {
        targetX = 0;
        targetZ = 0;
        speedRef.current = 0;
      }

      // Smoothly rotate Spider-Man to face playYawRef.current (or negated if moonwalking)
      const targetAngle = currentAction === 'moonwalk' ? (playYawRef.current + Math.PI) : playYawRef.current;
      _targetQuat.setFromAxisAngle(_up, targetAngle);
      const rotSlerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.18, dt * 60), 0, 1);
      group.current.quaternion.slerp(_targetQuat, rotSlerp);

      let targetYVelocity = currentVel.y;

      // Handle edge-triggered jump
      if (currentAction === 'jump') {
        if (isGrounded) {
          if (!jumpImpulseAppliedRef.current) {
            targetYVelocity = 8.5; // Apply vertical jump impulse
            jumpImpulseAppliedRef.current = true;
          } else {
            // Transition back to idle when we hit the ground again and downward velocity ceases
            if (currentVel.y <= 0.1) {
              useStore.setState({ playerAction: 'idle' });
              jumpImpulseAppliedRef.current = false;
            }
          }
        }
      } else {
        jumpImpulseAppliedRef.current = false;
      }

      // Apply linear velocity to dynamic RigidBody
      if (rigidBodyRef.current) {
        rigidBodyRef.current.setLinvel({ x: targetX, y: targetYVelocity, z: targetZ }, true);
        
        // Ensure local group position is centered at [0, 0, 0] to avoid visual-physical misalignment
        if (group.current) {
          group.current.position.set(0, 0, 0);
        }
        
        // Sync position back to store
        const pos = rigidBodyRef.current.translation();
        useStore.setState({ characterPosition: [pos.x, pos.y, pos.z], freePosition: new THREE.Vector3(pos.x, pos.y, pos.z) });
        
        // Save current position for velocity tracking
        prevPositionRef.current.set(pos.x, pos.y, pos.z);
        
        finalX = pos.x;
        finalY = pos.y;
        finalZ = pos.z;
      }

      // Carry over swing exit velocity on the first dynamic frame
      if (needsVelocitySeedRef.current && rigidBodyRef.current && rigidBodyRef.current.bodyType() === 0) {
        const exitVel = swingVelocityRef.current.clone();
        exitVel.clampLength(0, 25);
        rigidBodyRef.current.wakeUp();
        rigidBodyRef.current.setLinvel(exitVel, true);
        needsVelocitySeedRef.current = false;
        console.log(`[SpiderMan Physics] Velocity seed applied and body woken up:`, exitVel.toArray());
      }
    }

    // Calculate projected swing landing point
    let landingPoint = null;
    if (currentlySwinging) {
      if (isDynamic && storeState.dynamicSwingTarget) {
        if (currentScene === 'city') {
          landingPoint = storeState.dynamicSwingTarget.clone();
          landingPoint.y = 0;
        } else {
          // Alley scene dynamic swing
          if (pathCurve) {
            const startFrac = dynamicSwingStartFracRef.current;
            const targetFrac = Math.min(1.0, startFrac + 0.16);
            landingPoint = new THREE.Vector3();
            pathCurve.getPointAt(targetFrac, landingPoint);
            
            const tempTangent = new THREE.Vector3();
            pathCurve.getTangentAt(targetFrac, tempTangent);
            const tempLateral = new THREE.Vector3().crossVectors(tempTangent, _up).normalize();
            landingPoint.addScaledVector(tempLateral, lateralOffsetRef.current);
          }
        }
      } else {
        // Regular Swing
        if (currentScene === 'city') {
          const camDir = new THREE.Vector3();
          state.camera.getWorldDirection(camDir);
          camDir.y = 0;
          camDir.normalize();

          const moveSpeedVal = 8.0;
          const horizVel = camDir.clone().multiplyScalar(moveSpeedVal);
          const remainingTime = (1.0 - swingProgressRef.current) / 0.85;

          const currentPos = storeState.freePosition ? storeState.freePosition.clone() : new THREE.Vector3(finalX, 0, finalZ);
          
          landingPoint = new THREE.Vector3(
            currentPos.x + horizVel.x * remainingTime,
            0,
            currentPos.z + horizVel.z * remainingTime
          );
        } else {
          // Alley scene regular swing
          if (pathCurve) {
            const remainingTime = (1.0 - swingProgressRef.current) / 1.5;
            const landingFrac = Math.min(1.0, fractionRef.current + SWING_SPEED * remainingTime);
            landingPoint = new THREE.Vector3();
            pathCurve.getPointAt(landingFrac, landingPoint);
            
            const tempTangent = new THREE.Vector3();
            pathCurve.getTangentAt(landingFrac, tempTangent);
            const tempLateral = new THREE.Vector3().crossVectors(tempTangent, _up).normalize();
            landingPoint.addScaledVector(tempLateral, lateralOffsetRef.current);
          }
        }
      }
    }
    useStore.setState({ swingLandingPoint: landingPoint });

    // Set player scale and visual position alignment
    group.current.scale.setScalar(scale);

    // Sync position back to store for HUD compass distance calculations
    useStore.setState({ characterPosition: [finalX, finalY, finalZ] });

    // ─── 3. Smooth Rotation (Alley Snapped Path mode) ───
    if (currentScene !== 'city' && (Math.abs(speedRef.current) > 0.01 || isDynamic || hasLeft || hasRight)) {
      const lookDir = new THREE.Vector3();
      const hasForwardOrBackward = hasForward || hasBackward;
      
      if (hasForwardOrBackward) {
        lookDir.copy(_tangent).multiplyScalar(speedRef.current >= 0 ? 1 : -1);
        if (hasLeft) {
          lookDir.addScaledVector(_lateral, -0.6);
        } else if (hasRight) {
          lookDir.addScaledVector(_lateral, 0.6);
        }
      } else if (hasLeft || hasRight) {
        lookDir.copy(_lateral).multiplyScalar(hasLeft ? -1 : 1);
      } else {
        lookDir.copy(_tangent);
      }
      lookDir.normalize();

      _lookTarget.copy(group.current.position).add(lookDir);
      _matrix.lookAt(group.current.position, _lookTarget, _up);
      _targetQuat.setFromRotationMatrix(_matrix);

      // Apply extra rotation from controls
      const rotYDeg = spiderCtrl?.rotation_y ?? 0;
      const additionalRot = new THREE.Quaternion().setFromAxisAngle(_up, THREE.MathUtils.degToRad(rotYDeg));
      _targetQuat.multiply(additionalRot);

      const rotSlerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.15, dt * 60), 0, 1);
      group.current.quaternion.slerp(_targetQuat, rotSlerp);
    }

    // ─── 4. Camera follow: Normal vs Over-The-Shoulder (OTS) Aiming ───
    group.current.updateMatrixWorld(true);
    group.current.getWorldPosition(_worldPos);

    if (isAiming && !currentlySwinging) {
      if (!justStartedAiming.current) {
        // Initialize yaw from Spiderman's current rotation (only outside city scene to keep aiming view continuous in city)
        if (currentScene !== 'city') {
          const euler = new THREE.Euler().setFromQuaternion(group.current.quaternion, 'YXZ');
          aimYawRef.current = euler.y;
        }
        aimPitchRef.current = 0;
        justStartedAiming.current = true;
      }

      // Rotate Spiderman to face the look direction
      _targetQuat.setFromAxisAngle(_up, aimYawRef.current);
      const rotSlerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.15, dt * 60), 0, 1);
      group.current.quaternion.slerp(_targetQuat, rotSlerp);

      // Rotate vectors by aimYawRef.current
      const rotatedBack = new THREE.Vector3(0, 0, -1).applyAxisAngle(_up, aimYawRef.current).negate();
      const rotatedRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(_up, aimYawRef.current);

      // Compute OTS offset (shoulder view)
      const cameraOffset = new THREE.Vector3()
        .addScaledVector(rotatedBack, 2.2)
        .addScaledVector(rotatedRight, 0.7)
        .addScaledVector(_up, 1.6);

      _camTarget.copy(_worldPos).add(cameraOffset);
      const aimLerpFactor = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.15, dt * 60), 0, 1);
      state.camera.position.lerp(_camTarget, aimLerpFactor);

      // Look target is in front of camera along the forward vector with vertical pitch
      const rotatedForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(_up, aimYawRef.current).negate();
      rotatedForward.y += Math.sin(aimPitchRef.current);
      _lookTarget.copy(state.camera.position).add(rotatedForward.multiplyScalar(10));
      state.camera.lookAt(_lookTarget);
      
      // Sync play yaw with aim yaw
      playYawRef.current = aimYawRef.current;
    } else {
      justStartedAiming.current = false;

      // Auto-align camera behind character (along path tangent in Alley, character heading in City)
      const charEuler = new THREE.Euler().setFromQuaternion(group.current.quaternion, 'YXZ');
      const charYaw = charEuler.y;

      let targetYaw = charYaw;
      if (currentScene !== 'city' && pathCurve) {
        const tangentVec = new THREE.Vector3();
        pathCurve.getTangentAt(fractionRef.current, tangentVec);
        targetYaw = Math.atan2(tangentVec.x, tangentVec.z);
      }

      if (!isPointerDownRef.current) {
        if (currentScene !== 'city') {
          // Always align camera to path tangent in Alley
          let diff = targetYaw - aimYawRef.current;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          const yawLerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.065, dt * 60), 0, 1);
          aimYawRef.current += diff * yawLerp;
        } else {
          // Align camera to Spiderman's back in the City scene
          let diff = playYawRef.current - aimYawRef.current;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          const yawLerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.05, dt * 60), 0, 1);
          aimYawRef.current += diff * yawLerp;
        }
      }

      // Normal follow camera (unified rotation-relative camera for both Alley and City)
      const camOffX = cameraCtrl?.camera_offset_x ?? 0;
      const camOffY = cameraCtrl?.camera_offset_y ?? 2;
      const camOffZ = cameraCtrl?.camera_offset_z ?? 5;
      const lerp = cameraCtrl?.camera_lerp ?? 0.08;

      const dynamicSwingHeight = isDynamic ? (finalY - _posOnCurve.y) : (currentScene === 'city' ? 0 : swingYRef.current);

      const angleY = aimYawRef.current;
      const rotatedBack = new THREE.Vector3(0, 0, -1).applyAxisAngle(_up, angleY);
      const rotatedRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(_up, angleY);

      _camTarget.copy(_worldPos)
        .addScaledVector(rotatedBack, camOffZ)
        .addScaledVector(rotatedRight, camOffX)
        .addScaledVector(_up, camOffY + dynamicSwingHeight * 0.5);

      const frameLerpFactor = THREE.MathUtils.clamp(1 - Math.pow(1 - lerp, dt * 60), 0, 1);
      state.camera.position.lerp(_camTarget, frameLerpFactor);

      const rawLookTarget = new THREE.Vector3(_worldPos.x, _worldPos.y + 1, _worldPos.z);
      const lookTargetLerp = THREE.MathUtils.clamp(1 - Math.pow(1 - 0.15, dt * 60), 0, 1);
      smoothedLookTargetRef.current.lerp(rawLookTarget, lookTargetLerp);
      state.camera.lookAt(smoothedLookTargetRef.current);
    }

    // ─── 5. Dynamic Camera FOV Aiming Zoom ───
    const defaultFov = cameraCtrl?.camera_fov ?? 50;
    const aimFov = cameraCtrl?.camera_aim_fov ?? 38;
    const targetFov = isAiming ? aimFov : defaultFov;
    if (Math.abs(state.camera.fov - targetFov) > 0.1) {
      state.camera.fov = THREE.MathUtils.lerp(state.camera.fov, targetFov, 10 * dt);
      state.camera.updateProjectionMatrix();
    }

    // ─── 5. Shadow Directional Light Tracking ───
    const dirLight = state.scene.getObjectByName('mainDirLight');
    if (dirLight) {
      const dirX = lightCtrl?.directional_x ?? 5;
      const dirY = lightCtrl?.directional_y ?? 10;
      const dirZ = lightCtrl?.directional_z ?? 5;
      dirLight.position.set(
        group.current.position.x + dirX,
        group.current.position.y + dirY,
        group.current.position.z + dirZ
      );
      dirLight.target.position.set(
        group.current.position.x,
        group.current.position.y,
        group.current.position.z
      );
      dirLight.target.updateMatrixWorld();
    }

    // ─── 6. Web Line Rendering Coordinates Update ───
    const isShooting = storeState.playerAction === 'webShoot';
    const isZipping = storeState.isWebZipping;

    if (currentlySwinging && swingWebRef.current) {
      const start = group.current.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      let anchor;
      if (isDynamic && storeState.dynamicSwingTarget) {
        anchor = storeState.dynamicSwingTarget;
      } else {
        // In free movement mode, anchor goes up and forward relative to facing direction
        if (currentScene === 'city') {
          anchor = start.clone().add(charForward.clone().multiplyScalar(4)).add(new THREE.Vector3(0, 10, 0));
        } else {
          anchor = new THREE.Vector3(start.x, start.y + 12 - swingYRef.current * 0.4, start.z - 3);
        }
      }
      swingWebRef.current.geometry.setFromPoints([start, anchor]);
      if (swingWebRef.current.geometry.attributes.position) {
        swingWebRef.current.geometry.attributes.position.needsUpdate = true;
      }
      swingWebRef.current.geometry.computeBoundingSphere();
      swingWebRef.current.geometry.computeBoundingBox();
      swingWebRef.current.visible = true;
    } else if (swingWebRef.current) {
      swingWebRef.current.visible = false;
    }

    if (isZipping && storeState.webZipTarget) {
      const start = group.current.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const target = storeState.webZipTarget;

      // Main web line
      shootWebRef.current.geometry.setFromPoints([start, target]);
      if (shootWebRef.current.geometry.attributes.position) {
        shootWebRef.current.geometry.attributes.position.needsUpdate = true;
      }
      shootWebRef.current.geometry.computeBoundingSphere();
      shootWebRef.current.visible = true;

      // Auxiliary webbing threads (little webs spreading out)
      const zipDir = target.clone().sub(start).normalize();
      const rightVec = new THREE.Vector3().crossVectors(zipDir, _up).normalize();
      const anchor1 = target.clone().addScaledVector(rightVec, 1.2).addScaledVector(_up, 0.8);
      const anchor2 = target.clone().addScaledVector(rightVec, -1.2).addScaledVector(_up, 0.8);

      if (webThread1Ref.current) {
        webThread1Ref.current.geometry.setFromPoints([start, anchor1]);
        if (webThread1Ref.current.geometry.attributes.position) {
          webThread1Ref.current.geometry.attributes.position.needsUpdate = true;
        }
        webThread1Ref.current.geometry.computeBoundingSphere();
        webThread1Ref.current.visible = true;
      }

      if (webThread2Ref.current) {
        webThread2Ref.current.geometry.setFromPoints([start, anchor2]);
        if (webThread2Ref.current.geometry.attributes.position) {
          webThread2Ref.current.geometry.attributes.position.needsUpdate = true;
        }
        webThread2Ref.current.geometry.computeBoundingSphere();
        webThread2Ref.current.visible = true;
      }
    } else if (isShooting && shootWebRef.current) {
      const start = group.current.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(group.current.quaternion).normalize();
      
      let end = start.clone().add(forward.clone().multiplyScalar(20));
      
      // Raycast in Alley scene to stick to walls
      const alleyGroup = state.scene.getObjectByName('alley-group');
      if (alleyGroup) {
        const leftDir = new THREE.Vector3().crossVectors(forward, _up).normalize();
        const rightDir = leftDir.clone().negate();
        const directions = [
          forward,
          leftDir,
          rightDir,
          forward.clone().add(leftDir).normalize(),
          forward.clone().add(rightDir).normalize()
        ];
        
        let closestHit = null;
        let minDistance = Infinity;
        
        for (const dir of directions) {
          raycaster.set(start, dir);
          const intersects = raycaster.intersectObjects(alleyGroup.children, true);
          if (intersects.length > 0) {
            const hit = intersects.find(h => h.distance < 30);
            if (hit && hit.distance < minDistance) {
              minDistance = hit.distance;
              closestHit = hit;
            }
          }
        }
        if (closestHit) {
          end = closestHit.point;
        }
      }
      
      shootWebRef.current.geometry.setFromPoints([start, end]);
      if (shootWebRef.current.geometry.attributes.position) {
        shootWebRef.current.geometry.attributes.position.needsUpdate = true;
      }
      shootWebRef.current.geometry.computeBoundingSphere();
      shootWebRef.current.geometry.computeBoundingBox();
      shootWebRef.current.visible = true;

      if (webThread1Ref.current) webThread1Ref.current.visible = false;
      if (webThread2Ref.current) webThread2Ref.current.visible = false;
    } else {
      if (shootWebRef.current) shootWebRef.current.visible = false;
      if (webThread1Ref.current) webThread1Ref.current.visible = false;
      if (webThread2Ref.current) webThread2Ref.current.visible = false;
    }
  });

  // Path line geometry
  const pathLineGeo = useMemo(() => {
    if (!pathCurve) return null;
    return new THREE.BufferGeometry().setFromPoints(pathCurve.getPoints(50));
  }, [pathCurve]);

  // ─── Character Lighting Calculations ───
  const isAlley = currentScene === 'entry';
  const activeKeyColor = charLight.match_scene
    ? (isAlley ? (neonCtrl?.neon1_color ?? '#00f3ff') : '#ffaa44')
    : charLight.key_color;

  const activeKeyIntensity = charLight.match_scene
    ? (isAlley ? 6 : 8)
    : charLight.key_intensity;

  const activeKeyPos = charLight.match_scene
    ? [0, 0.03, 0.04]
    : [charLight.key_x, charLight.key_y, charLight.key_z];

  const activeKeyDistance = charLight.match_scene ? 0.25 : charLight.key_distance;

  const activeFillColor = charLight.match_scene
    ? (isAlley ? (lightCtrl?.ambient_color ?? '#111122') : (lightCtrl?.ambient_color ?? '#223344'))
    : charLight.fill_color;

  const activeFillIntensity = charLight.match_scene
    ? (isAlley ? 2.5 : 4)
    : charLight.fill_intensity;

  const activeFillPos = charLight.match_scene
    ? [-0.04, 0.02, 0]
    : [charLight.fill_x, charLight.fill_y, charLight.fill_z];

  const activeFillDistance = charLight.match_scene ? 0.2 : charLight.fill_distance;

  const activeRimColor = useStore.getState().activeShowcaseProject
    ? '#00f3ff'
    : (charLight.match_scene
        ? (isAlley ? (neonCtrl?.neon3_color ?? '#ff0055') : '#88ccff')
        : charLight.rim_color);

  const activeRimIntensity = useStore.getState().activeShowcaseProject
    ? 15
    : (charLight.match_scene
        ? (isAlley ? 5 : 6)
        : charLight.rim_intensity);

  const activeRimPos = charLight.match_scene
    ? [0.03, 0.03, -0.04]
    : [charLight.rim_x, charLight.rim_y, charLight.rim_z];

  const activeRimDistance = charLight.match_scene ? 0.2 : charLight.rim_distance;

  return (
    <>
      {/* Spider-Man model */}
      <RigidBody
        ref={rigidBodyRef}
        key={editorMode ? `editor-${currentScene}` : `play-${currentScene}`}
        type={getBodyType()}
        enabledRotations={[false, false, false]}
        colliders={false}
        position={editorMode ? [0, 0, 0] : initialPosition}
      >
        <group
          ref={group}
          {...props}
          dispose={null}
          onClick={(e) => {
            if (editorMode && onSelect) {
              e.stopPropagation();
              onSelect();
            }
          }}
        >
          <primitive object={scene} dispose={null} />

          {/* ─── Character Lighting — dynamic environment or manual ─── */}
          <group>
            {/* Key light */}
            <pointLight
              position={activeKeyPos}
              intensity={activeKeyIntensity}
              color={activeKeyColor}
              distance={activeKeyDistance}
              decay={2}
            />
            {/* Fill light */}
            <pointLight
              position={activeFillPos}
              intensity={activeFillIntensity}
              color={activeFillColor}
              distance={activeFillDistance}
              decay={2}
            />
            {/* Rim light */}
            <pointLight
              position={activeRimPos}
              intensity={activeRimIntensity}
              color={activeRimColor}
              distance={activeRimDistance}
              decay={2}
            />
          </group>



          {/* Selection indicator */}
          {editorMode && isSelected && (
            <mesh position={[0, 0.025, 0]}>
              <sphereGeometry args={[0.002, 8, 8]} />
              <meshBasicMaterial color="#00f3ff" />
            </mesh>
          )}
          {/* Label (always mounted, hidden via visibility style to prevent Drei Html removeChild crashes) */}
          <Html
            center
            position={[0, 0.03, 0]}
            distanceFactor={0.08}
            style={{
              pointerEvents: 'none',
              display: editorMode ? 'block' : 'none'
            }}
          >
            <div className="editor-3d-label label-spider">
              Spider-Man
              {activeAnimation && <span className="label-anim"> — {activeAnimation}</span>}
            </div>
          </Html>
        </group>
        {!editorMode && <CapsuleCollider args={[0.8, 0.3]} position={[0, 1.1, 0]} />}
      </RigidBody>

      {/* Swing Web Line */}
      <line ref={swingWebRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#ffffff" linewidth={3} transparent opacity={0.85} />
      </line>
      
      {/* Shoot Web Line */}
      <line ref={shootWebRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#ffffff" linewidth={4} transparent opacity={0.95} />
      </line>

      {/* Auxiliary Web Thread 1 */}
      <line ref={webThread1Ref}>
        <bufferGeometry />
        <lineBasicMaterial color="#ffffff" linewidth={1.5} transparent opacity={0.65} />
      </line>

      {/* Auxiliary Web Thread 2 */}
      <line ref={webThread2Ref}>
        <bufferGeometry />
        <lineBasicMaterial color="#ffffff" linewidth={1.5} transparent opacity={0.65} />
      </line>

      {/* Path Line */}
      {currentScene !== 'city' && debugVisuals?.show_path_line && pathLineGeo && (
        <line geometry={pathLineGeo}>
          <lineBasicMaterial color="red" linewidth={3} />
        </line>
      )}

      {/* Grid */}
      {debugVisuals?.show_grid && (
        <Grid
          position={[0, -0.01, 0]}
          args={[100, 100]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#333333"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#555555"
          fadeDistance={60}
          infiniteGrid
        />
      )}

      {/* Axes Helper */}
      {debugVisuals?.show_axes && <axesHelper args={[10]} />}
    </>
  );
}

useGLTF.preload('/src/assets/spiderman.glb');
