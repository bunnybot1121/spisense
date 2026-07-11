import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@dimforge/rapier3d-compat': path.resolve(__dirname, 'src/rapier-loader.js')
    }
  },
  optimizeDeps: {
    exclude: ['@react-three/rapier', '@dimforge/rapier3d-compat', '@dimforge/rapier3d']
  },
  plugins: [react(), wasm()],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            let chunkName = 'vendor';
            if (id.includes('@react-three/rapier') || id.includes('rapier') || id.includes('dimforge')) {
              chunkName = 'physics-vendor';
            } else if (id.includes('@react-three/fiber') || id.includes('@react-three/drei')) {
              chunkName = 'r3f-drei-vendor';
            } else if (id.includes('three')) {
              chunkName = 'three-vendor';
            }
            // console.log(`ID: ${id} -> Chunk: ${chunkName}`);
            return chunkName;
          }
        }
      }
    }
  }
})
