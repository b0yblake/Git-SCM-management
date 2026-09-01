# Git Terminal Manager — Implementation Plan

> Working name: **GitDeck**
>
> Target: Windows desktop application for managing multiple Git-oriented terminal sessions.
>
> Primary stack: **Electron + React + TypeScript + xterm.js + node-pty**
>
> This document is intended to be used directly by **Claude Code** as an implementation roadmap.

---

> **📁 This master plan has been split into per-session plans under [`plans/`](plans/README.md).**
>
> Use those for implementation — one plan per session, each with its own scope and Definition of Done.
> This file remains the complete reference.
>
> - [`plans/README.md`](plans/README.md) — index and order
> - [`plans/ARCHITECTURE.md`](plans/ARCHITECTURE.md) — shared contract (§1–8, 13, 18–21, 25–27)
> - [`plans/TESTING.md`](plans/TESTING.md) — testing contract (§21); each phase plan carries its own **Test plan** section
> - `plans/phase-00..11-*.md` — the 12 implementation phases (§22)
> - [`plans/checkpoint-a-architecture.md`](plans/checkpoint-a-architecture.md) · [`plans/checkpoint-b-pre-release.md`](plans/checkpoint-b-pre-release.md) — audit gates (§31–32)
> - [`plans/BACKLOG.md`](plans/BACKLOG.md) — post-v0.1.0 scopes (§24)

---

## 0. Product Goal

Build a Windows desktop application that lets developers organize terminal sessions around Git repositories and workspaces.

The application should start as a reliable terminal/session manager and evolve through isolated features without requiring architectural rewrites.

Core product ideas:

- Multiple independent terminal tabs.
- Git Bash / PowerShell / CMD / WSL shell profiles.
- Each terminal has its own working directory and PTY process.
- Repositories can be grouped into workspaces.
- Workspace layout and terminal definitions can be persisted.
- Git information is additive and must not be tightly coupled to the terminal engine.
- UI must not directly own or spawn OS processes.
- Feature boundaries must make individual features easy to upgrade, replace, or disable.

---

# 1. Architectural Principles

## 1.1 Mandatory rules

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

# 2. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                     Electron App                        │
│                                                         │
│  Renderer                                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ React UI                                          │  │
│  │                                                   │  │
│  │ App Shell                                         │  │
│  │ ├── Workspace UI                                  │  │
│  │ ├── Terminal Tabs UI                              │  │
│  │ ├── Terminal View                                 │  │
│  │ ├── Git Status UI                                 │  │
│  │ └── Settings UI                                   │  │
│  │                                                   │  │
│  │ Feature stores / view models                      │  │
│  └───────────────────────┬───────────────────────────┘  │
│                          │ Typed API                    │
│  Preload                 │                              │
│  ┌───────────────────────▼───────────────────────────┐  │
│  │ contextBridge / IPC client                       │  │
│  └───────────────────────┬───────────────────────────┘  │
│                          │                              │
│  Main                    │                              │
│  ┌───────────────────────▼───────────────────────────┐  │
│  │ IPC handlers                                      │  │
│  │                                                   │  │
│  │ Application services                              │  │
│  │ ├── TerminalService                               │  │
│  │ ├── WorkspaceService                              │  │
│  │ ├── GitService                                    │  │
│  │ └── SettingsService                               │  │
│  │                                                   │  │
│  │ Infrastructure                                    │  │
│  │ ├── node-pty                                      │  │
│  │ ├── filesystem                                    │  │
│  │ ├── shell detector                                │  │
│  │ ├── git CLI                                       │  │
│  │ └── persistence                                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

# 3. Layer Responsibilities

## 3.1 Domain

Contains data models and rules that are independent from Electron and React.

Examples:

- `TerminalDefinition`
- `TerminalSessionMetadata`
- `Workspace`
- `ShellProfile`
- `Repository`
- `GitRepositoryStatus`

Domain code MUST NOT import:

- Electron
- React
- node-pty
- xterm.js

---

## 3.2 Application

Coordinates use cases.

Examples:

- Create terminal.
- Close terminal.
- Resize terminal.
- Open workspace.
- Save workspace.
- Inspect repository.
- Restore persisted layout.

Application services can depend on domain interfaces but should not contain UI code.

---

## 3.3 Infrastructure

Implements OS-specific behavior.

Examples:

- `NodePtyTerminalAdapter`
- `GitCliAdapter`
- `JsonWorkspaceRepository`
- `WindowsShellDetector`

Infrastructure dependencies can include:

- `node-pty`
- Node.js filesystem
- child_process
- Electron APIs

---

## 3.4 UI / Renderer

Responsible for presentation and interaction.

Examples:

- tabs
- sidebar
- terminal view
- dialogs
- command palette

Renderer MUST NOT know about:

