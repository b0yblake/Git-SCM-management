import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IpcError } from '@shared/contracts/ipc'
import type { TerminalDefinition, TerminalSessionInfo } from '@shared/contracts/terminal'
import { useToastStore } from '../../../shared/store/toastStore'
import { useTerminalStore } from '../../terminal/public'
import { useWorkspaceStore, type OpenNotice } from '../store/workspaceStore'

export interface OpenWorkspaceOptions {
  /**
   * Whether the workspace's startup commands are run.
   *
   * Opening a workspace by hand is consent to run them. Being restored into
   * one at launch is not, so the restore path gates this behind a setting.
   */
  readonly runStartupCommands?: boolean
  /** Which definition to focus. Defaults to the workspace's own choice. */
  readonly focusDefinitionId?: string
}

export interface OpenWorkspaceController {
  /** True when the workspace loaded, even when an individual terminal failed. */
  readonly open: (workspaceId: string, options?: OpenWorkspaceOptions) => Promise<boolean>
  readonly isOpening: boolean
  readonly openingWorkspaceId: string | null
  readonly notices: readonly OpenNotice[]
  readonly lastError: IpcError | null
}

const canReuse = (
  session: TerminalSessionInfo | undefined,
  definition: TerminalDefinition
): session is TerminalSessionInfo =>
  session !== undefined &&
  (session.status === 'running' || session.status === 'starting') &&
  session.definition.cwd === definition.cwd &&
  session.definition.shellProfileId === definition.shellProfileId &&
  session.definition.startupCommand === definition.startupCommand

/**
 * Turns stored terminal definitions into live sessions.
 *
 * Re-opening is idempotent: a definition reuses its still-running bound
 * session and only a missing, exited, or materially changed definition creates
 * a new PTY. Existing unrelated sessions are never killed.
 */
export const useOpenWorkspace = (): OpenWorkspaceController => {
  const notices = useWorkspaceStore((state) => state.openNotices)
  const [lastError, setLastError] = useState<IpcError | null>(null)
  const [openingWorkspaceId, setOpeningWorkspaceId] = useState<string | null>(null)
  const openingRef = useRef<string | null>(null)
  const lastPersistedSelection = useRef<string | null>(null)

  // Only the terminal store knows when a session goes away. Keep runtime
  // bindings pruned and remember both halves of the user's last workspace
  // selection whenever they focus one of its terminals.
  useEffect(
    () =>
      useTerminalStore.subscribe((state) => {
        const store = useWorkspaceStore.getState()
        store.retainBindings(state.order)

        const current = useWorkspaceStore.getState()
        const focusedDefinitionId = Object.entries(current.bindings).find(
          ([, sessionId]) => sessionId === state.activeSessionId
        )?.[0]
        if (!focusedDefinitionId) return

        const workspaceId = current.workspaceByDefinitionId[focusedDefinitionId]
        if (!workspaceId) return

        const selection = `${workspaceId}:${focusedDefinitionId}`
        if (selection === lastPersistedSelection.current) return
        lastPersistedSelection.current = selection

        current.setActiveWorkspaceId(workspaceId)
        void window.gitdeck.settings
          .update({
            activeWorkspaceId: workspaceId,
            activeTerminalDefinitionId: focusedDefinitionId
          })
          .then((remembered) => {
            if (!remembered.ok) useToastStore.getState().push('error', remembered.error.message)
          })
      }),
    []
  )

  const open = useCallback(
    async (workspaceId: string, options: OpenWorkspaceOptions = {}): Promise<boolean> => {
      // The buttons are disabled while opening, but this guard also protects
      // keyboard activation and callers outside the sidebar from double-spawn.
      if (openingRef.current !== null) return false
      openingRef.current = workspaceId
      setOpeningWorkspaceId(workspaceId)

      try {
        const loaded = await window.gitdeck.workspace.get(workspaceId)
        if (!loaded.ok) {
          setLastError(loaded.error)
          useToastStore.getState().push('error', loaded.error.message)
          return false
        }

        const workspace = loaded.value
        const runStartupCommands = options.runStartupCommands ?? true
        const opened: Array<readonly [string, string]> = []
        const found: OpenNotice[] = []

        // Sequential creation preserves definition order in the terminal deck.
        for (const definition of workspace.terminals) {
          const workspaceState = useWorkspaceStore.getState()
          const boundSessionId = workspaceState.bindings[definition.id]
          const belongsToWorkspace =
            workspaceState.workspaceByDefinitionId[definition.id] === workspaceId
          const boundSession = boundSessionId
            ? useTerminalStore.getState().sessions[boundSessionId]
            : undefined

          if (belongsToWorkspace && boundSessionId && canReuse(boundSession, definition)) {
            opened.push([definition.id, boundSessionId])
            continue
          }

          if (
            belongsToWorkspace &&
            boundSessionId &&
            boundSession &&
            (boundSession.status === 'exited' || boundSession.status === 'failed')
          ) {
            useTerminalStore.getState().removeSession(boundSessionId)
          }

          const created = await window.gitdeck.terminal.create({
            cwd: definition.cwd,
            shellProfileId: definition.shellProfileId,
            title: definition.title,
            ...(definition.startupCommand === undefined
              ? {}
              : { startupCommand: definition.startupCommand })
          })

          if (!created.ok) {
            found.push({
              definitionId: definition.id,
              title: definition.title,
              severity: 'error',
              message: created.error.message
            })
            continue
          }

          useTerminalStore.getState().addSession(created.value)
          useWorkspaceStore.getState().bind(workspaceId, definition.id, created.value.id)
          opened.push([definition.id, created.value.id])

          // Main falls back when a saved directory is gone; the returned cwd
          // is the reliable signal because the renderer cannot inspect paths.
          if (created.value.definition.cwd !== definition.cwd) {
            found.push({
              definitionId: definition.id,
              title: definition.title,
              severity: 'warning',
              message: `${definition.cwd} no longer exists — opened in ${created.value.definition.cwd}`
            })
          }

          // Reused sessions have already run their startup command. Only a
          // newly-created session may receive it here.
          if (runStartupCommands && definition.startupCommand) {
            window.gitdeck.terminal.write(created.value.id, `${definition.startupCommand}\r`)
          }
        }

        const store = useWorkspaceStore.getState()
        store.setOpenNotices(found)
        store.setActiveWorkspaceId(workspaceId)
        setLastError(null)

        const focused =
          opened.find(([definitionId]) => definitionId === options.focusDefinitionId) ??
          opened.find(([definitionId]) => definitionId === workspace.activeTerminalId) ??
          opened[0]
        const focusedDefinitionId = focused?.[0] ?? null
        const focusedSessionId = focused?.[1]

        if (focusedSessionId && focusedDefinitionId) {
          lastPersistedSelection.current = `${workspaceId}:${focusedDefinitionId}`
          useTerminalStore.getState().setActive(focusedSessionId)
        }

        const remembered = await window.gitdeck.settings.update({
          activeWorkspaceId: workspaceId,
          activeTerminalDefinitionId: focusedDefinitionId
        })
        if (!remembered.ok) useToastStore.getState().push('error', remembered.error.message)

        for (const notice of found) {
          useToastStore
            .getState()
            .push(notice.severity === 'error' ? 'error' : 'info', `${notice.title}: ${notice.message}`)
        }

        return true
      } finally {
        openingRef.current = null
        setOpeningWorkspaceId(null)
      }
    },
    []
  )

  return useMemo(
    () => ({
      open,
      isOpening: openingWorkspaceId !== null,
      openingWorkspaceId,
      notices,
      lastError
    }),
    [open, openingWorkspaceId, notices, lastError]
  )
}
