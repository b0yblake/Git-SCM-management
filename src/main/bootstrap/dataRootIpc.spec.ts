import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/contracts/ipc'
import type { DataFolderInfo } from '@shared/contracts/storage'
import type { Result } from '@shared/domain/result'
import { createFakeLogger } from '@main/testing/FakeLogger'
import { registerDataRootIpc } from './dataRootIpc'
import type { IpcHandlerRegistry } from './ipcPorts'

type Handler = (payload: unknown) => unknown

const CURRENT = 'C:\\Users\\dev\\AppData\\Roaming\\GitDeck'

let handlers: Map<string, Handler>
let pickResult: string | null
let picks: string[]
let applied: string[]
let applyError: Error | null

const registry: IpcHandlerRegistry = {
  handle: (channel, handler) => {
    handlers.set(channel, handler)
  },
  on: () => {}
}

const register = (): void => {
  registerDataRootIpc({
    registry,
    resolution: {
      dataRoot: CURRENT,
      defaultRoot: CURRENT,
      pointerFile: `${CURRENT}\\data-root.json`,
      isCustom: false
    },
    pickFolder: (defaultPath) => {
      picks.push(defaultPath)
      return Promise.resolve(pickResult)
    },
    applySwitch: (target) => {
      if (applyError) throw applyError
      applied.push(target)
    },
    logger: createFakeLogger()
  })
}

const invoke = async <T>(channel: string, payload?: unknown): Promise<Result<T, { code: string }>> =>
  (await handlers.get(channel)?.(payload)) as Result<T, { code: string }>

beforeEach(() => {
  handlers = new Map()
  pickResult = null
  picks = []
  applied = []
  applyError = null
  register()
})

describe('info', () => {
  it('describes the current state with no pending switch', async () => {
    const result = await invoke<DataFolderInfo>(IPC.storage.info)

    expect(result).toEqual({
      ok: true,
      value: { current: CURRENT, defaultRoot: CURRENT, isCustom: false, pending: null }
    })
  })

  it('rejects any payload', async () => {
    const result = await invoke(IPC.storage.info, { path: 'C:\\evil' })

    expect(result.ok).toBe(false)
  })
})

describe('choose', () => {
  it('opens the picker seeded with the current folder and reports the switch', async () => {
    pickResult = 'D:\\GitDeckData'

    const result = await invoke<DataFolderInfo | null>(IPC.storage.choose)

    expect(picks).toEqual([CURRENT])
    expect(applied).toEqual(['D:\\GitDeckData'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value?.pending).toBe('D:\\GitDeckData')
    expect(result.value?.current).toBe(CURRENT)
  })

  it('cancelling the picker changes nothing', async () => {
    pickResult = null

    const result = await invoke<DataFolderInfo | null>(IPC.storage.choose)

    expect(applied).toEqual([])
    expect(result).toEqual({ ok: true, value: null })
  })

  it('re-choosing the folder in use cancels a pending switch', async () => {
    pickResult = 'D:\\GitDeckData'
    await invoke(IPC.storage.choose)

    pickResult = CURRENT
    const result = await invoke<DataFolderInfo | null>(IPC.storage.choose)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value?.pending).toBeNull()
  })

  it('the next picker opens at the pending folder, not the stale current one', async () => {
    pickResult = 'D:\\GitDeckData'
    await invoke(IPC.storage.choose)

    await invoke(IPC.storage.choose)

    expect(picks[1]).toBe('D:\\GitDeckData')
  })

  it('a failed switch surfaces as an error and records no pending state', async () => {
    pickResult = 'D:\\GitDeckData'
    applyError = new Error('disk full')

    const result = await invoke<DataFolderInfo | null>(IPC.storage.choose)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INTERNAL_ERROR')

    const info = await invoke<DataFolderInfo>(IPC.storage.info)
    if (!info.ok) return
    expect(info.value.pending).toBeNull()
  })

  it('rejects a payload — a path can never arrive over this channel', async () => {
    const pick = vi.fn()

    const result = await invoke(IPC.storage.choose, 'D:\\evil')

    expect(result.ok).toBe(false)
    expect(pick).not.toHaveBeenCalled()
    expect(applied).toEqual([])
  })
})
