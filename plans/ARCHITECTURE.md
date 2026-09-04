# GitDeck — Architecture Reference

> **Purpose:** the single shared contract every phase plan depends on.
> This file describes *how* the system is built. It contains no tasks.
>
> Read this before starting any `phase-*.md`.
>
> Extracted from `../PLAN.md` (§1–8, §13, §18–21, §25–27).

---

## 1. Mandatory rules

1. **UI never spawns shell processes directly.**
2. **Electron Main owns all PTY/native process resources.**
3. **Renderer communicates with Main only through typed IPC contracts.**
4. **Business/domain logic must not import React.**
5. **Feature modules must expose public interfaces instead of reaching into another feature's internal files.**
6. **Git features must not be required for terminal features to work.**
7. **Persistence must store serializable definitions, never live PTY objects.**
8. **Shell detection and Git detection are infrastructure services, not UI concerns.**
9. **No feature may directly call `ipcRenderer` outside the preload/bridge layer.**
10. **Every feature must have an explicit scope, public API, tests, and Definition of Done.**

---

## 2. Layer responsibilities

| Layer | Owns | MUST NOT import |
|---|---|---|
| **Domain** | data models, rules | Electron, React, node-pty, xterm.js |
| **Application** | use cases (create terminal, open workspace, inspect repo) | UI code |
| **Infrastructure** | OS-specific behavior (node-pty, fs, child_process, Electron APIs) | — |
| **UI / Renderer** | presentation, interaction | PTY instances, filesystem details, native Node APIs |

Dependency direction:

```text
UI
 ↓
application API
 ↓
domain
 ↑
infrastructure implements interfaces
```

Forbidden edges:

```text
domain → Electron
domain → React
domain → node-pty
workspace infrastructure → terminal internals
Git feature → terminal infrastructure
renderer → ipcRenderer
UI component → filesystem
```

---

## 3. Source structure

```text
src/
├── shared/
│   ├── domain/        errors.ts · ids.ts · result.ts
│   ├── contracts/     ipc.ts · events.ts
│   └── utils/
│
├── main/
│   ├── bootstrap/     container.ts · createWindow.ts · registerIpc.ts
│   │                  logger.ts · fileSink.ts · applicationMenu.ts   (Phases 0–12)
│   │                  storagePaths.ts · storageManifest.ts · quarantine.ts   (Phase 14)
│   │                  migrations.ts   (Phase 15)
│   │                  dataRoot.ts · dataRootIpc.ts   (Phase 17)
│   │                  openPath.ts · openPathIpc.ts · explorerMenu.ts   (Phase 18)
│   │                  workspaceLaunch.ts · workspaceLaunchIpc.ts   (Phase 19)
│   │                  aboutIpc.ts   (About, 2026-09-04)
│   ├── features/
│   │   ├── terminal/  domain/ application/ infrastructure/ ipc/ testing/ public.ts
│   │   ├── workspace/ domain/ application/ infrastructure/ ipc/ testing/ public.ts
│   │   ├── git/       domain/ application/ infrastructure/ ipc/ testing/ public.ts
│   │   ├── settings/  domain/ application/ infrastructure/ ipc/ testing/ public.ts
│   │   ├── ports/     domain/ application/ infrastructure/ ipc/ testing/ public.ts   (Phase 12)
│   │   └── updates/   domain/ application/ infrastructure/ ipc/ testing/ public.ts   (Phase 16)
│   └── index.ts
│
├── preload/           api.ts · index.ts · types.d.ts
│                      terminalApi.ts · workspaceApi.ts · gitApi.ts · settingsApi.ts
│                      portsApi.ts (Phase 12) · updatesApi.ts (Phase 16) · storageApi.ts (Phase 17)
│
└── renderer/src/
    ├── app/           App.tsx · routes.tsx · providers.tsx
    ├── features/
    │   ├── terminal/  components/ hooks/ store/ model/ public.ts
    │   ├── workspace/ components/ hooks/ store/ public.ts
    │   ├── git/       components/ hooks/ store/ public.ts
    │   ├── settings/  components/ hooks/ store/ public.ts
    │   ├── ports/     components/ hooks/ store/ public.ts   (Phase 12)
    │   ├── updates/   components/ hooks/ store/ public.ts   (Phase 16)
    │   └── about/     components/ hooks/ store/ public.ts   (2026-09-04)
    ├── shared/        components/ hooks/ styles/ utils/
    ├── testing/       fakeGitDeckApi.ts · setup.ts
    └── main.tsx
```

