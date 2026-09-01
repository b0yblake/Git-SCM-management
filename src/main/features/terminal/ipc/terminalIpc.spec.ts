import { beforeEach, describe, expect, it } from 'vitest'
import { IPC, IPC_ERROR_CODES, MAX_TERMINAL_DIMENSION } from '@shared/contracts/ipc'
import type { IpcError } from '@shared/contracts/ipc'
import type { Result } from '@shared/domain/result'
import type { EventBroadcaster, IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import type { TerminalSessionInfo } from '../domain/TerminalSession'
import { TerminalManager } from '../application/TerminalManager'
import { TerminalService } from '../application/TerminalService'
import { FakePtyFactory } from '../testing/FakePtyFactory'
import { registerTerminalIpc } from './terminalIpc'

/** Records what was registered so a test can invoke a channel directly. */
class FakeRegistry implements IpcHandlerRegistry {
  readonly handlers = new Map<string, (payload: unknown) => unknown>()
  readonly listeners = new Map<string, (payload: unknown) => void>()

  handle(channel: string, handler: (payload: unknown) => unknown): void {
    this.handlers.set(channel, handler)
  }

  on(channel: string, handler: (payload: unknown) => void): void {
    this.listeners.set(channel, handler)
  }

  invoke<T>(channel: string, payload: unknown): T {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`no handler for ${channel}`)
    return handler(payload) as T
  }

  send(channel: string, payload: unknown): void {
    const listener = this.listeners.get(channel)
    if (!listener) throw new Error(`no listener for ${channel}`)
    listener(payload)
  }
}

class FakeBroadcaster implements EventBroadcaster {
  readonly sent: Array<{ channel: string; payload: unknown }> = []

  send(channel: string, payload: unknown): void {
    this.sent.push({ channel, payload })
  }
}

const DEFAULT_CWD = 'C:/Users/test'
const DEFAULT_SHELL_PROFILE_ID = 'powershell' as const
const SERVICE_OPTIONS = {
  defaultCwd: DEFAULT_CWD,
  defaultShellProfileId: () => DEFAULT_SHELL_PROFILE_ID,
  availableShellProfiles: () => [{ id: DEFAULT_SHELL_PROFILE_ID, label: 'Windows PowerShell' }],
  directoryExists: () => true
}

let registry: FakeRegistry
let broadcaster: FakeBroadcaster
let factory: FakePtyFactory
let logger: FakeLogger

const create = (payload: unknown): Result<TerminalSessionInfo, IpcError> =>
  registry.invoke(IPC.terminal.create, payload)

const openSession = (): TerminalSessionInfo => {
  const result = create({ cwd: 'D:\\work' })
  if (!result.ok) throw new Error('expected the session to open')
  return result.value
}

beforeEach(() => {
  registry = new FakeRegistry()
  broadcaster = new FakeBroadcaster()
  factory = new FakePtyFactory()
  logger = createFakeLogger()

  registerTerminalIpc({
    registry,
    broadcaster,
    terminal: new TerminalService(new TerminalManager(factory, logger), SERVICE_OPTIONS),
    logger
  })
})

describe('handler behaviour', () => {
  it('create delegates to the service and returns the session info', () => {
    const result = create({ cwd: 'D:\\work', shellProfileId: 'git-bash', cols: 100, rows: 30 })

    expect(result.ok).toBe(true)
    expect(factory.created).toHaveLength(1)
    expect(factory.last.options).toEqual({
      shellProfileId: 'git-bash',
      cwd: 'D:\\work',
      cols: 100,
      rows: 30
    })
  })

  it('write delegates to the service', () => {
    const session = openSession()

    registry.send(IPC.terminal.write, { sessionId: session.id, data: 'ls\r' })

    expect(factory.last.writes).toEqual(['ls\r'])
  })

  it('resize delegates to the service', () => {
    const session = openSession()

    registry.send(IPC.terminal.resize, { sessionId: session.id, cols: 120, rows: 40 })

    expect(factory.last.resizes).toEqual([{ cols: 120, rows: 40 }])
  })

  it('kill delegates to the service', () => {
    const session = openSession()

    const result = registry.invoke<Result<null, IpcError>>(IPC.terminal.kill, {
      sessionId: session.id
    })

    expect(result.ok).toBe(true)
    expect(factory.last.killed).toBe(true)
  })

  it('the response payload survives structuredClone', () => {
    const result = create({ cwd: 'D:\\work' })

    expect(() => structuredClone(result)).not.toThrow()
    expect(structuredClone(result)).toEqual(result)
  })
})

