import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IpcError } from '@shared/contracts/ipc'
import type { ShellProfileId } from '@shared/contracts/terminal'
import { useToastStore } from '../../../shared/store/toastStore'
import { useTerminalStore } from '../store/terminalStore'

/** A close waiting on the user's answer. Null when nothing is being asked. */
export interface PendingClose {
  readonly sessionId: string
  readonly title: string
}

export interface TerminalTabsController {
  readonly openTerminal: (shellProfileId?: ShellProfileId) => Promise<void>
  /** Duplicating reuses an existing session's definition — no new IPC channel. */
  readonly duplicateTerminal: (sessionId: string) => Promise<void>
  /** May open a confirmation instead of closing, depending on settings. */
  readonly closeTerminal: (sessionId: string) => Promise<void>
  readonly closeActiveTerminal: () => Promise<void>
  readonly pendingClose: PendingClose | null
  readonly confirmPendingClose: () => Promise<void>
  readonly cancelPendingClose: () => void
  readonly activateNext: () => void
  readonly activatePrevious: () => void
  readonly isOpening: boolean
  readonly lastError: IpcError | null
}

export interface TerminalTabsOptions {
  /** From settings. Closing kills a shell, so this defaults on. */
  readonly confirmBeforeClosingRunningTerminal?: boolean
}

/**
 * Turns tab intents into IPC calls and store updates.
 *
 * The bridge is used here rather than in components, so a component test can
 * assert the bridge was never touched — see `TerminalTabBar.spec.tsx`.
 */
export const useTerminalTabs = ({
  confirmBeforeClosingRunningTerminal = true
}: TerminalTabsOptions = {}): TerminalTabsController => {
  const [lastError, setLastError] = useState<IpcError | null>(null)
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null)
  const [isOpening, setIsOpening] = useState(false)

  // Sessions can die on their own; the tab must show that without closing.
  useEffect(() => {
    const off = window.gitdeck.terminal.onExit((event) => {
      useTerminalStore.getState().markExited(event.sessionId, event.exitCode)
    })
    return off
  }, [])

  const fail = useCallback((error: IpcError) => {
    setLastError(error)
    // Errors used to render inline under the tab strip, where they were easy to
    // miss and stayed forever. A toast is seen and then goes away.
    useToastStore.getState().push('error', error.message)
  }, [])

  const create = useCallback(
    async (request: Parameters<Window['gitdeck']['terminal']['create']>[0]) => {
      setIsOpening(true)
      try {
        const result = await window.gitdeck.terminal.create(request)
        if (result.ok) {
          useTerminalStore.getState().addSession(result.value)
          setLastError(null)
        } else {
          fail(result.error)
        }
      } finally {
        setIsOpening(false)
      }
    },
    [fail]
  )

  const openTerminal = useCallback(
    (shellProfileId?: ShellProfileId) =>
      create(shellProfileId === undefined ? {} : { shellProfileId }),
    [create]
  )

  /**
   * Opens a second terminal from the same definition. It is a plain `create`
   * with the fields the original was given — this phase adds no capability that
   * did not already exist.
   */
  const duplicateTerminal = useCallback(
    async (sessionId: string) => {
      const session = useTerminalStore.getState().sessions[sessionId]
      if (!session) return

      const { title, cwd, shellProfileId } = session.definition
      // Deliberately not the startup command: duplicating a tab is not consent
      // to run a command again, for the same reason restore is not (Phase 8).
      await create({ title, cwd, shellProfileId })
    },
    [create]
  )

  const forceClose = useCallback(
    async (sessionId: string) => {
      const session = useTerminalStore.getState().sessions[sessionId]
      if (!session) return

      if (session.status === 'running') {
        const result = await window.gitdeck.terminal.kill(sessionId)
        if (!result.ok) {
          fail(result.error)
          return
        }
      }

      useTerminalStore.getState().removeSession(sessionId)
    },
    [fail]
  )

  const closeTerminal = useCallback(
    async (sessionId: string) => {
      const session = useTerminalStore.getState().sessions[sessionId]
      if (!session) return

      // Only a live process is worth interrupting the user for, and only when
      // they have asked to be interrupted.
      if (session.status === 'running' && confirmBeforeClosingRunningTerminal) {
        setPendingClose({ sessionId, title: session.definition.title })
        return
      }

      await forceClose(sessionId)
    },
    [confirmBeforeClosingRunningTerminal, forceClose]
  )

  const confirmPendingClose = useCallback(async () => {
    if (!pendingClose) return
    const { sessionId } = pendingClose
    setPendingClose(null)
    await forceClose(sessionId)
  }, [pendingClose, forceClose])

  const cancelPendingClose = useCallback(() => setPendingClose(null), [])

  const closeActiveTerminal = useCallback(async () => {
    const { activeSessionId } = useTerminalStore.getState()
    if (activeSessionId) await closeTerminal(activeSessionId)
  }, [closeTerminal])

  const step = useCallback((delta: number) => {
    const { order, activeSessionId, setActive } = useTerminalStore.getState()
    if (order.length < 2 || !activeSessionId) return

    const index = order.indexOf(activeSessionId)
    if (index === -1) return

    // Wraps in both directions.
    const next = order[(index + delta + order.length) % order.length]
    if (next) setActive(next)
  }, [])

  const activateNext = useCallback(() => step(1), [step])
  const activatePrevious = useCallback(() => step(-1), [step])

  // Memoised so callers can depend on the controller itself. A fresh object
  // every render made an effect keyed on it fire repeatedly.
  return useMemo(
    () => ({
      openTerminal,
      duplicateTerminal,
      closeTerminal,
      closeActiveTerminal,
      pendingClose,
      confirmPendingClose,
      cancelPendingClose,
      activateNext,
      activatePrevious,
      isOpening,
      lastError
    }),
    [
      openTerminal,
      duplicateTerminal,
      closeTerminal,
      closeActiveTerminal,
      pendingClose,
      confirmPendingClose,
      cancelPendingClose,
      activateNext,
      activatePrevious,
      isOpening,
      lastError
    ]
  )
}
