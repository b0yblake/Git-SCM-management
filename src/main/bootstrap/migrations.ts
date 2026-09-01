import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Logger } from './logger'

/**
 * One pure step: migrates a raw store file exactly from `from` to `from + 1`
 * (Phase 15). Steps reshape fields only — the engine stamps the new `version`,
 * so a step cannot forget to.
 */
export interface StoreMigration {
  readonly from: number
  readonly migrate: (raw: Record<string, unknown>) => Record<string, unknown>
}

/** A gap in the chain, a throwing step, or a version the engine cannot read. */
export class MigrationError extends Error {}

export interface MigrationOutcome {
  readonly raw: Record<string, unknown>
  /** Version the file arrived at. */
  readonly fromVersion: number
  readonly migrated: boolean
}

const declaredVersion = (raw: Record<string, unknown>): number => {
  const value = raw['version']
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new MigrationError('the file declares no readable version')
  }
  return value
}

/**
 * Runs the chain `raw.version → currentVersion`, one step at a time.
 *
 * Pure and forward-only: no filesystem, no clock, no skipping. A gap or a
 * throwing step raises `MigrationError` — the caller quarantines rather than
 * guessing. The input object is never mutated. A file already at
 * `currentVersion` is returned untouched; a file from the future is refused
 * here because the Phase 14 carve-out must handle it before this is called.
 */
export const runMigrations = (
  raw: Record<string, unknown>,
  migrations: readonly StoreMigration[],
  currentVersion: number
): MigrationOutcome => {
  const fromVersion = declaredVersion(raw)

  if (fromVersion === currentVersion) return { raw, fromVersion, migrated: false }
  if (fromVersion > currentVersion) {
    throw new MigrationError(
      `version ${fromVersion} is newer than ${currentVersion} — the carve-out must skip this file`
    )
  }

  // Validate the whole chain before running any step: a gap discovered halfway
  // through must not leave a half-migrated result anywhere.
  const steps: StoreMigration[] = []
  for (let version = fromVersion; version < currentVersion; version += 1) {
    const step = migrations.find((candidate) => candidate.from === version)
    if (!step) throw new MigrationError(`no migration from version ${version}`)
    steps.push(step)
  }

  let current: Record<string, unknown> = { ...raw }
  for (const step of steps) {
    try {
      current = { ...step.migrate({ ...current }), version: step.from + 1 }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new MigrationError(`migration from version ${step.from} failed: ${message}`)
    }
  }

  return { raw: current, fromVersion, migrated: true }
}

/**
 * Copies the pre-migration bytes aside, once per version step.
 *
 * Takes the original text rather than re-reading the file: by the time this
 * runs the file on disk may already hold the migrated shape. `EEXIST` means an
 * earlier run already preserved this step's original — never overwrite it.
 */
export const backupFileOnce = (
  originalText: string,
  backupPath: string,
  logger: Logger
): void => {
  try {
    mkdirSync(dirname(backupPath), { recursive: true })
    writeFileSync(backupPath, originalText, { encoding: 'utf8', flag: 'wx' })
    logger.info('backed up pre-migration file', { backupPath })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return
    logger.warn('failed to back up pre-migration file', { backupPath, error })
  }
}
