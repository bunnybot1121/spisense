import React, { useRef, useEffect, useMemo } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { useStore } from '../../store/useStore';
import gsap from 'gsap';
import * as THREE from 'three';

export default function PresentationBoard({ project, boardScale = 1.05 }) {
  const activeShowcaseProject = useStore((s) => s.activeShowcaseProject);
  const showcasePhase = useStore((s) => s.showcasePhase);

  const boardGltf = useGLTF('/src/assets/board.glb');
  const sceneClone = useMemo(() => boardGltf.scene.clone(), [boardGltf]);

  // Load project poster texture dynamically
  const texture = useTexture(project.poster);

  const localGroupRef = useRef();
  const boardScaleRef = useRef({ x: 0, y: 0, z: 0 });

  // Wrap and flip settings for native UV wrapping
  useEffect(() => {
    if (texture) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.flipY = false;
    }
  }, [texture]);

  // Custom standard material for the screen mesh
  const screenMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(project.color || '#00f3ff'),
      emissiveMap: texture,
      emissiveIntensity: 0.0, // starts dark
      transparent: true,
      opacity: 0.0, // starts transparent
      roughness: 0.1,
      metalness: 0.9,
      side: THREE.DoubleSide
    });
  }, [texture, project.color]);

  // Apply materials directly to model child meshes (uniform dark frame)
  useEffect(() => {
    sceneClone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        child.material = new THREE.MeshStandardMaterial({
          color: '#121218',
          metalness: 0.85,
          roughness: 0.3,
          emissive: new THREE.Color('#001826'),
          emissiveIntensity: 0.3
        });
      }
    });
  }, [sceneClone]);

  // 1. GSAP Board Materialization Timeline (Scale assembly)
  useEffect(() => {
    const isActive = activeShowcaseProject && activeShowcaseProject.id === project.id;
    const isAssembling = isActive && showcasePhase === 'board_assemble';
    const isExiting = isActive && showcasePhase === 'exiting';

    if (isAssembling) {
      boardScaleRef.current = { x: 0.001, y: 0.001, z: 0.001 };
      
      const tl = gsap.timeline({
        onUpdate: () => {
          if (localGroupRef.current) {
            localGroupRef.current.scale.set(
              boardScaleRef.current.x,
              boardScaleRef.current.y,
              boardScaleRef.current.z
            );
          }
        },
        onComplete: () => {
          // Transition to poster reveal phase
          useStore.setState({ showcasePhase: 'poster_reveal' });
        }
      });

      tl.to(boardScaleRef.current, {
        x: boardScale,
        y: 0.02,
        z: 0.02,
        duration: 0.9,
        ease: 'power3.out'
      })
      .to(boardScaleRef.current, {
        y: boardScale,
        duration: 0.8,
        ease: 'power2.inOut'
      })
      .to(boardScaleRef.current, {
        z: boardScale,
        duration: 0.35,
        ease: 'back.out(2.5)'
      });

      return () => tl.kill();
    } else if (isExiting) {
      const tl = gsap.timeline({
        onUpdate: () => {
          if (localGroupRef.current) {
            localGroupRef.current.scale.set(
              boardScaleRef.current.x,
              boardScaleRef.current.y,
              boardScaleRef.current.z
            );
          }
        },
        onComplete: () => {
          // Reset global store states to restore gameplay
          useStore.setState({ 
            activeShowcaseProject: null,
            showcasePhase: 'idle',
            showcaseCameraPosition: null,
            showcaseCameraLookAt: null,
            showcasePlatformPos: null
          });
        }
      });

      tl.to(boardScaleRef.current, {
        z: 0.01,
        duration: 0.3,
        ease: 'power2.in'
      })
      .to(boardScaleRef.current, {
        y: 0.01,
        duration: 0.5,
        ease: 'power2.inOut'
      })
      .to(boardScaleRef.current, {
        x: 0.0,
        duration: 0.5,
        ease: 'power3.in'
      });

      return () => tl.kill();
    }
  }, [showcasePhase, activeShowcaseProject, project.id, boardScale]);

  // 2. GSAP Poster Fade-In Timeline (Opacity and Emissive intensity)
  useEffect(() => {
    const isActive = activeShowcaseProject && activeShowcaseProject.id === project.id;
    const isReveal = isActive && (showcasePhase === 'poster_reveal' || showcasePhase === 'complete');

    if (isReveal) {
      gsap.to(screenMaterial, {
        opacity: 1.0,
        emissiveIntensity: 1.6, // Strong cybernetic glow
        duration: 0.8,
        ease: 'power2.out',
        onComplete: () => {
          if (showcasePhase === 'poster_reveal') {
            useStore.setState({ showcasePhase: 'complete' });
          }
        }
      });
    } else {
      gsap.to(screenMaterial, {
        opacity: 0.0,
        emissiveIntensity: 0.0,
        duration: 0.35,
        ease: 'power2.in'
      });
    }
  }, [showcasePhase, activeShowcaseProject, project.id, screenMaterial]);

  // Adjust board rotation Y so it sits flat relative to the trigger platform rotation
  const radRotY = THREE.MathUtils.degToRad(project.rotationY);

  return (
    <group 
      position={[project.triggerPos.x, project.triggerPos.y + 2.0, project.triggerPos.z]}
      rotation={[0, radRotY, 0]}
    >
      <group 
        ref={localGroupRef} 
        position={[0, 0, -1.8]} // Sit behind Spider-Man
        scale={[0, 0, 0]}
      >
        <primitive object={sceneClone} />
        
        {/* Glowing Widescreen Poster Overlay Panel */}
        <mesh 
          position={[0, 0, 0.035]} 
          material={screenMaterial}
        >
          <planeGeometry args={[5.0, 1.5]} />
        </mesh>
      </group>
    </group>
  );
}

useGLTF.preload('/src/assets/board.glb');