- PTY process instances
- process IDs unless surfaced as metadata
- filesystem implementation details
- native Node APIs

---

# 4. Feature-Oriented Source Structure

Use a structure that combines clean layer separation with feature isolation.

```text
src/
│
├── shared/
│   ├── domain/
│   │   ├── errors.ts
│   │   ├── ids.ts
│   │   └── result.ts
│   │
│   ├── contracts/
│   │   ├── ipc.ts
│   │   └── events.ts
│   │
│   └── utils/
│
├── main/
│   ├── bootstrap/
│   │   ├── createWindow.ts
│   │   ├── registerIpc.ts
│   │   └── container.ts
│   │
│   ├── features/
│   │   │
│   │   ├── terminal/
│   │   │   ├── domain/
│   │   │   │   ├── TerminalSession.ts
│   │   │   │   └── ShellProfile.ts
│   │   │   │
│   │   │   ├── application/
│   │   │   │   ├── TerminalService.ts
│   │   │   │   └── TerminalManager.ts
│   │   │   │
│   │   │   ├── infrastructure/
│   │   │   │   ├── NodePtyAdapter.ts
│   │   │   │   ├── WindowsShellDetector.ts
│   │   │   │   └── shellProfiles.ts
│   │   │   │
│   │   │   ├── ipc/
│   │   │   │   └── terminalIpc.ts
│   │   │   │
│   │   │   └── public.ts
│   │   │
│   │   ├── workspace/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   ├── ipc/
│   │   │   └── public.ts
│   │   │
│   │   ├── git/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   ├── ipc/
│   │   │   └── public.ts
│   │   │
│   │   └── settings/
│   │       ├── domain/
│   │       ├── application/
│   │       ├── infrastructure/
│   │       ├── ipc/
│   │       └── public.ts
│   │
│   └── index.ts
│
├── preload/
│   ├── terminalApi.ts
│   ├── workspaceApi.ts
│   ├── gitApi.ts
│   ├── settingsApi.ts
│   ├── types.d.ts
│   └── index.ts
│
└── renderer/
    └── src/
        ├── app/
        │   ├── App.tsx
        │   ├── routes.tsx
        │   └── providers.tsx
        │
        ├── features/
        │   │
        │   ├── terminal/
        │   │   ├── components/
        │   │   │   ├── TerminalView.tsx
        │   │   │   ├── TerminalTab.tsx
        │   │   │   └── TerminalTabBar.tsx
        │   │   ├── hooks/
        │   │   ├── store/
        │   │   ├── model/
        │   │   └── public.ts
        │   │
        │   ├── workspace/
        │   │   ├── components/
        │   │   ├── hooks/
        │   │   ├── store/
        │   │   └── public.ts
        │   │
        │   ├── git/
        │   │   ├── components/
        │   │   ├── hooks/
        │   │   ├── store/
        │   │   └── public.ts
        │   │
        │   └── settings/
        │       ├── components/
        │       ├── hooks/
        │       ├── store/
        │       └── public.ts
        │
        ├── shared/
        │   ├── components/
        │   ├── hooks/
        │   ├── styles/
        │   └── utils/
        │
        └── main.tsx
```

---

# 5. Feature Boundary Rule

Every feature must expose a single `public.ts`.

Example:

```ts
// main/features/terminal/public.ts

export { TerminalService } from './application/TerminalService'
export type {
  TerminalCreateRequest,
  TerminalSessionInfo
} from './domain/TerminalSession'
```

Other features may import:

```ts
import {
  TerminalService
} from '../terminal/public'
```

They MUST NOT import:

```ts
import { NodePtyAdapter }
  from '../terminal/infrastructure/NodePtyAdapter'
```

This rule prevents feature internals from becoming coupled.

---

# 6. Core Domain Models

## 6.1 Terminal definition

```ts
export type ShellProfileId =
  | 'git-bash'
  | 'powershell'
  | 'pwsh'
  | 'cmd'
  | 'wsl'

export interface TerminalDefinition {
  id: string
  title: string
  cwd: string
  shellProfileId: ShellProfileId
  startupCommand?: string
}
```

---

## 6.2 Runtime terminal session

```ts
export type TerminalSessionStatus =
  | 'starting'
  | 'running'
  | 'exited'
  | 'failed'

export interface TerminalSessionInfo {
  id: string
  definition: TerminalDefinition
  status: TerminalSessionStatus
  exitCode?: number
  createdAt: number
}
```

Important:

`TerminalSessionInfo` is serializable.

The actual `node-pty` instance remains internal to Main.

---

## 6.3 Workspace

```ts
export interface Workspace {
  id: string
  name: string
  version: 1
  terminals: TerminalDefinition[]
  activeTerminalId?: string
  createdAt: number
  updatedAt: number
}
```

