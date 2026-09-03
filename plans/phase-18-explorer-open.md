# Phase 18 — Open in GitDeck (Explorer)

| | |
|---|---|
| **Purpose** | Shift+right-click a folder in Windows Explorer → **Open in GitDeck** (with the app icon) → that folder opens as a terminal: launching the app when it is closed, reusing the running window when it is open, focusing an existing terminal when one already sits at that path — always landing in the Grid layout. |
| **Depends on** | Phase 13 (Mosaic/Grid), Phase 8 (restore — the duplicate check runs after it) |
| **Status** | ☑ Complete — implemented and verified 2026-09-03 (see Verification) |

---

## Why this phase is separate

Three OS integrations arrive at once, each with its own failure mode: a
**registry** context-menu entry (must not require elevation, must be removed
by the uninstaller), a **single-instance lock** (a behavioral change — two
GitDecks can no longer run side by side; the second forwards and exits), and
an **argument channel** (`--open-path`) that must survive both cold start and
forwarding into a live window without racing session restore.

## Scope boundary

**In:** per-user (HKCU) Explorer context menu on folders and folder
backgrounds, shown on Shift+right-click only, labeled **Open in GitDeck**
with the exe's icon; self-healing registration on every packaged launch;
uninstaller cleanup; `--open-path <dir>` parsing with validation;
single-instance lock with argv forwarding and window focus; renderer flow
that waits for restore, focuses an existing running terminal at the same
path (case-insensitive, separator- and trailing-slash-tolerant) or creates
one titled after the folder, switching the layout to Grid either way.

**Out:** files (folders only), elevation/HKLM, non-Windows platforms,
multi-window routing, opening a *workspace* by path, shell-picker choice in
the menu, dev-mode registry registration (packaged only — dev tests via the
CLI flag).

## Design

```text
Explorer (Shift+RClick) ── reg: Directory[\Background]\shell\GitDeck
        ▼
"GitDeck.exe" --open-path "<dir>"
        ▼
requestSingleInstanceLock ──false──▶ forwards argv to the holder, exits
        │true                              │ second-instance: focus window,
        ▼                                  ▼ validate, push terminal:openpath
bootstrap/openPath queues the validated dir
        ▼
renderer (after restore settles) pulls terminal:pendingpath once,
listens for terminal:openpath pushes, and for each path:
  Grid layout → existing running session at samePath? focus it
                                            else create {cwd, title: basename}
```

- Validation in Main (`bootstrap/openPath.ts`): absolute, exists, is a
  directory — anything else is logged and dropped; the window still focuses.
- The registry writer (`bootstrap/explorerMenu.ts`) runs `reg.exe add` with
  fixed argument arrays (no shell), only when packaged, rewriting the four
  values per key each launch so a moved install self-heals. `Extended`
  keeps the entry behind Shift. The uninstaller deletes both keys
  (`build/installer.nsh`).
- Restore-first ordering: `WorkspacePanel` reports restore settled → `App`
  hands `TerminalDeck` an `openPathReady` flag → the open-path hook queues
  events until then, so a restored terminal at the same path is found, not
  duplicated.

## Files expected to change

```text
plans/README.md
src/shared/contracts/{ipc.ts, terminal.ts, ipc.spec.ts, ipc.snapshot.spec.ts}
src/main/bootstrap/{openPath.ts, openPathIpc.ts, explorerMenu.ts (new + specs), container.ts, registerIpc.ts}
src/main/index.ts
src/preload/{terminalApi.ts, api.ts}
src/renderer/src/features/terminal/hooks/{useOpenPath.ts (new + spec), useTerminalSessions.ts}
src/renderer/src/features/terminal/components/TerminalDeck.tsx
src/renderer/src/features/workspace/components/WorkspacePanel.tsx
src/renderer/src/app/App.tsx
src/renderer/src/testing/fakeGitDeckApi.ts
build/installer.nsh (new) · electron-builder.yml
```

## Test plan

- [x] `--open-path` parsing: split and `=` forms, missing value, relative
      path, nonexistent path, a file instead of a directory — all dropped
      with a log; a valid directory is resolved and queued.
- [x] `takePending` answers once, then null; a later accept overwrites.
- [x] Registry writer: exact `reg add` argument arrays — both key branches,
      `Extended` present, icon `"<exe>",0`, command `"<exe>" --open-path
      "%1"` / `"%V"`, `/f` everywhere; a failed call logs and does not throw.
- [x] `terminal:pendingpath` rejects payloads and drains the queue.
- [x] Renderer hook: events queue until `openPathReady`; a running session
      at the same path (different case, forward slashes, trailing slash) is
      focused, not duplicated; an exited session at the path does not count;
      otherwise a terminal is created with `cwd` and the folder-name title;
      the layout is Grid in both outcomes; the pending pull happens once;
      unsubscribed on unmount.
- [x] IPC snapshot updated deliberately: terminal +2 channels (24 total).
- [x] Full suite, typecheck, lint green.
- [x] Packaged smoke: cold start with `--open-path`, second invocation into
      the live window, duplicate path focuses instead of creating, registry
      keys present after a packaged run.

## Verification — 2026-09-03

```text
npm run ci          970 tests / 82 files (+25), typecheck, lint — all pass
Packaged smoke      cold start with --open-path: restore ran first, then a
                    "Downloads" terminal opened at the folder, in Grid.
                    Second exe invocation: process exited, the running window
                    logged a terminal at the forwarded folder. Third
                    invocation with a duplicate path: zero new terminals —
                    the existing pane took focus (visible in the capture).
                    Both HKCU keys present with Extended, icon and command.
                    WM_CLOSE shut everything down cleanly.
```

**Bug found by the smoke test, not the unit suite.** A second instance's
argv is rebuilt by Chromium with switches separated from positional
arguments, which tore the split `--open-path <dir>` pair apart (the flag
ended up next to `--allow-file-access-from-files`). The registry command now
uses the `=` form — `--open-path="%V"` — which survives the rebuild as one
token; the parser accepts both forms.

**Also observed live:** the real GitHub release was tagged `v0.3`, which the
Phase 16 update check rejects by design (strict `v<x>.<y>.<z>`). Releases
must be tagged with all three components — e.g. `v0.3.0`.

**Corrected in passing:** ARCHITECTURE §14 claimed logs live under
`%LOCALAPPDATA%`; the packaged app proves `app.getPath('logs')` resolves
under the userData directory (`%APPDATA%\GitDeck\logs`).

---

## Acceptance criteria

```text
1. Shift+right-click a folder → "Open in GitDeck" with the app icon.
2. GitDeck closed → it launches, restore runs, then a Grid canvas holds a
   terminal at that folder (or focuses the restored one already there).
3. GitDeck open → the window comes to front and the terminal appears/focuses
   immediately; no second GitDeck window ever opens.
4. Uninstall removes the menu entry.
```
