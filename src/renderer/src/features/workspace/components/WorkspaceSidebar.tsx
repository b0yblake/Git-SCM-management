import type { WorkspaceSummary } from '@shared/contracts/workspace'
import type { OpenNotice } from '../store/workspaceStore'

export interface WorkspaceSidebarProps {
  readonly workspaces: readonly WorkspaceSummary[]
  readonly activeWorkspaceId: string | null
  readonly notices: readonly OpenNotice[]
  /** True until the first list arrives, so an empty list is not mistaken for none. */
  readonly isLoading: boolean
  readonly onOpen: (workspaceId: string) => void
  readonly onEdit: (workspaceId: string) => void
  readonly onDelete: (workspaceId: string) => void
  readonly onCreate: () => void
}

/**
 * Purely presentational: it receives summaries and reports intents. It must
 * never call IPC — `WorkspaceSidebar.spec.tsx` asserts the bridge records zero
 * calls while it is driven.
 */
export const WorkspaceSidebar = ({
  workspaces,
  activeWorkspaceId,
  notices,
  isLoading,
  onOpen,
  onEdit,
  onDelete,
  onCreate
}: WorkspaceSidebarProps): React.JSX.Element => (
  <nav className="workspace-sidebar" aria-label="Workspaces">
    <div className="workspace-sidebar__header">
      <h2>Workspaces</h2>
      <button type="button" onClick={onCreate}>
        New workspace
      </button>
    </div>

    {isLoading ? (
      <p className="workspace-sidebar__loading" role="status">
        Loading workspaces…
      </p>
    ) : workspaces.length === 0 ? (
      <div className="empty-state" role="status">
        <p className="empty-state__title">No workspaces yet.</p>
        <p className="empty-state__hint">
          A workspace remembers a set of terminals — their directories, shells and startup commands
          — and opens them together.
        </p>
      </div>
    ) : (
      <ul className="workspace-sidebar__list">
        {workspaces.map((workspace) => (
          <li
            key={workspace.id}
            className={
              workspace.id === activeWorkspaceId
                ? 'workspace-sidebar__item workspace-sidebar__item--active'
                : 'workspace-sidebar__item'
            }
          >
            <button
              type="button"
              className="workspace-sidebar__open"
              onClick={() => onOpen(workspace.id)}
              aria-current={workspace.id === activeWorkspaceId}
              // Explicit, because the computed name would fold the terminal
              // count into it and collide with "Edit <name>".
              aria-label={`Open ${workspace.name}`}
            >
              {workspace.name}
              <span className="workspace-sidebar__count">
                {workspace.terminalCount} terminal{workspace.terminalCount === 1 ? '' : 's'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onEdit(workspace.id)}
              aria-label={`Edit ${workspace.name}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(workspace.id)}
              aria-label={`Delete ${workspace.name}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    )}

    {notices.length > 0 && (
      <ul className="workspace-sidebar__notices" role="alert">
        {notices.map((notice) => (
          <li
            key={notice.definitionId}
            className={`workspace-sidebar__notice workspace-sidebar__notice--${notice.severity}`}
          >
            {notice.title}
            {notice.severity === 'error' ? ' did not open: ' : ': '}
            {notice.message}
          </li>
        ))}
      </ul>
    )}
  </nav>
)
