import { AppError } from '@shared/domain/errors'

export class WorkspaceNotFoundError extends AppError {
  readonly code = 'WORKSPACE_NOT_FOUND'

  constructor(readonly workspaceId: string) {
    super(`No workspace with id "${workspaceId}"`)
  }
}

/**
 * A stored or submitted workspace that cannot be trusted.
 *
 * The message names the offending field so a user editing a file by hand can
 * fix it, but never contains a filesystem path — this crosses IPC.
 */
export class InvalidWorkspaceError extends AppError {
  readonly code = 'INVALID_WORKSPACE'

  constructor(reason: string) {
    super(`Workspace is not valid: ${reason}`)
  }
}
