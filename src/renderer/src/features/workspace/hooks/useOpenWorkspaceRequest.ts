import { useCallback, useEffect, useRef } from 'react'
import { useTerminalStore } from '../../terminal/public'
import type { OpenWorkspaceController } from './useOpenWorkspace'

export interface UseOpenWorkspaceRequestOptions {
  /**
   * Requests wait here until session restore settles, so the open flow's
   * per-definition reuse finds the restored terminals instead of racing them.
   */
  readonly enabled: boolean
  readonly open: OpenWorkspaceController['open']
  /** Reveals the terminals section after a request lands. */
  readonly onOpened?: () => void
}

/**
 * A workspace shortcut's renderer half (Phase 19).
 *
 * Two sources feed it: the launch argument, pulled exactly once when
 * `enabled` flips true, and pushes forwarded from a second instance. Every
 * id lands in the same handler: switch to Grid, then hand it to
 * `useOpenWorkspace.open` — whose per-definition reuse is what turns the
 * already-restored-workspace case into zero new terminals plus focus.
 * Startup commands run: double-clicking a shortcut is as explicit a consent
 * as clicking Open.
 */
export const useOpenWorkspaceRequest = ({
  enabled,
  open,
  onOpened
}: UseOpenWorkspaceRequestOptions): void => {
  const queueRef = useRef<string[]>([])
  const pulledRef = useRef(false)
  const enabledRef = useRef(enabled)
  const openRef = useRef(open)
  const onOpenedRef = useRef(onOpened)
  useEffect(() => {
    enabledRef.current = enabled
    openRef.current = open
    onOpenedRef.current = onOpened
  })

  const handle = useCallback(async (workspaceId: string): Promise<void> => {
    useTerminalStore.getState().setLayoutMode('grid')
    const opened = await openRef.current(workspaceId, { runStartupCommands: true })
    if (opened) onOpenedRef.current?.()
  }, [])

  useEffect(() => {
    const off = window.gitdeck.workspace.onOpenWorkspace(({ workspaceId }) => {
      if (enabledRef.current) void handle(workspaceId)
      else queueRef.current.push(workspaceId)
    })
    return off
  }, [handle])

  useEffect(() => {
    if (!enabled) return

    void (async () => {
      const queued = [...queueRef.current]
      queueRef.current = []
      for (const workspaceId of queued) await handle(workspaceId)

      if (pulledRef.current) return
      pulledRef.current = true
      const pending = await window.gitdeck.workspace.pendingOpenWorkspace()
      if (pending.ok && pending.value) await handle(pending.value)
    })()
  }, [enabled, handle])
}
