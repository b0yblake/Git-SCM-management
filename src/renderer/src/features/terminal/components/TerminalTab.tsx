import { useEffect, useRef, useState } from 'react'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'

export interface TerminalTabProps {
  readonly session: TerminalSessionInfo
  readonly isActive: boolean
  /**
   * Controlled by the parent so the context menu's "Rename tab" can start a
   * rename that began nowhere near this component.
   */
  readonly isRenaming: boolean
  readonly onActivate: (sessionId: string) => void
  readonly onClose: (sessionId: string) => void
  readonly onRename: (sessionId: string, title: string) => void
  readonly onRenamingChange: (sessionId: string | null) => void
}

/** One tab. Reports intents upward; performs none of them itself. */
export const TerminalTab = ({
  session,
  isActive,
  isRenaming,
  onActivate,
  onClose,
  onRename,
  onRenamingChange
}: TerminalTabProps): React.JSX.Element => {
  const [draft, setDraft] = useState('')
  const [wasRenaming, setWasRenaming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // React's documented render-time adjustment rather than an effect: an effect
  // would render one frame of an empty input first, and the compiler's
  // set-state-in-effect rule rejects it outright.
  if (isRenaming !== wasRenaming) {
    setWasRenaming(isRenaming)
    if (isRenaming) setDraft(session.definition.title)
  }

  useEffect(() => {
    if (isRenaming) inputRef.current?.select()
  }, [isRenaming])

  const commit = (): void => {
    const title = draft.trim()
    if (title) onRename(session.id, title)
    onRenamingChange(null)
  }

  return (
    <div
      className={[
        'terminal-tab',
        isActive && 'terminal-tab--active',
        session.status === 'exited' && 'terminal-tab--exited'
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!isRenaming ? (
        <button
          type="button"
          className="terminal-tab__label"
          aria-current={isActive}
          // Stated explicitly so the status is announced, rather than left to
          // the accessible-name calculation to glue the badge on.
          aria-label={
            session.status === 'exited'
              ? `${session.definition.title} (exited)`
              : session.definition.title
          }
          onClick={() => onActivate(session.id)}
          onDoubleClick={() => onRenamingChange(session.id)}
        >
          {session.definition.title}
          {session.status === 'exited' && <span className="terminal-tab__badge"> (exited)</span>}
        </button>
      ) : (
        <input
          ref={inputRef}
          className="terminal-tab__input"
          aria-label={`Rename ${session.definition.title}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') onRenamingChange(null)
          }}
        />
      )}

      <button
        type="button"
        className="terminal-tab__close"
        aria-label={`Close ${session.definition.title}`}
        onClick={() => onClose(session.id)}
      >
        ×
      </button>
    </div>
  )
}
