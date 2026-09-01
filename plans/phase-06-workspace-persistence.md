# Phase 6 — Workspace Domain + Persistence

| | |
|---|---|
| **Purpose** | Persist **serializable terminal definitions** to disk, strictly separated from live PTY sessions. |
| **Depends on** | Checkpoint A |
| **Unlocks** | Phase 7, Phase 8 |
| **Status** | ☑ Done 2026-08-28 |

---

## Why this phase is separate

The single most damaging mistake available here is letting runtime session state leak into persisted state. Building the persistence layer headless — no UI to tempt shortcuts — keeps `Workspace` a pure data record.

---

## Scope

Workspace **owns**: workspace definitions, the terminal definitions inside them, save/load/delete, active terminal definition, startup commands.

Workspace **does not own**: live PTY objects, session IDs, xterm state, layout rendering.

**Out:** sidebar, dialogs, any React (Phase 7); startup restore (Phase 8).

---

## Persistence layout

```text
app.getPath('userData')/
  workspaces/
    <workspace-id>.json
```

Every file carries `version: 1`. Loading validates before use.

---

## Tasks

- [x] Define `Workspace`.
- [x] Define `WorkspaceRepository` interface.
- [x] Implement JSON persistence adapter.
- [x] Add version field.
- [x] Validate persisted data.
- [x] Implement list.
- [x] Implement get.
- [x] Implement save.
- [x] Implement delete.
- [x] Add workspace IPC.
- [x] Add preload workspace API.
- [x] Add unit/integration tests.

---

## Files expected to change

```text
src/main/features/workspace/domain/Workspace.ts
src/main/features/workspace/domain/WorkspaceRepository.ts
src/main/features/workspace/application/WorkspaceService.ts
src/main/features/workspace/infrastructure/JsonWorkspaceRepository.ts
src/main/features/workspace/ipc/workspaceIpc.ts
src/main/features/workspace/public.ts
src/shared/contracts/ipc.ts
src/preload/workspaceApi.ts
```

---

## Test plan

> Conventions: `TESTING.md`. Repository tests use a real temp directory (that *is* the thing under test); service tests use the in-memory double.

| Test file | Covers |
|---|---|
| `src/main/features/workspace/testing/InMemoryWorkspaceRepository.ts` | double |
| `src/main/features/workspace/infrastructure/JsonWorkspaceRepository.integration.spec.ts` | real fs round-trip |
| `src/main/features/workspace/application/WorkspaceService.spec.ts` | use cases |
| `tests/fixtures/workspace/` | `valid.json` · `corrupt.json` · `wrong-version.json` · `missing-fields.json` |

**Round-trip**

- [x] `save` then `get` returns every field unchanged, including nested terminal definitions.
- [x] `save` preserves `createdAt` and advances `updatedAt`.
- [x] `list` returns summaries only — not full terminal definitions.
- [x] A workspace with **zero** terminals saves and loads as valid.
- [x] `activeTerminalId` referring to a definition that was deleted is handled per the documented rule.
- [x] Unicode and Windows paths with spaces and backslashes survive the round-trip.

**The critical assertion**

- [x] **The serialized JSON contains no `sessionId`, no runtime `status`, no `exitCode`, and no PTY reference.** Assert on the raw file text, not on the parsed object.

**Corrupt and invalid input** (drive from the fixtures)

- [x] `corrupt.json` (malformed JSON) → skipped in `list`, logged, no throw.
- [x] `corrupt.json` → `get` raises `InvalidWorkspaceError`.
- [x] `missing-fields.json` → rejected by validation, not partially loaded.
- [x] `wrong-version.json` → handled explicitly per the documented rule, never silently accepted.
- [x] A file whose name is not a valid workspace id is ignored.
- [x] One corrupt file among four valid ones still yields three valid entries from `list`.

**Errors**

- [x] `get` with an unknown id raises `WorkspaceNotFoundError`.
- [x] `delete` with an unknown id follows the documented behavior (assert whichever is chosen).
- [x] `delete` removes the file from disk.

**Durability**

- [x] An interrupted write does not leave a truncated workspace file (write-temp-then-rename).
- [x] Two rapid saves of the same workspace end with the later content, not a merged corrupt file.

**Boundary**

- [x] The workspace feature imports only `../terminal/public`, never terminal internals.
- [x] Every IPC response survives `structuredClone`.

---

## Verification — 2026-08-28

```text
npm run typecheck   pass
npm run lint        pass
npm test            398 tests / 31 files   (was 322 / 27 after Phase 5)
npm run build       pass
```

