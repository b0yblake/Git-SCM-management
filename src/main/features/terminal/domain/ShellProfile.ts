import type { ShellProfileId } from '@shared/contracts/terminal'

export type { ShellProfileId }
export { isShellProfileId, SHELL_PROFILE_IDS } from '@shared/contracts/terminal'

/** How to actually launch a shell. Main-side only — never crosses IPC. */
export interface ShellCommand {
  readonly file: string
  readonly args: readonly string[]
}

/**
 * A shell that is installed on this machine.
 *
 * `file` is a real filesystem path, which is exactly why the renderer receives
 * `AvailableShellProfile` (id + label) instead of this.
 */
export interface ShellProfile extends ShellCommand {
  readonly id: ShellProfileId
  readonly label: string
}

/**
 * Resolves a profile id to a launch command, and reports what is installed.
 *
 * Nothing outside infrastructure knows how the list was produced — that is what
 * keeps shell discovery out of the UI.
 */
export interface ShellRegistry {
  available(): readonly ShellProfile[]
  has(id: ShellProfileId): boolean
  /** @throws ShellNotFoundError when the profile is unknown or not installed. */
  resolve(id: ShellProfileId): ShellCommand
}
