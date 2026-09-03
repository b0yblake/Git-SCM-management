import { useState } from 'react'
import type { WorkspaceSummary } from '@shared/contracts/workspace'
import type { OpenNotice } from '../store/workspaceStore'

export interface WorkspaceSidebarProps {
  readonly workspaces: readonly WorkspaceSummary[]
  readonly activeWorkspaceId: string | null
  readonly notices: readonly OpenNotice[]
  /** True until the first list arrives, so an empty list is not mistaken for none. */
  readonly isLoading: boolean
  readonly openingWorkspaceId?: string | null
  readonly onOpen: (workspaceId: string) => void
  readonly onEdit: (workspaceId: string) => void
  readonly onDelete: (workspaceId: string) => void
  readonly onCreate: () => void
  /** Phase 19 — the right-click menu's one command. */
  readonly onCreateShortcut?: (workspaceId: string) => void
}

interface WorkspaceMenuAt {
  readonly x: number
  readonly y: number
  readonly workspaceId: string
  readonly name: string
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
  openingWorkspaceId = null,
  onOpen,
  onEdit,
  onDelete,
  onCreate,
  onCreateShortcut
}: WorkspaceSidebarProps): React.JSX.Element => {
  const [menuAt, setMenuAt] = useState<WorkspaceMenuAt | null>(null)

  return (
  <nav className="workspace-sidebar" aria-label="Workspaces">
    <div className="workspace-sidebar__header">
      <h2>Workspaces</h2>
      <button type="button" onClick={onCreate} disabled={openingWorkspaceId !== null}>
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
        {workspaces.map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId
          const isOpening = workspace.id === openingWorkspaceId
          return (
            <li
              key={workspace.id}
              className={
                isActive
                  ? 'workspace-sidebar__item workspace-sidebar__item--active'
                  : 'workspace-sidebar__item'
              }
              onContextMenu={(event) => {
                event.preventDefault()
                setMenuAt({
                  x: event.clientX,
                  y: event.clientY,
                  workspaceId: workspace.id,
                  name: workspace.name
                })
              }}
            >
              <button
                type="button"
                className="workspace-sidebar__open"
                onClick={() => onOpen(workspace.id)}
                disabled={openingWorkspaceId !== null}
                aria-current={isActive}
                // Explicit, because the computed name would fold the terminal
                // count into it and collide with "Edit <name>".
                aria-label={`Open ${workspace.name}`}
              >
                <span className="workspace-sidebar__name">
                  {workspace.name}
                  {isActive && <span className="workspace-sidebar__active">Active</span>}
                </span>
                <span className="workspace-sidebar__count">
                  {isOpening
                    ? 'Opening…'
                    : `${workspace.terminalCount} terminal${workspace.terminalCount === 1 ? '' : 's'}`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onEdit(workspace.id)}
                disabled={openingWorkspaceId !== null}
                aria-label={`Edit ${workspace.name}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(workspace.id)}
                disabled={openingWorkspaceId !== null}
                aria-label={`Delete ${workspace.name}`}
              >
                Delete
              </button>
            </li>
          )
        })}
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

    {menuAt && (
      <div className="context-menu-backdrop" onMouseDown={() => setMenuAt(null)}>
        <menu
          className="context-menu"
          role="menu"
          style={{ left: menuAt.x, top: menuAt.y }}
          aria-label={`${menuAt.name} actions`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuAt(null)
                onCreateShortcut?.(menuAt.workspaceId)
              }}
            >
              Create shortcut…
            </button>
          </li>
        </menu>
      </div>
    )}
  </nav>
  )
}
