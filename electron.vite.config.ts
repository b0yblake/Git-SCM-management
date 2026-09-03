import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(import.meta.dirname, 'src/shared')

// The running app's version, stamped into the renderer at build time so the
// footer can show it without an IPC round trip.
const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')
) as { version: string }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': shared,
        '@main': resolve(import.meta.dirname, 'src/main')
      }
    }
  },

  // The preload runs in a sandboxed renderer (ARCHITECTURE.md §11), which does not
  // support ESM. It must be emitted as CommonJS with a .cjs extension.
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared }
    },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },

  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(version)
    },
    resolve: {
      alias: {
        '@shared': shared,
        '@renderer': resolve(import.meta.dirname, 'src/renderer/src')
      }
    }
  }
})
