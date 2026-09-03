# GitDeck — Plan Index

`../PLAN.md` split into one plan per implementation session. Each plan has a **distinct purpose**, its own scope boundary, its own Definition of Done, and a ready-to-paste Claude Code prompt.

**Read `ARCHITECTURE.md` and `TESTING.md` before every session.** They are the shared contracts; the phase plans deliberately do not repeat them.

Every phase plan carries a **Test plan** section with concrete test files and specific cases. A phase is not done until its Test plan is green — tests ship in the same session as the code.

---

## Order (strict — do not reorder)

| # | Plan | Purpose in one line | Status |
|---|---|---|---|
| 0 | [phase-00-foundation.md](phase-00-foundation.md) | Runnable, strictly-typed Electron shell with enforced boundaries — zero features | ☑ |
| 1 | [phase-01-terminal-engine.md](phase-01-terminal-engine.md) | Main owns PTY lifecycle behind a testable abstraction | ☑ |
| 2 | [phase-02-terminal-ipc.md](phase-02-terminal-ipc.md) | Typed, validated, intent-specific bridge to the renderer | ☑ |
| 3 | [phase-03-terminal-ui.md](phase-03-terminal-ui.md) | One terminal with a correct xterm lifecycle | ☑ |
| 4 | [phase-04-multi-tab-ui.md](phase-04-multi-tab-ui.md) | Many sessions, renderer-side only — engine untouched | ☑ |
| — | [checkpoint-a-architecture.md](checkpoint-a-architecture.md) | **Audit gate** — terminal half must be sound before persistence | ☑ |
| 5 | [phase-05-shell-profiles.md](phase-05-shell-profiles.md) | Shell discovery as an infrastructure service | ☑ |
| 6 | [phase-06-workspace-persistence.md](phase-06-workspace-persistence.md) | Persist definitions, never live sessions | ☑ |
| 7 | [phase-07-workspace-ui.md](phase-07-workspace-ui.md) | Author a workspace, open it, spawn N terminals | ☑ |
| 8 | [phase-08-session-restore.md](phase-08-session-restore.md) | Restore configuration at startup — not process state | ☑ |
| 9 | [phase-09-git-readonly.md](phase-09-git-readonly.md) | Git as additive, optional, read-only metadata | ☑ |
| 10 | [phase-10-ui-polish.md](phase-10-ui-polish.md) | Daily-usable without the dev console | ☑ |
| 11 | [phase-11-packaging.md](phase-11-packaging.md) | Installer that works with no dev tooling present | ◐ |
| — | [checkpoint-b-pre-release.md](checkpoint-b-pre-release.md) | **Audit gate** — invariants hold, then cut v0.1.0 | ☐ never run · absorbed by [Checkpoint C](checkpoint-c-release-readiness.md) |
| 12 | [phase-12-port-management.md](phase-12-port-management.md) | Inspect local ports and safely terminate selected owning processes | ☑ |
| 13 | [phase-13-terminal-mosaic.md](phase-13-terminal-mosaic.md) | Replace horizontal tabs with a searchable Navigator and four-pane Mosaic canvas | ☑ |
| 14 | [phase-14-storage-contract.md](phase-14-storage-contract.md) | One owner for every persisted byte: paths, manifest, quarantine, uninstall policy | ☑ |
| 15 | [phase-15-data-migrations.md](phase-15-data-migrations.md) | Upgrades never strand data: migration engine, backups, golden fixtures | ☑ |
| 16 | [phase-16-update-check.md](phase-16-update-check.md) | Startup GitHub release check with a dismissible notify-and-link prompt | ☑ |
| 17 | [phase-17-data-folder.md](phase-17-data-folder.md) | User-chosen data folder via pointer file and native picker, applied on restart | ☑ |
| 18 | [phase-18-explorer-open.md](phase-18-explorer-open.md) | Shift+right-click a folder in Explorer → open it as a terminal in the running (or launched) GitDeck | ☑ |
| 19 | [phase-19-workspace-shortcut.md](phase-19-workspace-shortcut.md) | Right-click a workspace → Create shortcut…; the .lnk opens that workspace in the running (or launched) GitDeck | ☑ |
| 20 | [phase-20-add-terminal-slot.md](phase-20-add-terminal-slot.md) | One "Add new Terminal" ghost slot in the next empty pane of Columns/Main+Side/Grid | ☑ |
| 21 | [phase-21-elastic-grid.md](phase-21-elastic-grid.md) | Grid grows past four: a 16:9-guided lattice keeps every terminal on one page, add slot always last | ☑ |
| 22 | [phase-22-release-packaging.md](phase-22-release-packaging.md) | One pushed tag → GitHub Release with checksums, EXE + MSI installers, digests and attestation — no hand upload | ◐ |
| — | [checkpoint-c-release-readiness.md](checkpoint-c-release-readiness.md) | **Audit gate** — absorbs the unrun Checkpoint B, verifies every Phase 12–22 invariant, reconciles the docs, then go/no-go for the first pipeline release | ◐ C1 passed 2026-09-03; 0.5.0 built and gated, tag owed |

