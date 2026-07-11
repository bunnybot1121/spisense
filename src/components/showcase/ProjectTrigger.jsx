import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import * as THREE from 'three';

export default function ProjectTrigger({ project }) {
  const basePos = new THREE.Vector3(project.triggerPos.x, project.triggerPos.y, project.triggerPos.z);
  const activeShowcaseProject = useStore((s) => s.activeShowcaseProject);
  const showcasePhase = useStore((s) => s.showcasePhase);

  const ring1Ref = useRef();
  const ring2Ref = useRef();
  const wasInsideRef = useRef(false);

  useFrame((state) => {
    // 1. Skip detection if showcase is already active on another project
    if (activeShowcaseProject && activeShowcaseProject.id !== project.id) return;

    // 2. Perform distance check for Spiderman
    const charPos = useStore.getState().characterPosition;
    if (charPos) {
      const playerPos = new THREE.Vector3(charPos[0], charPos[1], charPos[2]);
      const distance = playerPos.distanceTo(basePos);
      
      const isIdle = !activeShowcaseProject && showcasePhase === 'idle';

      if (distance < 1.4) {
        if (isIdle && !wasInsideRef.current) {
          wasInsideRef.current = true;
          console.log(`[ProjectTrigger] Triggered showcase for: ${project.title}`);
          useStore.setState({
            activeShowcaseProject: project,
            showcasePhase: 'character_move',
            showcasePlatformPos: basePos.clone(),
            showcaseProjectRotationY: project.rotationY,
          });
        }
      } else if (distance > 2.2) {
        // Reset trigger availability when player steps off the platform
        wasInsideRef.current = false;
      }
    }

    // 3. Animate trigger rings
    const time = state.clock.getElapsedTime();
    const isActive = activeShowcaseProject && activeShowcaseProject.id === project.id;
    const spinFactor = isActive ? 8.0 : 1.2;

    if (ring1Ref.current) {
      ring1Ref.current.rotation.z = time * spinFactor * 0.5;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -time * spinFactor * 0.8;
    }
  });

  const isCurrentActive = activeShowcaseProject && activeShowcaseProject.id === project.id;
  const activeColor = project.color || '#00f3ff';

  return (
    <group position={[project.triggerPos.x, project.triggerPos.y, project.triggerPos.z]}>
      {/* Platform Base */}
      <mesh receiveShadow castShadow position={[0, -0.01, 0]}>
        <cylinderGeometry args={[1.5, 1.55, 0.08, 32]} />
        <meshStandardMaterial 
          color="#121218" 
          roughness={0.4} 
          metalness={0.9} 
          emissive={isCurrentActive ? activeColor : '#001122'}
          emissiveIntensity={isCurrentActive ? 0.3 : 0.05}
        />
      </mesh>

      {/* Hologram Projector core */}
      <mesh position={[0, 0.035, 0]}>
        <cylinderGeometry args={[0.3, 0.32, 0.02, 16]} />
        <meshStandardMaterial color="#2a2a35" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Platform Border Glow Ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.041, 0]}>
        <ringGeometry args={[1.42, 1.46, 32]} />
        <meshBasicMaterial 
          color={isCurrentActive ? activeColor : '#005577'} 
          transparent 
          opacity={isCurrentActive ? 0.9 : 0.4} 
          side={THREE.DoubleSide} 
        />
      </mesh>

      {/* Trigger Concentric Neon Rings */}
      <group position={[0, 0.042, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh ref={ring1Ref}>
          <ringGeometry args={[0.9, 1.0, 32, 1, 0, Math.PI * 1.5]} />
          <meshBasicMaterial 
            color={isCurrentActive ? activeColor : '#00aacc'} 
            transparent 
            opacity={isCurrentActive ? 0.95 : 0.6} 
            side={THREE.DoubleSide} 
          />
        </mesh>
        <mesh ref={ring2Ref}>
          <ringGeometry args={[0.5, 0.65, 32, 1, 0, Math.PI * 1.2]} />
          <meshBasicMaterial 
            color={isCurrentActive ? activeColor : '#00ccff'} 
            transparent 
            opacity={isCurrentActive ? 0.95 : 0.65} 
            side={THREE.DoubleSide} 
          />
        </mesh>
      </group>
    </group>
  );
}
