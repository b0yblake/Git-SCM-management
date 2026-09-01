import { beforeEach, describe, expect, it } from 'vitest'
import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/contracts/settings'
import type { Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { SettingsService } from '../application/SettingsService'
import { createInMemorySettingsStore } from '../testing/InMemorySettingsStore'
import { registerSettingsIpc } from './settingsIpc'

/**
 * `parsePatch` is the only thing standing between the renderer and persisted
 * settings, so it is tested directly through the channel it guards.
 */
class FakeRegistry implements IpcHandlerRegistry {
  readonly handlers = new Map<string, (payload: unknown) => unknown>()

  handle(channel: string, handler: (payload: unknown) => unknown): void {
    this.handlers.set(channel, handler)
  }

  on(): void {
    throw new Error('settings registers no fire-and-forget channels')
  }

  invoke<T>(channel: string, payload?: unknown): T {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`no handler for ${channel}`)
    return handler(payload) as T
  }
}

const WORKSPACE_ID = 'ws_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

let registry: FakeRegistry
let logger: FakeLogger

const update = (payload: unknown): Result<AppSettings, IpcError> =>
  registry.invoke(IPC.settings.update, payload)

beforeEach(() => {
  registry = new FakeRegistry()
  logger = createFakeLogger()
  registerSettingsIpc({
    registry,
    settings: new SettingsService(createInMemorySettingsStore()),
    logger
  })
})

describe('update', () => {
  it('accepts a shell profile on its own', () => {
    const result = update({ defaultShellProfileId: 'cmd' })

    expect(result).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, defaultShellProfileId: 'cmd' }
    })
  })

  it('accepts an active workspace id on its own', () => {
    const result = update({ activeWorkspaceId: WORKSPACE_ID })

    expect(result.ok && result.value.activeWorkspaceId).toBe(WORKSPACE_ID)
  })

  it('accepts both fields at once', () => {
    const result = update({ defaultShellProfileId: 'wsl', activeWorkspaceId: WORKSPACE_ID })

    expect(result.ok && result.value).toEqual({
      ...DEFAULT_SETTINGS,
      defaultShellProfileId: 'wsl',
      activeWorkspaceId: WORKSPACE_ID
    })
  })

  it('accepts null for either field, which is how a preference is cleared', () => {
    update({ defaultShellProfileId: 'cmd', activeWorkspaceId: WORKSPACE_ID })

    const result = update({ defaultShellProfileId: null, activeWorkspaceId: null })

    expect(result.ok && result.value).toEqual(DEFAULT_SETTINGS)
  })

  it('leaves a field alone when the patch does not mention it', () => {
    update({ defaultShellProfileId: 'cmd', activeWorkspaceId: WORKSPACE_ID })

    const result = update({ defaultShellProfileId: 'wsl' })

    expect(result.ok && result.value.activeWorkspaceId).toBe(WORKSPACE_ID)
  })

  it('rejects an unknown shell profile', () => {
    expect(update({ defaultShellProfileId: 'fish' })).toEqual({
      ok: false,
      error: { code: IPC_ERROR_CODES.invalidRequest, message: expect.any(String) }
    })
  })

  it('rejects an active workspace id that is not a workspace id', () => {
    expect(update({ activeWorkspaceId: 'the-last-one' }).ok).toBe(false)
    expect(update({ activeWorkspaceId: 'term_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }).ok).toBe(
      false
    )
  })

  it('accepts the Phase 8 booleans', () => {
    const result = update({ restoreLastWorkspace: false, runStartupCommandsOnRestore: true })

    expect(result.ok && result.value).toEqual({
      ...DEFAULT_SETTINGS,
      restoreLastWorkspace: false,
      runStartupCommandsOnRestore: true
    })
  })

  /** The renderer must not be able to switch command execution on with a string. */
  it('rejects a non-boolean for either behaviour flag', () => {
    expect(update({ runStartupCommandsOnRestore: 'true' }).ok).toBe(false)
    expect(update({ restoreLastWorkspace: 1 }).ok).toBe(false)
    expect(update({ restoreLastWorkspace: null }).ok).toBe(false)
  })

  it('accepts an active terminal definition id, or null to forget it', () => {
    expect(update({ activeTerminalDefinitionId: 'term_1' }).ok).toBe(true)
    expect(update({ activeTerminalDefinitionId: null }).ok).toBe(true)
    expect(update({ activeTerminalDefinitionId: '' }).ok).toBe(false)
  })

  it('accepts the Phase 10 presentation fields', () => {
    const result = update({
      terminalFontSize: 18,
      terminalCursorBlink: false,
      confirmBeforeClosingRunningTerminal: false
    })

    expect(result.ok && result.value).toEqual({
      ...DEFAULT_SETTINGS,
      terminalFontSize: 18,
      terminalCursorBlink: false,
      confirmBeforeClosingRunningTerminal: false
    })
  })

  /** The screen validates too, but the bridge is the boundary that must hold. */
  it('rejects a font size that is not a whole number in range', () => {
    expect(update({ terminalFontSize: 0 }).ok).toBe(false)
    expect(update({ terminalFontSize: 900 }).ok).toBe(false)
    expect(update({ terminalFontSize: 12.5 }).ok).toBe(false)
    expect(update({ terminalFontSize: '16' }).ok).toBe(false)
  })

  /** `version` is owned by Main — an unknown key must not reach settings. */
  it('ignores keys it does not know, including version', () => {
    const result = update({ version: 99, theme: 'dark' })

    expect(result.ok && result.value).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects a payload that is not an object, and logs it', () => {
    expect(update('cmd').ok).toBe(false)
    expect(update([]).ok).toBe(false)

    expect(logger.entriesAt('warn')).toHaveLength(2)
  })
})

describe('get', () => {
  it('answers with the current settings', () => {
    update({ activeWorkspaceId: WORKSPACE_ID })

    expect(registry.invoke<Result<AppSettings, IpcError>>(IPC.settings.get)).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, activeWorkspaceId: WORKSPACE_ID }
    })
  })
})