> Note on ordering: `PLAN.md` §35 places the architecture checkpoint after Phase 5. It is placed after **Phase 4** here because every item on that checklist is already testable once multi-tab works, and catching a boundary violation before shell detection is written is cheaper. Move it back one row if you prefer to follow §35 literally.

> ◐ = built and verified on the development machine, with a step left that this machine cannot perform: Phase 11's clean-machine install, and Phase 22's repository setting and first tagged workflow run.

Phase 12 is the first post-v0.1.0 upgrade. It stays after Checkpoint B so the
existing release boundary can be audited and cut without silently pulling a
destructive operating-system feature into v0.1.0.

Phase 13 promotes the Split Panes backlog item after explicit approval of the
Concept B Mosaic direction. It is renderer-only and does not widen the PTY or IPC
surface.

Phases 14–16 were scoped 2026-09-01 around the first public release. Their
order is deliberate: 14 writes down the storage contract (paths, manifest,
quarantine), 15 builds the migration policy and engine on that anchor while
both stores are still at schema v1, and 16 — which promotes only the
*notification* half of Phase 11's auto-update exclusion — can then promise
that upgrading is safe for existing data. Silent download-and-install remains
in `BACKLOG.md`, blocked on code signing.

> **Deviation, recorded:** Phase 12 was implemented 2026-08-28 on explicit
> instruction while Checkpoint B was still unrun. It changed no pre-existing
> feature file, so the boundary Checkpoint B audits is intact — but the audit
> (and the Phase 11 clean-machine checklist behind the ◐) is still owed, and
> `version` remains `0.1.0` until it happens.
>
> **Superseded 2026-09-03 by Checkpoint C.** Checkpoint B was never run and ten
> more phases shipped past it; 0.2.0 and 0.3.0 were published by hand and the
> working version is 0.4.1, so "version remains 0.1.0" stopped being true long
> ago. Checkpoint C carries every Checkpoint B item plus the Phase 12–22
> invariants, and owns the go/no-go for the first release cut by the Phase 22
> pipeline.

Supporting documents:

- [ARCHITECTURE.md](ARCHITECTURE.md) — shared contract: rules, layers, structure, models, IPC, security
- [TESTING.md](TESTING.md) — testing contract: levels, layout, naming, test doubles, fixtures
- [BACKLOG.md](BACKLOG.md) — post-v0.1.0 scopes, deliberately excluded from every phase above

---

## How to run one session

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-NN-<name>.md.

Implement Phase NN only, including its Test plan.

<paste the "Claude Code prompt" block from that plan>
```

Each plan's prompt block is already written — copy it verbatim.

---

## Rules that apply to every session

1. Implement **one plan only**. Never pull work forward from a later phase.
2. Read `ARCHITECTURE.md` and `TESTING.md` first; do not re-derive their rules.
3. List the files you expect to change before editing.
4. Preserve existing `public.ts` interfaces unless the current plan changes them.
5. **Write the phase's tests in this same session** — ticking every box in its Test plan.
6. Finish with `npm run typecheck && npm run lint && npm test`.
7. Report: implemented · files changed · tests · known limitations · explicitly deferred.

If a session runs short on room, cut feature scope — never the tests. An untested phase becomes the next phase's debugging session.

---

## Tracking

Mark ☐ → ☑ in the table above as each plan lands, and update the **Status** line inside the plan file itself. Each plan is sized for roughly one focused session; if a session grows past its Definition of Done, split it rather than widening the plan.
