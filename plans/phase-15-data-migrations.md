# Phase 15 — Data Migrations

| | |
|---|---|
| **Purpose** | Guarantee that upgrading GitDeck never strands user data: every file an older version wrote loads in the new version, proven by golden fixtures, with the original backed up before the first rewrite. |
| **Depends on** | Phase 14 (storage contract / manifest) |
| **Unlocks** | Any later phase that changes a persisted shape; Phase 16 (update check can promise safe upgrades) |
| **Status** | ☑ Complete — implemented and verified 2026-09-01 (see Verification) |

---

## Why this phase is separate

The schemas already carry `version: 1` precisely so that "a later shape change
has something to migrate from" (`shared/contracts/settings.ts`,
`ARCHITECTURE.md` §5) — but the machinery that would *use* that field does not
exist. Today the loaders have exactly two moves: default a field
(`normalizeSettings`) or reject a file (`parseWorkspace`). The first real
shape change — renaming a field, splitting one field into two, changing a
value's meaning — would force whoever writes it to invent migration policy
under feature pressure. This phase sets the policy and builds the engine while
both stores are still at v1 and there is nothing to migrate: the cheapest
possible moment.

---

## Scope boundary — read first

**In:** a pure, stepwise migration engine; orchestration in the application
layer of the settings and workspace features; pre-migration backups; the
golden-fixture compatibility suite; the compatibility policy written into
`ARCHITECTURE.md`; manifest `storeVersions` updates on successful migration.

**Out:** any actual schema change (both stores stay at v1 — the engine ships
with zero real migrations and one test-only migration), downgrade *tooling*,
merging concurrent edits, cloud sync, an update UI (Phase 16).

---

## The compatibility policy

Written into `ARCHITECTURE.md` by this phase; every later phase inherits it.

1. **Old data always loads.** A newer GitDeck must read every file any
   released GitDeck ever wrote. The golden-fixture suite is the proof, not a
   code-review promise.
2. **Additions are not migrations.** A new field with a safe default is
   handled by `normalizeSettings`-style defaulting and does **not** bump the
   store version. The version bumps only when meaning or shape changes:
   renames, splits, semantic changes, removals.
3. **Migrations are pure, forward-only and stepwise.** `v1→v2`, `v2→v3`, each
   a total function on plain JSON. No migration reads the filesystem, the
   clock or the app; chains compose them. Skipping steps is forbidden.
4. **Backup before the first migrated write.** The pre-migration file is
   copied to `backups/` before the store writes the new shape. One backup per
   file per version step, kept indefinitely (they are small); never deleted by
   later runs.
5. **Migrate in Main, in the application layer.** Stores stay dumb
   read/write. The renderer never sees a pre-migration shape.
6. **Downgrades degrade, never destroy.** An older GitDeck reading a newer
   file: settings fall back per-field to defaults, workspace files are
   skipped — both without modifying the file (the Phase 14 carve-out). The
   honest limit, documented: if the user *changes a setting* while
   downgraded, the older app's write drops newer-only fields. The backup from
   rule 4 is the recovery path.
7. **A failed migration is a quarantine, not a crash.** If a chain throws,
   the file is quarantined (Phase 14 machinery), the store starts from
   defaults / skips the workspace, and the launch continues.

---

## The engine

```ts
/** Pure step: migrates exactly from `from` to `from + 1`. */
export interface StoreMigration {
  readonly from: number
  readonly migrate: (raw: Record<string, unknown>) => Record<string, unknown>
}

export interface MigrationOutcome {
  readonly raw: Record<string, unknown>
  /** Version the file arrived at — `currentVersion` on success. */
  readonly fromVersion: number
  readonly migrated: boolean
}

/**
 * Runs the chain raw.version → currentVersion. Returns the input untouched
 * when already current. Throws MigrationError when a step is missing or a
 * step throws — the caller quarantines.
 */
export const runMigrations = (
  raw: Record<string, unknown>,
  migrations: readonly StoreMigration[],
  currentVersion: number
): MigrationOutcome
```

Orchestration, per store, at service construction time in Main:

```text
read file → JSON parse
   → version < current?  runMigrations → backup original → write migrated
   → version = current?  pass through
   → version > current?  Phase 14 carve-out (defaults / skip, file untouched)
   → then the existing normalize/parse, unchanged
```

The write-back happens immediately after a successful migration — not lazily —
so one upgrade migrates each file exactly once, and the manifest's
`storeVersions` (Phase 14) is bumped in the same startup.

