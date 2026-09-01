import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IpcError } from '@shared/contracts/ipc'
import { useToastStore } from '../../../shared/store/toastStore'
import { useTerminalStore } from '../../terminal/public'
import { useWorkspaceStore, type OpenNotice } from '../store/workspaceStore'

export interface OpenWorkspaceOptions {
  /**
   * Whether the workspace's startup commands are run.
   *
   * Opening a workspace by hand is consent to run them — that is the feature.
   * Being restored into one at launch is not, which is why Phase 8 gates the
   * restore path behind a setting that defaults to off.
   */
  readonly runStartupCommands?: boolean
  /** Which definition to focus. Defaults to the workspace's own choice. */
  readonly focusDefinitionId?: string
}

export interface OpenWorkspaceController {
  readonly open: (workspaceId: string, options?: OpenWorkspaceOptions) => Promise<void>
  readonly isOpening: boolean
  readonly notices: readonly OpenNotice[]
  readonly lastError: IpcError | null
}

/**
 * Turns N stored terminal definitions into N live sessions.
 *
 * This is the one place where the workspace feature touches the terminal
 * feature, and it does so through its public surface only.
 */
export const useOpenWorkspace = (): OpenWorkspaceController => {
  const notices = useWorkspaceStore((state) => state.openNotices)
  const [lastError, setLastError] = useState<IpcError | null>(null)
  const [isOpening, setIsOpening] = useState(false)
  const lastPersistedFocus = useRef<string | null>(null)

  // Only the terminal store knows when a session goes away, and two things
  // depend on that: a closed tab must not leave its binding behind, and the
  // tab the user is looking at is what restore puts them back on.
  useEffect(
    () =>
      useTerminalStore.subscribe((state) => {
        const store = useWorkspaceStore.getState()
        store.retainBindings(state.order)

        const focused =
          Object.entries(useWorkspaceStore.getState().bindings).find(
            ([, sessionId]) => sessionId === state.activeSessionId
          )?.[0] ?? null

        if (focused === null || focused === lastPersistedFocus.current) return
        lastPersistedFocus.current = focused
        void window.gitdeck.settings.update({ activeTerminalDefinitionId: focused })
      }),
    []
  )

  const open = useCallback(async (workspaceId: string, options: OpenWorkspaceOptions = {}) => {
    // Documented rule: re-opening the workspace that is already open does
    // nothing. Spawning a second copy of every terminal is never what the user
    // meant by clicking it again.
    if (useWorkspaceStore.getState().activeWorkspaceId === workspaceId) return

    const runStartupCommands = options.runStartupCommands ?? true

    setIsOpening(true)
    try {
      const loaded = await window.gitdeck.workspace.get(workspaceId)
      if (!loaded.ok) {
        setLastError(loaded.error)
        useToastStore.getState().push('error', loaded.error.message)
        return
      }
      const workspace = loaded.value
      setLastError(null)

      const opened: Array<readonly [string, string]> = []
      const found: OpenNotice[] = []

      // Sequential, so the tabs land in definition order.
      for (const definition of workspace.terminals) {
        const created = await window.gitdeck.terminal.create({
          cwd: definition.cwd,
          shellProfileId: definition.shellProfileId,
          title: definition.title,
          ...(definition.startupCommand === undefined
            ? {}
            : { startupCommand: definition.startupCommand })
        })

        if (!created.ok) {
          // One missing shell must not cost the user the rest of the workspace.
          found.push({
            definitionId: definition.id,
            title: definition.title,
            severity: 'error',
            message: created.error.message
          })
          continue
        }

        useTerminalStore.getState().addSession(created.value)
        opened.push([definition.id, created.value.id])

        // Main falls back when the saved directory is gone; the only way to
        // know it happened is that what came back is not what was asked for.
        if (created.value.definition.cwd !== definition.cwd) {
          found.push({
            definitionId: definition.id,
            title: definition.title,
            severity: 'warning',
            message: `${definition.cwd} no longer exists — opened in ${created.value.definition.cwd}`
          })
        }

        if (runStartupCommands && definition.startupCommand) {
          window.gitdeck.terminal.write(created.value.id, `${definition.startupCommand}\r`)
        }
      }

      const store = useWorkspaceStore.getState()
      for (const [definitionId, sessionId] of opened) store.bind(definitionId, sessionId)
      store.setOpenNotices(found)
      store.setActiveWorkspaceId(workspaceId)

      // Where the user was, else the workspace's own choice, else the first
      // definition — never whichever happened to be created last.
      const focus =
        opened.find(([definitionId]) => definitionId === options.focusDefinitionId)?.[1] ??
        opened.find(([definitionId]) => definitionId === workspace.activeTerminalId)?.[1] ??
        opened[0]?.[1]
      if (focus) useTerminalStore.getState().setActive(focus)

      void window.gitdeck.settings.update({ activeWorkspaceId: workspaceId })
    } finally {
      setIsOpening(false)
    }
  }, [])

  return useMemo(
    () => ({ open, isOpening, notices, lastError }),
    [open, isOpening, notices, lastError]
  )
}
