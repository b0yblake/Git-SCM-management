import { applyPatch, type AppSettings, type AppSettingsPatch } from '../domain/AppSettings'
import type { SettingsStore } from '../domain/SettingsStore'

/**
 * Reads settings once at construction and keeps them in memory, so a hot path
 * like opening a terminal never touches the disk.
 */
export class SettingsService {
  readonly #store: SettingsStore
  #settings: AppSettings

  constructor(store: SettingsStore) {
    this.#store = store
    this.#settings = store.read()
  }

  get(): AppSettings {
    return this.#settings
  }

  update(patch: AppSettingsPatch): AppSettings {
    this.#settings = applyPatch(this.#settings, patch)
    this.#store.write(this.#settings)
    return this.#settings
  }
}
