import React, { Suspense, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, Stars, OrbitControls, TransformControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { useControls, button, Leva } from 'leva';

import { useStore } from './store/useStore';
import Preloader from './components/ui/Preloader';
import EntryUI from './components/ui/EntryUI';
import EditorPanel from './components/ui/EditorPanel';
import GameControls from './components/ui/GameControls';
import SpiderMan from './components/3d/SpiderMan';
import AlleyScene from './scenes/AlleyScene';
import CityScene from './scenes/CityScene';

// ─── User's scene configuration ───
const INITIAL_SPIDERMAN = {
  position: { x: 0.30297567199812936, y: 0, z: 12.235997026238893 },
  rotation_y: 0,
  scale: 1,
};

const INITIAL_PATH_POINTS = [
  { x: 0.37, y: 0.06, z: 12.63 },
  { x: 0.57, y: -0.05, z: 7.44 },
  { x: 0.34, y: -0.05, z: 3.74 },
  { x: 0.21, y: 0, z: -1.57 },
  { x: 0.16, y: -0.01, z: -7.32 },
  { x: -0.6, y: 0.04, z: -14.4 },
  { x: -0.6, y: 0.04, z: -19.4 },
];

const INITIAL_SEGMENT_ANIMATIONS = [
  { segment: 0, from: 0, to: 1, animation: 'idle' },
  { segment: 1, from: 1, to: 2, animation: 'idle' },
  { segment: 2, from: 2, to: 3, animation: 'idle' },
  { segment: 3, from: 3, to: 4, animation: 'idle' },
  { segment: 4, from: 4, to: 5, animation: 'jumpUp' },
  { segment: 5, from: 5, to: 6, animation: 'jumpUp' },
];

// ─── Interactive Path Point ───
function PathPointSphere({ index, position, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshBasicMaterial
          color={isSelected ? '#ffff00' : hovered ? '#ff8800' : '#ff3333'}
          transparent
          opacity={isSelected ? 1 : 0.85}
        />
      </mesh>
      {/* Glow ring when selected */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.5, 32]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Point number label */}
      <Html center position={[0, 0.6, 0]} distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div className="editor-3d-label label-point">{index + 1}</div>
      </Html>
    </group>
  );
}

