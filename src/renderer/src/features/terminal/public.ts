// Public surface of the renderer terminal feature (ARCHITECTURE.md §4).
export { TerminalTabs } from './components/TerminalTabs'
export { TerminalView, type TerminalViewProps } from './components/TerminalView'
export { TerminalTabBar, type TerminalTabBarProps } from './components/TerminalTabBar'
export {
  useTerminalSession,
  type TerminalSessionHandle,
  type TerminalViewStatus
} from './hooks/useTerminalSession'
export { useTerminalTabs, type TerminalTabsController } from './hooks/useTerminalTabs'
export { useShellProfiles, type ShellProfilesState } from './hooks/useShellProfiles'
export { useTerminalStore, type TerminalUiState } from './store/terminalStore'
