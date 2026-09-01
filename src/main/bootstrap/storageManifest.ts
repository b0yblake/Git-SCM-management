import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Logger } from './logger'
import { quarantineFile } from './quarantine'

/**
 * `storage.json` — bootstrap-owned bookkeeping at the userData root (Phase 14).
 *
 * Records which app version last ran and which schema version each store is
 * written at, so a later phase can answer "what wrote this data?" without
 * guessing. It is not a feature: no IPC surface, and the renderer never sees
 * it.
 */
export interface StorageManifest {
  readonly manifestVersion: 1
  /** First launch that wrote a manifest, epoch ms. */
  readonly firstRunAt: number
  readonly lastRunAt: number
  /** `app.getVersion()` of the run that wrote this file, e.g. "0.1.0". */
  readonly lastRunAppVersion: string
  /** Highest schema version each store has been written at. */
  readonly storeVersions: {
    readonly settings: number
    readonly workspace: number
  }
}

export interface RecordRunOptions {
  readonly manifestFile: string
  readonly appVersion: string
  readonly storeVersions: StorageManifest['storeVersions']
  readonly logger: Logger
  /** Overridable clock for tests. */
  readonly now?: () => number
}

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/**
 * Missing → first run. Corrupt → quarantined and treated as a first run.
 * Bookkeeping must never block startup, so this function cannot throw.
 */
const readRaw = (manifestFile: string, logger: Logger): Record<string, unknown> | null => {
  let text: string
  try {
    text = readFileSync(manifestFile, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      quarantineFile(manifestFile, logger)
    }
    return null
  }

  try {
    const raw: unknown = JSON.parse(text)
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      return raw as Record<string, unknown>
    }
  } catch {
    // fall through to quarantine
  }
  quarantineFile(manifestFile, logger)
  return null
}

/**
 * Reads, updates and atomically rewrites the manifest for this run.
 *
 * Unknown fields in the existing file are carried through untouched: a
 * manifest written by a newer GitDeck loses nothing when an older one runs —
 * the same downgrade posture the stores hold (Phase 14 carve-out).
 */
export const recordRun = ({
  manifestFile,
  appVersion,
  storeVersions,
  logger,
  now = Date.now
}: RecordRunOptions): StorageManifest | null => {
  try {
    const raw = readRaw(manifestFile, logger) ?? {}
    const timestamp = now()

    const manifest = {
      ...raw,
      manifestVersion: 1 as const,
      firstRunAt: isTimestamp(raw['firstRunAt']) ? raw['firstRunAt'] : timestamp,
      lastRunAt: timestamp,
      lastRunAppVersion: appVersion,
      storeVersions
    }

    mkdirSync(dirname(manifestFile), { recursive: true })
    const temporary = join(dirname(manifestFile), `.${timestamp}.storage.tmp`)
    writeFileSync(temporary, JSON.stringify(manifest, null, 2), 'utf8')
    renameSync(temporary, manifestFile)
    return manifest
  } catch (error) {
    logger.warn('failed to record run in storage manifest', { error })
    return null
  }
}

/**
 * A single numeric bookkeeping value from the manifest, or null. Tolerant like
 * everything else here: a missing or unreadable manifest is not an error.
 */
export const readManifestTimestamp = (manifestFile: string, field: string): number | null => {
  try {
    const raw: unknown = JSON.parse(readFileSync(manifestFile, 'utf8'))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const value = (raw as Record<string, unknown>)[field]
    return isTimestamp(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Merges bookkeeping fields into the manifest without disturbing anything
 * else in it. Never throws — bookkeeping must not break the feature that
 * asked for it. (Phase 16 stores `lastUpdateCheckAt` this way.)
 */
export const patchManifest = (
  manifestFile: string,
  fields: Record<string, number>,
  logger: Logger
): void => {
  try {
    let raw: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(readFileSync(manifestFile, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        raw = parsed as Record<string, unknown>
      }
    } catch {
      // Missing or corrupt: recordRun owns quarantine; a patch starts fresh.
    }

    mkdirSync(dirname(manifestFile), { recursive: true })
    const temporary = join(dirname(manifestFile), `.patch.${Date.now()}.storage.tmp`)
    writeFileSync(temporary, JSON.stringify({ ...raw, ...fields }, null, 2), 'utf8')
    renameSync(temporary, manifestFile)
  } catch (error) {
    logger.warn('failed to patch storage manifest', { error })
  }
}
