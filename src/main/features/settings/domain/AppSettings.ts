import {
  DEFAULT_SETTINGS,
  isValidFontSize,
  type AppSettings,
  type AppSettingsPatch
} from '@shared/contracts/settings'
import { isShellProfileId } from '@shared/contracts/terminal'
import { isWorkspaceId } from '@shared/contracts/workspace'

export type { AppSettings, AppSettingsPatch }
export { DEFAULT_SETTINGS }

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const definitionId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

/**
 * Turns whatever was on disk into valid settings.
 *
 * Never throws: a corrupt or hand-edited file must not stop the app from
 * starting, so every unreadable field falls back to its default. That includes
 * a file written by a future version — unknown keys are dropped rather than
 * carried, and a field of the wrong type is replaced rather than trusted.
 */
export const normalizeSettings = (raw: unknown): AppSettings => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_SETTINGS

  const record = raw as Record<string, unknown>
  const preferred = record['defaultShellProfileId']
  const active = record['activeWorkspaceId']

  return {
    version: 1,
    defaultShellProfileId: isShellProfileId(preferred) ? preferred : null,
    activeWorkspaceId: isWorkspaceId(active) ? active : null,
    activeTerminalDefinitionId: definitionId(record['activeTerminalDefinitionId']),
    restoreLastWorkspace: bool(
      record['restoreLastWorkspace'],
      DEFAULT_SETTINGS.restoreLastWorkspace
    ),
    runStartupCommandsOnRestore: bool(
      record['runStartupCommandsOnRestore'],
      DEFAULT_SETTINGS.runStartupCommandsOnRestore
    ),
    terminalFontSize: isValidFontSize(record['terminalFontSize'])
      ? record['terminalFontSize']
      : DEFAULT_SETTINGS.terminalFontSize,
    terminalCursorBlink: bool(record['terminalCursorBlink'], DEFAULT_SETTINGS.terminalCursorBlink),
    confirmBeforeClosingRunningTerminal: bool(
      record['confirmBeforeClosingRunningTerminal'],
      DEFAULT_SETTINGS.confirmBeforeClosingRunningTerminal
    )
  }
}

export const applyPatch = (settings: AppSettings, patch: AppSettingsPatch): AppSettings =>
  normalizeSettings({ ...settings, ...patch })