// ─── Scene Director ───
function SceneDirector({
  editorMode,
  selectedType,
  selectedIndex,
  onSelectPoint,
  onSelectSpiderMan,
  onDeselectAll,
  pointsData,
  setPointsData,
  spiderManPos,
  setSpiderManPos,
  segmentAnimations,
  animationNames,
  setAnimationNames,
  activeAnimation,
  onActiveAnimationChange,
}) {
  const { currentScene } = useStore();

  // Refs for TransformControls targets
  const pointGroupRefs = useRef([]);
  const spiderGroupRef = useRef();
  const transformRef = useRef();

  // ─── FOLDER: Spider-Man (Leva — rotation/scale only) ───
  const spiderCtrl = useControls('Spider-Man', {
    rotation_y: { value: INITIAL_SPIDERMAN.rotation_y, min: -180, max: 180, step: 1 },
    scale: { value: INITIAL_SPIDERMAN.scale * 100, min: 1, max: 500, step: 1 },
  });

  // ─── FOLDER: Alley Model ───
  const alleyCtrl = useControls('Alley Model', {
    alley_x: { value: 0, min: -20, max: 20, step: 0.1 },
    alley_y: { value: 0, min: -10, max: 10, step: 0.1 },
    alley_z: { value: 0, min: -20, max: 20, step: 0.1 },
    alley_rotation_y: { value: 0, min: -180, max: 180, step: 1 },
    alley_scale: { value: 1, min: 0.1, max: 5, step: 0.1 },
  });

  // ─── FOLDER: City Model ───
  const cityCtrl = useControls('City Model', {
    city_x: { value: 0, min: -50, max: 50, step: 0.1 },
    city_y: { value: 0, min: -10, max: 10, step: 0.1 },
    city_z: { value: 0, min: -50, max: 50, step: 0.1 },
    city_rotation_y: { value: 0, min: -180, max: 180, step: 1 },
    city_scale: { value: 1, min: 0.1, max: 5, step: 0.1 },
  });

  // ─── FOLDER: Camera ───
  const cameraCtrl = useControls('Camera', {
    camera_offset_x: { value: 0, min: -10, max: 10, step: 0.1 },
    camera_offset_y: { value: 2, min: 0, max: 10, step: 0.1 },
    camera_offset_z: { value: 5, min: 1, max: 20, step: 0.1 },
    camera_lerp: { value: 0.08, min: 0.01, max: 1, step: 0.01 },
  });

  // ─── FOLDER: Lighting ───
  const lightCtrl = useControls('Lighting', {
    ambient_intensity: { value: 0.3, min: 0, max: 2, step: 0.1 },
    ambient_color: '#111122',
    directional_intensity: { value: 0.5, min: 0, max: 2, step: 0.1 },
    directional_x: { value: 5, min: -20, max: 20, step: 0.1 },
    directional_y: { value: 10, min: 0, max: 30, step: 0.1 },
    directional_z: { value: 5, min: -20, max: 20, step: 0.1 },
    fog_near: { value: 10, min: 1, max: 50, step: 1 },
    fog_far: { value: 100, min: 10, max: 300, step: 1 },
  });

  // ─── FOLDER: Debug Visuals ───
  const debugVisuals = useControls('Debug Visuals', {
    show_path_line: true,
    show_path_spheres: true,
    show_grid: true,
    show_axes: true,
  });

  // ─── Get selected object reference for TransformControls ───
  const selectedObjectRef = useMemo(() => {
    if (!editorMode) return null;
    if (selectedType === 'point' && selectedIndex !== null) {
      return pointGroupRefs.current[selectedIndex] || null;
    }
    if (selectedType === 'spiderman') {
      return spiderGroupRef.current || null;
    }
    return null;
  }, [editorMode, selectedType, selectedIndex]);

  // ─── Sync TransformControls position back to state on drag end ───
  const handleTransformChange = useCallback(() => {
    if (!selectedObjectRef) return;
    const pos = selectedObjectRef.position;
    if (selectedType === 'point' && selectedIndex !== null) {
      setPointsData(prev => {
        const updated = [...prev];
        updated[selectedIndex] = { x: pos.x, y: pos.y, z: pos.z };
        return updated;
      });
    } else if (selectedType === 'spiderman') {
      setSpiderManPos({ x: pos.x, y: pos.y, z: pos.z });
    }
  }, [selectedObjectRef, selectedType, selectedIndex, setPointsData, setSpiderManPos]);

  // ─── Animations loaded callback ───
  const handleAnimationsLoaded = useCallback((names) => {
    setAnimationNames(names);
  }, [setAnimationNames]);

  return (
    <>
      {/* ─── Entry Scene ─── */}
      {currentScene === 'entry' && (
        <group>
          {/* Lighting */}
          <ambientLight intensity={lightCtrl.ambient_intensity} color={lightCtrl.ambient_color} />
          <directionalLight
            position={[lightCtrl.directional_x, lightCtrl.directional_y, lightCtrl.directional_z]}
            intensity={lightCtrl.directional_intensity}
            color="#ffffff"
            castShadow
          />
          <fog attach="fog" args={['#050511', lightCtrl.fog_near, lightCtrl.fog_far]} />

          {/* Neon accent lights */}
          <pointLight position={[2, 4, 2]} intensity={20} color="#00f3ff" distance={10} />
          <pointLight position={[-2, 3, 5]} intensity={15} color="#9d00ff" distance={15} />
          <pointLight position={[0, 5, -2]} intensity={10} color="#ff0055" distance={8} />

          {/* Camera — editor gets orbit, normal gets fixed */}
          {editorMode ? (
            <>
              <PerspectiveCamera makeDefault fov={50} position={[5, 6, 12]} />
              <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
            </>
          ) : (
            <PerspectiveCamera makeDefault fov={50} position={[0, 1.5, 6]} />
          )}

          <Suspense fallback={null}>
            {/* Alley Background */}
            <AlleyScene alleyCtrl={alleyCtrl} />

            {/* Spider-Man */}
            <group ref={spiderGroupRef} position={[spiderManPos.x, spiderManPos.y, spiderManPos.z]}>
              <SpiderMan
                spiderCtrl={spiderCtrl}
                cameraCtrl={cameraCtrl}
                pathPoints={pointsData}
                debugVisuals={debugVisuals}
                segmentAnimations={segmentAnimations}
                editorMode={editorMode}
                spiderManPos={spiderManPos}
                isSelected={selectedType === 'spiderman'}
                onSelect={onSelectSpiderMan}
                onAnimationsLoaded={handleAnimationsLoaded}
                activeAnimation={activeAnimation}
                onActiveAnimationChange={onActiveAnimationChange}
              />
            </group>
          </Suspense>

          {/* Interactive Path Points (editor mode) */}
          {editorMode && debugVisuals.show_path_spheres && pointsData.map((p, i) => (
            <group
              key={`editable-pt-${i}`}
              ref={(el) => { if (el) pointGroupRefs.current[i] = el; }}
              position={[p.x, p.y, p.z]}
            >
              <PathPointSphere
                index={i}
                position={{ x: 0, y: 0, z: 0 }}
                isSelected={selectedType === 'point' && selectedIndex === i}
                onSelect={onSelectPoint}
              />
            </group>
          ))}

          {/* Non-editor path points */}
          {!editorMode && debugVisuals.show_path_spheres && pointsData.map((p, i) => (
            <mesh key={`pt-${i}`} position={[p.x, p.y, p.z]}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshBasicMaterial color="red" />
            </mesh>
          ))}

          {/* TransformControls for selected object */}
          {editorMode && selectedObjectRef && (
            <TransformControls
              ref={transformRef}
              object={selectedObjectRef}
              mode="translate"
              size={0.8}
              onMouseUp={handleTransformChange}
            />
          )}

          <Stars radius={50} depth={20} count={1000} factor={2} saturation={0} fade speed={1} />
        </group>
      )}

      {/* ─── City Scene (unchanged) ─── */}
      {currentScene === 'city' && (
        <group>
          <ambientLight intensity={lightCtrl.ambient_intensity} color={lightCtrl.ambient_color} />
          <directionalLight
            position={[lightCtrl.directional_x, lightCtrl.directional_y, lightCtrl.directional_z]}
            intensity={lightCtrl.directional_intensity}
            color="#ffffff"
            castShadow
          />
          <fog attach="fog" args={['#050511', lightCtrl.fog_near, lightCtrl.fog_far]} />
          <pointLight position={[0, 10, 0]} intensity={15} color="#00f3ff" distance={50} />
          <PerspectiveCamera makeDefault position={[0, 2, 10]} fov={50} />
          <Suspense fallback={null}>
            <CityScene cityCtrl={cityCtrl} />
            <SpiderMan
              spiderCtrl={spiderCtrl}
              cameraCtrl={cameraCtrl}
              pathPoints={pointsData}
              debugVisuals={debugVisuals}
              segmentAnimations={segmentAnimations}
            />
          </Suspense>
        </group>
      )}
    </>
  );
}

