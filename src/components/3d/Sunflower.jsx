import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export default function Sunflower({ position = [0, 0, 0], scale = 1, rotation = [0, 0, 0] }) {
  const headRef = useRef();

  // Rotate the sunflower head round and round
  useFrame((state, delta) => {
    if (headRef.current) {
      headRef.current.rotation.z += delta * 1.0;
    }
  });

  // Generate petals arranged in a circle
  const numPetals = 20;
  const petals = [];
  for (let i = 0; i < numPetals; i++) {
    const angle = (i / numPetals) * Math.PI * 2;
    petals.push(
      <group key={i} rotation={[0, 0, angle]}>
        <mesh position={[0, 0.4, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[0.08, 0.28, 0.02]} />
          <meshStandardMaterial color="#fbc02d" roughness={0.4} metalness={0.1} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position} scale={scale} rotation={rotation}>
      {/* Soil base/pot */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.16, 0.1, 16]} />
        <meshStandardMaterial color="#5d4037" roughness={0.9} />
      </mesh>

      {/* Stem */}
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.025, 0.035, 1.2, 8]} />
        <meshStandardMaterial color="#388e3c" roughness={0.8} />
      </mesh>

      {/* Leaves */}
      <group position={[-0.08, 0.45, 0]} rotation={[0, 0.4, -0.5]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.18, 0.02, 0.1]} />
          <meshStandardMaterial color="#2e7d32" roughness={0.8} />
        </mesh>
      </group>
      <group position={[0.08, 0.75, 0]} rotation={[0, -0.4, 0.5]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.18, 0.02, 0.1]} />
          <meshStandardMaterial color="#2e7d32" roughness={0.8} />
        </mesh>
      </group>

      {/* Rotating Flower Head */}
      <group ref={headRef} position={[0, 1.25, 0.04]} rotation={[0.1, 0, 0]}>
        {/* Flower Center Disc */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.06, 24]} />
          <meshStandardMaterial color="#3e2723" roughness={0.9} />
        </mesh>

        {/* Petals */}
        {petals}

        {/* Happy face details on the center disk for a fun, premium look */}
        {/* Left eye */}
        <mesh position={[-0.08, 0.05, 0.035]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        {/* Right eye */}
        <mesh position={[0.08, 0.05, 0.035]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        {/* Smile */}
        <mesh position={[0, -0.05, 0.035]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.06, 0.015, 8, 16, Math.PI]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
      </group>
    </group>
  );
}
