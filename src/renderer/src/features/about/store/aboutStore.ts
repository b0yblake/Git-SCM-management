import { create } from 'zustand'

/**
 * Whether the About dialog is showing.
 *
 * A store rather than component state because two unrelated places open it:
 * the native Help → About menu, which arrives as a push, and the version badge
 * in the corner of the shell.
 */
export interface AboutStore {
  readonly isOpen: boolean
  open(): void
  close(): void
}

export const useAboutStore = create<AboutStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false })
}))
