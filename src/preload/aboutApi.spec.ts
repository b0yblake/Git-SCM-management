import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/contracts/ipc'

const invoked: Array<{ channel: string; payload: unknown }> = []
const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (channel: string, payload: unknown) => {
      invoked.push({ channel, payload })
      return Promise.resolve({ ok: true, value: null })
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set()
      set.add(listener)
      listeners.set(channel, set)
    },
    off: (channel: string, listener: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(listener)
    }
  }
}))

const { aboutApi } = await import('./aboutApi')

const listenerCount = (): number =>
  [...listeners.values()].reduce((total, set) => total + set.size, 0)

beforeEach(() => {
  invoked.length = 0
  listeners.clear()
})

describe('bridge shape', () => {
  it('exposes exactly openLink and onOpen', () => {
    expect(Object.keys(aboutApi).sort()).toEqual(['onOpen', 'openLink'])
  })

  it('exposes no member through which a URL could travel', () => {
    for (const name of ['open', 'openUrl', 'browse', 'shell', 'ipcRenderer']) {
      expect(aboutApi).not.toHaveProperty(name)
    }
  })
})

describe('openLink', () => {
  it('sends the key and nothing else', async () => {
    await aboutApi.openLink('releases')

    expect(invoked).toEqual([{ channel: IPC.about.link, payload: { link: 'releases' } }])
  })
})

describe('onOpen', () => {
  it('calls back when Main signals, and stops after unsubscribe', () => {
    const seen = vi.fn()

    const unsubscribe = aboutApi.onOpen(seen)
    expect(listenerCount()).toBe(1)
    for (const listener of listeners.get(IPC.about.open) ?? []) listener({})
    expect(seen).toHaveBeenCalledTimes(1)

    unsubscribe()

    expect(listenerCount()).toBe(0)
  })
})
