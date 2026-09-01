# Phase 14 — Storage Contract

| | |
|---|---|
| **Purpose** | One documented owner for every byte GitDeck writes to the user's machine: where it lives, who writes it, what happens when it is corrupt, and what install/uninstall may touch. |
| **Depends on** | Phase 13 (current main) |
| **Unlocks** | Phase 15 (data migrations), Phase 16 (update check) |
| **Status** | ☑ Complete — implemented and verified 2026-09-01 (see Verification) |

---

## Why this phase is separate

v0.1.0 already persists data correctly — atomic write-then-rename in both
stores, never-throw reads, one JSON file per workspace. What it does not have
is a **contract**: path knowledge is scattered (`container.ts` mints the
settings path, `workspace/public.ts` mints its directory, the log path is a
third place), nothing on disk records *which app version wrote the data*, and
a corrupt file is silently shadowed by defaults on every launch, forever.

Phase 15 cannot migrate data whose provenance is unknown, and Phase 16 cannot
say "first run after upgrade" without a recorded last-run version. This phase
writes that anchor down before either feature needs it.

---

## Scope boundary — read first

**In:** a bootstrap `storagePaths` module as the single path authority; a
`storage.json` manifest at the userData root recording app/store versions and
run timestamps; quarantine-on-corruption for settings and workspace files; the
storage layout documented in `ARCHITECTURE.md`; the uninstall data policy
documented in `README.md`.

**Out:** schema migrations (Phase 15), update checking (Phase 16), settings or
workspace shape changes, export/import UI, portable mode, cloud sync, storing
terminal output, changing the NSIS installer, log format changes.

---

## Storage layout — the contract being written down

```text
%APPDATA%\GitDeck\                     app.getPath('userData')
├── settings.json                      settings store  (schema v1)
├── storage.json                       manifest — NEW in this phase
├── workspaces\
│   └── <workspace-id>.json            one file per workspace (schema v1)
└── *.corrupt-<timestamp>              quarantined unreadable files — NEW

app.getPath('logs')\
└── gitdeck.log                        rotating operational log (unchanged)
```

Rules the table implies:

1. Every path above is minted by `src/main/bootstrap/storagePaths.ts` and
   nowhere else. Features keep their current `public.ts` signatures; only the
   composition root changes what it passes in.
2. Terminal input/output is never written to any of these files (existing
   privacy guarantee, restated as part of the contract).
3. The uninstaller does not delete `userData`. Keeping data through
   reinstall/upgrade is the deliberate default; removal is a manual
   `%APPDATA%\GitDeck` deletion, documented in the README.

---

## The manifest

```ts
export interface StorageManifest {
  readonly manifestVersion: 1
  /** First launch that wrote a manifest, epoch ms. */
  readonly firstRunAt: number
  readonly lastRunAt: number
  /** `app.getVersion()` of the run that wrote this file, e.g. "0.1.0". */
  readonly lastRunAppVersion: string
  /** Highest schema version each store has been written at. */
  readonly storeVersions: {
    readonly settings: number
    readonly workspace: number
  }
}
```

Written once per startup by the composition root, after the container is
built, with the same write-then-rename discipline as the stores. Reading is
tolerant: a missing manifest is the pre-Phase-14 state (rebuild it from
defaults and the current app version), a corrupt one is quarantined and
rebuilt — starting the app is never blocked by its own bookkeeping.

The manifest is bootstrap-owned. It is **not** a feature, has no IPC surface,
and the renderer never sees it.

---

## Quarantine — corrupt files stop being invisible

Today an unreadable `settings.json` yields defaults plus a log line on every
launch, and the broken file sits there shadowed. After this phase, the first
failed read renames the file:

```text
settings.json  →  settings.json.corrupt-1756700000000
```

then proceeds exactly as today (defaults / skip). Same for a workspace file
that fails JSON parsing or `parseWorkspace`. Consequences that must hold:

- The user's broken file is preserved for inspection, never overwritten by the
  next settings write.
- The next launch finds `ENOENT`, which is the normal first-run path — the
  repeated warning noise disappears.