describe('input validation', () => {
  const expectRejected = (result: Result<unknown, IpcError>): void => {
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(IPC_ERROR_CODES.invalidRequest)
    expect(factory.created).toHaveLength(0)
  }

  it('create with a non-string cwd is rejected', () => {
    expectRejected(create({ cwd: 42 }))
  })

  it('create with an empty cwd is rejected rather than silently defaulted', () => {
    expectRejected(create({ cwd: '' }))
  })

  it('create with an unknown shell profile is rejected', () => {
    expectRejected(create({ cwd: 'D:\\work', shellProfileId: 'fish' }))
  })

  it.each([null, undefined, 'a string', 42, []])(
    'create with a %s payload is rejected',
    (payload) => {
      expectRejected(create(payload))
    }
  )

  it.each([null, undefined, 'a string'])('kill with a %s payload is rejected', (payload) => {
    expectRejected(registry.invoke(IPC.terminal.kill, payload))
  })

  it.each([
    ['a missing sessionId', { data: 'x' }],
    ['a non-string sessionId', { sessionId: 7, data: 'x' }],
    ['an empty sessionId', { sessionId: '', data: 'x' }],
    ['non-string data', { sessionId: 'sess_1', data: 7 }],
    ['missing data', { sessionId: 'sess_1' }],
    ['a null payload', null]
  ])('write with %s never reaches the service', (_label, payload) => {
    openSession()

    registry.send(IPC.terminal.write, payload)

    expect(factory.last.writes).toEqual([])
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['NaN', Number.NaN],
    ['fractional', 40.5],
    ['above the upper bound', MAX_TERMINAL_DIMENSION + 1],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '80']
  ])('resize with %s cols never reaches the service', (_label, cols) => {
    const session = openSession()

    registry.send(IPC.terminal.resize, { sessionId: session.id, cols, rows: 24 })

    expect(factory.last.resizes).toEqual([])
  })

  it('resize accepts exactly the documented upper bound', () => {
    const session = openSession()

    registry.send(IPC.terminal.resize, {
      sessionId: session.id,
      cols: MAX_TERMINAL_DIMENSION,
      rows: MAX_TERMINAL_DIMENSION
    })

    expect(factory.last.resizes).toEqual([
      { cols: MAX_TERMINAL_DIMENSION, rows: MAX_TERMINAL_DIMENSION }
    ])
  })

  it('strips an unknown extra field instead of forwarding it', () => {
    const result = create({ cwd: 'D:\\work', __proto__hack: 'x', extra: 'ignored' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.value.definition).sort()).toEqual([
      'cwd',
      'id',
      'shellProfileId',
      'title'
    ])
  })
})

describe('error translation', () => {
  it('a TerminalSessionNotFoundError becomes a serializable error with a stable code', () => {
    const result = registry.invoke<Result<null, IpcError>>(IPC.terminal.kill, {
      sessionId: 'sess_missing'
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('TERMINAL_SESSION_NOT_FOUND')
    expect(() => structuredClone(result.error)).not.toThrow()
  })

  it('the error carries no stack trace and no absolute path', () => {
    const result = registry.invoke<Result<null, IpcError>>(IPC.terminal.kill, {
      sessionId: 'sess_missing'
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    const serialized = JSON.stringify(result.error)
    expect(Object.keys(result.error).sort()).toEqual(['code', 'message'])
    expect(serialized).not.toMatch(/[A-Za-z]:\\\\/)
    expect(serialized).not.toContain('/src/')
    expect(serialized).not.toContain('at ')
  })

  it('never returns a native Error instance', () => {
    const result = registry.invoke<Result<null, IpcError>>(IPC.terminal.kill, {
      sessionId: 'sess_missing'
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).not.toBeInstanceOf(Error)
  })

  it('collapses an unexpected non-AppError to a generic message', () => {
    factory.failNextCreate = new Error('C:\\secret\\path exploded')

    // A failed spawn is reported as a failed session, not as a thrown error.
    const result = create({ cwd: 'D:\\work' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe('failed')
    expect(JSON.stringify(result.value)).not.toContain('secret')
  })
})

describe('events', () => {
  it('forwards PTY data on terminal:data carrying its sessionId', () => {
    const session = openSession()

    factory.last.emitData('hello\r\n')

    expect(broadcaster.sent).toEqual([
      { channel: IPC.terminal.data, payload: { sessionId: session.id, data: 'hello\r\n' } }
    ])
  })

  it('forwards PTY exit on terminal:exit carrying sessionId and exitCode', () => {
    const session = openSession()

    factory.last.emitExit(3)

    expect(broadcaster.sent).toEqual([
      { channel: IPC.terminal.exit, payload: { sessionId: session.id, exitCode: 3 } }
    ])
  })

  it('event payloads survive structuredClone', () => {
    openSession()

    factory.last.emitData('x')

    expect(() => structuredClone(broadcaster.sent[0]?.payload)).not.toThrow()
  })

  it('stops forwarding once the registration is disposed', () => {
    const ownRegistry = new FakeRegistry()
    const ownBroadcaster = new FakeBroadcaster()
    const ownFactory = new FakePtyFactory()
    const dispose = registerTerminalIpc({
      registry: ownRegistry,
      broadcaster: ownBroadcaster,
      terminal: new TerminalService(new TerminalManager(ownFactory, logger), SERVICE_OPTIONS),
      logger
    })
    ownRegistry.invoke(IPC.terminal.create, { cwd: 'D:\\work' })

    ownFactory.last.emitData('before dispose')
    expect(ownBroadcaster.sent).toHaveLength(1)

    dispose()
    ownFactory.last.emitData('after dispose')

    expect(ownBroadcaster.sent).toHaveLength(1)
  })
})
