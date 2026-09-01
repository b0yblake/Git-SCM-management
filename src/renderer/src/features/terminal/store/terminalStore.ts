import { create } from 'zustand'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'

export const TERMINAL_LAYOUT_MODES = ['focus', 'columns', 'main-side', 'grid'] as const

export type TerminalLayoutMode = (typeof TERMINAL_LAYOUT_MODES)[number]

export const TERMINAL_LAYOUT_CAPACITY: Readonly<Record<TerminalLayoutMode, number>> = {
  focus: 1,
  columns: 2,
  'main-side': 3,
  grid: 4
}

/**
 * Serializable renderer state. Live PTYs remain in Main and xterm instances
 * remain in TerminalView refs; layout only stores session ids.
 */
export interface TerminalUiState {
  readonly sessions: Record<string, TerminalSessionInfo>
  readonly order: string[]
  /** The visible terminal that receives keyboard focus and pane commands. */
  readonly activeSessionId: string | null
  /** Sessions currently assigned to the canvas, in pane order. */
  readonly visibleSessionIds: string[]
  readonly layoutMode: TerminalLayoutMode
}

export interface TerminalStore extends TerminalUiState {
  addSession(info: TerminalSessionInfo): void
  removeSession(sessionId: string): void
  /** Shows a parked session when necessary, then focuses it. */
  setActive(sessionId: string): void
  /** Removes a session from the canvas without closing its process. */
  hideSession(sessionId: string): void
  setLayoutMode(mode: TerminalLayoutMode): void
  renameSession(sessionId: string, title: string): void
  markExited(sessionId: string, exitCode: number): void
  reset(): void
}

const EMPTY: TerminalUiState = {
  sessions: {},
  order: [],
  activeSessionId: null,
  visibleSessionIds: [],
  layoutMode: 'grid'
}

const neighbourOf = (order: string[], removedIndex: number): string | null =>
  order[removedIndex] ?? order[removedIndex - 1] ?? null

const uniqueKnown = (
  ids: readonly string[],
  sessions: Readonly<Record<string, TerminalSessionInfo>>
): string[] => {
  const seen = new Set<string>()
  return ids.filter((id) => {
    if (!sessions[id] || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const fillVisible = (
  visible: readonly string[],
  order: readonly string[],
  sessions: Readonly<Record<string, TerminalSessionInfo>>,
  capacity: number
): string[] => {
  const next = uniqueKnown(visible, sessions).slice(0, capacity)
  for (const id of order) {
    if (next.length >= capacity) break
    if (sessions[id] && !next.includes(id)) next.push(id)
  }
  return next
}

const keepActiveVisible = (
  visible: readonly string[],
  activeSessionId: string | null,
  sessions: Readonly<Record<string, TerminalSessionInfo>>,
  capacity: number
): string[] => {
  const next = uniqueKnown(visible, sessions).slice(0, capacity)
  if (!activeSessionId || !sessions[activeSessionId] || next.includes(activeSessionId)) return next

  if (next.length < capacity) next.push(activeSessionId)
  else next[capacity - 1] = activeSessionId
  return next
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  ...EMPTY,

  addSession: (info) =>
    set((state) => {
      if (state.sessions[info.id]) return state

      const sessions = { ...state.sessions, [info.id]: info }
      const order = [...state.order, info.id]
      const capacity = TERMINAL_LAYOUT_CAPACITY[state.layoutMode]
      const visibleSessionIds = uniqueKnown(state.visibleSessionIds, sessions).slice(0, capacity)

      if (visibleSessionIds.length < capacity) visibleSessionIds.push(info.id)
      else {
        const focusedPane = state.activeSessionId
          ? visibleSessionIds.indexOf(state.activeSessionId)
          : -1
        visibleSessionIds[focusedPane >= 0 ? focusedPane : capacity - 1] = info.id
      }

      return { sessions, order, activeSessionId: info.id, visibleSessionIds }
    }),

  removeSession: (sessionId) =>
    set((state) => {
      if (!state.sessions[sessionId]) return state

      const removedIndex = state.order.indexOf(sessionId)
      const order = state.order.filter((id) => id !== sessionId)
      const { [sessionId]: _removed, ...sessions } = state.sessions
      const activeSessionId =
        state.activeSessionId === sessionId
          ? neighbourOf(order, removedIndex)
          : state.activeSessionId
      const capacity = TERMINAL_LAYOUT_CAPACITY[state.layoutMode]
      let visibleSessionIds = state.visibleSessionIds.filter((id) => id !== sessionId)

      visibleSessionIds = keepActiveVisible(visibleSessionIds, activeSessionId, sessions, capacity)
      visibleSessionIds = fillVisible(visibleSessionIds, order, sessions, capacity)

      return { sessions, order, activeSessionId, visibleSessionIds }
    }),

  setActive: (sessionId) =>
    set((state) => {
      if (!state.sessions[sessionId]) return state
      if (state.visibleSessionIds.includes(sessionId)) return { activeSessionId: sessionId }

      const capacity = TERMINAL_LAYOUT_CAPACITY[state.layoutMode]
      const visibleSessionIds = uniqueKnown(state.visibleSessionIds, state.sessions).slice(
        0,
        capacity
      )

      if (visibleSessionIds.length < capacity) visibleSessionIds.push(sessionId)
      else {
        const focusedPane = state.activeSessionId
          ? visibleSessionIds.indexOf(state.activeSessionId)
          : -1
        visibleSessionIds[focusedPane >= 0 ? focusedPane : capacity - 1] = sessionId
      }

      return { activeSessionId: sessionId, visibleSessionIds }
    }),

  hideSession: (sessionId) =>
    set((state) => {
      if (!state.visibleSessionIds.includes(sessionId)) return state
      const visibleSessionIds = state.visibleSessionIds.filter((id) => id !== sessionId)
      return {
        visibleSessionIds,
        activeSessionId:
          state.activeSessionId === sessionId
            ? (visibleSessionIds[0] ?? null)
            : state.activeSessionId
      }
    }),

  setLayoutMode: (layoutMode) =>
    set((state) => {
      if (layoutMode === state.layoutMode) return state
      const capacity = TERMINAL_LAYOUT_CAPACITY[layoutMode]
      const preferredActive =
        state.activeSessionId ?? state.visibleSessionIds[0] ?? state.order[0] ?? null
      let visibleSessionIds = keepActiveVisible(
        state.visibleSessionIds,
        preferredActive,
        state.sessions,
        capacity
      )
      visibleSessionIds = fillVisible(visibleSessionIds, state.order, state.sessions, capacity)
      const activeSessionId =
        preferredActive && visibleSessionIds.includes(preferredActive)
          ? preferredActive
          : (visibleSessionIds[0] ?? null)

      return { layoutMode, visibleSessionIds, activeSessionId }
    }),

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
