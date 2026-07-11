import React, { useRef, useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import { useStore } from '../../store/useStore';
import gsap from 'gsap';
import * as THREE from 'three';

export default function PosterDisplay({ project }) {
  const activeShowcaseProject = useStore((s) => s.activeShowcaseProject);
  const showcasePhase = useStore((s) => s.showcasePhase);

  // Dynamically load the specific poster image for this project
  const texture = useTexture(project.poster);

  const materialRef = useRef();

  // Settings for texture wrapping
  useEffect(() => {
    if (texture) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.flipY = false;
    }
  }, [texture]);

  // Fade in the poster once the board is fully assembled
  useEffect(() => {
    const isActive = activeShowcaseProject && activeShowcaseProject.id === project.id;
    const isReveal = isActive && (showcasePhase === 'poster_reveal' || showcasePhase === 'complete');
    
    if (isReveal) {
      gsap.to(materialRef.current, {
        opacity: 1.0,
        duration: 0.8,
        ease: 'power2.out',
        onComplete: () => {
          if (showcasePhase === 'poster_reveal') {
            useStore.setState({ showcasePhase: 'complete' });
          }
        }
      });
    } else {
      gsap.to(materialRef.current, {
        opacity: 0.0,
        duration: 0.35,
        ease: 'power2.in'
      });
    }
  }, [showcasePhase, activeShowcaseProject, project.id]);

  const activeColor = project.color || '#00f3ff';

  return (
    <group position={[0, 0, 0.05]}>
      {/* Dynamic Poster Image Plane */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[5.0, 3.0]} />
        <meshStandardMaterial
          ref={materialRef}
          map={texture}
          emissive={new THREE.Color(activeColor)}
          emissiveMap={texture}
          emissiveIntensity={1.4}
          transparent
          opacity={0.0}
          roughness={0.1}
          metalness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
