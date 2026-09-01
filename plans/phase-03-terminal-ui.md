# Phase 3 — Terminal UI (single terminal)

| | |
|---|---|
| **Purpose** | Make **one** terminal feel exactly like a native shell — correct xterm lifecycle, resize, and resource disposal — before any multiplicity is introduced. |
| **Depends on** | Phase 2 |
| **Unlocks** | Phase 4 (multi-tab) |
| **Status** | ☑ Done 2026-08-27 |

---

## Why this phase is separate

Most terminal-app bugs are lifecycle bugs: leaked listeners, stale dimensions, disposed-then-written xterm instances. Solving them once for a single view is far cheaper than debugging them across N tabs.

---

## Scope

**In:** `TerminalView`, xterm init, FitAddon, ResizeObserver, input forwarding, output rendering, dimension sync, disposal, exited state, copy/paste.

**Out:** tabs, tab bar, terminal store, keyboard shortcuts, workspace, Git, shell picker.

---

## Required lifecycle

```text
mount
 ↓ create xterm instance
 ↓ open DOM
 ↓ register PTY data listener
 ↓ register keyboard input
 ↓ register resize observer
 ↓ fit terminal
 ↓ send PTY resize

unmount
 ↓ unsubscribe events
 ↓ dispose xterm
```

**Critical rule:** unmounting the React view must **not** kill the PTY. Only an explicit user close-session action kills a PTY. This distinction is what makes Phase 4 tabs and future split panes possible.

---

## Component contract

```ts
interface Props {
  sessionId: string
}
```

`TerminalView` talks to a terminal feature hook — never to IPC directly, never to workspace persistence.

---

## Tasks

- [x] Build `TerminalView`.
- [x] Initialize xterm.
- [x] Add FitAddon.
- [x] Add ResizeObserver.
- [x] Forward keyboard input.
- [x] Render PTY output.
- [x] Sync terminal dimensions.
- [x] Add terminal font CSS.
- [x] Dispose resources correctly.
- [x] Handle exited terminal state.
- [x] Add copy.
- [x] Add paste.
- [x] Remove the Phase 2 debug UI.

---

## Files expected to change

```text
src/renderer/src/features/terminal/components/TerminalView.tsx
src/renderer/src/features/terminal/hooks/useTerminalSession.ts
src/renderer/src/features/terminal/public.ts
src/renderer/src/shared/styles/terminal.css
src/renderer/src/app/App.tsx
```

---

## Test plan

> Conventions: `TESTING.md`. jsdom project. Every test runs against `fakeGitDeckApi`, never real IPC.

| Test file | Covers |
|---|---|
| `src/renderer/src/testing/fakeGitDeckApi.ts` | double: records every call, exposes `emitData()` / `emitExit()` |
| `src/renderer/src/features/terminal/hooks/useTerminalSession.spec.ts` | subscription and forwarding logic |
| `src/renderer/src/features/terminal/components/TerminalView.spec.tsx` | mount/unmount lifecycle |

**Wiring**

- [x] Mount subscribes to `onData` exactly once and `onExit` exactly once.
- [x] PTY data emitted by the fake is written into the xterm instance.
- [x] A keystroke calls `api.write` with the correct `sessionId` and the exact key data.
- [x] The ResizeObserver firing calls `api.resize` with the fitted `cols`/`rows`.
- [x] `api.resize` is **never** called with `0`, negative, or `NaN` dimensions.
- [x] Rapid consecutive resizes do not produce a call per pixel (assert the documented throttle/debounce).

**Lifecycle — the critical rule**

- [x] Unmount unsubscribes **both** listeners.
- [x] Unmount disposes the xterm instance.
- [x] **Unmount does NOT call `api.kill`** — `expect(fakeApi.kill).not.toHaveBeenCalled()`.
- [x] Remounting with the same `sessionId` re-subscribes cleanly and renders again.
- [x] 50 mount/unmount cycles leave zero active subscriptions on the fake.
- [x] No write reaches a disposed xterm instance (late PTY data after unmount is dropped, not thrown).

**Exited state**

- [x] An exit event renders the exited state.
- [x] Input is no longer forwarded once the session has exited.

**Boundary**

- [x] The component does not reference `window.gitdeck` directly — it goes through the hook.
- [x] The xterm instance is held in a ref; it is not present in any store.

---

