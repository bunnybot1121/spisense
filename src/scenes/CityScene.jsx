import React, { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { RigidBody, CuboidCollider, TrimeshCollider } from '@react-three/rapier';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export default function CityScene({ cityCtrl, enableShadows = true, editorMode, ...props }) {
  const { scene } = useGLTF('/src/assets/city.glb');

  const x = cityCtrl?.city_x ?? 0;
  const y = cityCtrl?.city_y ?? 0;
  const z = cityCtrl?.city_z ?? 0;
  const rotY = THREE.MathUtils.degToRad(cityCtrl?.city_rotation_y ?? 0);
  const scale = cityCtrl?.city_scale ?? 1;

  // Traverse visual scene to compile building and prop colliders
  const { functionalColliders, targets } = useMemo(() => {
    const colliders = [];
    const targets = [];

    // Ensure GLTF child world matrices are up-to-date relative to GLTF root
    scene.updateMatrixWorld(true);

    scene.traverse((child) => {
      child.matrixAutoUpdate = true;
      if (child.isMesh) {
        child.receiveShadow = enableShadows;
        child.castShadow = enableShadows;

        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) {
          const box = child.geometry.boundingBox.clone();
          box.applyMatrix4(child.matrixWorld);

          const matName = child.material?.name?.toLowerCase() || '';
          const nodeName = child.name.toLowerCase();
          
          // Exclude decals, stains, and flat overlays from colliders
          const isFlatOverlay = 
            matName.includes('decal') || 
            matName.includes('stain') || 
            nodeName.includes('decal');

          if (!isFlatOverlay) {
            const posVec = new THREE.Vector3();
            const quatVal = new THREE.Quaternion();
            const scaleVec = new THREE.Vector3();
            child.matrixWorld.decompose(posVec, quatVal, scaleVec);

            // Add to physics colliders
            colliders.push({
              geometry: child.geometry,
              position: [posVec.x, posVec.y, posVec.z],
              quaternion: quatVal.clone(),
              scale: [scaleVec.x, scaleVec.y, scaleVec.z]
            });

            // Exclude roads, sidewalks, streets, and flat ground elements from aimTargets (so player only swings from buildings)
            const isGroundOrRoad = 
              matName.includes('road') ||
              matName.includes('street') ||
              matName.includes('lane') ||
              matName.includes('walk') ||
              matName.includes('curb') ||
              matName.includes('ground') ||
              matName.includes('grass') ||
              nodeName.includes('road') ||
              nodeName.includes('street') ||
              nodeName.includes('sidewalk') ||
              box.max.y <= 3.0; // flat ground/street elements have low max height

            if (!isGroundOrRoad) {
              targets.push(child);
            }
          }
        }
      }
    });

    console.log(`[CityScene] Compiled ${colliders.length} functional colliders and ${targets.length} aim targets in the city.`);
    return { functionalColliders: colliders, targets };
  }, [scene, enableShadows]);

  // Pre-compile and merge all functional collider geometries with baked parent transforms into a single world-space geometry
  const mergedGeometry = useMemo(() => {
    const geometriesToMerge = [];

    // Construct parent transformation matrix from position, rotation, scale
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
        
        // Convert to non-indexed to guarantee same format (no mix of indexed/non-indexed)
        const finalGeo = tempGeo.toNonIndexed();
        tempGeo.dispose(); // Dispose the intermediate indexed geometry
        
        // Construct child local matrix relative to GLTF scene root
        const childMatrix = new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(data.position),
          data.quaternion.clone(),
          new THREE.Vector3().fromArray(data.scale)
        );
        
        // Multiply parent matrix by child matrix to get absolute world transform
        const worldMatrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, childMatrix);
        
        // Transform the geometry directly by absolute world matrix
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
        
        console.log(`[CityScene] Successfully merged ${geometriesToMerge.length} geometries into a single compound world-space collider.`);
      } catch (err) {
        console.error('[CityScene] Failed to merge geometries for physics:', err);
      }
      
      // Dispose temporary geometries
      geometriesToMerge.forEach((g) => g.dispose());
    }

    return merged;
  }, [functionalColliders, x, y, z, rotY, scale]);

  // Flat array of visual meshes and their world centers for distance culling
  const visualMeshes = useMemo(() => {
    const meshes = [];
    scene.updateMatrixWorld(true);
    scene.traverse((child) => {
      if (child.isMesh) {
        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) {
          const center = new THREE.Vector3();
          child.geometry.boundingBox.getCenter(center);
          center.applyMatrix4(child.matrixWorld);
          meshes.push({
            mesh: child,
            center: center.clone(),
          });
        }
      }
    });
    return meshes;
  }, [scene]);

  const lastUpdatePos = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));
  const frameCountRef = useRef(0);

  // Dynamic distance culling in useFrame
  useFrame(() => {
    frameCountRef.current++;
    if (frameCountRef.current % 10 !== 0) return;

    const playerPos = useStore.getState().characterPosition;
    if (!playerPos) return;

    const px = playerPos[0];
    const py = playerPos[1];
    const pz = playerPos[2];

    // Only update culling if the player has moved more than 0.8 units (0.8 * 0.8 = 0.64)
    const distMovedSq = 
      (px - lastUpdatePos.current.x) ** 2 + 
      (py - lastUpdatePos.current.y) ** 2 + 
      (pz - lastUpdatePos.current.z) ** 2;

    if (distMovedSq < 0.64) return;

    lastUpdatePos.current.set(px, py, pz);

    const maxDistSq = 110 * 110; // Cull anything further than 110 units (fog far is 100)

    for (let i = 0; i < visualMeshes.length; i++) {
      const item = visualMeshes[i];
      const dx = item.center.x - px;
      const dy = item.center.y - py;
      const dz = item.center.z - pz;
      const distSq = dx * dx + dy * dy + dz * dz;

      item.mesh.visible = distSq < maxDistSq;
    }
  });

  useEffect(() => {
    // Expose compiled targets to the store for aiming and dynamic swinging
    useStore.setState({ aimTargets: targets, solidObstacles: [] });

    return () => {
      // Only clear if we are not transitioning to entry scene
      if (useStore.getState().currentScene === 'city') {
        useStore.setState({ aimTargets: [], solidObstacles: [] });
      }
    };
  }, [targets]);

  console.log('[CityScene] rendering position coordinates:', { x, y, z, rotY, scale });

  return (
    <>
      {/* Visual Render Group */}
      <group
        name="city-group"
        position={[x, y, z]}
        rotation={[0, rotY, 0]}
        scale={scale}
        dispose={null}
      >
        {/* Render the full visual city */}
        <primitive object={scene} dispose={null} />
      </group>

      {/* Render a single compound trimesh collider from the pre-merged geometry at the origin */}
      {mergedGeometry && (
        <RigidBody
          key={`city-physics-${x}-${y}-${z}-${rotY}-${scale}-${editorMode}`}
          type="fixed"
        >
          <TrimeshCollider args={[mergedGeometry.attributes.position.array, mergedGeometry.index.array]} />
        </RigidBody>
      )}

      {/* Safety floor at y = -0.1 with half-extents [500, 0.1, 500] */}
      <RigidBody type="fixed" position={[0, -0.1, 0]} colliders={false}>
        <CuboidCollider args={[500, 0.1, 500]} />
      </RigidBody>
    </>
  );
}

useGLTF.preload('/src/assets/city.glb');
