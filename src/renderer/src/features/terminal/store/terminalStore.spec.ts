import { beforeEach, describe, expect, it } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { TERMINAL_LAYOUT_CAPACITY, useTerminalStore } from './terminalStore'

const session = (id: string, title = id): TerminalSessionInfo => ({
  id,
  definition: { id: `term_${id}`, title, cwd: 'C:/work', shellProfileId: 'powershell' },
  status: 'running',
  createdAt: 0
})

const store = () => useTerminalStore.getState()

const seed = (...ids: string[]): void => {
  for (const id of ids) store().addSession(session(id))
}

beforeEach(() => {
  store().reset()
})

describe('Mosaic defaults and session creation', () => {
  it('starts in the unbounded Grid layout', () => {
    expect(store().layoutMode).toBe('grid')
    expect(TERMINAL_LAYOUT_CAPACITY[store().layoutMode]).toBe(Number.POSITIVE_INFINITY)
    expect(store().visibleSessionIds).toEqual([])
  })

  it('fills panes in creation order', () => {
    seed('a', 'b', 'c', 'd')

    expect(store().order).toEqual(['a', 'b', 'c', 'd'])
    expect(store().visibleSessionIds).toEqual(['a', 'b', 'c', 'd'])
    expect(store().activeSessionId).toBe('d')
  })

  it('keeps a fifth session on the Grid canvas — nothing is evicted (Phase 21)', () => {
    seed('a', 'b', 'c', 'd', 'e')

    expect(store().order).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(store().visibleSessionIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(store().activeSessionId).toBe('e')
  })

  it('ignores duplicate session ids', () => {
    seed('a', 'b')
    store().addSession(session('a', 'accidental rename'))

    expect(store().order).toEqual(['a', 'b'])
    expect(store().visibleSessionIds).toEqual(['a', 'b'])
    expect(store().sessions['a']?.definition.title).toBe('a')
  })
})

describe('layout presets', () => {
  beforeEach(() => seed('a', 'b', 'c', 'd'))

  it('keeps the focused terminal when switching to Focus', () => {
    store().setActive('c')
    store().setLayoutMode('focus')

    expect(store().visibleSessionIds).toEqual(['c'])
    expect(store().activeSessionId).toBe('c')
  })

  it('remembers the mode Focus was entered from, so restoring returns there', () => {
    store().setLayoutMode('columns')
    store().setLayoutMode('focus')

    expect(store().lastExpandedLayoutMode).toBe('columns')

    store().setLayoutMode(store().lastExpandedLayoutMode)
    expect(store().layoutMode).toBe('columns')
  })

  it('never records Focus as the mode to restore to', () => {
    store().setLayoutMode('focus')
    expect(store().lastExpandedLayoutMode).toBe('grid')

    store().setLayoutMode('main-side')
    store().setLayoutMode('focus')
    expect(store().lastExpandedLayoutMode).toBe('main-side')
  })

  it('fills newly available panes when expanding again', () => {
    store().setActive('c')
    store().setLayoutMode('focus')
    store().setLayoutMode('grid')

    expect(store().visibleSessionIds).toEqual(['c', 'a', 'b', 'd'])
    expect(store().activeSessionId).toBe('c')
  })

  it('obeys every preset capacity, and Grid takes everything', () => {
    store().setLayoutMode('focus')
    expect(store().visibleSessionIds).toHaveLength(1)
    store().setLayoutMode('columns')
    expect(store().visibleSessionIds).toHaveLength(2)
    store().setLayoutMode('main-side')
    expect(store().visibleSessionIds).toHaveLength(3)
    store().setLayoutMode('grid')
    expect(store().visibleSessionIds).toHaveLength(4)

    seed('e', 'f')
    expect(store().visibleSessionIds).toHaveLength(6)
  })
})

describe('focus, parking, and closing', () => {
  it('shows a parked session in the focused pane of a bounded preset', () => {
    seed('a', 'b', 'c', 'd', 'e')
    store().setLayoutMode('columns')
    expect(store().visibleSessionIds).toEqual(['a', 'e'])

    store().setActive('d')

    expect(store().order).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(store().visibleSessionIds).toEqual(['a', 'd'])
    expect(store().activeSessionId).toBe('d')
  })

  it('re-shows a parked session in Grid by appending, never replacing', () => {
    seed('a', 'b', 'c', 'd', 'e')
    store().hideSession('c')
    expect(store().visibleSessionIds).toEqual(['a', 'b', 'd', 'e'])

    store().setActive('c')

    expect(store().visibleSessionIds).toEqual(['a', 'b', 'd', 'e', 'c'])
    expect(store().activeSessionId).toBe('c')
  })

  it('parking removes only the canvas assignment', () => {
    seed('a', 'b')
    store().hideSession('b')

    expect(store().visibleSessionIds).toEqual(['a'])
    expect(store().order).toEqual(['a', 'b'])
    expect(store().sessions['b']).toBeDefined()
    expect(store().activeSessionId).toBe('a')
  })

  it('can park every terminal and restore one through focus', () => {
    seed('a')
    store().hideSession('a')
    expect(store().visibleSessionIds).toEqual([])
    expect(store().activeSessionId).toBeNull()

    store().setActive('a')
    expect(store().visibleSessionIds).toEqual(['a'])
    expect(store().activeSessionId).toBe('a')
  })

  it('closing a focused terminal selects a safe neighbour', () => {
    seed('a', 'b', 'c', 'd', 'e')
    store().setActive('b')
    store().removeSession('b')

    expect(store().order).toEqual(['a', 'c', 'd', 'e'])
    expect(store().activeSessionId).toBe('c')
    expect(store().visibleSessionIds).toEqual(['a', 'c', 'd', 'e'])
  })

  it('closing in a bounded preset backfills the freed pane', () => {
    seed('a', 'b', 'c')
    store().setLayoutMode('columns')
    expect(store().visibleSessionIds).toEqual(['a', 'c'])

    store().removeSession('c')

    expect(store().visibleSessionIds).toEqual(['a', 'b'])
    expect(store().activeSessionId).toBe('b')
  })

  it('closing in Grid never resurrects a parked terminal (Phase 21)', () => {
    seed('a', 'b', 'c', 'd', 'e')
    store().hideSession('b')
    store().removeSession('e')

    expect(store().visibleSessionIds).toEqual(['a', 'c', 'd'])
    expect(store().sessions['b']).toBeDefined()
  })

  it('closing a parked terminal leaves visible panes unchanged', () => {
    seed('a', 'b', 'c', 'd', 'e')
    store().hideSession('d')
    const before = [...store().visibleSessionIds]
    store().removeSession('d')

    expect(store().visibleSessionIds).toEqual(before)
    expect(store().sessions['d']).toBeUndefined()
  })
})

describe('session metadata and serializability', () => {
  it('renames and marks exited sessions without changing layout', () => {
    seed('a', 'b')
    const visible = [...store().visibleSessionIds]

    store().renameSession('a', 'Backend')
    store().markExited('b', 130)

    expect(store().sessions['a']?.definition.title).toBe('Backend')
    expect(store().sessions['b']?.status).toBe('exited')
    expect(store().visibleSessionIds).toEqual(visible)
  })

  it('survives JSON and structured-clone round trips', () => {
    seed('a', 'b', 'c')
    store().setLayoutMode('columns')
    const { sessions, order, activeSessionId, visibleSessionIds, layoutMode } = store()
    const snapshot = { sessions, order, activeSessionId, visibleSessionIds, layoutMode }

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
    expect(() => structuredClone(snapshot)).not.toThrow()
  })
})
