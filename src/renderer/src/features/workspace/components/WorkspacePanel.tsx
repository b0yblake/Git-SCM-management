import { useCallback, useEffect, useState } from 'react'
import type { Workspace, WorkspaceInput } from '@shared/contracts/workspace'
import { createId } from '@shared/domain/ids'
import { useToastStore } from '../../../shared/store/toastStore'
import { useShellProfiles, useTerminalStore } from '../../terminal/public'
import { useOpenWorkspace } from '../hooks/useOpenWorkspace'
import { useRestoreOnStartup } from '../hooks/useRestoreOnStartup'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { WorkspaceEditor } from './WorkspaceEditor'
import { WorkspaceSidebar } from './WorkspaceSidebar'

export interface WorkspacePanelProps {
  /** Called after an open/re-open succeeds so the shell can reveal the terminals. */
  readonly onWorkspaceOpened?: () => void
  /**
   * Called once when startup restore settles (Phase 18): Explorer open-path
   * requests hold until then, so a restored terminal at the same path is
   * focused rather than duplicated.
   */
  readonly onRestoreSettled?: () => void
}

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
export const WorkspacePanel = ({
  onWorkspaceOpened,
  onRestoreSettled
}: WorkspacePanelProps): React.JSX.Element => {
  const workspaces = useWorkspaces()
  const opener = useOpenWorkspace()
  // Owns what the window shows at launch: a restored workspace, or one shell.
  const restore = useRestoreOnStartup(opener.open)

  useEffect(() => {
    if (restore.status === 'settled') onRestoreSettled?.()
  }, [restore.status, onRestoreSettled])

  const shells = useShellProfiles()
  const [editing, setEditing] = useState<WorkspaceInput | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const startEdit = useCallback(
    async (workspaceId: string) => {
      const workspace = await workspaces.load(workspaceId)
      if (workspace) setEditing(toInput(workspace))
    },
    [workspaces]
  )

  const saveDraft = useCallback(
    async (input: WorkspaceInput) => {
      setIsSaving(true)
      try {
        const saved = await workspaces.save(input)
        // A rejected save keeps the editor open, so the user does not lose the draft.
        if (saved) {
          setEditing(null)
          useToastStore.getState().push('info', `Saved workspace “${saved.name}”.`)
        }
      } finally {
        setIsSaving(false)
      }
    },
    [workspaces]
  )

  const createDraft = (): void => {
    const terminalState = useTerminalStore.getState()
    const activeSession = terminalState.activeSessionId
      ? terminalState.sessions[terminalState.activeSessionId]
      : undefined
    const definitionId = createId('term')
    const shellProfileId =
      activeSession?.definition.shellProfileId ??
      shells.defaultShellProfileId ??
      shells.profiles[0]?.id ??
      'powershell'

    setEditing({
      name: '',
      terminals: [
        {
          id: definitionId,
          title: activeSession?.definition.title ?? 'Terminal',
          cwd: activeSession?.definition.cwd ?? '',
          shellProfileId
        }
      ],
      activeTerminalId: definitionId
    })
  }

  const openWorkspace = async (workspaceId: string): Promise<void> => {
    if (await opener.open(workspaceId)) onWorkspaceOpened?.()
  }

  return (
    <div className={`workspace-panel${editing ? ' workspace-panel--editing' : ''}`}>
      <WorkspaceSidebar
        workspaces={workspaces.summaries}
        activeWorkspaceId={workspaces.activeWorkspaceId}
        notices={opener.notices}
        isLoading={workspaces.isLoading}
        openingWorkspaceId={opener.openingWorkspaceId}
        onOpen={(id) => void openWorkspace(id)}
        onEdit={(id) => void startEdit(id)}
        onDelete={(id) => void workspaces.remove(id)}
        onCreate={createDraft}
      />

      {editing && (
        <WorkspaceEditor
          // Remounts on a different workspace so the draft starts from it.
          key={editing.id ?? 'new'}
          initial={editing}
          profiles={shells.profiles}
          defaultShellProfileId={shells.defaultShellProfileId}
          isSaving={isSaving}
          onSave={(input) => void saveDraft(input)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
