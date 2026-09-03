import type { Unsubscribe } from '@shared/contracts/events'
import type { IpcError } from '@shared/contracts/ipc'
import type { Result } from '@shared/domain/result'
import type { AppSettings, AppSettingsPatch } from '@shared/contracts/settings'
import type { GitRepositoryStatus } from '@shared/contracts/git'
import type {
  PortSnapshot,
  TerminatePortProcessesRequest,
  TerminatePortProcessesResult
} from '@shared/contracts/ports'
import type { DataFolderInfo } from '@shared/contracts/storage'
import type { UpdateCheckResult } from '@shared/contracts/updates'
import type {
  Workspace,
  WorkspaceInput,
  WorkspaceOpenRequestEvent,
  WorkspaceSummary
} from '@shared/contracts/workspace'
import type {
  AvailableShellProfile,
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalOpenPathEvent,
  TerminalSessionInfo
} from '@shared/contracts/terminal'

/**
 * The one API surface the renderer may use (ARCHITECTURE.md §7).
 *
 * Each namespace is populated by its own phase. `ipcRenderer` and raw Electron
 * objects are never exposed, and no generic command-execution member may ever
 * be added here.
 */
export interface GitDeckApi {
  readonly terminal: TerminalApi
  readonly workspace: WorkspaceApi
  readonly git: GitApi
  readonly settings: SettingsApi
  readonly ports: PortsApi
  readonly updates: UpdatesApi
  readonly storage: StorageApi
}

/**
 * Seven members: the six from ARCHITECTURE.md §7 plus `profiles`, which Phase 5
 * added so the New Terminal picker can list installed shells without the
 * renderer ever computing that list itself.
 *
 * `write` and `resize` return `void`: they are the hot path for keystrokes and
 * window drags, and awaiting a round trip per keystroke would be wrong. A
 * rejected write is logged in Main.
 *
 * `create` and `kill` resolve to a `Result` rather than rejecting. Electron's
 * contextBridge rebuilds a rejected `Error` in the renderer's world and keeps
 * only the standard fields — a custom `code` property is silently dropped, so
 * the renderer would be left matching on message text. A plain object survives
 * the bridge intact, which makes `error.code` dependable.
 */
export interface TerminalApi {
  create(request: TerminalCreateRequest): Promise<Result<TerminalSessionInfo, IpcError>>
  profiles(): Promise<Result<readonly AvailableShellProfile[], IpcError>>
  write(sessionId: string, data: string): void
  resize(sessionId: string, cols: number, rows: number): void
  kill(sessionId: string): Promise<Result<null, IpcError>>
  onData(callback: (event: TerminalDataEvent) => void): Unsubscribe
  onExit(callback: (event: TerminalExitEvent) => void): Unsubscribe
  /**
   * Phase 18 — Explorer's "Open in GitDeck". The pull answers the validated
   * launch directory exactly once; the push arrives when a second instance
   * forwards one. Main validated both; the renderer never sends a path.
   */
  pendingOpenPath(): Promise<Result<string | null, IpcError>>
  onOpenPath(callback: (event: TerminalOpenPathEvent) => void): Unsubscribe
}

/**
 * Persisted workspace definitions. `save` takes a `WorkspaceInput` rather than
 * a `Workspace`: `version`, `createdAt` and `updatedAt` are owned by Main, so
 * the renderer cannot make a stale workspace look newer than it is.
 */
export interface WorkspaceApi {
  list(): Promise<Result<readonly WorkspaceSummary[], IpcError>>
  get(id: string): Promise<Result<Workspace, IpcError>>
  save(input: WorkspaceInput): Promise<Result<Workspace, IpcError>>
  delete(id: string): Promise<Result<null, IpcError>>
  /**
   * Phase 19 — workspace shortcuts. `createShortcut` sends only the id; the
   * native save dialog in Main owns the destination path, and null means it
   * was cancelled. The pull answers the shortcut-launch id exactly once;
   * the push arrives when a second instance forwards one.
   */
  createShortcut(workspaceId: string): Promise<Result<{ path: string } | null, IpcError>>
  pendingOpenWorkspace(): Promise<Result<string | null, IpcError>>
  onOpenWorkspace(callback: (event: WorkspaceOpenRequestEvent) => void): Unsubscribe
}

/**
 * Read-only repository metadata. `null` covers every "nothing to show" case —
 * outside a repository, git not installed, output unreadable — so a missing git
 * can never become an error the UI has to report on every poll.
 */
export interface GitApi {
  inspect(path: string): Promise<Result<GitRepositoryStatus | null, IpcError>>
}

export interface SettingsApi {
  get(): Promise<Result<AppSettings, IpcError>>
  update(patch: AppSettingsPatch): Promise<Result<AppSettings, IpcError>>
}

/**
 * Port inspection and deliberate process termination (Phase 12).
 *
 * `terminate` accepts only a `snapshotId` and opaque `targetId`s minted by
 * Main for that snapshot. There is deliberately no member that takes a PID, a
 * process name, a signal or a command — the renderer can point at what Main
 * enumerated, never at an arbitrary process. `onOpen` fires when the user
 * picks File → Port… in the native menu.
 */
export interface PortsApi {
  list(): Promise<Result<PortSnapshot, IpcError>>
  terminate(
    request: TerminatePortProcessesRequest
  ): Promise<Result<TerminatePortProcessesResult, IpcError>>
  onOpen(callback: () => void): Unsubscribe
}

/**
 * Startup update notification and manual check (Phase 16). `openRelease`
 * takes no URL: Main opens only the release page it minted from the validated
 * tag, so the renderer can never steer the browser anywhere else. Nothing
 * here downloads or installs anything.
 */
export interface UpdatesApi {
  check(): Promise<Result<UpdateCheckResult, IpcError>>
  openRelease(): Promise<Result<null, IpcError>>
  onAvailable(callback: (result: UpdateCheckResult) => void): Unsubscribe
}

/**
 * Where GitDeck's data lives (Phase 17). `chooseDataFolder` asks Main to show
 * the native folder picker and resolves with the new state, or null on
 * cancel. Neither member carries a payload: a filesystem path can never
 * travel renderer → Main, and a switch takes effect on the next launch.
 */
export interface StorageApi {
  dataFolder(): Promise<Result<DataFolderInfo, IpcError>>
  chooseDataFolder(): Promise<Result<DataFolderInfo | null, IpcError>>
}
