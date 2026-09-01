import { create } from 'zustand'
import type { WorkspaceSummary } from '@shared/contracts/workspace'

/**
 * Something the user should know about the last open.
 *
 * Two severities because two things can go wrong and only one is fatal to that
 * terminal: a shell that is not installed means no tab at all, while a working
 * directory that no longer exists means the tab opened somewhere else.
 */
export interface OpenNotice {
  readonly definitionId: string
  readonly title: string
  readonly severity: 'error' | 'warning'
  readonly message: string
}

/**
 * Renderer-side workspace state.
 *
 * Everything here is serializable, and `bindings` is the reason this store
 * exists at all: it maps a persisted `definitionId` to the `sessionId` of the
 * PTY currently running it. That mapping is runtime-only — a session id means
 * nothing after a restart, so it must never reach a saved workspace.
 */
export interface WorkspaceUiState {
  readonly summaries: readonly WorkspaceSummary[]
  readonly activeWorkspaceId: string | null
  readonly bindings: Readonly<Record<string, string>>
  /** Workspace ownership for each runtime definition binding. */
  readonly workspaceByDefinitionId: Readonly<Record<string, string>>
  readonly openNotices: readonly OpenNotice[]
}

export interface WorkspaceStore extends WorkspaceUiState {
  setSummaries(summaries: readonly WorkspaceSummary[]): void
  setActiveWorkspaceId(workspaceId: string | null): void
  bind(workspaceId: string, definitionId: string, sessionId: string): void
  /** Drops bindings whose session is gone, so a closed tab leaves nothing behind. */
  retainBindings(liveSessionIds: readonly string[]): void
  /** Drops bindings removed from a saved workspace without touching their live sessions. */
  retainWorkspaceDefinitions(workspaceId: string, definitionIds: readonly string[]): void
  /** A deleted workspace no longer owns any live session. The sessions keep running. */
  forgetWorkspace(workspaceId: string): void
  setOpenNotices(notices: readonly OpenNotice[]): void
  reset(): void
}

const EMPTY: WorkspaceUiState = {
  summaries: [],
  activeWorkspaceId: null,
  bindings: {},
  workspaceByDefinitionId: {},
  openNotices: []
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  ...EMPTY,

  setSummaries: (summaries) => set({ summaries }),

  setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),

  bind: (workspaceId, definitionId, sessionId) =>
    set((state) => ({
      bindings: { ...state.bindings, [definitionId]: sessionId },
      workspaceByDefinitionId: {
        ...state.workspaceByDefinitionId,
        [definitionId]: workspaceId
      }
    })),

  retainBindings: (liveSessionIds) =>
    set((state) => {
      const live = new Set(liveSessionIds)
      const kept = Object.entries(state.bindings).filter(([, sessionId]) => live.has(sessionId))

      // Returning the same state when nothing was dropped keeps this cheap to
      // call from a subscription that fires on every terminal change.
      if (kept.length === Object.keys(state.bindings).length) return state
      const keptDefinitionIds = new Set(kept.map(([definitionId]) => definitionId))
      return {
        bindings: Object.fromEntries(kept),
        workspaceByDefinitionId: Object.fromEntries(
          Object.entries(state.workspaceByDefinitionId).filter(([definitionId]) =>
            keptDefinitionIds.has(definitionId)
          )
        )
      }
    }),

  retainWorkspaceDefinitions: (workspaceId, definitionIds) =>
    set((state) => {
      const retained = new Set(definitionIds)
      const removed = Object.entries(state.workspaceByDefinitionId)
        .filter(
          ([definitionId, ownerId]) => ownerId === workspaceId && !retained.has(definitionId)
        )
        .map(([definitionId]) => definitionId)
      if (removed.length === 0) return state

      const removedSet = new Set(removed)
      return {
        bindings: Object.fromEntries(
          Object.entries(state.bindings).filter(([definitionId]) => !removedSet.has(definitionId))
        ),
        workspaceByDefinitionId: Object.fromEntries(
          Object.entries(state.workspaceByDefinitionId).filter(
            ([definitionId]) => !removedSet.has(definitionId)
          )
        )
      }
    }),

  forgetWorkspace: (workspaceId) =>
    set((state) => {
      const removed = Object.entries(state.workspaceByDefinitionId)
        .filter(([, ownerId]) => ownerId === workspaceId)
        .map(([definitionId]) => definitionId)
      if (removed.length === 0) return state

      const removedSet = new Set(removed)
      return {
        bindings: Object.fromEntries(
          Object.entries(state.bindings).filter(([definitionId]) => !removedSet.has(definitionId))
        ),
        workspaceByDefinitionId: Object.fromEntries(
          Object.entries(state.workspaceByDefinitionId).filter(
            ([definitionId]) => !removedSet.has(definitionId)
          )
        )
      }
    }),

  setOpenNotices: (openNotices) => set({ openNotices }),

  reset: () => set(EMPTY)
}))
