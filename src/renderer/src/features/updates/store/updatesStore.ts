import { create } from 'zustand'
import type { UpdateCheckResult } from '@shared/contracts/updates'

export interface UpdatesUiState {
  /** The startup notification, when one arrived and is not dismissed. */
  readonly available: UpdateCheckResult | null
  setAvailable(result: UpdateCheckResult): void
  /** "Later": hides the banner for this run; nothing is persisted. */
  dismiss(): void
}

export const useUpdatesStore = create<UpdatesUiState>((set) => ({
  available: null,
  setAvailable: (result) =>
    set(() => (result.status === 'update-available' ? { available: result } : { available: null })),
  dismiss: () => set({ available: null })
}))
