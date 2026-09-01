import type { AppSettings } from './AppSettings'

/** Where settings live. Implemented by infrastructure; faked in tests. */
export interface SettingsStore {
  read(): AppSettings
  write(settings: AppSettings): void
}
