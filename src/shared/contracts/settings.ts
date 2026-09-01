import type { ShellProfileId } from './terminal'

/**
 * Persisted user preferences.
 *
 * `version` exists from the first release so a later shape change has something
 * to migrate from (ARCHITECTURE.md §5). Fields are added by the phase that
 * needs them — an unknown or missing field is defaulted on load, so adding one
 * is not a migration.
 *
 * Kept flat on purpose. `PLAN.md` sketched nested `terminal.*` and `behavior.*`
 * groups, but with a handful of fields that would only mean more shapes to
 * validate.
 */
export interface AppSettings {
  readonly version: 1

  /** Phase 5. `null` until the user picks one; may name a shell since uninstalled. */
  readonly defaultShellProfileId: ShellProfileId | null

  /**
   * Phase 7 writes it, Phase 8 restores from it. May name a workspace that has
   * since been deleted, so a reader must tolerate a miss.
   */
  readonly activeWorkspaceId: string | null

  /**
   * Phase 8. Which terminal *definition* the user was last looking at — not a
   * session id, which would be meaningless after a restart.
   */
  readonly activeTerminalDefinitionId: string | null

  /** Phase 8. Reopen the last workspace at startup. */
  readonly restoreLastWorkspace: boolean

  /**
   * Phase 8, and off by default on purpose.
   *
   * Opening a workspace by hand is consent to run its startup commands. Being
   * *restored into* one at launch is not: re-running yesterday's `npm run
   * deploy` because the app happened to start is an unacceptable outcome.
   */
  readonly runStartupCommandsOnRestore: boolean

  /** Phase 10. Terminal font size in pixels, clamped to a legible range. */
  readonly terminalFontSize: number

  /** Phase 10. */
  readonly terminalCursorBlink: boolean

  /**
   * Phase 10. Ask before closing a tab whose process is still running.
   *
   * On by default: closing a tab kills its shell, and the work in it is the
   * user's, not ours.
   */
  readonly confirmBeforeClosingRunningTerminal: boolean
}

export type AppSettingsPatch = Partial<Omit<AppSettings, 'version'>>

/** Below 8 is unreadable, above 32 fits almost nothing on screen. */
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 32

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  defaultShellProfileId: null,
  activeWorkspaceId: null,
  activeTerminalDefinitionId: null,
  restoreLastWorkspace: true,
  runStartupCommandsOnRestore: false,
  terminalFontSize: 14,
  terminalCursorBlink: true,
  confirmBeforeClosingRunningTerminal: true
}

export const isValidFontSize = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= MIN_FONT_SIZE &&
  value <= MAX_FONT_SIZE
