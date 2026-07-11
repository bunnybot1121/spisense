import fs from 'fs';

const glbPath = 'src/assets/city.glb';

function findSafe() {
  const buffer = fs.readFileSync(glbPath);
  const chunkLength = buffer.readUInt32LE(12);
  const jsonBuffer = buffer.subarray(20, 20 + chunkLength);
  const jsonStr = jsonBuffer.toString('utf8');
  const gltf = JSON.parse(jsonStr);

  const nodes = gltf.nodes;
  const meshes = gltf.meshes;

  const childToParent = {};
  nodes.forEach((node, idx) => {
    if (node.children) {
      node.children.forEach(childIdx => {
        childToParent[childIdx] = idx;
      });
    }
  });

  const localMatrices = nodes.map(node => {
    let m = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
    if (node.matrix) {
      m = [...node.matrix];
    } else {
      let t = node.translation || [0, 0, 0];
      let r = node.rotation || [0, 0, 0, 1];
      let s = node.scale || [1, 1, 1];
      const x = r[0], y = r[1], z = r[2], w = r[3];
      const xx = x*x, xy = x*y, xz = x*z, xw = x*w;
      const yy = y*y, yz = y*z, yw = y*w;
      const zz = z*z, zw = z*w;
      m[0] = (1 - 2*(yy + zz)) * s[0];
      m[1] = (2*(xy + zw)) * s[0];
      m[2] = (2*(xz - yw)) * s[2]; // Fixed: scale index for rotation mapping
      m[3] = 0;
      m[4] = (2*(xy - zw)) * s[1];
      m[5] = (1 - 2*(xx + zz)) * s[1];
      m[6] = (2*(yz + xw)) * s[1];
      m[7] = 0;
      m[8] = (2*(xz + yw)) * s[2];
      m[9] = (2*(yz - xw)) * s[2];
      m[10] = (1 - 2*(xx + yy)) * s[2];
      m[11] = 0;
      m[12] = t[0];
      m[13] = t[1];
      m[14] = t[2];
      m[15] = 1;
    }
    return m;
  });

  function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        out[row * 4 + col] = 
          a[row * 4 + 0] * b[0 * 4 + col] +
          a[row * 4 + 1] * b[1 * 4 + col] +
          a[row * 4 + 2] * b[2 * 4 + col] +
          a[row * 4 + 3] * b[3 * 4 + col];
      }
    }
    return out;
  }

  const worldMatrices = new Array(nodes.length);
  function getWorldMatrix(idx) {
    if (worldMatrices[idx] !== undefined) return worldMatrices[idx];
    const parentIdx = childToParent[idx];
    const local = localMatrices[idx];
    if (parentIdx === undefined) {
      worldMatrices[idx] = local;
    } else {
      const parentWorld = getWorldMatrix(parentIdx);
      worldMatrices[idx] = multiply(parentWorld, local);
    }
    return worldMatrices[idx];
  }

  nodes.forEach((_, idx) => getWorldMatrix(idx));

  const propagatedNames = new Array(nodes.length);
  function getPropagatedName(idx) {
    if (propagatedNames[idx] !== undefined) return propagatedNames[idx];
    const node = nodes[idx];
    const parentIdx = childToParent[idx];
    const selfName = node.name || '';
    if (parentIdx === undefined) {
      propagatedNames[idx] = selfName;
    } else {
      const parentName = getPropagatedName(parentIdx);
      propagatedNames[idx] = parentName ? (parentName + ' > ' + selfName) : selfName;
    }
    return propagatedNames[idx];
  }
  nodes.forEach((_, idx) => getPropagatedName(idx));

  const meshInstances = [];
  nodes.forEach((node, idx) => {
    if (node.mesh !== undefined) {
      meshInstances.push({
        nodeIdx: idx,
        fullName: propagatedNames[idx],
        meshIdx: node.mesh,
        worldMatrix: worldMatrices[idx]
      });
    }
  });

  const instancesWithBounds = meshInstances.map(inst => {
    const mesh = meshes[inst.meshIdx];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    mesh.primitives.forEach(prim => {
      const posAccessorIdx = prim.attributes.POSITION;
      if (posAccessorIdx !== undefined) {
        const accessor = gltf.accessors[posAccessorIdx];
        if (accessor.min && accessor.max) {
          minX = Math.min(minX, accessor.min[0]);
          minY = Math.min(minY, accessor.min[1]);
          minZ = Math.min(minZ, accessor.min[2]);
          maxX = Math.max(maxX, accessor.max[0]);
          maxY = Math.max(maxY, accessor.max[1]);
          maxZ = Math.max(maxZ, accessor.max[2]);
        }
      }
    });

    const corners = [
      [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, minZ], [minX, maxY, maxZ],
      [maxX, minY, minZ], [maxX, minY, maxZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]
    ];
    let wMin = [Infinity, Infinity, Infinity];
    let wMax = [-Infinity, -Infinity, -Infinity];
    const m = inst.worldMatrix;
    corners.forEach(c => {
      const wx = m[0]*c[0] + m[4]*c[1] + m[8]*c[2] + m[12];
      const wy = m[1]*c[0] + m[5]*c[1] + m[9]*c[2] + m[13];
      const wz = m[2]*c[0] + m[6]*c[1] + m[10]*c[2] + m[14];
      wMin[0] = Math.min(wMin[0], wx);
      wMin[1] = Math.min(wMin[1], wy);
      wMin[2] = Math.min(wMin[2], wz);
      wMax[0] = Math.max(wMax[0], wx);
      wMax[1] = Math.max(wMax[1], wy);
      wMax[2] = Math.max(wMax[2], wz);
    });

    return {
      fullName: inst.fullName,
      meshName: mesh.name || `Mesh_${inst.meshIdx}`,
      min: wMin,
      max: wMax,
      size: [wMax[0] - wMin[0], wMax[1] - wMin[1], wMax[2] - wMin[2]]
    };
  });

  // Solid buildings are meshes with max Y > 2.0
  const buildings = instancesWithBounds.filter(inst => {
    return inst.max[1] > 2.0 && inst.fullName.toLowerCase().includes('building');
  });

  console.log(`Analyzing ${buildings.length} building structures...`);

  // Scan points on a grid around [0, 0] to find a point with NO building collision
  // Street level is around Y = 0.
  const step = 2;
  const range = 100;
  const safePoints = [];

  for (let x = -range; x <= range; x += step) {
    for (let z = -range; z <= range; z += step) {
      // Check if this (x, z) falls inside any building bounding box
      let isInsideBuilding = false;
      for (const b of buildings) {
        if (
          x >= b.min[0] - 1.0 && x <= b.max[0] + 1.0 &&
          z >= b.min[2] - 1.0 && z <= b.max[2] + 1.0
        ) {
          isInsideBuilding = true;
          break;
        }
      }

      if (!isInsideBuilding) {
        // Find if there is a street/road mesh at this point
        const road = instancesWithBounds.find(inst => {
          const name = inst.fullName.toLowerCase();
          const isRoadOrStreet = name.includes('road') || name.includes('street') || name.includes('plane');
          return isRoadOrStreet && 
            x >= inst.min[0] && x <= inst.max[0] &&
            z >= inst.min[2] && z <= inst.max[2] &&
            inst.max[1] <= 1.0;
        });

        if (road) {
          safePoints.push({ x, z, road: road.fullName });
        }
      }
    }
  }

  console.log(`Found ${safePoints.length} potential safe street spawn coordinates.`);
  // Print the first 10 safe points closest to [0, 20]
  safePoints.sort((a, b) => {
    const distA = Math.hypot(a.x - 0, a.z - 20);
    const distB = Math.hypot(b.x - 0, b.z - 20);
    return distA - distB;
  });

  console.log('Checking horizontal path points along z = 36:');
  const path = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
  path.forEach(x => {
    const isSafe = safePoints.some(p => p.x === x && p.z === 36);
    console.log(`Point [${x}, 0.05, 36]: ${isSafe ? 'SAFE' : 'COLLIDING!'}`);
  });
}

findSafe();
