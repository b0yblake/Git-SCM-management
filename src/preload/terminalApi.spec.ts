import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/contracts/ipc'

type Listener = (event: unknown, payload: unknown) => void

const listeners = new Map<string, Listener[]>()
const invoked: Array<{ channel: string; payload: unknown }> = []
const sent: Array<{ channel: string; payload: unknown }> = []
let invokeResult: unknown = { ok: true, value: null }

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (channel: string, payload: unknown) => {
      invoked.push({ channel, payload })
      return Promise.resolve(invokeResult)
    },
    send: (channel: string, payload: unknown) => {
      sent.push({ channel, payload })
    },
    on: (channel: string, listener: Listener) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener])
    },
    off: (channel: string, listener: Listener) => {
      listeners.set(
        channel,
        (listeners.get(channel) ?? []).filter((l) => l !== listener)
      )
    }
  }
}))

const { terminalApi } = await import('./terminalApi')

const listenerCount = (channel: string): number => listeners.get(channel)?.length ?? 0
const emit = (channel: string, payload: unknown): void => {
  for (const listener of [...(listeners.get(channel) ?? [])]) listener({}, payload)
}

beforeEach(() => {
  listeners.clear()
  invoked.length = 0
  sent.length = 0
  invokeResult = { ok: true, value: null }
})

describe('bridge shape', () => {
  it('exposes exactly the documented members and no more', () => {
    // Six from ARCHITECTURE.md §7 plus 'profiles' (Phase 5) and the two
    // Explorer open-path members (Phase 18).
    expect(Object.keys(terminalApi).sort()).toEqual([
      'create',
      'kill',
      'onData',
      'onExit',
      'onOpenPath',
      'pendingOpenPath',
      'profiles',
      'resize',
      'write'
    ])
  })

  it('exposes no generic command-execution member', () => {
    const forbidden = ['exec', 'execute', 'run', 'spawn', 'invoke', 'send', 'ipcRenderer']

    for (const name of forbidden) {
      expect(terminalApi).not.toHaveProperty(name)
    }
  })
})

describe('request/response members', () => {
  it('create invokes the create channel and forwards the Result', async () => {
    invokeResult = { ok: true, value: { id: 'sess_1' } }

    const result = await terminalApi.create({ cwd: 'D:\\work' })

    expect(invoked).toEqual([{ channel: IPC.terminal.create, payload: { cwd: 'D:\\work' } }])
    expect(result).toEqual({ ok: true, value: { id: 'sess_1' } })
  })

  /**
   * The reason this API resolves instead of rejecting: contextBridge rebuilds a
   * rejected Error and drops custom properties, so `code` would not survive.
   * A plain object does, and it must stay structured-cloneable to prove it.
   */
  it('create resolves with a failure Result that keeps the error code', async () => {
    invokeResult = { ok: false, error: { code: 'SHELL_NOT_FOUND', message: 'nope' } }

    const result = await terminalApi.create({ cwd: 'D:\\work' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SHELL_NOT_FOUND')
    expect(() => structuredClone(result)).not.toThrow()
  })

  it('never surfaces an Error instance across the bridge', async () => {
    invokeResult = { ok: false, error: { code: 'X', message: 'y' } }

    const result = await terminalApi.create({ cwd: 'D:\\work' })

    expect(result).not.toBeInstanceOf(Error)
    if (result.ok) return
    expect(result.error).not.toBeInstanceOf(Error)
  })

  it('kill invokes the kill channel with the session id', async () => {
    const result = await terminalApi.kill('sess_1')

    expect(invoked).toEqual([{ channel: IPC.terminal.kill, payload: { sessionId: 'sess_1' } }])
    expect(result.ok).toBe(true)
  })
})

describe('fire-and-forget members', () => {
  it('write sends rather than invokes', () => {
    terminalApi.write('sess_1', 'ls\r')

    expect(sent).toEqual([
      { channel: IPC.terminal.write, payload: { sessionId: 'sess_1', data: 'ls\r' } }
    ])
    expect(invoked).toEqual([])
  })

  it('resize sends rather than invokes', () => {
    terminalApi.resize('sess_1', 120, 40)

    expect(sent).toEqual([
      { channel: IPC.terminal.resize, payload: { sessionId: 'sess_1', cols: 120, rows: 40 } }
    ])
    expect(invoked).toEqual([])
  })
})

describe('subscription cleanup', () => {
  it('onData delivers events and stops after unsubscribe', () => {
    const received: unknown[] = []
    const unsubscribe = terminalApi.onData((event) => received.push(event))

    emit(IPC.terminal.data, { sessionId: 'sess_1', data: 'one' })
    unsubscribe()
    emit(IPC.terminal.data, { sessionId: 'sess_1', data: 'two' })

    expect(received).toEqual([{ sessionId: 'sess_1', data: 'one' }])
  })

  it('onExit delivers events and stops after unsubscribe', () => {
    const received: unknown[] = []
    const unsubscribe = terminalApi.onExit((event) => received.push(event))

    emit(IPC.terminal.exit, { sessionId: 'sess_1', exitCode: 0 })
    unsubscribe()
    emit(IPC.terminal.exit, { sessionId: 'sess_1', exitCode: 1 })

    expect(received).toEqual([{ sessionId: 'sess_1', exitCode: 0 }])
  })

  it('subscribing twice and unsubscribing once leaves exactly one live listener', () => {
    const first = terminalApi.onData(() => {})
    terminalApi.onData(() => {})

    first()

    expect(listenerCount(IPC.terminal.data)).toBe(1)
  })

  it('100 subscribe/unsubscribe cycles leave zero listeners', () => {
    for (let i = 0; i < 100; i++) {
      const unsubscribeData = terminalApi.onData(() => {})
      const unsubscribeExit = terminalApi.onExit(() => {})
      unsubscribeData()
      unsubscribeExit()
    }

    expect(listenerCount(IPC.terminal.data)).toBe(0)
    expect(listenerCount(IPC.terminal.exit)).toBe(0)
  })

  it('unsubscribing twice is harmless', () => {
    const unsubscribe = terminalApi.onData(() => {})

    unsubscribe()

    expect(() => unsubscribe()).not.toThrow()
    expect(listenerCount(IPC.terminal.data)).toBe(0)
  })
})