Do not store UI component state directly inside the workspace.

Future layout metadata should be isolated:

```ts
export interface WorkspaceLayout {
  version: 1
  mode: 'tabs' | 'split'
}
```

---

## 6.4 Git repository state

```ts
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
```

---

# 7. Typed IPC Contracts

Use shared TypeScript contracts.

Do not scatter arbitrary strings throughout the project.

Example:

```ts
export const IPC = {
  terminal: {
    create: 'terminal:create',
    write: 'terminal:write',
    resize: 'terminal:resize',
    kill: 'terminal:kill',
    data: 'terminal:data',
    exit: 'terminal:exit'
  },

  workspace: {
    list: 'workspace:list',
    get: 'workspace:get',
    save: 'workspace:save',
    delete: 'workspace:delete'
  },

  git: {
    inspect: 'git:inspect'
  }
} as const
```

---

# 8. Renderer API Contract

The preload layer should expose one stable API:

```ts
window.gitdeck
```

Expected structure:

```ts
interface GitDeckApi {
  terminal: {
    create(
      request: TerminalCreateRequest
    ): Promise<TerminalSessionInfo>

    write(
      sessionId: string,
      data: string
    ): void

    resize(
      sessionId: string,
      cols: number,
      rows: number
    ): void

    kill(
      sessionId: string
    ): Promise<void>

    onData(
      callback: TerminalDataCallback
    ): Unsubscribe

    onExit(
      callback: TerminalExitCallback
    ): Unsubscribe
  }

  workspace: {
    list(): Promise<WorkspaceSummary[]>
    get(id: string): Promise<Workspace>
    save(workspace: Workspace): Promise<Workspace>
    delete(id: string): Promise<void>
  }

  git: {
    inspect(path: string): Promise<GitRepositoryStatus | null>
  }

  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
}
```

Do not expose `ipcRenderer`.

Do not expose raw Electron objects.

---

# 9. Terminal Feature

## Scope

Terminal feature owns:

- PTY creation
- input/output
- resize
- process exit
- shell profiles
- terminal runtime lifecycle

Terminal feature does NOT own:

- workspaces
- Git status
- tab visual appearance
- persistence
- split layout

---

## Core interface

```ts
export interface PtyProcess {
  write(data: string): void

  resize(
    cols: number,
    rows: number
  ): void

  kill(): void

  onData(
    callback: (data: string) => void
  ): () => void

  onExit(
    callback: (exitCode: number) => void
  ): () => void
}
```

Infrastructure:

```ts
export interface PtyFactory {
  create(
    options: CreatePtyOptions
  ): PtyProcess
}
```

`NodePtyAdapter` implements this interface.

This allows terminal logic to be tested without starting real shells.

---

# 10. Workspace Feature

## Scope

Workspace owns:

- workspace definitions
- terminal definitions belonging to workspace
- save/load/delete workspace
- active terminal definition
- startup commands

Workspace DOES NOT own live PTY objects.

---

## Workspace startup flow

```text
User opens workspace
        │
        ▼
WorkspaceService loads definition
        │
        ▼
Renderer receives Workspace
        │
        ▼
Renderer requests terminal.create()
for each terminal definition
        │
        ▼
TerminalService creates PTYs
        │
        ▼
Tabs bind session IDs to terminal definitions
```

Live runtime state and persisted workspace state remain separate.

---

# 11. Git Feature

## Initial scope

Git feature is read-only.

It may:

- detect repository root
- detect branch
- calculate ahead/behind
- count changed files
- report clean/dirty state

It MUST NOT initially:

- commit
- push
- pull
- rebase
- merge
- reset
- modify Git configuration

Those become separate future feature scopes.

---

# 12. Settings Feature

Initial settings:

```ts
interface AppSettings {
  defaultShellProfileId: string

  terminal: {
    fontSize: number
    cursorBlink: boolean
  }

  behavior: {
    restoreLastWorkspace: boolean
    confirmBeforeClosingRunningTerminal: boolean
  }
}
```

Keep settings versioned.

---

# 13. Renderer State Strategy

Use Zustand.

Separate stores by feature.

Do NOT create one giant global store.

Recommended stores:

```text
terminalStore
workspaceStore
gitStore
settingsStore
uiStore
```

---

## terminalStore

Owns only serializable renderer-side terminal metadata.

Example:

```ts
interface TerminalUiState {
  sessions: Record<string, TerminalSessionInfo>
  order: string[]
  activeSessionId: string | null
}
```

Never store `Terminal` objects from xterm.js in Zustand.

xterm instances should stay in component/ref-level lifecycle.

---

# 14. Terminal View Lifecycle

Each `TerminalView` owns:

```text
xterm Terminal instance
FitAddon
ResizeObserver
DOM element
subscriptions
```

Expected lifecycle:

