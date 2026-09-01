# Phase 2 — Typed Terminal IPC

| | |
|---|---|
| **Purpose** | Expose the terminal engine to the renderer through an intent-specific, validated, typed bridge — and prove the security boundary holds. |
| **Depends on** | Phase 1 |
| **Unlocks** | Phase 3 (Terminal UI) |
| **Status** | ☑ Done 2026-08-27 |

---

## Why this phase is separate

This is the security seam of the whole application. Building it on its own — with only a throwaway debug button as a consumer — keeps the temptation to "just add one more channel for the UI" out of the design.

---

## Scope

**In:** IPC channel constants, request/response types, input validation, handler registration, preload terminal API, event subscriptions with cleanup.

**Out:** xterm.js, tab bar, Zustand stores, workspace/Git channels, any permanent UI.

---

## Tasks

- [x] Define terminal IPC channels in `shared/contracts/ipc.ts`.
- [x] Define request/response types.
- [x] Add input validation on every handler.
- [x] Register terminal IPC handlers.
- [x] Implement terminal preload API.
- [x] Add `onData`.
- [x] Add `onExit`.
- [x] Ensure subscriptions return cleanup functions.
- [x] Ensure no `ipcRenderer` leaks into renderer.
- [x] Add IPC integration tests.

---

## Files expected to change

```text
src/shared/contracts/ipc.ts
src/shared/contracts/events.ts
src/main/features/terminal/ipc/terminalIpc.ts
src/main/bootstrap/registerIpc.ts
src/preload/terminalApi.ts
src/preload/index.ts
src/preload/types.d.ts
```

---

## Test plan

> Conventions: `TESTING.md`. This is the security seam — the negative assertions matter more than the positive ones.

| Test file | Covers |
|---|---|
| `src/main/features/terminal/ipc/terminalIpc.spec.ts` | handlers against a fake `TerminalService` |
| `src/preload/terminalApi.spec.ts` | bridge shape and subscription cleanup |
| `src/shared/contracts/ipc.spec.ts` | channel registry integrity |

**Handler behavior**

- [x] `terminal:create` delegates to `TerminalService.create` and returns the session info.
- [x] `terminal:write` / `terminal:resize` / `terminal:kill` each delegate to the matching service method.
- [x] The response payload survives `structuredClone` — proves it is serializable.

**Input validation** (each must be rejected *before* reaching the service)

- [x] `create` with a missing `cwd`.
- [x] `write` with a missing or non-string `sessionId`.
- [x] `write` with a non-string `data` payload.
- [x] `resize` with negative, zero, `NaN`, or non-integer `cols`/`rows`.
- [x] `resize` with absurdly large dimensions (documented upper bound).
- [x] Any handler called with `null` / `undefined` payload.
- [x] An unknown extra field is either stripped or rejected — assert whichever is chosen.

**Error translation**

- [x] A `TerminalSessionNotFoundError` from the service becomes a serializable error response with a stable `code`.
- [x] The error response contains **no stack trace and no absolute filesystem path**.
- [x] The renderer never receives a native `Error` instance.

**Events**

- [x] PTY data is forwarded on `terminal:data` carrying its `sessionId`.
- [x] PTY exit is forwarded on `terminal:exit` carrying `sessionId` and `exitCode`.
- [x] Events are sent only to live `webContents` — a destroyed window does not throw.

**Preload bridge**

- [x] `onData` returns a function; after calling it, no further callbacks fire.
- [x] `onExit` returns a working unsubscribe the same way.
- [x] Subscribing twice and unsubscribing once leaves exactly one live listener.
- [x] 100 subscribe/unsubscribe cycles leave zero listeners registered.

**Boundary — the critical negatives**

- [x] `window.ipcRenderer` is `undefined` in renderer context.
- [x] `window.gitdeck.terminal` exposes exactly the six members in `ARCHITECTURE.md` §7 — no extras.
- [x] No generic command-execution member exists on the bridge.
- [x] Registry test: every registered handler name comes from the `IPC` constant, and no raw `'terminal:'` string literal exists outside `shared/contracts/ipc.ts`.

---

## Verification — 2026-08-27

```text
npm run typecheck   pass
npm run lint        pass
npm test            126 tests / 12 files   (was 63 / 8 after Phase 1)
```

**Contract change, forced by the platform.** `create` and `kill` resolve to a
`Result` instead of rejecting. The first end-to-end run had the preload throwing
a `TerminalApiError` carrying a `code`; the renderer received the right
*message* but `code` was `undefined`:

```text
badCreate: "no code: cwd must be a non-empty string"
badKill:   "no code: No terminal session with id \"sess_missing\""
```

Electron's contextBridge rebuilds a rejected `Error` in the renderer's world and
keeps only the standard fields, so custom properties are dropped. Matching on
message text would have been the only alternative. `ARCHITECTURE.md` §7 has been
updated to match; a plain `Result` crosses the bridge intact.

**End-to-end run against the built app** — real `cmd.exe`, real `sandbox: true`,
no debug UI added (the acceptance criteria's debug button was replaced by
driving `window.gitdeck.terminal` through `executeJavaScript`, which covers the
same path and leaves nothing to remove):

```text
PASS  ipcRenderer not leaked
PASS  six bridge members
PASS  session created running
PASS  PTY output reached renderer
PASS  invalid create rejected      → INVALID_REQUEST
PASS  unknown kill rejected        → TERMINAL_SESSION_NOT_FOUND
PASS  exit event delivered
```

**The registry guard caught its first violation immediately** — the new
`ipcPorts.spec.ts` used raw `'terminal:data'` literals. Fixed by using the `IPC`
constant, not by weakening the guard. It also carries a "scans a meaningful
number of files" assertion so a broken directory walk cannot make it vacuous.

**Serializable types moved to `shared/contracts/terminal.ts`.** The renderer may
not import Main-process code, but needs `TerminalSessionInfo`. Main's
`domain/TerminalSession.ts` re-exports them, so `terminal/public.ts` consumers
are unaffected.

---

## Acceptance criteria

A **temporary** renderer debug button can:

```text
create PTY
write "echo hello"
receive output
kill PTY
```

Errors cross the boundary as serializable responses, never as native `Error` objects.

---

## Definition of Done

- `window.gitdeck.terminal` matches `ARCHITECTURE.md` §7 exactly.
- `ipcRenderer` is not reachable from renderer code.
- No generic command-execution endpoint exists.
- Every `on*` subscription returns a working unsubscribe function.
- **Every box in the Test plan is ticked and `npm test` is green.**
- ⚠️ **The debug UI must be removed before Phase 3 is considered complete.**

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-02-terminal-ipc.md.

Implement Phase 2 only: Typed Terminal IPC, including its full Test plan.

Expose the existing TerminalManager through intent-specific IPC APIs.

Renderer API must be available as:

window.gitdeck.terminal

Validate all IPC input. Convert errors to serializable responses.
Subscriptions must return cleanup functions.

Do not expose ipcRenderer.
Do not expose generic command execution.
Do not build terminal UI yet — a temporary debug button is acceptable
and must be marked for removal.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
