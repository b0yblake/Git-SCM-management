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

const { updatesApi } = await import('./updatesApi')

const listenerCount = (channel: string): number => listeners.get(channel)?.length ?? 0
const emit = (channel: string, payload: unknown): void => {
  for (const listener of [...(listeners.get(channel) ?? [])]) listener({}, payload)
}

beforeEach(() => {
  listeners.clear()
  invoked.length = 0
  invokeResult = { ok: true, value: null }
})

describe('bridge shape', () => {
  it('exposes exactly check, openRelease and onAvailable', () => {
    expect(Object.keys(updatesApi).sort()).toEqual(['check', 'onAvailable', 'openRelease'])
  })

  it('exposes no member that could carry a URL or download anything', () => {
    for (const name of ['download', 'install', 'openUrl', 'fetch', 'ipcRenderer']) {
      expect(updatesApi).not.toHaveProperty(name)
    }
  })
})

describe('request/response members', () => {
  it('check invokes its channel with no payload', async () => {
    await updatesApi.check()

    expect(invoked).toEqual([{ channel: IPC.updates.check, payload: undefined }])
  })

  it('openRelease invokes its channel with no payload — a URL cannot travel', async () => {
    await updatesApi.openRelease()

    expect(invoked).toEqual([{ channel: IPC.updates.release, payload: undefined }])
  })
})

describe('onAvailable subscription cleanup', () => {
  it('delivers the result and stops after unsubscribe', () => {
    const seen: unknown[] = []
    const unsubscribe = updatesApi.onAvailable((result) => seen.push(result))

    emit(IPC.updates.available, { status: 'update-available' })
    unsubscribe()
    emit(IPC.updates.available, { status: 'update-available' })

    expect(seen).toHaveLength(1)
  })

  it('100 subscribe/unsubscribe cycles leave zero listeners', () => {
    for (let i = 0; i < 100; i++) {
      updatesApi.onAvailable(() => {})()
    }

    expect(listenerCount(IPC.updates.available)).toBe(0)
  })
})
