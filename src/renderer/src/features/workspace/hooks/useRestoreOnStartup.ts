import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '@shared/contracts/settings'
import { useTerminalStore } from '../../terminal/public'
import type { OpenWorkspaceController } from './useOpenWorkspace'

export type RestoreStatus = 'pending' | 'settled'

export interface RestoreController {
  readonly status: RestoreStatus
  /** True when a saved workspace was reopened, as opposed to a plain shell. */
  readonly restoredWorkspace: boolean
}

/**
 * Decides what the app shows when it launches.
 *
 * Restore rebuilds terminal **definitions**, never process state: closing
 * GitDeck stops its shells, and no promise is made otherwise. Keeping that line
 * visible is the whole reason this is its own hook — "restore my terminals"
 * turns into a daemon architecture the moment it stops being explicit.
 *
 * It also owns the "never a blank window" fallback. A fresh interactive shell
 * is not a restore, so opening one when there is nothing to restore does not
 * cross the line above.
 */
export const useRestoreOnStartup = (
  open: OpenWorkspaceController['open']
): RestoreController => {
  const [status, setStatus] = useState<RestoreStatus>('pending')
  const [restoredWorkspace, setRestoredWorkspace] = useState(false)

  // Load-bearing: opening is asynchronous, so a re-render landing before it
  // resolves would still see an empty store and start everything again. This
  // is the bug Phase 4 shipped and Phase 5 found by running the app.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      try {
        setRestoredWorkspace(await restore(open))
      } finally {
        // A shell of last resort, so the window is never blank — including when
        // restore failed, which must not turn into a dialog loop.
        if (useTerminalStore.getState().order.length === 0) await openPlainTerminal()
        setStatus('settled')
      }
    })()
  }, [open])

  return { status, restoredWorkspace }
}

const restore = async (open: OpenWorkspaceController['open']): Promise<boolean> => {
  const result = await window.gitdeck.settings.get()
  // A settings file that cannot be read is already defaulted in Main, so this
  // only fails if the channel itself did. Starting plain is the safe answer.
  if (!result.ok) return false

  const settings: AppSettings = result.value
  if (!settings.restoreLastWorkspace) return false
  if (!settings.activeWorkspaceId) return false

  await open(settings.activeWorkspaceId, {
    // The guard this phase exists for.
    runStartupCommands: settings.runStartupCommandsOnRestore,
    ...(settings.activeTerminalDefinitionId
      ? { focusDefinitionId: settings.activeTerminalDefinitionId }
      : {})
  })

  // The workspace may have been deleted, or every definition may have failed.
  return useTerminalStore.getState().order.length > 0
}

const openPlainTerminal = async (): Promise<void> => {
  const created = await window.gitdeck.terminal.create({})
  if (created.ok) useTerminalStore.getState().addSession(created.value)
}
