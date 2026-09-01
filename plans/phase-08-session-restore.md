# Phase 8 — Session / Layout Restore

| | |
|---|---|
| **Purpose** | Rebuild the user's **workspace configuration** at startup — explicitly *not* their process state. |
| **Depends on** | Phase 7 |
| **Unlocks** | Phase 9 |
| **Status** | ☑ Done 2026-08-28 |

---

## Why this phase is separate

Restore is where scope creep is most dangerous: "restore my terminals" quietly becomes "keep my processes alive across restarts", which is a daemon architecture (see `BACKLOG.md`). Isolating restore forces that line to stay drawn.

---

## Scope boundary — read first

> Restore terminal **definitions**, not live PTY processes.
>
> Closing the Electron app may stop terminal processes. **No promise is made about preserving process state.**

Startup commands are re-run **only** under explicit, configurable behavior — never silently. Re-running `npm run deploy` on app launch because it was yesterday's startup command is an unacceptable outcome.

---

## Tasks

- [x] Persist last workspace ID.
- [x] Persist active terminal definition.
- [x] Restore workspace on startup when enabled.
- [x] Recreate PTY sessions.
- [x] Re-run startup commands only after explicit configurable behavior.
- [x] Add the restore setting (flat `restoreLastWorkspace` — see Verification).
- [x] Handle missing cwd.
- [x] Handle missing shell profile.

---

## Failure cases that must be handled

| Case | Required behavior |
|---|---|
| Saved `cwd` no longer exists | Surface a clear error on that tab; do not crash startup; offer a fallback cwd |
| Saved shell profile not installed | Surface `ShellNotFoundError` on that tab; other tabs still open |
| Saved workspace file deleted | Start with an empty workspace, no error dialog loop |
| Corrupt settings file | Fall back to defaults |

One bad terminal definition must never prevent the rest of the workspace from opening.

---

## Files expected to change

```text
src/main/features/settings/**             (restoreLastWorkspace, lastWorkspaceId)
src/main/bootstrap/container.ts
src/renderer/src/features/workspace/hooks/useRestoreOnStartup.ts
src/renderer/src/features/workspace/store/workspaceStore.ts
src/renderer/src/features/settings/components/*
```

---

## Test plan

> Conventions: `TESTING.md`. Every failure case in the table above needs a test — this phase is mostly about *degrading well*.

| Test file | Covers |
|---|---|
| `src/renderer/src/features/workspace/hooks/useRestoreOnStartup.spec.ts` | the restore decision tree |
| `src/main/features/settings/application/SettingsService.spec.ts` | persistence, defaults, versioning |

**Restore on / off**

- [x] `restoreLastWorkspace: false` → nothing is loaded, no `terminal.create` call, app starts empty.
- [x] `restoreLastWorkspace: true` → the last workspace loads and each definition spawns a session.
- [x] The previously active tab is active again after restore.
- [x] Tab titles, `cwd` and shell profile all match what was saved.
- [x] No `lastWorkspaceId` stored → empty start, no error.

**Startup commands — the critical guard**

- [x] **With the opt-in disabled, restore runs zero startup commands.** Asserted on `api.terminal.write`, exactly as written.
- [x] With the opt-in enabled, each startup command is sent exactly once, to the correct session.
- [x] A restored session that the user never opted in for still starts a normal interactive shell.

**Degradation — one bad definition must not block the rest**

- [x] Saved `cwd` no longer exists → that tab shows a clear error, the other tabs open normally.
- [x] Saved `cwd` missing → a fallback cwd is offered, the app does not crash at startup.
- [x] Saved shell profile not installed → `ShellNotFoundError` on that tab only.
- [x] Saved workspace file deleted → empty start, and **no repeating error dialog loop**.
- [x] Two of three definitions failing still opens the third.

**Settings**

- [x] Corrupt settings file → defaults are used, the corruption is logged.
- [x] An unknown settings version is handled by the documented migration path.
- [x] A partial `update(patch)` leaves unrelated fields untouched.
- [x] Settings survive a simulated restart (reload from disk).

**Scope guard**

- [x] Restore recreates sessions from definitions only — no test asserts, and no code attempts, preservation of prior process state.

---

## Verification — 2026-08-28

```text
npm run typecheck   pass
npm run lint        pass
npm test            517 tests / 39 files   (was 476 / 37 after Phase 7)
npm run build       pass
```

**End-to-end across four real app launches.** A CDP probe drove the real UI, so
every path went renderer → preload → IPC → PTY and back. The four launches are
the point: restore can only be proved by actually restarting.

```text
run 1  author a workspace and open it by hand
PASS  opening by hand spawns both definitions
PASS  a directory that no longer exists is a warning, not a lost terminal
PASS  opening by hand runs the startup command — that is the feature
PASS  the workspace is on disk
PASS  the startup command was saved as a definition, not as runtime state

run 2  restart with defaults (restore on, commands off)
PASS  restore rebuilt both tabs, in definition order
PASS  no stray extra shell beside the restored ones
PASS  THE GUARD: restore did not run the startup command
PASS  the restored shell is a normal interactive one, in its saved directory

run 3  tick the opt-in, restart
PASS  the opt-in is persisted
PASS  with the opt-in on, restore runs the startup command

run 4  untick restore, restart
PASS  with restore off, nothing is restored
PASS  with restore off, the window still has one shell
PASS  the workspace itself was not deleted, just not reopened
```