```text
mount
 ↓
create xterm instance
 ↓
open DOM
 ↓
register PTY data listener
 ↓
register keyboard input
 ↓
register resize observer
 ↓
fit terminal
 ↓
send PTY resize

unmount
 ↓
unsubscribe events
 ↓
dispose xterm
```

Closing a React view must not automatically kill the PTY unless the user closes the terminal session.

This distinction is important for future split panes and movable tabs.

---

# 15. UI Layout

Initial UI:

```text
┌─────────────────────────────────────────────────────────────┐
│ Titlebar / App controls                                     │
├───────────────┬─────────────────────────────────────────────┤
│ Workspace     │ Tab bar                                     │
│ sidebar       ├─────────────────────────────────────────────┤
│               │                                             │
│ repositories  │ Active terminal                             │
│ workspaces    │                                             │
│               │ xterm.js                                    │
│               │                                             │
├───────────────┴─────────────────────────────────────────────┤
│ Status bar                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

# 16. UI Component Boundaries

## App Shell

Owns:

- global layout
- sidebar placement
- content region
- status bar
- top-level dialogs

Does not own terminal logic.

---

## TerminalTabBar

Receives:

```ts
interface Props {
  terminals: TerminalSessionInfo[]
  activeId: string | null

  onActivate(id: string): void
  onClose(id: string): void
  onCreate(): void
}
```

It must not call IPC directly.

---

## TerminalView

Receives:

```ts
interface Props {
  sessionId: string
}
```

Internally talks to a terminal feature hook/service.

It must not know workspace persistence logic.

---

## WorkspaceSidebar

Owns display of:

- workspaces
- repositories
- open action

It delegates actual operations to workspace hooks/store.

---

# 17. UX for MVP

Keyboard shortcuts:

```text
Ctrl+T          New terminal
Ctrl+W          Close terminal
Ctrl+Tab        Next terminal
Ctrl+Shift+Tab  Previous terminal
Ctrl+Shift+P    Reserved for command palette
```

Terminal context menu:

```text
Copy
Paste
Clear
Rename tab
Duplicate terminal
Close terminal
```

Only implement commands explicitly included in current milestone.

---

# 18. Error Handling

Define domain/application errors.

Examples:

```ts
class ShellNotFoundError extends Error {}
class TerminalSessionNotFoundError extends Error {}
class WorkspaceNotFoundError extends Error {}
class InvalidWorkspaceError extends Error {}
class GitNotAvailableError extends Error {}
```

IPC handlers must convert errors to serializable responses.

Renderer should never receive native Error objects containing internal Electron state.

---

# 19. Logging

Add a small logging abstraction early.

```ts
interface Logger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}
```

Log:

- terminal create/exit
- workspace load/save
- shell detection failure
- Git command failure
- unexpected IPC errors

Never log full environment variables.

---

# 20. Security Baseline

BrowserWindow:

```ts
webPreferences: {
  preload,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true
}
```

Rules:

- Do not expose filesystem APIs to renderer.
- Validate IPC input.
- Do not execute arbitrary commands through generic IPC endpoints.
- Do not create an IPC API such as:

```ts
window.exec(command)
```

Avoid this entirely.

Instead expose intent-specific operations.

---

# 21. Testing Strategy

Use three test levels.

## Unit

Test:

- domain logic
- TerminalManager using fake PtyFactory
- workspace serialization
- shell profile selection
- Git parser
- Zustand state transitions

---

## Integration

Test:

- IPC handler ↔ service
- persistence adapter
- Git CLI adapter
- shell detector

---

## E2E

Use Playwright for Electron if practical.

Critical flows:

1. App starts.
2. Create terminal.
3. Type `echo hello`.
4. Output appears.
5. Create second terminal.
6. Switch tabs.
7. Close terminal.
8. Save workspace.
9. Restart app.
10. Restore workspace definitions.

---

# 22. Milestone Roadmap

---

# Phase 0 — Project Foundation

## Goal

Create a clean Electron application that can be safely extended.

## Tasks

- [ ] Scaffold Electron + React + TypeScript project.
- [ ] Configure ESLint.
- [ ] Configure Prettier.
- [ ] Configure TypeScript strict mode.
- [ ] Configure path aliases.
- [ ] Create folder architecture.
- [ ] Add Zustand.
- [ ] Add xterm.js.
- [ ] Add node-pty.
- [ ] Configure Electron native dependency rebuild.
- [ ] Configure Vitest.
- [ ] Add basic logger.
- [ ] Configure preload/contextBridge.
- [ ] Add typed `window.gitdeck` declaration.
- [ ] Create application bootstrap/container.
- [ ] Add CI typecheck/test script.

## Acceptance Criteria

```text
npm run dev
```

opens the Electron window.

And:

```text
npm run typecheck
npm run lint
npm test
```

all succeed.

Renderer has no Node.js globals available.

## Definition of Done

No terminal feature yet.

Do not add Git/workspace logic in Phase 0.

---

# Phase 1 — Terminal Engine

## Goal

Main process can create and manage multiple independent PTY sessions.

## Tasks

- [ ] Define terminal domain models.
- [ ] Define `PtyProcess`.
- [ ] Define `PtyFactory`.
- [ ] Implement fake PtyFactory for tests.
- [ ] Implement `NodePtyAdapter`.
- [ ] Implement `TerminalManager`.
- [ ] Implement terminal create.
- [ ] Implement terminal input.
- [ ] Implement terminal resize.
- [ ] Implement terminal kill.
- [ ] Implement PTY output events.
- [ ] Implement exit events.
- [ ] Cleanup all sessions when app exits.
- [ ] Add tests for session lifecycle.

## Acceptance Criteria

Automated tests prove:

```text
create session
write input
receive output
resize
kill
receive exit
```

Multiple sessions remain isolated.

## Out of Scope

- xterm UI
- tabs
- Git
- workspace
- persistence

---

# Phase 2 — Typed Terminal IPC

## Goal

Expose terminal engine safely to renderer.

## Tasks

- [ ] Define terminal IPC channels.
- [ ] Define request/response types.
- [ ] Add input validation.
- [ ] Register terminal IPC handlers.
- [ ] Implement terminal preload API.
- [ ] Add `onData`.
- [ ] Add `onExit`.
- [ ] Ensure subscriptions return cleanup functions.
- [ ] Ensure no `ipcRenderer` leaks into renderer.
- [ ] Add IPC integration tests.

## Acceptance Criteria

A temporary renderer debug button can:

```text
create PTY
write "echo hello"
receive output
kill PTY
```

Remove debug UI before Phase 3 completion.

---

# Phase 3 — Terminal UI

## Goal

Render a fully interactive terminal.

## Tasks

- [ ] Build `TerminalView`.
- [ ] Initialize xterm.
- [ ] Add FitAddon.
- [ ] Add ResizeObserver.
- [ ] Forward keyboard input.
- [ ] Render PTY output.
- [ ] Sync terminal dimensions.
- [ ] Add terminal font CSS.
- [ ] Dispose resources correctly.
- [ ] Handle exited terminal state.
- [ ] Add copy.
- [ ] Add paste.

## Acceptance Criteria

User can interact with Git Bash or PowerShell exactly like a normal shell:

```text
git status
npm --version
cd ..
clear
```

ANSI colors render correctly.

Resizing the window does not corrupt terminal layout.

---

# Phase 4 — Multi-Tab Terminal UI

## Goal

Allow users to manage multiple terminals.

## Tasks

- [ ] Implement terminal Zustand store.
- [ ] Implement tab bar.
- [ ] Implement active tab state.
- [ ] Implement create tab.
- [ ] Implement close tab.
- [ ] Implement switch tab.
- [ ] Implement rename tab.
- [ ] Add keyboard shortcuts.
- [ ] Add close confirmation when process is running.
- [ ] Ensure hidden tabs retain their PTY sessions.
- [ ] Ensure xterm instances are safely restored/rendered when switching.

## Acceptance Criteria

User can run:

```text
Tab 1: npm run dev
Tab 2: git status
Tab 3: powershell
```

Switching tabs does not stop any process.

Closing one tab does not affect others.

---

# Phase 5 — Shell Profiles

## Goal

Support multiple Windows shell types without coupling them to terminal UI.

## Tasks

- [ ] Create `ShellProfile` domain model.
- [ ] Implement shell profile registry.
- [ ] Detect Git Bash.
- [ ] Detect PowerShell.
- [ ] Detect PowerShell 7.
- [ ] Detect CMD.
- [ ] Detect WSL.
- [ ] Add shell picker in New Terminal flow.
- [ ] Persist default shell setting.
- [ ] Handle unavailable shell gracefully.

## Acceptance Criteria

New Terminal dialog lists only available profiles.

User can choose:

```text
Git Bash
PowerShell
PowerShell 7
Command Prompt
WSL
```

when installed.

---

# Phase 6 — Workspace Domain + Persistence

## Goal

Persist groups of terminal definitions independently from live sessions.

## Tasks

- [ ] Define `Workspace`.
- [ ] Define `WorkspaceRepository` interface.
- [ ] Implement JSON persistence adapter.
- [ ] Add version field.
- [ ] Validate persisted data.
- [ ] Implement list.
- [ ] Implement get.
- [ ] Implement save.
- [ ] Implement delete.
- [ ] Add workspace IPC.
- [ ] Add preload workspace API.
- [ ] Add unit/integration tests.

## Suggested persistence directory

```text
app.getPath('userData')/
  workspaces/
    <workspace-id>.json
