import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import { TerminalView } from './TerminalView'

export interface TerminalPaneProps {
  readonly session: TerminalSessionInfo
  readonly paneNumber: number
  readonly shellLabel: string
  readonly isActive: boolean
  readonly isVisible: boolean
  /** True while this pane fills the canvas alone, in Focus mode. */
  readonly isMaximized: boolean
  readonly fontSize: number
  readonly cursorBlink: boolean
  readonly onActivate: () => void
  readonly onRename: () => void
  readonly onDuplicate: () => void
  readonly onPark: () => void
  readonly onToggleMaximize: () => void
  readonly onClose: () => void
}

export const TerminalPane = ({
  session,
  paneNumber,
  shellLabel,
  isActive,
  isVisible,
  isMaximized,
  fontSize,
  cursorBlink,
  onActivate,
  onRename,
  onDuplicate,
  onPark,
  onToggleMaximize,
  onClose
}: TerminalPaneProps): React.JSX.Element => (
  <section
    className={`terminal-pane${isActive ? ' terminal-pane--active' : ''}`}
    aria-label={`${session.definition.title} terminal pane`}
    onMouseDown={onActivate}
  >
    <header className="terminal-pane__header">
      <div className="terminal-pane__identity">
        <span
          className={`terminal-status terminal-status--${session.status}`}
          aria-label={session.status}
        />
        <strong>
          {paneNumber}. {session.definition.title}
        </strong>
        <span>{shellLabel}</span>
        <span className="terminal-pane__cwd" title={session.definition.cwd}>
          {session.definition.cwd}
        </span>
      </div>
      <div className="terminal-pane__actions">
        <button
          type="button"
          aria-label={`Duplicate ${session.definition.title}`}
          title="Duplicate"
          onClick={onDuplicate}
        >
          +
        </button>
        <button
          type="button"
          aria-label={
            isMaximized
              ? `Restore ${session.definition.title}`
              : `Focus ${session.definition.title}`
          }
          title={isMaximized ? 'Restore layout' : 'Focus pane'}
          aria-pressed={isMaximized}
          onClick={onToggleMaximize}
        >
          {isMaximized ? '↙' : '↗'}
        </button>
        <button
          type="button"
          aria-label={`Park ${session.definition.title}`}
          title="Remove from layout"
          onClick={onPark}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Close ${session.definition.title}`}
          title="Close terminal"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </header>
    <TerminalView
      sessionId={session.id}
      isActive={isActive}
      isVisible={isVisible}
      fontSize={fontSize}
      cursorBlink={cursorBlink}
      onRename={onRename}
      onDuplicate={onDuplicate}
      onClose={onClose}
    />
  </section>
)
