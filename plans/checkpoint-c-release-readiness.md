# Checkpoint C — Release Readiness (after Phase 22)

| | |
|---|---|
| **Purpose** | Audit-only gate. Checkpoint B was never run and eleven phases shipped past it. This checkpoint absorbs B's checklist, adds one for everything Phases 12–22 promised, reconciles the documents with what actually shipped, and ends in a go/no-go for the **first release cut through the Phase 22 pipeline**. |
| **Depends on** | Phase 22 (◐ — built and verified locally; the repository setting and the first tagged run are part of this checkpoint) |
| **Unlocks** | The first tagged, attested release; a certified baseline for Phase 23 onward |
| **Status** | ◐ **C1 passed 2026-09-03** (sections 1–4: guardrails, invariants, documents). **C2 started:** 0.5.0 is built, gated and fixtured — but not published. The tag, the repository setting and the clean-machine run cannot be done from this working copy. See both Reports. |

---

## Why this is a separate plan

Three facts, none of which a feature phase would ever notice:

1. **Checkpoint B never ran.** The v0.1.0 boundary it guards was never
   formally cut. `plans/README.md` still says "`version` remains `0.1.0`
   until it happens" while `release/` holds 0.4.1 installers and GitHub
   holds `v0.2` and `v0.3`.
2. **The documents disagree with the code, and with each other.**
   `ARCHITECTURE.md` §6 lists five IPC namespaces; the snapshot test pins
   seven namespaces and twenty-seven channels. Four phase files carry
   ticked boxes that their own Verification sections contradict. The README
   says the Mosaic "keeps up to four terminals visible at once"; Phase 21
   made Grid unbounded.
3. **The next release is the first one a machine cuts.** Phase 22's
   workflow has never run, immutable releases lock the tag the moment it
   publishes, and the tag format has been wrong on every release so far. A
   gate belongs in front of that, not behind it.

**Rule: an item that fails is fixed before the tag is pushed, or its
acceptance is written into the report with a reason. Nothing is ticked on the
strength of an earlier phase's tick.**

---

## Rules of the audit

