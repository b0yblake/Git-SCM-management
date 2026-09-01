import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/contracts/ipc'
import type { Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import { createFakeLogger } from '@main/testing/FakeLogger'
import { UpdateService } from '../application/UpdateService'
import { createFakeReleaseClient, type FakeReleaseClient } from '../testing/FakeReleaseClient'
import { registerUpdatesIpc } from './updatesIpc'

type Handler = (payload: unknown) => unknown

let handlers: Map<string, Handler>
let client: FakeReleaseClient
let opened: string[]
let updates: UpdateService

const registry: IpcHandlerRegistry = {
  handle: (channel, handler) => {
    handlers.set(channel, handler)
  },
  on: () => {}
}

const invoke = async <T>(channel: string, payload?: unknown): Promise<Result<T, { code: string }>> =>
  (await handlers.get(channel)?.(payload)) as Result<T, { code: string }>

beforeEach(() => {
  handlers = new Map()
  client = createFakeReleaseClient()
  opened = []
  updates = new UpdateService({
    client,
    currentVersion: '0.1.0',
    getSettings: () => ({ checkForUpdatesOnStartup: true, skippedUpdateVersion: null }),
    readLastCheckAt: () => null,
    recordCheckAt: () => {},
    logger: createFakeLogger(),
    now: () => 0
  })
  registerUpdatesIpc({
    registry,
    updates,
    openExternal: (url) => {
      opened.push(url)
      return Promise.resolve()
    },
    logger: createFakeLogger()
  })
})

describe('registration', () => {
  it('registers exactly the check and release request channels', () => {
    expect([...handlers.keys()].sort()).toEqual([IPC.updates.check, IPC.updates.release])
  })
})

describe('check', () => {
  it('answers Ok with the check result', async () => {
    client.respondWith({ tagName: 'v0.2.0' })

    const result = await invoke(IPC.updates.check)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ status: 'update-available' })
  })

  it('rejects any payload at all', async () => {
    const result = await invoke(IPC.updates.check, { url: 'https://evil.example' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_REQUEST')
    expect(client.fetchCount).toBe(0)
  })
})

describe('release — no URL ever crosses this channel', () => {
  it('refuses when no check has found a release', async () => {
    const result = await invoke(IPC.updates.release)

    expect(result.ok).toBe(false)
    expect(opened).toEqual([])
  })

  it('opens exactly the URL Main minted for the last hit', async () => {
    client.respondWith({ tagName: 'v0.2.0' })
    await updates.checkNow()

    const result = await invoke(IPC.updates.release)
    await vi.waitFor(() => expect(opened).toHaveLength(1))

    expect(result.ok).toBe(true)
    expect(opened).toEqual(['https://github.com/b0yblake/Git-SCM-management/releases/tag/v0.2.0'])
  })

  it('rejects a payload, even one carrying a URL', async () => {
    client.respondWith({ tagName: 'v0.2.0' })
    await updates.checkNow()

    const result = await invoke(IPC.updates.release, 'https://evil.example')

    expect(result.ok).toBe(false)
    expect(opened).toEqual([])
  })
})