```

## Acceptance Criteria

Workspace JSON survives app restart.

Corrupt workspace files do not crash the application.

---

# Phase 7 — Workspace UI

## Goal

Allow users to create and open terminal workspaces.

## Tasks

- [ ] Add sidebar.
- [ ] Add workspace list.
- [ ] Add Create Workspace dialog.
- [ ] Add workspace editor.
- [ ] Add terminal definition editor.
- [ ] Support title.
- [ ] Support cwd.
- [ ] Support shell profile.
- [ ] Support optional startup command.
- [ ] Implement Open Workspace.
- [ ] Spawn sessions from definitions.
- [ ] Implement Save Workspace.
- [ ] Persist active workspace ID.

## Acceptance Criteria

User can create:

```text
Workspace: My SaaS

Backend
D:\Projects\my-saas\backend
Git Bash
npm run dev

Frontend
D:\Projects\my-saas\frontend
Git Bash
npm run dev
```

Opening the workspace creates both terminals.

---

# Phase 8 — Session/Layout Restore

## Goal

Restore user workspace configuration after app restart.

## Important Scope Boundary

Restore terminal **definitions**, not live PTY processes.

Closing the Electron app may stop terminal processes.

## Tasks

- [ ] Persist last workspace ID.
- [ ] Persist active terminal definition.
- [ ] Restore workspace on startup when enabled.
- [ ] Recreate PTY sessions.
- [ ] Re-run startup commands only after explicit configurable behavior.
- [ ] Add restore setting.
- [ ] Handle missing cwd.
- [ ] Handle missing shell profile.

## Acceptance Criteria

Restarting app restores:

```text
workspace
terminal tabs
tab names
cwd
shell profile
active tab
```

No promise of preserving existing process state.

---

# Phase 9 — Read-Only Git Integration

## Goal

Add Git awareness without changing terminal behavior.

## Tasks

- [ ] Define Git adapter interface.
- [ ] Implement Git CLI adapter.
- [ ] Detect repository root.
- [ ] Detect current branch.
- [ ] Parse status.
- [ ] Parse ahead/behind.
- [ ] Add GitService.
- [ ] Add Git IPC.
- [ ] Add Git renderer store.
- [ ] Show branch in status bar.
- [ ] Show dirty indicator in sidebar/tab.
- [ ] Refresh on interval with debounce.
- [ ] Refresh after terminal focus or cwd changes where possible.

## Acceptance Criteria

For a terminal cwd inside a Git repository, UI displays:

```text
main
clean
```

or:

```text
feature/auth
3 modified
1 untracked
↑2 ↓1
```

Terminal remains fully usable when Git is not installed.

---

# Phase 10 — UI Polish

## Goal

Make MVP pleasant enough for daily use.

## Tasks

- [ ] Dark theme.
- [ ] Consistent spacing/tokens.
- [ ] Loading states.
- [ ] Empty states.
- [ ] Error toast system.
- [ ] Context menus.
- [ ] Keyboard focus management.
- [ ] Accessible buttons.
- [ ] Scroll behavior.
- [ ] Titlebar polish.
- [ ] App icon.
- [ ] Terminal status bar.
- [ ] Settings screen.

## Acceptance Criteria

Primary flows require no developer console.

No major UI action is available only through mouse if a reasonable keyboard shortcut exists.

---

# Phase 11 — Packaging

## Goal

Produce a distributable Windows build.

## Tasks

- [ ] Configure electron-builder or Electron Forge.
- [ ] Build x64 Windows installer.
- [ ] Verify node-pty native module packaging.
- [ ] Configure app icon.
- [ ] Configure version metadata.
- [ ] Add production logs.
- [ ] Test clean Windows install.
- [ ] Test Git Bash detection.
- [ ] Test PowerShell detection.
- [ ] Test app uninstall.

## Acceptance Criteria

A clean Windows machine can install and launch the application from an installer.

No development dependency is required on the target machine.

---

# 23. MVP Release Boundary

Version `0.1.0` should include only:

```text
Electron application
Multi-tab terminals
Git Bash / PowerShell / CMD / WSL profiles
Workspace creation
Workspace persistence
Workspace restore
Read-only Git status
Basic settings
Windows installer
```

Do NOT include in `0.1.0`:

```text
split panes
SSH manager
Git commit UI
Git push/pull UI
live PTY daemon
plugin system
cloud sync
AI commands
terminal collaboration
Docker manager
remote filesystem
```

---

# 24. Feature Upgrade Map

Each future feature should be independently scoped.

---

## Feature: Split Panes

Depends on:

```text
terminal sessions
renderer layout
```

Does not require:

```text
terminal engine rewrite
workspace rewrite
Git rewrite
```

Introduce:

```ts
type LayoutNode =
  | {
      type: 'terminal'
      sessionId: string
    }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      children: LayoutNode[]
    }
