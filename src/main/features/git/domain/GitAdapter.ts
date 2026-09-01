import type { GitStatusCounts } from './GitRepositoryStatus'

/**
 * The read-only window onto a git repository. Implemented by infrastructure;
 * faked in tests.
 *
 * There is deliberately no method here that could change a repository. Adding
 * one is how the read-only guarantee would be lost, so write operations belong
 * in a separate feature module (BACKLOG.md → Git Actions), never here.
 */
export interface GitAdapter {
  /**
   * The repository root containing `path`, or `null` when it is not inside a
   * repository — a normal answer, not an error.
   *
   * Throws `GitNotAvailableError` when git cannot be run at all.
   */
  repositoryRoot(path: string): Promise<string | null>
  /** Throws `GitNotAvailableError` or `GitOutputError`. */
  status(repositoryRoot: string): Promise<GitStatusCounts>
}
