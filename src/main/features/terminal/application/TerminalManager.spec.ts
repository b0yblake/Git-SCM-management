import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { TerminalSessionNotFoundError } from '../domain/errors'
import type { TerminalDefinition, TerminalSize } from '../domain/TerminalSession'
import { FakePtyFactory } from '../testing/FakePtyFactory'
import { TerminalManager } from './TerminalManager'

const SIZE: TerminalSize = { cols: 80, rows: 24 }

const definition = (overrides: Partial<TerminalDefinition> = {}): TerminalDefinition => ({
  id: 'term_fixed',
  title: 'Terminal',
  cwd: 'D:\\projects\\app',
  shellProfileId: 'powershell',
  ...overrides
})

let factory: FakePtyFactory
let logger: FakeLogger
let manager: TerminalManager

beforeEach(() => {
  factory = new FakePtyFactory()
  logger = createFakeLogger()
  manager = new TerminalManager(factory, logger)
})

describe('lifecycle', () => {
  it('create returns a running session with a unique id', () => {
    const a = manager.create(definition(), SIZE)
    const b = manager.create(definition(), SIZE)

    expect(a.status).toBe('running')
    expect(a.id).not.toBe(b.id)
    expect(a.createdAt).toBeTypeOf('number')
    expect(a.definition).toEqual(definition())
  })

  it('create calls PtyFactory.create exactly once with the cwd and shell from the definition', () => {
    manager.create(definition({ cwd: 'C:\\work', shellProfileId: 'git-bash' }), {
      cols: 120,
      rows: 40
    })

    expect(factory.created).toHaveLength(1)
    expect(factory.last.options).toEqual({
      shellProfileId: 'git-bash',
      cwd: 'C:\\work',
      cols: 120,
      rows: 40
    })
  })

  it('write forwards the exact string to the matching PTY', () => {
    const session = manager.create(definition(), SIZE)

    manager.write(session.id, 'git status\r')

    expect(factory.last.writes).toEqual(['git status\r'])
  })

  it('resize forwards cols and rows to the matching PTY', () => {
    const session = manager.create(definition(), SIZE)

    manager.resize(session.id, 100, 30)

    expect(factory.last.resizes).toEqual([{ cols: 100, rows: 30 }])
  })

  it('kill kills the PTY and moves the session to exited', () => {
    const session = manager.create(definition(), SIZE)

    manager.kill(session.id)

    expect(factory.last.killed).toBe(true)
    expect(manager.get(session.id).status).toBe('exited')
    expect(manager.get(session.id).exitCode).toBe(0)
  })

  it('PTY output triggers a data event tagged with the originating sessionId', () => {
    const session = manager.create(definition(), SIZE)
    const received: unknown[] = []
    manager.onData((event) => received.push(event))

    factory.last.emitData('hello\r\n')

    expect(received).toEqual([{ sessionId: session.id, data: 'hello\r\n' }])
  })

  it('PTY exit sets status exited, records exitCode and emits an exit event', () => {
    const session = manager.create(definition(), SIZE)
    const received: unknown[] = []
    manager.onExit((event) => received.push(event))

    factory.last.emitExit(3)

    expect(received).toEqual([{ sessionId: session.id, exitCode: 3 }])
    expect(manager.get(session.id).status).toBe('exited')
    expect(manager.get(session.id).exitCode).toBe(3)
  })

  it('unsubscribing stops further events', () => {
    manager.create(definition(), SIZE)
    const received: unknown[] = []
    const unsubscribe = manager.onData((event) => received.push(event))

    factory.last.emitData('one')
    unsubscribe()
    factory.last.emitData('two')

    expect(received).toHaveLength(1)
  })
})

