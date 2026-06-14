import React, { Suspense, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, Stars, OrbitControls, TransformControls, Html, Environment } from '@react-three/drei';
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
import TutorialPanel from './components/ui/TutorialPanel';
import AudioPlayer from './components/ui/AudioPlayer';
import WebShooterHUD, { HUDUpdater } from './components/ui/WebShooterHUD';

// ─── LocalStorage Helpers ───
const loadSavedState = (key, defaultValue) => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved || saved === 'null' || saved === 'undefined') return defaultValue;
    const parsed = JSON.parse(saved);
    return parsed !== null ? parsed : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const loadPresetState = () => {
  try {
    const saved = localStorage.getItem('spisense_fixed_config');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return null;
};

// ─── User's scene configuration ───
const INITIAL_SPIDERMAN = {
  position: { x: 0.30297567199812936, y: 0, z: 12.235997026238893 },
  rotation_y: -180,
  scale: 0.95,
};

const INITIAL_PATH_POINTS = [
  { x: 0.37, y: 0.06, z: 12.63 },
  { x: 0.28, y: -0.02, z: 7.44 },
  { x: 0.17, y: -0.08, z: 3.76 },
  { x: -0.13, y: 0, z: -1.57 },
  { x: -0.32, y: -0.01, z: -7.32 },
  { x: -0.94, y: 0.04, z: -14.4 },
  { x: -1.22, y: 0.04, z: -19.4 },
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
function PathPointSphere({ index, position, isSelected, onSelect, visible }) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={[position.x, position.y, position.z]}>
      {visible && (
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
      )}
      {/* Glow ring when selected */}
      {visible && isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.5, 32]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Point number label */}
      <Html
        center
        position={[0, 0.6, 0]}
        distanceFactor={8}
        style={{
          pointerEvents: 'none',
          display: visible ? 'block' : 'none'
        }}
      >
        <div className="editor-3d-label label-point">{index + 1}</div>
      </Html>
    </group>
  );
}