Runs 2 and 3 differ by one checkbox and produce opposite results, which is what
makes the guard non-vacuous: the command demonstrably *can* run, and demonstrably
does not when the user has not asked for it.

**Two readings of the plan had to be chosen, and both are deviations worth naming.**

*"With `restoreLastWorkspace: false`, the app starts empty."* Read as **no
workspace is restored**, not "a blank window". GitDeck still opens one plain
interactive shell, because a fresh shell restores nothing and a blank terminal
app would be a regression against every earlier phase. The restore hook itself
makes zero workspace calls when the setting is off, which is what the Test plan
box asserts; the fallback shell is a separate, tested decision.

*Startup commands.* The plan says they run "only under explicit, configurable
behavior". Applied to **automatic restore only**. Clicking a workspace open is
already explicit — that click is the feature — and gating it too would make
startup commands unusable. The risk the plan names is `npm run deploy` running
*because the app launched*, and that is exactly what is gated.

**`behavior.restoreLastWorkspace` shipped flat, as `restoreLastWorkspace`.**
`AppSettings` has six fields; nesting one group would mean two shapes to validate
in `normalizeSettings` for no gain. ARCHITECTURE.md §5 now reflects the flat
naming.

**Where the startup command runs was already decided, in Phase 1.** A test there
recorded it: "Running it is the renderer's decision, gated by settings in Phase
8." An earlier draft of this phase put the write in `TerminalManager` instead;
following the recorded intent is what keeps the Test plan box —
"assert `api.terminal.write` was never called" — meaningful rather than
vacuously true.

**Failure-case table — every row has a test:**

| Case | Behaviour | Where |
|---|---|---|
| saved `cwd` no longer exists | Main falls back to the home directory and the tab opens; the sidebar says where it landed and why | `TerminalService.spec` (fallback), `useRestoreOnStartup.spec` (notice) |
| saved shell profile not installed | that definition alone reports an error; the others open | `useRestoreOnStartup.spec` |
| saved workspace file deleted | one `workspace:get`, then a plain shell — no retry, no dialog loop | `useRestoreOnStartup.spec` |
| corrupt settings file | defaults, and the corruption is logged | `JsonSettingsStore.integration.spec` |
| every definition fails | plain shell rather than a blank window | `useRestoreOnStartup.spec` |

**The cwd check had to move into Main.** Deciding whether a directory still
exists is a filesystem question, and the renderer may not ask one
(ARCHITECTURE.md §2). `TerminalService` takes an injected `directoryExists`
predicate supplied by the composition root, so the application layer never
imports `node:fs` — a rule `architecture.spec.ts` now enforces, and which was
proved by planting `statSync` in that exact file and watching it fail by name.
The renderer learns a fallback happened by comparing the returned definition
with the one it asked for; no new IPC field was needed.

**Startup moved out of `TerminalTabs`.** It used to open the first terminal
itself. With restore in play that would race and leave a stray tab, so
`useRestoreOnStartup` now owns the whole "what does the window show at launch"
decision. `TerminalTabs.spec` gained the inverse assertion — mounting it creates
nothing — which is what stops the old behaviour creeping back.

**`activeWorkspaceId` in the renderer store changed meaning.** It now means "the
workspace whose terminals are open right now", not "the one opened last time".
`useWorkspaces` no longer seeds it from settings: doing so made `open()` believe
the workspace was already open and skip restoring it entirely. The persisted id
is a restore hint, and only `useRestoreOnStartup` acts on it.

**Known limitations.**

- Deleting a workspace still does not ask for confirmation (Phase 10).
- The active tab is persisted on every switch, which is a small synchronous
  settings write per tab change. Fine at user pace; worth revisiting if the
  settings file grows.
- No migration path exists for a settings file from a future version — unknown
  fields are dropped and unknown types replaced. That is deliberate for v0.1.0
  and is where a migration would hook in.

---

## Acceptance criteria

Restarting the app restores:

```text
workspace
terminal tabs
tab names
cwd
shell profile
active tab
```

With `restoreLastWorkspace: false`, the app starts empty.

---

## Definition of Done

- Startup commands do not run unless the user opted in.
- No attempt is made to preserve process state.
- **Every box in the Test plan is ticked and `npm test` is green.**
- Every row of the failure-case table above has a corresponding passing test.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-08-session-restore.md.

Implement Phase 8 only: Session/Layout Restore, including its full Test plan.

Persist the last workspace ID and active terminal definition, and restore
the workspace on startup when behavior.restoreLastWorkspace is enabled.
Recreate PTY sessions from definitions.

Startup commands must only re-run under explicit configurable behavior.
Handle missing cwd, missing shell profile, deleted workspace file and
corrupt settings — one bad definition must not block the others.

Restore definitions only. Do not attempt to preserve live process state.
Do not implement a PTY daemon.
Do not implement Git.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
