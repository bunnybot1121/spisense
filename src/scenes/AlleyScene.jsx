import React, { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { RigidBody, CuboidCollider, TrimeshCollider } from '@react-three/rapier';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default function AlleyScene({ alleyCtrl, enableShadows = true, editorMode, ...props }) {
  const { scene } = useGLTF('/src/assets/alley.glb');

  const x = alleyCtrl?.alley_x ?? 0;
  const y = alleyCtrl?.alley_y ?? 0;
  const z = alleyCtrl?.alley_z ?? 0;
  const rotY = THREE.MathUtils.degToRad(alleyCtrl?.alley_rotation_y ?? 0);
  const scale = alleyCtrl?.alley_scale ?? 1;

  // Traverse the scene once to find all mesh geometries and register aim targets
  const { functionalColliders, targets } = useMemo(() => {
    const colliders = [];
    const targets = [];

    scene.updateMatrixWorld(true);

    scene.traverse((child) => {
      child.matrixAutoUpdate = true;
      if (child.isMesh) {
        child.receiveShadow = enableShadows;
        child.castShadow = enableShadows;

        // Exclude decals and flat overlays
        const matName = child.material?.name?.toLowerCase() || '';
        const nodeName = child.name.toLowerCase();
        const isFlatOverlay = 
          matName.includes('decal') || 
          matName.includes('stain') || 
          nodeName.includes('decal');

        if (!isFlatOverlay) {
          const posVec = new THREE.Vector3();
          const quatVal = new THREE.Quaternion();
          const scaleVec = new THREE.Vector3();
          child.matrixWorld.decompose(posVec, quatVal, scaleVec);

          colliders.push({
            geometry: child.geometry,
            position: [posVec.x, posVec.y, posVec.z],
            quaternion: quatVal.clone(),
            scale: [scaleVec.x, scaleVec.y, scaleVec.z]
          });

          targets.push(child);
        }
      }
    });

    console.log(`[AlleyScene] Compiled ${colliders.length} functional colliders and ${targets.length} aim targets.`);
    return { functionalColliders: colliders, targets };
  }, [scene, enableShadows]);

  // Pre-bake all local and parent offsets directly into a single compound BufferGeometry
  const mergedGeometry = useMemo(() => {
    const geometriesToMerge = [];

    // Construct parent transformation matrix
    const parentMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, scale, scale)
    );

    functionalColliders.forEach((data) => {
      const posAttr = data.geometry.attributes.position;
      if (posAttr) {
        const tempGeo = new THREE.BufferGeometry();
        tempGeo.setAttribute('position', posAttr.clone());
        if (data.geometry.index) {
          tempGeo.setIndex(data.geometry.index.clone());
        }
        
        // Convert to non-indexed to guarantee same format
        const finalGeo = tempGeo.toNonIndexed();
        tempGeo.dispose();
        
        // Construct child local matrix relative to GLTF scene root
        const childMatrix = new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(data.position),
          data.quaternion.clone(),
          new THREE.Vector3().fromArray(data.scale)
        );
        
        // Multiply parent matrix by child matrix to get world transform
        const worldMatrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, childMatrix);
        
        // Apply transform directly to geometry vertices
        finalGeo.applyMatrix4(worldMatrix);
        geometriesToMerge.push(finalGeo);
      }
    });

    let merged = null;
    if (geometriesToMerge.length > 0) {
      try {
        merged = mergeGeometries(geometriesToMerge, false);
        
        // Ensure the merged geometry is indexed so Rapier can generate the trimesh collider!
        if (merged && !merged.index) {
          const count = merged.attributes.position.count;
          const indices = new Uint32Array(count);
          for (let i = 0; i < count; i++) {
            indices[i] = i;
          }
          merged.setIndex(new THREE.BufferAttribute(indices, 1));
        }
        
        console.log(`[AlleyScene] Successfully merged ${geometriesToMerge.length} geometries into a single compound world-space collider.`);
      } catch (err) {
        console.error('[AlleyScene] Failed to merge geometries for physics:', err);
      }
      
      // Dispose temporary geometries
      geometriesToMerge.forEach((g) => g.dispose());
    }

    return merged;
  }, [functionalColliders, x, y, z, rotY, scale]);

  // Expose aim targets to the store with race-condition checking on cleanup
  useEffect(() => {
    useStore.setState({ aimTargets: targets });

    return () => {
      // Only clear aim targets if we are not transitioning to city scene
      if (useStore.getState().currentScene === 'entry') {
        useStore.setState({ aimTargets: [] });
      }
    };
  }, [targets]);

  return (
    <>
      {/* Visual Render Group */}
      <group
        name="alley-group"
        position={[x, y, z]}
        rotation={[0, rotY, 0]}
        scale={scale}
        dispose={null}
      >
        <primitive object={scene} dispose={null} />
      </group>

      {/* Merged Static Physical Collider rendered at root (origin) */}
      {mergedGeometry && (
        <RigidBody
          key={`alley-physics-${x}-${y}-${z}-${rotY}-${scale}-${editorMode}`}
          type="fixed"
        >
          <TrimeshCollider args={[mergedGeometry.attributes.position.array, mergedGeometry.index.array]} />
        </RigidBody>
      )}

      {/* Safety floor below the alley street level */}
      <RigidBody type="fixed" position={[0, -1.0, 0]} colliders={false}>
        <CuboidCollider args={[100, 0.1, 100]} />
      </RigidBody>
    </>
  );
}

useGLTF.preload('/src/assets/alley.glb');
