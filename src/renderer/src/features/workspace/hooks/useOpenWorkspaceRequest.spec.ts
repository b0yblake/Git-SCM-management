import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useTerminalStore } from '../../terminal/public'
import { useOpenWorkspaceRequest } from './useOpenWorkspaceRequest'

const WS = 'ws_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

let api: FakeGitDeckApi
let open: ReturnType<typeof vi.fn>
let opened: ReturnType<typeof vi.fn>

const mount = (enabled = true) =>
  renderHook(
    ({ on }: { on: boolean }) =>
      useOpenWorkspaceRequest({
        enabled: on,
        open: open as unknown as (id: string, options?: unknown) => Promise<boolean>,
        onOpened: opened as unknown as () => void
      }),
    { initialProps: { on: enabled } }
  )

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useTerminalStore.getState().reset()
  open = vi.fn(() => Promise.resolve(true))
  opened = vi.fn()
})

afterEach(() => {
  api.uninstall()
})

describe('handling a request', () => {
  it('switches to Grid, opens with startup commands, and reveals terminals', async () => {
    useTerminalStore.getState().setLayoutMode('focus')
    mount()

    act(() => api.emitOpenWorkspace(WS))

    await waitFor(() => expect(open).toHaveBeenCalledWith(WS, { runStartupCommands: true }))
    expect(useTerminalStore.getState().layoutMode).toBe('grid')
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
  })

  it('a failed open does not pretend the terminals appeared', async () => {
    open = vi.fn(() => Promise.resolve(false))
    mount()

    act(() => api.emitOpenWorkspace(WS))

    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(opened).not.toHaveBeenCalled()
  })

  it('pulls the launch id exactly once when enabled', async () => {
    api.setPendingOpenWorkspace(WS)
    const hook = mount()

    await waitFor(() => expect(open).toHaveBeenCalledWith(WS, { runStartupCommands: true }))
    hook.rerender({ on: true })

    expect(api.calls.pendingOpenWorkspace).toBe(1)
  })
})

describe('waiting for restore', () => {
  it('queues pushes until enabled, then drains in order', async () => {
    const other = 'ws_11111111-2222-4333-8444-555555555555'
    const hook = mount(false)

    act(() => api.emitOpenWorkspace(WS))
    act(() => api.emitOpenWorkspace(other))
    expect(open).not.toHaveBeenCalled()

    hook.rerender({ on: true })

    await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    expect(open.mock.calls.map((call) => call[0])).toEqual([WS, other])
  })

  it('does not pull before restore settles', () => {
    mount(false)

    expect(api.calls.pendingOpenWorkspace).toBe(0)
  })
})

describe('cleanup', () => {
  it('unsubscribes on unmount', () => {
    const hook = mount()

    hook.unmount()

    expect(api.listenerCount()).toBe(0)
  })
})
