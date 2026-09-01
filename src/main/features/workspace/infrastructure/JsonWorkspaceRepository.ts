import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '@main/bootstrap/logger'
import { backupFileOnce, runMigrations, type StoreMigration } from '@main/bootstrap/migrations'
import { quarantineFile } from '@main/bootstrap/quarantine'
import { InvalidWorkspaceError, WorkspaceNotFoundError } from '../domain/errors'
import {
  isWorkspaceId,
  parseWorkspace,
  WORKSPACE_VERSION,
  type Workspace
} from '../domain/Workspace'
import type { WorkspaceRepository } from '../domain/WorkspaceRepository'

/**
 * A file written by a newer GitDeck is not corruption (Phase 14 carve-out): a
 * user who downgraded must find it intact when they upgrade again. Internal to
 * this repository — callers see it translated, never quarantined.
 */
class NewerWorkspaceFileError extends Error {}

export interface JsonWorkspaceRepositoryOptions {
  /** `userData/workspaces` in the app; a temp directory in tests. */
  readonly directory: string
  readonly logger: Logger
  /** Phase 15 — pure steps up to `currentVersion`; empty in production today. */
  readonly migrations?: readonly StoreMigration[]
  readonly currentVersion?: number
  /** Where each pre-migration original is preserved, once per version step. */
  readonly backupDir?: string
}

const FILE_SUFFIX = '.json'

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT'

/**
 * One JSON file per workspace, named after its id.
 *
 * Unlike the settings store, a failed **write** throws rather than being logged
 * and swallowed: the user explicitly asked to save, so silently doing nothing
 * would be the worse outcome. A failed **read** is still non-fatal — one
 * unreadable file must not hide the rest of the user's workspaces.
 */
export const createJsonWorkspaceRepository = ({
  directory,
  logger,
  migrations = [],
  currentVersion = WORKSPACE_VERSION,
  backupDir
}: JsonWorkspaceRepositoryOptions): WorkspaceRepository => {
  /**
   * The id becomes a filename, which makes it an attack surface: an unchecked
   * `get('../settings')` would read outside the workspace directory. Only a
   * minted workspace id is ever turned into a path.
   */
  const fileFor = (id: string): string => {
    if (!isWorkspaceId(id)) throw new InvalidWorkspaceError(`"${id}" is not a workspace id`)
    return join(directory, `${id}${FILE_SUFFIX}`)
  }

  const readAt = (path: string, id: string): Workspace => {
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch (error) {
      if (isMissing(error)) throw new WorkspaceNotFoundError(id)
      throw error
    }

    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new InvalidWorkspaceError('the file is not valid JSON')
    }

    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const declared = (raw as Record<string, unknown>)['version']
      if (typeof declared === 'number' && Number.isInteger(declared) && declared >= 1) {
        if (declared > currentVersion) {
          throw new NewerWorkspaceFileError(
            `the file was written by a newer GitDeck (version ${declared})`
          )
        }
        if (declared < currentVersion) {
          // Phase 15: migrate → backup the original → write back atomically.
          // A failed chain surfaces as InvalidWorkspaceError so the callers
          // quarantine it exactly like any other unreadable file.
          let migrated: Record<string, unknown>
          try {
            migrated = runMigrations(
              raw as Record<string, unknown>,
              migrations,
              currentVersion
            ).raw
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            throw new InvalidWorkspaceError(message)
          }
          if (backupDir) {
            backupFileOnce(text, join(backupDir, `${id}.v${declared}.json`), logger)
          }
          try {
            mkdirSync(directory, { recursive: true })
            const temporary = join(directory, `.${id}.tmp`)
            writeFileSync(temporary, JSON.stringify(migrated, null, 2), 'utf8')
            renameSync(temporary, path)
            logger.info('workspace migrated', { workspaceId: id, from: declared })
          } catch (error) {
            // The healthy old file stays; the next read migrates again.
            logger.warn('failed to write back migrated workspace', { workspaceId: id, error })
          }
          raw = migrated
        }
      }
    }

    const workspace = parseWorkspace(raw)
    // The filename is the identity the caller asked for. A file whose contents
    // claim a different id was renamed by hand, and answering with it would
    // make `get(summary.id)` disagree with `list()`.
    if (workspace.id !== id) throw new InvalidWorkspaceError('the file declares a different id')

    return workspace
  }

  return {
    list: (): readonly Workspace[] => {
      let entries: string[]
      try {
        entries = readdirSync(directory)
      } catch (error) {
        // Nothing saved yet is the normal first-run state, not a failure.
        if (!isMissing(error)) logger.warn('workspace directory unreadable', { error })
        return []
      }

      const workspaces: Workspace[] = []
      for (const entry of entries) {
        if (!entry.endsWith(FILE_SUFFIX)) continue

        const id = entry.slice(0, -FILE_SUFFIX.length)
        // A stray file, an editor backup, a temp file left by an interrupted
        // write. Not ours, so not worth a log line either.
        if (!isWorkspaceId(id)) continue

        try {
          workspaces.push(readAt(join(directory, entry), id))
        } catch (error) {
          // Vanished between readdir and read — already in the listed state.
          if (error instanceof WorkspaceNotFoundError) continue
          if (error instanceof NewerWorkspaceFileError) {
            logger.info('skipping workspace written by a newer GitDeck', { workspaceId: id })
            continue
          }
          logger.warn('skipping unreadable workspace', { workspaceId: id, error })
          quarantineFile(join(directory, entry), logger)
        }
      }

      return workspaces
    },

    get: (id: string): Workspace => {
      const path = fileFor(id)
      try {
        return readAt(path, id)
      } catch (error) {
        if (error instanceof NewerWorkspaceFileError) {
          // Translated, not quarantined: the file is valid, just not ours yet.
          throw new InvalidWorkspaceError(error.message)
        }
        if (error instanceof InvalidWorkspaceError) quarantineFile(path, logger)
        throw error
      }
    },

    save: (workspace: Workspace): void => {
      const path = fileFor(workspace.id)
      mkdirSync(directory, { recursive: true })

      // Write-then-rename, so an interrupted write leaves a temp file rather
      // than a truncated workspace. The id is in the temp name so two different
      // workspaces saving in the same tick cannot clobber each other, and
      // `list` ignores it because it is not `<workspace-id>.json`.
      const temporary = join(directory, `.${workspace.id}.tmp`)
      writeFileSync(temporary, JSON.stringify(workspace, null, 2), 'utf8')
      renameSync(temporary, path)
    },

    delete: (id: string): void => {
      // Idempotent: an id that was never stored — or is not even well formed —
      // is already in the state the caller asked for.
      if (!isWorkspaceId(id)) return
      rmSync(join(directory, `${id}${FILE_SUFFIX}`), { force: true })
    }
  }
}
