import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { DEFAULT_SETTINGS } from '@shared/contracts/settings'
import { useTerminalSession } from '../hooks/useTerminalSession'
import { TerminalContextMenu, type TerminalMenuCommand } from './TerminalContextMenu'

export interface TerminalViewProps {
  readonly sessionId: string
  /**
   * A hidden panel has no layout, so xterm cannot measure itself and the
   * ResizeObserver never fires. Becoming visible must therefore re-fit
   * explicitly. Defaults to true for a single-terminal layout.
   */
  readonly isActive?: boolean
  /** From settings. Applied to a live terminal rather than rebuilding it. */
  readonly fontSize?: number
  readonly cursorBlink?: boolean
  /**
   * Context-menu commands the view cannot perform itself. Copy, Paste and Clear
   * act on the xterm instance, which never leaves this component.
   */
  readonly onRename?: () => void
  readonly onDuplicate?: () => void
  readonly onClose?: () => void
}

const THEME = {
  background: '#1e1e1e',
  foreground: '#e6e6e6',
  cursor: '#e6e6e6',
  selectionBackground: '#3a3d41'
} as const

/**
 * Renders one live terminal.
 *
 * The xterm instance lives in a ref, never in state or a store: it is not
 * serializable and re-creating it on render would drop the scrollback.
 *
 * Unmounting disposes xterm but does **not** kill the PTY — see
 * `useTerminalSession`.
 */
export const TerminalView = ({
  sessionId,
  isActive = true,
  fontSize = DEFAULT_SETTINGS.terminalFontSize,
  cursorBlink = DEFAULT_SETTINGS.terminalCursorBlink,
  onRename,
  onDuplicate,
  onClose
}: TerminalViewProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const syncSizeRef = useRef<(() => void) | null>(null)
  const disposedRef = useRef(false)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)

  const { status, exitCode, sendInput, sendResize } = useTerminalSession({
    sessionId,
    onOutput: (data) => {
      // Late bytes can arrive between dispose and unsubscribe; writing to a
      // disposed xterm throws.
      if (disposedRef.current) return
      terminalRef.current?.write(data)
    }
  })

  // `sendInput` and `sendResize` are stable per session, so this effect rebuilds
  // the terminal exactly when the session changes and never on a plain re-render.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    disposedRef.current = false

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink,
      fontFamily: 'Cascadia Mono, Consolas, Menlo, monospace',
      fontSize,
      scrollback: 5000,
      theme: THEME
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    terminalRef.current = terminal

    let pendingFrame: number | null = null

    const applyFit = (): void => {
      pendingFrame = null

      const dimensions = fitAddon.proposeDimensions()
      if (!dimensions) return

      const { cols, rows } = dimensions
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) return

      // Resizing xterm is what makes the observer fire again, so doing it when
      // nothing changed is how a feedback loop stays alive.
      if (cols === terminal.cols && rows === terminal.rows) return

      terminal.resize(cols, rows)
      sendResize(cols, rows)
    }

    /** Coalesces a burst of observer callbacks into one measurement per frame. */
    const syncSize = (): void => {
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
      pendingFrame = requestAnimationFrame(applyFit)
    }
    syncSizeRef.current = syncSize

    const offInput = terminal.onData((data) => {
      sendInput(data)
    })

    // Ctrl+C is SIGINT in a terminal, so copy/paste use the Ctrl+Shift pair.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !event.ctrlKey || !event.shiftKey) return true

      if (event.key === 'C') {
        const selection = terminal.getSelection()
        if (selection) void navigator.clipboard?.writeText(selection)
        return false
      }

      if (event.key === 'V') {
        void navigator.clipboard?.readText().then((text) => {
          if (text) sendInput(text)
        })
        return false
      }

      return true
    })

    const observer = new ResizeObserver(syncSize)
    observer.observe(container)
    syncSize()
    terminal.focus()

    return () => {
      disposedRef.current = true
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
      observer.disconnect()
      offInput.dispose()
      terminal.dispose()
      terminalRef.current = null
      syncSizeRef.current = null
    }
    // Font size and blink are applied to the live instance below; listing them
    // here would rebuild the terminal and drop every line of its scrollback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendInput, sendResize])

  // Applied in place, so changing the font keeps every line of history.
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    terminal.options.fontSize = fontSize
    terminal.options.cursorBlink = cursorBlink
    syncSizeRef.current?.()
  }, [fontSize, cursorBlink])

  // A panel that was hidden could not be measured while it was hidden, so its
  // dimensions are stale the moment it is shown again.
  useEffect(() => {
    if (!isActive) return
    syncSizeRef.current?.()
    terminalRef.current?.focus()
  }, [isActive])

  /**
   * Copy, Paste and Clear act on the xterm instance, which is why they live
   * here rather than in the menu: the instance is a ref and never leaves this
   * component. The other three are the caller's to perform.
   */
  const runCommand = (command: TerminalMenuCommand): void => {
    const terminal = terminalRef.current
    setMenuAt(null)

    switch (command) {
      case 'Copy': {
        const selection = terminal?.getSelection()
        if (selection) void navigator.clipboard?.writeText(selection)
        return
      }
      case 'Paste':
        void navigator.clipboard?.readText().then((text) => {
          if (text) sendInput(text)
        })
        return
      case 'Clear':
        terminal?.clear()
        return
      case 'Rename tab':
        onRename?.()
        return
      case 'Duplicate terminal':
        onDuplicate?.()
        return
      case 'Close terminal':
        onClose?.()
    }
  }

  return (
    <div
      className="terminal-view"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuAt({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className="terminal-view__surface" ref={containerRef} data-testid="terminal-surface" />
      {status === 'exited' && (
        <div className="terminal-view__exited" role="status">
          Process exited{exitCode === null ? '' : ` with code ${exitCode}`}.
        </div>
      )}
      {menuAt && (
        <TerminalContextMenu
          x={menuAt.x}
          y={menuAt.y}
          onCommand={runCommand}
          onDismiss={() => {
            setMenuAt(null)
            // Dismissing a menu should give the keyboard back to the shell.
            terminalRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
