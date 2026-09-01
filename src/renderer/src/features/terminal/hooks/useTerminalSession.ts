import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_TERMINAL_DIMENSION } from '@shared/contracts/ipc'

export type TerminalViewStatus = 'running' | 'exited'

export interface UseTerminalSessionOptions {
  readonly sessionId: string
  /** Called for every byte the PTY produces for this session. */
  readonly onOutput: (data: string) => void
}

export interface TerminalSessionHandle {
  readonly status: TerminalViewStatus
  readonly exitCode: number | null
  /** Stable across renders, so a mount-once effect can hold on to it. */
  readonly sendInput: (data: string) => void
  readonly sendResize: (cols: number, rows: number) => void
}

interface SessionState {
  readonly sessionId: string
  readonly status: TerminalViewStatus
  readonly exitCode: number | null
}

const freshState = (sessionId: string): SessionState => ({
  sessionId,
  status: 'running',
  exitCode: null
})

const isValidDimension = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= MAX_TERMINAL_DIMENSION

/**
 * Owns everything the terminal feature knows about one live session: the two
 * IPC subscriptions, input forwarding, resize hygiene, and exit status.
 *
 * Deliberately knows nothing about xterm.js — the view feeds output in through
 * `onOutput` and calls back through the returned handle. That keeps every rule
 * below testable without rendering anything.
 *
 * It never calls `kill`. Closing a view is not closing a terminal; only an
 * explicit user action ends a session, which is what makes hidden tabs
 * (Phase 4) and split panes possible.
 */
export const useTerminalSession = ({
  sessionId,
  onOutput
}: UseTerminalSessionOptions): TerminalSessionHandle => {
  const [state, setState] = useState<SessionState>(() => freshState(sessionId))

  // React's documented way to reset state when a prop changes: adjust during
  // render rather than in an effect, which would render the stale status first.
  if (state.sessionId !== sessionId) setState(freshState(sessionId))

  // Mirrors `status` for the stable callbacks below, which must not re-create
  // themselves every time the status changes.
  const statusRef = useRef<TerminalViewStatus>('running')
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const onOutputRef = useRef(onOutput)

  useEffect(() => {
    onOutputRef.current = onOutput
  })

  useEffect(() => {
    statusRef.current = 'running'
    lastSizeRef.current = null

    const offData = window.gitdeck.terminal.onData((event) => {
      if (event.sessionId !== sessionId) return
      onOutputRef.current(event.data)
    })

    const offExit = window.gitdeck.terminal.onExit((event) => {
      if (event.sessionId !== sessionId) return
      statusRef.current = 'exited'
      setState({ sessionId, status: 'exited', exitCode: event.exitCode })
    })

    return () => {
      offData()
      offExit()
    }
  }, [sessionId])

  const sendInput = useCallback(
    (data: string) => {
      if (statusRef.current !== 'running') return
      window.gitdeck.terminal.write(sessionId, data)
    },
    [sessionId]
  )

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      if (statusRef.current !== 'running') return
      if (!isValidDimension(cols) || !isValidDimension(rows)) return

      // A drag fires the observer per pixel, but the PTY only cares about whole
      // cells. Sending only on a real change is the throttle.
      const last = lastSizeRef.current
      if (last && last.cols === cols && last.rows === rows) return
      lastSizeRef.current = { cols, rows }

      window.gitdeck.terminal.resize(sessionId, cols, rows)
    },
    [sessionId]
  )

  return { status: state.status, exitCode: state.exitCode, sendInput, sendResize }
}
