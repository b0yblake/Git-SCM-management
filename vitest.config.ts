import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@main': resolve(import.meta.dirname, 'src/main'),
  '@preload': resolve(import.meta.dirname, 'src/preload'),
  '@renderer': resolve(import.meta.dirname, 'src/renderer/src')
}

// Two projects so a test runs in the environment its code actually ships to
// (TESTING.md §3). Main/preload/shared get node; renderer gets jsdom.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/{main,preload,shared}/**/*.spec.ts']
        }
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.spec.{ts,tsx}'],
          setupFiles: ['src/renderer/src/testing/setup.ts']
        }
      }
    ]
  }
})