**End-to-end against the built app, driven through the real renderer.** A CDP
probe evaluated `window.gitdeck.workspace.*` in the page, so every call took the
full path `renderer → preload → IPC → WorkspaceService → disk` and back. The app
was launched **twice** against the same throwaway `--user-data-dir`, which is
what makes the restart claim real rather than assumed:

```text
PASS  preload exposes the four workspace methods
PASS  save answers with ok:true through the real bridge
PASS  main minted a workspace id
PASS  list answers with a summary, not the definitions
PASS  an error crosses as data with its code intact
PASS  a malformed payload is rejected, not stored
PASS  exactly one file on disk, named after the id
PASS  THE CRITICAL ONE: no runtime state in the file
PASS  the workspace survives a full app restart
PASS  every field comes back, including the nested definition
PASS  delete removes it from disk
```

**Documented rules this phase had to choose.** Each was a fork the plan left
open, so each is recorded here rather than only in code:

| Situation | Rule |
|---|---|
| `activeTerminalId` names a removed terminal | dropped during validation — a stale reference, not a corrupt file |
| `version` is anything but `1` | rejected as `InvalidWorkspaceError`, never migrated, never silently accepted |
| `delete` with an unknown or malformed id | idempotent no-op; the caller already has the state it asked for |
| file name is not a minted workspace id | ignored silently — a stray file is not the app's business |
| file contents declare a different id than the file name | rejected, so `get(summary.id)` can never disagree with `list()` |
| a write fails | throws, unlike the settings store — the user explicitly asked to save, so failing silently is worse |

**The id is a filename, so it is an attack surface.** `get('../secret')` would
have read outside the workspace directory. Only a minted `ws_<uuid>` is ever
turned into a path; anything else is rejected before `node:fs` is touched.
`delete` refuses the same way. Covered by three tests that assert the guard
fires *before* any read.

**Timestamps are stamped in Main, never accepted from the caller.** `save` takes
a `WorkspaceInput` — no `version`, no `createdAt`, no `updatedAt`. A renderer
able to set `updatedAt` could make a stale workspace look newer than the one
that replaced it. `createdAt` is read back from the stored copy, so an overwrite
never rewrites history; if the stored copy is unreadable, it restarts rather
than failing the save.

**Guards were verified by planting violations, not by assuming.** Three
deliberate breakages were introduced and each was caught by name:

```text
workspace/domain/Workspace.ts → ../../terminal/application/TerminalManager   caught
workspace/domain/Workspace.ts imports node:fs                                caught
preload/workspaceApi.ts uses the literal 'workspace:list'                    caught
```

The second needed a new test — `architecture.spec.ts` now asserts that no
`features/*/domain` or `features/*/application` file imports `node:fs`, and
guards itself by checking that it can still detect the import in
`JsonSettingsStore.ts`, where one genuinely exists.

**One Test plan box is worth correcting.** "The workspace feature imports only
`../terminal/public`" is true but vacuous: the feature imports no terminal code
at all. It takes `TerminalDefinition` and `isShellProfileId` from
`@shared/contracts/terminal`, exactly as the terminal feature's own domain does,
because the renderer needs those types too. The cross-feature rule is still
enforced globally by `architecture.spec.ts`, which is what the planted violation
above proves.

**Known limitation.** `fakeGitDeckApi` still installs `workspace: {}` in the
renderer, so its shape no longer matches `WorkspaceApi`. Nothing in the renderer
reads it yet; Phase 7 owns that fake and its Test plan defines what it needs.

---

## Acceptance criteria

- Workspace JSON survives an app restart.
- A **corrupt** workspace file does not crash the application — it is reported as `InvalidWorkspaceError` and skipped in `list()`.
- A workspace containing zero terminals is valid.

---

## Definition of Done

- No PTY object, session ID, or xterm state is ever written to disk.
- The workspace feature does not import terminal internals — only `../terminal/public`.
- **Every box in the Test plan is ticked and `npm test` is green.**
- The four workspace fixtures exist and are reused by Phase 8.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-06-workspace-persistence.md.

Implement Phase 6 only: Workspace domain and persistence, including its full Test plan.

Define Workspace and WorkspaceRepository, implement a versioned and
validated JSON persistence adapter under userData/workspaces/, and expose
list/get/save/delete through typed IPC and the preload workspace API.

Persist definitions only — never live sessions, session IDs, or xterm state.
Corrupt files must be handled, not fatal.

Do not build workspace UI.
Do not implement startup restore.
Do not implement Git.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
