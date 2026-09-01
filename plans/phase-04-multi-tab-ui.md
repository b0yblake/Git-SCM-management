# Phase 4 — Multi-Tab Terminal UI

| | |
|---|---|
| **Purpose** | Manage many concurrent sessions purely in renderer state — proving the engine needs **no changes** to support multiplicity. |
| **Depends on** | Phase 3 |
| **Unlocks** | Phase 5, Phase 7 |
| **Status** | ☑ Done 2026-08-27 |

---

## Why this phase is separate

If adding tabs requires touching `TerminalManager` or `NodePtyAdapter`, the Phase 1 boundary was wrong. This phase is the first real test of that boundary — keep it strictly renderer-side.

---

## Scope

**In:** `terminalStore`, tab bar, active tab, create/close/switch/rename, keyboard shortcuts, close confirmation, session retention for hidden tabs.

**Out:** workspace persistence, Git status, split panes, shell picker (Phase 5), drag-to-reorder.

---

## Store shape

```ts
interface TerminalUiState {
  sessions: Record<string, TerminalSessionInfo>
  order: string[]
  activeSessionId: string | null
}
```

Serializable metadata only. No xterm objects.

---

## Component contract

```ts
interface Props {
  terminals: TerminalSessionInfo[]
  activeId: string | null
  onActivate(id: string): void
  onClose(id: string): void
  onCreate(): void
}
```

`TerminalTabBar` must not call IPC directly.

---

## Keyboard shortcuts

```text
Ctrl+T          New terminal
Ctrl+W          Close terminal
Ctrl+Tab        Next terminal
Ctrl+Shift+Tab  Previous terminal
Ctrl+Shift+P    Reserved — do not implement
```

---

## Tasks

- [x] Implement terminal Zustand store.
- [x] Implement tab bar.
- [x] Implement active tab state.
- [x] Implement create tab.
- [x] Implement close tab.
- [x] Implement switch tab.
- [x] Implement rename tab.
- [x] Add keyboard shortcuts.
- [x] Add close confirmation when a process is running.
- [x] Ensure hidden tabs retain their PTY sessions.
- [x] Ensure xterm instances are safely restored/rendered when switching.

---

## Files expected to change

```text
src/renderer/src/features/terminal/store/terminalStore.ts
src/renderer/src/features/terminal/components/TerminalTab.tsx
src/renderer/src/features/terminal/components/TerminalTabBar.tsx
src/renderer/src/features/terminal/hooks/useTerminalShortcuts.ts
src/renderer/src/app/App.tsx
```

**Expected to NOT change:** anything under `src/main/features/terminal/`.

---

## Test plan

> Conventions: `TESTING.md`. Store tests are plain unit tests — no rendering needed.

| Test file | Covers |
|---|---|
| `src/renderer/src/features/terminal/store/terminalStore.spec.ts` | every state transition |
| `src/renderer/src/features/terminal/components/TerminalTabBar.spec.tsx` | dumb-component contract |
| `src/renderer/src/features/terminal/hooks/useTerminalShortcuts.spec.ts` | keyboard handling |

**Store transitions**

- [x] `addSession` appends to `order` and sets `activeSessionId` when it is the first session.
- [x] `addSession` on a non-empty store does **not** steal focus from the active tab (or does — assert the documented choice).
- [x] `removeSession` removes from both `sessions` and `order`.
- [x] Removing the **active** session activates the documented neighbour (next, else previous).
- [x] Removing the last session sets `activeSessionId` to `null`.
- [x] Removing a non-active session leaves `activeSessionId` untouched.
- [x] `rename` changes only the title; `order` and `activeSessionId` are unchanged.
- [x] `setActive` with an unknown id is a no-op, not a crash.
- [x] `order` reflects creation order and is stable across renames.
- [x] **The whole store state survives `JSON.stringify` → `JSON.parse`** — proves no xterm object leaked in.

**Tab bar — dumb component**

- [x] Renders exactly one tab per session, in `order`.
- [x] Clicking a tab calls `onActivate` with that id.
- [x] Clicking close calls `onClose` with that id.
- [x] Clicking new calls `onCreate`.
- [x] **`fakeGitDeckApi` records zero calls** — the tab bar must never touch IPC.

**Shortcuts**

