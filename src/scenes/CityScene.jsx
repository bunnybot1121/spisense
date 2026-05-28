import React, { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export default function CityScene({ cityCtrl, ...props }) {
  const { scene } = useGLTF('/src/assets/city.glb');

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });
  }, [scene]);

  const x = cityCtrl?.city_x ?? 0;
  const y = cityCtrl?.city_y ?? 0;
  const z = cityCtrl?.city_z ?? 0;
  const rotY = THREE.MathUtils.degToRad(cityCtrl?.city_rotation_y ?? 0);
  const scale = cityCtrl?.city_scale ?? 1;

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

useGLTF.preload('/src/assets/city.glb');