## Verification — 2026-08-27

```text
npm run typecheck   pass
npm run lint        pass
npm test            170 tests / 14 files   (was 126 / 12 after Phase 2)
```

**xterm runs under jsdom** with a single `matchMedia` polyfill, so the suite
drives the real terminal rather than a stand-in. jsdom has no layout, so xterm
never paints rows — its container only ever holds the character-measurement
element. Tests therefore read `terminal.buffer.active.getLine(0)` off the live
instance, captured by spying on `Terminal.prototype.open`. Only `FitAddon` is
mocked, because measurement is the one thing that genuinely needs a browser.

**End-to-end against the built app** — real PowerShell, real keyboard path
(`.xterm-helper-textarea` → `onData` → IPC → PTY):

```text
PASS  xterm mounted
PASS  rows rendered in a real browser
PASS  shell prompt appeared unprompted
PASS  keyboard path reached the shell     (typed `echo gitdeck-ui-ok`, read it back)
```

**Graceful shutdown leaves no PTY behind** — closing the window reaches
`will-quit` → `disposeAll()`; the `powershell.exe` count is identical before and
after. Worth recording because Phase 11 checks exactly this on uninstall. Note
that `app.exit()` bypasses `will-quit` entirely and *does* orphan the shell —
only the graceful path cleans up.

**Two React Compiler lint rules changed the design, for the better**

`react-hooks/set-state-in-effect` and `react-hooks/refs` (plugin v7) rejected the
first draft. Both fixes removed code:

- Resetting state when `sessionId` changes moved from an effect into React's
  documented render-time adjustment, so a stale status never renders first.
- `TerminalView` no longer keeps a `sessionRef`. `sendInput`/`sendResize` are
  already stable per session, so they are the effect's dependencies directly —
  the terminal now rebuilds exactly when the session changes and never on a
  plain re-render.

**Defect found later, by running the app: an infinite resize loop.** The
terminal visibly flickered on open. Counting `terminal:resize` messages arriving
in Main showed **446 in eight seconds**, oscillating forever:

```text
162x40 → 162x41 → 162x40 → 162x41 …  every ~17ms
```

`.terminal-view__surface` was a flex item, so its height depended on how many
rows xterm had rendered — and that is the very box `FitAddon` measures. Resizing
xterm changed the measurement, the observer fired, the proposal flipped back, and
round it went. ConPTY repaints the screen on every resize, which is what the
user saw as flicker and as stacked blank prompts.

The dedupe below did not help: it skipped *consecutive identical* sizes, and an
alternating 40/41 sequence never repeats itself.

Fixed at the source in CSS — the surface is now `position: absolute; inset: 0`,
so its size depends only on its parent and never on its content. Two code-level
guards keep a stray oscillation cheap: measurement is coalesced into one
`requestAnimationFrame` per burst, and a proposal equal to xterm's current size
is dropped before it can trigger anything. After the fix: **2 resizes, then
silence.**

Every unit test passed throughout. jsdom has no layout, so the feedback path
could not exist there — only the built app could show it.

**Resize throttling is dedupe, not a timer.** A drag fires the observer per
pixel, but the PTY only cares about whole cells, so a resize is sent only when
the fitted `cols`/`rows` actually change. Simpler than a debounce and it has no
trailing-edge latency.

---

## Acceptance criteria

The user can interact with Git Bash or PowerShell exactly like a normal shell:

```text
git status
npm --version
cd ..
clear
```

- ANSI colors render correctly.
- Resizing the window does not corrupt terminal layout.
- No listener leaks after mount/unmount cycles.

---

## Definition of Done

- xterm instances live in refs, never in a store.
- All subscriptions cleaned up on unmount.
- Debug UI from Phase 2 is gone.
- **Every box in the Test plan is ticked and `npm test` is green.**
- `fakeGitDeckApi` is reusable by Phases 4, 7, 8 and 9.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-03-terminal-ui.md.

Implement Phase 3 only: Terminal UI, including its full Test plan.

Integrate xterm.js with the existing window.gitdeck.terminal API.
Implement resize handling, input forwarding, output rendering,
subscription cleanup and exited-state UI.
Remove the temporary Phase 2 debug UI.

Unmounting TerminalView must not kill the PTY session.

Do not build multi-tab functionality yet.
Do not add a terminal Zustand store yet.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
