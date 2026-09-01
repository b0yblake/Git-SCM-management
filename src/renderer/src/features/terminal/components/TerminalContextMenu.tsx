import { useEffect, useRef } from 'react'

/**
 * The six commands Phase 10 allows, in order. Exported so the spec can assert
 * the list rather than re-typing it — a seventh would have to be added here,
 * which is exactly what the test watches.
 */
export const TERMINAL_MENU_COMMANDS = [
  'Copy',
  'Paste',
  'Clear',
  'Rename terminal',
  'Duplicate terminal',
  'Close terminal'
] as const

export type TerminalMenuCommand = (typeof TERMINAL_MENU_COMMANDS)[number]

export interface TerminalContextMenuProps {
  readonly x: number
  readonly y: number
  readonly onCommand: (command: TerminalMenuCommand) => void
  readonly onDismiss: () => void
}

/**
 * A right-click menu over a terminal.
 *
 * Every command maps to an action that already existed before this phase; none
 * of them reaches IPC directly, and none adds a channel. `Ctrl+Shift+P` stays
 * unclaimed — the command palette is post-MVP.
 */
export const TerminalContextMenu = ({
  x,
  y,
  onCommand,
  onDismiss
}: TerminalContextMenuProps): React.JSX.Element => {
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onDismiss])

  return (
    <div className="context-menu-backdrop" onMouseDown={onDismiss}>
      <menu
        className="context-menu"
        role="menu"
        style={{ left: x, top: y }}
        aria-label="Terminal actions"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {TERMINAL_MENU_COMMANDS.map((command, index) => (
          <li key={command} role="none">
            <button
              type="button"
              role="menuitem"
              ref={index === 0 ? firstRef : undefined}
              onClick={() => onCommand(command)}
            >
              {command}
            </button>
          </li>
        ))}
      </menu>
    </div>
  )
}
