import { useCallback, useEffect } from 'react'
import type { UpdateCheckResult } from '@shared/contracts/updates'
import { useUpdatesStore } from '../store/updatesStore'

export interface UpdatesController {
  readonly available: UpdateCheckResult | null
  /** Opens the release page Main minted. No URL travels from here. */
  readonly openRelease: () => Promise<void>
  /** Persists the skip through the settings patch API, then hides the banner. */
  readonly skipVersion: (version: string) => Promise<void>
  /** "Later" — hides the banner for this run only. */
  readonly dismiss: () => void
}

/**
 * Owns the IPC side of the update banner: the subscription to the startup
 * notification and the two actions. The banner itself stays presentational.
 */
export const useUpdates = (): UpdatesController => {
  const available = useUpdatesStore((state) => state.available)
  const dismiss = useUpdatesStore((state) => state.dismiss)

  useEffect(() => {
    const unsubscribe = window.gitdeck.updates.onAvailable((result) => {
      useUpdatesStore.getState().setAvailable(result)
    })
    return unsubscribe
  }, [])

  const openRelease = useCallback(async () => {
    await window.gitdeck.updates.openRelease()
  }, [])

  const skipVersion = useCallback(async (version: string) => {
    await window.gitdeck.settings.update({ skippedUpdateVersion: version })
    useUpdatesStore.getState().dismiss()
  }, [])

  return { available, openRelease, skipVersion, dismiss }
}
