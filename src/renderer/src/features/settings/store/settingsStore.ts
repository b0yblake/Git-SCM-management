import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/contracts/settings'

/**
 * One copy of the user's preferences for the whole window.
 *
 * It is a store rather than component state because more than one place reads
 * them: the settings screen writes the font size, and the terminal has to
 * redraw at it. With a `useState` per hook instance those were two independent
 * copies, and a change reached the terminal only after a restart.
 */
export interface SettingsUiState {
  readonly settings: AppSettings
}

export interface SettingsStore extends SettingsUiState {
  setSettings(settings: AppSettings): void
  reset(): void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  setSettings: (settings) => set({ settings }),
  reset: () => set({ settings: DEFAULT_SETTINGS })
}))
