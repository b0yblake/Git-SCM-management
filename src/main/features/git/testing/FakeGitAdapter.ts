import type { GitAdapter } from '../domain/GitAdapter'
import type { GitStatusCounts } from '../domain/GitRepositoryStatus'

export const CLEAN: GitStatusCounts = {
  branch: 'main',
  ahead: 0,
  behind: 0,
  staged: 0,
  modified: 0,
  untracked: 0,
  conflicted: 0,
  isClean: true
}

export interface FakeGitAdapter extends GitAdapter {
  readonly calls: { repositoryRoot: string[]; status: string[] }
  /** Maps a path to the repository root containing it, or null for "outside". */
  setRepository(path: string, root: string | null): void
  setStatus(root: string, counts: Partial<GitStatusCounts>): void
  /** Every subsequent call rejects with this. */
  failWith(error: Error): void
  /** Holds the next `repositoryRoot` call open; returns a release function. */
  hold(): () => void
}

export const createFakeGitAdapter = (): FakeGitAdapter => {
  const roots = new Map<string, string | null>()
  const statuses = new Map<string, GitStatusCounts>()
  const calls = { repositoryRoot: [] as string[], status: [] as string[] }
  let failure: Error | null = null
  let gate: Promise<void> | null = null

  return {
    calls,

    setRepository: (path, root) => {
      roots.set(path, root)
    },

    setStatus: (root, counts) => {
      statuses.set(root, { ...CLEAN, ...counts })
    },

    failWith: (error) => {
      failure = error
    },

    hold: () => {
      let release = (): void => {}
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
      return release
    },

    repositoryRoot: async (path) => {
      calls.repositoryRoot.push(path)
      if (gate) await gate
      if (failure) throw failure
      return roots.get(path) ?? null
    },

    status: async (root) => {
      calls.status.push(root)
      if (failure) throw failure
      return statuses.get(root) ?? CLEAN
    }
  }
}
