import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/contracts/ipc'

type Listener = (event: unknown, payload?: unknown) => void

const listeners = new Map<string, Listener[]>()
const invoked: Array<{ channel: string; payload: unknown }> = []
let invokeResult: unknown = { ok: true, value: null }

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (channel: string, payload: unknown) => {
      invoked.push({ channel, payload })
      return Promise.resolve(invokeResult)
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

const { portsApi } = await import('./portsApi')

const listenerCount = (channel: string): number => listeners.get(channel)?.length ?? 0
const emit = (channel: string): void => {
  for (const listener of [...(listeners.get(channel) ?? [])]) listener({})
}

beforeEach(() => {
  listeners.clear()
  invoked.length = 0
  invokeResult = { ok: true, value: null }
})

describe('bridge shape', () => {
  it('exposes exactly list, terminate and onOpen', () => {
    expect(Object.keys(portsApi).sort()).toEqual(['list', 'onOpen', 'terminate'])
  })

  it('exposes no generic process or command member', () => {
    const forbidden = ['kill', 'exec', 'execute', 'run', 'spawn', 'taskkill', 'ipcRenderer']

    for (const name of forbidden) {
      expect(portsApi).not.toHaveProperty(name)
    }
  })
})

describe('request/response members', () => {
  it('list invokes the list channel with no payload', async () => {
    invokeResult = { ok: true, value: { id: 's-1', capturedAt: 0, processes: [] } }

    const result = await portsApi.list()

    expect(invoked).toEqual([{ channel: IPC.ports.list, payload: undefined }])
    expect(result).toEqual({ ok: true, value: { id: 's-1', capturedAt: 0, processes: [] } })
  })

  it('terminate forwards exactly the snapshot and target ids', async () => {
    await portsApi.terminate({ snapshotId: 's-1', targetIds: ['t-1', 't-2'] })

    expect(invoked).toEqual([
      { channel: IPC.ports.terminate, payload: { snapshotId: 's-1', targetIds: ['t-1', 't-2'] } }
    ])
  })

  it('a failure Result keeps its code and stays structured-cloneable', async () => {
    invokeResult = { ok: false, error: { code: 'PORT_SNAPSHOT_STALE', message: 'refresh' } }

    const result = await portsApi.terminate({ snapshotId: 'old', targetIds: ['t-1'] })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('PORT_SNAPSHOT_STALE')
    expect(result.error).not.toBeInstanceOf(Error)
    expect(() => structuredClone(result)).not.toThrow()
  })
})

describe('onOpen subscription cleanup', () => {
  it('delivers the open signal and stops after unsubscribe', () => {
    let openings = 0
    const unsubscribe = portsApi.onOpen(() => {
      openings += 1
    })

    emit(IPC.ports.open)
    unsubscribe()
    emit(IPC.ports.open)

    expect(openings).toBe(1)
  })

  it('100 subscribe/unsubscribe cycles leave zero listeners', () => {
    for (let i = 0; i < 100; i++) {
      portsApi.onOpen(() => {})()
    }

    expect(listenerCount(IPC.ports.open)).toBe(0)
  })

  it('unsubscribing twice is harmless', () => {
    const unsubscribe = portsApi.onOpen(() => {})

    unsubscribe()

    expect(() => unsubscribe()).not.toThrow()
    expect(listenerCount(IPC.ports.open)).toBe(0)
  })
})