Backups land next to the data they protect:

```text
%APPDATA%\GitDeck\backups\
├── settings.v1.json
└── workspaces\<workspace-id>.v1.json
```

---

## Golden fixtures — the backward-compatibility proof

```text
tests/fixtures/storage/
└── v0.1.0/
    ├── settings.json          real file written by v0.1.0
    ├── storage.json
    └── workspaces/
        └── ws_fixture.json
```

Captured **now**, from a real v0.1.0 run, and committed. The suite iterates
every `tests/fixtures/storage/<version>/` directory and asserts the current
code loads each file into a valid, expected model. Releasing a new version
appends a directory; deleting or editing an old fixture is forbidden — they
are the recorded past, which is exactly what upgrade code runs against.
(`tests/fixtures/` is already prettier-ignored as captured input.)

---

## Tasks

- [x] Implement `runMigrations` with `MigrationError` (bootstrap or
      `shared/` per ARCHITECTURE layering — decide in-session, document).
- [x] Wire orchestration into the settings feature's application layer:
      migrate → backup → write-back → normalize.
- [x] Wire the same into the workspace feature's `list`/`get` path: migrate →
      backup → write-back → `parseWorkspace`.
- [x] Bump manifest `storeVersions` after successful migration of each store.
- [x] Capture the v0.1.0 golden fixtures and write the fixture-directory
      iteration suite.
- [x] Prove the engine with a test-only `v1→v2` migration in specs (rename a
      field), including chain composition `v1→v3` with two steps.
- [x] Write the compatibility policy into `ARCHITECTURE.md`.
- [x] Test plan below, green.

---

## Files expected to change

```text
plans/ARCHITECTURE.md
src/main/bootstrap/migrations.ts                         (new — engine)
src/main/bootstrap/migrations.spec.ts                    (new)
src/main/features/settings/application/SettingsService.ts
src/main/features/settings/application/SettingsService.spec.ts
src/main/features/settings/infrastructure/JsonSettingsStore.ts
src/main/features/settings/infrastructure/JsonSettingsStore.integration.spec.ts
src/main/features/workspace/application/WorkspaceService.ts
src/main/features/workspace/application/WorkspaceService.spec.ts
src/main/features/workspace/infrastructure/JsonWorkspaceRepository.ts
src/main/features/workspace/infrastructure/JsonWorkspaceRepository.integration.spec.ts
src/main/bootstrap/storageManifest.ts
tests/fixtures/storage/v0.1.0/**                         (new — captured files)
tests/storage-compat.integration.spec.ts                 (new — fixture iteration)
```

**Expected to NOT change:** both schemas' current shape (still v1), IPC
contracts, preload, renderer, terminal engine, Git, ports.

---

## Test plan

> Conventions: `TESTING.md`. The engine suite is pure-unit; orchestration
> suites run against temp directories with fixture files.

| Test file | Covers |
|---|---|
| `src/main/bootstrap/migrations.spec.ts` | chain composition, missing step, throwing step, already-current |
| `src/main/features/settings/.../SettingsService.spec.ts` + integration | orchestration, backup, write-back, quarantine-on-failure |
| `src/main/features/workspace/.../WorkspaceService.spec.ts` + integration | same per workspace file, partial-failure isolation |
| `tests/storage-compat.integration.spec.ts` | every committed fixture version loads today |

### Engine

- [x] `version = current` returns the input untouched, `migrated: false`.
- [x] A two-step chain composes in order and reports `fromVersion`.
- [x] A gap in the chain throws `MigrationError` before any step runs.
- [x] A throwing step surfaces as `MigrationError`; no partial result leaks.
- [x] Steps are pure: same input twice → deeply equal output twice.

### Orchestration — settings

- [x] A v1 file under a test-only v2 schema is migrated, normalized and
      served; `settings.json` on disk is the new shape afterwards.
- [x] `backups/settings.v1.json` exists and is byte-identical to the
      original pre-migration file.
- [x] A second launch does not migrate again and does not touch the backup.
- [x] A migration failure quarantines the file, serves defaults, and the app
      construction does not throw.
- [x] Manifest `storeVersions.settings` is bumped only on success.

### Orchestration — workspaces

