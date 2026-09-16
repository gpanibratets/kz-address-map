import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// MapLibre GL locates its worker script at runtime via `import.meta.url`,
// expecting a `maplibre-gl-worker.mjs` file (which itself imports a
// `maplibre-gl-shared.mjs` sibling) next to wherever its own code ends up.
// The production build inlines maplibre-gl into the main chunk, so those
// sibling files never get emitted on their own - this plugin copies the
// prebuilt files MapLibre ships straight into dist/assets after the build.
const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

function copyMapLibreWorker(): Plugin {
  return {
    name: 'copy-maplibre-gl-worker',
    apply: 'build',
    writeBundle(options) {
      // options.dir is already absolute; path.resolve (not path.join)
      // handles that correctly instead of doubling the path.
      const assetsDir = path.resolve(rootDir, options.dir ?? 'dist', 'assets')
      mkdirSync(assetsDir, { recursive: true })
      for (const file of MAPLIBRE_WORKER_FILES) {
        copyFileSync(
          path.join(rootDir, 'node_modules/maplibre-gl/dist', file),
          path.join(assetsDir, file),
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), copyMapLibreWorker()],
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
