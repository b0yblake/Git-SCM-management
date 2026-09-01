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
| — | [checkpoint-b-pre-release.md](checkpoint-b-pre-release.md) | **Audit gate** — invariants hold, then cut v0.1.0 | ☐ |
| 12 | [phase-12-port-management.md](phase-12-port-management.md) | Inspect local ports and safely terminate selected owning processes | ☑ |
| 13 | [phase-13-terminal-mosaic.md](phase-13-terminal-mosaic.md) | Replace horizontal tabs with a searchable Navigator and four-pane Mosaic canvas | ☑ |

> Note on ordering: `PLAN.md` §35 places the architecture checkpoint after Phase 5. It is placed after **Phase 4** here because every item on that checklist is already testable once multi-tab works, and catching a boundary violation before shell detection is written is cheaper. Move it back one row if you prefer to follow §35 literally.

> ◐ = built and verified on the development machine; the clean-machine install remains to be run by hand.

Phase 12 is the first post-v0.1.0 upgrade. It stays after Checkpoint B so the
existing release boundary can be audited and cut without silently pulling a
destructive operating-system feature into v0.1.0.

Phase 13 promotes the Split Panes backlog item after explicit approval of the
Concept B Mosaic direction. It is renderer-only and does not widen the PTY or IPC
surface.

> **Deviation, recorded:** Phase 12 was implemented 2026-08-28 on explicit
> instruction while Checkpoint B was still unrun. It changed no pre-existing
> feature file, so the boundary Checkpoint B audits is intact — but the audit
> (and the Phase 11 clean-machine checklist behind the ◐) is still owed, and
> `version` remains `0.1.0` until it happens.

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
