// Public surface of the settings feature (ARCHITECTURE.md §4).
import { join } from 'node:path'
import type { Logger } from '@main/bootstrap/logger'
import { SettingsService } from './application/SettingsService'
import { createJsonSettingsStore } from './infrastructure/JsonSettingsStore'

/** Wires the feature so the composition root never sees the storage choice. */
export const createSettingsService = (userDataPath: string, logger: Logger): SettingsService =>
  new SettingsService(
    createJsonSettingsStore({ filePath: join(userDataPath, 'settings.json'), logger })
  )

export { SettingsService }
export { registerSettingsIpc, type SettingsIpcDependencies } from './ipc/settingsIpc'
export type { AppSettings, AppSettingsPatch } from './domain/AppSettings'
export type { SettingsStore } from './domain/SettingsStore'
