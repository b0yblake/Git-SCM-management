# Phase 9 — Read-Only Git Integration

| | |
|---|---|
| **Purpose** | Add Git awareness as **purely additive, optional metadata** — the app must remain fully functional when Git is absent. |
| **Depends on** | Phase 8 |
| **Unlocks** | Phase 10 |
| **Status** | ☑ Done 2026-08-28 |

---

## Why this phase is separate and comes last among features

Git is the feature most likely to become entangled with everything else. It is deliberately built after the terminal and workspace layers are stable, so it can only *read* from them.

---

## Hard scope limit

The Git feature **may**: detect repository root · detect branch · calculate ahead/behind · count changed files · report clean/dirty state.

The Git feature **must NOT**: commit · push · pull · rebase · merge · reset · modify Git configuration.

Write operations are a separate future scope (`BACKLOG.md` → Git Actions). Do not add them to `GitService` later — add a new feature module.

---

## Data contract

```ts
export interface GitRepositoryStatus {
  repositoryRoot: string
  branch: string | null
  ahead: number
  behind: number
  staged: number
  modified: number
  untracked: number
  conflicted: number
  isClean: boolean
}
```

`inspect(path)` returns `null` when the path is not inside a repository — that is a normal result, not an error.

---

## Tasks

- [x] Define Git adapter interface.
- [x] Implement Git CLI adapter.
- [x] Detect repository root.
- [x] Detect current branch.
- [x] Parse status.
- [x] Parse ahead/behind.
- [x] Add `GitService`.
- [x] Add Git IPC.
- [x] Add Git renderer store.
- [x] Show branch in the status bar.
- [x] Show a dirty indicator — in the status bar, not the tab (see Verification).
- [x] Refresh on interval with debounce.
- [x] Refresh after terminal focus or cwd changes where possible.

---

## Files expected to change

```text
src/main/features/git/domain/GitRepositoryStatus.ts
src/main/features/git/domain/GitAdapter.ts
src/main/features/git/application/GitService.ts
src/main/features/git/infrastructure/GitCliAdapter.ts
src/main/features/git/ipc/gitIpc.ts
src/main/features/git/public.ts
src/shared/contracts/ipc.ts
src/preload/gitApi.ts
src/renderer/src/features/git/store/gitStore.ts
src/renderer/src/features/git/components/GitStatusBadge.tsx
```

The Git feature must not import terminal infrastructure.

---

## Test plan

> Conventions: `TESTING.md`. **The parser suite must not require a real git repository** — drive it entirely from captured fixtures. Capture them once with `git status --porcelain=v2 --branch`.

| Test file | Covers |
|---|---|
| `tests/fixtures/git/` | captured porcelain output, one file per scenario |
| `src/main/features/git/infrastructure/gitStatusParser.spec.ts` | parsing, fixture-driven |
| `src/main/features/git/testing/FakeGitAdapter.ts` | double |
| `src/main/features/git/application/GitService.spec.ts` | orchestration, debounce, failure modes |
| `src/renderer/src/features/git/store/gitStore.spec.ts` | renderer state |
| `src/main/features/git/infrastructure/GitCliAdapter.integration.spec.ts` | real git binary |

**Parser — one fixture per case**

- [x] Clean repo → `isClean: true`, every count `0`.
- [x] Three modified + one untracked → exact counts.
- [x] A file both staged and modified is counted in **both** `staged` and `modified`.
- [x] Conflicted entries produce a non-zero `conflicted` count.
- [x] Branch header ahead/behind → `ahead: 2`, `behind: 1`. (The plan quoted porcelain **v1**; the captured fixture is real v2, `# branch.ab +2 -1`.)
- [x] Branch with no upstream → `ahead: 0`, `behind: 0`, no crash.
- [x] Detached HEAD → `branch` is the documented value.
- [x] Fresh repo with no commits yet.
- [x] Filenames containing spaces and non-ASCII characters (Windows forbids quotes in a filename).
- [x] Renamed and copied entries.
- [x] Empty output → treated as clean, not as a parse error.
- [x] Truncated or unrecognised output → a handled parse failure, never a wrong count.

**Service**

- [x] A path outside any repository returns **`null`** — assert this is not an error path.
- [x] Repository root is resolved from a nested subdirectory.
- [x] `git` binary missing → `GitNotAvailableError`, handled, logged once rather than per poll.
- [x] A hanging `git` invocation hits the documented timeout and is killed.
- [x] A non-zero git exit code is handled, not parsed as status.

**Polling**

- [x] Five refresh requests inside the debounce window produce **one** git invocation.
- [x] A refresh requested while one is in flight for the same path does not spawn an overlapping process.
- [x] Refresh is triggered on terminal focus change and on cwd change.
- [x] Polling stops when no terminal is in a repository.

**The independence guarantee**

- [x] With `FakeGitAdapter` throwing `GitNotAvailableError` on every call, the terminal, tab and workspace suites still pass unchanged.
- [x] With Git unavailable, the status badge is simply absent — no error toast per poll interval.
- [x] The Git feature imports nothing from `terminal/infrastructure`.

**Read-only guarantee**

- [x] Repository scan of `src/main/features/git/`: no `commit`, `push`, `pull`, `rebase`, `merge`, `reset`, or `config --set` argument is ever constructed.

---

## Verification — 2026-08-28

