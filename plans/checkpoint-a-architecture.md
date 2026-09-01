# Checkpoint A — Architecture Review (after Phase 5)

| | |
|---|---|
| **Purpose** | Audit-only gate. Prove the terminal half of the system is sound **before** persistence and Git start depending on it. |
| **Depends on** | Phase 5 |
| **Unlocks** | Phase 6 |
| **Status** | ☑ Passed 2026-08-27 — 2 gaps found and closed |

---

## Why this is a separate plan

This is not a feature — it is a stop-and-verify session. Its output is a pass/fail report plus, if needed, corrective refactors. Bundling it into Phase 5 or Phase 6 guarantees it gets skipped.

**Rule: if any item fails, fix the architecture before starting Phase 6.**

---

## Checklist

- [x] Renderer cannot import `electron`.
- [x] Renderer cannot import `node-pty`.
- [x] Domain modules cannot import React.
- [x] Domain modules cannot import Electron.
- [x] PTY instances exist only in Main.
- [x] Closing one terminal does not impact others.
- [x] `TerminalManager` has unit tests.
- [x] IPC contracts are typed.
- [x] Preload APIs are intent-specific.
- [x] Terminal UI has cleanup logic.
- [x] Shell detection is independent from UI.

**Test-coverage audit** (added — see `TESTING.md`)

- [x] Every phase 0–4 Test plan box is actually ticked in its plan file.
- [x] No test was skipped (`it.skip` / `describe.skip`) or silently deleted to make a later phase pass.
- [x] `FakePtyFactory` and `fakeGitDeckApi` exist and are reused, not re-implemented per test file.
- [x] The unit suite runs with no real shell, no real filesystem writes outside temp, and no network.
- [x] `npm test` completes in a time you are willing to run on every change.

---

## Suggested verification method

| Item | How to check |
|---|---|
| Import boundaries | ESLint `no-restricted-imports` rules per directory — make the rule permanent, not a one-off grep |
| PTY location | grep for `node-pty` outside `main/features/terminal/infrastructure/` |
| Session isolation | integration test: create 3 sessions, kill 1, assert the others still emit data |
| Cleanup | mount/unmount `TerminalView` 50× and assert listener count is stable |
| Typed IPC | no string literal channel names outside `shared/contracts/ipc.ts` |

Encoding these as **lint rules and tests** is preferred over a manual pass — it makes the checkpoint self-enforcing for every later phase.

---

## Report — 2026-08-27

**Result: PASS.** Every checklist item holds. Two guardrail gaps were found and
closed; no production code violated the architecture.

### Method

Each import rule was verified by **planting a deliberate violation and checking
it was reported**, then deleting the probe. Six probes were planted:

| Probe | Caught? |
|---|---|
| `shared/ → electron` | ✅ |
| `renderer/ → electron` | ✅ |
| `domain/ → node-pty` | ✅ |
| `renderer/ → main/` | ✅ |
| `workspace/domain → terminal/application` | ❌ **gap** |
| `preload/ → main/` | ❌ **gap** |

Asserting the rules exist would have missed both. A rule that matches nothing
looks identical to a rule that works.

### Gaps found and closed

**1. Cross-feature internal imports were unenforced.** Mandatory rule 5 and
`ARCHITECTURE.md` §4 say a feature's internals are private, but nothing checked
it. Closed with `src/shared/architecture.spec.ts`, which walks the source tree,
**resolves** every specifier (relative *and* `@main/…` alias forms) and flags
any import into `features/<X>/` that is not `features/<X>/public`. Written as a
test rather than a lint rule because glob patterns match specifier strings and
would miss the alias shape.

The test carries its own guard — a case proving the resolver actually classifies
a violation as a violation — because a scanner that silently returns "clean" is
the failure mode that makes an audit worthless.

**2. The preload bridge could import Main-process code.** Closed with an ESLint
rule mirroring the renderer's.

Both were re-verified by replanting the two probes and watching them fail.

### Other corrections

`terminalIpc.ts` logged `'terminal:create rejected'` as prose. The registry
guard did not flag it (its regex requires the literal to end at the channel
name) and it was never used as a channel — but it would drift silently on a
rename. Now built from `IPC.terminal.*`.

### Test-coverage audit

```text
241 tests / 20 files, 21.3s        no it.skip / describe.skip / .only anywhere
237 unit tests                     no real shell, no fs writes, no network
  4 integration tests              one file, spawns a real shell by design
```

Phases 0–4 have **zero unticked boxes** between them.

Doubles are shared, not re-implemented: `FakePtyFactory` (4 spec files),
`fakeGitDeckApi` (6), `FakeLogger` (4).

Added `npm run test:unit` and `npm run test:integration`. Until now the
"unit suite needs no real shell" claim was unverifiable, because there was no
way to run the unit suite by itself.

### Guardrails now in place

| Guardrail | Enforces |
|---|---|
| ESLint × 5 directory scopes | shared/domain/renderer/preload import restrictions |
| `architecture.spec.ts` | feature `public.ts` boundary, node-pty location, `public.ts` exists per feature |
| `ipc.spec.ts` | no raw channel literal outside the registry |
| `terminalApi.spec.ts` | bridge exposes exactly six members, no generic exec |
| `terminalStore.spec.ts` | store state survives a JSON round-trip |

Three of these carry a "the scan found a meaningful number of files" assertion,
so a broken directory walk fails loudly instead of passing vacuously.

### Carried forward

An exited session still lingers in `TerminalManager`'s map in Main (bounded by
terminals opened per run; no OS resource leaks). Phase 8 revisits session
lifecycle. Not a checklist failure — recorded so it is not forgotten.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/checkpoint-a-architecture.md.

Run Checkpoint A. This is an audit, not a feature phase.

Verify every checklist item. Where practical, convert the check into a
permanent ESLint rule or automated test instead of a manual inspection.

Fix any violation found, but do not add new features and do not start Phase 6.

Report item-by-item pass/fail, violations found, corrective changes made,
and guardrails added.
```
