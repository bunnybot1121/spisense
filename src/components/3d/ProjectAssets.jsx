import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export default function ProjectAssets() {
  const groupRef = useRef();

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.2;
    }
  });

  const projects = [
    { name: 'SIRG', color: '#ff3366', pos: [-8, 6, 8] },
    { name: 'StepCharge', color: '#33ff66', pos: [8, 7, 8] },
    { name: 'BUPI', color: '#3366ff', pos: [-8, 8, -8] },
    { name: 'Municipal AI', color: '#ffff33', pos: [8, 6, -8] },
    { name: 'EQ AI', color: '#ff33ff', pos: [0, 9, 0] },
  ];

  return (
    <group ref={groupRef}>
      {projects.map((proj, idx) => (
        <group key={idx} position={proj.pos}>
          {/* Holographic display stand/mesh */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.8, 0.1, 0.8]} />
            <meshStandardMaterial 
              color={proj.color} 
              metalness={0.8} 
              roughness={0.2} 
              emissive={proj.color} 
              emissiveIntensity={0.5} 
            />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <octahedronGeometry args={[0.3]} />
            <meshStandardMaterial 
              color={proj.color} 
              wireframe 
              emissive={proj.color} 
              emissiveIntensity={1.0} 
            />
          </mesh>
          <Html center distanceFactor={15} position={[0, 1.2, 0]} style={{ pointerEvents: 'none' }}>
            <div 
              style={{
                background: 'rgba(10, 10, 20, 0.85)',
                border: `1px solid ${proj.color}`,
                boxShadow: `0 0 12px ${proj.color}`,
                padding: '6px 12px',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '11px',
                fontWeight: '600',
                fontFamily: 'Outfit, sans-serif',
                whiteSpace: 'nowrap',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              {proj.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
