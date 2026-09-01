// Public surface of the renderer terminal feature (ARCHITECTURE.md §4).
export { TerminalDeck } from './components/TerminalDeck'
export { TerminalNavigator, type TerminalNavigatorProps } from './components/TerminalNavigator'
export {
  TerminalLayoutToolbar,
  type TerminalLayoutToolbarProps
} from './components/TerminalLayoutToolbar'
export { TerminalView, type TerminalViewProps } from './components/TerminalView'
export {
  useTerminalSession,
  type TerminalSessionHandle,
  type TerminalViewStatus
} from './hooks/useTerminalSession'
export { useTerminalSessions, type TerminalSessionsController } from './hooks/useTerminalSessions'
export { useShellProfiles, type ShellProfilesState } from './hooks/useShellProfiles'
export {
  TERMINAL_LAYOUT_CAPACITY,
  TERMINAL_LAYOUT_MODES,
  useTerminalStore,
  type TerminalLayoutMode,
  type TerminalUiState
} from './store/terminalStore'