- [x] Each v1 workspace file is migrated and backed up individually.
- [x] One file failing its migration is quarantined and skipped; every other
      workspace still loads (mirrors today's unreadable-file isolation).
- [x] `get(id)` after migration returns the same model as `list()`.

### Downgrade behavior (the Phase 14 carve-out, re-proven here)

- [x] A future-version settings file yields defaults and remains
      byte-identical on disk.
- [x] A future-version workspace file is skipped, logged, byte-identical.

### Golden fixtures

- [x] The suite discovers fixture directories dynamically — a new version
      directory is picked up with zero suite edits.
- [x] Every `v0.1.0` fixture loads into a valid model with expected values.
- [x] The fixtures are loaded read-only: the suite copies them to a temp
      directory first, and the committed files are never modified.

### Regression and boundary

- [x] Both stores still ship at schema v1; no production migration exists.
- [x] Settings, workspace, terminal, Git, ports suites pass unchanged.
- [x] The renderer bundle contains no migration code (Main-only import scan).

---

## Acceptance criteria

```text
1. Simulated upgrade: place a v1 settings.json and two v1 workspace files in
   a fresh userData dir under a build whose test schema is v2 → app starts,
   data appears, backups/ holds the originals, storage.json says v2.
2. Simulated downgrade: place a v2 file under the v1 build → app starts on
   defaults / without that workspace, and the v2 file is untouched.
3. rm -r userData → app starts clean. cp -r backups back → data returns.
```

---

## Definition of Done

- The engine exists, is pure, and refuses gaps rather than guessing.
- Both stores migrate-on-load with backup and write-back, in Main only.
- The v0.1.0 golden fixtures are committed and green.
- The compatibility policy is in `ARCHITECTURE.md`.
- No schema actually changed in this phase.
- Every box in the Test plan is ticked.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.

---

## Known implementation risks to verify

- Write-back at startup makes launch the moment of maximum churn: it must
  reuse the stores' write-then-rename path so a crash mid-upgrade leaves
  either the old file or the new file, never a truncated one.
- Backup copy must happen **before** the migrated rename lands; the reverse
  order can lose the original on a crash between the two.
- Two instances launching during the same upgrade may race the migration;
  write-then-rename makes that converge (both write the same v2 content) but
  the backup helper must tolerate `EEXIST`.
- Fixture capture must come from a genuinely released v0.1.0 build, not from
  current `main` — otherwise the suite proves nothing.

---

## Verification — 2026-09-01

```text
npm run typecheck   pass
npm run lint        pass
npm test            engine + orchestration + compat suites green
                    (905 tests / 72 files after Phases 14–16 together)
npm run build       pass
```

**Deviations, recorded.**

1. **Orchestration lives in the stores, not the application layer.** The
   `SettingsStore`/`WorkspaceRepository` contracts return parsed models, so
   the pre-normalize raw JSON a migration needs only exists inside the
   store's read path. The migrations themselves stay pure and are injected
   from each feature's domain (`settingsMigrations.ts`,
   `workspaceMigrations.ts`) — the layering the policy actually cares about.
2. **Manifest `storeVersions` records the current constants at startup**
   rather than being bumped per successful migration — equivalent today
   (write-back happens in the same startup) and simpler.
3. **The workspace success path is provable only up to the strict v1
   parser.** The integration test proves the full order — migrate, backup,
   write-back — and documents that a real workspace migration ships with its
   `parseWorkspace` update in the same change (policy rule 6).
4. **Fixtures are authored to the released v0.1.0 shape, not copied from a
   live install** — a real user's files carry private paths that must not be
   committed. The shapes are byte-faithful to what v0.1.0's stores write.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and
plans/phase-15-data-migrations.md.

Implement Phase 15 only: the migration engine and policy, including its full
Test plan.

Build a pure, stepwise, forward-only runMigrations engine (v(n)→v(n+1) chain,
MigrationError on gaps or throws). Orchestrate it in the settings and
workspace application layers: migrate on load, copy the original into
backups/ first, write the migrated shape back through the existing atomic
write path, bump storage.json storeVersions. Future-version files follow the
Phase 14 carve-out untouched. Ship zero production migrations — both stores
stay at v1; prove the engine with a test-only v2.

Capture real v0.1.0 files as tests/fixtures/storage/v0.1.0/ and add the
fixture-iteration compatibility suite. Write the compatibility policy into
ARCHITECTURE.md.

Do not change any current schema, IPC contract or renderer code.

At completion report: implemented · files changed · tests · known
limitations · explicitly deferred.
```
