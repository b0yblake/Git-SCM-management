import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Logger } from '@main/bootstrap/logger'
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from '../domain/AppSettings'
import type { SettingsStore } from '../domain/SettingsStore'

export interface JsonSettingsStoreOptions {
  readonly filePath: string
  readonly logger: Logger
}

/**
 * Settings as a single JSON file.
 *
 * Reads never throw — a missing or corrupt file yields defaults and a log line,
 * because failing to start is a far worse outcome than losing a preference.
 * Writes go to a temp file and are renamed, so an interrupted write cannot
 * leave a truncated file behind.
 */
export const createJsonSettingsStore = ({
  filePath,
  logger
}: JsonSettingsStoreOptions): SettingsStore => ({
  read: (): AppSettings => {
    try {
      return normalizeSettings(JSON.parse(readFileSync(filePath, 'utf8')))
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
      if (!missing) logger.warn('settings file unreadable, using defaults', { error })
      return DEFAULT_SETTINGS
    }
  },

  write: (settings): void => {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      const temporary = join(dirname(filePath), `.${Date.now()}.settings.tmp`)
      writeFileSync(temporary, JSON.stringify(settings, null, 2), 'utf8')
      renameSync(temporary, filePath)
    } catch (error) {
      logger.error('failed to persist settings', { error })
    }
  }
})
