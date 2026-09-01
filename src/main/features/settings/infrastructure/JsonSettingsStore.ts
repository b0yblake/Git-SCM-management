import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SETTINGS_VERSION } from '@shared/contracts/settings'
import type { Logger } from '@main/bootstrap/logger'
import { backupFileOnce, runMigrations, type StoreMigration } from '@main/bootstrap/migrations'
import { quarantineFile } from '@main/bootstrap/quarantine'
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from '../domain/AppSettings'
import type { SettingsStore } from '../domain/SettingsStore'

export interface JsonSettingsStoreOptions {
  readonly filePath: string
  readonly logger: Logger
  /** Phase 15 — pure steps up to `currentVersion`; empty in production today. */
  readonly migrations?: readonly StoreMigration[]
  readonly currentVersion?: number
  /** Where the pre-migration original is preserved, once per version step. */
  readonly backupDir?: string
}

const intVersion = (raw: unknown): number | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const value = (raw as Record<string, unknown>)['version']
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null
}

/**
 * Settings as a single JSON file.
 *
 * Reads never throw — a missing or corrupt file yields defaults and a log line,
 * because failing to start is a far worse outcome than losing a preference.
 * A corrupt file is quarantined (Phase 14) so the user's bytes survive for
 * inspection and the next launch is a quiet first-run ENOENT. A file written
 * by a newer GitDeck parses fine and is read per-field by `normalizeSettings`,
 * so it is never quarantined and never shadowed.
 *
 * A file from an **older** schema is migrated on read (Phase 15): the original
 * bytes are backed up first, the migrated shape is written back through the
 * same atomic path, and the next launch reads it without migrating again. A
 * failed chain quarantines rather than guessing.
 *
 * Writes go to a temp file and are renamed, so an interrupted write cannot
 * leave a truncated file behind.
 */
export const createJsonSettingsStore = ({
  filePath,
  logger,
  migrations = [],
  currentVersion = SETTINGS_VERSION,
  backupDir
}: JsonSettingsStoreOptions): SettingsStore => {
  const persist = (text: string): void => {
    mkdirSync(dirname(filePath), { recursive: true })
    const temporary = join(dirname(filePath), `.${Date.now()}.settings.tmp`)
    writeFileSync(temporary, text, 'utf8')
    renameSync(temporary, filePath)
  }

  return {
    read: (): AppSettings => {
      let text: string
      try {
        text = readFileSync(filePath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn('settings file unreadable, using defaults', { error })
          quarantineFile(filePath, logger)
        }
        return DEFAULT_SETTINGS
      }

      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch (error) {
        logger.warn('settings file unreadable, using defaults', { error })
        quarantineFile(filePath, logger)
        return DEFAULT_SETTINGS
      }

      const declared = intVersion(raw)
      if (declared !== null && declared < currentVersion) {
        let outcome
        try {
          outcome = runMigrations(raw as Record<string, unknown>, migrations, currentVersion)
        } catch (error) {
          logger.warn('settings migration failed, using defaults', { error })
          quarantineFile(filePath, logger)
          return DEFAULT_SETTINGS
        }

        // Backup strictly before the migrated write lands: a crash between the
        // two leaves the original either in place or preserved — never lost.
        if (backupDir) {
          backupFileOnce(text, join(backupDir, `settings.v${declared}.json`), logger)
        }
        try {
          persist(JSON.stringify(outcome.raw, null, 2))
          logger.info('settings migrated', { from: declared, to: currentVersion })
        } catch (error) {
          // The healthy old file stays on disk; the next launch migrates again.
          logger.warn('failed to write back migrated settings', { error })
        }
        raw = outcome.raw
      }

      return normalizeSettings(raw)
    },

    write: (settings): void => {
      try {
        persist(JSON.stringify(settings, null, 2))
      } catch (error) {
        logger.error('failed to persist settings', { error })
      }
    }
  }
}
