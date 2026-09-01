// Public surface of the renderer workspace feature (ARCHITECTURE.md §4).
export { WorkspacePanel } from './components/WorkspacePanel'
export { WorkspaceSidebar, type WorkspaceSidebarProps } from './components/WorkspaceSidebar'
export { WorkspaceEditor, type WorkspaceEditorProps } from './components/WorkspaceEditor'
export {
  TerminalDefinitionEditor,
  type TerminalDefinitionEditorProps
} from './components/TerminalDefinitionEditor'
export { useWorkspaces, type WorkspacesController } from './hooks/useWorkspaces'
export {
  useOpenWorkspace,
  type OpenWorkspaceController,
  type OpenWorkspaceOptions
} from './hooks/useOpenWorkspace'
export {
  useRestoreOnStartup,
  type RestoreController,
  type RestoreStatus
} from './hooks/useRestoreOnStartup'
export { useWorkspaceStore, type OpenNotice, type WorkspaceUiState } from './store/workspaceStore'
