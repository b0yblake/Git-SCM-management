import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger } from './logger'
import { quarantineFile } from './quarantine'
import type { StoragePaths } from './storagePaths'

/**
 * Where the user's data folder choice lives (Phase 17).
 *
 * It cannot live in `settings.json`: the app must know the folder *before* it
 * can read settings from it. So this one pointer file stays in the DEFAULT
 * userData directory forever, and everything else follows it.
 */
export const DATA_ROOT_POINTER_FILE = 'data-root.json'

export interface DataRootResolution {
  /** The directory every store reads from and writes to this run. */
  readonly dataRoot: string
  readonly defaultRoot: string
  readonly pointerFile: string
  readonly isCustom: boolean
}

/**
 * Resolves the data root for this run. Tolerant like every other bootstrap
 * read: a missing pointer is the normal default state, a corrupt one is
 * quarantined, and a custom folder that cannot be created falls back to the
 * default with a warning — starting the app is never blocked by the pointer.
 */
export const resolveDataRoot = (defaultRoot: string, logger: Logger): DataRootResolution => {
  const pointerFile = join(defaultRoot, DATA_ROOT_POINTER_FILE)
  const asDefault: DataRootResolution = {
    dataRoot: defaultRoot,
    defaultRoot,
    pointerFile,
    isCustom: false
  }

  let text: string
  try {
    text = readFileSync(pointerFile, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('data-root pointer unreadable, using the default folder', { error })
      quarantineFile(pointerFile, logger)
    }
    return asDefault
  }

  let target: string
  try {
    const raw: unknown = JSON.parse(text)
    const dataRoot =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)['dataRoot']
        : undefined
    if (typeof dataRoot !== 'string' || dataRoot.length === 0) {
      throw new Error('pointer declares no dataRoot')
    }
    target = resolve(dataRoot)
  } catch (error) {
    logger.warn('data-root pointer unreadable, using the default folder', { error })
    quarantineFile(pointerFile, logger)
    return asDefault
  }

  if (target === resolve(defaultRoot)) return asDefault

  try {
    mkdirSync(target, { recursive: true })
  } catch (error) {
    // The folder may be on a drive that is gone. Losing the preference for
    // one run beats failing to start; the pointer stays for when it returns.
    logger.warn('custom data folder unavailable, using the default folder', { target, error })
    return asDefault
  }

  return { dataRoot: target, defaultRoot, pointerFile, isCustom: true }
}

/**
 * Persists the choice. Choosing the default again removes the pointer rather
 * than writing a redundant one. Throws on failure — the caller is the switch
 * flow, and a switch that could not be recorded must not be reported as done.
 */
export const writeDataRootPointer = (
  pointerFile: string,
  defaultRoot: string,
  target: string
): void => {
  if (resolve(target) === resolve(defaultRoot)) {
    rmSync(pointerFile, { force: true })
    return
  }
  mkdirSync(defaultRoot, { recursive: true })
  const temporary = join(defaultRoot, `.${Date.now()}.data-root.tmp`)
  writeFileSync(temporary, JSON.stringify({ version: 1, dataRoot: target }, null, 2), 'utf8')
  renameSync(temporary, pointerFile)
}

export type DataCopyOutcome = 'copied' | 'adopted' | 'fresh'

/**
 * Seeds a newly chosen folder with the current data, without ever destroying
 * anything: a target that already holds GitDeck data is adopted as-is (its
 * files win), and the source folder is never deleted — switching back remains
 * possible by simply choosing it again. Throws on a failed copy, so the
 * switch is aborted before the pointer is written.
 */
export const copyDataToNewRoot = (
  paths: StoragePaths,
  targetRoot: string,
  logger: Logger
): DataCopyOutcome => {
  mkdirSync(targetRoot, { recursive: true })

  if (existsSync(join(targetRoot, 'settings.json'))) {
    logger.info('target folder already holds GitDeck data, adopting it', { targetRoot })
    return 'adopted'
  }

  let copiedAnything = false
  const files: ReadonlyArray<readonly [string, string]> = [
    [paths.settingsFile, 'settings.json'],
    [paths.manifestFile, 'storage.json']
  ]
  for (const [source, name] of files) {
    if (!existsSync(source)) continue
    cpSync(source, join(targetRoot, name))
    copiedAnything = true
  }
  const directories: ReadonlyArray<readonly [string, string]> = [
    [paths.workspacesDir, 'workspaces'],
    [paths.backupsDir, 'backups']
  ]
  for (const [source, name] of directories) {
    if (!existsSync(source)) continue
    cpSync(source, join(targetRoot, name), { recursive: true })
    copiedAnything = true
  }

  if (!copiedAnything) return 'fresh'
  logger.info('copied data to the new folder', { targetRoot })
  return 'copied'
}
