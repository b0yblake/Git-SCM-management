import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../testing/fakeGitDeckApi'
import { useTerminalStore } from '../features/terminal/public'
import { App } from './App'

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    activate(): void {}
    dispose(): void {}
    proposeDimensions(): { cols: number; rows: number } {
      return { cols: 80, rows: 24 }
    }
  }
}))

let api: FakeGitDeckApi

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useTerminalStore.getState().reset()
})

afterEach(() => {
  // Unmount while the bridge is still installed: a component whose effects
  // flush after uninstall would read an undefined window.gitdeck.
  cleanup()
  api.uninstall()
})

/**
 * Also guards the vitest project split (TESTING.md §3): this file only passes
 * if the renderer project really runs in jsdom.
 */
describe('renderer test project', () => {
  it('runs in the jsdom environment', () => {
    expect(typeof document).toBe('object')
    expect(typeof window).toBe('object')
  })
})

/**
 * App is a shell now — the tab behaviour it delegates to lives in
 * `TerminalTabs.spec.tsx`.
 */
describe('App', () => {
  it('mounts the terminal workspace', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByRole('tablist', { name: 'Terminals' })).toBeDefined())
  })

  it('ends up with one open terminal without dictating a cwd', async () => {
    render(<App />)

    await waitFor(() => expect(api.calls.create).toHaveLength(1))
    // The renderer must not know a filesystem path; Main defaults it.
    expect(api.calls.create[0]).toEqual({})
  })
})
