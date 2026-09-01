import { create } from 'zustand'
import type { PortSnapshot } from '@shared/contracts/ports'

export type PortsPhase = 'loading' | 'ready' | 'error'

/** One line of post-termination feedback, resolved to a human label already. */
export interface PortsFeedbackRow {
  readonly kind: 'terminated' | 'already-exited' | 'failed'
  readonly label: string
  readonly detail?: string
}

/**
 * Renderer-side ports state. Serializable data only: the snapshot is the
 * shared contract as Main sent it, and a selection is a list of the opaque
 * target ids Main minted — never a PID.
 */
export interface PortsUiState {
  readonly isOpen: boolean
  readonly phase: PortsPhase
  readonly snapshot: PortSnapshot | null
  readonly errorMessage: string | null
  readonly filter: string
  readonly selectedTargetIds: readonly string[]
  readonly confirming: boolean
  readonly terminating: boolean
  readonly feedback: readonly PortsFeedbackRow[] | null
}

export interface PortsStore extends PortsUiState {
  open(): void
  close(): void
  beginLoad(): void
  resolveLoad(snapshot: PortSnapshot): void
  rejectLoad(message: string): void
  setFilter(filter: string): void
  toggleTarget(targetId: string): void
  setSelection(targetIds: readonly string[]): void
  setConfirming(confirming: boolean): void
  beginTerminate(): void
  finishTerminate(feedback: readonly PortsFeedbackRow[]): void
}

const EMPTY: PortsUiState = {
  isOpen: false,
  phase: 'loading',
  snapshot: null,
  errorMessage: null,
  filter: '',
  selectedTargetIds: [],
  confirming: false,
  terminating: false,
  feedback: null
}

export const usePortsStore = create<PortsStore>((set) => ({
  ...EMPTY,

  open: () => set({ isOpen: true }),

  // Closing forgets everything: a snapshot is a set of live capabilities, and
  // holding onto one after the modal is gone would only let it go stale.
  close: () => set(EMPTY),

  // The previous snapshot stays visible while a refresh is in flight, so a
  // manual refresh does not blank the table under the user.
  beginLoad: () => set({ phase: 'loading', errorMessage: null }),

  resolveLoad: (snapshot) =>
    set((state) => ({
      phase: 'ready',
      snapshot,
      errorMessage: null,
      confirming: false,
      // A refresh mints all-new target ids, so anything selected against the
      // old snapshot is stale by definition and drops out here.
      selectedTargetIds: state.selectedTargetIds.filter((id) =>
        snapshot.processes.some((process) => process.targetId === id && process.canTerminate)
      )
    })),

  rejectLoad: (message) =>
    set({ phase: 'error', errorMessage: message, snapshot: null, selectedTargetIds: [] }),

  // Deliberately touches nothing but the filter: hiding a row must not
  // silently unselect it.
  setFilter: (filter) => set({ filter }),

  toggleTarget: (targetId) =>
    set((state) => ({
      selectedTargetIds: state.selectedTargetIds.includes(targetId)
        ? state.selectedTargetIds.filter((id) => id !== targetId)
        : [...state.selectedTargetIds, targetId]
    })),

  setSelection: (targetIds) => set({ selectedTargetIds: [...targetIds] }),

  setConfirming: (confirming) => set({ confirming }),

  beginTerminate: () => set({ terminating: true, confirming: false, feedback: null }),

  finishTerminate: (feedback) => set({ terminating: false, feedback })
}))