- A rename that itself fails (locked file, permissions) is logged and the read
  still returns defaults / skips: quarantine is best-effort, startup is not.

**The one exception — future versions are not corruption.** A file whose
`version` field is a valid integer *greater than the store's current version*
was written by a newer GitDeck. It is left exactly where it is, untouched:
settings fall back to per-field defaults in memory, a workspace file is
skipped with a log line. Phase 15 depends on this rule — a user who downgrades
must find their newer data intact when they upgrade again.

---

## Main-process design

```text
src/main/bootstrap/
├── storagePaths.ts        mints every path from (userDataDir, logsDir)
└── storageManifest.ts     read/rebuild/write StorageManifest
```

```ts
export interface StoragePaths {
  readonly userDataDir: string
  readonly settingsFile: string
  readonly workspacesDir: string
  readonly manifestFile: string
  readonly logFile: string
}

export const createStoragePaths = (userDataDir: string, logsDir: string): StoragePaths
```

`container.ts` calls `createStoragePaths(app.getPath('userData'),
app.getPath('logs'))` and threads the results into the existing factories.
Tests pass temp directories, as the integration suites already do.

Quarantine lives where the failed read is detected: `JsonSettingsStore.read`
and `JsonWorkspaceRepository.readAt`, behind one small shared helper
(`quarantineFile(path, logger)`), so both stores report it identically.

---

## Tasks

- [x] Add `storagePaths.ts`; route every existing path through it in
      `container.ts` without changing feature `public.ts` signatures.
- [x] Define `StorageManifest`, its tolerant reader/rebuilder and atomic
      writer; write it at startup.
- [x] Add `quarantineFile` and wire it into the settings store and workspace
      repository read failures.
- [x] Implement the future-version carve-out: `version` greater than current
      is defaulted/skipped but never quarantined and never rewritten.
- [x] Document the storage layout table in `ARCHITECTURE.md`.
- [x] Document the uninstall data policy in `README.md` (one sentence in
      Privacy & safety).
- [x] Test plan below, green.

---

## Files expected to change

```text
plans/ARCHITECTURE.md
README.md
src/main/bootstrap/storagePaths.ts            (new)
src/main/bootstrap/storagePaths.spec.ts       (new)
src/main/bootstrap/storageManifest.ts         (new)
src/main/bootstrap/storageManifest.integration.spec.ts  (new)
src/main/bootstrap/container.ts
src/main/index.ts
src/main/features/settings/infrastructure/JsonSettingsStore.ts
src/main/features/settings/infrastructure/JsonSettingsStore.integration.spec.ts
src/main/features/workspace/infrastructure/JsonWorkspaceRepository.ts
src/main/features/workspace/infrastructure/JsonWorkspaceRepository.integration.spec.ts
```

**Expected to NOT change:** settings/workspace schemas, every `public.ts`,
IPC contracts, preload, renderer, terminal engine, Git, ports.

---

## Test plan

> Conventions: `TESTING.md`. Manifest and quarantine tests are integration
> tests against a temp directory — they exist to prove real filesystem
> behavior, not mocks.

| Test file | Covers |
|---|---|
| `src/main/bootstrap/storagePaths.spec.ts` | every minted path, no path escapes the two roots |
| `src/main/bootstrap/storageManifest.integration.spec.ts` | first run, normal run, corrupt manifest, atomic write |
| `src/main/features/settings/infrastructure/JsonSettingsStore.integration.spec.ts` | quarantine additions |
| `src/main/features/workspace/infrastructure/JsonWorkspaceRepository.integration.spec.ts` | quarantine additions |

### Manifest

- [x] First run writes a manifest with `firstRunAt = lastRunAt`, the current
      app version and current store versions.
- [x] A later run preserves `firstRunAt` and updates `lastRunAt` and
      `lastRunAppVersion`.
- [x] A corrupt manifest is quarantined and rebuilt; startup does not throw.
- [x] An interrupted write (temp file present) never leaves a truncated
      `storage.json` behind.

### Quarantine

- [x] Invalid JSON in `settings.json` → file renamed to
      `settings.json.corrupt-<ts>`, defaults returned, one warning logged.