- [x] `Ctrl+T` triggers create.
- [x] `Ctrl+W` closes the active terminal.
- [x] `Ctrl+Tab` moves to the next tab and wraps from last to first.
- [x] `Ctrl+Shift+Tab` moves to the previous tab and wraps from first to last.
- [x] `Ctrl+Tab` with a single tab is a no-op.
- [x] `Ctrl+Shift+P` does nothing — it is reserved.

**Close confirmation**

- [x] Closing a tab whose session is `running` asks for confirmation.
- [x] Closing a tab whose session is `exited` closes immediately.
- [x] Declining the confirmation leaves the session alive and the tab present.

**Session retention — the point of this phase**

- [x] Switching away and back does not call `api.kill`.
- [x] Output emitted while a tab is hidden is present when it is shown again.
- [x] Closing tab A calls `api.kill` for A's id only.

---

## Verification — 2026-08-27

```text
npm run typecheck   pass
npm run lint        pass
npm test            235 tests / 19 files   (was 170 / 14 after Phase 3)
```

**The boundary held.** Nothing under `src/main/`, `src/preload/` or
`src/shared/` was modified this phase — checked by mtime, not by memory. Adding
multiplicity was purely renderer work, which is what Phase 1 was built for.

**End-to-end against the built app, three real PowerShell sessions.** Each tab
was given its own `echo tab-marker-N`, then tabs were switched and one was
closed:

```text
PASS  first terminal opens on mount
PASS  three real shells open
PASS  every tab reached its own shell
PASS  exactly one panel visible
PASS  each tab kept only its own scrollback
PASS  closing one tab left the others intact
```

`powershell.exe` count was identical before and after, so the graceful shutdown
still reaps every PTY.

**Hidden tabs stay mounted — the decisive design choice.** Every `TerminalView`
lives for the life of its session and inactive panels are hidden with CSS.
Unmounting them would dispose their xterm and drop both the scrollback and any
output arriving while hidden: the PTY would survive, but the user's screen would
not. The cost is that a hidden panel has no layout, so xterm cannot measure
itself and its ResizeObserver never fires — `TerminalView` therefore takes an
`isActive` prop and re-fits when it becomes visible again.

**`window.confirm` blocks the renderer.** Discovered when the first probe run
hung on the close-confirmation dialog. It is correct for a human — the dialog
waits for them — but it froze automation until the probe stubbed it. Phase 10
replaces it with a real in-app dialog; recorded here because any later
automation will hit the same wall.

**Accessible names needed to be explicit.** `"A" + <span> (exited)</span>`
computes to the accessible name `A(exited)`, with the space normalised away, so
the tab label now sets `aria-label` directly. Better for screen readers and it
stops tests matching on an accident of name computation.

**Defect found later, during Phase 5 — the app opened two terminals at startup.**
`useTerminalTabs()` returned a fresh object literal on every render, so the
"open the first terminal" effect, keyed on that object, re-ran. Opening is
asynchronous, so a re-render landing before the create resolved still saw an
empty store and opened a second one. Every unit test passed throughout: in
jsdom the fake `create` resolved immediately, so the window never existed.

Only running the built app surfaced it — the log plainly showed two
`terminal created` lines. Fixed by memoising the controller and guarding the
effect with a ref; the regression test now defers `create` so it lands *after*
the profiles/settings lookups, reproducing the real ordering.

**Known limitation carried from Phase 1, now resolved in the renderer.** An
exited session still lingers in `TerminalManager`'s map in Main. Closing its tab
removes it from the renderer store, and `kill` is skipped for an already-exited
session — so Main keeps the record. Left as-is: it is bounded by the number of
terminals a user opens in one run and Phase 8 revisits session lifecycle.

---

## Acceptance criteria

The user can run concurrently:

```text
Tab 1: npm run dev
Tab 2: git status
Tab 3: powershell
```

- Switching tabs does not stop any process.
- Closing one tab does not affect the others.
- Output produced while a tab is hidden is not lost.

---

## Definition of Done

- Zero changes to Main-process terminal code.
- Closing a tab with a running process asks for confirmation.
- **Every box in the Test plan is ticked and `npm test` is green.**
- The Phase 1–3 suites still pass unchanged.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-04-multi-tab-ui.md.

Implement Phase 4 only: Multi-Tab Terminal UI, including its full Test plan.

Add the isolated terminal renderer store and tab components.
Support create, switch, rename and close, plus the Phase 4 keyboard shortcuts.
Hidden tabs must retain their PTY sessions and buffered output.

Do not modify Main-process terminal code.
Do not implement workspace persistence.
Do not implement Git status.
Do not implement split panes.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
