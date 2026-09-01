import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TerminalDefinition } from '@shared/contracts/terminal'
import type { Workspace } from '@shared/contracts/workspace'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useTerminalStore } from '../../terminal/public'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useOpenWorkspace } from './useOpenWorkspace'

const definition = (
  id: string,
  overrides: Partial<TerminalDefinition> = {}
): TerminalDefinition => ({
  id,
  title: id,
  cwd: 'C:\\Projects\\my-saas',
  shellProfileId: 'git-bash',
  ...overrides
})

const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: 'ws_saas',
  name: 'My SaaS',
  version: 1,
  terminals: [definition('term_backend'), definition('term_frontend')],
  createdAt: 1,
  updatedAt: 2,
  ...overrides
})

let api: FakeGitDeckApi

const mount = () => renderHook(() => useOpenWorkspace())

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useTerminalStore.getState().reset()
  useWorkspaceStore.getState().reset()
})

afterEach(() => {
  api.uninstall()
})

describe('opening a workspace', () => {
  it('creates one terminal per definition, and no more', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    expect(api.calls.create).toHaveLength(2)
  })

  it('carries every field of the definition into the create request', async () => {
    api.seedWorkspaces(
      workspace({
        terminals: [
          definition('term_backend', {
            title: 'Backend',
            cwd: 'D:\\Projects\\my-saas\\backend',
            shellProfileId: 'git-bash',
            startupCommand: 'npm run dev'
          })
        ]
      })
    )
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    expect(api.calls.create).toEqual([
      {
        title: 'Backend',
        cwd: 'D:\\Projects\\my-saas\\backend',
        shellProfileId: 'git-bash',
        startupCommand: 'npm run dev'
      }
    ])
  })

  it('omits startupCommand entirely when the definition has none', async () => {
    api.seedWorkspaces(workspace({ terminals: [definition('term_backend')] }))
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    expect(api.calls.create[0]).not.toHaveProperty('startupCommand')
  })

  it('opens a workspace with zero terminals cleanly, creating nothing', async () => {
    api.seedWorkspaces(workspace({ terminals: [] }))
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    expect(api.calls.create).toEqual([])
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws_saas')
  })

  it('puts the tabs in definition order', async () => {
    api.seedWorkspaces(
      workspace({
        terminals: [
          definition('term_1', { title: 'Backend' }),
          definition('term_2', { title: 'Frontend' }),
          definition('term_3', { title: 'Logs' })
        ]
      })
    )
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    const { sessions, order } = useTerminalStore.getState()
    expect(order.map((id) => sessions[id]?.definition.title)).toEqual([
      'Backend',
      'Frontend',
      'Logs'
    ])
  })

  it('focuses the workspace’s own active terminal, not the last one created', async () => {
    api.seedWorkspaces(
      workspace({
        terminals: [definition('term_1'), definition('term_2')],
        activeTerminalId: 'term_1'
      })
    )
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    const bindings = useWorkspaceStore.getState().bindings
    expect(useTerminalStore.getState().activeSessionId).toBe(bindings['term_1'])
  })

  it('persists the active workspace id', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    expect(api.calls.settingsUpdate).toContainEqual({ activeWorkspaceId: 'ws_saas' })
    expect(api.storedSettings().activeWorkspaceId).toBe('ws_saas')
  })

  it('reports an error instead of opening when the workspace cannot be loaded', async () => {
    const { result } = mount()

    await act(() => result.current.open('ws_missing'))

    expect(api.calls.create).toEqual([])
    expect(result.current.lastError?.code).toBe('WORKSPACE_NOT_FOUND')
  })
})

/** One shell missing must not cost the user the rest of the workspace. */
describe('a create that fails', () => {
  beforeEach(() => {
    api.seedWorkspaces(
      workspace({
        terminals: [
          definition('term_1', { title: 'Backend' }),
          definition('term_2', { title: 'Frontend' }),
          definition('term_3', { title: 'Logs' })
        ]
      })
    )
    api.failCreateFor('Frontend')
  })

  it('still opens the terminals around it', async () => {
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    const { sessions, order } = useTerminalStore.getState()
    expect(order.map((id) => sessions[id]?.definition.title)).toEqual(['Backend', 'Logs'])
  })

  it('surfaces the failure against the definition that caused it', async () => {
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    expect(result.current.notices).toEqual([
      {
        definitionId: 'term_2',
        title: 'Frontend',
        severity: 'error',
        message: 'No shell for Frontend'
      }
    ])
  })

  it('binds only the definitions that actually opened', async () => {
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    expect(Object.keys(useWorkspaceStore.getState().bindings).sort()).toEqual(['term_1', 'term_3'])
  })
})

describe('the definitionId to sessionId binding', () => {
  it('exists in renderer runtime state after opening', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    const { bindings } = useWorkspaceStore.getState()
    const { sessions } = useTerminalStore.getState()
    expect(Object.keys(bindings)).toEqual(['term_backend', 'term_frontend'])
    for (const sessionId of Object.values(bindings)) {
      expect(sessions[sessionId]).toBeDefined()
    }
  })

  it('closing a tab clears only that binding', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()
    await act(() => result.current.open('ws_saas'))

    const closed = useWorkspaceStore.getState().bindings['term_backend']!
    act(() => useTerminalStore.getState().removeSession(closed))

    expect(Object.keys(useWorkspaceStore.getState().bindings)).toEqual(['term_frontend'])
  })

  it('is never sent to workspace.save', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))

    // Opening saves nothing at all — but the binding is the specific thing that
    // must never reach disk, because a session id is meaningless after restart.
    expect(api.calls.workspaceSave).toEqual([])
    expect(JSON.stringify(api.storedWorkspaces())).not.toContain('sess_')
  })
})

describe('opening the same workspace twice', () => {
  it('does nothing the second time, rather than duplicating every terminal', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()

    await act(() => result.current.open('ws_saas'))
    await act(() => result.current.open('ws_saas'))

    expect(api.calls.create).toHaveLength(2)
    expect(useTerminalStore.getState().order).toHaveLength(2)
  })
})

/** Saving is explicit: runtime tab edits are not workspace edits. */
describe('runtime changes do not save', () => {
  it('renaming or re-focusing a tab writes nothing to the workspace', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()
    await act(() => result.current.open('ws_saas'))

    const [first, second] = useTerminalStore.getState().order
    act(() => {
      useTerminalStore.getState().renameSession(first!, 'Renamed at runtime')
      useTerminalStore.getState().setActive(second!)
    })

    expect(api.calls.workspaceSave).toEqual([])
    expect(api.storedWorkspaces()[0]?.terminals.map((t) => t.title)).toEqual([
      'term_backend',
      'term_frontend'
    ])
  })
})