describe('isolation between sessions', () => {
  it('data from session A never reaches a listener filtering on session B', () => {
    const a = manager.create(definition({ title: 'A' }), SIZE)
    const b = manager.create(definition({ title: 'B' }), SIZE)
    const forB: string[] = []
    manager.onData((event) => {
      if (event.sessionId === b.id) forB.push(event.data)
    })

    factory.at(0).emitData('output from A')

    expect(forB).toEqual([])
    expect(a.id).not.toBe(b.id)
  })

  it('killing session A leaves session B running and still emitting', () => {
    const a = manager.create(definition(), SIZE)
    const b = manager.create(definition(), SIZE)
    const fromB: string[] = []
    manager.onData((event) => {
      if (event.sessionId === b.id) fromB.push(event.data)
    })

    manager.kill(a.id)
    factory.at(1).emitData('still alive')

    expect(manager.get(b.id).status).toBe('running')
    expect(fromB).toEqual(['still alive'])
  })

  it('three concurrent sessions each receive only their own output', () => {
    const sessions = [0, 1, 2].map(() => manager.create(definition(), SIZE))
    const byId = new Map(sessions.map((session) => [session.id, [] as string[]]))
    manager.onData((event) => byId.get(event.sessionId)?.push(event.data))

    factory.at(0).emitData('a')
    factory.at(1).emitData('b')
    factory.at(2).emitData('c')

    expect(byId.get(sessions[0]!.id)).toEqual(['a'])
    expect(byId.get(sessions[1]!.id)).toEqual(['b'])
    expect(byId.get(sessions[2]!.id)).toEqual(['c'])
  })
})

describe('errors', () => {
  it.each(['write', 'resize', 'kill', 'get'] as const)(
    '%s on an unknown session id throws TerminalSessionNotFoundError',
    (method) => {
      const call = {
        write: () => manager.write('sess_missing', 'x'),
        resize: () => manager.resize('sess_missing', 80, 24),
        kill: () => manager.kill('sess_missing'),
        get: () => manager.get('sess_missing')
      }[method]

      expect(call).toThrow(TerminalSessionNotFoundError)
    }
  )

  it('a failed spawn returns status failed and registers no orphan session', () => {
    factory.failNextCreate = new Error('shell not found')

    const session = manager.create(definition(), SIZE)

    expect(session.status).toBe('failed')
    expect(manager.list()).toEqual([])
    expect(() => manager.get(session.id)).toThrow(TerminalSessionNotFoundError)
    expect(logger.entriesAt('error')).toHaveLength(1)
  })

  it('an unexpected non-zero exit is reported, not swallowed', () => {
    const session = manager.create(definition(), SIZE)
    const received: unknown[] = []
    manager.onExit((event) => received.push(event))

    factory.last.emitExit(137)

    expect(received).toEqual([{ sessionId: session.id, exitCode: 137 }])
    expect(factory.last.killed).toBe(false)
    expect(logger.entriesAt('info').some((entry) => entry.message === 'terminal exited')).toBe(true)
  })

  it('writing to an exited session is a no-op rather than a crash', () => {
    const session = manager.create(definition(), SIZE)
    factory.last.emitExit(0)

    expect(() => manager.write(session.id, 'ls')).not.toThrow()
    expect(factory.last.writes).toEqual([])
  })
})

describe('cleanup', () => {
  it('disposeAll kills every live session', () => {
    manager.create(definition(), SIZE)
    manager.create(definition(), SIZE)

    manager.disposeAll()

    expect(factory.created.every((pty) => pty.killed)).toBe(true)
    expect(manager.list()).toEqual([])
  })

  it('disposeAll is idempotent', () => {
    manager.create(definition(), SIZE)
    manager.disposeAll()

    expect(() => manager.disposeAll()).not.toThrow()
  })

  it('disposeAll does not fan exit events out to listeners being torn down', () => {
    manager.create(definition(), SIZE)
    const onExit = vi.fn()
    manager.onExit(onExit)

    manager.disposeAll()

    expect(onExit).not.toHaveBeenCalled()
  })

  it('detaches its listeners from the PTY once a session exits', () => {
    manager.create(definition(), SIZE)
    expect(factory.last.listenerCount).toBe(2)

    factory.last.emitExit(0)

    expect(factory.last.listenerCount).toBe(0)
  })

  it('creating and killing 100 sessions leaves nothing live and no listeners', () => {
    for (let i = 0; i < 100; i++) {
      const session = manager.create(definition(), SIZE)
      manager.kill(session.id)
    }

    expect(factory.created).toHaveLength(100)
    expect(factory.live).toEqual([])
    expect(factory.created.every((pty) => pty.listenerCount === 0)).toBe(true)
  })
})
