import { beforeEach, describe, expect, it } from 'vitest'
import { IPC } from '@shared/contracts/ipc'
import type { Result } from '@shared/domain/result'
import { createFakeLogger } from '@main/testing/FakeLogger'
import type { IpcHandlerRegistry } from './ipcPorts'
import { createWorkspaceLaunchService } from './workspaceLaunch'
import {
  registerWorkspaceLaunchIpc,
  sanitizeShortcutName,
  shortcutDefinition,
  type ShortcutDefinition
} from './workspaceLaunchIpc'

type Handler = (payload: unknown) => unknown

const WS = 'ws_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const EXE = 'C:\\Program Files\\GitDeck\\GitDeck.exe'

let handlers: Map<string, Handler>
let pickResult: string | null
let picks: string[]
let written: Array<{ path: string; definition: ShortcutDefinition }>
let writeSucceeds: boolean

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
  pickResult = null
  picks = []
  written = []
  writeSucceeds = true
  const logger = createFakeLogger()
  registerWorkspaceLaunchIpc({
    registry,
    launch: createWorkspaceLaunchService({ logger, workspaceExists: () => true }),
    workspaceName: (id) => (id === WS ? 'web app' : null),
    pickSavePath: (defaultFileName) => {
      picks.push(defaultFileName)
      return Promise.resolve(pickResult)
    },
    writeShortcut: (path, definition) => {
      if (!writeSucceeds) return false
      written.push({ path, definition })
      return true
    },
    exePath: EXE,
    logger
  })
})

describe('the shortcut definition', () => {
  it('targets the exe with the =-form argument and the exe icon', () => {
    expect(shortcutDefinition(EXE, WS, 'web app')).toEqual({
      target: EXE,
      args: `--open-workspace=${WS}`,
      icon: EXE,
      iconIndex: 0,
      description: 'Open workspace "web app" in GitDeck'
    })
  })

  it('sanitizes a name Windows filenames cannot carry', () => {
    expect(sanitizeShortcutName('api: <dev>/"prod"?')).toBe('api dev prod')
    expect(sanitizeShortcutName('***')).toBe('Workspace')
  })
})

describe('the shortcut channel', () => {
  it('creates the shortcut at the chosen path', async () => {
    pickResult = 'D:\\links\\My Deck.lnk'

    const result = await invoke<{ path: string } | null>(IPC.workspace.shortcut, {
      workspaceId: WS
    })

    expect(picks).toEqual(['web app.lnk'])
    expect(result).toEqual({ ok: true, value: { path: 'D:\\links\\My Deck.lnk' } })
    expect(written).toHaveLength(1)
    expect(written[0]?.definition.args).toBe(`--open-workspace=${WS}`)
  })

  it('appends .lnk when the chosen name lacks it', async () => {
    pickResult = 'D:\\links\\deck'

    await invoke(IPC.workspace.shortcut, { workspaceId: WS })

    expect(written[0]?.path).toBe('D:\\links\\deck.lnk')
  })

  it('a cancelled dialog writes nothing and is not an error', async () => {
    pickResult = null

    const result = await invoke(IPC.workspace.shortcut, { workspaceId: WS })

    expect(result).toEqual({ ok: true, value: null })
    expect(written).toEqual([])
  })

  it('rejects an unknown workspace before any dialog opens', async () => {
    const result = await invoke(IPC.workspace.shortcut, {
      workspaceId: 'ws_11111111-2222-4333-8444-555555555555'
    })

    expect(result.ok).toBe(false)
    expect(picks).toEqual([])
  })

  it('rejects malformed payloads and extra fields', async () => {
    for (const payload of [undefined, 'ws', { workspaceId: 'nope' }, { workspaceId: WS, path: 'D:\\x' }]) {
      const result = await invoke(IPC.workspace.shortcut, payload)
      expect(result.ok).toBe(false)
    }
    expect(picks).toEqual([])
  })

  it('a failed write surfaces as an error', async () => {
    pickResult = 'D:\\links\\deck.lnk'
    writeSucceeds = false

    const result = await invoke(IPC.workspace.shortcut, { workspaceId: WS })

    expect(result.ok).toBe(false)
  })
})

describe('the pendingopen channel', () => {
  it('rejects any payload', async () => {
    const result = await invoke(IPC.workspace.pendingOpen, { workspaceId: WS })

    expect(result.ok).toBe(false)
  })

  it('answers null when nothing was queued', async () => {
    expect(await invoke(IPC.workspace.pendingOpen)).toEqual({ ok: true, value: null })
  })
})
