import React from 'react';
import { useGLTF } from '@react-three/drei';

export default function HologramShowcase({ position = [0, 0, 0], scale = 1, rotation = [0, 0, 0], ...props }) {
  const { scene } = useGLTF('/src/hologram_projector_with_hologram.glb');
  return (
    <group position={position} scale={scale} rotation={rotation} {...props}>
      <primitive object={scene} dispose={null} />
    </group>
  );
}

useGLTF.preload('/src/hologram_projector_with_hologram.glb');
