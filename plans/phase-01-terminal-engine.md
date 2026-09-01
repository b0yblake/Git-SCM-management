# Phase 1 — Terminal Engine

| | |
|---|---|
| **Purpose** | Give Main process full ownership of PTY lifecycle behind an abstraction that can be tested **without launching real shells**. |
| **Depends on** | Phase 0 |
| **Unlocks** | Phase 2 (IPC), Phase 5 (shell profiles) |
| **Status** | ☑ Done 2026-08-27 |

---

## Why this phase is separate

The PTY layer is the one piece that must never be rewritten later. Building it headless — with no IPC and no UI — forces the interface to be driven by testability instead of by what the renderer happens to need.

---

## Scope

Terminal feature **owns**: PTY creation, input/output, resize, process exit, terminal runtime lifecycle.

Terminal feature **does not own**: workspaces, Git status, tab appearance, persistence, split layout.

**Out of this phase:** xterm UI, tabs, IPC, Git, workspace, persistence, shell detection (Phase 5 — hardcode one shell path for now).

---

## Core interfaces to define

```ts
export interface PtyProcess {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(callback: (data: string) => void): () => void
  onExit(callback: (exitCode: number) => void): () => void
}

export interface PtyFactory {
  create(options: CreatePtyOptions): PtyProcess
}
```

`NodePtyAdapter` implements `PtyFactory`. `FakePtyFactory` implements it for tests. `TerminalManager` depends only on the interface.

---

## Tasks

- [x] Define terminal domain models (`TerminalDefinition`, `TerminalSessionInfo`, `TerminalSessionStatus`).
- [x] Define `PtyProcess`.
- [x] Define `PtyFactory`.
- [x] Implement fake `PtyFactory` for tests.
- [x] Implement `NodePtyAdapter`.
- [x] Implement `TerminalManager`.
- [x] Implement terminal create.
- [x] Implement terminal input.
- [x] Implement terminal resize.
- [x] Implement terminal kill.
- [x] Implement PTY output events.
- [x] Implement exit events.
- [x] Cleanup all sessions when app exits.
- [x] Add tests for session lifecycle.

---

## Files expected to change

```text
src/main/features/terminal/domain/TerminalSession.ts
src/main/features/terminal/domain/PtyProcess.ts
src/main/features/terminal/application/TerminalManager.ts
src/main/features/terminal/application/TerminalService.ts
src/main/features/terminal/infrastructure/NodePtyAdapter.ts
src/main/features/terminal/public.ts
```

---

## Test plan

> Conventions: `TESTING.md`. This is the most heavily tested phase in the project — everything above it assumes the engine is correct.

| Test file | Covers |
|---|---|
| `src/main/features/terminal/testing/FakePtyFactory.ts` | double: records `write`/`resize`/`kill`, exposes `emitData()` / `emitExit()` |
| `src/main/features/terminal/application/TerminalManager.spec.ts` | all lifecycle logic, using the fake |
| `src/main/features/terminal/infrastructure/NodePtyAdapter.integration.spec.ts` | the real `node-pty` binding |

**Lifecycle**

- [x] `create` returns a `TerminalSessionInfo` with a unique id and status `starting` or `running`.
- [x] `create` calls `PtyFactory.create` exactly once, with the `cwd` and shell from the definition.
- [x] `write` forwards the exact string to the matching `PtyProcess`.
- [x] `resize` forwards `cols`/`rows` to the matching `PtyProcess`.
- [x] `kill` calls `PtyProcess.kill` and moves the session to `exited`.
- [x] PTY output triggers a data event tagged with the originating `sessionId`.
- [x] PTY exit sets status `exited`, records `exitCode`, and emits an exit event.

**Isolation — the reason this phase exists**

- [x] Data emitted by session A never reaches a listener registered for session B.
- [x] Killing session A leaves session B `running` and still emitting.
- [x] Three concurrent sessions each receive only their own output.

**Errors**

- [x] `write` to an unknown session id throws `TerminalSessionNotFoundError`.
- [x] `resize` to an unknown session id throws `TerminalSessionNotFoundError`.
- [x] `kill` on an unknown session id throws `TerminalSessionNotFoundError`.
- [x] `PtyFactory.create` throwing leaves status `failed` and registers **no** orphan session entry.
- [x] An unexpected PTY exit (non-zero code, never killed by us) is handled and reported, not swallowed.

**Cleanup**

- [x] `disposeAll` kills every live session.
- [x] `disposeAll` is idempotent — calling it twice does not throw.
- [x] After `kill`, the session's listeners are detached (assert listener count returns to 0).
- [x] Creating and killing 100 sessions leaves no retained references.

**Integration — real node-pty** (may be skipped in CI, must pass locally on Windows)

- [x] Spawning the real shell and writing `echo hello\r` produces output containing `hello`.
- [x] `resize` against a live PTY does not throw.
- [x] `kill` terminates the real process and fires the exit event.

---

## Verification — 2026-08-27

```text
npm run typecheck   pass
npm run lint        pass
npm test            63 tests / 8 files   (was 31 / 5 after Phase 0)
```

`node-pty` is imported in exactly one file — `infrastructure/NodePtyAdapter.ts`.
The two other matches in the feature are prose in comments. The domain boundary
lint rule was re-verified against the now-populated `domain/` folder by planting
a `domain/ → node-pty` import; it was reported and the probe removed.

**N-API claim confirmed empirically.** Phase 0 argued from symbol inspection that
`node-pty` needs no `electron-rebuild`. Proved by spawning a real PTY inside
Electron:

```text
electron=44.0.0  node=24.18.1  modules=149
node-pty imported OK (named export spawn: function)
spawned pid=20836
RECEIVED OUTPUT -> ok
exit event, code=-1073741510      # 0xC000013A, STATUS_CONTROL_C_EXIT — normal for kill()
```

The same prebuild serves Node's ABI 127 (unit tests) and Electron's ABI 149.
CJS→ESM interop for the named `spawn` export also works under Electron's ESM
loader, which was the other untested risk.

**Known noise:** the integration suite prints `AttachConsole failed` from
`node-pty/lib/conpty_console_list_agent.js`. It is a helper process node-pty
spawns to enumerate console processes, and it fails because a vitest worker has
no attached console. Verified harmless — `cmd.exe` process count is identical
before and after the suite, so `kill()` still reaps its children.

**Known limitation to settle in Phase 4:** an exited session stays in
`TerminalManager`'s map with `status: 'exited'` so its exit code remains
queryable. Its PTY listeners are detached and the process is gone, so nothing OS
level leaks, but the map grows for the life of the app. Phase 4 closes a tab —
that is the natural point to add removal.

---

## Acceptance criteria

Automated tests prove, using `FakePtyFactory`:

```text
create session
write input
receive output
resize
kill
receive exit
```

Multiple sessions remain isolated — killing session A produces no event on session B.

---

## Definition of Done

- `TerminalManager` has unit tests and never imports `node-pty` directly.
- No IPC channel registered.
- No React component touched.
- `public.ts` exports only `TerminalService` + serializable types.
- **Every box in the Test plan is ticked and `npm test` is green.**
- `FakePtyFactory` is reusable by later phases and exported from `terminal/testing/`.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-01-terminal-engine.md.

Implement Phase 1 only: Terminal Engine, including its full Test plan.

Create the terminal domain models, PtyProcess/PtyFactory interfaces,
FakePtyFactory, NodePtyAdapter and TerminalManager.

Add unit tests that validate independent terminal session lifecycle.

Do not implement renderer UI.
Do not implement IPC.
Do not implement workspaces or Git.
Do not implement shell detection — hardcode a single shell path for now.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
