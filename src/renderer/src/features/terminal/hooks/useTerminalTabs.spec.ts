import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useTerminalStore } from '../store/terminalStore'
import { useTerminalTabs } from './useTerminalTabs'

let api: FakeGitDeckApi
let created = 0

const session = (id: string, status: 'running' | 'exited' = 'running'): TerminalSessionInfo => ({
  id,
  definition: { id: `term_${id}`, title: id, cwd: 'C:/work', shellProfileId: 'powershell' },
  status,
  createdAt: 0
})

/** Each create must yield a distinct session, unlike the fake's fixed default. */
const withIncrementingIds = (): void => {
  api.terminal.create = (request) => {
    api.calls.create.push(request)
    created += 1
    return Promise.resolve({ ok: true, value: session(`sess_${created}`) })
  }
}

const mount = () => renderHook(() => useTerminalTabs())

beforeEach(() => {
  created = 0
  api = createFakeGitDeckApi()
  api.install()
  withIncrementingIds()
  useTerminalStore.getState().reset()
})

afterEach(() => {
  vi.restoreAllMocks()
  api.uninstall()
})

describe('opening', () => {
  it('adds the created session to the store and activates it', async () => {
    const { result } = mount()

    await act(() => result.current.openTerminal())

    expect(useTerminalStore.getState().order).toEqual(['sess_1'])
    expect(useTerminalStore.getState().activeSessionId).toBe('sess_1')
  })

  it('surfaces a create failure instead of adding a tab', async () => {
    api.terminal.create = () =>
      Promise.resolve({ ok: false, error: { code: 'SHELL_NOT_FOUND', message: 'no shell' } })
    const { result } = mount()

    await act(() => result.current.openTerminal())

    expect(useTerminalStore.getState().order).toEqual([])
    expect(result.current.lastError?.code).toBe('SHELL_NOT_FOUND')
  })
})

describe('closing', () => {
  /**
   * Phase 10 replaced `window.confirm` with an in-app dialog, so the ask is now
   * state the caller renders rather than a blocking call. The guarantees are
   * unchanged: nothing dies until the user says so.
   */
  it('asks for confirmation when the process is still running', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())

    await act(() => result.current.closeTerminal('sess_1'))

    expect(result.current.pendingClose).toEqual({ sessionId: 'sess_1', title: 'sess_1' })
    expect(api.calls.kill).toEqual([])
    expect(useTerminalStore.getState().order).toEqual(['sess_1'])
  })

  it('confirming then kills it and removes the tab', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())
    await act(() => result.current.closeTerminal('sess_1'))

    await act(() => result.current.confirmPendingClose())

    expect(api.calls.kill).toEqual(['sess_1'])
    expect(useTerminalStore.getState().order).toEqual([])
    expect(result.current.pendingClose).toBeNull()
  })

  it('declining leaves the session alive and the tab present', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())
    await act(() => result.current.closeTerminal('sess_1'))

    act(() => result.current.cancelPendingClose())

    expect(api.calls.kill).toEqual([])
    expect(useTerminalStore.getState().order).toEqual(['sess_1'])
    expect(result.current.pendingClose).toBeNull()
  })

  /** The Phase 10 setting, doing the one thing it exists to do. */
  it('skips the ask entirely when the user has turned confirmation off', async () => {
    const { result } = renderHook(() =>
      useTerminalTabs({ confirmBeforeClosingRunningTerminal: false })
    )
    await act(() => result.current.openTerminal())

    await act(() => result.current.closeTerminal('sess_1'))

    expect(result.current.pendingClose).toBeNull()
    expect(api.calls.kill).toEqual(['sess_1'])
    expect(useTerminalStore.getState().order).toEqual([])
  })

  it('closes an exited session immediately, without confirming or killing', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())
    act(() => useTerminalStore.getState().markExited('sess_1', 0))

    await act(() => result.current.closeTerminal('sess_1'))

    expect(result.current.pendingClose).toBeNull()
    expect(api.calls.kill).toEqual([])
    expect(useTerminalStore.getState().order).toEqual([])
  })

  it('kills only the session being closed', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())
    await act(() => result.current.openTerminal())

    await act(() => result.current.closeTerminal('sess_1'))
    await act(() => result.current.confirmPendingClose())

    expect(api.calls.kill).toEqual(['sess_1'])
    expect(useTerminalStore.getState().order).toEqual(['sess_2'])
  })

  it('keeps the tab when the kill itself fails', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())
    api.terminal.kill = () =>
      Promise.resolve({ ok: false, error: { code: 'TERMINAL_SESSION_NOT_FOUND', message: 'gone' } })

    await act(() => result.current.closeTerminal('sess_1'))
    await act(() => result.current.confirmPendingClose())

    expect(useTerminalStore.getState().order).toEqual(['sess_1'])
    expect(result.current.lastError?.code).toBe('TERMINAL_SESSION_NOT_FOUND')
  })

  it('closeActiveTerminal targets the active tab', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())
    await act(() => result.current.openTerminal())

    await act(() => result.current.closeActiveTerminal())
    await act(() => result.current.confirmPendingClose())

    expect(api.calls.kill).toEqual(['sess_2'])
  })
})

describe('switching', () => {
  const openThree = async (result: { current: ReturnType<typeof useTerminalTabs> }) => {
    for (let i = 0; i < 3; i++) await act(() => result.current.openTerminal())
  }

  it('activateNext wraps from the last tab to the first', async () => {
    const { result } = mount()
    await openThree(result)

    act(() => result.current.activateNext())

    expect(useTerminalStore.getState().activeSessionId).toBe('sess_1')
  })

  it('activatePrevious wraps from the first tab to the last', async () => {
    const { result } = mount()
    await openThree(result)
    act(() => useTerminalStore.getState().setActive('sess_1'))

    act(() => result.current.activatePrevious())

    expect(useTerminalStore.getState().activeSessionId).toBe('sess_3')
  })

  it('is a no-op with a single tab', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())

    act(() => result.current.activateNext())

    expect(useTerminalStore.getState().activeSessionId).toBe('sess_1')
  })

  /** The heart of the phase: switching must never end a session. */
  it('switching tabs never kills anything', async () => {
    const { result } = mount()
    await openThree(result)

    act(() => {
      result.current.activateNext()
      result.current.activatePrevious()
      result.current.activateNext()
    })

    expect(api.calls.kill).toEqual([])
  })
})

describe('unexpected exit', () => {
  it('marks the tab exited without removing it', async () => {
    const { result } = mount()
    await act(() => result.current.openTerminal())

    act(() => api.emitExit({ sessionId: 'sess_1', exitCode: 137 }))

    expect(useTerminalStore.getState().sessions['sess_1']?.status).toBe('exited')
    expect(useTerminalStore.getState().order).toEqual(['sess_1'])
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = mount()

    unmount()

    expect(api.listenerCount()).toBe(0)
  })
})
