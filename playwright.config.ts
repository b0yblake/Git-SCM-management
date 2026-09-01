import { defineConfig } from '@playwright/test'

/**
 * E2E exists once, here (TESTING.md §2). These specs drive the **built**
 * application — the packaged native module is the thing Phase 11 has to prove,
 * and a dev-mode run cannot prove it.
 *
 * Serial on purpose: each spec launches a real Electron process that spawns
 * real shells, and two of those racing would fight over the same user data.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']]
})
