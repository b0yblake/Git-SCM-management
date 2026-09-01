# Phase 7 — Workspace UI

| | |
|---|---|
| **Purpose** | Let users author a workspace and open it — turning N stored definitions into N live sessions in one action. |
| **Depends on** | Phase 6 |
| **Unlocks** | Phase 8 |
| **Status** | ☑ Done 2026-08-28 |

---

## Why this phase is separate

This is where the product's core value first appears: one click spawns a whole project's terminals. It is UI + orchestration only — the persistence and engine layers below it must not change.

---

## Startup flow to implement

```text
User opens workspace
        ↓
WorkspaceService loads definition
        ↓
Renderer receives Workspace
        ↓
Renderer requests terminal.create() for each terminal definition
        ↓
TerminalService creates PTYs
        ↓
Tabs bind session IDs to terminal definitions
```

The binding `definitionId → sessionId` lives in renderer runtime state, **never** in the persisted workspace.

---

## Scope

**In:** sidebar, workspace list, create dialog, workspace editor, terminal definition editor (title / cwd / shell profile / optional startup command), open, save, active workspace ID.

**Out:** startup auto-restore (Phase 8), Git indicators (Phase 9), theming and polish (Phase 10), split layout.

---

## Tasks

- [x] Add sidebar.
- [x] Add workspace list.
- [x] Add Create Workspace dialog.
- [x] Add workspace editor.
- [x] Add terminal definition editor.
- [x] Support title.
- [x] Support cwd.
- [x] Support shell profile (reuse the Phase 5 registry).
- [x] Support optional startup command.
- [x] Implement Open Workspace.
- [x] Spawn sessions from definitions.
- [x] Implement Save Workspace.
- [x] Persist active workspace ID.

---

## Files expected to change

```text
src/renderer/src/features/workspace/store/workspaceStore.ts
src/renderer/src/features/workspace/components/WorkspaceSidebar.tsx
src/renderer/src/features/workspace/components/WorkspaceEditor.tsx
src/renderer/src/features/workspace/components/TerminalDefinitionEditor.tsx
src/renderer/src/features/workspace/hooks/useOpenWorkspace.ts
src/renderer/src/features/workspace/public.ts
src/renderer/src/app/App.tsx
```

`WorkspaceSidebar` delegates all operations to workspace hooks/store — no IPC calls inside components.

---

## Test plan

> Conventions: `TESTING.md`. jsdom project, driven by `fakeGitDeckApi` from Phase 3.

| Test file | Covers |
|---|---|
| `src/renderer/src/features/workspace/store/workspaceStore.spec.ts` | state transitions |
| `src/renderer/src/features/workspace/hooks/useOpenWorkspace.spec.ts` | the spawn orchestration |
| `src/renderer/src/features/workspace/components/WorkspaceEditor.spec.tsx` | validation |
| `src/renderer/src/features/workspace/components/WorkspaceSidebar.spec.tsx` | dumb-component contract |

**Open workspace — the core flow**

- [x] A workspace with two definitions calls `api.terminal.create` exactly twice.
- [x] Each create carries the matching `cwd`, `shellProfileId`, `title` and `startupCommand`.
- [x] A workspace with zero terminals opens cleanly and creates nothing.
- [x] The resulting tabs appear in definition order.
- [x] **One `create` rejecting does not abort the others** — the remaining terminals still open and the failure is surfaced (in the sidebar, not on a tab — see Verification).
- [x] Opening an already-open workspace follows the documented rule — assert whichever behavior was chosen.

**definitionId → sessionId binding**

- [x] The binding exists in renderer runtime state after opening.
- [x] **The binding is absent from the object passed to `api.workspace.save`** — assert on the saved payload.
- [x] Closing a tab clears only that binding.

**Editor validation**

- [x] Empty title is rejected with a visible message.
- [x] Empty `cwd` is rejected.
- [x] The shell profile dropdown is populated from the detected profile list, not a hardcoded array.
- [x] `startupCommand` is optional — saving without one is valid.
- [x] Adding, editing and removing a terminal definition each update the draft correctly.
- [x] Cancelling the editor discards the draft.

**Save semantics**

- [x] Clicking Save calls `api.workspace.save` once with the edited workspace.
- [x] **Renaming a tab at runtime does not by itself trigger a save** — saving is explicit.
- [x] Reordering tabs at runtime does not by itself mutate the stored workspace.
- [x] The active workspace ID is persisted when a workspace is opened.

**Boundary**

- [x] `WorkspaceSidebar` and `WorkspaceEditor` record zero direct `fakeGitDeckApi` calls — everything goes through hooks/store.
- [x] No Main-process terminal file changed this phase.

---

## Verification — 2026-08-28

```text
npm run typecheck   pass
npm run lint        pass
npm test            476 tests / 37 files   (was 398 / 31 after Phase 6)
npm run build       pass
```

**End-to-end against the built app, driven by clicking real DOM.** A CDP probe
found controls by accessible name and dispatched the events React listens for —
no test double anywhere in the path. It authored a workspace in the editor,
saved it, opened it, and restarted the app:

