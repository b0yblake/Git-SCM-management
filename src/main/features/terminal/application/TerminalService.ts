import type { Unsubscribe } from '@shared/contracts/events'
import { createId } from '@shared/domain/ids'
import type { TerminalManager } from './TerminalManager'
import { NoShellAvailableError } from '../domain/errors'
import type { ShellProfileId } from '../domain/ShellProfile'
import type { AvailableShellProfile } from '@shared/contracts/terminal'
import type {
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalDefinition,
  TerminalExitEvent,
  TerminalSessionInfo
} from '../domain/TerminalSession'

export const DEFAULT_COLS = 80
export const DEFAULT_ROWS = 24
export const DEFAULT_TITLE = 'Terminal'

/**
 * The terminal feature's public use-case layer.
 *
 * Its job is to turn a partial `TerminalCreateRequest` into a complete
 * `TerminalDefinition` — applying defaults and minting the definition id — and
 * to delegate everything else to `TerminalManager`, which owns live sessions.
 *
 * The default shell profile is a constant here; Phase 5 replaces it with the
 * user's persisted setting.
 */
export interface TerminalServiceOptions {
  /** Used when a request omits `cwd`; the composition root supplies the home directory. */
  readonly defaultCwd: string
  /**
   * Read fresh on every create, because the user can change their default shell
   * while the app is running. Returns null when no shell is installed at all.
   */
  readonly defaultShellProfileId: () => ShellProfileId | null
  /** What the picker may offer — label only, never an executable path. */
  readonly availableShellProfiles: () => readonly AvailableShellProfile[]
  /**
   * Injected rather than called directly: the application layer may not touch
   * the filesystem (ARCHITECTURE.md §2), and `architecture.spec.ts` enforces it.
   */
  readonly directoryExists: (path: string) => boolean
}

export class TerminalService {
  readonly #manager: TerminalManager
  readonly #options: TerminalServiceOptions

  constructor(manager: TerminalManager, options: TerminalServiceOptions) {
    this.#manager = manager
    this.#options = options
  }

  create(request: TerminalCreateRequest): TerminalSessionInfo {
    const shellProfileId = request.shellProfileId ?? this.#options.defaultShellProfileId()
    if (!shellProfileId) throw new NoShellAvailableError()

    const definition: TerminalDefinition = {
      id: createId('term'),
      title: request.title ?? DEFAULT_TITLE,
      cwd: this.#resolveCwd(request.cwd ?? this.#options.defaultCwd),
      shellProfileId,
      ...(request.startupCommand === undefined ? {} : { startupCommand: request.startupCommand })
    }

    return this.#manager.create(definition, {
      cols: request.cols ?? DEFAULT_COLS,
      rows: request.rows ?? DEFAULT_ROWS
    })
  }

  /**
   * A saved workspace outlives the directories it points at. Falling back to
   * the default beats refusing to open the terminal, and the caller can tell it
   * happened by comparing the returned definition with what it asked for —
   * which is how the UI knows to say so.
   */
  #resolveCwd(requested: string): string {
    return this.#options.directoryExists(requested) ? requested : this.#options.defaultCwd
  }

  profiles(): readonly AvailableShellProfile[] {
    return this.#options.availableShellProfiles()
  }

  write(sessionId: string, data: string): void {
    this.#manager.write(sessionId, data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.#manager.resize(sessionId, cols, rows)
  }

  kill(sessionId: string): void {
    this.#manager.kill(sessionId)
  }

  get(sessionId: string): TerminalSessionInfo {
    return this.#manager.get(sessionId)
  }

  list(): TerminalSessionInfo[] {
    return this.#manager.list()
  }

  onData(callback: (event: TerminalDataEvent) => void): Unsubscribe {
    return this.#manager.onData(callback)
  }

  onExit(callback: (event: TerminalExitEvent) => void): Unsubscribe {
    return this.#manager.onExit(callback)
  }

  disposeAll(): void {
    this.#manager.disposeAll()
  }
}
