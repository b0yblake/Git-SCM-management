import type { IpcError } from '@shared/contracts/ipc'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/contracts/settings'
import type {
  AvailableShellProfile,
  TerminalDataEvent,
  TerminalExitEvent
} from '@shared/contracts/terminal'
import type { GitRepositoryStatus } from '@shared/contracts/git'
import type {
  PortProcess,
  TerminatePortProcessesRequest,
  TerminatePortProcessesResult
} from '@shared/contracts/ports'
import type { UpdateCheckResult } from '@shared/contracts/updates'
import type { Workspace, WorkspaceInput, WorkspaceSummary } from '@shared/contracts/workspace'

type TerminalApi = Window['gitdeck']['terminal']
type SettingsApi = Window['gitdeck']['settings']
type WorkspaceApi = Window['gitdeck']['workspace']
type GitApi = Window['gitdeck']['git']
type PortsApi = Window['gitdeck']['ports']
type UpdatesApi = Window['gitdeck']['updates']

/** What the fake detector "found". Deliberately not all five. */
export const FAKE_PROFILES: AvailableShellProfile[] = [
  { id: 'git-bash', label: 'Git Bash' },
  { id: 'powershell', label: 'Windows PowerShell' },
  { id: 'cmd', label: 'Command Prompt' }
]

/**
 * Stands in for the preload bridge.
 *
 * It records every call so a test can assert that something *did not* happen —
 * `expect(api.calls.kill).toEqual([])` after unmount is the point of Phase 3,
 * and `expect(api.calls.workspaceSave).toEqual([])` is the point of Phase 7.
 */
export interface FakeGitDeckApi {
  readonly terminal: TerminalApi
  readonly settings: SettingsApi
  readonly workspace: WorkspaceApi
  readonly git: GitApi
  readonly ports: PortsApi
  readonly updates: UpdatesApi
  readonly calls: {
    create: unknown[]
    profiles: number
    write: Array<{ sessionId: string; data: string }>
    resize: Array<{ sessionId: string; cols: number; rows: number }>
    kill: string[]
    settingsUpdate: unknown[]
    workspaceList: number
    workspaceGet: string[]
    workspaceSave: WorkspaceInput[]
    workspaceDelete: string[]
    gitInspect: string[]
    portsList: number
    portsTerminate: TerminatePortProcessesRequest[]
    updatesCheck: number
    updatesOpenRelease: number
  }
  /** What the fake has persisted — survives an `install()`/`uninstall()` cycle. */
  storedSettings(): AppSettings
  storedWorkspaces(): readonly Workspace[]
  seedWorkspaces(...workspaces: Workspace[]): void
  /** What `git.inspect` answers for a path. Defaults to null everywhere. */
  setGitStatus(path: string, status: GitRepositoryStatus | null): void
  /** Makes `git.inspect` answer with an error, which the UI must ignore. */
  failGitInspect(): void
  /** Makes `terminal.create` reject for a definition with this title. */
  failCreateFor(title: string): void
  /** What the next `ports.list` snapshots will contain. */
  setPortsProcesses(...processes: PortProcess[]): void
  /** Makes `ports.list` answer with an error. */
  failPortsList(): void
  /** Overrides the terminate answer; default terminates everything requested. */
  setPortsTerminateResult(result: TerminatePortProcessesResult): void
  /** Makes `ports.terminate` answer with an error, as a stale snapshot would. */
  failPortsTerminate(code: string, message: string): void
  /** Fires the native menu's File → Port… signal. */
  emitPortsOpen(): void
  /** What the next `updates.check` answers. Defaults to up-to-date. */
  setUpdateCheckResult(result: UpdateCheckResult): void
  /** Fires the startup update-available push. */
  emitUpdateAvailable(result: UpdateCheckResult): void
  /**
   * Simulates Main falling back when a saved directory is gone: a create for
   * this path succeeds, but comes back seated in `FAKE_FALLBACK_CWD`.
   */
  markDirectoryMissing(path: string): void
  /** Live subscriptions — should return to 0 after every unmount. */
  listenerCount(): number
  emitData(event: TerminalDataEvent): void
  emitExit(event: TerminalExitEvent): void
  install(): void
  uninstall(): void
}

const NOT_FOUND: IpcError = { code: 'WORKSPACE_NOT_FOUND', message: 'No such workspace' }

/** Where Main lands a terminal whose saved directory no longer exists. */
export const FAKE_FALLBACK_CWD = 'C:\\fake'

/**
 * The zero state of the call log. Exported so a boundary test can assert
 * "nothing was called" exhaustively without re-listing every channel — that
 * list grows every phase, and a test that has to be edited each time stops
 * being read.
 */
