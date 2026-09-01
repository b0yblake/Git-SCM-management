import { create } from 'zustand'

export type ToastTone = 'error' | 'info'

export interface Toast {
  readonly id: number
  readonly tone: ToastTone
  readonly message: string
}

/** Long enough to read a sentence, short enough not to sit in the way. */
export const TOAST_DISMISS_MS = 6_000

export interface ToastState {
  readonly toasts: readonly Toast[]
}

export interface ToastStore extends ToastState {
  /** Returns the id, so a caller can dismiss its own toast early. */
  push(tone: ToastTone, message: string): number
  dismiss(id: number): void
  clear(): void
}

let nextId = 0

/**
 * Where feature errors go to be seen.
 *
 * Toasts stack rather than replace: two features failing at once is exactly
 * when the user most needs both messages. Nothing here talks to IPC — a toast
 * is a presentation concern, and features push into it rather than the reverse.
 */
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  push: (tone, message) => {
    nextId += 1
    const id = nextId
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }))
    return id
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  clear: () => set({ toasts: [] })
}))
