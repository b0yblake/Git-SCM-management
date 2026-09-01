import { beforeEach, describe, expect, it } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { useTerminalStore } from './terminalStore'

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
  useTerminalStore.getState().reset()
})

describe('addSession', () => {
  it('appends to order and activates the first session', () => {
    store().addSession(session('a'))

    expect(store().order).toEqual(['a'])
    expect(store().activeSessionId).toBe('a')
  })

  it('activates a newly opened terminal — the documented choice', () => {
    seed('a', 'b')

    expect(store().order).toEqual(['a', 'b'])
    expect(store().activeSessionId).toBe('b')
  })

  it('ignores a duplicate id rather than reordering', () => {
    seed('a', 'b')

    store().addSession(session('a', 'renamed by accident'))

    expect(store().order).toEqual(['a', 'b'])
    expect(store().sessions['a']?.definition.title).toBe('a')
  })
})

describe('removeSession', () => {
  it('removes from both sessions and order', () => {
    seed('a', 'b')

    store().removeSession('a')

    expect(store().order).toEqual(['b'])
    expect(store().sessions['a']).toBeUndefined()
  })

  it('activates the tab on the right when the active one closes', () => {
    seed('a', 'b', 'c')
    store().setActive('b')

    store().removeSession('b')

    expect(store().activeSessionId).toBe('c')
  })

  it('falls back to the tab on the left when the last one closes', () => {
    seed('a', 'b')

    store().removeSession('b')

    expect(store().activeSessionId).toBe('a')
  })

  it('clears the active id when the only session closes', () => {
    seed('a')

    store().removeSession('a')

    expect(store().order).toEqual([])
    expect(store().activeSessionId).toBeNull()
  })

  it('leaves the active id alone when a different tab closes', () => {
    seed('a', 'b', 'c')
    store().setActive('a')

    store().removeSession('c')

    expect(store().activeSessionId).toBe('a')
  })

  it('ignores an unknown id', () => {
    seed('a')

    store().removeSession('nope')

    expect(store().order).toEqual(['a'])
  })
})

describe('setActive', () => {
  it('activates a known session', () => {
    seed('a', 'b')

    store().setActive('a')

    expect(store().activeSessionId).toBe('a')
  })

  it('is a no-op for an unknown id rather than a crash', () => {
    seed('a')

    expect(() => store().setActive('nope')).not.toThrow()
    expect(store().activeSessionId).toBe('a')
  })
})

describe('renameSession', () => {
  it('changes only the title', () => {
    seed('a', 'b')
    store().setActive('a')

    store().renameSession('a', 'Backend')

    expect(store().sessions['a']?.definition.title).toBe('Backend')
    expect(store().order).toEqual(['a', 'b'])
    expect(store().activeSessionId).toBe('a')
  })

  it('leaves the rest of the definition untouched', () => {
    seed('a')
    const before = store().sessions['a']?.definition

    store().renameSession('a', 'Renamed')

    expect(store().sessions['a']?.definition.cwd).toBe(before?.cwd)
    expect(store().sessions['a']?.definition.id).toBe(before?.id)
  })

  it('ignores an unknown id', () => {
    seed('a')

    expect(() => store().renameSession('nope', 'x')).not.toThrow()
  })
})

describe('markExited', () => {
  it('records the status and code without closing the tab', () => {
    seed('a')

    store().markExited('a', 130)

    expect(store().sessions['a']?.status).toBe('exited')
    expect(store().sessions['a']?.exitCode).toBe(130)
    expect(store().order).toEqual(['a'])
  })

  it('ignores an unknown id', () => {
    expect(() => store().markExited('nope', 0)).not.toThrow()
  })
})

describe('serializability', () => {
  it('order reflects creation order and survives renames', () => {
    seed('a', 'b', 'c')

    store().renameSession('b', 'zzz')

    expect(store().order).toEqual(['a', 'b', 'c'])
  })

  /** Proves no xterm instance or PTY handle ever leaked into the store. */
  it('the whole state survives a JSON round-trip', () => {
    seed('a', 'b')
    store().markExited('a', 0)

    const { sessions, order, activeSessionId } = store()
    const snapshot = { sessions, order, activeSessionId }

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('the whole state survives structuredClone', () => {
    seed('a')

    const { sessions, order, activeSessionId } = store()

    expect(() => structuredClone({ sessions, order, activeSessionId })).not.toThrow()
  })
})
