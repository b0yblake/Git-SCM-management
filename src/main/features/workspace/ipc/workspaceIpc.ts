import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { isAppError } from '@shared/domain/errors'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import type { Logger } from '@main/bootstrap/logger'
import type { WorkspaceService } from '../application/WorkspaceService'
import { InvalidWorkspaceError } from '../domain/errors'
import { parseWorkspaceInput, type Workspace, type WorkspaceSummary } from '../domain/Workspace'

/**
 * Converts any thrown value into something safe to serialize.
 *
 * Only `AppError` messages are passed through — they are written for the user.
 * Anything else collapses to a generic message so a stack trace or an absolute
 * path cannot reach the renderer (ARCHITECTURE.md §9).
 */
const toIpcError = (error: unknown): IpcError =>
  isAppError(error)
    ? { code: error.code, message: error.message }
    : { code: IPC_ERROR_CODES.internal, message: 'An unexpected error occurred.' }

const parseId = (payload: unknown): string => {
  const id =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)['id']
      : undefined

  if (typeof id !== 'string' || id.length === 0) {
    throw new InvalidWorkspaceError('id must be a non-empty string')
  }
  return id
}

export interface WorkspaceIpcDependencies {
  readonly registry: IpcHandlerRegistry
  readonly workspace: WorkspaceService
  readonly logger: Logger
}

/**
 * Registers the workspace channels.
 *
 * All four are request/response and all four answer with a `Result`: a handler
 * that threw would reject, and Electron's contextBridge would strip the error
 * `code` on the way across (ARCHITECTURE.md §7).
 */
export const registerWorkspaceIpc = ({
  registry,
  workspace,
  logger
}: WorkspaceIpcDependencies): void => {
  const attempt = <T>(channel: string, run: () => T): Result<T, IpcError> => {
    try {
      return Ok(run())
    } catch (error) {
      const failure = toIpcError(error)
      logger.warn(`${channel} rejected`, { error: failure })
      return Err(failure)
    }
  }

  registry.handle(IPC.workspace.list, (): Result<readonly WorkspaceSummary[], IpcError> =>
    attempt(IPC.workspace.list, () => workspace.list())
  )

  registry.handle(IPC.workspace.get, (payload): Result<Workspace, IpcError> =>
    attempt(IPC.workspace.get, () => workspace.get(parseId(payload)))
  )

  registry.handle(IPC.workspace.save, (payload): Result<Workspace, IpcError> =>
    attempt(IPC.workspace.save, () => workspace.save(parseWorkspaceInput(payload)))
  )

  registry.handle(IPC.workspace.delete, (payload): Result<null, IpcError> =>
    attempt(IPC.workspace.delete, () => {
      workspace.delete(parseId(payload))
      return null
    })
  )
}
