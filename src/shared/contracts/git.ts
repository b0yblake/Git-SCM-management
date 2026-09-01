/**
 * The serializable Git contract — everything that crosses the Main ↔ renderer
 * boundary.
 *
 * Git is **additive, optional metadata**: nothing in the terminal or workspace
 * features may depend on it, and the app is fully usable when git is not
 * installed (ARCHITECTURE.md §1 rule 6).
 *
 * Read-only by construction. Write operations are a separate future feature
 * module (BACKLOG.md → Git Actions) and must never be added here.
 */
export interface GitRepositoryStatus {
  readonly repositoryRoot: string
  /** `null` on a detached HEAD — there is no branch name to show. */
  readonly branch: string | null
  readonly ahead: number
  readonly behind: number
  /** A file changed in the index. A file can be both staged and modified. */
  readonly staged: number
  readonly modified: number
  readonly untracked: number
  readonly conflicted: number
  readonly isClean: boolean
}

export interface GitInspectPayload {
  readonly path: string
}
