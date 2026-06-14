import React, { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

export default function AlleyScene({ alleyCtrl, enableShadows = true, ...props }) {
  const { scene } = useGLTF('/src/assets/alley.glb');

  useEffect(() => {
    const targets = [];
    scene.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = enableShadows;
        child.castShadow = enableShadows;
        targets.push(child);
      }
    });
    useStore.setState({ aimTargets: targets });
    return () => {
      useStore.setState({ aimTargets: [] });
    };
  }, [scene, enableShadows]);

  const x = alleyCtrl?.alley_x ?? 0;
  const y = alleyCtrl?.alley_y ?? 0;
  const z = alleyCtrl?.alley_z ?? 0;
  const rotY = THREE.MathUtils.degToRad(alleyCtrl?.alley_rotation_y ?? 0);
  const scale = alleyCtrl?.alley_scale ?? 1;

  return (
    <group
      name="alley-group"
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      scale={scale}
      dispose={null}
    >
      <primitive object={scene} dispose={null} />
    </group>
  );
}

useGLTF.preload('/src/assets/alley.glb');
