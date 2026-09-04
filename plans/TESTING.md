# GitDeck — Testing Contract

> **Purpose:** the shared testing rules every phase plan depends on — tooling, layout, naming, test doubles, fixtures.
> Each phase plan lists *its own* test files and cases in a **Test plan** section. This file says *how* they are written.
>
> Read alongside `ARCHITECTURE.md` before every session.

---

## 1. The rule

**A phase is not done until its Test plan is implemented and green.**

Tests ship in the *same session* as the code they validate — never as a follow-up. If a session runs out of room, cut scope from the feature, not from the tests.

---

## 2. Levels

| Level | Runs against | Speed | Must not touch |
|---|---|---|---|
| **Unit** | one module, all collaborators faked | ms | real shells, real fs, real git, real IPC |
| **Integration** | one adapter against the real resource | 100s of ms | the UI |
| **E2E** | the assembled app via Playwright | seconds | — |

Default to unit. Add an integration test only where the real resource *is* the thing under test (node-pty, filesystem, git CLI, shell detection, port enumeration/termination).

**E2E rule.** The E2E suite was introduced whole in Phase 11 and always drives the **packaged** application. Post-v0.1.0 phases follow one rule: a phase that touches an operating-system resource (Phase 12's process termination, and anything after it that spawns, kills or binds) ships **one** packaged-app spec in `tests/e2e/` covering its critical flow — and any process it inspects or kills must be a disposable child the test spawned itself. Pure-UI phases still add no E2E.

---

## 3. Layout and naming

Tests are **colocated** with the code they cover:

```text
src/main/features/terminal/application/TerminalManager.ts
src/main/features/terminal/application/TerminalManager.spec.ts
```

| Pattern | Meaning |
|---|---|
| `*.spec.ts` | unit test, no real OS resource |
| `*.integration.spec.ts` | touches a real shell / fs / git binary |
| `tests/e2e/*.spec.ts` | Playwright against the packaged app — Phase 11, plus one spec per OS-touching post-v0.1 phase |

The packaged suite today, and the phase each file answers for:

| Spec | Phase | Covers |
|---|---|---|
| `smoke.spec.ts` | 11 | the ten-step critical flow, twice against one profile |
| `packaged-pty.spec.ts` | 11 | node-pty inside the built artifact; the shipped version |
| `no-orphans.spec.ts` | 11 | shutdown reaps every shell the app started |
| `ports.spec.ts` | 12 | inspect and terminate, against a listener the test spawned |
| `launch-arguments.spec.ts` | 18, 19 | second-instance forwarding of `--open-path` and `--open-workspace` |
| `release-assets.spec.ts` | 22 | the three release files, their names and their checksums |

Phase 16 has no packaged spec and says so in writing: a bounded outbound GET
against a service that answered 404 until the first real release is not
usefully E2E-testable. Phases 13, 20, 21 and 23 are renderer-only and
correctly add none.

Phase 23 is the one phase whose subject — colour, shape and size — no spec
in either project can see: jsdom lays out no CSS, and §7 forbids snapshots
of rendered UI. `src/shared/tokens.spec.ts` therefore audits the
stylesheets as **text**, the way `architecture.spec.ts` audits source: no
colour outside the token block, no `var()` naming an undeclared token, and
a WCAG contrast floor on every pair that carries text. What text cannot
check — that a rule still reaches the element it was written for — is
covered by driving the packaged build and looking at it.

**Running the packaged suite needs the installed GitDeck closed.** Each spec
isolates itself with `--user-data-dir`, so the single-instance lock (Phase 18)
does not collide — but a live smoke run by hand does, and Phase 20 skipped its
visual check for exactly that reason.
| `src/**/testing/*.ts` | test doubles — **not** test files, never contain `it()` |
| `tests/fixtures/**` | captured real-world inputs |

`vitest.config.ts` uses two projects: `main` (node environment) and `renderer` (jsdom).

---

## 4. Test double catalog

Build these once and reuse them across phases. Each lives in the feature's `testing/` folder and is exported from there, **not** from `public.ts`.

| Double | Introduced | Replaces | Notes |
|---|---|---|---|
| `FakePtyFactory` / `FakePtyProcess` | Phase 1 | `node-pty` | manual `emitData()` / `emitExit()` triggers; records `write`/`resize`/`kill` calls |
| `fakeGitDeckApi` | Phase 3 | `window.gitdeck` | records every call; lets a test assert *no* call happened |
| `InMemoryWorkspaceRepository` | Phase 6 | JSON on disk | same interface as `JsonWorkspaceRepository` |
| `FakeShellDetector` | Phase 5 | `WindowsShellDetector` | returns a scripted profile list |
| `FakeGitAdapter` | Phase 9 | `GitCliAdapter` | returns scripted status or throws `GitNotAvailableError` |
| `FakeLogger` | Phase 0 | `Logger` | captures entries so tests can assert on logged failures |
| `FakePortAdapter` | Phase 12 | `WindowsPortAdapter` | scripted inspections (list → revalidate → verify) and per-pid termination outcomes; records every pid asked to die |
| `InMemorySettingsStore` | Phase 6 | `JsonSettingsStore` | same interface, no disk |
| `FakeReleaseClient` | Phase 16 | `GitHubReleaseClient` | scripted release answers or a scripted failure; records every call so a test can assert **zero** |

A test that needs a double not on this list should ask whether the module under test has too many dependencies.

---

## 5. Fixtures

```text
tests/fixtures/
├── git/            captured `git status --porcelain=v2 --branch` output
└── workspace/      valid.json · corrupt.json · wrong-version.json · missing-fields.json
```

Capture fixtures from real tools once, then never require the real tool in unit tests.

---

## 6. What every phase's tests must prove

Beyond feature behavior, each phase carries the same three obligations:

1. **Isolation** — the thing built this phase does not break the things built before it.
2. **Boundary** — the layer rules in `ARCHITECTURE.md` §2 still hold (e.g. a renderer test asserts `window.gitdeck` was *not* called by a dumb component).
3. **Cleanup** — anything subscribed is unsubscribed; anything spawned is disposed.

The third is the one that gets skipped and the one that causes the hardest bugs later. Assert listener counts and disposal explicitly.

---

## 7. Assertion style

Prefer asserting on **observable behavior**, not on internals:

```ts
// good — asserts the contract
expect(fakeApi.write).toHaveBeenCalledWith('sess-1', 'ls\r')

// bad — asserts the implementation
expect(manager['sessions'].size).toBe(1)
```

For negative guarantees, assert explicitly rather than relying on absence:

```ts
unmount()
expect(fakeApi.kill).not.toHaveBeenCalled()   // unmount must never kill a PTY
```

---

## 8. Running

```bash
npm test                  # unit + integration
npm test -- --watch       # during a session
npm run test:e2e          # Phase 11 only
npm run typecheck
npm run lint
```

Every session ends with `npm run typecheck && npm run lint && npm test` green.

---

## 9. Deliberately not doing

No coverage threshold gate. Coverage percentage is a weak proxy — the per-phase case lists in each plan are the real contract. Review those lists, not a number.

No snapshot tests of rendered UI. They break on styling changes and assert nothing about behavior. The one exception is the IPC channel registry snapshot in Phase 10, which exists specifically to catch *unintended additions*.
