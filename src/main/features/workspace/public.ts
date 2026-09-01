// Public surface of the workspace feature (ARCHITECTURE.md §4).
// Other features and the composition root may import from this file only —
// never from domain/, application/, infrastructure/ or testing/.
import { join } from 'node:path'
import type { Logger } from '@main/bootstrap/logger'
import { WorkspaceService } from './application/WorkspaceService'
import { createJsonWorkspaceRepository } from './infrastructure/JsonWorkspaceRepository'

/** Wires the feature so the composition root never sees the storage choice. */
export const createWorkspaceService = (userDataPath: string, logger: Logger): WorkspaceService =>
  new WorkspaceService(
    createJsonWorkspaceRepository({ directory: join(userDataPath, 'workspaces'), logger })
  )

export { WorkspaceService }
export { registerWorkspaceIpc, type WorkspaceIpcDependencies } from './ipc/workspaceIpc'
export { InvalidWorkspaceError, WorkspaceNotFoundError } from './domain/errors'
export type { Workspace, WorkspaceInput, WorkspaceSummary } from './domain/Workspace'
export type { WorkspaceRepository } from './domain/WorkspaceRepository'
