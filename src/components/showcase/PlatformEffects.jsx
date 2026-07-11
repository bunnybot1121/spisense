import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import * as THREE from 'three';

export default function PlatformEffects({ project }) {
  const activeShowcaseProject = useStore((s) => s.activeShowcaseProject);
  const showcasePhase = useStore((s) => s.showcasePhase);

  const beamRef = useRef();
  const particleGroupRef = useRef();

  const isCurrentActive = activeShowcaseProject && activeShowcaseProject.id === project.id;
  const activeColor = project.color || '#00f3ff';

  // Pre-generate random offset data for particle sparks
  const particlesData = useMemo(() => {
    const data = [];
    const count = 12;
    for (let i = 0; i < count; i++) {
      data.push({
        angle: Math.random() * Math.PI * 2,
        radius: 0.2 + Math.random() * 0.8,
        speed: 1.0 + Math.random() * 1.5,
        offsetY: Math.random() * 4.0, // starting height offset
        size: 0.02 + Math.random() * 0.04
      });
    }
    return data;
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    const isActive = isCurrentActive && showcasePhase !== 'exiting';

    // 1. Animate light beam scale and opacity
    if (beamRef.current) {
      if (isActive) {
        // Expand height and fade in during character_move / camera_move
        const targetScaleY = 1.0;
        const targetOpacity = 0.5 + Math.sin(time * 6) * 0.15; // pulse
        beamRef.current.scale.y = THREE.MathUtils.lerp(beamRef.current.scale.y, targetScaleY, 3.0 * delta);
        beamRef.current.material.opacity = THREE.MathUtils.lerp(beamRef.current.material.opacity, targetOpacity, 4.0 * delta);
      } else {
        // Shrink height and fade out
        beamRef.current.scale.y = THREE.MathUtils.lerp(beamRef.current.scale.y, 0.001, 8.0 * delta);
        beamRef.current.material.opacity = THREE.MathUtils.lerp(beamRef.current.material.opacity, 0.0, 8.0 * delta);
      }
      
      // Rotate beam slightly
      beamRef.current.rotation.y = time * 0.25;
    }

    // 2. Animate particle sparks
    if (particleGroupRef.current) {
      const children = particleGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const mesh = children[i];
        const data = particlesData[i];
        
        if (isActive) {
          // Float upwards
          mesh.position.y += data.speed * delta;
          // Fade out as it goes higher
          const opacity = Math.max(0, 1.0 - (mesh.position.y / 4.0));
          mesh.material.opacity = opacity;
          mesh.material.transparent = true;

          // Wobble slightly
          const wobble = time * 2 + i;
          mesh.position.x = Math.cos(data.angle + wobble * 0.5) * data.radius;
          mesh.position.z = Math.sin(data.angle + wobble * 0.5) * data.radius;

          // Reset particle to ground when it escapes height limit
          if (mesh.position.y > 4.0) {
            mesh.position.y = 0;
          }
          mesh.visible = true;
        } else {
          // Shrink and hide
          mesh.visible = false;
        }
      }
    }
  });

  return (
    <group position={[project.triggerPos.x, project.triggerPos.y, project.triggerPos.z]}>
      {/* Ascending Hologram Projection Light Cylinder */}
      <mesh 
        ref={beamRef} 
        position={[0, 2.0, 0]} 
        scale={[1, 0.001, 1]}
      >
        <cylinderGeometry args={[1.1, 0.6, 4.0, 24, 1, true]} />
        <meshBasicMaterial 
          color={activeColor}
          transparent
          opacity={0.0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Floating Spark Particles */}
      <group ref={particleGroupRef}>
        {particlesData.map((p, idx) => (
          <mesh 
            key={`spark-${idx}`} 
            position={[Math.cos(p.angle) * p.radius, p.offsetY, Math.sin(p.angle) * p.radius]}
          >
            <sphereGeometry args={[p.size, 8, 8]} />
            <meshBasicMaterial 
              color={activeColor} 
              transparent 
              opacity={0.0} 
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
