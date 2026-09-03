import { beforeEach, describe, expect, it } from 'vitest'
import { IPC } from '@shared/contracts/ipc'
import type { Result } from '@shared/domain/result'
import { createFakeLogger } from '@main/testing/FakeLogger'
import { createOpenPathService } from './openPath'
import { registerOpenPathIpc } from './openPathIpc'
import type { IpcHandlerRegistry } from './ipcPorts'

type Handler = (payload: unknown) => unknown

const DIR = 'C:\\work\\api'

let handlers: Map<string, Handler>
let openPath: ReturnType<typeof createOpenPathService>

const registry: IpcHandlerRegistry = {
  handle: (channel, handler) => {
    handlers.set(channel, handler)
  },
  on: () => {}
}

const invoke = async (payload?: unknown): Promise<Result<string | null, { code: string }>> =>
  (await handlers.get(IPC.terminal.pendingOpenPath)?.(payload)) as Result<
    string | null,
    { code: string }
  >

beforeEach(() => {
  handlers = new Map()
  openPath = createOpenPathService({ logger: createFakeLogger(), isDirectory: () => true })
  registerOpenPathIpc({ registry, openPath })
})

describe('pendingpath', () => {
  it('drains the queue exactly once', async () => {
    openPath.accept(['GitDeck.exe', '--open-path', DIR])

    expect(await invoke()).toEqual({ ok: true, value: DIR })
    expect(await invoke()).toEqual({ ok: true, value: null })
  })

  it('answers null when nothing was queued', async () => {
    expect(await invoke()).toEqual({ ok: true, value: null })
  })

  it('rejects any payload', async () => {
    openPath.accept(['GitDeck.exe', '--open-path', DIR])

    const result = await invoke({ path: 'C:\\evil' })

    expect(result.ok).toBe(false)
    // The queue is untouched by a rejected request.
    expect(await invoke()).toEqual({ ok: true, value: DIR })
  })
})