// ─── App ───
function App() {
  // Editor state
  const [editorMode, setEditorMode] = useState(true);
  const [selectedType, setSelectedType] = useState(null); // 'point' | 'spiderman' | null
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [animationNames, setAnimationNames] = useState([]);
  const [activeAnimation, setActiveAnimation] = useState(null);

  // Path points state — loaded from user's config
  const [pointsData, setPointsData] = useState(INITIAL_PATH_POINTS);

  // Spider-Man position state — loaded from user's config
  const [spiderManPos, setSpiderManPos] = useState(INITIAL_SPIDERMAN.position);

  // Segment animations — loaded from user's config
  const [segmentAnimations, setSegmentAnimations] = useState(
    INITIAL_SEGMENT_ANIMATIONS.map((s) => s.animation)
  );

  // Initialize segment animations when points or animations change
  useEffect(() => {
    const numSegments = Math.max(0, pointsData.length - 1);
    setSegmentAnimations(prev => {
      const next = [...prev];
      while (next.length < numSegments) {
        next.push(animationNames[0] || 'idle');
      }
      return next.slice(0, numSegments);
    });
  }, [pointsData.length, animationNames]);

  // Selection handlers
  const handleSelectPoint = useCallback((index) => {
    setSelectedType('point');
    setSelectedIndex(index);
  }, []);

  const handleSelectSpiderMan = useCallback(() => {
    setSelectedType('spiderman');
    setSelectedIndex(null);
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedType(null);
    setSelectedIndex(null);
  }, []);

  // Path point management
  const handleAddPoint = useCallback(() => {
    setPointsData(prev => {
      const last = prev[prev.length - 1] || { x: 0, y: 0, z: 0 };
      return [...prev, { x: last.x, y: last.y, z: last.z - 5 }];
    });
  }, []);

  const handleRemovePoint = useCallback(() => {
    setPointsData(prev => (prev.length > 2 ? prev.slice(0, -1) : prev));
    // Deselect if removed point was selected
    setSelectedType(t => {
      if (t === 'point') {
        setSelectedIndex(null);
        return null;
      }
      return t;
    });
  }, []);

  // Segment animation change
  const handleSegmentAnimationChange = useCallback((segmentIndex, animName) => {
    setSegmentAnimations(prev => {
      const next = [...prev];
      next[segmentIndex] = animName;
      return next;
    });
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Preloader />

      {/* Hide Leva debug panel in play mode */}
      <Leva hidden={!editorMode} />

      <Canvas
        shadows
        dpr={[1, 2]}
        onPointerMissed={handleDeselectAll}
      >
        <SceneDirector
          editorMode={editorMode}
          selectedType={selectedType}
          selectedIndex={selectedIndex}
          onSelectPoint={handleSelectPoint}
          onSelectSpiderMan={handleSelectSpiderMan}
          onDeselectAll={handleDeselectAll}
          pointsData={pointsData}
          setPointsData={setPointsData}
          spiderManPos={spiderManPos}
          setSpiderManPos={setSpiderManPos}
          segmentAnimations={segmentAnimations}
          animationNames={animationNames}
          setAnimationNames={setAnimationNames}
          activeAnimation={activeAnimation}
          onActiveAnimationChange={setActiveAnimation}
        />
      </Canvas>

      <EntryUI />

      {/* Game Controls (only in play mode / non-editor) */}
      {!editorMode && <GameControls />}

      {/* Editor Panel (only in entry scene + editor mode) */}
      {editorMode && (
        <EditorPanel
          selectedType={selectedType}
          selectedIndex={selectedIndex}
          pointsData={pointsData}
          segmentAnimations={segmentAnimations}
          animationNames={animationNames}
          spiderManPos={spiderManPos}
          onAddPoint={handleAddPoint}
          onRemovePoint={handleRemovePoint}
          onSegmentAnimationChange={handleSegmentAnimationChange}
          onDeselectAll={handleDeselectAll}
          editorMode={editorMode}
          onToggleEditorMode={() => setEditorMode(m => !m)}
          activeAnimation={activeAnimation}
          onActiveAnimationChange={setActiveAnimation}
        />
      )}

      {/* Toggle editor button (always visible) */}
      {!editorMode && (
        <button
          className="editor-toggle-btn glass-panel"
          onClick={() => setEditorMode(true)}
        >
          ✏️ Editor
        </button>
      )}
    </div>
  );
}

export default App;