```

---

## Feature: Git Actions

Separate package/module:

```text
features/git-actions
```

Potential commands:

```text
stage
unstage
commit
fetch
pull
push
checkout
```

Do not add these into read-only `GitService`.

---

## Feature: Persistent PTY Daemon

Separate architectural feature.

Future architecture:

```text
Electron Renderer
      │
Electron Main
      │
Local IPC
      │
GitDeck Daemon
      │
PTY sessions
```

This allows Electron UI to restart without killing shell processes.

Must NOT be implemented until explicitly scoped.

---

## Feature: SSH

Separate feature:

```text
features/ssh
```

Prefer launching `ssh` through PTY first.

Do not initially build a custom SSH protocol implementation.

---

## Feature: Command Palette

Separate renderer feature.

Commands registered through a common interface:

```ts
interface AppCommand {
  id: string
  title: string
  shortcut?: string
  execute(): void | Promise<void>
}
```

Features register commands without the palette importing their internals.

---

# 25. Dependency Direction

Allowed:

```text
UI
 ↓
application API
 ↓
domain
 ↑
infrastructure implements interfaces
```

Forbidden:

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

# 26. Claude Code Working Rules

When implementing this project, Claude Code MUST follow these rules.

## Before implementing a phase

1. Read this `PLAN.md`.
2. Identify the exact phase.
3. List files expected to change.
4. Do not implement later-phase features.
5. Preserve public interfaces unless the current task explicitly changes them.

---

## During implementation

Claude Code should:

- prefer small commits
- keep TypeScript strict
- add tests alongside business logic
- avoid giant files
- avoid generic utility dumping grounds
- prefer explicit interfaces
- preserve feature boundaries
- avoid premature abstractions
- never bypass preload isolation for convenience

---

## After implementation

Claude Code should run:

```bash
npm run typecheck
npm run lint
npm test
```

When UI/Electron behavior changes, also run the app manually or run available E2E tests.

Report:

```text
Implemented:
Changed files:
Tests:
Known limitations:
Out of scope:
```

---

# 27. Suggested Commit Strategy

Use commits per bounded change.

Examples:

```text
chore: scaffold electron react application

