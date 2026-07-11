import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useGLTF, useAnimations, Grid, Html } from '@react-three/drei';
import { useStore } from '../../store/useStore';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import * as THREE from 'three';

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
const MOVE_SPEED = 0.08; // path fraction per second when running (~12s for full path)
const STRAFE_SPEED = 1.5; // lateral offset speed (units/sec)
const MAX_STRAFE = 1.5; // max lateral offset from path
const ACCELERATION = 4.0; // speed ramp up factor
const DECELERATION = 6.0; // speed ramp down factor
const ROTATION_SMOOTHING = 10.0; // rotation slerp speed
const SWING_SPEED = 0.15; // faster movement while swinging
const SWING_LIFT = 4.0; // vertical lift during swing

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

  // ─── Animation tracking ───
  const currentActionRef = useRef(null);
  const currentAnimName = useRef('');
  const prevPlayerAction = useRef('idle');

  // ─── Movement state ───
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
  const aimPitchRef = useRef(0);
  const justStartedAiming = useRef(false);
  const lastTouchRef = useRef({ x: 0, y: 0 });
  const camYawRef = useRef(null); // follow-camera yaw for city free-roam (null = uninitialized)

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
        const anim = animMap.jumpUp || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.1, timeScale: 1.2 });
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
      default: {
        const anim = animMap.idle || Object.keys(actions)[0];
        if (anim) playAnimation(anim, { fadeIn: 0.25 });
        break;
      }
    }
  }, [editorMode, playerAction, isSwinging, swingPhase, animMap, playAnimation, actions]);

  // ─── Mouse Aiming (Movement Delta) and Pointer Lock Listeners ───
  useEffect(() => {
    const handlePointerMove = (e) => {
      const storeState = useStore.getState();
      if (storeState.isAiming) {
        aimYawRef.current -= e.movementX * 0.0025;
        aimPitchRef.current = Math.max(-0.6, Math.min(0.6, aimPitchRef.current - e.movementY * 0.0025));
      }
    };

    const handleTouchStart = (e) => {
      if (e.touches.length > 0) {
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleTouchMove = (e) => {
      const storeState = useStore.getState();
      if (storeState.isAiming && e.touches.length > 0) {
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        
        aimYawRef.current -= dx * 0.005;
        aimPitchRef.current = Math.max(-0.6, Math.min(0.6, aimPitchRef.current - dy * 0.005));

        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    // Subscribe to aiming state to request PointerLock.
    // NOTE: plain zustand subscribe(listener) receives (state, prevState) —
    // the selector signature only works with the subscribeWithSelector middleware,
    // which this store doesn't use. Compare prev/next manually instead.
    const unsub = useStore.subscribe((state, prevState) => {
      if (state.isAiming === prevState.isAiming) return;
      const canvas = document.querySelector('canvas');
      if (state.isAiming) {
        if (canvas && canvas.requestPointerLock) {
          try {
            const maybePromise = canvas.requestPointerLock();
            if (maybePromise && typeof maybePromise.catch === 'function') {
              maybePromise.catch(() => {});
            }
          } catch (err) {
            // Pointer lock can fail without a user gesture — aiming still works via mouse deltas
          }
        }
      } else {
        if (document.exitPointerLock && document.pointerLockElement === canvas) {
          document.exitPointerLock();
        }
      }
    });

    return () => {
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

  // Initialize play mode fraction from closest point on path to editor settled position
  useEffect(() => {
    if (!editorMode && pathCurve && spiderManPos) {
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
      fractionRef.current = closestFraction;
      console.log(`[SpiderMan] Synced starting path fraction to ${closestFraction.toFixed(3)} based on editor position`);
    } else if (editorMode) {
      fractionRef.current = 0;
      speedRef.current = 0;
    }
  }, [editorMode, pathCurve, spiderManPos]);

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

    // ─── Editor Mode ───
    if (editorMode) {
      group.current.position.set(0, 0, 0);
      group.current.scale.setScalar(spiderCtrl?.scale ?? 100);
      const rotYDeg = spiderCtrl?.rotation_y ?? 0;
      group.current.rotation.y = THREE.MathUtils.degToRad(rotYDeg);
      return;
    }

    // Read store states
    const storeState = useStore.getState();
    const currentScene = storeState.currentScene;
    const currentAction = storeState.playerAction;
    const currentlySwinging = storeState.isSwinging;
    const currentlyZipping = storeState.isWebZipping;
    const isAiming = storeState.isAiming;
    const isDynamic = storeState.isDynamicSwinging;

    const dt = Math.min(delta, 0.05); // cap delta to prevent jumps
    const scale = spiderCtrl?.scale ?? 100;

    // ─── 1. Sci-Fi Aiming & Raycasting Target Check (Throttled & Optimized) ───
    if (isAiming && !currentlySwinging && !currentlyZipping) {
      let shouldRaycast = true;
      if (graphicsPreset === 'Performance') {
        shouldRaycast = (frameCountRef.current % 3 === 0);
      } else if (graphicsPreset === 'Balanced') {
        shouldRaycast = (frameCountRef.current % 2 === 0);
      }

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

    // ─── 2. Calculate coordinates (Dynamic Swing vs Free Roaming vs Path Snapping) ───
    let finalX = 0;
    let finalY = 0;
    let finalZ = 0;

    // Get character facing direction for local camera orientation
    const charForward = new THREE.Vector3(0, 0, 1).applyQuaternion(group.current.quaternion).normalize();
    const charRight = new THREE.Vector3(1, 0, 0).applyQuaternion(group.current.quaternion).normalize();

    if (currentlyZipping && storeState.webZipTarget) {
      // Initialize zip start position
      if (!dynamicSwingStartRef.current) {
        dynamicSwingStartRef.current = group.current.position.clone();
        useStore.setState({ webZipStart: dynamicSwingStartRef.current });
        webZipProgressRef.current = 0;
      }

      // Progress zip physics interpolation
      webZipProgressRef.current = Math.min(webZipProgressRef.current + dt * 2.8, 1);
      const t = webZipProgressRef.current;
      const startPos = dynamicSwingStartRef.current;

      finalX = THREE.MathUtils.lerp(startPos.x, storeState.webZipTarget.x, t);
      finalY = THREE.MathUtils.lerp(startPos.y, storeState.webZipTarget.y, t);
      finalZ = THREE.MathUtils.lerp(startPos.z, storeState.webZipTarget.z, t);

      // Orient Spider-Man facing the zip target horizontally
      const dirToTarget = storeState.webZipTarget.clone().sub(startPos);
      dirToTarget.y = 0;
      if (dirToTarget.lengthSq() > 0.001) {
        const targetAngle = Math.atan2(dirToTarget.x, dirToTarget.z);
        _targetQuat.setFromAxisAngle(_up, targetAngle);
        group.current.quaternion.slerp(_targetQuat, 15 * dt);
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
        const charPos = storeState.characterPosition;
        finalX = charPos[0];
        finalY = charPos[1];
        finalZ = charPos[2];
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
        dynamicSwingStartRef.current = group.current.position.clone();
        dynamicSwingStartFracRef.current = fractionRef.current;
        useStore.setState({ dynamicSwingStart: dynamicSwingStartRef.current });
      }

      // Progress swing
      swingProgressRef.current = Math.min(swingProgressRef.current + dt * 1.15, 1);
      const t = swingProgressRef.current;

      const startPos = dynamicSwingStartRef.current;

      if (currentScene === 'city') {
        // In free roaming mode, swing towards the target horizontally and land under it
        const targetLand = storeState.dynamicSwingTarget.clone();
        targetLand.y = 0; // land on ground
        
        finalX = THREE.MathUtils.lerp(startPos.x, targetLand.x, t);
        finalZ = THREE.MathUtils.lerp(startPos.z, targetLand.z, t);
        
        const liftAmount = Math.max(5.0, (storeState.dynamicSwingTarget.y) * 0.5);
        const swingY = Math.sin(t * Math.PI) * liftAmount;
        finalY = THREE.MathUtils.lerp(startPos.y, 0, t) + swingY;

        // Orient facing forward towards target
        const dirToTarget = targetLand.clone().sub(startPos);
        dirToTarget.y = 0;
        if (dirToTarget.lengthSq() > 0.001) {
          const targetAngle = Math.atan2(dirToTarget.x, dirToTarget.z);
          _targetQuat.setFromAxisAngle(_up, targetAngle);
          group.current.quaternion.slerp(_targetQuat, 12 * dt);
        }

        // End dynamic swing -> update freePosition directly to landing spot
        if (t >= 1) {
          finishSwing();
          dynamicSwingStartRef.current = null;
          useStore.setState({ freePosition: new THREE.Vector3(finalX, 0, finalZ) });
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
    } else if (currentScene === 'city') {
      // ─── Free Roaming Street Movement inside City Scene ───
      dynamicSwingStartRef.current = null;

      // 1. Initialize freePosition if null
      if (!storeState.freePosition) {
        const startPos = new THREE.Vector3(spiderManPos.x, spiderManPos.y, spiderManPos.z);
        useStore.setState({ freePosition: startPos });
        storeState.freePosition = startPos;
      }

      // 2. Get camera direction projected horizontally
      const camDir = new THREE.Vector3();
      state.camera.getWorldDirection(camDir);
      camDir.y = 0;
      camDir.normalize();

      const camRight = new THREE.Vector3();
      camRight.crossVectors(camDir, _up).normalize();

      // 3. Compute movement speed & direction
      let moveSpeedVal = 10.5; // standard speed (faster, less constrained)
      if (currentlySwinging) {
        moveSpeedVal = 18.0; // faster while swinging
      } else if (currentAction === 'runBackward') {
        moveSpeedVal = 5.5; // slower backward
      }

      const moveVec = new THREE.Vector3(0, 0, 0);
      if (currentAction === 'runForward' || currentlySwinging) {
        moveVec.add(camDir);
      } else if (currentAction === 'runBackward') {
        moveVec.add(camDir.clone().negate());
      } else if (currentAction === 'strafeLeft') {
        moveVec.add(camRight.clone().negate());
      } else if (currentAction === 'strafeRight') {
        moveVec.add(camRight);
      }

      if (moveVec.lengthSq() > 0.001) {
        moveVec.normalize().multiplyScalar(moveSpeedVal * dt);
        // Smoothly rotate Spider-Man to face movement direction
        const targetAngle = Math.atan2(moveVec.x, moveVec.z);
        _targetQuat.setFromAxisAngle(_up, targetAngle);
        group.current.quaternion.slerp(_targetQuat, 12 * dt);
      }

      // 4. Bounding box sliding collision check (solid buildings)
      const currentPos = storeState.freePosition.clone();
      const targetPos = currentPos.clone().add(moveVec);

      const testPosX = new THREE.Vector3(targetPos.x, currentPos.y, currentPos.z);
      const testPosZ = new THREE.Vector3(currentPos.x, currentPos.y, targetPos.z);

      let collidesX = false;
      let collidesZ = false;

      const obstacles = storeState.solidObstacles || [];
      const playerRadius = 0.22; // smaller collision buffer for fluid sliding around corners

      for (let i = 0; i < obstacles.length; i++) {
        const box = obstacles[i];
        // Only test bounding boxes within proximity range (5m) to ensure 60fps
        const dist = box.distanceToPoint(currentPos);
        if (dist < 5.0) {
          const paddedBox = box.clone().expandByScalar(playerRadius);
          if (!collidesX && paddedBox.containsPoint(testPosX)) {
            collidesX = true;
          }
          if (!collidesZ && paddedBox.containsPoint(testPosZ)) {
            collidesZ = true;
          }
          if (collidesX && collidesZ) break;
        }
      }

      if (!collidesX) currentPos.x = targetPos.x;
      if (!collidesZ) currentPos.z = targetPos.z;

      // Clamp absolute world boundaries (larger region to allow freedom of exploration)
      currentPos.x = THREE.MathUtils.clamp(currentPos.x, -120, 120);
      currentPos.z = THREE.MathUtils.clamp(currentPos.z, -120, 120);

      // ─── Depenetration: if we ended up INSIDE an obstacle (e.g. after landing
      // from a swing / web-zip release), push out through the nearest face so the
      // player never gets permanently stuck inside a building collider.
      if (!currentlySwinging) {
        for (let i = 0; i < obstacles.length; i++) {
          const box = obstacles[i];
          if (box.distanceToPoint(currentPos) > 0.001) continue; // only when inside
          const pushPosX = (box.max.x + playerRadius) - currentPos.x;
          const pushNegX = currentPos.x - (box.min.x - playerRadius);
          const pushPosZ = (box.max.z + playerRadius) - currentPos.z;
          const pushNegZ = currentPos.z - (box.min.z - playerRadius);
          const minPush = Math.min(pushPosX, pushNegX, pushPosZ, pushNegZ);
          if (minPush === pushPosX) currentPos.x = box.max.x + playerRadius + 0.01;
          else if (minPush === pushNegX) currentPos.x = box.min.x - playerRadius - 0.01;
          else if (minPush === pushPosZ) currentPos.z = box.max.z + playerRadius + 0.01;
          else currentPos.z = box.min.z - playerRadius - 0.01;
        }
      }

      // 5. Vertical swing leap calculations
      if (currentlySwinging) {
        swingProgressRef.current = Math.min(swingProgressRef.current + dt * 1.5, 1);
        const swingY = Math.sin(swingProgressRef.current * Math.PI) * 4.0;
        currentPos.y = swingY;
      } else {
        swingProgressRef.current = 0;
        currentPos.y = THREE.MathUtils.lerp(currentPos.y, 0, 5.0 * dt);
      }

      // 6. Save back to store & set coordinates
      useStore.setState({ freePosition: currentPos });

      finalX = currentPos.x;
      finalY = currentPos.y;
      finalZ = currentPos.z;

      // Fake speed value for running animations
      speedRef.current = moveVec.lengthSq() > 0.0001 ? MOVE_SPEED : 0;
    } else {
      // ─── Snapped Path Mode (Alley scene training & editor preview) ───
      dynamicSwingStartRef.current = null;

      if (!pathCurve) return;

      let targetSpeed = 0;
      let targetLateral = lateralOffsetRef.current;

      if (currentlySwinging) {
        targetSpeed = SWING_SPEED;
      } else {
        switch (currentAction) {
          case 'runForward':
            targetSpeed = MOVE_SPEED;
            break;
          case 'runBackward':
            targetSpeed = -MOVE_SPEED * 0.6;
            break;
          case 'strafeLeft':
            targetLateral = Math.max(lateralOffsetRef.current - STRAFE_SPEED * dt, -MAX_STRAFE);
            break;
          case 'strafeRight':
            targetLateral = Math.min(lateralOffsetRef.current + STRAFE_SPEED * dt, MAX_STRAFE);
            break;
          default:
            targetSpeed = 0;
            break;
        }
      }

      // Smooth speed ramping
      if (Math.abs(targetSpeed) > Math.abs(speedRef.current)) {
        speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, ACCELERATION * dt);
      } else {
        speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, DECELERATION * dt);
      }

      if (Math.abs(speedRef.current) < 0.001) speedRef.current = 0;

      // Update path position fraction
      fractionRef.current += speedRef.current * dt;
      fractionRef.current = THREE.MathUtils.clamp(fractionRef.current, 0, 1);

      // Return to center when not strafing
      if (currentAction !== 'strafeLeft' && currentAction !== 'strafeRight') {
        targetLateral = THREE.MathUtils.lerp(lateralOffsetRef.current, 0, 2.0 * dt);
      }
      lateralOffsetRef.current = targetLateral;

      // Compute standard positions
      pathCurve.getPointAt(fractionRef.current, _posOnCurve);
      pathCurve.getTangentAt(fractionRef.current, _tangent);
      _lateral.crossVectors(_tangent, _up).normalize();

      finalX = _posOnCurve.x + _lateral.x * lateralOffsetRef.current;
      finalZ = _posOnCurve.z + _lateral.z * lateralOffsetRef.current;
      finalY = _posOnCurve.y;

      // Normal vertical swing arc
      if (currentlySwinging) {
        swingProgressRef.current = Math.min(swingProgressRef.current + dt * 1.5, 1);
        const arcT = swingProgressRef.current;
        swingYRef.current = SWING_LIFT * Math.sin(arcT * Math.PI);
        finalY += swingYRef.current;
      } else {
        swingProgressRef.current = 0;
        swingYRef.current = THREE.MathUtils.lerp(swingYRef.current, 0, 5.0 * dt);
        finalY += swingYRef.current;
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

          const moveSpeedVal = 18.0;
          const horizVel = camDir.clone().multiplyScalar(moveSpeedVal);
          const remainingTime = (1.0 - swingProgressRef.current) / 1.5;

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

    // Set player position and scale
    group.current.position.set(finalX, finalY, finalZ);
    group.current.scale.setScalar(scale);

    // Sync position back to store for HUD compass distance calculations
    useStore.setState({ characterPosition: [finalX, finalY, finalZ] });

    // ─── 3. Smooth Rotation (Alley Snapped Path mode) ───
    if (currentScene !== 'city' && (Math.abs(speedRef.current) > 0.01 || isDynamic)) {
      const lookDir = speedRef.current >= 0 ? _tangent : _tangent.clone().negate();
      _lookTarget.copy(group.current.position).add(lookDir);
      _matrix.lookAt(group.current.position, _lookTarget, _up);
      _targetQuat.setFromRotationMatrix(_matrix);

      // Apply extra rotation from controls
      const rotYDeg = spiderCtrl?.rotation_y ?? 0;
      const additionalRot = new THREE.Quaternion().setFromAxisAngle(_up, THREE.MathUtils.degToRad(rotYDeg));
      _targetQuat.multiply(additionalRot);

      group.current.quaternion.slerp(_targetQuat, ROTATION_SMOOTHING * dt);
    }

    // ─── 4. Camera follow: Normal vs Over-The-Shoulder (OTS) Aiming ───
    group.current.getWorldPosition(_worldPos);

    if (isAiming && !currentlySwinging) {
      if (!justStartedAiming.current) {
        // Initialize yaw from Spiderman's current rotation
        const euler = new THREE.Euler().setFromQuaternion(group.current.quaternion, 'YXZ');
        aimYawRef.current = euler.y;
        aimPitchRef.current = 0;
        justStartedAiming.current = true;
      }

      // Rotate Spiderman to face the look direction
      _targetQuat.setFromAxisAngle(_up, aimYawRef.current);
      group.current.quaternion.slerp(_targetQuat, 10 * dt);

      // Keep the follow-camera yaw in sync so exiting aim mode doesn't snap the camera
      camYawRef.current = aimYawRef.current;

      // Rotate vectors by aimYawRef.current
      const rotatedBack = new THREE.Vector3(0, 0, -1).applyAxisAngle(_up, aimYawRef.current).negate();
      const rotatedRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(_up, aimYawRef.current);

      // Compute OTS offset (shoulder view)
      const cameraOffset = new THREE.Vector3()
        .addScaledVector(rotatedBack, 2.2)
        .addScaledVector(rotatedRight, 0.7)
        .addScaledVector(_up, 1.6);

      _camTarget.copy(group.current.position).add(cameraOffset);
      state.camera.position.lerp(_camTarget, 0.15);

      // Look target is in front of camera along the forward vector with vertical pitch
      const rotatedForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(_up, aimYawRef.current).negate();
      rotatedForward.y += Math.sin(aimPitchRef.current);
      _lookTarget.copy(state.camera.position).add(rotatedForward.multiplyScalar(10));
      state.camera.lookAt(_lookTarget);
    } else {
      justStartedAiming.current = false;

      // Normal follow camera
      const camOffX = cameraCtrl?.camera_offset_x ?? 0;
      const camOffY = cameraCtrl?.camera_offset_y ?? 2;
      const camOffZ = cameraCtrl?.camera_offset_z ?? 5;
      const lerp = cameraCtrl?.camera_lerp ?? 0.08;

      const dynamicSwingHeight = isDynamic ? (finalY - _posOnCurve.y) : (currentScene === 'city' ? finalY : swingYRef.current);

      if (currentScene === 'city') {
        // ─── Third-person orbit camera: stays BEHIND Spider-Man ───
        // The old fixed world-space offset meant "forward" never changed,
        // so WASD felt broken (A/D ran sideways forever, camera never turned).
        const charEuler = new THREE.Euler().setFromQuaternion(group.current.quaternion, 'YXZ');
        const charYaw = charEuler.y;

        if (camYawRef.current === null) camYawRef.current = charYaw;

        // Only swing the camera behind the character while moving forward or web-swinging.
        // (Not while strafing/backing up — that would create a rotation feedback loop.)
        if (currentAction === 'runForward' || currentlySwinging) {
          let yawDiff = charYaw - camYawRef.current;
          yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff)); // shortest path
          camYawRef.current += yawDiff * Math.min(1, 3.0 * dt);
        }

        // Character forward is +Z rotated by yaw
        const fwdX = Math.sin(camYawRef.current);
        const fwdZ = Math.cos(camYawRef.current);
        // right = up × fwd
        const rightX = fwdZ;
        const rightZ = -fwdX;

        _camTarget.set(
          _worldPos.x - fwdX * camOffZ + rightX * camOffX,
          _worldPos.y + camOffY + dynamicSwingHeight * 0.5,
          _worldPos.z - fwdZ * camOffZ + rightZ * camOffX
        );
      } else {
        // Alley scene keeps the original fixed-offset cinematic camera
        _camTarget.set(
          _worldPos.x + camOffX,
          _worldPos.y + camOffY + dynamicSwingHeight * 0.5,
          _worldPos.z + camOffZ
        );
      }
      state.camera.position.lerp(_camTarget, lerp);

      _lookTarget.set(_worldPos.x, _worldPos.y + 1, _worldPos.z);
      state.camera.lookAt(_lookTarget);
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

  const activeRimColor = charLight.match_scene
    ? (isAlley ? (neonCtrl?.neon3_color ?? '#ff0055') : '#88ccff')
    : charLight.rim_color;

  const activeRimIntensity = charLight.match_scene
    ? (isAlley ? 5 : 6)
    : charLight.rim_intensity;

  const activeRimPos = charLight.match_scene
    ? [0.03, 0.03, -0.04]
    : [charLight.rim_x, charLight.rim_y, charLight.rim_z];

  const activeRimDistance = charLight.match_scene ? 0.2 : charLight.rim_distance;

  return (
    <>
      {/* Spider-Man model */}
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