> The bootstrap directory is where anything that must exist *before* a feature
> does lives: the data root, the storage paths every feature is handed, the
> launch arguments, and the registry entry the installer removes. It is not a
> feature and exposes no `public.ts`.

---

## 4. Feature boundary rule

Every feature exposes exactly one `public.ts`.

```ts
// main/features/terminal/public.ts
export { TerminalService } from './application/TerminalService'
export type { TerminalCreateRequest, TerminalSessionInfo } from './domain/TerminalSession'
```

Allowed:

```ts
import { TerminalService } from '../terminal/public'
```

Forbidden:

```ts
import { NodePtyAdapter } from '../terminal/infrastructure/NodePtyAdapter'
```

---

## 5. Core domain models

```ts
export type ShellProfileId = 'git-bash' | 'powershell' | 'pwsh' | 'cmd' | 'wsl'

export interface TerminalDefinition {
  id: string
  title: string
  cwd: string
  shellProfileId: ShellProfileId
  startupCommand?: string
}

export type TerminalSessionStatus = 'starting' | 'running' | 'exited' | 'failed'

export interface TerminalSessionInfo {
  id: string
  definition: TerminalDefinition
  status: TerminalSessionStatus
  exitCode?: number
  createdAt: number
}

export interface Workspace {
  id: string
  name: string
  version: 1
  terminals: TerminalDefinition[]
  // Always names one of `terminals`, or is absent: validation drops a value
  // pointing at a terminal that was removed (Phase 6).
  activeTerminalId?: string
  createdAt: number
  updatedAt: number
}

// What `list()` answers with — a sidebar has no use for every definition.
export interface WorkspaceSummary {
  id: string
  name: string
  terminalCount: number
  createdAt: number
  updatedAt: number
}

// What a caller may supply to `save()`. Absent `id` means "create".
export interface WorkspaceInput {
  id?: string
  name: string
  terminals: TerminalDefinition[]
  activeTerminalId?: string
}

export interface WorkspaceLayout {
  version: 1
  mode: 'tabs' | 'split'
}

export interface GitRepositoryStatus {
  repositoryRoot: string
  branch: string | null
  ahead: number
  behind: number
  staged: number
  modified: number
  untracked: number
  conflicted: number
  isClean: boolean
}

// Fields are added by the phase that needs them; `normalizeSettings` defaults
// anything missing, so adding one is not a migration.
// Kept flat: PLAN.md sketched a nested `behavior` group, but with a handful of
// fields that would only mean two shapes to validate.
interface AppSettings {
  version: 1
  defaultShellProfileId: ShellProfileId | null // Phase 5
  activeWorkspaceId: string | null // Phase 7 writes it, Phase 8 restores from it
  activeTerminalDefinitionId: string | null // Phase 8 — a definition, never a session
  restoreLastWorkspace: boolean // Phase 8, default true
  runStartupCommandsOnRestore: boolean // Phase 8, default FALSE on purpose
  terminalFontSize: number // Phase 10, clamped to 8..32, default 14
  terminalCursorBlink: boolean // Phase 10, default true
  confirmBeforeClosingRunningTerminal: boolean // Phase 10, default true
  checkForUpdatesOnStartup: boolean // Phase 16, default true
  skippedUpdateVersion: string | null // Phase 16, default null
}
```

