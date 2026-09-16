import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves this project from /kz-address-map/, not the domain
  // root, so production asset URLs need that prefix; the dev server stays at
  // root so `npm run dev` is unaffected.
  base: command === 'build' ? '/kz-address-map/' : '/',
  // MapLibre GL bundles its tile-parsing logic as a Web Worker; Vite's dev-time
  // dependency pre-bundling breaks that worker's own module resolution, so it
  // must be excluded from optimizeDeps to load correctly in dev.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
}))