```text
npm run typecheck   pass
npm run lint        pass
npm test            589 tests / 46 files   (was 517 / 39 after Phase 8)
npm run build       pass
```

**The Definition of Done was proved by deleting the feature, not by asserting
it.** `src/main/features/git/` and `src/renderer/src/features/git/` were removed
outright, along with their three wiring lines (container, `registerIpc`, `App`):

```text
npm run typecheck   pass
npm run lint        pass
npm test            518 tests / 39 files   — every non-Git suite, unchanged
npm run build       pass
electron .          boots, opens a terminal
```

518 is exactly 589 − 71: the Git suites vanished and nothing else moved. That is
the independence guarantee measured rather than claimed. The tree was then
restored and CI re-run.

**End-to-end against a real repository**, driven by clicking real DOM with a
throwaway repo and a plain folder side by side in one workspace:

```text
PASS  a clean repository shows its branch and says clean
PASS  a directory outside any repository shows no badge at all
PASS  the badge notices real changes on the next poll
PASS  the badge follows a real branch change      (appeared after ~3.1s)
PASS  polling keeps a settled badge steady rather than flickering
PASS  the terminal itself is unaffected by any of this
```

**Read-only is enforced twice, and both guards were proved.** Planting
`run(['commit', '-m', 'oops'], …)` in `GitCliAdapter` failed two tests by name:
the argument-construction test, and the scan that reads every non-spec file in
the feature looking for a quoted write verb. The channel registry is pinned too
— `IPC.git` must hold exactly `inspect`, because a write operation would have to
appear there first.

**"Debounce" is realised as a short per-path cache, not a trailing timer.** A
trailing debounce leaves the first four of five callers without an answer, which
is wrong for a request/response channel. `GitService` instead keeps a 2-second
result per path and shares an in-flight promise, so five requests inside the
window produce one `git` invocation and all five get a value. Both properties
are tested directly.

**Every "nothing to show" case answers `Ok(null)`** — outside a repository, git
missing, output unreadable, git killed on timeout. The renderer therefore has
nothing to distinguish and nothing to report, which is what makes an uninstalled
git invisible rather than an error per poll interval. Once a missing git is
detected, `GitService` stops spawning entirely for the rest of the session and
logs once; the cost is that installing git mid-session needs a restart.

**Polling stops when there is nothing to watch.** The first draft used
`setInterval`, which meant a plain directory spawned `git rev-parse` every five
seconds forever for an answer that cannot change while the same tab is focused.
It is now a self-arming timeout that only re-arms while a repository is in view;
focusing a different terminal starts it again.

**Deviations worth naming:**

| Plan says | What shipped | Why |
|---|---|---|
| "dirty indicator in the sidebar/tab" | in the status bar, with the branch | a badge inside `TerminalTab` would make the terminal feature import the Git feature, and deleting Git would then break the terminal — the exact entanglement this phase exists to prevent |
| "refresh on cwd change" | refresh on **focus** change | the renderer only knows the directory a terminal was *spawned* in; following `cd` means parsing shell output, which is out of scope. The plan's "where possible" covers this |
| `## main...origin/main [ahead 2, behind 1]` | `# branch.ab +2 -1` | the plan quoted porcelain **v1**; v2 is the documented stable format and is what was captured |
| filenames with quotes | spaces and non-ASCII only | Windows forbids `"` in a filename, so no such fixture can be captured on this platform |

**Detached HEAD is `branch: null`**, and the badge renders "detached". A fresh
repository with no commits still reports its branch name, because the branch
exists — it is only unborn.

**The parser never runs git.** It takes a string and returns counts, and its
whole suite is driven from twelve fixtures captured once from real repositories,
so it passes on a machine with no git installed. Paths are counted, never read,
which is why C-quoted non-ASCII filenames need no special handling.

**Known limitations.**

- A change takes up to about seven seconds to appear (five-second renderer poll
  plus the two-second cache). Measured at ~3.1s in practice.
- Status follows the terminal's spawn directory, not where the shell has since
  `cd`-ed to.
- Ahead/behind reflect the last `fetch`; this feature never fetches, because
  fetching is a write to the repository's refs.
- One repository is inspected at a time — the focused one. Per-tab badges would
  need the entanglement rejected above.

---

## Acceptance criteria

For a terminal cwd inside a Git repository the UI displays:

```text
main
clean
```

or:

```text
feature/auth
3 modified
1 untracked
↑2 ↓1
```

**The terminal remains fully usable when Git is not installed** — no error spam, no blocked UI, badge simply absent.

---

## Definition of Done

- Polling is debounced and does not spawn overlapping `git` processes.
- Removing the entire Git feature would leave the app working — verify by disabling it.
- **Every box in the Test plan is ticked and `npm test` is green.**
- The parser suite passes on a machine with **no git installed**.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-09-git-readonly.md.

Implement Phase 9 only: read-only Git integration, including its full Test plan.

Define the Git adapter interface, implement GitCliAdapter (repo root,
branch, porcelain status, ahead/behind), add GitService, typed Git IPC,
a renderer git store, a status-bar branch display and a dirty indicator.
Refresh on a debounced interval and on terminal focus or cwd change.

Read-only only: no commit, push, pull, rebase, merge, reset, or config writes.
The app must stay fully usable when Git is not installed.
The Git feature must not import terminal infrastructure.

Unit-test the status parser with captured porcelain fixtures.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
