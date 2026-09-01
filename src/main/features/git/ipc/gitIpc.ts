import type { GitRepositoryStatus } from '@shared/contracts/git'
import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { isAppError } from '@shared/domain/errors'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import type { Logger } from '@main/bootstrap/logger'
import type { GitService } from '../application/GitService'

const toIpcError = (error: unknown): IpcError =>
  isAppError(error)
    ? { code: error.code, message: error.message }
    : { code: IPC_ERROR_CODES.internal, message: 'An unexpected error occurred.' }

const parsePath = (payload: unknown): string => {
  const value =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)['path']
      : undefined

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('path must be a non-empty string')
  }
  return value
}

export interface GitIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly git: GitService
  readonly logger: Logger
}

/**
 * Registers the one Git channel there is.
 *
 * `inspect` answers `Ok(null)` for every "no status" case — outside a
 * repository, git not installed, output unreadable. The renderer therefore has
 * nothing to distinguish and nothing to report, which is what keeps a missing
 * git from becoming an error message on every poll.
 */
export const registerGitIpc = ({ registry, git, logger }: GitIpcDependencies): void => {
  registry.handle(
    IPC.git.inspect,
    async (payload): Promise<Result<GitRepositoryStatus | null, IpcError>> => {
      try {
        return Ok(await git.inspect(parsePath(payload)))
      } catch (error) {
        const failure = toIpcError(error)
        logger.warn(`${IPC.git.inspect} rejected`, { error: failure })
        return Err(failure)
      }
    }
  )
}
