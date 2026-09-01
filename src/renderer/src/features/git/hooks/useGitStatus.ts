import { useEffect } from 'react'
import { useTerminalStore } from '../../terminal/public'
import { useGitStore } from '../store/gitStore'

/** How often a repository is re-checked while the user stays on one terminal. */
export const GIT_POLL_MS = 5_000

/**
 * Keeps the Git badge pointed at the active terminal's directory.
 *
 * The directory is the one the terminal was *spawned* in: the renderer cannot
 * see where the shell has since `cd`-ed to without parsing its output, which
 * this phase deliberately does not do. That is the "where possible" in the
 * plan's "refresh on cwd change".
 *
 * Main collapses bursts, so refreshing on every focus change costs nothing.
 */
export const useGitStatus = (): void => {
  const activeSessionId = useTerminalStore((state) => state.activeSessionId)
  const sessions = useTerminalStore((state) => state.sessions)
  const cwd = activeSessionId ? (sessions[activeSessionId]?.definition.cwd ?? null) : null

  useEffect(() => {
    if (cwd === null) {
      // Nothing is focused, so there is nothing to poll for.
      useGitStore.getState().clear()
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = async (): Promise<void> => {
      const result = await window.gitdeck.git.inspect(cwd)
      if (cancelled) return

      // A rejected inspect is still "nothing to show" — never a message.
      const status = result.ok ? result.value : null
      useGitStore.getState().setStatus(cwd, status)

      // Re-armed only while there is a repository to watch. Polling a plain
      // directory would spawn a `git` process every few seconds forever, for an
      // answer that cannot change without the focused terminal changing too —
      // and that starts this effect again.
      if (status !== null) timer = setTimeout(() => void refresh(), GIT_POLL_MS)
    }

    void refresh()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cwd])
}
