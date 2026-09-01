/**
 * The serializable terminal contract — everything that crosses the Main ↔
 * renderer boundary.
 *
 * It lives in `shared/` because the renderer may not import Main-process code
 * (ARCHITECTURE.md §2). Main's terminal domain re-exports these, so a feature
 * still imports them from `terminal/public`.
 *
 * Every type here must survive `structuredClone`: no classes, no functions, no
 * `Error` instances.
 */

export const SHELL_PROFILE_IDS = ['git-bash', 'powershell', 'pwsh', 'cmd', 'wsl'] as const

export type ShellProfileId = (typeof SHELL_PROFILE_IDS)[number]

export const isShellProfileId = (value: unknown): value is ShellProfileId =>
  typeof value === 'string' && (SHELL_PROFILE_IDS as readonly string[]).includes(value)

/**
 * A shell the renderer may offer.
 *
 * Carries no executable path on purpose: the picker must be able to render the
 * list without the renderer ever learning a filesystem path (ARCHITECTURE.md §3).
 */
export interface AvailableShellProfile {
  readonly id: ShellProfileId
  readonly label: string
}

/** What a terminal *is* — persistable, no runtime state. */
export interface TerminalDefinition {
  readonly id: string
  readonly title: string
  readonly cwd: string
  readonly shellProfileId: ShellProfileId
  readonly startupCommand?: string
}

export type TerminalSessionStatus = 'starting' | 'running' | 'exited' | 'failed'

/**
 * What a terminal is *doing* — a snapshot. The `node-pty` instance it describes
 * never leaves Main.
 *
 * `starting` is reserved: spawning is synchronous today, so a session goes
 * straight to `running`. A future PTY daemon will need the intermediate state.
 */
export interface TerminalSessionInfo {
  readonly id: string
  readonly definition: TerminalDefinition
  readonly status: TerminalSessionStatus
  readonly exitCode?: number
  readonly createdAt: number
}

/**
 * Everything a caller may supply to open a terminal. All of it is optional:
 * the renderer must not have to know a filesystem path to open a shell
 * (ARCHITECTURE.md §2), so an omitted `cwd` defaults to the user's home
 * directory in Main.
 */
export interface TerminalCreateRequest {
  readonly cwd?: string
  readonly shellProfileId?: ShellProfileId
  readonly title?: string
  readonly startupCommand?: string
  readonly cols?: number
  readonly rows?: number
}

export interface TerminalDataEvent {
  readonly sessionId: string
  readonly data: string
}

export interface TerminalExitEvent {
  readonly sessionId: string
  readonly exitCode: number
}
