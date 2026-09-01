import { useCallback, useState } from 'react'
import type { Workspace, WorkspaceInput } from '@shared/contracts/workspace'
import { useShellProfiles } from '../../terminal/public'
import { useOpenWorkspace } from '../hooks/useOpenWorkspace'
import { useRestoreOnStartup } from '../hooks/useRestoreOnStartup'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { WorkspaceEditor } from './WorkspaceEditor'
import { WorkspaceSidebar } from './WorkspaceSidebar'

/** Strips what Main owns: a caller never supplies version or timestamps. */
const toInput = (workspace: Workspace): WorkspaceInput => ({
  id: workspace.id,
  name: workspace.name,
  terminals: workspace.terminals,
  ...(workspace.activeTerminalId === undefined
    ? {}
    : { activeTerminalId: workspace.activeTerminalId })
})

/**
 * Wires the workspace feature together.
 *
 * The components below it are presentational; every IPC call happens in the
 * hooks this component uses. Mirrors `TerminalDeck` for the terminal feature.
 */
export const WorkspacePanel = (): React.JSX.Element => {
  const workspaces = useWorkspaces()
  const opener = useOpenWorkspace()
  // Owns what the window shows at launch: a restored workspace, or one shell.
  useRestoreOnStartup()
  const shells = useShellProfiles()
  const [editing, setEditing] = useState<WorkspaceInput | null>(null)

  const startEdit = useCallback(
    async (workspaceId: string) => {
      const workspace = await workspaces.load(workspaceId)
      if (workspace) setEditing(toInput(workspace))
    },
    [workspaces]
  )

  const saveDraft = useCallback(
    async (input: WorkspaceInput) => {
      const saved = await workspaces.save(input)
      // A rejected save keeps the editor open, so the user does not lose the draft.
      if (saved) setEditing(null)
    },
    [workspaces]
  )

  return (
    <div className="workspace-panel">
      <WorkspaceSidebar
        workspaces={workspaces.summaries}
        activeWorkspaceId={workspaces.activeWorkspaceId}
        notices={opener.notices}
        isLoading={workspaces.isLoading}
        onOpen={(id) => void opener.open(id)}
        onEdit={(id) => void startEdit(id)}
        onDelete={(id) => void workspaces.remove(id)}
        onCreate={() => setEditing({ name: '', terminals: [] })}
      />

      {editing && (
        <WorkspaceEditor
          // Remounts on a different workspace so the draft starts from it.
          key={editing.id ?? 'new'}
          initial={editing}
          profiles={shells.profiles}
          onSave={(input) => void saveDraft(input)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