`TerminalSessionInfo` is serializable. The `node-pty` instance stays internal to Main.

```ts
// Phase 12 — port management. The renderer sees descriptions; the only thing
// it may send back is an opaque capability minted by Main for one snapshot.
export type PortProtocol = 'tcp' | 'udp'

export interface PortBinding {
  protocol: PortProtocol
  localAddress: string
  localPort: number
}

export type PortTerminationBlockReason =
  | 'system-process' | 'gitdeck-process' | 'different-session' | 'identity-unavailable'

// One selectable row: a process and every binding it owns. Terminating it
// releases all of them — the modal exists to make that blast radius visible.
export interface PortProcess {
  targetId: string // opaque capability, NOT a PID
  pid: number
  processName: string
  startedAt: number | null
  bindings: readonly PortBinding[]
  canTerminate: boolean
  blockedReason?: PortTerminationBlockReason
}

export interface PortSnapshot {
  id: string
  capturedAt: number
  processes: readonly PortProcess[]
}

// terminate() accepts snapshot + target ids only. There is deliberately no
// public type through which a PID, process name, command or signal can travel.
export interface TerminatePortProcessesRequest {
  snapshotId: string
  targetIds: readonly string[]
}

export interface TerminatePortProcessesResult {
  terminatedTargetIds: readonly string[]
  alreadyExitedTargetIds: readonly string[]
  failures: readonly { targetId: string; code: string; message: string }[]
}
```

Main retains **one** snapshot, expiring after `PORT_SNAPSHOT_TTL_MS` (5 min); a
refresh invalidates it, a terminate consumes it. Immediately before killing,
Main revalidates the PID's start time and owned bindings against a fresh
inspection, and reports success only after a further inspection proves the
snapshotted bindings are gone. `taskkill /PID <pid> /F` exactly — never `/IM`,
never `/T`, never elevation.

---

## 6. IPC channel registry

```ts
export const IPC = {
  terminal: {
    create: 'terminal:create',
    write: 'terminal:write',
    resize: 'terminal:resize',
    kill: 'terminal:kill',
    profiles: 'terminal:profiles',
    data: 'terminal:data',
    exit: 'terminal:exit',
    pendingOpenPath: 'terminal:pendingpath', // Phase 18 — pulled once at start
    openPath: 'terminal:openpath' // Phase 18 — pushed by a second instance
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update'
  },
  workspace: {
    list: 'workspace:list',
    get: 'workspace:get',
    save: 'workspace:save',
    delete: 'workspace:delete',
    shortcut: 'workspace:shortcut', // Phase 19 — the save dialog owns the path
    pendingOpen: 'workspace:pendingopen', // Phase 19 — mirrors Phase 18
    open: 'workspace:open'
  },
  git: {
    inspect: 'git:inspect'
  },
  ports: {
    list: 'ports:list',
    terminate: 'ports:terminate', // the only destructive channel there is
    open: 'ports:open' // Main → renderer: the native File → Port… menu entry
  },
  updates: {
    check: 'updates:check', // Phase 16 — read-only
    release: 'updates:release', // opens the URL Main minted; takes none
    available: 'updates:available'
  },
  storage: {
    info: 'storage:info', // Phase 17 — the picker is native and Main-owned
    choose: 'storage:choose' // no channel accepts a filesystem path
  },
  about: {
    open: 'about:open', // one-way Main → renderer: Help → About GitDeck
    link: 'about:link' // opens one project link by key; never by URL
  }
} as const
```

Eight namespaces, twenty-nine channels. No arbitrary channel strings scattered
through the codebase, enforced by a repository scan in
`shared/contracts/ipc.spec.ts`.

> `shared/contracts/ipc.snapshot.spec.ts` is the authority, not this listing:
> it pins the surface exactly and has to be edited deliberately. If the two
> ever disagree, the snapshot is right and this section is stale.