feat(terminal): add PTY abstraction

feat(terminal): implement node-pty adapter

feat(terminal): add terminal manager

feat(ipc): expose typed terminal API

feat(ui): render xterm terminal

feat(ui): add terminal tabs

feat(shell): detect windows shell profiles

feat(workspace): add workspace persistence

feat(workspace): add workspace sidebar

feat(git): add read-only repository status

feat(settings): persist terminal preferences

build: package windows installer
```

Avoid commits such as:

```text
finish app
various changes
fix stuff
big update
```

---

# 28. Suggested Task Size for Claude Code

Ideal task = 1 feature slice.

Good:

```text
Implement Phase 1 TerminalManager with fake PtyFactory and tests.
Do not implement IPC or UI.
```

Good:

```text
Implement terminal IPC from Phase 2.
Use the existing TerminalService.
Do not alter workspace or Git features.
```

Bad:

```text
Build the whole app.
```

Bad:

```text
Implement terminal, Git, workspace, split panes and installer.
```

---

# 29. Copy/Paste Prompt Template for Claude Code

Use this template for each task:

```text
Read PLAN.md first.

Implement only:

<PHASE / FEATURE>

Scope:
<EXACT SCOPE>

Requirements:
<REQUIREMENTS>

Do not implement:
<OUT OF SCOPE>

Architecture constraints:
- Respect feature boundaries in PLAN.md.
- UI must not access Node/Electron APIs directly.
- Native terminal lifecycle remains in Electron Main.
- Use typed IPC contracts.
- Keep domain logic independent from React/Electron.
- Do not import feature internals across feature boundaries.

Testing:
- Add/update relevant tests.
- Run typecheck.
- Run lint.
- Run tests.

At completion report:
1. Implemented
2. Files changed
3. Tests added/run
4. Known limitations
5. Explicitly deferred items
```

---

# 30. Recommended First Claude Code Tasks

## Task 1

```text
Read PLAN.md.

Implement Phase 0 only.

Scaffold and normalize the Electron + React + TypeScript architecture.
Create the directory boundaries described in PLAN.md.
Configure TypeScript strict mode, ESLint, Prettier and Vitest.
Create the secure preload skeleton and typed window.gitdeck placeholder.

Do not implement node-pty terminal behavior yet.
Do not implement Git.
Do not implement workspace persistence.
```

---

## Task 2

```text
Read PLAN.md.

Implement Phase 1 only: Terminal Engine.