- **Audit-only.** No new features, no schema change, no new IPC channel.
  Guardrail tests and lint rules are welcome (Checkpoint A's precedent);
  editing a document so it matches the code is expected.
- **Prove guardrails by planting a violation** and watching it get caught,
  then delete the probe (Checkpoint A's method). A rule that matches nothing
  looks identical to a rule that works.
- **Plan files are history.** A stale tick is annotated or struck through
  with the date and the reason — never deleted, never silently re-ticked.
- **Sizing.** This is larger than A or B. If a session runs short, split
  into **C1** (code guardrails + document reconciliation, sections 1–4) and
  **C2** (release: fixtures, VM run, tag, sections 5–7). C2 does not start
  until C1 passes.

---

## The boundary this checkpoint certifies

**Included** — what a user of the next release gets:

```text
Electron application, single instance
Terminal Mosaic: Focus / Columns / Main + Side / Grid (unbounded), Navigator, park/unpark
Git Bash / PowerShell / pwsh / CMD / WSL profiles
Workspaces: create, persist, restore, open, shortcut (.lnk), Explorer "Open in GitDeck"
Read-only Git status
Settings, versioned; user-chosen data folder
Storage contract: atomic writes, quarantine, manifest, backups, golden fixtures
Port inspector with explicit, confirmed, revalidated termination
Startup update check (notify-and-link only)
Windows x64 EXE + MSI installers, checksums, attested release
```

**Explicitly excluded** — still in `BACKLOG.md`; if any of these shipped,
stop and report:

```text
Git commit / push / pull UI      SSH manager           persistent PTY daemon
command palette                  silent auto-update    plugin system
cloud sync                       AI commands           terminal collaboration
Docker manager                   remote filesystem
```

> `split panes` was on Checkpoint B's excluded list. It was promoted
> deliberately as Phase 13 (BACKLOG, 2026-09-01). Not a violation —
> recorded so the next reader does not have to work it out.

---

## Checklist

### 1. Checkpoint B, absorbed

The eleven items B would have checked, reworded only where they went stale.

- [x] Terminal feature works without the Git feature (`FakeGitAdapter`
      throwing `GitNotAvailableError` leaves every terminal test green).
- [x] Workspace feature stores definitions, never PTY objects (JSON
      round-trip of the store; no `node-pty` type reaches `workspace/`).
- [x] Git feature is read-only: the git namespace holds exactly `inspect`;
      no `GitService` method takes a mutating verb.
- [x] Settings are versioned; both stores at schema v1; the manifest records
      both.
- [x] Persistence validates loaded data (corrupt / wrong-version /
      missing-fields fixtures all handled, none crash startup).
- [x] Main handles unexpected session exit (a PTY that dies is reported as
      `exited`, never leaks, never takes a sibling with it).
- [x] No generic `exec(command)` IPC exists; **no channel accepts a PID,
      process name, signal, filesystem path or URL** — Phases 12, 16, 17,
      18, 19 each added a channel and each was designed around this rule.
- [x] No feature imports another feature's internals (`architecture.spec.ts`
      — plant a probe, watch it fail).
- [x] Every feature exposes `public.ts` (twelve today: six Main, six
      renderer).
- [x] Production build contains native node-pty correctly
      (`packaged-pty.spec.ts`).
- [ ] **Clean Windows installation has been tested.** Owed since Phase 11
      (2026-08-28) through four builds. Run Phase 11's clean-machine script
      on the **pipeline-built** installer in a VM with no Node.js and no
      build tools, and fill in Phase 11's table — or write the risk
      acceptance into this report, signed with a reason.

B's test-coverage audit, updated:

- [x] Every Test plan box in Phases 12–21 is ticked (true today) and every
      unticked box in Phases 11 and 22 is either ticked by this checkpoint
      or listed in the report as owed.
- [x] Zero `it.skip` / `describe.skip` / `.only` (zero today — keep it).
- [x] `npm run test:unit` passes with no git, no shell beyond CMD, and no
      network (PATH reduced to `System32`, adapter disabled).
- [x] Every error class in `ARCHITECTURE.md` §9 exists and is raised by at
      least one test — **and §9 lists every class that exists**. §9 was
      missing seven: `GitOutputError`, `GitTimeoutError`,
      `PortInspectionTimeoutError`, `PortTerminationError`,
      `NoShellAvailableError`, `MigrationError`, `UpdateCheckFailedError`.
      All seven added. `NoShellAvailableError` was thrown in production and
      asserted by nothing; it now has a test. `InvalidRequestError` and
      `NewerWorkspaceFileError` are deliberately **not** in §9 — unexported
      control flow, proven by behaviour — and §9 now says so.
- [x] Every entry in the `TESTING.md` §4 double catalog exists and is used
      by more than one phase — and the catalog lists every double that
      exists. It omitted `FakeReleaseClient` (Phase 16) and
      `InMemorySettingsStore` (Phase 6); both added.

### 2. Phase invariants, 12–22

Each phase's own promises, checked against today's code — not against its
Verification section.

**Phase 12 — ports**

- [x] `window.gitdeck.ports.terminate` takes `{ snapshotId, targetIds }` and
      nothing else; `targetId` never equals or contains the PID.
- [x] Production ports code contains no `/IM`, `/T`, `/S`, `runas`, wildcard
      or second kill path; the kill is `taskkill /PID <pid> /F` exactly.
- [x] PID 0 and 4, GitDeck's own PID, another session and an unreadable
      identity are `canTerminate: false`; the session check fails closed.
- [x] Revalidation before the kill and re-enumeration after it are both still
      on the path — deleting either from the service makes a test fail.
- [x] `tests/e2e/ports.spec.ts` kills only a child it spawned itself.

**Phases 13 / 20 / 21 — Mosaic**

- [x] Renderer-only, still: no layout channel exists in the IPC snapshot; no
      file under `src/main` or `src/preload` mentions a layout mode.
- [x] Selecting, parking, unparking and switching layout never call
      `terminal.create` or `terminal.kill` (negative assertions against
      `fakeGitDeckApi` exist and pass).
- [x] Capacities are Focus 1, Columns 2, Main + Side 3, Grid `Infinity`; the
      add-slot condition is Phase 20's expression verbatim.
- [x] Layout is **not** persisted (Phase 13 deferred it) and nothing in the
      README implies it is.
- [x] Phase 13's "length never exceeds capacity" and Phase 20's "Grid at
      four → no slot" boxes are annotated *superseded by Phase 21* in their
      own files. They are ticked today as if current.

**Phase 14 — storage contract**

- [x] Every persisted path is minted in `bootstrap/storagePaths.ts`:
      `app.getPath` appears only in bootstrap; `'settings.json'` and
      `'workspaces'` joins only in `storagePaths.ts` and tests.
- [x] Future-version carve-out: a `version: 99` settings file is read
      per-field and left byte-identical; a `version: 99` workspace file is
      skipped with a log line, never quarantined.
- [x] Quarantine renames once and never overwrites; `list()` ignores
      `*.corrupt-*`.
- [x] `build/installer.nsh` deletes the two HKCU keys and touches nothing
      under `%APPDATA%\GitDeck`.
- [x] Phase 14's ticked "No feature `public.ts` signature changed" is
      corrected: its own Deviation says `createSettingsService` and
      `createWorkspaceService` now take minted paths.

**Phase 15 — migrations**

- [x] `tests/fixtures/storage/` holds one directory per **published**
      release. Today it holds `v0.1.0` only, while `v0.2` and `v0.3` are on
      GitHub Releases. Add `v0.2.0` and `v0.3.0` — authored to shape, as
      Phase 15's Deviation 4 allows, with the Phase 16 settings fields and a
      `storage.json` carrying that `lastRunAppVersion` — and extend the
      `EXPECTED_SETTINGS` spot checks in `storageCompat.integration.spec.ts`.
- [x] The release procedure (README "Cutting a release" and Phase 22's
      three steps) gains a step: *append `tests/fixtures/storage/vX.Y.Z/`
      from the built installer's first run*. Without it this rots again on
      the next tag.
- [x] Both stores still at v1; no production migration exists;
      `runMigrations` throws `MigrationError` on a gap.
- [x] Backup lands before the migrated rename (ordering test still exists).
- [x] Policy rule 5 ("migrate in the application layer") disagrees with
      Deviation 1 (orchestration lives in the stores) and with
      `ARCHITECTURE.md` §15 rule 3 ("inside the store on load"). Align the
      rule text with what shipped; annotate the ticked task.

**Phase 16 — update check**

- [x] **Exactly one outbound network call site** in `src/`:
      `GitHubReleaseClient.ts`. Phase 16 ticked this as a manual "repository
      scan"; make it a guardrail test (see §4).
- [x] `shell.openExternal` sites are two: `updatesIpc.ts` (Main-minted URL
      only) and `createWindow.ts` `setWindowOpenHandler` (denies the window,
      hands the URL to the browser). The renderer renders no external link
      today. Decide: restrict the handler to `https:` or remove it; then
      allow-list what remains and correct Phase 16's "no `openExternal`
      outside the updates IPC layer" line, which is false as written.
- [x] Tag contract `v<major>.<minor>.<patch>`: `v0.2` and `v0.3` violate it,
      so **no user has ever been shown an update**. Record it; the Phase 22
      workflow now enforces the format.
- [x] The 24-hour throttle is keyed on `storage.json.lastUpdateCheckAt`, not
      on settings.
- [ ] Deviation 3 (no packaged E2E, "owed alongside the first real
      release"): once a valid tag exists, add an offline-tolerant packaged
      spec or mark the deviation accepted permanently.

**Phase 17 — data folder**

- [x] `storage:choose` and `storage:info` reject any payload; no preload
      member accepts a path; the native picker is the only source of one.
- [x] Pointer resolution is tolerant: missing → default, corrupt →
      quarantined + default, unreachable → default for the run, pointer
      kept.
- [x] Copy lands before the pointer is written; the source is never deleted;
      an occupied target is adopted with its files winning.
- [x] `data-root.json` is minted under the **default** userData directory
      (`ARCHITECTURE.md` §14 rule 5), never under the chosen root.

**Phase 18 — Explorer "Open in GitDeck"**

- [x] `reg.exe` runs with the fixed argument arrays from
      `explorerMenuCommands`, packaged only, HKCU only, and never throws.
- [x] `--open-path` is validated in Main — absolute, exists, is a directory
      — and `terminal:pendingpath` rejects payloads and answers once.
- [x] Single instance: a second launch forwards its argv and exits; no
      second window opens. **No packaged spec exists.** `TESTING.md`'s E2E
      rule applies (this phase writes the registry, takes a lock and forwards
      a launch argument): add `tests/e2e/open-path.spec.ts` — launch the
      packaged app on a temp profile, spawn `GitDeck.exe
      --open-path="<tmpdir>"` with the same `--user-data-dir`, assert a
      session at that cwd appears and the second process exits — or write
      the justification into the phase file, as Phase 16 did.
- [ ] Uninstall removes both keys — proven by the Phase 22 manual checklist
      or the VM run above.

**Phase 19 — workspace shortcuts**

- [x] `--open-workspace=<id>` is validated (well-formed id, workspace
      exists); no channel accepts a path; the `.lnk` is written only where
      the save dialog points.
- [x] Opening an already-open workspace reuses live sessions and never
      re-runs a startup command into a running shell.
- [x] Packaged spec or written justification — same rule as Phase 18.

**Phase 22 — release packaging** (its owed boxes, now this checkpoint's)

- [ ] **Immutable releases** enabled in the repository settings; date
      recorded in Phase 22's file.
- [ ] Manual MSI checklist run: `msiexec /i … /qn` → one *Installed apps*
      entry → terminal opens → uninstall removes the directory and both
      HKCU keys.
- [ ] First tagged run green in the order `ci` → `package` → `test:e2e` →
      release; six rows on the release page; `gh release verify` passes.

### 3. Cross-cutting

- [x] **IPC surface:** seven namespaces, twenty-seven channels, each
      annotated with its phase in `ipc.snapshot.spec.ts`; every handler
      validates its payload; no validator accepts a path or URL.
- [x] **Guardrails still bite:** plant one probe each for a cross-feature
      internal import, `node-pty` outside terminal infrastructure, Electron
      in the renderer, filesystem access outside infrastructure, and a raw
      channel literal. All five caught; all five deleted.
- [x] **E2E rule** (`TESTING.md` §2): every OS-touching post-v0.1 phase has
      one packaged spec or a written justification. Today: 12 ✓, 22 ✓, 16
      justified, **17 / 18 / 19 neither**.
- [x] **Uninstall keeps data** (README promise): nothing in `installer.nsh`
      or either installer touches `%APPDATA%\GitDeck` beyond the two keys.
- [x] **Terminal I/O is never persisted** (README promise): no sink writes
      PTY data; the file sink receives log lines only.
- [x] **Single-instance lock vs. tests:** the E2E suite isolates itself with
      `--user-data-dir`; document in `TESTING.md` that live smoke needs the
      installed GitDeck closed (Phase 20 skipped its visual smoke for this).

### 4. Documents to reconcile

Each line is one concrete edit. The code is the source of truth for every
one of them.

- [x] `ARCHITECTURE.md` §3 — add the `updates/` feature and the bootstrap
      files that exist: `dataRoot*`, `openPath*`, `workspaceLaunch*`,
      `migrations`, `storageManifest`, `quarantine`, `explorerMenu`,
      `applicationMenu`, `fileSink`.
- [x] `ARCHITECTURE.md` §5 — `AppSettings` gains `checkForUpdatesOnStartup`
      and `skippedUpdateVersion`.
- [x] `ARCHITECTURE.md` §6 — the registry gains `updates`, `storage`, the
      two Phase 18 terminal channels and the three Phase 19 workspace
      channels; note it is a copy of `ipc.snapshot.spec.ts`, which wins.
- [x] `ARCHITECTURE.md` §7 — `GitDeckApi` gains `updates` and `storage`.
- [x] `ARCHITECTURE.md` §9 — the four missing error classes.
- [x] `README.md` — "keeps up to four terminals visible at once" → Grid is
      unbounded; the layout table already says so.
- [x] `plans/README.md` — the "version remains 0.1.0" deviation note; the
      Checkpoint B row reads *absorbed by Checkpoint C*.
- [x] `checkpoint-b-pre-release.md` — one-line pointer to this file.
- [x] `phase-12` "Depends on: Checkpoint B" — annotate.
- [x] `phase-14`, `phase-15`, `phase-20` — the ticked-but-contradicted boxes
      named above.
- [x] `TESTING.md` §3 — list the packaged specs that exist after this
      checkpoint, by phase.
- [ ] `phase-11` — the clean-machine table filled in, or the acceptance
      recorded.
- [ ] `phase-22` — dates for the setting and the first run.

### 5. Release decision

- [x] **Version: 0.5.0**, chosen 2026-09-03. 0.4.0 and 0.4.1 exist as
      hand-built installers with different names and bytes; a GitHub 0.4.1
      with a different hash would be a second 0.4.1. A fresh number also
      marks the first pipeline release. `package.json` and the README badge
      say 0.5.0, and the packaged binary's own `FileVersion` agrees — the
      E2E version gate asserts it.
- [x] **Fixtures appended** for the version being cut (section 2, Phase 15).
      `tests/fixtures/storage/v0.5.0/` was written by the packaged 0.5.0
      build itself, not authored.
- [ ] **Go conditions:** every item in sections 1–4 passes or is accepted in
      writing; immutable releases is on; `npm run ci` and
      `npm run test:e2e` green locally against the exact bytes to be tagged;
      the clean-machine run done or its risk accepted.
- [ ] **No-go, unconditionally:** an excluded feature shipped; a guardrail
      probe was not caught; a network or process call site outside the
      allow-list; any channel that accepts a path or URL.

---

## Suggested verification method

| Item | How to check |
|---|---|
| Network / `openExternal` / process call sites | New guardrail in `src/shared/` (or a case in `architecture.spec.ts`): walk `src/`, match `fetch(`, `net.request`, `shell.openExternal`, `child_process`, `execFile(`, `spawn(`; assert the set of files equals an allow-list (`GitHubReleaseClient`, `updatesIpc`, `createWindow`, `explorerMenu`, `GitCliAdapter`, `WindowsPortAdapter`, `NodePtyAdapter`). Carry a "scanned ≥ N files" guard. |
| Golden fixtures per release | `storageCompat.integration.spec.ts` discovers directories; add `expect(versions).toEqual(expect.arrayContaining(['v0.1.0','v0.2.0','v0.3.0']))` so a missing release fails the suite. |
| Unit suite without tools | `npm run test:unit` from a shell whose `PATH` is `C:\Windows\System32` only, adapter disabled. |
| Second-instance forwarding | `tests/e2e/open-path.spec.ts` as described; the second process must exit within 10 s. |
| Boundary probes | Plant, run `npm test`, confirm the named test fails, delete. Six probes minimum (Checkpoint A's five plus the call-site scan). |
| Documents vs. code | `ipc.snapshot.spec.ts` and `src/shared/contracts/settings.ts` are the truth; edit the prose to match, never the reverse. |
| Clean machine | Windows 10/11 x64 VM, no Node.js: Phase 11's eight-row table, on the installer the workflow built. |

---

## E2E that must pass

1. `npm run test:e2e` — the packaged suite, 13 tests today plus whatever
   section 2 adds — green against the exact build to be tagged.
2. Phase 11's clean-machine script, on the pipeline-built installer.
3. Phase 22's manual MSI and release-page checklists.
4. A GitDeck of the previous *published* version (0.3.0), launched with the
   check enabled, shows the update banner for the new release — the first
   time the tag format has allowed it.

---

## Architecture success test

The design succeeded if these additions would stay local. Walk each on
paper; an engine rewrite anywhere is technical debt to record before the tag.

| Adding | Should touch | Should NOT touch |
|---|---|---|
| Git commit UI | `main/features/git-actions`, `renderer/features/git-actions`, new channels in the snapshot | `GitService` (stays read-only), `NodePtyAdapter` |
| SSH | terminal sessions + shell profiles | workspace persistence |
| Command palette | one renderer feature registering `AppCommand`s | any Main code, any IPC channel |
| Layout persistence (Phase 13's deferral) | workspace schema v1 → v2, one migration, one new fixture directory | terminal engine |

The last row is the first real migration and is what Phase 15's machinery
exists for. If the walk-through finds the migration cannot be written as a
pure `v1 → v2` step, that is a Phase 15 defect, not a layout problem.

---

## Deliverable

```text
Checkpoint C report
1. Section 1–4 item-by-item pass / fail / accepted-with-reason
2. Guardrails added (tests, lint), each proven by a caught probe
3. Documents edited, one line per file
4. E2E results: packaged suite · clean machine · MSI · update banner
5. Boundary violations (should be none) and the split-panes note
6. Architecture walk-through, four rows
7. Version chosen, fixtures appended, go / no-go for the first tagged release
```

---

## Report — C1, 2026-09-03

**Result: C1 PASS.** Every item in sections 1–4 holds or was made to hold.
C2 is blocked on things this machine cannot do, listed at the end. No feature
was added, no schema changed, no IPC channel added.

```text
npm run ci        1028 tests / 87 files   (was 1013 / 86 — +15, all guardrails)
npm run package   rebuilt, both installers + checksums
npm run test:e2e  16 passed               (was 13 — +3, Phases 18 and 19)
npm run test:unit 916 tests, PATH reduced to System32 + node:
                  git absent, powershell absent, pwsh absent
```

The suite was rebuilt and re-run after the one production change this
checkpoint made (below), so the E2E result above is measured against the bytes
that are in `release/` now, not against an earlier build.

### The method, and why the numbers are not the evidence

Eight deliberate violations were planted and each was caught by the test that
should catch it, then deleted:

| Probe | Caught by |
|---|---|
| `workspace/domain` → `terminal/application/TerminalManager` | `architecture.spec.ts` — reaches into a feature only through its public.ts |
| `git/domain` → `node-pty` | node-pty stays in terminal infrastructure *(and ESLint)* |
| `renderer/features/git` → `electron` | Electron out of the renderer *(and ESLint)* |
| `git/application` → `node:fs` | filesystem stays in infrastructure |
| `bootstrap` → literal `'terminal:create'` | `ipc.spec.ts` — no raw channel literal |
| `git/infrastructure` → `import { shell } from 'electron'` | **new** — Electron shell in the composition root only |
| `git/infrastructure` → `fetch(url)` | **new** — reaches the network from one file only |
| `git/infrastructure` → `node:child_process` | **new** — starts an OS process from three files only |

A ninth probe hid `tests/fixtures/storage/v0.3.0`, and the new
published-release assertion failed as it should.

This is the point of the exercise. A rule that matches nothing looks exactly
like a rule that works, and two of the rules audited here — Phase 12's and
Phase 16's "repository scan" — were manual greps run once, at a moment now
five releases old, that said nothing on any commit since.

### Fixed during the checkpoint

1. **The outward call sites are enforced, not scanned by hand.**
   `architecture.spec.ts` gained an allow-list: the network is reachable from
   `GitHubReleaseClient.ts` and nowhere else, Electron's `shell` from
   `createWindow.ts` and `registerIpc.ts` and nowhere else, and
   `node:child_process` from the Explorer menu writer, the git adapter and the
   ports adapter and nowhere else. Comments are stripped first, so prose about
   `fetch` cannot widen the list and a real call cannot hide in one.

2. **The compatibility proof covers every published release.** It covered one.
   `v0.2.0` and `v0.3.0` shipped without a fixture, so "old data always loads"
   was proven for 0.1.0 alone. Both sets now exist, and their shape is not
   guesswork: `GitDeck Setup 0.2.0.exe` and `0.3.0.exe` were unpacked and their
   `app.asar` read, which is what confirmed both releases carry the same
   eleven-field settings shape at version 1, the same `WORKSPACE_VERSION = 1`,
   and the manifest as `{ manifestVersion, firstRunAt, lastRunAt,
   lastRunAppVersion, storeVersions }`. Values in the fixtures are chosen to
   differ from every default, so the suite proves the loader preserves a user's
   choices rather than handing back defaults. `PUBLISHED_RELEASES` now fails
   the suite when a release has no fixture, and both release procedures gained
   the step that keeps it true.

3. **Phases 18 and 19 have packaged coverage.** `launch-arguments.spec.ts`
   drives the real thing: a launched app holding the single-instance lock, a
   second `GitDeck.exe` that forwards `--open-path=` and exits, the duplicate
   rule that focuses instead of opening twice, `--open-workspace=` against a
   seeded workspace, and an unknown id being dropped without taking the window
   with it. This is the path that carried Phase 18's argv-rebuild bug, which no
   unit test could see.

4. **`NoShellAvailableError` is raised by a test.** It is thrown in
   `TerminalService.create` when a machine has no shell and the request names
   none — live code, asserted by nothing, so nothing proved the service failed
   there rather than spawning something arbitrary.

5. **The data-folder copy is pinned to `storagePaths`.** `dataRoot.ts` is the
   one place that writes store filenames without asking `storagePaths.ts` for
   them, because it names files in a folder that has no paths yet. Nothing is
   wrong today. A test now asserts the copies are named after the minted paths,
   so renaming a store fails a test instead of a user's data folder.

6. **The window-open handler no longer forwards any scheme.** It handed every
   URL page content asked to open straight to `shell.openExternal`, which for
   `file:` opens a file and for a custom scheme starts whichever application
   claimed it. Nothing in this renderer opens a link, so nothing could reach it
   — this closes the door before something walks through it. `https:` and
   `http:` pass, everything else is dropped, and `mayOpenExternally` is a pure
   function with its own spec. **The one production change in this checkpoint**,
   which is why the app was repackaged and the E2E suite re-run above.

7. **Nine documents now match the code** — `ARCHITECTURE.md` §3, §5, §6, §7,
   §8 and §9; `README.md`; `TESTING.md` §3 and §4; `plans/README.md`; and
   dated annotations in the Phase 12, 14, 15, 16, 20 and 22 plans.

### Findings, recorded and not fixed

- **Phase 16's scan claim was false as written.** "No `shell.openExternal`
  outside the updates IPC layer" — `createWindow.ts` calls it too, in the
  handler that denies a second window and hands the link to the browser, and
  the updates IPC layer never imports Electron's `shell` at all: it receives an
  injected function. The guarantee that matters was always intact and is now
  enforced, and that second site is the one this checkpoint hardened. The box
  is struck through with the correction.

- **A rebuilt 0.4.1 does not have the same bytes as the shipped 0.4.1.** The
  repackage above produced an installer one hash different from the one built
  during Phase 22, because the app changed. That is the concrete argument for
  cutting **0.5.0** rather than reusing 0.4.1: two different files under one
  version number is exactly what an immutable, attested release exists to make
  impossible.

- **Three components call `window.gitdeck` directly** rather than through a
  hook: `DataFolderSetting.tsx` (Phase 17), `UpdateCheckControl.tsx` (Phase 16)
  and `WorkspacePanel.tsx` (Phase 19). All three are wired containers, not the
  dumb presentational components the rule names, so this is convention drift
  rather than a boundary violation — every other feature puts IPC in
  `hooks/`. Left alone deliberately: refactoring production code during an
  audit would invalidate the packaged build the E2E results above are measured
  against.

- **`ARCHITECTURE.md` had drifted further than expected.** §6 was missing
  twelve of twenty-seven channels and two whole namespaces; §9 was missing
  seven error classes and named one, `PortInspectionError`, correctly while
  omitting its timeout sibling. Both are now correct, and §6 says out loud that
  `ipc.snapshot.spec.ts` is the authority when they disagree.

### Checked and holding, without change

Ports takes only Main-minted capabilities and kills with `taskkill /PID <pid>
/F` — no `/IM`, `/T`, `/S`, `runas` or second path exists in production code;
PIDs 0 and 4 are blocked in the domain. The Mosaic is renderer-only: no layout
word appears in `src/main` or `src/preload`, and `terminalStore` cannot reach
`window.gitdeck` at all, which makes "layout never spawns or kills a PTY"
structural rather than asserted. Capacity is `focus 1 · columns 2 · main-side
3 · grid Infinity`. Terminal output is never logged: every logger call in the
terminal feature carries ids and exit codes only. The data-folder switch copies
before it writes the pointer. `installer.nsh` deletes two HKCU keys and touches
nothing else. Phases 12–21 have **zero** unticked boxes between them, 214
ticked, and the repository has no `it.skip`, `describe.skip` or `.only`
anywhere.

### Owed — nothing here can do it

| Item | Why |
|---|---|
| Clean Windows install | Needs a machine with no Node.js and no build tools. Outstanding since Phase 11, through five builds. |
| Immutable releases setting | A repository setting; this working copy is not a git repository and has no remote. |
| First tagged workflow run | Same. Every gate the workflow chains has been run here by hand, in the same order, green. |
| MSI install / uninstall by hand | Would silently upgrade the GitDeck the user is running, to prove what the MSI database already showed. |
| Phase 16 packaged E2E | Still what Phase 16 says: worth adding once a release the check can actually see exists. |

### Go / no-go

**C1: go.** The audited boundary holds and is now enforced by tests that fail
on every commit rather than by a scan someone remembers to run.

**C2: not yet.** Cutting the first pipeline release needs the repository
setting, a fixture directory for the version being cut, and a decision on the
version number — 0.5.0 is still the recommendation, because 0.4.0 and 0.4.1
already exist as hand-built installers with different names and bytes, and a
GitHub 0.4.1 with a different hash would be a second 0.4.1. The clean-machine
run should happen before that tag or be accepted in writing.

---

## Report — C2 in progress, 2026-09-03

**0.5.0 is built and gated. It is not published**, and cannot be from here.

```text
package.json      0.4.1 → 0.5.0   (README badge with it)
npm run ci        1030 tests / 87 files, exit 0
npm run package   release\GitDeck-Setup-0.5.0-x64.exe   114 MB
                  release\GitDeck-Setup-0.5.0-x64.msi   114 MB
                  release\GitDeck-0.5.0-checksums.txt
npm run test:e2e  16 passed, exit 0, against those exact bytes
```

The E2E version gate compares the built binary's own `FileVersion` to
`package.json` and passed, so the three places a version can disagree —
manifest, badge, binary — agree.

**The golden fixture for 0.5.0 was captured, not authored.** The packaged
build was launched against a throwaway profile and asked, through its own IPC,
to save a workspace and write a full settings patch. The three files it
produced were copied into `tests/fixtures/storage/v0.5.0/` unedited:
`settings.json` with all eleven fields at non-default values, `storage.json`
carrying `lastRunAppVersion: "0.5.0"`, and the workspace its own serializer
wrote. This is the shape the compatibility suite should hold every future
release to, and the release procedure now says so.

One detail worth keeping: the captured `storage.json` has a
`lastUpdateCheckAt` even though the captured settings say
`checkForUpdatesOnStartup: false`. That is correct — the startup check ran
under the default before the settings patch turned it off — and it is the kind
of thing an authored fixture would have got wrong.

### What is left, and who can do it

1. **Commit and tag.** This working copy is not a git repository, so
   `git tag v0.5.0 && git push origin main v0.5.0` has to happen where the
   repository lives. The workflow does the rest, and refuses to publish if the
   tag and `package.json` disagree.
2. **Enable Immutable releases** in the repository settings first. Without it
   there is no `Release attestation (json)` row and `gh release verify` has
   nothing to verify.
3. **Decide on the clean-machine run.** Outstanding since Phase 11 through six
   builds now. Either run Phase 11's script on
   `release\GitDeck-Setup-0.5.0-x64.exe` in a VM with no Node.js, or write the
   risk acceptance into Phase 11 and sign it.
4. **The MSI checklist**, if an administrator will ever deploy it.

The local artifacts are throwaway: the workflow builds its own from the tag,
and only what it builds is uploaded.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and
plans/checkpoint-c-release-readiness.md.

Run Checkpoint C. This is an audit, not a feature phase.

Work sections 1–4 first (C1): verify every item against today's code, not
against earlier Verification sections; prove each guardrail by planting a
violation and watching it fail; add the call-site scan and the fixture
assertion as permanent tests; reconcile every document listed in section 4
with the code, annotating stale ticks with the date rather than deleting
them. Add the packaged specs for Phases 18 and 19 or write the
justification into their plan files.

Then C2 (sections 5–7): append the golden fixtures for v0.2.0 and v0.3.0
and for the version being cut; run the clean-machine script in a VM or
record the risk acceptance; enable immutable releases; choose the version
(0.5.0 recommended) and make package.json, the README badge and the tag
agree; push the tag and verify the six rows and gh release verify.

Fix violations, add no features, change no schema, add no IPC channel.

Report item-by-item pass/fail/accepted, guardrails added with their probes,
documents edited, E2E results, boundary violations, the architecture
walk-through, and go/no-go for the first tagged release.
```
