import type { Workspace } from './Workspace'

/**
 * Where workspaces live. Implemented by infrastructure; faked in tests.
 *
 * Synchronous on purpose: these are a handful of small JSON files, and the
 * settings store already established the pattern. Making it async would buy
 * nothing and would open a window for two saves to interleave.
 */
export interface WorkspaceRepository {
  /** Every workspace that parses. Unreadable files are skipped, not thrown. */
  list(): readonly Workspace[]
  /** Throws `WorkspaceNotFoundError` or `InvalidWorkspaceError`. */
  get(id: string): Workspace
  save(workspace: Workspace): void
  /** Idempotent: deleting an id that is not stored is not an error. */
  delete(id: string): void
}