- [x] The next read after quarantine hits `ENOENT` and logs nothing.
- [x] A workspace file with invalid JSON is quarantined and `list()` still
      returns every other workspace.
- [x] A workspace file whose contents declare a different id is quarantined.
- [x] A failed rename is logged and the read still returns defaults / skips.
- [x] `list()` never treats a `*.corrupt-*` file as a workspace.

### Future-version carve-out — critical for Phase 15

- [x] `settings.json` with `version: 2` returns defaults, is **not**
      quarantined, and is byte-identical on disk afterwards.
- [x] A workspace file with `version: 2` is skipped with a log line, is
      **not** quarantined, and is byte-identical on disk afterwards.
- [x] A settings write while a future-version file is present is the one case
      that may replace it (the user changed a setting; last write wins).

### Regression and boundary

- [x] Settings, workspace, terminal, Git and ports suites pass unchanged.
- [x] No feature `public.ts` signature changed.
- [x] Repository scan: `app.getPath` appears only in `container.ts` /
      bootstrap, `join(...'settings.json')` and `'workspaces'` only in
      `storagePaths.ts` and tests.

---

## Acceptance criteria

```text
1. Fresh install → first launch creates settings.json, storage.json and (on
   first save) workspaces\, all under %APPDATA%\GitDeck.
2. Corrupt settings.json by hand → next launch quarantines it, starts with
   defaults, and the launch after that is quiet.
3. storage.json names the app version that last ran and both store versions.
4. Uninstall GitDeck → %APPDATA%\GitDeck still contains the user's data;
   reinstall finds it.
```

---

## Definition of Done

- Every persisted path is minted in exactly one module.
- `storage.json` exists, is atomic, tolerant and bootstrap-owned.
- A corrupt store file is quarantined once, preserved, and never blocks
  startup; a future-version file is never touched.
- `ARCHITECTURE.md` documents the layout; `README.md` documents the uninstall
  policy.
- Every box in the Test plan is ticked.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.

---

## Known implementation risks to verify

- Two GitDeck instances share one userData directory; last-write-wins is the
  existing policy and the manifest must not turn that into a crash.
- Quarantine renames on a file another process holds open (editor, antivirus)
  can fail on Windows — the best-effort rule exists for exactly this.
- `app.getPath('logs')` on Windows resolves under `%LOCALAPPDATA%`, not
  `%APPDATA%` — the ARCHITECTURE table must state both roots precisely.

---

## Verification — 2026-09-01

```text
npm run typecheck   pass
npm run lint        pass
npm test            833 tests / 64 files after this phase (was 812 / 60)
npm run build       pass
Smoke run           storage.json written on a real launch: manifestVersion 1,
                    firstRunAt = lastRunAt, lastRunAppVersion "0.1.0",
                    storeVersions { settings: 1, workspace: 1 }
```

**Deviation, recorded.** The plan said feature `public.ts` signatures stay
unchanged while also requiring that no filename joins survive outside
`storagePaths.ts` — the two could not both hold. The scan rule won:
`createSettingsService` and `createWorkspaceService` now take minted paths
(their only caller is the composition root, which the plan already expected to
change). Everything else landed as specced, including the future-version
carve-out proven byte-identical on disk for both stores.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and
plans/phase-14-storage-contract.md.

Implement Phase 14 only: the storage contract, including its full Test plan.

Add src/main/bootstrap/storagePaths.ts as the single authority for every
persisted path, and storage.json — an atomic, tolerant, bootstrap-owned
manifest recording firstRunAt/lastRunAt, lastRunAppVersion and store schema
versions. Quarantine unreadable settings/workspace files by renaming them to
*.corrupt-<timestamp> exactly once, best-effort; a file whose version is
newer than the store's current version is defaulted/skipped but never
quarantined and never rewritten. Document the storage layout in
ARCHITECTURE.md and the uninstall policy in README.md.

Do not change any store schema, feature public.ts, IPC contract or renderer
code.

At completion report: implemented · files changed · tests · known
limitations · explicitly deferred.
```
