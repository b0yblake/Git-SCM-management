import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Workspace, WorkspaceInput } from '@shared/contracts/workspace'
import { createFakeGitDeckApi, type FakeGitDeckApi } from '../../../testing/fakeGitDeckApi'
import { useTerminalStore } from '../../terminal/public'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useWorkspaces } from './useWorkspaces'

const WS_ID = 'ws_saas'

const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: WS_ID,
  name: 'My SaaS',
  version: 1,
  terminals: [{ id: 'term_1', title: 'Backend', cwd: 'C:\\a', shellProfileId: 'git-bash' }],
  createdAt: 1,
  updatedAt: 2,
  ...overrides
})

const INPUT: WorkspaceInput = {
  name: 'My SaaS',
  terminals: [{ id: 'term_1', title: 'Backend', cwd: 'C:\\a', shellProfileId: 'git-bash' }]
}

let api: FakeGitDeckApi

const mount = () => renderHook(() => useWorkspaces())

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  useWorkspaceStore.getState().reset()
  useTerminalStore.getState().reset()
})

afterEach(() => {
  api.uninstall()
})

describe('loading', () => {
  it('lists what is stored', async () => {
    api.seedWorkspaces(workspace(), workspace({ id: 'ws_docs', name: 'Docs' }))
    const { result } = mount()

    await waitFor(() => expect(result.current.summaries).toHaveLength(2))
    expect(result.current.summaries.map((entry) => entry.name)).toEqual(['My SaaS', 'Docs'])
  })

  /**
   * The store's `activeWorkspaceId` means "open right now", not "opened last
   * time". Seeding it from settings here would make `open()` believe the
   * workspace was already open and skip restoring it entirely.
   */
  it('does not treat the persisted id as an open workspace', async () => {
    api.seedWorkspaces(workspace())
    await api.settings.update({ activeWorkspaceId: WS_ID })
    const { result } = mount()

    await waitFor(() => expect(result.current.summaries).toHaveLength(1))
    expect(result.current.activeWorkspaceId).toBeNull()
  })

  it('surfaces a failure to list', async () => {
    api.workspace.list = () =>
      Promise.resolve({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'disk is on fire' } })
    const { result } = mount()

    await waitFor(() => expect(result.current.lastError?.message).toBe('disk is on fire'))
  })
})

describe('save', () => {
  it('sends the input once and returns what was stored', async () => {
    const { result } = mount()

    const saved = await act(() => result.current.save(INPUT))

    expect(api.calls.workspaceSave).toEqual([INPUT])
    expect(saved?.name).toBe('My SaaS')
  })

  it('refreshes the list so a new workspace appears without a reload', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.summaries).toEqual([]))

    await act(() => result.current.save(INPUT))

    await waitFor(() => expect(result.current.summaries).toHaveLength(1))
  })

  it('reports a rejection and returns null, so the editor can stay open', async () => {
    api.workspace.save = () =>
      Promise.resolve({ ok: false, error: { code: 'INVALID_WORKSPACE', message: 'name required' } })
    const { result } = mount()

    const saved = await act(() => result.current.save({ name: '', terminals: [] }))

    expect(saved).toBeNull()
    expect(result.current.lastError?.code).toBe('INVALID_WORKSPACE')
  })

  it('never sends version or timestamps — Main owns those', async () => {
    const { result } = mount()

    await act(() => result.current.save(INPUT))

    const sent = api.calls.workspaceSave[0]!
    expect(sent).not.toHaveProperty('version')
    expect(sent).not.toHaveProperty('createdAt')
    expect(sent).not.toHaveProperty('updatedAt')
  })
})

describe('delete', () => {
  it('removes the workspace and refreshes the list', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()
    await waitFor(() => expect(result.current.summaries).toHaveLength(1))

    await act(() => result.current.remove(WS_ID))

    expect(api.calls.workspaceDelete).toEqual([WS_ID])
    await waitFor(() => expect(result.current.summaries).toEqual([]))
  })

  it('clears the active workspace when it is the one being deleted', async () => {
    api.seedWorkspaces(workspace())
    await api.settings.update({ activeWorkspaceId: WS_ID })
    useWorkspaceStore.getState().setActiveWorkspaceId(WS_ID)
    const { result } = mount()
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe(WS_ID))

    await act(() => result.current.remove(WS_ID))

    expect(result.current.activeWorkspaceId).toBeNull()
    expect(api.storedSettings().activeWorkspaceId).toBeNull()
  })

  /** The definition is what was thrown away — the running shells are the user's work. */
  it('does not kill the terminals the workspace had opened', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()
    await waitFor(() => expect(result.current.summaries).toHaveLength(1))

    await act(() => result.current.remove(WS_ID))

    expect(api.calls.kill).toEqual([])
  })
})

describe('load', () => {
  it('returns the full workspace, definitions included', async () => {
    api.seedWorkspaces(workspace())
    const { result } = mount()

    const loaded = await act(() => result.current.load(WS_ID))

    expect(loaded?.terminals).toHaveLength(1)
  })

  it('returns null and reports the error for an unknown id', async () => {
    const { result } = mount()

    const loaded = await act(() => result.current.load('ws_missing'))

    expect(loaded).toBeNull()
    expect(result.current.lastError?.code).toBe('WORKSPACE_NOT_FOUND')
  })
})
