// Public surface of the git feature (ARCHITECTURE.md §4).
// Read-only by design: nothing exported here can change a repository, and the
// rest of the app must keep working when this whole feature is absent.
import type { Logger } from '@main/bootstrap/logger'
import { GitService, type GitServiceOptions } from './application/GitService'
import { createGitCliAdapter } from './infrastructure/GitCliAdapter'

/** Wires the feature so the composition root never sees the CLI. */
export const createGitService = (logger: Logger, options: GitServiceOptions = {}): GitService =>
  new GitService(createGitCliAdapter(), logger, options)

export { GitService }
export { registerGitIpc, type GitIpcDependencies } from './ipc/gitIpc'
export { GitNotAvailableError, GitOutputError, GitTimeoutError } from './domain/errors'
export type { GitAdapter } from './domain/GitAdapter'
export type { GitRepositoryStatus, GitStatusCounts } from './domain/GitRepositoryStatus'
