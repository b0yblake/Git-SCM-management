import { useEffect } from 'react'

export interface TerminalShortcutHandlers {
  readonly onCreate: () => void
  readonly onCloseActive: () => void
  readonly onNext: () => void
  readonly onPrevious: () => void
}

/**
 * The MVP shortcut set (PLAN.md §17).
 *
 * `Ctrl+Shift+P` is deliberately absent: it is reserved for the command palette
 * and must keep doing nothing until that feature is scoped.
 *
 * Listens on `window` in the capture phase, because xterm swallows most keys
 * once the terminal has focus.
 */
export const useTerminalShortcuts = ({
  onCreate,
  onCloseActive,
  onNext,
  onPrevious
}: TerminalShortcutHandlers): void => {
  useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return

      if (event.key === 'Tab') {
        event.preventDefault()
        if (event.shiftKey) onPrevious()
        else onNext()
        return
      }

      if (event.shiftKey) return

      const key = event.key.toLowerCase()
      if (key === 't') {
        event.preventDefault()
        onCreate()
      } else if (key === 'w') {
        event.preventDefault()
        onCloseActive()
      }
    }

    window.addEventListener('keydown', handle, { capture: true })
    return () => {
      window.removeEventListener('keydown', handle, { capture: true })
    }
  }, [onCreate, onCloseActive, onNext, onPrevious])
}
