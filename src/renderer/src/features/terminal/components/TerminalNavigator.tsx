import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AvailableShellProfile,
  ShellProfileId,
  TerminalSessionInfo
} from '@shared/contracts/terminal'
import { TERMINAL_LAYOUT_CAPACITY, type TerminalLayoutMode } from '../store/terminalStore'
import { NewTerminalMenu } from './NewTerminalMenu'

export interface TerminalNavigatorProps {
  readonly terminals: readonly TerminalSessionInfo[]
  readonly activeId: string | null
  readonly visibleIds: readonly string[]
  readonly layoutMode: TerminalLayoutMode
  readonly profiles: readonly AvailableShellProfile[]
  readonly defaultShellProfileId: ShellProfileId | null
  readonly renameRequestId?: string | null
  readonly onRenameRequestHandled?: () => void
  readonly onActivate: (sessionId: string) => void
  readonly onClose: (sessionId: string) => void
  readonly onRename: (sessionId: string, title: string) => void
  readonly onCreate: () => void
  readonly onCreateWithProfile: (id: ShellProfileId) => void
}

export const TerminalNavigator = ({
  terminals,
  activeId,
  visibleIds,
  layoutMode,
  profiles,
  defaultShellProfileId,
  renameRequestId = null,
  onRenameRequestHandled,
  onActivate,
  onClose,
  onRename,
  onCreate,
  onCreateWithProfile
}: TerminalNavigatorProps): React.JSX.Element => {
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [seenRenameRequestId, setSeenRenameRequestId] = useState<string | null>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const labels = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.label])),
    [profiles]
  )
  const normalized = query.trim().toLocaleLowerCase()
  const filtered = terminals.filter((session) => {
    if (!normalized) return true
    const { title, cwd, shellProfileId } = session.definition
    return `${title} ${cwd} ${labels.get(shellProfileId) ?? shellProfileId}`
      .toLocaleLowerCase()
      .includes(normalized)
  })

  const beginRename = (session: TerminalSessionInfo): void => {
    setRenamingId(session.id)
    setRenameDraft(session.definition.title)
  }

  // React's documented render-time adjustment. An effect that copied this
  // request into state would add a cascading render and is rejected by lint.
  if (renameRequestId !== seenRenameRequestId) {
    setSeenRenameRequestId(renameRequestId)
    if (renameRequestId) {
      const session = terminals.find((candidate) => candidate.id === renameRequestId)
      if (session) {
        setRenamingId(session.id)
        setRenameDraft(session.definition.title)
      }
    }
  }

  useEffect(() => {
    if (renamingId) renameRef.current?.select()
  }, [renamingId])

  const finishRename = (): void => {
    if (!renamingId) return
    const title = renameDraft.trim()
    if (title) onRename(renamingId, title)
    setRenamingId(null)
    if (renamingId === renameRequestId) onRenameRequestHandled?.()
  }

  const cancelRename = (): void => {
    const wasRequested = renamingId === renameRequestId
    setRenamingId(null)
    if (wasRequested) onRenameRequestHandled?.()
  }

  return (
    <aside className="terminal-navigator" aria-label="Terminal Navigator">
      <div className="terminal-navigator__header">
        <h1>Terminals</h1>
        <NewTerminalMenu
          profiles={profiles}
          defaultShellProfileId={defaultShellProfileId}
          onCreate={onCreate}
          onCreateWithProfile={onCreateWithProfile}
        />
        <label className="terminal-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search terminals</span>
          <input
            type="search"
            value={query}
            placeholder="Search terminals…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="terminal-navigator__group">
        <div className="terminal-navigator__group-title">
          <span aria-hidden="true">⌄</span>
          Open sessions
          <span>{terminals.length}</span>
        </div>

        {filtered.length === 0 ? (
          <p className="terminal-navigator__empty">
            {terminals.length === 0 ? 'No terminals running.' : 'No matching terminals.'}
          </p>
        ) : (
          <ul className="terminal-session-list">
            {filtered.map((session) => {
              const paneIndex = visibleIds.indexOf(session.id)
              const isActive = session.id === activeId
              const statusLabel = session.status === 'exited' ? 'exited' : session.status

              return (
                <li
                  key={session.id}
                  className={[
                    'terminal-session-item',
                    paneIndex >= 0 && 'terminal-session-item--visible',
                    isActive && 'terminal-session-item--active'
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {renamingId === session.id ? (
                    <input
                      ref={renameRef}
                      className="terminal-session-item__rename"
                      aria-label={`Rename ${session.definition.title}`}
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') finishRename()
                        if (event.key === 'Escape') cancelRename()
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="terminal-session-item__open"
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={
                        session.status === 'exited'
                          ? `${session.definition.title} (exited)`
                          : session.definition.title
                      }
                      onClick={() => onActivate(session.id)}
                      onDoubleClick={() => beginRename(session)}
                    >
                      <span
                        className={`terminal-status terminal-status--${session.status}`}
                        aria-label={statusLabel}
                      />
                      <span className="terminal-session-item__copy">
                        <strong>{session.definition.title}</strong>
                        <small title={session.definition.cwd}>
                          {labels.get(session.definition.shellProfileId) ??
                            session.definition.shellProfileId}
                          {' · '}
                          {session.definition.cwd}
                        </small>
                      </span>
                      {paneIndex >= 0 && (
                        <span
                          className="terminal-session-item__pane"
                          aria-label={`Pane ${paneIndex + 1}`}
                        >
                          {paneIndex + 1}
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="terminal-session-item__close"
                    aria-label={`Close ${session.definition.title}`}
                    title="Close terminal"
                    onClick={() => onClose(session.id)}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <footer className="terminal-navigator__footer">
        <span>{visibleIds.length} visible</span>
        <span>{TERMINAL_LAYOUT_CAPACITY[layoutMode]} pane capacity</span>
      </footer>
    </aside>
  )
}
