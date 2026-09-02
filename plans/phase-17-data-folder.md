# Phase 17 — Configurable Data Folder

| | |
|---|---|
| **Purpose** | Let the user choose where GitDeck keeps its data — settings, workspaces, manifest, backups — with the current folder shown as the default, via the native folder picker, applied on the next launch. |
| **Depends on** | Phase 14 (single path authority), Phase 15 (copy semantics must not fight migrations) |
| **Status** | ☑ Complete — implemented and verified 2026-09-02 (see Verification) |

---

## Why this phase is separate

The folder choice cannot live in `settings.json`: the app must know the
folder *before* it can read settings from it. That forces a second, tiny
persistence mechanism — a pointer — with its own tolerance rules, and a
switch flow that touches every store at once. Both deserve their own
boundary.

## Scope boundary

**In:** `data-root.json` pointer in the DEFAULT userData dir; tolerant
resolution at boot (missing → default, corrupt → quarantine + default,
unreachable folder → default for the run, pointer kept); native Main-owned
folder picker; copy-on-switch that adopts a target already holding GitDeck
data and never deletes the source; applies on next launch with the pending
state shown in Settings; `storage:info` / `storage:choose` IPC.

**Out:** hot-swapping stores mid-run (a restart pretending not to be one),
moving the logs directory, deleting or merging old data, network/UNC path
validation beyond "mkdir works", multiple profiles.

## Design

```text
boot:  resolveDataRoot(defaultUserData) ── pointer ──▶ data root
       createStoragePaths(dataRoot, logsDir)          (Phase 14, unchanged)

choose: renderer ──(no payload!)──▶ Main native picker
        copy data to target (adopt if occupied) → write pointer → pending
        next launch reads the pointer and everything follows
```

- The renderer can never send a path: `storage:choose` opens the picker and
  both channels reject any payload. The picker is the only source of a path.
- Copy before pointer: a crash between the two leaves the pointer on the old
  folder and the copy as a harmless spare.
- Re-choosing the current folder cancels a pending switch.
- Bootstrap-owned like the manifest (`bootstrap/dataRoot*.ts`): the data
  root exists before any feature does.

## Files changed

```text
src/shared/contracts/{storage.ts (new), ipc.ts, ipc.spec.ts, ipc.snapshot.spec.ts}
src/main/bootstrap/{dataRoot.ts, dataRootIpc.ts (new + specs), container.ts, registerIpc.ts}
src/preload/{storageApi.ts (new + spec), api.ts, index.ts}
src/renderer/src/features/settings/components/{DataFolderSetting.tsx (new + spec), SettingsScreen.tsx, SettingsPanel.tsx}
src/renderer/src/testing/fakeGitDeckApi.ts
src/renderer/src/shared/styles/global.css
plans/ARCHITECTURE.md · README.md
```

## Test plan

- [x] Missing pointer → quiet default; corrupt pointer → quarantined,
      default; pointer at the default itself → not custom.
- [x] Valid pointer is followed and its folder created; an unreachable
      folder falls back for the run and keeps the pointer.
- [x] Pointer write round-trips; choosing the default removes it; atomic.
- [x] Copy moves settings, manifest, workspaces and backups; source
      untouched; occupied target adopted with its files winning; empty
      source is `fresh`; failed copy throws before the pointer is written.
- [x] `storage:info` / `storage:choose` reject any payload; cancel changes
      nothing; a switch reports `pending` and the next picker opens there;
      re-choosing current clears pending; a failed switch surfaces an error
      and records nothing.
- [x] Preload members send no payload; no member accepts a path.
- [x] Settings UI shows the current path read-only, the pending
      applies-after-restart note, and surfaces switch errors.
- [x] Full suite green: 938 tests / 77 files (was 908 / 73), typecheck,
      lint.

## Verification — 2026-09-02

```text
npm run typecheck   pass
npm run lint        pass
npm test            938 tests / 77 files
Smoke run           Settings shows the real %APPDATA%\GitDeck path; the
                    native picker opens from Change…
```

**Recorded decisions.** Applies on next launch only — swapping stores under
live terminals is a restart pretending otherwise; the UI says so in place.
The switch copies rather than moves: the old folder stays valid, so
switching back is choosing it again. `SettingsScreen` gained a `children`
slot so panel-wired controls (updates, data folder) render inside the same
styled surface without the presentational screen knowing them.