export const emptyCalls = (): FakeGitDeckApi['calls'] => ({
  create: [],
  profiles: 0,
  write: [],
  resize: [],
  kill: [],
  settingsUpdate: [],
  workspaceList: 0,
  workspaceGet: [],
  workspaceSave: [],
  workspaceDelete: [],
  gitInspect: [],
  portsList: 0,
  portsTerminate: [],
  updatesCheck: 0,
  updatesOpenRelease: 0
})

export const createFakeGitDeckApi = (): FakeGitDeckApi => {
  const dataListeners = new Set<(event: TerminalDataEvent) => void>()
  const exitListeners = new Set<(event: TerminalExitEvent) => void>()
  const portsOpenListeners = new Set<() => void>()

  const calls = emptyCalls()

  let settings: AppSettings = DEFAULT_SETTINGS
  const workspaces = new Map<string, Workspace>()
  const failingTitles = new Set<string>()
  const missingDirectories = new Set<string>()
  const gitStatuses = new Map<string, GitRepositoryStatus | null>()
  let gitInspectFails = false
  let created = 0
  let minted = 0
  let portsProcesses: PortProcess[] = []
  let portsListFails = false
  let portsTerminateOverride: TerminatePortProcessesResult | null = null
  let portsTerminateError: IpcError | null = null
  let snapshots = 0
  const updateAvailableListeners = new Set<(result: UpdateCheckResult) => void>()
  let updateCheckResult: UpdateCheckResult = {
    status: 'up-to-date',
    currentVersion: '0.1.0',
    latest: null
  }

  const terminal: TerminalApi = {
    create: (request) => {
      calls.create.push(request)

      if (failingTitles.has(request.title ?? '')) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'SHELL_NOT_FOUND', message: `No shell for ${request.title}` }
        })
      }

      // A distinct id per call: two definitions opening the same session id
      // would silently collapse into one tab and hide a real bug.
      created += 1
      const startupCommand = request.startupCommand
      const requestedCwd = request.cwd ?? FAKE_FALLBACK_CWD
      return Promise.resolve({
        ok: true as const,
        value: {
          id: `sess_${created}`,
          definition: {
            id: `term_${created}`,
            title: request.title ?? 'Terminal',
            // Mirrors Main: a directory that is gone lands in the fallback.
            cwd: missingDirectories.has(requestedCwd) ? FAKE_FALLBACK_CWD : requestedCwd,
            shellProfileId: request.shellProfileId ?? 'powershell',
            ...(startupCommand === undefined ? {} : { startupCommand })
          },
          status: 'running' as const,
          createdAt: 0
        }
      })
    },
    profiles: () => {
      calls.profiles += 1
      return Promise.resolve({ ok: true, value: FAKE_PROFILES })
    },
    write: (sessionId, data) => {
      calls.write.push({ sessionId, data })
    },
    resize: (sessionId, cols, rows) => {
      calls.resize.push({ sessionId, cols, rows })
    },
    kill: (sessionId) => {
      calls.kill.push(sessionId)
      return Promise.resolve({ ok: true, value: null })
    },
    onData: (callback) => {
      dataListeners.add(callback)
      return () => {
        dataListeners.delete(callback)
      }
    },
    onExit: (callback) => {
      exitListeners.add(callback)
      return () => {
        exitListeners.delete(callback)
      }
    }
  }

  const settingsApi: SettingsApi = {
    get: () => Promise.resolve({ ok: true, value: settings }),
    update: (patch) => {
      calls.settingsUpdate.push(patch)
      settings = { ...settings, ...patch }
      return Promise.resolve({ ok: true, value: settings })
    }
  }

  const summarize = (workspace: Workspace): WorkspaceSummary => ({
    id: workspace.id,
    name: workspace.name,
    terminalCount: workspace.terminals.length,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt
  })

  const workspaceApi: WorkspaceApi = {
    list: () => {
      calls.workspaceList += 1
      return Promise.resolve({ ok: true, value: [...workspaces.values()].map(summarize) })
    },

    get: (id) => {
      calls.workspaceGet.push(id)
      const workspace = workspaces.get(id)
      return Promise.resolve(
        workspace
          ? { ok: true as const, value: workspace }
          : { ok: false as const, error: NOT_FOUND }
      )
    },

    // Mirrors Main: the id is minted here and the timestamps are never taken
    // from the caller, so a test cannot accidentally pass by supplying them.
    save: (input) => {
      calls.workspaceSave.push(input)
      minted += 1
      const id = input.id ?? `ws_fake-${minted}`
      const existing = workspaces.get(id)
      const workspace: Workspace = {
        id,
        name: input.name,
        version: 1,
        terminals: input.terminals,
        ...(input.activeTerminalId === undefined
          ? {}
          : { activeTerminalId: input.activeTerminalId }),
        createdAt: existing?.createdAt ?? 0,
        updatedAt: (existing?.updatedAt ?? 0) + 1
      }
      workspaces.set(id, workspace)
      return Promise.resolve({ ok: true, value: workspace })
    },

    delete: (id) => {
      calls.workspaceDelete.push(id)
      workspaces.delete(id)
      return Promise.resolve({ ok: true, value: null })
    }
  }

  /**
   * Answers null by default, which is exactly how the app behaves with no git
   * installed. Every other renderer suite therefore runs under that condition
   * already — the independence guarantee is the default, not a special case.
   */
  const gitApi: GitApi = {
    inspect: (path) => {
      calls.gitInspect.push(path)
      if (gitInspectFails) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'INTERNAL_ERROR', message: 'git blew up' }
        })
      }
      return Promise.resolve({ ok: true as const, value: gitStatuses.get(path) ?? null })
    }
  }

  /**
   * Mirrors Main's capability discipline: every `list` mints a new snapshot
   * id, and the default `terminate` simply reports everything requested as
   * terminated — tests script the interesting outcomes.
   */
  const portsApi: PortsApi = {
    list: () => {
      calls.portsList += 1
      if (portsListFails) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'PORT_INSPECTION_FAILED', message: 'inspection blew up' }
        })
      }
      snapshots += 1
      return Promise.resolve({
        ok: true as const,
        value: { id: `snap_fake-${snapshots}`, capturedAt: snapshots, processes: portsProcesses }
      })
    },

    terminate: (request) => {
      calls.portsTerminate.push(request)
      if (portsTerminateError) {
        return Promise.resolve({ ok: false as const, error: portsTerminateError })
      }
      return Promise.resolve({
        ok: true as const,
        value: portsTerminateOverride ?? {
          terminatedTargetIds: [...request.targetIds],
          alreadyExitedTargetIds: [],
          failures: []
        }
      })
    },

    onOpen: (callback) => {
      portsOpenListeners.add(callback)
      return () => {
        portsOpenListeners.delete(callback)
      }
    }
  }

  const updatesApi: UpdatesApi = {
    check: () => {
      calls.updatesCheck += 1
      return Promise.resolve({ ok: true as const, value: updateCheckResult })
    },
    openRelease: () => {
      calls.updatesOpenRelease += 1
      return Promise.resolve({ ok: true as const, value: null })
    },
    onAvailable: (callback) => {
      updateAvailableListeners.add(callback)
      return () => {
        updateAvailableListeners.delete(callback)
      }
    }
  }

  return {
    terminal,
    settings: settingsApi,
    workspace: workspaceApi,
    git: gitApi,
    ports: portsApi,
    updates: updatesApi,
    calls,
    storedSettings: () => settings,
    storedWorkspaces: () => [...workspaces.values()],
    seedWorkspaces: (...seeded) => {
      for (const workspace of seeded) workspaces.set(workspace.id, workspace)
    },
    setGitStatus: (path, status) => {
      gitStatuses.set(path, status)
    },
    failGitInspect: () => {
      gitInspectFails = true
    },
    failCreateFor: (title) => {
      failingTitles.add(title)
    },
    setPortsProcesses: (...processes) => {
      portsProcesses = processes
    },
    failPortsList: () => {
      portsListFails = true
    },
    setPortsTerminateResult: (result) => {
      portsTerminateOverride = result
    },
    failPortsTerminate: (code, message) => {
      portsTerminateError = { code, message }
    },
    emitPortsOpen: () => {
      for (const listener of [...portsOpenListeners]) listener()
    },
    setUpdateCheckResult: (result) => {
      updateCheckResult = result
    },
    emitUpdateAvailable: (result) => {
      for (const listener of [...updateAvailableListeners]) listener(result)
    },
    markDirectoryMissing: (path) => {
      missingDirectories.add(path)
    },
    listenerCount: () =>
      dataListeners.size +
      exitListeners.size +
      portsOpenListeners.size +
      updateAvailableListeners.size,
    emitData: (event) => {
      for (const listener of [...dataListeners]) listener(event)
    },
    emitExit: (event) => {
      for (const listener of [...exitListeners]) listener(event)
    },
    install: () => {
      Object.defineProperty(window, 'gitdeck', {
        value: {
          terminal,
          workspace: workspaceApi,
          git: gitApi,
          settings: settingsApi,
          ports: portsApi,
          updates: updatesApi
        },
        configurable: true,
        writable: true
      })
    },
    uninstall: () => {
      dataListeners.clear()
      exitListeners.clear()
      portsOpenListeners.clear()
      updateAvailableListeners.clear()
      Reflect.deleteProperty(window, 'gitdeck')
    }
  }
}