```text
PASS  the sidebar renders and says there is nothing saved yet
PASS  the shell dropdown was filled from real detection
PASS  the saved workspace appears in the sidebar with its terminal count
PASS  exactly one workspace file was written
PASS  the file holds definitions and no runtime state
PASS  opening spawned one tab per definition, in order
PASS  the workspace is marked open in the sidebar
PASS  each shell really started in the working directory its definition asked for
PASS  opening the same workspace again duplicates nothing
PASS  renaming a tab at runtime does not rewrite the saved workspace
PASS  the workspace is still listed after a restart
PASS  the app remembered which workspace was open
```

The cwd check is the one that proves the whole chain: two Git Bash prompts, one
reading `/c/Windows` and the other `/c/Users`, because that is what their
definitions asked for.

**Documented rules this phase had to choose:**

| Situation | Rule |
|---|---|
| opening the workspace that is already open | no-op — clicking it again never means "spawn a second copy of everything" |
| opening a workspace while another is open | its terminals are **added**; the previous workspace's sessions stay alive, because they are the user's running work |
| which tab gets focus after opening | the one bound to `activeTerminalId`, else the first definition — not whichever was created last |
| deleting the open workspace | the definition is removed, its terminals keep running, and `activeWorkspaceId` is cleared |
| a save rejected by Main | the editor stays open with the draft intact |

**One Test plan box was met differently than written.** The plan asked that a
failed `create` be "surfaced on its own tab". It is surfaced in the sidebar
instead, naming the terminal and the reason. A placeholder tab would have to
mount a `TerminalView` for a session that does not exist, which would subscribe
to output that never arrives and send resizes for an unknown id that Main would
log as rejected every time the window changed size. The requirement that
actually matters — one failure does not abort the rest — is covered by three
tests, including one asserting the surviving tabs are exactly the ones around
the failure.

**Runtime state and persisted state stay apart.** The `definitionId → sessionId`
binding lives only in `workspaceStore`; `save` sends a `WorkspaceInput`, which
has no field that could carry it. Two tests pin this down: one asserts the
binding exists after opening, another asserts nothing written to disk contains
`sess_`. Closing a tab prunes exactly its own binding, via a subscription to the
terminal store — the workspace feature never has to be told a session died.

**Saving is explicit, and that is tested from both ends.** Renaming a tab or
switching tabs writes nothing; the end-to-end probe confirmed the workspace file
is byte-identical after a runtime rename.

**The engine was not touched.** Nothing under `src/main/features/terminal/` was
modified — checked by mtime, not by memory. The only change to the renderer
terminal feature was exporting `useShellProfiles` from its `public.ts`, because
the workspace editor must render the detected shell list rather than invent one.

**The boundary guard was proved, not assumed.** Pointing `useOpenWorkspace` at
`terminal/store/terminalStore` instead of `terminal/public` was caught by name:

```text
renderer/src/features/workspace/hooks/useOpenWorkspace.ts → ../../terminal/store/terminalStore
```

**`AppSettings` gained `activeWorkspaceId`.** Adding a field is not a migration —
`normalizeSettings` defaults anything missing — but the renderer can now write to
settings, so `parsePatch` was rewritten to accept the two known fields
independently and reject anything else. `settingsIpc.spec.ts` is new: that
function is the only thing between the renderer and persisted settings, and it
had no test of its own before.

**Correction, found in Phase 8: startup commands were never actually run.**
Phase 7's acceptance criterion says "each running its startup command". That was
not true. The command was saved, sent over IPC and shown in the editor, but no
module ever wrote it to a PTY — a Phase 1 test even recorded the gap
("Running it is the renderer's decision, gated by settings in Phase 8"). No test
covered it here and the end-to-end probe checked `cwd` rather than the command,
so nothing caught it. Phase 8 implements it, gated: opening by hand runs the
commands, restoring at launch does not unless the user opts in.

**Known limitations.**

- Deleting a workspace does not ask for confirmation. `window.confirm` blocks
  the renderer (Phase 4 hit this), and a real dialog is Phase 10's scope.
- ~~The app still opens one terminal at startup, so opening a workspace leaves
  that extra tab beside the workspace's own.~~ Fixed in Phase 8, which moved the
  startup decision into `useRestoreOnStartup`.
- `useTerminalTabs.spec.ts` still carries a `withIncrementingIds()` helper that
  the fake now does by itself. Left in place — removing it would change the
  titles its assertions rely on, for no gain this phase.

---

## Acceptance criteria

The user can create:

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

Opening that workspace creates **both** terminals, each in its own cwd, each running its startup command.

---

## Definition of Done

- Reordering or renaming tabs at runtime does not silently mutate the saved workspace — saving is explicit.
- Opening a workspace twice does not duplicate sessions unexpectedly (define and document the chosen behavior).
- Zero changes to Main-process terminal code.
- **Every box in the Test plan is ticked and `npm test` is green.**

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-07-workspace-ui.md.

Implement Phase 7 only: Workspace UI, including its full Test plan.

Add the workspace sidebar, list, create dialog, workspace editor and
terminal definition editor (title, cwd, shell profile, optional startup
command). Implement Open Workspace so each definition spawns a session,
Save Workspace, and persistence of the active workspace ID.

Keep the definitionId to sessionId binding in renderer runtime state only.
Components must not call IPC directly.

Do not implement startup auto-restore.
Do not implement Git status.
Do not do visual polish or theming yet.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
