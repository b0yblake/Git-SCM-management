import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { isValidFontSize, MAX_FONT_SIZE, MIN_FONT_SIZE } from '@shared/contracts/settings'
import { isShellProfileId } from '@shared/contracts/terminal'
import { isWorkspaceId } from '@shared/contracts/workspace'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import type { Logger } from '@main/bootstrap/logger'
import type { SettingsService } from '../application/SettingsService'
import type { AppSettings, AppSettingsPatch } from '../domain/AppSettings'

/**
 * Rebuilds the patch from known fields only, so an unknown key cannot reach
 * settings and `version` cannot be overwritten from the renderer.
 */
const parsePatch = (payload: unknown): AppSettingsPatch => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('payload must be an object')
  }

  const record = payload as Record<string, unknown>
  let patch: AppSettingsPatch = {}

  if ('defaultShellProfileId' in record) {
    const value = record['defaultShellProfileId']
    if (value !== null && !isShellProfileId(value)) {
      throw new Error('defaultShellProfileId must be a known shell profile or null')
    }
    patch = { ...patch, defaultShellProfileId: value }
  }

  if ('activeWorkspaceId' in record) {
    const value = record['activeWorkspaceId']
    if (value !== null && !isWorkspaceId(value)) {
      throw new Error('activeWorkspaceId must be a workspace id or null')
    }
    patch = { ...patch, activeWorkspaceId: value }
  }

  if ('activeTerminalDefinitionId' in record) {
    const value = record['activeTerminalDefinitionId']
    if (value !== null && (typeof value !== 'string' || value.length === 0)) {
      throw new Error('activeTerminalDefinitionId must be a non-empty string or null')
    }
    patch = { ...patch, activeTerminalDefinitionId: value }
  }

  if ('terminalFontSize' in record) {
    const value = record['terminalFontSize']
    if (!isValidFontSize(value)) {
      throw new Error(
        `terminalFontSize must be a whole number between ${MIN_FONT_SIZE} and ${MAX_FONT_SIZE}`
      )
    }
    patch = { ...patch, terminalFontSize: value }
  }

  for (const field of [
    'restoreLastWorkspace',
    'runStartupCommandsOnRestore',
    'terminalCursorBlink',
    'confirmBeforeClosingRunningTerminal'
  ] as const) {
    if (!(field in record)) continue
    const value = record[field]
    if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`)
    patch = { ...patch, [field]: value }
  }

  return patch
}

export interface SettingsIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly settings: SettingsService
  readonly logger: Logger
}

export const registerSettingsIpc = ({
  registry,
  settings,
  logger
}: SettingsIpcDependencies): void => {
  registry.handle(IPC.settings.get, (): Result<AppSettings, IpcError> => Ok(settings.get()))

  registry.handle(IPC.settings.update, (payload): Result<AppSettings, IpcError> => {
    try {
      return Ok(settings.update(parsePatch(payload)))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid settings patch'
      logger.warn(`${IPC.settings.update} rejected`, { message })
      return Err({ code: IPC_ERROR_CODES.invalidRequest, message })
    }
  })
}