**The rule every channel added since v0.1.0 was designed around:** no channel
accepts a PID, a process name, a signal, a filesystem path or a URL. Ports
takes capabilities Main minted, updates opens only the URL Main minted, storage
opens a native picker and takes no payload, and both launch-argument channels
take no payload at all.

---

## 7. Renderer API contract — `window.gitdeck`

Request/response members resolve to a `Result` rather than rejecting. This is
forced by the platform, not a preference: Electron's contextBridge rebuilds a
rejected `Error` in the renderer's world and keeps only the standard fields, so
a custom `code` property is silently dropped and the renderer is left matching
on message text. Verified end-to-end in Phase 2. A plain object survives the
bridge intact.

```ts
interface GitDeckApi {
  terminal: {
    create(request: TerminalCreateRequest): Promise<Result<TerminalSessionInfo, IpcError>>
    // Added in Phase 5: the shell picker must render a list it did not compute,
    // and Main is the only place that knows what is installed.
    profiles(): Promise<Result<readonly AvailableShellProfile[], IpcError>>
    write(sessionId: string, data: string): void
    resize(sessionId: string, cols: number, rows: number): void
    kill(sessionId: string): Promise<Result<null, IpcError>>
    onData(callback: TerminalDataCallback): Unsubscribe
    onExit(callback: TerminalExitCallback): Unsubscribe
  }
  workspace: {
    list(): Promise<Result<readonly WorkspaceSummary[], IpcError>>
    get(id: string): Promise<Result<Workspace, IpcError>>
    // Takes an input, not a Workspace: `version`, `createdAt` and `updatedAt`
    // are stamped in Main. A renderer able to set `updatedAt` could make a
    // stale workspace look newer than the one that replaced it.
    save(input: WorkspaceInput): Promise<Result<Workspace, IpcError>>
    delete(id: string): Promise<Result<null, IpcError>>
  }
  git: {
    // Every "nothing to show" case — outside a repository, git not installed,
    // output unreadable — answers Ok(null). The renderer has nothing to
    // distinguish and so nothing to report on a poll interval.
    inspect(path: string): Promise<Result<GitRepositoryStatus | null, IpcError>>
  }
  settings: {
    get(): Promise<Result<AppSettings, IpcError>>
    update(patch: AppSettingsPatch): Promise<Result<AppSettings, IpcError>>
  }
  ports: {
    // Phase 12. `terminate` takes only Main-minted capabilities: there is no
    // member anywhere on this API that accepts a PID, a process name, a
    // signal or a command, and no generic kill may ever be added.
    list(): Promise<Result<PortSnapshot, IpcError>>
    terminate(
      request: TerminatePortProcessesRequest
    ): Promise<Result<TerminatePortProcessesResult, IpcError>>
    onOpen(callback: () => void): Unsubscribe
  }
  updates: {
    // Phase 16. `openRelease` takes no URL: Main opens only the release URL
    // it minted from a validated tag. There is deliberately no member
    // anywhere on this API through which a renderer-supplied URL can travel.
    check(): Promise<Result<UpdateCheckResult, IpcError>>
    openRelease(): Promise<Result<null, IpcError>>
    onAvailable(callback: (result: UpdateCheckResult) => void): Unsubscribe
  }
  storage: {
    // Phase 17. `chooseDataFolder` opens the native folder picker and
    // resolves with the new state, or null when the user cancelled. Neither
    // member accepts a path: the picker is the only source of one.
    dataFolder(): Promise<Result<DataFolderInfo, IpcError>>
    chooseDataFolder(): Promise<Result<DataFolderInfo | null, IpcError>>
  }
  about: {
    // 2026-09-04. `openLink` names one of the links in `APP_LINKS`
    // (shared/contracts/about.ts); Main resolves the key to a constant URL,
    // so no URL crosses this bridge in either direction.
    openLink(link: AppLinkId): Promise<Result<null, IpcError>>
    onOpen(callback: () => void): Unsubscribe
  }
}
```

