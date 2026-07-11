import fs from 'fs';

function inspectAlleyBounds() {
  const buffer = fs.readFileSync('src/assets/alley.glb');
  const chunkLength = buffer.readUInt32LE(12);
  const jsonBuffer = buffer.subarray(20, 20 + chunkLength);
  const jsonStr = jsonBuffer.toString('utf8');
  const gltf = JSON.parse(jsonStr);

  let totalMinY = Infinity;
  let totalMaxY = -Infinity;

  gltf.meshes.forEach((mesh, idx) => {
    mesh.primitives.forEach(prim => {
      const posAccessorIdx = prim.attributes.POSITION;
      if (posAccessorIdx !== undefined) {
        const accessor = gltf.accessors[posAccessorIdx];
        if (accessor.min && accessor.max) {
          totalMinY = Math.min(totalMinY, accessor.min[1]);
          totalMaxY = Math.max(totalMaxY, accessor.max[1]);
        }
      }
    });
  });

  console.log(`Alley Combined Mesh Y Bounds: [${totalMinY}, ${totalMaxY}]`);
}

inspectAlleyBounds();
