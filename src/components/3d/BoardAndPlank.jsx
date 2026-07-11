import React, { useRef, useMemo, useEffect } from 'react';
import { useGLTF, useTexture, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';

export default function BoardAndPlank({
  boardPos = { x: 5, y: 3.5, z: 40 },
  boardRotY = 0,
  boardScale = 1,
  holoPlankPos = { x: 5, y: 0.05, z: 40 },
  holoPlankRotY = 0,
  holoPlankScale = 1.2,
  isSelected = false,
  onSelectBoard,
  onSelectHoloPlank,
  editorMode = false,
  isNight = true,
}) {
  const boardGltf = useGLTF('/src/assets/board.glb');
  const plankGltf = useGLTF('/src/assets/holo-plank.glb');
  const texture = useTexture('/src/assets/bupi.jpg');

  // Clone scenes to avoid sharing state between instances
  const boardScene = useMemo(() => boardGltf.scene.clone(), [boardGltf]);
  const plankScene = useMemo(() => plankGltf.scene.clone(), [plankGltf]);

  const beamRef = useRef();
  const ring1Ref = useRef();
  const ring2Ref = useRef();
  const boardGroupRef = useRef();

  // Settings for texture wrapping and orientation
  useEffect(() => {
    if (texture) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      // Flip texture vertically if needed by default ThreeJS loaders
      texture.flipY = false;
    }
  }, [texture]);

  // Adjust material of Board to have a clean scifi metallic frame
  useEffect(() => {
    boardScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        child.material = new THREE.MeshStandardMaterial({
          color: '#121218',
          roughness: 0.3,
          metalness: 0.8,
          emissive: new THREE.Color('#001826'),
          emissiveIntensity: isNight ? 0.35 : 0.05
        });
      }
    });
  }, [boardScene, isNight]);

  // Style the holo-plank (projector puck)
  useEffect(() => {
    plankScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Give it a dark metallic scifi body with glowing cyan accents
        child.material = new THREE.MeshStandardMaterial({
          color: '#1a1a24',
          roughness: 0.25,
          metalness: 0.85,
          emissive: new THREE.Color('#00f3ff'),
          emissiveIntensity: isNight ? 1.2 : 0.3
        });
      }
    });
  }, [plankScene, isNight]);

  // Animations in useFrame
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    // Slow hovering float & tilt animation for the board group (only when not being edited/selected)
    if (boardGroupRef.current && !isSelected) {
      boardGroupRef.current.position.y = Math.sin(time * 1.5) * 0.08;
      boardGroupRef.current.rotation.z = Math.sin(time * 0.8) * 0.015;
    } else if (boardGroupRef.current && isSelected) {
      boardGroupRef.current.position.y = 0;
      boardGroupRef.current.rotation.z = 0;
    }

    // Holographic beam pulsing and rotation
    if (beamRef.current) {
      beamRef.current.rotation.y = time * 0.2;
      const pulse = 0.45 + Math.sin(time * 4) * 0.15;
      beamRef.current.material.opacity = pulse;
    }

    // Holographic rings rising up from the projector
    if (ring1Ref.current) {
      const ring1Y = (time * 0.4) % 1.0;
      ring1Ref.current.position.y = holoPlankPos.y + ring1Y * (boardPos.y - holoPlankPos.y);
      ring1Ref.current.scale.setScalar(0.6 + ring1Y * 0.8);
      ring1Ref.current.material.opacity = (1.0 - ring1Y) * 0.8;
    }
    
    if (ring2Ref.current) {
      const ring2Y = ((time * 0.4) + 0.5) % 1.0;
      ring2Ref.current.position.y = holoPlankPos.y + ring2Y * (boardPos.y - holoPlankPos.y);
      ring2Ref.current.scale.setScalar(0.6 + ring2Y * 0.8);
      ring2Ref.current.material.opacity = (1.0 - ring2Y) * 0.8;
    }
  });

  // Calculate beam geometry heights and angles
  const beamHeight = Math.max(0.1, boardPos.y - holoPlankPos.y - 0.5);
  const beamY = holoPlankPos.y + beamHeight / 2;

  // Render supporting columns and scifi frame
  // The board width is roughly 2.5 units in our local scale
  const halfWidth = 2.6 * boardScale;
  const boardHeightVal = 1.6 * boardScale;

  return (
    <group>
      {/* ─── Hologram Projector (Holo-Plank) ─── */}
      <RigidBody
        type="fixed"
        position={[holoPlankPos.x, holoPlankPos.y, holoPlankPos.z]}
        rotation={[0, THREE.MathUtils.degToRad(holoPlankRotY), 0]}
        onClick={(e) => {
          if (editorMode) {
            e.stopPropagation();
            onSelectHoloPlank();
          }
        }}
      >
        <primitive object={plankScene} scale={holoPlankScale} />
        {/* Glowing projector lens core */}
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.05, 16]} />
          <meshBasicMaterial color="#00f3ff" />
        </mesh>
      </RigidBody>

      {/* ─── Holographic Light Beam ─── */}
      {isNight && (
        <group>
          {/* Light cone projecting up */}
          <mesh ref={beamRef} position={[holoPlankPos.x, beamY, holoPlankPos.z]}>
            <cylinderGeometry args={[halfWidth * 0.6, 0.15, beamHeight, 32, 1, true]} />
            <meshBasicMaterial
              color="#00f3ff"
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Floating rings */}
          <mesh ref={ring1Ref} position={[holoPlankPos.x, holoPlankPos.y, holoPlankPos.z]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 0.9, 32]} />
            <meshBasicMaterial color="#00f3ff" transparent opacity={0.6} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh ref={ring2Ref} position={[holoPlankPos.x, holoPlankPos.y, holoPlankPos.z]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 0.9, 32]} />
            <meshBasicMaterial color="#00f3ff" transparent opacity={0.6} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      )}

      {/* ─── Supporting Posts/Columns ─── */}
      {/* Left post */}
      <RigidBody type="fixed" position={[boardPos.x - halfWidth - 0.2, 0, boardPos.z]}>
        <mesh castShadow receiveShadow position={[0, (boardPos.y + 0.8) / 2, 0]}>
          <cylinderGeometry args={[0.08, 0.12, boardPos.y + 0.8, 12]} />
          <meshStandardMaterial color="#1f1f26" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* Glow rings on the post */}
        <mesh position={[0, boardPos.y * 0.35, 0]}>
          <torusGeometry args={[0.13, 0.02, 8, 16]} />
          <meshBasicMaterial color="#00f3ff" />
        </mesh>
        <mesh position={[0, boardPos.y * 0.7, 0]}>
          <torusGeometry args={[0.13, 0.02, 8, 16]} />
          <meshBasicMaterial color="#00f3ff" />
        </mesh>
      </RigidBody>

      {/* Right post */}
      <RigidBody type="fixed" position={[boardPos.x + halfWidth + 0.2, 0, boardPos.z]}>
        <mesh castShadow receiveShadow position={[0, (boardPos.y + 0.8) / 2, 0]}>
          <cylinderGeometry args={[0.08, 0.12, boardPos.y + 0.8, 12]} />
          <meshStandardMaterial color="#1f1f26" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* Glow rings on the post */}
        <mesh position={[0, boardPos.y * 0.35, 0]}>
          <torusGeometry args={[0.13, 0.02, 8, 16]} />
          <meshBasicMaterial color="#00f3ff" />
        </mesh>
        <mesh position={[0, boardPos.y * 0.7, 0]}>
          <torusGeometry args={[0.13, 0.02, 8, 16]} />
          <meshBasicMaterial color="#00f3ff" />
        </mesh>
      </RigidBody>

      {/* ─── Board & Frame Group ─── */}
      <RigidBody
        type="fixed"
        position={[boardPos.x, boardPos.y, boardPos.z]}
        rotation={[0, THREE.MathUtils.degToRad(boardRotY), 0]}
        onClick={(e) => {
          if (editorMode) {
            e.stopPropagation();
            onSelectBoard();
          }
        }}
      >
        <group ref={boardGroupRef}>
          {/* The 3D GLTF Board model */}
          <primitive object={boardScene} scale={boardScale} />

          {/* Glowing Widescreen Poster Panel */}
          <mesh position={[0, 0, 0.035]}>
            <planeGeometry args={[halfWidth * 2 - 0.2, boardHeightVal - 0.1]} />
            <meshStandardMaterial
              map={texture}
              emissive={new THREE.Color(isNight ? '#00f3ff' : '#007788')}
              emissiveMap={texture}
              emissiveIntensity={isNight ? 1.8 : 0.4}
              roughness={0.15}
              metalness={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Outer glowing border frame */}
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[halfWidth * 2 + 0.25, boardHeightVal + 0.25, 0.1]} />
            <meshStandardMaterial
              color="#08080f"
              roughness={0.4}
              metalness={0.9}
              emissive="#001822"
              emissiveIntensity={0.2}
            />
          </mesh>

          {/* Outer neon border highlight */}
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[halfWidth * 2 + 0.1, boardHeightVal + 0.1, 0.04]} />
            <meshBasicMaterial color="#00f3ff" wireframe />
          </mesh>

          {/* Sci-Fi Floating Header Bar */}
          <group position={[0, boardHeightVal / 2 + 0.35, 0.02]}>
            {/* Header Panel */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[halfWidth * 1.4, 0.28, 0.06]} />
              <meshStandardMaterial color="#0d0d13" metalness={0.9} roughness={0.1} />
            </mesh>
            <mesh position={[0, 0, 0.035]}>
              <boxGeometry args={[halfWidth * 1.4, 0.02, 0.01]} />
              <meshBasicMaterial color="#00f3ff" />
            </mesh>
            {/* Glowing Label */}
            <Html center distanceFactor={15} position={[0, 0, 0.05]} style={{ pointerEvents: 'none' }}>
              <div
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '8px',
                  fontWeight: '800',
                  color: '#00f3ff',
                  textShadow: '0 0 8px #00f3ff',
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                }}
              >
                SPISENSE DEPLOYMENT MODULE
              </div>
            </Html>
          </group>
        </group>
      </RigidBody>
    </group>
  );
}

useGLTF.preload('/src/assets/board.glb');
useGLTF.preload('/src/assets/holo-plank.glb');
