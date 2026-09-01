import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../testing/fakeGitDeckApi'
import { useTerminalStore } from '../features/terminal/public'
import { useWorkspaceStore } from '../features/workspace/public'
import { useToastStore } from '../shared/store/toastStore'
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
  useWorkspaceStore.getState().reset()
  useToastStore.getState().clear()
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
 * App owns only the activity rail and feature drawers. Terminal lifecycle and
 * Mosaic behavior live in `TerminalDeck.spec.tsx`.
 */
describe('App', () => {
  it('mounts the terminal workspace', async () => {
    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('complementary', { name: 'Terminal Navigator' })).toBeDefined()
    )
    expect(screen.getByRole('main', { name: 'Terminal mosaic' })).toBeDefined()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('ends up with one open terminal without dictating a cwd', async () => {
    render(<App />)

    await waitFor(() => expect(api.calls.create).toHaveLength(1))
    // The renderer must not know a filesystem path; Main defaults it.
    expect(api.calls.create[0]).toEqual({})
  })

  it('reveals a usable editor when New workspace is clicked', async () => {
    render(<App />)
    await waitFor(() => expect(api.calls.create).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }))
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }))

    expect(screen.getByRole('region', { name: 'Workspace editor' })).toBeDefined()
    expect(screen.getByLabelText<HTMLInputElement>('Working directory').value).toBe('C:\\fake')
  })

  it('saves, opens, and returns to the terminal canvas in one flow', async () => {
    render(<App />)
    await waitFor(() => expect(api.calls.create).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: 'Workspaces' }))
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    fireEvent.change(screen.getByLabelText('Workspace name'), {
      target: { value: 'Daily work' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save workspace' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open Daily work' })).toBeDefined()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Daily work' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Terminals' }).getAttribute('aria-current')).toBe(
        'page'
      )
    )
    expect(api.storedSettings().activeWorkspaceId).toBe('ws_fake-1')
    expect(api.calls.create).toHaveLength(2)
  })
})
