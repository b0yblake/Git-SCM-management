import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '@main/bootstrap/logger'
import { InvalidWorkspaceError, WorkspaceNotFoundError } from '../domain/errors'
import { isWorkspaceId, parseWorkspace, type Workspace } from '../domain/Workspace'
import type { WorkspaceRepository } from '../domain/WorkspaceRepository'

export interface JsonWorkspaceRepositoryOptions {
  /** `userData/workspaces` in the app; a temp directory in tests. */
  readonly directory: string
  readonly logger: Logger
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
  logger
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
          logger.warn('skipping unreadable workspace', { workspaceId: id, error })
        }
      }

      return workspaces
    },

    get: (id: string): Workspace => readAt(fileFor(id), id),

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
