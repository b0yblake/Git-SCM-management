import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitRepositoryStatus } from '@shared/contracts/git'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useTerminalStore } from '../../terminal/public'
import { useGitStore } from '../store/gitStore'
import { GIT_POLL_MS, useGitStatus } from './useGitStatus'

const REPO = 'D:\\Projects\\app'
const ELSEWHERE = 'C:\\Users\\dev'

const status = (overrides: Partial<GitRepositoryStatus> = {}): GitRepositoryStatus => ({
  repositoryRoot: REPO,
  branch: 'main',
  ahead: 0,
  behind: 0,
  staged: 0,
  modified: 0,
  untracked: 0,
  conflicted: 0,
  isClean: true,
  ...overrides
})

const session = (id: string, cwd: string): TerminalSessionInfo => ({
  id,
  definition: { id: `term_${id}`, title: id, cwd, shellProfileId: 'git-bash' },
  status: 'running',
  createdAt: 0
})

let api: FakeGitDeckApi

const mount = () => renderHook(() => useGitStatus())

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  api = createFakeGitDeckApi()
  api.install()
  useTerminalStore.getState().reset()
  useGitStore.getState().clear()
})

afterEach(() => {
  vi.useRealTimers()
  api.uninstall()
})

describe('what it inspects', () => {
  it('asks about the active terminal’s directory', async () => {
    api.setGitStatus(REPO, status())
    act(() => useTerminalStore.getState().addSession(session('sess_1', REPO)))

    mount()

    await waitFor(() => expect(useGitStore.getState().status?.branch).toBe('main'))
    expect(api.calls.gitInspect).toEqual([REPO])
  })

  it('asks about nothing when no terminal is focused', () => {
    mount()

    expect(api.calls.gitInspect).toEqual([])
    expect(useGitStore.getState().status).toBeNull()
  })

  /** "Refresh is triggered on terminal focus change." */
  it('re-inspects when the user switches to a terminal elsewhere', async () => {
    api.setGitStatus(REPO, status())
    act(() => {
      useTerminalStore.getState().addSession(session('sess_1', REPO))
      useTerminalStore.getState().addSession(session('sess_2', ELSEWHERE))
    })
    act(() => useTerminalStore.getState().setActive('sess_1'))
    mount()
    await waitFor(() => expect(api.calls.gitInspect).toEqual([REPO]))

    act(() => useTerminalStore.getState().setActive('sess_2'))

    await waitFor(() => expect(api.calls.gitInspect).toEqual([REPO, ELSEWHERE]))
  })

  it('does not re-inspect when something unrelated changes', async () => {
    api.setGitStatus(REPO, status())
    act(() => useTerminalStore.getState().addSession(session('sess_1', REPO)))
    mount()
    await waitFor(() => expect(api.calls.gitInspect).toHaveLength(1))

    act(() => useTerminalStore.getState().renameSession('sess_1', 'Renamed'))

    expect(api.calls.gitInspect).toHaveLength(1)
  })

  it('clears the badge once the last terminal is gone', async () => {
    api.setGitStatus(REPO, status())
    act(() => useTerminalStore.getState().addSession(session('sess_1', REPO)))
    mount()
    await waitFor(() => expect(useGitStore.getState().status).not.toBeNull())

    act(() => useTerminalStore.getState().removeSession('sess_1'))

    await waitFor(() => expect(useGitStore.getState().status).toBeNull())
  })
})

describe('polling', () => {
  it('re-checks the same repository on an interval', async () => {
    api.setGitStatus(REPO, status())
    act(() => useTerminalStore.getState().addSession(session('sess_1', REPO)))
    mount()
    await waitFor(() => expect(api.calls.gitInspect).toHaveLength(1))

    await act(async () => {
      vi.advanceTimersByTime(GIT_POLL_MS)
    })

    await waitFor(() => expect(api.calls.gitInspect).toHaveLength(2))
  })

  /** "Polling stops when no terminal is in a repository." */
  it('stops entirely when the focused directory is not a repository', async () => {
    act(() => useTerminalStore.getState().addSession(session('sess_1', ELSEWHERE)))
    mount()
    await waitFor(() => expect(api.calls.gitInspect).toHaveLength(1))

    await act(async () => {
      vi.advanceTimersByTime(GIT_POLL_MS * 4)
    })

    // Polling a plain folder would spawn a git process every few seconds for an
    // answer that cannot change while the same tab stays focused.
    expect(api.calls.gitInspect).toHaveLength(1)
  })

  it('starts again when the user focuses a terminal that is in one', async () => {
    api.setGitStatus(REPO, status())
    act(() => {
      useTerminalStore.getState().addSession(session('sess_1', ELSEWHERE))
      useTerminalStore.getState().addSession(session('sess_2', REPO))
    })
    act(() => useTerminalStore.getState().setActive('sess_1'))
    mount()
    await waitFor(() => expect(api.calls.gitInspect).toEqual([ELSEWHERE]))

    act(() => useTerminalStore.getState().setActive('sess_2'))

    await waitFor(() => expect(api.calls.gitInspect).toEqual([ELSEWHERE, REPO]))
  })

  it('stops once unmounted', async () => {
    api.setGitStatus(REPO, status())
    act(() => useTerminalStore.getState().addSession(session('sess_1', REPO)))
    const { unmount } = mount()
    await waitFor(() => expect(api.calls.gitInspect).toHaveLength(1))

    unmount()
    await act(async () => {
      vi.advanceTimersByTime(GIT_POLL_MS * 3)
    })

    expect(api.calls.gitInspect).toHaveLength(1)
  })
})

/** Git is additive metadata: its absence must be invisible, not noisy. */
describe('when there is nothing to show', () => {
  it('holds no status for a directory outside a repository', async () => {
    act(() => useTerminalStore.getState().addSession(session('sess_1', ELSEWHERE)))
    mount()

    await waitFor(() => expect(api.calls.gitInspect).toEqual([ELSEWHERE]))
    expect(useGitStore.getState().status).toBeNull()
  })

  it('treats a rejected inspect as nothing to show, not as an error to report', async () => {
    api.failGitInspect()
    act(() => useTerminalStore.getState().addSession(session('sess_1', REPO)))
    mount()

    await waitFor(() => expect(api.calls.gitInspect).toHaveLength(1))
    expect(useGitStore.getState().status).toBeNull()
  })

  /**
   * A rejection here means Main refused the request outright, which will not
   * fix itself on a timer. Retrying would be the "error per poll interval" the
   * plan rules out — just in a quieter form.
   */
  it('does not retry on a loop after a rejection', async () => {
    api.failGitInspect()
    act(() => useTerminalStore.getState().addSession(session('sess_1', REPO)))
    mount()
    await waitFor(() => expect(api.calls.gitInspect).toHaveLength(1))

    await act(async () => {
      vi.advanceTimersByTime(GIT_POLL_MS * 4)
    })

    expect(api.calls.gitInspect).toHaveLength(1)
    expect(useGitStore.getState().status).toBeNull()
  })
})
