import { useCallback, useEffect, useState } from 'react'
import type { AvailableShellProfile, ShellProfileId } from '@shared/contracts/terminal'

export interface ShellProfilesState {
  readonly profiles: readonly AvailableShellProfile[]
  readonly defaultShellProfileId: ShellProfileId | null
  readonly setDefault: (id: ShellProfileId) => Promise<void>
}

/**
 * The installed shells and the user's default, both fetched from Main.
 *
 * The renderer never computes this list — it only renders what detection
 * reported, which is what keeps shell discovery out of the UI.
 */
export const useShellProfiles = (): ShellProfilesState => {
  const [profiles, setProfiles] = useState<readonly AvailableShellProfile[]>([])
  const [defaultShellProfileId, setDefaultShellProfileId] = useState<ShellProfileId | null>(null)

  useEffect(() => {
    let cancelled = false

    void Promise.all([window.gitdeck.terminal.profiles(), window.gitdeck.settings.get()]).then(
      ([profilesResult, settingsResult]) => {
        if (cancelled) return
        if (profilesResult.ok) setProfiles(profilesResult.value)
        if (settingsResult.ok) setDefaultShellProfileId(settingsResult.value.defaultShellProfileId)
      }
    )

    return () => {
      cancelled = true
    }
  }, [])

  const setDefault = useCallback(async (id: ShellProfileId) => {
    const result = await window.gitdeck.settings.update({ defaultShellProfileId: id })
    if (result.ok) setDefaultShellProfileId(result.value.defaultShellProfileId)
  }, [])

  return { profiles, defaultShellProfileId, setDefault }
}
