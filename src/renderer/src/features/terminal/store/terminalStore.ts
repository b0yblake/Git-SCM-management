import { create } from 'zustand'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'

/**
 * Renderer-side terminal metadata. Everything here is serializable — an xterm
 * instance or a PTY handle must never reach this store (ARCHITECTURE.md §8),
 * which `terminalStore.spec.ts` enforces with a JSON round-trip.
 */
export interface TerminalUiState {
  readonly sessions: Record<string, TerminalSessionInfo>
  readonly order: string[]
  readonly activeSessionId: string | null
}

export interface TerminalStore extends TerminalUiState {
  /** A newly opened terminal becomes the active one — the documented choice. */
  addSession(info: TerminalSessionInfo): void
  removeSession(sessionId: string): void
  setActive(sessionId: string): void
  renameSession(sessionId: string, title: string): void
  markExited(sessionId: string, exitCode: number): void
  reset(): void
}

const EMPTY: TerminalUiState = { sessions: {}, order: [], activeSessionId: null }

/**
 * When the active tab closes, focus moves to the tab on its right, falling back
 * to the one on its left. That keeps repeated closes moving in one direction
 * instead of bouncing.
 */
const neighbourOf = (order: string[], removedIndex: number): string | null =>
  order[removedIndex] ?? order[removedIndex - 1] ?? null

export const useTerminalStore = create<TerminalStore>((set) => ({
  ...EMPTY,

  addSession: (info) =>
    set((state) =>
      state.sessions[info.id]
        ? state
        : {
            sessions: { ...state.sessions, [info.id]: info },
            order: [...state.order, info.id],
            activeSessionId: info.id
          }
    ),

  removeSession: (sessionId) =>
    set((state) => {
      if (!state.sessions[sessionId]) return state

      const index = state.order.indexOf(sessionId)
      const order = state.order.filter((id) => id !== sessionId)
      const { [sessionId]: _removed, ...sessions } = state.sessions

      return {
        sessions,
        order,
        activeSessionId:
          state.activeSessionId === sessionId ? neighbourOf(order, index) : state.activeSessionId
      }
    }),

  setActive: (sessionId) =>
    set((state) => (state.sessions[sessionId] ? { activeSessionId: sessionId } : state)),

  renameSession: (sessionId, title) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, definition: { ...session.definition, title } }
        }
      }
    }),

  markExited: (sessionId, exitCode) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, status: 'exited', exitCode }
        }
      }
    }),

  reset: () => set(EMPTY)
}))
