# Phase 19 — Workspace Shortcuts

| | |
|---|---|
| **Purpose** | Right-click a workspace in the sidebar → **Create shortcut…** → a real Windows `.lnk` lands wherever the user points the native save dialog. Double-clicking it opens that workspace's terminals — launching GitDeck when closed, reusing the running window when open, focusing already-running terminals instead of duplicating them — in the Grid layout. |
| **Depends on** | Phase 18 (single-instance forwarding, the `=`-form argument lesson), Phase 7 (open-workspace flow) |
| **Status** | ☑ Complete — implemented and verified 2026-09-03 (see Verification) |

---

## Why this phase is separate

The launch plumbing exists since Phase 18; what is new is a second argument
(`--open-workspace=<id>`), a shortcut *writer* (the first feature that
creates a file outside the data root — only ever where the native save
dialog points), and the discipline of NOT reinventing the open flow:
`useOpenWorkspace.open` is already idempotent per definition (a bound,
running session with the same cwd/shell/command is reused, startup commands
run only for newly created sessions), which is precisely the
duplicate-focus guarantee this phase must keep.

## Scope boundary

**In:** a context menu on sidebar workspace rows with one item, **Create
shortcut…**; a native save dialog (default: Desktop, `<name>.lnk`,
filename-sanitized); the `.lnk` written via Electron's
`shell.writeShortcutLink` targeting the exe with `--open-workspace=<id>`
and the app icon; argument validation (well-formed id, workspace exists);
cold-start pull + second-instance push mirroring Phase 18; renderer flow:
wait for restore, switch to Grid, then `useOpenWorkspace.open` with startup
commands (an explicit open is consent, same as clicking Open), and reveal
the terminals section.

**Out:** shortcuts to folders/terminals, pinning to taskbar/start menu,
auto-updating stale shortcuts after a rename (the id keeps working; the
filename is the user's), deleting shortcuts on workspace delete, non-Windows.

## Design

```text
sidebar right-click ──▶ Create shortcut… ──▶ workspace:shortcut {workspaceId}
   Main: validate id → native save dialog → shell.writeShortcutLink(
     target=GitDeck.exe, args=--open-workspace=<id>, icon=exe, description)
double-click .lnk ──▶ GitDeck.exe --open-workspace=<id>
   lock holder? ──no──▶ cold start: queue → renderer pulls after restore
                ──yes─▶ second-instance: validate, focus window,
                        push workspace:open {workspaceId}
renderer: Grid → useOpenWorkspace.open(id, {runStartupCommands: true})
          (bound running sessions reused → the restored-workspace case is
           zero new terminals + focus, for free) → show terminals section
```

- The renderer never sends a filesystem path; the save dialog is the only
  source of one. The only renderer-supplied value is a workspace id, and
  Main re-validates it.
- The `=` argument form throughout — Phase 18's smoke test proved the split
  form is torn apart by Chromium's argv rebuild on forwarding.
- Bootstrap-owned (`workspaceLaunch*.ts`), like the Phase 18 queue: the
  argument exists before any feature does; the ipc module takes injected
  dialog/shortcut/exe functions so it tests without Electron.

## Test plan

- [x] `--open-workspace` parsing: `=` and split forms; malformed id,
      unknown workspace, missing value → dropped with a log; queue answers
      once; later accept overwrites.
- [x] Shortcut definition: sanitized `<name>.lnk` default, exe target and
      icon, `--open-workspace=<id>` args, description naming the workspace.
- [x] `workspace:shortcut`: rejects a malformed/unknown id and extra
      fields; cancel → Ok(null), nothing written; write failure → Err;
      success → Ok with the chosen path.
- [x] `workspace:pendingopen` rejects payloads and drains once.
- [x] Renderer request hook: queues until restore settles, pulls once, sets
      Grid before opening, opens with startup commands, reveals terminals,
      unsubscribes on unmount.
- [x] Sidebar: right-click shows the menu; choosing the item reports the
      workspace id; the presentational component still makes zero IPC calls.
- [x] IPC snapshot updated deliberately: workspace +3 channels (27 total).
- [x] Full suite, typecheck, lint green.
- [x] Packaged smoke: a real `.lnk` invocation opens the workspace cold and
      forwards into a live window; re-invoking with the already-open
      workspace creates zero terminals and focuses.

## Verification — 2026-09-03

```text
npm run ci          993 tests / 85 files (+23), typecheck, lint — all pass
Packaged smoke      real .lnk files built with the writer's exact target/args
                    against the user's two real workspaces:
                    A. cold-launch IPOS.lnk (IPOS = restore target):
                       1 terminal created — restore only; the shortcut's open
                       reused it, and its "npm run dev" startup command was
                       NOT re-run into the live shell (reuse never rewrites).
                    B. LGE.lnk against the running window: 4 total —
                       three fresh LGE terminals forwarded in.
                    C. LGE.lnk again: still 4 — zero new, focus only.
                    WM_CLOSE shut down cleanly; smoke artifacts removed and
                    the user's activeWorkspaceId restored.
```

**Recorded honestly:** the Grid capture failed — another (private) window
covered the app at capture time and the accidental screenshot was deleted
unread; the Grid switch is covered by the request-hook spec and the
Phase 18 capture of the same store path. Startup commands run only for
newly created sessions — the reuse branch is what makes scenario A safe by
construction, not by luck.

---

## Acceptance criteria

```text
1. Right-click a workspace → Create shortcut… → pick a folder → a .lnk with
   the GitDeck icon appears there, named after the workspace.
2. GitDeck closed → double-click → app launches, that workspace's terminals
   appear in Grid (startup commands run for newly created ones).
3. GitDeck open with that workspace already restored → double-click → the
   window comes to front, zero new terminals, its terminal is focused.
4. A deleted workspace's shortcut → the app still opens, with a clear error
   toast, nothing crashes.
```
