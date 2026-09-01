// Public surface of the workspace feature (ARCHITECTURE.md §4).
// Other features and the composition root may import from this file only —
// never from domain/, application/, infrastructure/ or testing/.
import type { Logger } from '@main/bootstrap/logger'
import { WorkspaceService } from './application/WorkspaceService'
import { WORKSPACE_MIGRATIONS } from './domain/workspaceMigrations'
import { createJsonWorkspaceRepository } from './infrastructure/JsonWorkspaceRepository'

/**
 * Wires the feature so the composition root never sees the storage choice.
 * Both paths arrive minted by `bootstrap/storagePaths` (Phase 14) — this
 * feature no longer knows where it lives. Migrations (Phase 15) run inside
 * the repository on load.
 */
export const createWorkspaceService = (
  workspacesDir: string,
  backupsDir: string,
  logger: Logger
): WorkspaceService =>
  new WorkspaceService(
    createJsonWorkspaceRepository({
      directory: workspacesDir,
      logger,
      migrations: WORKSPACE_MIGRATIONS,
      backupDir: backupsDir
    })
  )

export { WorkspaceService }
export { registerWorkspaceIpc, type WorkspaceIpcDependencies } from './ipc/workspaceIpc'
export { InvalidWorkspaceError, WorkspaceNotFoundError } from './domain/errors'
export type { Workspace, WorkspaceInput, WorkspaceSummary } from './domain/Workspace'
export type { WorkspaceRepository } from './domain/WorkspaceRepository'
