import { DEFAULT_SETTINGS, type AppSettings } from '../domain/AppSettings'
import type { SettingsStore } from '../domain/SettingsStore'

export interface InMemorySettingsStore extends SettingsStore {
  readonly writes: AppSettings[]
  /** Simulates a restart: the next service reads what was last written. */
  current(): AppSettings
}

export const createInMemorySettingsStore = (
  initial: AppSettings = DEFAULT_SETTINGS
): InMemorySettingsStore => {
  let settings = initial
  const writes: AppSettings[] = []

  return {
    writes,
    current: () => settings,
    read: () => settings,
    write: (next) => {
      settings = next
      writes.push(next)
    }
  }
}
