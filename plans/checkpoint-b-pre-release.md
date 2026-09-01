# Checkpoint B — Pre-Release Gate (before v0.1.0)

| | |
|---|---|
| **Purpose** | Audit-only gate. Confirm every architectural invariant still holds after eleven phases, then cut `0.1.0`. |
| **Depends on** | Phase 11 |
| **Unlocks** | v0.1.0 release |
| **Status** | ☐ Not started |

---

## Checklist

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

**Test-coverage audit** (see `TESTING.md`)

- [ ] Every Test plan box across all twelve phases is ticked.
- [ ] Zero `it.skip` / `describe.skip` remain, or each remaining one is justified in writing.
- [ ] The unit suite passes on a machine with no git, no shells beyond CMD, and no network.
- [ ] Every domain error class in `ARCHITECTURE.md` §9 is raised by at least one test.
- [ ] Every entry in the test-double catalog exists and is used by more than one phase.

---

## v0.1.0 release boundary

**Included:**

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

**Explicitly excluded — if any of these shipped, the boundary was violated:**

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

## E2E flow that must pass

```text
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
```

---

## Architecture success test

The design succeeded if these hypothetical additions would stay local:

| Adding | Should touch | Should NOT touch |
|---|---|---|
| Split panes | `renderer/features/layout`, workspace layout model | terminal engine |
| Git commit UI | `main/features/git-actions`, `renderer/features/git-actions` | `NodePtyAdapter` |
| SSH | terminal sessions + shell profiles | workspace persistence |

Walk through each one on paper. If any would force an engine rewrite, record it as technical debt before releasing.

---

## Deliverable

```text
Checkpoint B report
1. Item-by-item pass/fail
2. E2E result
3. Release boundary violations (should be none)
4. Architecture success walkthrough
5. Go / no-go for 0.1.0
```

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/checkpoint-b-pre-release.md.

Run Checkpoint B. This is an audit, not a feature phase.

Verify every checklist item, run the E2E flow, confirm nothing from the
excluded list shipped, and walk through the architecture success test.

Fix violations, but add no new features.

Report item-by-item pass/fail, E2E result, boundary violations,
the architecture walkthrough, and a go/no-go for 0.1.0.
```