Never expose `ipcRenderer` or raw Electron objects.

---

## 8. Renderer state strategy

Zustand, one store per feature. No single global store.

```text
terminalStore · workspaceStore · gitStore · settingsStore · portsStore · updatesStore
aboutStore
```

`terminalStore` also owns the Mosaic layout (Phases 13, 20, 21): the selected
mode, which sessions are on the canvas, and which is focused. Capacity is
`focus: 1`, `columns: 2`, `main-side: 3`, `grid: Infinity` — Grid means *one
page, every terminal*, so its bounded-mode eviction and parked-session backfill
paths do not run. Layout is deliberately **not** persisted.

```ts
interface TerminalUiState {
  sessions: Record<string, TerminalSessionInfo>
  order: string[]
  activeSessionId: string | null
}
```

Never store xterm `Terminal` objects in Zustand — they live in component refs.

---

## 9. Errors

```ts
class ShellNotFoundError extends Error {}
class TerminalSessionNotFoundError extends Error {}
class WorkspaceNotFoundError extends Error {}
class InvalidWorkspaceError extends Error {}
class NoShellAvailableError extends Error {} // nothing to fall back to
class GitNotAvailableError extends Error {}
class GitOutputError extends Error {} // git answered, unreadably
class GitTimeoutError extends Error {} // git did not answer in time
// Phase 12
class PortInspectionError extends Error {}
class PortInspectionTimeoutError extends Error {}
class PortSnapshotStaleError extends Error {} // stale modal → stable answer: refresh
class InvalidPortRequestError extends Error {} // unknown/blocked capability — rejected whole
class PortAccessDeniedError extends Error {} // per-target failure, never a reason to elevate
class PortTerminationError extends Error {} // taskkill failed for any other reason
// Phase 15 / 16 — bootstrap and updates, outside the AppError hierarchy
class MigrationError extends Error {} // a gap or a throwing step → quarantine
class UpdateCheckFailedError extends Error {} // every network/parse failure, silently
```

Everything above except the last two extends `AppError` and carries a stable
`code`. Two error classes are deliberately **not** listed here because they are
internal control flow rather than contract: `InvalidRequestError`
(`terminal/ipc`) and `NewerWorkspaceFileError` (`workspace/infrastructure`).
Both are unexported, and both are proven by behaviour tests rather than by
name. Checkpoint C treats this list as the contract: a new exported error class
belongs here in the same change.

IPC handlers convert errors to serializable responses. The renderer never receives a native `Error` carrying internal Electron state.

---

## 10. Logging

```ts
interface Logger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}
```

Log: terminal create/exit · workspace load/save · shell detection failure · Git command failure · unexpected IPC errors.

Never log full environment variables.

---

## 11. Security baseline

```ts
webPreferences: {
  preload,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true
}
```

- Do not expose filesystem APIs to the renderer.
- Validate all IPC input.
- Never create a generic `window.exec(command)` endpoint — expose intent-specific operations only.

---

## 12. Testing strategy

| Level | Targets |
|---|---|
| **Unit** | domain logic · `TerminalManager` with fake `PtyFactory` · workspace serialization · shell profile selection · Git parser · Zustand transitions |
| **Integration** | IPC handler ↔ service · persistence adapter · Git CLI adapter · shell detector |
| **E2E** | Playwright for Electron — start app, create terminal, `echo hello`, second terminal, switch tabs, close, save workspace, restart, restore |

---

## 13. Working rules for each implementation session

**Before:** read this file plus the one phase plan · list files expected to change · do not implement later-phase features · preserve public interfaces.

**During:** small commits · strict TypeScript · tests alongside business logic · no giant files · no utility dumping grounds · explicit interfaces · no premature abstractions · never bypass preload isolation.

**After:**

```bash
npm run typecheck
npm run lint
npm test
```

Report:

