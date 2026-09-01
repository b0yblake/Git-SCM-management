import { create } from 'zustand'
import type { GitRepositoryStatus } from '@shared/contracts/git'

/**
 * Renderer-side Git state.
 *
 * `status` is `null` whenever there is nothing to show — outside a repository,
 * git not installed, output unreadable. The UI never has to tell those apart,
 * which is what keeps a missing git from producing a message per poll.
 */
export interface GitUiState {
  readonly status: GitRepositoryStatus | null
  /** The path the current status describes; null before the first answer. */
  readonly inspectedPath: string | null
}

export interface GitStore extends GitUiState {
  setStatus(path: string, status: GitRepositoryStatus | null): void
  clear(): void
}

const EMPTY: GitUiState = { status: null, inspectedPath: null }

export const useGitStore = create<GitStore>((set) => ({
  ...EMPTY,
  setStatus: (inspectedPath, status) => set({ inspectedPath, status }),
  clear: () => set(EMPTY)
}))
