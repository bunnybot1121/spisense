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
  ...props
}) {
  const group = useRef();
  const { scene, animations } = useGLTF('/src/assets/spiderman.glb');
  const { actions, mixer } = useAnimations(animations, group);
  const currentScene = useStore((s) => s.currentScene);
  const playerAction = useStore((s) => s.playerAction);
  const isSwinging = useStore((s) => s.isSwinging);
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
        const anim = animMap.strafeLeft || animMap.run || animMap.walk || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.15 });
        break;
      }
      case 'strafeRight': {
        const anim = animMap.strafeRight || animMap.run || animMap.walk || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.15 });
        break;
      }
      case 'webShoot': {
        const anim = animMap.webShoot || animMap.idle;
        if (anim) playAnimation(anim, { fadeIn: 0.1, timeScale: 1.5 });
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
    if (!group.current) return;

    // ─── Editor Mode ───
    if (editorMode) {
      group.current.position.set(0, 0, 0);
      group.current.scale.setScalar(spiderCtrl?.scale ?? 1);
      const rotYDeg = spiderCtrl?.rotation_y ?? 0;
      group.current.rotation.y = THREE.MathUtils.degToRad(rotYDeg);
      return;
    }

    // ─── Play Mode: Player-driven movement ───
    if (!pathCurve) return;

    const dt = Math.min(delta, 0.05); // cap delta to prevent jumps
    const scale = spiderCtrl?.scale ?? 1;

    // Read store state directly each frame for real-time responsiveness
    const storeState = useStore.getState();
    const currentAction = storeState.playerAction;
    const currentlySwinging = storeState.isSwinging;

    // ── Determine target speed based on action ──
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
          targetSpeed = -MOVE_SPEED * 0.6; // slower backward
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

    // ── Smooth speed ramping ──
    if (Math.abs(targetSpeed) > Math.abs(speedRef.current)) {
      speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, ACCELERATION * dt);
    } else {
      speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, DECELERATION * dt);
    }

    // Kill tiny residual speeds
    if (Math.abs(speedRef.current) < 0.001) speedRef.current = 0;

    // ── Update path fraction ──
    fractionRef.current += speedRef.current * dt;
    fractionRef.current = THREE.MathUtils.clamp(fractionRef.current, 0, 1);

    // ── Update lateral offset (return to center when not strafing) ──
    if (currentAction !== 'strafeLeft' && currentAction !== 'strafeRight') {
      targetLateral = THREE.MathUtils.lerp(lateralOffsetRef.current, 0, 2.0 * dt);
    }
    lateralOffsetRef.current = targetLateral;

    // ── Compute position on curve ──
    pathCurve.getPointAt(fractionRef.current, _posOnCurve);
    pathCurve.getTangentAt(fractionRef.current, _tangent);

    // Lateral direction = tangent × up (perpendicular)
    _lateral.crossVectors(_tangent, _up).normalize();

    // Apply lateral offset
    const finalX = _posOnCurve.x + _lateral.x * lateralOffsetRef.current;
    const finalZ = _posOnCurve.z + _lateral.z * lateralOffsetRef.current;
    let finalY = _posOnCurve.y;

    // ── Swing vertical arc ──
    if (currentlySwinging) {
      swingProgressRef.current = Math.min(swingProgressRef.current + dt * 1.5, 1);
      // Parabolic arc
      const arcT = swingProgressRef.current;
      swingYRef.current = SWING_LIFT * Math.sin(arcT * Math.PI);
      finalY += swingYRef.current;
    } else {
      swingProgressRef.current = 0;
      swingYRef.current = THREE.MathUtils.lerp(swingYRef.current, 0, 5.0 * dt);
      finalY += swingYRef.current;
    }

    // ── Set position ──
    group.current.position.set(finalX, finalY, finalZ);
    group.current.scale.setScalar(scale);

    // ── Smooth rotation (slerp instead of lookAt snapping) ──
    if (Math.abs(speedRef.current) > 0.01) {
      const lookDir = speedRef.current > 0 ? _tangent : _tangent.clone().negate();
      _lookTarget.copy(group.current.position).add(lookDir);
      _matrix.lookAt(group.current.position, _lookTarget, _up);
      _targetQuat.setFromRotationMatrix(_matrix);

      // Apply additional rotation from controls
      const rotYDeg = spiderCtrl?.rotation_y ?? 0;
      const additionalRot = new THREE.Quaternion().setFromAxisAngle(_up, THREE.MathUtils.degToRad(rotYDeg));
      _targetQuat.multiply(additionalRot);

      group.current.quaternion.slerp(_targetQuat, ROTATION_SMOOTHING * dt);
    }

    // ── Camera follow ──
    group.current.getWorldPosition(_worldPos);
    const camOffX = cameraCtrl?.camera_offset_x ?? 0;
    const camOffY = cameraCtrl?.camera_offset_y ?? 2;
    const camOffZ = cameraCtrl?.camera_offset_z ?? 5;
    const lerp = cameraCtrl?.camera_lerp ?? 0.08;

    _camTarget.set(
      _worldPos.x + camOffX,
      _worldPos.y + camOffY + swingYRef.current * 0.5,
      _worldPos.z + camOffZ
    );
    state.camera.position.lerp(_camTarget, lerp);

    _lookTarget.set(_worldPos.x, _worldPos.y + 1, _worldPos.z);
    state.camera.lookAt(_lookTarget);

    // ── Directional Light Follow (Shadows) ──
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

    // ─── Web Line Coordinates Update ───
    const isShooting = storeState.playerAction === 'webShoot';

    if (currentlySwinging && swingWebRef.current) {
      const start = group.current.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const anchor = new THREE.Vector3(start.x, start.y + 12 - swingYRef.current * 0.4, start.z - 3);
      swingWebRef.current.geometry.setFromPoints([start, anchor]);
      swingWebRef.current.visible = true;
    } else if (swingWebRef.current) {
      swingWebRef.current.visible = false;
    }

    if (isShooting && shootWebRef.current) {
      const start = group.current.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(group.current.quaternion).normalize();
      const end = start.clone().add(forward.multiplyScalar(20));
      shootWebRef.current.geometry.setFromPoints([start, end]);
      shootWebRef.current.visible = true;
    } else if (shootWebRef.current) {
      shootWebRef.current.visible = false;
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
        <primitive object={scene} />

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

      {/* Path Line */}
      {debugVisuals?.show_path_line && pathLineGeo && (
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