```text
Implemented:
Changed files:
Tests:
Known limitations:
Out of scope:
```

---

## 14. Storage layout (Phase 14)

Every persisted path is minted by `src/main/bootstrap/storagePaths.ts` and
nowhere else. Features receive their paths from the composition root and no
longer know their own filenames.

```text
<data root>\                           default: app.getPath('userData');
│                                      user-relocatable via Settings (Phase 17)
├── settings.json                      settings store   (schema v1)
├── storage.json                       manifest — bootstrap-owned bookkeeping
├── workspaces\<workspace-id>.json     one file per workspace (schema v1)
├── backups\                           pre-migration copies (Phase 15)
└── *.corrupt-<timestamp>              quarantined unreadable files

%APPDATA%\GitDeck\data-root.json       pointer to the chosen data root —
                                       ALWAYS in the default userData dir

%APPDATA%\GitDeck\logs\                app.getPath('logs') — under userData
└── gitdeck.log                        rotating operational log
```

Rules:

1. Writes are atomic (write temp, rename). Reads are tolerant: a corrupt
   settings/workspace file is **quarantined** — renamed to
   `<name>.corrupt-<timestamp>` once, best-effort — then defaults/skip apply.
   Startup is never blocked by storage.
2. **Future-version carve-out:** a file whose integer `version` is greater
   than the store's current version was written by a newer GitDeck. It is
   never quarantined and never rewritten — settings are read per-field,
   workspace files are skipped with a log line — so a downgraded user's data
   survives until they upgrade again.
3. `storage.json` records `firstRunAt`, `lastRunAt`, `lastRunAppVersion` and
   per-store schema versions. It is not a feature: no IPC, renderer never
   sees it, unknown fields are carried through a rewrite untouched.
4. Terminal input/output is never persisted. The uninstaller never deletes
   `userData`; removal is a manual `%APPDATA%\GitDeck` deletion.
5. **Data root resolution (Phase 17).** The pointer cannot live in
   `settings.json` — the app must know the folder before settings can be
   read. Resolution is tolerant: missing pointer → default; corrupt →
   quarantined, default; folder unreachable → default for this run, pointer
   kept. Switching copies current data to the target (unless the target
   already holds GitDeck data, which is adopted as-is), never deletes the
   source, and takes effect on the next launch. The folder picker is native
   and Main-owned: no IPC channel accepts a filesystem path.

### Compatibility policy (Phase 15)

1. **Old data always loads.** A newer GitDeck reads every file any released
   GitDeck ever wrote — proven by `tests/fixtures/storage/<version>/` golden
   fixtures, one directory per release, append-only.
2. **Additions are not migrations.** A new field with a safe default is
   handled by normalize-style defaulting and does not bump a store version.
   The version bumps only when meaning or shape changes.
3. **Migrations are pure, forward-only, stepwise** (`v(n) → v(n+1)`,
   `bootstrap/migrations.ts`), run in Main inside the store on load. A gap or
   a throwing step quarantines rather than guesses. The renderer never sees a
   pre-migration shape.
4. **Backup before the first migrated write:** the original bytes land in
   `backups/` (`settings.v<n>.json`, `workspaces/<id>.v<n>.json`), once per
   version step, never overwritten, never deleted by later runs.
5. **Downgrades degrade, never destroy** (the §14 carve-out). Honest limit:
   an older GitDeck that *writes* drops newer-only fields; the backup is the
   recovery path.
6. A store's migration step, its `*_VERSION` bump and its parser update are
   one change, shipped together.

---

## 15. Commit convention

```text
chore: scaffold electron react application
feat(terminal): add PTY abstraction
feat(ipc): expose typed terminal API
feat(ui): add terminal tabs
feat(shell): detect windows shell profiles
feat(workspace): add workspace persistence
feat(git): add read-only repository status
build: package windows installer
```

Avoid: `finish app` · `various changes` · `fix stuff` · `big update`.