// ─── Sci-Fi Holographic 3D Target Marker (Aim/Swing Landing Mode) ───
function HolographicTarget({ position, color = "#00f3ff" }) {
  const ringRef = useRef();
  useFrame((state) => {
    if (ringRef.current) {
      const pulse = 1 + Math.sin(state.clock.getElapsedTime() * 12) * 0.15;
      ringRef.current.scale.set(pulse, pulse, 1);
    }
  });

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* Outer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.9, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} side={THREE.DoubleSide} />
      </mesh>
      {/* Inner pulsing ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.45, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* Center core */}
      <mesh>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
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
  onSelectNeon,
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
  // Leva controls passed as props
  spiderCtrl,
  alleyCtrl,
  cityCtrl,
  cameraCtrl,
  lightAlleyCtrl,
  lightCityCtrl,
  neonAlleyCtrl,
  neonCityCtrl,
  setNeonAlley,
  setNeonCity,
  debugVisuals,
  previewPlayCamera,
  graphicsPreset,
  enableShadows,
}) {
  const currentScene = useStore((s) => s.currentScene);
  const isAiming = useStore((s) => s.isAiming);
  const hasTarget = useStore((s) => s.hasTarget);
  const targetPoint = useStore((s) => s.targetPoint);
  const isSwinging = useStore((s) => s.isSwinging);
  const swingLandingPoint = useStore((s) => s.swingLandingPoint);

  // Refs for TransformControls targets
  const pointGroupRefs = useRef([]);
  const spiderGroupRef = useRef();
  const neon1Ref = useRef();
  const neon2Ref = useRef();
  const neon3Ref = useRef();
  const transformRef = useRef();

  // ─── Get selected object reference for TransformControls ───
  const selectedObjectRef = useMemo(() => {
    if (!editorMode) return null;
    if (selectedType === 'point' && selectedIndex !== null) {
      return pointGroupRefs.current[selectedIndex] || null;
    }
    if (selectedType === 'spiderman') {
      return spiderGroupRef.current || null;
    }
    if (selectedType === 'neon1') {
      return neon1Ref.current || null;
    }
    if (selectedType === 'neon2') {
      return neon2Ref.current || null;
    }
    if (selectedType === 'neon3') {
      return neon3Ref.current || null;
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
    } else if (selectedType === 'neon1') {
      const setter = currentScene === 'entry' ? setNeonAlley : setNeonCity;
      setter({ neon1_x: pos.x, neon1_y: pos.y, neon1_z: pos.z });
    } else if (selectedType === 'neon2') {
      const setter = currentScene === 'entry' ? setNeonAlley : setNeonCity;
      setter({ neon2_x: pos.x, neon2_y: pos.y, neon2_z: pos.z });
    } else if (selectedType === 'neon3') {
      const setter = currentScene === 'entry' ? setNeonAlley : setNeonCity;
      setter({ neon3_x: pos.x, neon3_y: pos.y, neon3_z: pos.z });
    }
  }, [selectedObjectRef, selectedType, selectedIndex, setPointsData, setSpiderManPos, currentScene, setNeonAlley, setNeonCity]);

  // ─── Animations loaded callback ───
  const handleAnimationsLoaded = useCallback((names) => {
    setAnimationNames(names);
  }, [setAnimationNames]);

  // Camera angle preview updates
  useFrame((state) => {
    if (editorMode && previewPlayCamera) {
      const camOffX = cameraCtrl?.camera_offset_x ?? 0;
      const camOffY = cameraCtrl?.camera_offset_y ?? 2;
      const camOffZ = cameraCtrl?.camera_offset_z ?? 5;
      state.camera.position.set(
        spiderManPos.x + camOffX,
        spiderManPos.y + camOffY,
        spiderManPos.z + camOffZ
      );
      state.camera.lookAt(spiderManPos.x, spiderManPos.y + 1, spiderManPos.z);
    }
  });

  return (
    <>
      {/* ─── Entry Scene ─── */}
      {currentScene === 'entry' && (
        <group>
          {/* Lighting */}
          <ambientLight intensity={lightAlleyCtrl.ambient_intensity} color={lightAlleyCtrl.ambient_color} />
          <directionalLight
            name="mainDirLight"
            position={[lightAlleyCtrl.directional_x, lightAlleyCtrl.directional_y, lightAlleyCtrl.directional_z]}
            intensity={lightAlleyCtrl.directional_intensity}
            color="#ffffff"
            castShadow={enableShadows}
            shadow-mapSize-width={graphicsPreset === 'High' ? 1024 : 512}
            shadow-mapSize-height={graphicsPreset === 'High' ? 1024 : 512}
            shadow-camera-near={0.5}
            shadow-camera-far={50}
            shadow-camera-left={-12}
            shadow-camera-right={12}
            shadow-camera-top={12}
            shadow-camera-bottom={-12}
            shadow-bias={-0.0005}
          />
          <fog attach="fog" args={['#050511', lightAlleyCtrl.fog_near, lightAlleyCtrl.fog_far]} />

          {lightAlleyCtrl.env_preset !== 'none' && (
            <Environment preset={lightAlleyCtrl.env_preset} background={false} environmentIntensity={lightAlleyCtrl.env_intensity} />
          )}

          {/* Neon accent lights */}
          <pointLight position={[neonAlleyCtrl.neon1_x, neonAlleyCtrl.neon1_y, neonAlleyCtrl.neon1_z]} intensity={neonAlleyCtrl.neon1_intensity} color={neonAlleyCtrl.neon1_color} distance={15} />
          <pointLight position={[neonAlleyCtrl.neon2_x, neonAlleyCtrl.neon2_y, neonAlleyCtrl.neon2_z]} intensity={neonAlleyCtrl.neon2_intensity} color={neonAlleyCtrl.neon2_color} distance={20} />
          <pointLight position={[neonAlleyCtrl.neon3_x, neonAlleyCtrl.neon3_y, neonAlleyCtrl.neon3_z]} intensity={neonAlleyCtrl.neon3_intensity} color={neonAlleyCtrl.neon3_color} distance={15} />

          {/* Neon Light Helpers in Editor Mode */}
          {editorMode && debugVisuals.show_light_helpers && (
            <group>
              <group ref={neon1Ref} position={[neonAlleyCtrl.neon1_x, neonAlleyCtrl.neon1_y, neonAlleyCtrl.neon1_z]}>
                <mesh onClick={(e) => { e.stopPropagation(); onSelectNeon('neon1'); }}>
                  <sphereGeometry args={[0.3, 16, 16]} />
                  <meshBasicMaterial color={neonAlleyCtrl.neon1_color} wireframe={selectedType !== 'neon1'} transparent opacity={selectedType === 'neon1' ? 1.0 : 0.6} />
                </mesh>
                <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                  <div className="editor-3d-label label-neon" style={{ color: neonAlleyCtrl.neon1_color }}>Neon 1</div>
                </Html>
              </group>
              <group ref={neon2Ref} position={[neonAlleyCtrl.neon2_x, neonAlleyCtrl.neon2_y, neonAlleyCtrl.neon2_z]}>
                <mesh onClick={(e) => { e.stopPropagation(); onSelectNeon('neon2'); }}>
                  <sphereGeometry args={[0.3, 16, 16]} />
                  <meshBasicMaterial color={neonAlleyCtrl.neon2_color} wireframe={selectedType !== 'neon2'} transparent opacity={selectedType === 'neon2' ? 1.0 : 0.6} />
                </mesh>
                <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                  <div className="editor-3d-label label-neon" style={{ color: neonAlleyCtrl.neon2_color }}>Neon 2</div>
                </Html>
              </group>
              <group ref={neon3Ref} position={[neonAlleyCtrl.neon3_x, neonAlleyCtrl.neon3_y, neonAlleyCtrl.neon3_z]}>
                <mesh onClick={(e) => { e.stopPropagation(); onSelectNeon('neon3'); }}>
                  <sphereGeometry args={[0.3, 16, 16]} />
                  <meshBasicMaterial color={neonAlleyCtrl.neon3_color} wireframe={selectedType !== 'neon3'} transparent opacity={selectedType === 'neon3' ? 1.0 : 0.6} />
                </mesh>
                <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                  <div className="editor-3d-label label-neon" style={{ color: neonAlleyCtrl.neon3_color }}>Neon 3</div>
                </Html>
              </group>
            </group>
          )}

          {/* Camera — editor gets orbit, normal gets fixed */}
          {editorMode ? (
            <>
              <PerspectiveCamera makeDefault fov={50} position={[5, 6, 12]} />
              {!previewPlayCamera && <OrbitControls makeDefault enableDamping dampingFactor={0.1} />}
            </>
          ) : (
            <PerspectiveCamera makeDefault fov={50} position={[0, 1.5, 6]} />
          )}

          <Suspense fallback={null}>
            {/* Alley Background */}
            <AlleyScene alleyCtrl={alleyCtrl} enableShadows={enableShadows} />

            {/* Sci-Fi Web Anchor Holographic 3D Target Marker */}
            {!editorMode && isAiming && hasTarget && targetPoint && (
              <HolographicTarget position={targetPoint} />
            )}

            {/* Projected Landing Indicator during swing */}
            {!editorMode && isSwinging && swingLandingPoint && (
              <HolographicTarget position={swingLandingPoint} color="#00ff55" />
            )}

            {/* Spider-Man */}
            <group ref={spiderGroupRef} position={editorMode ? [spiderManPos.x, spiderManPos.y, spiderManPos.z] : [0, 0, 0]}>
              <SpiderMan
                spiderCtrl={spiderCtrl}
                cameraCtrl={cameraCtrl}
                lightCtrl={lightAlleyCtrl}
                neonCtrl={neonAlleyCtrl}
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
                graphicsPreset={graphicsPreset}
                enableShadows={enableShadows}
              />
            </group>
          </Suspense>

          {/* Interactive Path Points (always mounted, hidden via visibility prop to prevent Drei Html removeChild crashes) */}
          {pointsData.map((p, i) => (
            <group
              key={`editable-pt-${i}`}
              ref={(el) => { if (el) pointGroupRefs.current[i] = el; }}
              position={[p.x, p.y, p.z]}
              visible={editorMode && debugVisuals.show_path_spheres}
            >
              <PathPointSphere
                index={i}
                position={{ x: 0, y: 0, z: 0 }}
                isSelected={selectedType === 'point' && selectedIndex === i}
                onSelect={onSelectPoint}
                visible={editorMode && debugVisuals.show_path_spheres}
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

      {/* ─── City Scene ─── */}
      {currentScene === 'city' && (
        <group>
          {/* Lighting */}
          <ambientLight intensity={lightCityCtrl.ambient_intensity} color={lightCityCtrl.ambient_color} />
          <directionalLight
            name="mainDirLight"
            position={[lightCityCtrl.directional_x, lightCityCtrl.directional_y, lightCityCtrl.directional_z]}
            intensity={lightCityCtrl.directional_intensity}
            color="#ffffff"
            castShadow={enableShadows}
            shadow-mapSize-width={graphicsPreset === 'High' ? 1024 : 512}
            shadow-mapSize-height={graphicsPreset === 'High' ? 1024 : 512}
            shadow-camera-near={0.5}
            shadow-camera-far={100}
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={15}
            shadow-camera-bottom={-15}
            shadow-bias={-0.0005}
          />
          <fog attach="fog" args={['#050511', lightCityCtrl.fog_near, lightCityCtrl.fog_far]} />

          {lightCityCtrl.env_preset !== 'none' && (
            <Environment preset={lightCityCtrl.env_preset} background={false} environmentIntensity={lightCityCtrl.env_intensity} />
          )}

          {/* Neon accent lights */}
          <pointLight position={[neonCityCtrl.neon1_x, neonCityCtrl.neon1_y, neonCityCtrl.neon1_z]} intensity={neonCityCtrl.neon1_intensity} color={neonCityCtrl.neon1_color} distance={15} />
          <pointLight position={[neonCityCtrl.neon2_x, neonCityCtrl.neon2_y, neonCityCtrl.neon2_z]} intensity={neonCityCtrl.neon2_intensity} color={neonCityCtrl.neon2_color} distance={20} />
          <pointLight position={[neonCityCtrl.neon3_x, neonCityCtrl.neon3_y, neonCityCtrl.neon3_z]} intensity={neonCityCtrl.neon3_intensity} color={neonCityCtrl.neon3_color} distance={15} />

          {/* Neon Light Helpers in Editor Mode */}
          {editorMode && debugVisuals.show_light_helpers && (
            <group>
              <group ref={neon1Ref} position={[neonCityCtrl.neon1_x, neonCityCtrl.neon1_y, neonCityCtrl.neon1_z]}>
                <mesh onClick={(e) => { e.stopPropagation(); onSelectNeon('neon1'); }}>
                  <sphereGeometry args={[0.3, 16, 16]} />
                  <meshBasicMaterial color={neonCityCtrl.neon1_color} wireframe={selectedType !== 'neon1'} transparent opacity={selectedType === 'neon1' ? 1.0 : 0.6} />
                </mesh>
                <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                  <div className="editor-3d-label label-neon" style={{ color: neonCityCtrl.neon1_color }}>Neon 1</div>
                </Html>
              </group>
              <group ref={neon2Ref} position={[neonCityCtrl.neon2_x, neonCityCtrl.neon2_y, neonCityCtrl.neon2_z]}>
                <mesh onClick={(e) => { e.stopPropagation(); onSelectNeon('neon2'); }}>
                  <sphereGeometry args={[0.3, 16, 16]} />
                  <meshBasicMaterial color={neonCityCtrl.neon2_color} wireframe={selectedType !== 'neon2'} transparent opacity={selectedType === 'neon2' ? 1.0 : 0.6} />
                </mesh>
                <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                  <div className="editor-3d-label label-neon" style={{ color: neonCityCtrl.neon2_color }}>Neon 2</div>
                </Html>
              </group>
              <group ref={neon3Ref} position={[neonCityCtrl.neon3_x, neonCityCtrl.neon3_y, neonCityCtrl.neon3_z]}>
                <mesh onClick={(e) => { e.stopPropagation(); onSelectNeon('neon3'); }}>
                  <sphereGeometry args={[0.3, 16, 16]} />
                  <meshBasicMaterial color={neonCityCtrl.neon3_color} wireframe={selectedType !== 'neon3'} transparent opacity={selectedType === 'neon3' ? 1.0 : 0.6} />
                </mesh>
                <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                  <div className="editor-3d-label label-neon" style={{ color: neonCityCtrl.neon3_color }}>Neon 3</div>
                </Html>
              </group>
            </group>
          )}

          {/* Camera — editor gets orbit, normal gets fixed */}
          {editorMode ? (
            <>
              <PerspectiveCamera makeDefault fov={50} position={[0, 15, 40]} />
              {!previewPlayCamera && <OrbitControls makeDefault enableDamping dampingFactor={0.1} />}
            </>
          ) : (
            <PerspectiveCamera makeDefault fov={50} position={[0, 2, 10]} />
          )}

          <Suspense fallback={null}>
            {/* City Background */}
            <CityScene cityCtrl={cityCtrl} enableShadows={enableShadows} />

            {/* High Performance Compass Tape & Crosshair Readout Updater */}
            {!editorMode && <HUDUpdater />}

            {/* Sci-Fi Web Anchor Holographic 3D Target Marker */}
            {!editorMode && isAiming && hasTarget && targetPoint && (
              <HolographicTarget position={targetPoint} />
            )}

            {/* Projected Landing Indicator during swing */}
            {!editorMode && isSwinging && swingLandingPoint && (
              <HolographicTarget position={swingLandingPoint} color="#00ff55" />
            )}

            {/* Spider-Man */}
            <group ref={spiderGroupRef} position={editorMode ? [spiderManPos.x, spiderManPos.y, spiderManPos.z] : [0, 0, 0]}>
              <SpiderMan
                spiderCtrl={spiderCtrl}
                cameraCtrl={cameraCtrl}
                lightCtrl={lightCityCtrl}
                neonCtrl={neonCityCtrl}
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
                graphicsPreset={graphicsPreset}
                enableShadows={enableShadows}
              />
            </group>
          </Suspense>

          {/* Interactive Path Points (always mounted, hidden via visibility prop to prevent Drei Html removeChild crashes) */}
          {pointsData.map((p, i) => (
            <group
              key={`editable-pt-city-${i}`}
              ref={(el) => { if (el) pointGroupRefs.current[i] = el; }}
              position={[p.x, p.y, p.z]}
              visible={false}
            >
              <PathPointSphere
                index={i}
                position={{ x: 0, y: 0, z: 0 }}
                isSelected={selectedType === 'point' && selectedIndex === i}
                onSelect={onSelectPoint}
                visible={false}
              />
            </group>
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
    </>
  );
}

// ─── App ───
function App() {
  const currentScene = useStore((s) => s.currentScene);
  // Editor state
  const [editorMode, setEditorMode] = useState(true);
  const [previewPlayCamera, setPreviewPlayCamera] = useState(false);
  const [selectedType, setSelectedType] = useState(null); // 'point' | 'spiderman' | null
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [animationNames, setAnimationNames] = useState([]);
  const [activeAnimation, setActiveAnimation] = useState(null);

  // Path points state — separate for Alley and City
  const [alleyPointsData, setAlleyPointsData] = useState(() => {
    const saved = loadSavedState('spisense_path_points_alley', null);
    if (Array.isArray(saved) && saved.length >= 2) return saved;
    // Fallback to legacy key
    const legacy = loadSavedState('spisense_path_points', null);
    if (Array.isArray(legacy) && legacy.length >= 2) return legacy;
    return INITIAL_PATH_POINTS;
  });

  const [cityPointsData, setCityPointsData] = useState(() => {
    const saved = loadSavedState('spisense_path_points_city', null);
    if (Array.isArray(saved) && saved.length >= 2) return saved;
    const initialCityPoints = [
      { x: 0, y: 0, z: 20 },
      { x: 0, y: 0, z: 10 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -10 },
      { x: 0, y: 0, z: -20 },
    ];
    return initialCityPoints;
  });

  // Spider-Man position state — separate for Alley and City
  const [alleySpiderManPos, setAlleySpiderManPos] = useState(() => {
    const saved = loadSavedState('spisense_spiderman_alley', null);
    if (saved && saved.position && typeof saved.position.x === 'number') return saved.position;
    
    // Fallback to legacy key
    const legacy = loadSavedState('spisense_spiderman', null);
    if (legacy && legacy.position && typeof legacy.position.x === 'number') return legacy.position;

    return INITIAL_SPIDERMAN.position;
  });

  const [citySpiderManPos, setCitySpiderManPos] = useState(() => {
    const saved = loadSavedState('spisense_spiderman_city', null);
    if (saved && saved.position && typeof saved.position.x === 'number') return saved.position;
    return { x: 0, y: 0, z: 20 }; // default city spawn aligned with first point
  });

  // Segment animations — separate for Alley and City
  const [alleySegmentAnimations, setAlleySegmentAnimations] = useState(() => {
    const saved = loadSavedState('spisense_segment_anims_alley', null);
    if (Array.isArray(saved)) return saved;
    
    const legacy = loadSavedState('spisense_segment_anims_data', null);
    if (Array.isArray(legacy)) return legacy;

    return INITIAL_SEGMENT_ANIMATIONS.map((s) => s.animation);
  });

  const [citySegmentAnimations, setCitySegmentAnimations] = useState(() => {
    const saved = loadSavedState('spisense_segment_anims_city', null);
    if (Array.isArray(saved)) return saved;
    return ['idle', 'idle', 'idle', 'idle'];
  });

  // Dynamically resolve active scene states
  const pointsData = currentScene === 'entry' ? alleyPointsData : cityPointsData;
  const setPointsData = currentScene === 'entry' ? setAlleyPointsData : setCityPointsData;
  const spiderManPos = currentScene === 'entry' ? alleySpiderManPos : citySpiderManPos;
  const setSpiderManPos = currentScene === 'entry' ? setAlleySpiderManPos : setCitySpiderManPos;
  const segmentAnimations = currentScene === 'entry' ? alleySegmentAnimations : citySegmentAnimations;
  const setSegmentAnimations = currentScene === 'entry' ? setAlleySegmentAnimations : setCitySegmentAnimations;

  // Load controller configurations from local storage
  const savedAlleySpider = (() => {
    const saved = loadSavedState('spisense_spiderman_alley', null);
    if (saved && typeof saved === 'object') return saved;
    
    const legacy = loadSavedState('spisense_spiderman', null);
    if (legacy && typeof legacy === 'object') return legacy;

    return INITIAL_SPIDERMAN;
  })();

  const savedCitySpider = (() => {
    const saved = loadSavedState('spisense_spiderman_city', null);
    const defaults = { position: { x: 0, y: 0, z: 20 }, rotation_y: -180, scale: 0.95 };
    return (saved && typeof saved === 'object') ? { ...defaults, ...saved } : defaults;
  })();

  const savedAlley = (() => {
    const saved = loadSavedState('spisense_alley_ctrl', null);
    const defaults = { alley_x: -2.4000000000000004, alley_y: -0.6, alley_z: 0, alley_rotation_y: 0, alley_scale: 1 };
    return (saved && typeof saved === 'object') ? { ...defaults, ...saved } : defaults;
  })();

  const savedCity = (() => {
    const saved = loadSavedState('spisense_city_ctrl', null);
    const defaults = { city_x: 0, city_y: 0, city_z: 0, city_rotation_y: 0, city_scale: 1 };
    return (saved && typeof saved === 'object') ? { ...defaults, ...saved } : defaults;
  })();

  const savedCamera = (() => {
    const saved = loadSavedState('spisense_camera_ctrl', null);
    const defaults = { camera_offset_x: 0, camera_offset_y: 1.9, camera_offset_z: 3.2, camera_lerp: 0.15 };
    return (saved && typeof saved === 'object') ? { ...defaults, ...saved } : defaults;
  })();

  const savedLightingAlley = (() => {
    const saved = loadSavedState('spisense_light_ctrl_alley', null);
    const defaults = {
      ambient_intensity: 2,
      ambient_color: '#dcdcef',
      directional_intensity: 1.4,
      directional_x: 5,
      directional_y: 24.8,
      directional_z: 9.8,
      fog_near: 14,
      fog_far: 40,
      env_preset: 'night',
      env_intensity: 1,
    };
    return (saved && typeof saved === 'object') ? { ...defaults, ...saved } : defaults;
  })();

  const savedLightingCity = (() => {
    const saved = loadSavedState('spisense_light_ctrl_city', null);
    const defaults = {
      ambient_intensity: 0.4,
      ambient_color: '#223344',
      directional_intensity: 1.2,
      directional_x: 15,
      directional_y: 20,
      directional_z: 15,
      fog_near: 20,
      fog_far: 150,
      env_preset: 'sunset',
      env_intensity: 1.2,
    };
    return (saved && typeof saved === 'object') ? { ...defaults, ...saved } : defaults;
  })();

  const savedNeonAlley = (() => {
    const saved = loadSavedState('spisense_neon_ctrl_alley', null);
    const defaults = {
      neon1_color: '#00f3ff', neon1_intensity: 44, neon1_x: 2, neon1_y: 4, neon1_z: 2,
      neon2_color: '#9d00ff', neon2_intensity: 33, neon2_x: -2, neon2_y: 3, neon2_z: 5,
      neon3_color: '#ff0055', neon3_intensity: 20, neon3_x: 0, neon3_y: 5, neon3_z: -2,
    };
    return (saved && typeof saved === 'object') ? { ...defaults, ...saved } : defaults;
  })();

  const savedNeonCity = (() => {
    const saved = loadSavedState('spisense_neon_ctrl_city', null);
    const defaults = {
      neon1_color: '#ff5500', neon1_intensity: 30, neon1_x: 10, neon1_y: 15, neon1_z: 10,
      neon2_color: '#00aaff', neon2_intensity: 25, neon2_x: -10, neon2_y: 12, neon2_z: 12,
      neon3_color: '#aa00ff', neon3_intensity: 20, neon3_x: 0, neon3_y: 18, neon3_z: -10,
    };
    return (saved && typeof saved === 'object') ? { ...defaults, ...saved } : defaults;
  })();

  // Separate Spider-Man controls based on currentScene
  const [alleySpiderCtrl] = useControls('Alley Spider-Man', () => ({
    rotation_y: { value: savedAlleySpider.rotation_y ?? INITIAL_SPIDERMAN.rotation_y, min: -180, max: 180, step: 1 },
    scale: { value: (savedAlleySpider.scale ?? INITIAL_SPIDERMAN.scale) * 100, min: 1, max: 500, step: 1 },
  }), { hidden: currentScene !== 'entry' }, [currentScene]);

  const [citySpiderCtrl] = useControls('City Spider-Man', () => ({
    rotation_y: { value: savedCitySpider.rotation_y ?? 0, min: -180, max: 180, step: 1 },
    scale: { value: (savedCitySpider.scale ?? 0.95) * 100, min: 1, max: 500, step: 1 },
  }), { hidden: currentScene !== 'city' }, [currentScene]);

  const spiderCtrl = currentScene === 'entry' ? alleySpiderCtrl : citySpiderCtrl;

  const alleyCtrl = useControls('Alley Model', {
    alley_x: { value: savedAlley.alley_x ?? 0, min: -20, max: 20, step: 0.1 },
    alley_y: { value: savedAlley.alley_y ?? 0, min: -10, max: 10, step: 0.1 },
    alley_z: { value: savedAlley.alley_z ?? 0, min: -20, max: 20, step: 0.1 },
    alley_rotation_y: { value: savedAlley.alley_rotation_y ?? 0, min: -180, max: 180, step: 1 },
    alley_scale: { value: savedAlley.alley_scale ?? 1, min: 0.1, max: 5, step: 0.1 },
  });

  const cityCtrl = useControls('City Model', {
    city_x: { value: savedCity.city_x ?? 0, min: -50, max: 50, step: 0.1 },
    city_y: { value: savedCity.city_y ?? 0, min: -10, max: 10, step: 0.1 },
    city_z: { value: savedCity.city_z ?? 0, min: -50, max: 50, step: 0.1 },
    city_rotation_y: { value: savedCity.city_rotation_y ?? 0, min: -180, max: 180, step: 1 },
    city_scale: { value: savedCity.city_scale ?? 1, min: 0.1, max: 5, step: 0.1 },
  });

  const cameraCtrl = useControls('Camera', {
    camera_offset_x: { value: savedCamera.camera_offset_x ?? 0, min: -10, max: 10, step: 0.1 },
    camera_offset_y: { value: savedCamera.camera_offset_y ?? 1.9, min: 0, max: 10, step: 0.1 },
    camera_offset_z: { value: savedCamera.camera_offset_z ?? 3.2, min: 1, max: 20, step: 0.1 },
    camera_lerp: { value: savedCamera.camera_lerp ?? 0.15, min: 0.01, max: 1, step: 0.01 },
    camera_fov: { value: savedCamera.camera_fov ?? 50, min: 20, max: 100, step: 1 },
    camera_aim_fov: { value: savedCamera.camera_aim_fov ?? 38, min: 10, max: 90, step: 1 },
  });

  const [lightAlleyCtrl, setLightAlley] = useControls('Alley Lighting & FX', () => ({
    ambient_intensity: { value: savedLightingAlley.ambient_intensity, min: 0, max: 2, step: 0.1 },
    ambient_color: savedLightingAlley.ambient_color,
    directional_intensity: { value: savedLightingAlley.directional_intensity, min: 0, max: 2, step: 0.1 },
    directional_x: { value: savedLightingAlley.directional_x, min: -20, max: 20, step: 0.1 },
    directional_y: { value: savedLightingAlley.directional_y, min: 0, max: 30, step: 0.1 },
    directional_z: { value: savedLightingAlley.directional_z, min: -20, max: 20, step: 0.1 },
    fog_near: { value: savedLightingAlley.fog_near, min: 1, max: 50, step: 1 },
    fog_far: { value: savedLightingAlley.fog_far, min: 10, max: 300, step: 1 },
    env_preset: {
      value: savedLightingAlley.env_preset,
      options: ['none', 'sunset', 'dawn', 'night', 'warehouse', 'forest', 'apartment', 'studio', 'city']
    },
    env_intensity: { value: savedLightingAlley.env_intensity, min: 0, max: 5, step: 0.1 }
  }), { hidden: currentScene !== 'entry' }, [currentScene]);

  const [lightCityCtrl, setLightCity] = useControls('City Lighting & FX', () => ({
    ambient_intensity: { value: savedLightingCity.ambient_intensity, min: 0, max: 2, step: 0.1 },
    ambient_color: savedLightingCity.ambient_color,
    directional_intensity: { value: savedLightingCity.directional_intensity, min: 0, max: 3, step: 0.1 },
    directional_x: { value: savedLightingCity.directional_x, min: -50, max: 50, step: 0.1 },
    directional_y: { value: savedLightingCity.directional_y, min: 0, max: 50, step: 0.1 },
    directional_z: { value: savedLightingCity.directional_z, min: -50, max: 50, step: 0.1 },
    fog_near: { value: savedLightingCity.fog_near, min: 1, max: 100, step: 1 },
    fog_far: { value: savedLightingCity.fog_far, min: 10, max: 500, step: 1 },
    env_preset: {
      value: savedLightingCity.env_preset,
      options: ['none', 'sunset', 'dawn', 'night', 'warehouse', 'forest', 'apartment', 'studio', 'city']
    },
    env_intensity: { value: savedLightingCity.env_intensity, min: 0, max: 5, step: 0.1 }
  }), { hidden: currentScene !== 'city' }, [currentScene]);

  const [neonAlleyCtrl, setNeonAlley] = useControls('Alley Neon Lights', () => ({
    neon1_color: savedNeonAlley.neon1_color,
    neon1_intensity: { value: savedNeonAlley.neon1_intensity, min: 0, max: 100, step: 1 },
    neon1_x: { value: savedNeonAlley.neon1_x, min: -20, max: 20, step: 0.5 },
    neon1_y: { value: savedNeonAlley.neon1_y, min: -10, max: 20, step: 0.5 },
    neon1_z: { value: savedNeonAlley.neon1_z, min: -20, max: 20, step: 0.5 },
    
    neon2_color: savedNeonAlley.neon2_color,
    neon2_intensity: { value: savedNeonAlley.neon2_intensity, min: 0, max: 100, step: 1 },
    neon2_x: { value: savedNeonAlley.neon2_x, min: -20, max: 20, step: 0.5 },
    neon2_y: { value: savedNeonAlley.neon2_y, min: -10, max: 20, step: 0.5 },
    neon2_z: { value: savedNeonAlley.neon2_z, min: -20, max: 20, step: 0.5 },
    
    neon3_color: savedNeonAlley.neon3_color,
    neon3_intensity: { value: savedNeonAlley.neon3_intensity, min: 0, max: 100, step: 1 },
    neon3_x: { value: savedNeonAlley.neon3_x, min: -20, max: 20, step: 0.5 },
    neon3_y: { value: savedNeonAlley.neon3_y, min: -10, max: 20, step: 0.5 },
    neon3_z: { value: savedNeonAlley.neon3_z, min: -20, max: 20, step: 0.5 },
  }), { hidden: currentScene !== 'entry' }, [currentScene]);

  const [neonCityCtrl, setNeonCity] = useControls('City Neon Lights', () => ({
    neon1_color: savedNeonCity.neon1_color,
    neon1_intensity: { value: savedNeonCity.neon1_intensity, min: 0, max: 100, step: 1 },
    neon1_x: { value: savedNeonCity.neon1_x, min: -50, max: 50, step: 0.5 },
    neon1_y: { value: savedNeonCity.neon1_y, min: -10, max: 50, step: 0.5 },
    neon1_z: { value: savedNeonCity.neon1_z, min: -50, max: 50, step: 0.5 },
    
    neon2_color: savedNeonCity.neon2_color,
    neon2_intensity: { value: savedNeonCity.neon2_intensity, min: 0, max: 100, step: 1 },
    neon2_x: { value: savedNeonCity.neon2_x, min: -50, max: 50, step: 0.5 },
    neon2_y: { value: savedNeonCity.neon2_y, min: -10, max: 50, step: 0.5 },
    neon2_z: { value: savedNeonCity.neon2_z, min: -50, max: 50, step: 0.5 },
    
    neon3_color: savedNeonCity.neon3_color,
    neon3_intensity: { value: savedNeonCity.neon3_intensity, min: 0, max: 100, step: 1 },
    neon3_x: { value: savedNeonCity.neon3_x, min: -50, max: 50, step: 0.5 },
    neon3_y: { value: savedNeonCity.neon3_y, min: -10, max: 50, step: 0.5 },
    neon3_z: { value: savedNeonCity.neon3_z, min: -50, max: 50, step: 0.5 },
  }), { hidden: currentScene !== 'city' }, [currentScene]);

  const debugVisuals = useControls('Debug Visuals', {
    show_path_line: true,
    show_path_spheres: true,
    show_light_helpers: { value: true, label: 'Show Light Helpers' },
    show_grid: true,
    show_axes: true,
  });

  const graphicsCtrl = useControls('Performance & Graphics', {
    preset: {
      value: 'Balanced',
      options: ['Performance', 'Balanced', 'High']
    },
    enableShadows: {
      value: true,
      label: 'Enable Shadows'
    }
  });

  const activePreset = graphicsCtrl.preset;
  const shadowsEnabled = activePreset === 'Performance' ? false : graphicsCtrl.enableShadows;

  const calculatedDpr = useMemo(() => {
    if (activePreset === 'Performance') return 1.0;
    if (activePreset === 'Balanced') return 1.25;
    return Math.min(window.devicePixelRatio || 1, 1.75);
  }, [activePreset]);

  // Auto-sync states to LocalStorage
  useEffect(() => {
    localStorage.setItem('spisense_path_points_alley', JSON.stringify(alleyPointsData));
  }, [alleyPointsData]);

  useEffect(() => {
    localStorage.setItem('spisense_path_points_city', JSON.stringify(cityPointsData));
  }, [cityPointsData]);

  useEffect(() => {
    localStorage.setItem('spisense_spiderman_alley', JSON.stringify({
      position: alleySpiderManPos,
      rotation_y: alleySpiderCtrl.rotation_y,
      scale: alleySpiderCtrl.scale / 100,
    }));
  }, [alleySpiderManPos, alleySpiderCtrl.rotation_y, alleySpiderCtrl.scale]);

  useEffect(() => {
    localStorage.setItem('spisense_spiderman_city', JSON.stringify({
      position: citySpiderManPos,
      rotation_y: citySpiderCtrl.rotation_y,
      scale: citySpiderCtrl.scale / 100,
    }));
  }, [citySpiderManPos, citySpiderCtrl.rotation_y, citySpiderCtrl.scale]);

  useEffect(() => {
    localStorage.setItem('spisense_segment_anims_alley', JSON.stringify(alleySegmentAnimations));
  }, [alleySegmentAnimations]);

  useEffect(() => {
    localStorage.setItem('spisense_segment_anims_city', JSON.stringify(citySegmentAnimations));
  }, [citySegmentAnimations]);

  useEffect(() => {
    localStorage.setItem('spisense_alley_ctrl', JSON.stringify(alleyCtrl));
  }, [alleyCtrl]);

  useEffect(() => {
    localStorage.setItem('spisense_city_ctrl', JSON.stringify(cityCtrl));
  }, [cityCtrl]);

  useEffect(() => {
    localStorage.setItem('spisense_camera_ctrl', JSON.stringify(cameraCtrl));
  }, [cameraCtrl]);

  // Auto-enable camera preview mode when camera offsets are adjusted in the editor
  useEffect(() => {
    setPreviewPlayCamera(true);
  }, [cameraCtrl.camera_offset_x, cameraCtrl.camera_offset_y, cameraCtrl.camera_offset_z]);

  useEffect(() => {
    localStorage.setItem('spisense_light_ctrl_alley', JSON.stringify(lightAlleyCtrl));
  }, [lightAlleyCtrl]);

  useEffect(() => {
    localStorage.setItem('spisense_light_ctrl_city', JSON.stringify(lightCityCtrl));
  }, [lightCityCtrl]);

  useEffect(() => {
    localStorage.setItem('spisense_neon_ctrl_alley', JSON.stringify(neonAlleyCtrl));
  }, [neonAlleyCtrl]);

  useEffect(() => {
    localStorage.setItem('spisense_neon_ctrl_city', JSON.stringify(neonCityCtrl));
  }, [neonCityCtrl]);

  // Initialize/adjust segment animations when points or animations change
  useEffect(() => {
    const numSegments = Math.max(0, alleyPointsData.length - 1);
    setAlleySegmentAnimations(prev => {
      const next = Array.isArray(prev) ? [...prev] : [];
      while (next.length < numSegments) {
        next.push(animationNames[0] || 'idle');
      }
      return next.slice(0, numSegments);
    });
  }, [alleyPointsData.length, animationNames]);

  useEffect(() => {
    const numSegments = Math.max(0, cityPointsData.length - 1);
    setCitySegmentAnimations(prev => {
      const next = Array.isArray(prev) ? [...prev] : [];
      while (next.length < numSegments) {
        next.push(animationNames[0] || 'idle');
      }
      return next.slice(0, numSegments);
    });
  }, [cityPointsData.length, animationNames]);

  // Selection handlers
  const handleSelectPoint = useCallback((index) => {
    setSelectedType('point');
    setSelectedIndex(index);
  }, []);

  const handleSelectSpiderMan = useCallback(() => {
    setSelectedType('spiderman');
    setSelectedIndex(null);
  }, []);

  const handleSelectNeon = useCallback((type) => {
    setSelectedType(type);
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
  }, [setPointsData]);

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
  }, [setPointsData]);

  // Segment animation change
  const handleSegmentAnimationChange = useCallback((segmentIndex, animName) => {
    setSegmentAnimations(prev => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next[segmentIndex] = animName;
      return next;
    });
  }, [setSegmentAnimations]);

  // Preset handlers
  const handleSaveFixedSetup = useCallback(() => {
    const fixedConfig = {
      alleyPointsData,
      cityPointsData,
      alleySpiderManPos,
      citySpiderManPos,
      alleySegmentAnimations,
      citySegmentAnimations,
      alleySpiderCtrl: { rotation_y: alleySpiderCtrl.rotation_y, scale: alleySpiderCtrl.scale / 100 },
      citySpiderCtrl: { rotation_y: citySpiderCtrl.rotation_y, scale: citySpiderCtrl.scale / 100 },
      alleyCtrl,
      cityCtrl,
      cameraCtrl,
      lightAlleyCtrl,
      lightCityCtrl,
      neonAlleyCtrl,
      neonCityCtrl,
    };
    localStorage.setItem('spisense_fixed_config', JSON.stringify(fixedConfig));
  }, [
    alleyPointsData, cityPointsData,
    alleySpiderManPos, citySpiderManPos,
    alleySegmentAnimations, citySegmentAnimations,
    alleySpiderCtrl, citySpiderCtrl,
    alleyCtrl, cityCtrl, cameraCtrl,
    lightAlleyCtrl, lightCityCtrl,
    neonAlleyCtrl, neonCityCtrl
  ]);

  const handleLoadFixedSetup = useCallback(() => {
    const saved = localStorage.getItem('spisense_fixed_config');
    if (saved) {
      try {
        const preset = JSON.parse(saved);
        if (preset.alleyPointsData) {
          localStorage.setItem('spisense_path_points_alley', JSON.stringify(preset.alleyPointsData));
        } else if (preset.pointsData) {
          localStorage.setItem('spisense_path_points_alley', JSON.stringify(preset.pointsData));
        }

        if (preset.cityPointsData) {
          localStorage.setItem('spisense_path_points_city', JSON.stringify(preset.cityPointsData));
        } else if (preset.pointsData) {
          localStorage.setItem('spisense_path_points_city', JSON.stringify(preset.pointsData));
        }

        if (preset.alleySpiderManPos) {
          localStorage.setItem('spisense_spiderman_alley', JSON.stringify({
            position: preset.alleySpiderManPos,
            rotation_y: preset.alleySpiderCtrl?.rotation_y ?? -180,
            scale: preset.alleySpiderCtrl?.scale ?? 0.95
          }));
        } else if (preset.spiderManPos) {
          localStorage.setItem('spisense_spiderman_alley', JSON.stringify({
            position: preset.spiderManPos,
            rotation_y: preset.spiderCtrl?.rotation_y ?? -180,
            scale: preset.spiderCtrl?.scale ?? 0.95
          }));
        }

        if (preset.citySpiderManPos) {
          localStorage.setItem('spisense_spiderman_city', JSON.stringify({
            position: preset.citySpiderManPos,
            rotation_y: preset.citySpiderCtrl?.rotation_y ?? 0,
            scale: preset.citySpiderCtrl?.scale ?? 0.95
          }));
        } else if (preset.spiderManPos) {
          localStorage.setItem('spisense_spiderman_city', JSON.stringify({
            position: preset.spiderManPos,
            rotation_y: preset.spiderCtrl?.rotation_y ?? 0,
            scale: preset.spiderCtrl?.scale ?? 0.95
          }));
        }

        if (preset.alleySegmentAnimations) {
          localStorage.setItem('spisense_segment_anims_alley', JSON.stringify(preset.alleySegmentAnimations));
        } else if (preset.segmentAnimations) {
          localStorage.setItem('spisense_segment_anims_alley', JSON.stringify(preset.segmentAnimations));
        }

        if (preset.citySegmentAnimations) {
          localStorage.setItem('spisense_segment_anims_city', JSON.stringify(preset.citySegmentAnimations));
        } else if (preset.segmentAnimations) {
          localStorage.setItem('spisense_segment_anims_city', JSON.stringify(preset.segmentAnimations));
        }

        if (preset.alleyCtrl) localStorage.setItem('spisense_alley_ctrl', JSON.stringify(preset.alleyCtrl));
        if (preset.cityCtrl) localStorage.setItem('spisense_city_ctrl', JSON.stringify(preset.cityCtrl));
        if (preset.cameraCtrl) localStorage.setItem('spisense_camera_ctrl', JSON.stringify(preset.cameraCtrl));
        if (preset.lightAlleyCtrl) localStorage.setItem('spisense_light_ctrl_alley', JSON.stringify(preset.lightAlleyCtrl));
        if (preset.lightCityCtrl) localStorage.setItem('spisense_light_ctrl_city', JSON.stringify(preset.lightCityCtrl));
        if (preset.neonAlleyCtrl) localStorage.setItem('spisense_neon_ctrl_alley', JSON.stringify(preset.neonAlleyCtrl));
        if (preset.neonCityCtrl) localStorage.setItem('spisense_neon_ctrl_city', JSON.stringify(preset.neonCityCtrl));
        window.location.reload();
      } catch (err) {
        console.error('[App] Error parsing or loading preset config:', err);
      }
    }
  }, []);

  // Reset function
  const handleResetToDefaults = useCallback(() => {
    localStorage.removeItem('spisense_fixed_config');
    localStorage.removeItem('spisense_spiderman');
    localStorage.removeItem('spisense_path_points');
    localStorage.removeItem('spisense_segment_anims_data');
    localStorage.removeItem('spisense_spiderman_alley');
    localStorage.removeItem('spisense_spiderman_city');
    localStorage.removeItem('spisense_path_points_alley');
    localStorage.removeItem('spisense_path_points_city');
    localStorage.removeItem('spisense_segment_anims_alley');
    localStorage.removeItem('spisense_segment_anims_city');
    localStorage.removeItem('spisense_alley_ctrl');
    localStorage.removeItem('spisense_city_ctrl');
    localStorage.removeItem('spisense_camera_ctrl');
    localStorage.removeItem('spisense_light_ctrl_alley');
    localStorage.removeItem('spisense_light_ctrl_city');
    localStorage.removeItem('spisense_neon_ctrl_alley');
    localStorage.removeItem('spisense_neon_ctrl_city');
    localStorage.removeItem('spisense_light_ctrl'); // clean up old keys
    localStorage.removeItem('spisense_neon_ctrl'); // clean up old keys
    window.location.reload();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Preloader />
      <AudioPlayer />

      {/* Hide Leva debug panel in play mode */}
      <Leva hidden={!editorMode} collapsed />

      <Canvas
        shadows={shadowsEnabled}
        dpr={calculatedDpr}
        onPointerMissed={handleDeselectAll}
      >
        <SceneDirector
          editorMode={editorMode}
          selectedType={selectedType}
          selectedIndex={selectedIndex}
          onSelectPoint={handleSelectPoint}
          onSelectSpiderMan={handleSelectSpiderMan}
          onSelectNeon={handleSelectNeon}
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
          spiderCtrl={spiderCtrl}
          alleyCtrl={alleyCtrl}
          cityCtrl={cityCtrl}
          cameraCtrl={cameraCtrl}
          lightAlleyCtrl={lightAlleyCtrl}
          lightCityCtrl={lightCityCtrl}
          neonAlleyCtrl={neonAlleyCtrl}
          neonCityCtrl={neonCityCtrl}
          setNeonAlley={setNeonAlley}
          setNeonCity={setNeonCity}
          debugVisuals={debugVisuals}
          previewPlayCamera={previewPlayCamera}
          graphicsPreset={activePreset}
          enableShadows={shadowsEnabled}
        />
      </Canvas>

      <EntryUI />

      {/* Game Controls (only in play mode / non-editor) */}
      {!editorMode && <GameControls />}
      {!editorMode && <WebShooterHUD />}
      {!editorMode && currentScene === 'entry' && <TutorialPanel />}

      {/* Editor Panel (only in entry scene + editor mode) */}
      {editorMode && (
        <EditorPanel
          selectedType={selectedType}
          selectedIndex={selectedIndex}
          pointsData={pointsData}
          segmentAnimations={segmentAnimations}
          animationNames={animationNames}
          spiderManPos={spiderManPos}
          spiderManRotY={spiderCtrl.rotation_y}
          spiderManScale={spiderCtrl.scale / 100}
          cameraCtrl={cameraCtrl}
          lightAlleyCtrl={lightAlleyCtrl}
          lightCityCtrl={lightCityCtrl}
          neonAlleyCtrl={neonAlleyCtrl}
          neonCityCtrl={neonCityCtrl}
          alleyCtrl={alleyCtrl}
          currentScene={currentScene}
          onAddPoint={handleAddPoint}
          onRemovePoint={handleRemovePoint}
          onSegmentAnimationChange={handleSegmentAnimationChange}
          onDeselectAll={handleDeselectAll}
          editorMode={editorMode}
          onToggleEditorMode={() => setEditorMode(m => !m)}
          activeAnimation={activeAnimation}
          onActiveAnimationChange={setActiveAnimation}
          previewPlayCamera={previewPlayCamera}
          onTogglePreviewPlayCamera={() => setPreviewPlayCamera(c => !c)}
          onResetToDefaults={handleResetToDefaults}
          onSaveFixedSetup={handleSaveFixedSetup}
          onLoadFixedSetup={handleLoadFixedSetup}
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
