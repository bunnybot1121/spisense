import React, { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export default function AlleyScene({ alleyCtrl, ...props }) {
  const { scene } = useGLTF('/src/assets/alley.glb');

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });
  }, [scene]);

  const x = alleyCtrl?.alley_x ?? 0;
  const y = alleyCtrl?.alley_y ?? 0;
  const z = alleyCtrl?.alley_z ?? 0;
  const rotY = THREE.MathUtils.degToRad(alleyCtrl?.alley_rotation_y ?? 0);
  const scale = alleyCtrl?.alley_scale ?? 1;

  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      scale={scale}
      dispose={null}
    >
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload('/src/assets/alley.glb');
