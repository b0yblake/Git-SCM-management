import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkspaceSummary } from '@shared/contracts/workspace'
import { useWorkspaceStore } from './workspaceStore'

const summary = (id: string, name: string): WorkspaceSummary => ({
  id,
  name,
  terminalCount: 2,
  createdAt: 1,
  updatedAt: 2
})

const store = () => useWorkspaceStore.getState()

beforeEach(() => {
  useWorkspaceStore.getState().reset()
})

describe('summaries and the active workspace', () => {
  it('replaces the summary list', () => {
    store().setSummaries([summary('ws_a', 'A'), summary('ws_b', 'B')])

    expect(store().summaries.map((entry) => entry.name)).toEqual(['A', 'B'])
  })

  it('tracks which workspace is open, including none', () => {
    store().setActiveWorkspaceId('ws_a')
    expect(store().activeWorkspaceId).toBe('ws_a')

    store().setActiveWorkspaceId(null)
    expect(store().activeWorkspaceId).toBeNull()
  })
})

describe('bindings', () => {
  it('maps a definition to the session running it', () => {
    store().bind('term_a', 'sess_1')

    expect(store().bindings).toEqual({ term_a: 'sess_1' })
  })

  it('re-binding a definition replaces its session rather than adding one', () => {
    store().bind('term_a', 'sess_1')
    store().bind('term_a', 'sess_2')

    expect(store().bindings).toEqual({ term_a: 'sess_2' })
  })

  it('drops only the bindings whose session is gone', () => {
    store().bind('term_a', 'sess_1')
    store().bind('term_b', 'sess_2')

    store().retainBindings(['sess_2'])

    expect(store().bindings).toEqual({ term_b: 'sess_2' })
  })

  it('drops every binding when no session survives', () => {
    store().bind('term_a', 'sess_1')

    store().retainBindings([])

    expect(store().bindings).toEqual({})
  })

  /** It runs on every terminal-store change, so a no-op must stay a no-op. */
  it('leaves the state object untouched when nothing needs dropping', () => {
    store().bind('term_a', 'sess_1')
    const before = store().bindings

    store().retainBindings(['sess_1', 'sess_9'])

    expect(store().bindings).toBe(before)
  })
})

describe('open failures', () => {
  it('records which definitions could not be opened', () => {
    store().setOpenNotices([
      { definitionId: 'term_a', title: 'Backend', severity: 'error', message: 'no shell' }
    ])

    expect(store().openNotices[0]?.title).toBe('Backend')
  })

  it('separates a terminal that did not open from one that opened elsewhere', () => {
    store().setOpenNotices([
      { definitionId: 'term_a', title: 'Backend', severity: 'error', message: 'no shell' },
      { definitionId: 'term_b', title: 'Frontend', severity: 'warning', message: 'cwd is gone' }
    ])

    expect(store().openNotices.map((notice) => notice.severity)).toEqual(['error', 'warning'])
  })

  it('a later open replaces the previous notices rather than appending', () => {
    store().setOpenNotices([
      { definitionId: 'term_a', title: 'Backend', severity: 'error', message: 'no' }
    ])
    store().setOpenNotices([])

    expect(store().openNotices).toEqual([])
  })
})

describe('reset', () => {
  it('clears everything', () => {
    store().setSummaries([summary('ws_a', 'A')])
    store().setActiveWorkspaceId('ws_a')
    store().bind('term_a', 'sess_1')
    store().setOpenNotices([
      { definitionId: 'term_a', title: 'A', severity: 'error', message: 'no' }
    ])

    store().reset()

    expect(store().summaries).toEqual([])
    expect(store().activeWorkspaceId).toBeNull()
    expect(store().bindings).toEqual({})
    expect(store().openNotices).toEqual([])
  })
})

/** Proves no session object or xterm instance leaked into the store. */
describe('serializability', () => {
  it('the whole state survives a JSON round trip', () => {
    store().setSummaries([summary('ws_a', 'A')])
    store().setActiveWorkspaceId('ws_a')
    store().bind('term_a', 'sess_1')

    const { summaries, activeWorkspaceId, bindings, openNotices } = store()
    const state = { summaries, activeWorkspaceId, bindings, openNotices }

    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})
