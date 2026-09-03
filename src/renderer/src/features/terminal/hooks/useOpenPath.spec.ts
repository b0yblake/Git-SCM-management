import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useTerminalStore } from '../store/terminalStore'
import { useOpenPath } from './useOpenPath'

let api: FakeGitDeckApi
let openAt: ReturnType<typeof vi.fn>

const session = (id: string, cwd: string, status: 'running' | 'exited'): TerminalSessionInfo => ({
  id,
  definition: { id: `term_${id}`, title: id, cwd, shellProfileId: 'git-bash' },
  status,
  createdAt: 0
})

const mount = (enabled = true) =>
  renderHook(
    ({ on }: { on: boolean }) =>
      useOpenPath({
        enabled: on,
        openAt: openAt as unknown as (c: string, t: string) => Promise<void>
      }),
    { initialProps: { on: enabled } }
  )

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useTerminalStore.getState().reset()
  openAt = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  api.uninstall()
})

describe('creating', () => {
  it('creates a terminal titled after the folder, in Grid', async () => {
    useTerminalStore.getState().setLayoutMode('focus')
    mount()

    act(() => api.emitOpenPath('C:\\work\\api'))

    await waitFor(() => expect(openAt).toHaveBeenCalledWith('C:\\work\\api', 'api'))
    expect(useTerminalStore.getState().layoutMode).toBe('grid')
  })

  it('pulls the launch argument exactly once when enabled', async () => {
    api.setPendingOpenPath('C:\\work\\web')
    const hook = mount()

    await waitFor(() => expect(openAt).toHaveBeenCalledWith('C:\\work\\web', 'web'))
    hook.rerender({ on: true })

    expect(api.calls.pendingOpenPath).toBe(1)
  })
})

describe('duplicate paths focus instead of creating', () => {
  it('matches case-insensitively, across separators and trailing slashes', async () => {
    useTerminalStore.getState().addSession(session('sess_1', 'C:\\Work\\API', 'running'))
    useTerminalStore.getState().addSession(session('sess_2', 'C:\\other', 'running'))
    mount()

    act(() => api.emitOpenPath('c:/work/api/'))

    await waitFor(() =>
      expect(useTerminalStore.getState().activeSessionId).toBe('sess_1')
    )
    expect(openAt).not.toHaveBeenCalled()
    expect(useTerminalStore.getState().layoutMode).toBe('grid')
  })

  it('an exited session at the path does not count — a fresh one opens', async () => {
    useTerminalStore.getState().addSession(session('sess_1', 'C:\\work\\api', 'exited'))
    mount()

    act(() => api.emitOpenPath('C:\\work\\api'))

    await waitFor(() => expect(openAt).toHaveBeenCalledTimes(1))
  })
})

describe('waiting for restore', () => {
  it('queues pushes until enabled, then drains in order', async () => {
    const hook = mount(false)

    act(() => api.emitOpenPath('C:\\work\\api'))
    act(() => api.emitOpenPath('C:\\work\\web'))
    expect(openAt).not.toHaveBeenCalled()

    hook.rerender({ on: true })

    await waitFor(() => expect(openAt).toHaveBeenCalledTimes(2))
    expect(openAt.mock.calls.map((call) => call[0])).toEqual(['C:\\work\\api', 'C:\\work\\web'])
  })

  it('does not pull the launch argument before restore settles', () => {
    mount(false)

    expect(api.calls.pendingOpenPath).toBe(0)
  })
})

describe('cleanup', () => {
  it('unsubscribes on unmount', () => {
    const hook = mount()

    hook.unmount()

    expect(api.listenerCount()).toBe(0)
  })
})
