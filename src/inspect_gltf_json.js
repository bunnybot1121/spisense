import fs from 'fs';

const buffer = fs.readFileSync('board.glb');
const chunkLength = buffer.readUInt32LE(12);
const jsonBuffer = buffer.subarray(20, 20 + chunkLength);
const jsonStr = jsonBuffer.toString('utf8');
const gltf = JSON.parse(jsonStr);

console.log("=== Materials ===");
console.log(JSON.stringify(gltf.materials, null, 2));

console.log("\n=== Meshes ===");
console.log(JSON.stringify(gltf.meshes, null, 2));

console.log("\n=== Nodes ===");
console.log(JSON.stringify(gltf.nodes, null, 2));
