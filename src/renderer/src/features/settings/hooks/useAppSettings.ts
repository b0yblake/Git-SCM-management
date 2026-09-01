import { useCallback, useEffect, useMemo } from 'react'
import type { AppSettings, AppSettingsPatch } from '@shared/contracts/settings'
import { useSettingsStore } from '../store/settingsStore'

export interface AppSettingsController {
  readonly settings: AppSettings
  readonly update: (patch: AppSettingsPatch) => Promise<void>
}

/**
 * The user's preferences, shared by every caller.
 *
 * Backed by a store rather than local state: the settings screen and the
 * terminal both read them, and two copies meant a change took effect in one
 * place and not the other until the app restarted.
 */
export const useAppSettings = (): AppSettingsController => {
  const settings = useSettingsStore((state) => state.settings)

  useEffect(() => {
    let cancelled = false

    void window.gitdeck.settings.get().then((result) => {
      if (!cancelled && result.ok) useSettingsStore.getState().setSettings(result.value)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback(async (patch: AppSettingsPatch) => {
    const result = await window.gitdeck.settings.update(patch)
    // Main answers with the whole normalised object, so the store never holds a
    // value Main would not have accepted.
    if (result.ok) useSettingsStore.getState().setSettings(result.value)
  }, [])

  return useMemo(() => ({ settings, update }), [settings, update])
}