Create the terminal domain models, PtyProcess/PtyFactory interfaces,
FakePtyFactory, NodePtyAdapter and TerminalManager.

Add unit tests that validate independent terminal session lifecycle.

Do not implement renderer UI.
Do not implement IPC.
Do not implement workspaces or Git.
```

---

## Task 3

```text
Read PLAN.md.

Implement Phase 2 only: Typed Terminal IPC.

Expose the existing TerminalManager through intent-specific IPC APIs.

Renderer API must be available as:

window.gitdeck.terminal

Do not expose ipcRenderer.
Do not expose generic command execution.
Do not build terminal UI yet.
```

---

## Task 4

```text
Read PLAN.md.

Implement Phase 3 only: Terminal UI.

Integrate xterm.js with the existing window.gitdeck.terminal API.
Implement resize handling, input forwarding, output rendering,
subscription cleanup and exited-state UI.

Do not build multi-tab functionality yet.
```

---

## Task 5

```text
Read PLAN.md.

Implement Phase 4 only: Multi-Tab Terminal UI.

Add isolated terminal renderer store and tab components.
Support create, switch, rename and close.

Do not implement workspace persistence.
Do not implement Git status.
Do not implement split panes.
```

---

# 31. Architectural Checkpoint After Phase 5

Before implementing workspace features, verify:

- [ ] Renderer cannot import `electron`.
- [ ] Renderer cannot import `node-pty`.
- [ ] Domain modules cannot import React.
- [ ] Domain modules cannot import Electron.
- [ ] PTY instances exist only in Main.
- [ ] Closing one terminal does not impact others.
- [ ] TerminalManager has unit tests.
- [ ] IPC contracts are typed.
- [ ] Preload APIs are intent-specific.
- [ ] Terminal UI has cleanup logic.
- [ ] Shell detection is independent from UI.

If any item fails, fix architecture before continuing.

---

# 32. Architectural Checkpoint Before v0.1

Verify:

- [ ] Terminal feature works without Git feature.
- [ ] Workspace feature stores definitions, not PTY objects.
- [ ] Git feature is read-only.
- [ ] Settings are versioned.
- [ ] Persistence validates loaded data.
- [ ] Main process handles unexpected session exit.
- [ ] No generic `exec(command)` IPC exists.
- [ ] No feature imports another feature's internal path.
- [ ] All features expose `public.ts`.
- [ ] Production build contains native node-pty correctly.
- [ ] Clean Windows installation has been tested.

---

# 33. Final MVP Data Flow

```text
User clicks New Terminal
        │
        ▼
Terminal UI action
        │
        ▼
terminalStore action
        │
        ▼
window.gitdeck.terminal.create()
        │
        ▼
Preload typed bridge
        │
        ▼
Terminal IPC handler
        │
        ▼
TerminalService
        │
        ▼
TerminalManager
        │
        ▼
PtyFactory
        │
        ▼
NodePtyAdapter
        │
        ▼
Git Bash / PowerShell / CMD / WSL


PTY output
        │
        ▼
TerminalManager
        │
        ▼
IPC event
        │
        ▼
Preload callback
        │
        ▼
Terminal feature hook
        │
        ▼
xterm.js
```

---

# 34. Definition of Architecture Success

The architecture is successful when adding a feature such as:

```text
Split panes
```

requires mostly changes inside:

```text
renderer/features/layout
workspace layout model
```

without rewriting the terminal engine.

Adding:

```text
Git commit UI
```

should require mostly:

```text
main/features/git-actions
renderer/features/git-actions
```

without modifying `NodePtyAdapter`.

Adding:

```text
SSH
```

should reuse terminal sessions and shell profiles without changing workspace persistence.

That is the core design constraint for this project.

---

# 35. Recommended Development Order

Strict implementation order:

```text
0. Foundation
      ↓
1. Terminal engine
      ↓
2. Terminal IPC
      ↓
3. Single terminal UI
      ↓
4. Multi-tab UI
      ↓
5. Shell profiles
      ↓
──────── Architecture checkpoint ────────
      ↓
6. Workspace domain/persistence
      ↓
7. Workspace UI
      ↓
8. Restore
      ↓
9. Git read-only integration
      ↓
10. UI polish
      ↓
11. Windows packaging
      ↓
──────────── v0.1.0 ────────────────────
```

Do not reorder Workspace/Git ahead of a stable terminal engine.

---

# 36. Product North Star

The MVP is not intended to replace a full Git GUI.

It should become:

> **A project-aware Windows terminal workspace manager for developers.**

The key abstraction is:

```text
Workspace
   ↓
Terminal Definitions
   ↓
Runtime Terminal Sessions
   ↓
Optional Feature Metadata
      ├── Git
      ├── layout
      ├── SSH
      └── future integrations
```

Keep this abstraction intact as the project grows.
