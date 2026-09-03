import { useCallback, useEffect, useRef } from 'react'
import { useTerminalStore } from '../store/terminalStore'

/**
 * Windows paths compare loosely: Explorer hands over whatever casing and
 * separators it has, while a restored definition holds whatever was saved.
 */
const normalizePath = (path: string): string =>
  path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

const folderName = (path: string): string =>
  path.split(/[\\/]/).filter(Boolean).pop() ?? path

export interface UseOpenPathOptions {
  /**
   * Requests wait here until session restore has settled, so a restored
   * terminal already sitting at the requested path is found and focused
   * instead of duplicated.
   */
  readonly enabled: boolean
  readonly openAt: (cwd: string, title: string) => Promise<void>
}

/**
 * Explorer's "Open in GitDeck" (Phase 18), renderer half.
 *
 * Two sources feed it: the launch argument, pulled exactly once when
 * `enabled` flips true, and pushes forwarded from a second instance while
 * the app runs. Every path lands in the same handler: switch to Grid, focus
 * a running terminal already at that path, or create one titled after the
 * folder.
 */
export const useOpenPath = ({ enabled, openAt }: UseOpenPathOptions): void => {
  const queueRef = useRef<string[]>([])
  const pulledRef = useRef(false)
  const enabledRef = useRef(enabled)
  const openAtRef = useRef(openAt)
  useEffect(() => {
    enabledRef.current = enabled
    openAtRef.current = openAt
  })

  const handle = useCallback(async (path: string): Promise<void> => {
    const store = useTerminalStore.getState()
    // Grid first: the requested terminal must land on (or already be on) the
    // canvas with the most panes, whichever branch runs.
    store.setLayoutMode('grid')

    const target = normalizePath(path)
    const existing = Object.values(store.sessions).find(
      (session) =>
        session.status === 'running' && normalizePath(session.definition.cwd) === target
    )
    if (existing) {
      useTerminalStore.getState().setActive(existing.id)
      return
    }

    await openAtRef.current(path, folderName(path))
  }, [])

  useEffect(() => {
    const off = window.gitdeck.terminal.onOpenPath(({ path }) => {
      if (enabledRef.current) void handle(path)
      else queueRef.current.push(path)
    })
    return off
  }, [handle])

  useEffect(() => {
    if (!enabled) return

    void (async () => {
      // Sequentially, so two requests for the same folder cannot race each
      // other into two terminals.
      const queued = [...queueRef.current]
      queueRef.current = []
      for (const path of queued) await handle(path)

      if (pulledRef.current) return
      pulledRef.current = true
      const pending = await window.gitdeck.terminal.pendingOpenPath()
      if (pending.ok && pending.value) await handle(pending.value)
    })()
  }, [enabled, handle])
}
