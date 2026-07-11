import fs from 'fs';

function findMeshNode(filename) {
  const buffer = fs.readFileSync(filename);
  const chunkLength = buffer.readUInt32LE(12);
  const jsonBuffer = buffer.subarray(20, 20 + chunkLength);
  const jsonStr = jsonBuffer.toString('utf8');
  const gltf = JSON.parse(jsonStr);

  console.log(`=== Mesh Nodes for ${filename} ===`);
  
  // Find which nodes reference a mesh
  gltf.nodes.forEach((node, idx) => {
    if (node.mesh !== undefined) {
      console.log(`Node ${idx} "${node.name || ''}" references Mesh ${node.mesh}`);
      
      // Print parent path
      let currentIdx = idx;
      let path = [];
      while (currentIdx !== -1) {
        const currNode = gltf.nodes[currentIdx];
        path.push({
          index: currentIdx,
          name: currNode.name || '',
          scale: currNode.scale,
          translation: currNode.translation,
          rotation: currNode.rotation
        });
        
        // Find parent
        let parentIdx = -1;
        gltf.nodes.forEach((n, pIdx) => {
          if (n.children && n.children.includes(currentIdx)) {
            parentIdx = pIdx;
          }
        });
        currentIdx = parentIdx;
      }
      
      console.log("  Hierarchy path to root (mesh node first):");
      path.forEach(step => {
        console.log(`    Node ${step.index} "${step.name}": scale: ${step.scale ? JSON.stringify(step.scale) : 'none'}, translation: ${step.translation ? JSON.stringify(step.translation) : 'none'}, rotation: ${step.rotation ? JSON.stringify(step.rotation) : 'none'}`);
      });
    }
  });
}

findMeshNode('board.glb');
findMeshNode('holo-puck.glb');
