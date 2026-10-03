import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Standalone renderer config. Used only by `npm run renderer:dev` so the UI can
// be developed and visually verified in a plain browser without launching
// Electron. The UI falls back to a mock API when `window.a2dp` is unavailable.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out/renderer-web'),
    emptyOutDir: true
  },
  server: {
    host: true,
    port: 5273
  }
})
