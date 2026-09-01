/**
 * The serializable model lives in `@shared/contracts/git` because the renderer
 * needs it and may not import Main-process code. It is re-exported here so the
 * rest of the feature keeps importing from its own domain folder.
 */
export type { GitRepositoryStatus } from '@shared/contracts/git'

/** Everything `git status --porcelain=v2 --branch` can tell us, minus the root. */
export interface GitStatusCounts {
  readonly branch: string | null
  readonly ahead: number
  readonly behind: number
  readonly staged: number
  readonly modified: number
  readonly untracked: number
  readonly conflicted: number
  readonly isClean: boolean
}
