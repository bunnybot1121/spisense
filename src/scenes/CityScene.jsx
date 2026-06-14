import React, { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

export default function CityScene({ cityCtrl, enableShadows = true, ...props }) {
  const { scene } = useGLTF('/src/assets/city.glb');

  const x = cityCtrl?.city_x ?? 0;
  const y = cityCtrl?.city_y ?? 0;
  const z = cityCtrl?.city_z ?? 0;
  const rotY = THREE.MathUtils.degToRad(cityCtrl?.city_rotation_y ?? 0);
  const scale = cityCtrl?.city_scale ?? 1;

  useEffect(() => {
    const obstacles = [];
    const targets = [];

    // Compose parent group matrix to map child bounding boxes into final world space
    const parentMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, scale, scale)
    );

    scene.traverse((child) => {
      child.matrixAutoUpdate = true;
      if (child.isMesh) {
        child.receiveShadow = enableShadows;
        child.castShadow = enableShadows;

        // Bounding box heuristic for building colliders
        const name = child.name.toLowerCase();
        if (
          !name.includes('road') &&
          !name.includes('street') &&
          !name.includes('sidewalk') &&
          !name.includes('light') &&
          !name.includes('cone') &&
          !name.includes('drum') &&
          !name.includes('acer') &&
          !name.includes('tree') &&
          !name.includes('camera') &&
          !name.includes('sky')
        ) {
          targets.push(child);

          child.geometry.computeBoundingBox();
          if (child.geometry.boundingBox) {
            const box = child.geometry.boundingBox.clone();
            child.updateMatrixWorld(true);
            
            // 1. Map from local child mesh geometry coordinates to GLTF scene root space
            box.applyMatrix4(child.matrixWorld);
            
            // 2. Map from GLTF scene root space to world coordinate space (applying R3F group matrix)
            box.applyMatrix4(parentMatrix);

            // Filter out small decoration components or ground panels
            const size = new THREE.Vector3();
            box.getSize(size);
            if (size.y > 1.8 && size.x > 0.8 && size.z > 0.8) {
              obstacles.push(box);
            }
          }
        }
      }
    });

    console.log(`[CityScene] Compiled ${obstacles.length} solid building obstacles for collisions.`);
    useStore.setState({ solidObstacles: obstacles, aimTargets: targets });

    // Clean up when scene unmounts
    return () => {
      useStore.setState({ solidObstacles: [], aimTargets: [] });
    };
  }, [scene, enableShadows, x, y, z, rotY, scale]);

  console.log('[CityScene] rendering position coordinates:', { x, y, z, rotY, scale });

  return (
    <group
      name="city-group"
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      scale={scale}
      dispose={null}
    >
      <primitive object={scene} dispose={null} />
    </group>
  );
}

useGLTF.preload('/src/assets/city.glb');
