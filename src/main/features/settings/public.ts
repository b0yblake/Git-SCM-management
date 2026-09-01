// Public surface of the settings feature (ARCHITECTURE.md §4).
import type { Logger } from '@main/bootstrap/logger'
import { SettingsService } from './application/SettingsService'
import { SETTINGS_MIGRATIONS } from './domain/settingsMigrations'
import { createJsonSettingsStore } from './infrastructure/JsonSettingsStore'

/**
 * Wires the feature so the composition root never sees the storage choice.
 * Both paths arrive minted by `bootstrap/storagePaths` (Phase 14) — this
 * feature no longer knows its own filenames. Migrations (Phase 15) run inside
 * the store on load.
 */
export const createSettingsService = (
  settingsFile: string,
  backupsDir: string,
  logger: Logger
): SettingsService =>
  new SettingsService(
    createJsonSettingsStore({
      filePath: settingsFile,
      logger,
      migrations: SETTINGS_MIGRATIONS,
      backupDir: backupsDir
    })
  )

export { SettingsService }
export { registerSettingsIpc, type SettingsIpcDependencies } from './ipc/settingsIpc'
export type { AppSettings, AppSettingsPatch } from './domain/AppSettings'
export type { SettingsStore } from './domain/SettingsStore'
