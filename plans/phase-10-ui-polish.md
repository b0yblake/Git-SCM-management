# Phase 10 — UI Polish

| | |
|---|---|
| **Purpose** | Raise the app from "functionally complete" to "usable every day without opening the dev console". |
| **Depends on** | Phase 9 |
| **Unlocks** | Phase 11 |
| **Status** | ☑ Done 2026-08-28 |

---

## Why this phase is separate

Polish applied *during* feature phases inflates every diff and hides logic bugs behind styling churn. Collecting it here keeps feature reviews clean and makes the design pass coherent instead of piecemeal.

---

## Scope

**In:** theme, spacing tokens, loading/empty states, error toasts, context menus, focus management, accessibility, scrolling, titlebar, app icon, terminal status bar, settings screen.

**Out:** new capabilities of any kind. If a polish item requires new IPC or new domain logic, it belongs in a different plan.

---

## Tasks

- [x] Dark theme.
- [x] Consistent spacing/tokens.
- [x] Loading states.
- [x] Empty states.
- [x] Error toast system.
- [x] Context menus.
- [x] Keyboard focus management.
- [x] Accessible buttons.
- [x] Scroll behavior.
- [x] Titlebar polish — native frame, app title, no white flash (see Verification).
- [x] App icon.
- [x] Terminal status bar.
- [x] Settings screen.

---

## Terminal context menu

```text
Copy
Paste
Clear
Rename tab
Duplicate terminal
Close terminal
```

Implement only these commands. `Ctrl+Shift+P` stays reserved — the command palette is post-MVP.

---

## Target layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Titlebar / App controls                                     │
├───────────────┬─────────────────────────────────────────────┤
│ Workspace     │ Tab bar                                     │
│ sidebar       ├─────────────────────────────────────────────┤
│               │                                             │
│ repositories  │ Active terminal (xterm.js)                  │
│ workspaces    │                                             │
├───────────────┴─────────────────────────────────────────────┤
│ Status bar                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Settings screen must expose

```ts
defaultShellProfileId
terminal.fontSize
terminal.cursorBlink
behavior.restoreLastWorkspace
behavior.confirmBeforeClosingRunningTerminal
```

---

## Test plan

> Conventions: `TESTING.md`. This phase changes presentation only — so its most important tests are the ones proving **nothing else changed**.

| Test file | Covers |
|---|---|
| `src/renderer/src/features/settings/components/SettingsScreen.spec.tsx` | every settings field |
| `src/renderer/src/shared/components/Toast.spec.tsx` | error surface |
| `src/renderer/src/features/terminal/components/TerminalContextMenu.spec.tsx` | the six allowed commands |
| `src/shared/contracts/ipc.snapshot.spec.ts` | channel registry snapshot |

**Settings screen**

- [x] Each of the five `AppSettings` fields renders its current value.
- [x] Changing each field calls `settings.update` with only that field patched.
- [x] An invalid `fontSize` is rejected before it reaches `update`.
- [x] `confirmBeforeClosingRunningTerminal: false` actually skips the Phase 4 confirmation.

**Toasts and states**

- [x] An error surfaced from any feature renders a toast with its message.
- [x] A toast auto-dismisses after the documented interval and can be dismissed manually.
- [x] Simultaneous errors stack rather than replacing each other.
- [x] Empty state renders when there are no workspaces.
- [x] Empty state renders when there are no terminals.
- [x] Every async action renders a loading state while pending.

**Context menu**

- [x] Renders exactly six commands: Copy, Paste, Clear, Rename tab, Duplicate terminal, Close terminal.
- [x] No seventh command exists — assert the exact list.
- [x] Each command invokes the matching existing action; none introduces new IPC.

**Keyboard and accessibility**

- [x] `Ctrl+Shift+P` still does nothing — the palette remains unimplemented.
- [x] Closing a dialog returns focus to the terminal.
- [x] Tab order through the sidebar, tab bar and terminal is sensible.
- [x] Every interactive control has an accessible name.
- [x] No action is mouse-only where a shortcut is documented.

**Regression guards — the point of this Test plan**

- [x] **The IPC channel registry snapshot is unchanged** — this phase must add no channel.
- [x] The full Phase 0–9 suite passes with no test modified to accommodate styling.
- [x] Only settings wiring and the window itself changed under `src/main/` — five files, listed in Verification.

---

## Verification — 2026-08-28

```text
npm run typecheck   pass
npm run lint        pass  (zero warnings, not just zero errors)
npm test            645 tests / 51 files   (was 589 / 46 after Phase 9)
npm run build       pass
```

**End-to-end against the built app, and looked at.** A phase about how the app
looks deserves more than assertions, so the probe also captured a screenshot.
That turned out to matter — see the bug below.

```text
PASS  the empty workspace list explains itself rather than sitting blank
PASS  every settings field is on screen
PASS  changing the font size persists it
PASS  and the live terminal actually redraws at that size
PASS  an unusable font size never reaches settings
PASS  and the screen says why
PASS  right-click offers exactly the six allowed commands
PASS  Duplicate terminal opens a second tab
PASS  closing a running terminal asks first, in an in-app dialog
PASS  cancelling keeps the terminal
PASS  turning the confirmation off closes immediately
PASS  Ctrl+Shift+P still does nothing — the palette stays unimplemented
PASS  the window is titled GitDeck
```

**A real bug, found by looking at the screenshot.** The first run showed the
close-confirmation dialog open *while* "Ask before closing a running terminal"
was unticked. `SettingsPanel` and `TerminalTabs` each called `useAppSettings()`,
and each held its own `useState` copy: changing a setting updated the screen and
nothing else until the app restarted. The font size had the same fault and the
same cause. Fixed by backing the hook with a store, and pinned by
`useAppSettings.spec.ts` — "an update in one place is visible in another".

Every unit test passed while that bug existed, because no test had ever mounted
two consumers at once.

**The screenshot also showed the layout was wrong**: the side rail had stretched
to roughly twice its intended width, because the settings `<select>` was sizing
the whole column. It is now a fixed 17rem rail, and the workspace editor
overlays the terminal instead of pushing the layout sideways.

**The plan contradicts itself, and the Test plan won.** "Do not add new domain
logic" cannot coexist with a settings screen exposing `terminal.fontSize`,
`terminal.cursorBlink` and `behavior.confirmBeforeClosingRunningTerminal`, none
of which existed — and with a test box requiring the last of them to *actually*
skip the Phase 4 confirmation. Three fields were added to `AppSettings`; **no
IPC channel was**, which is the line the Definition of Done actually draws and
which `ipc.snapshot.spec.ts` now pins.

**`window.confirm` is gone**, as Phase 4 said it would be. It blocked the whole
renderer thread — freezing every terminal in the window while it was up, and
making the app undriveable from automation. The replacement is a real dialog:
focus moves into it, Escape cancels, and dismissing returns focus to the shell.

**Files changed under `src/main/` — five, all in scope:**

```text
features/settings/domain/AppSettings.ts      the three new fields
features/settings/ipc/settingsIpc.ts         their validation
features/settings/application/…spec.ts       tests for them
features/settings/ipc/settingsIpc.spec.ts    tests for them
bootstrap/createWindow.ts                    icon, title, no white flash
```

**Deviations worth naming:**

| Plan says | What shipped | Why |
|---|---|---|
| a titlebar in the layout diagram | the native Windows frame, with the app's own title and background | custom window controls need minimise/maximise/close over IPC, and this phase must add no channel |
| `terminal.fontSize`, `behavior.*` | flat `terminalFontSize`, `restoreLastWorkspace`, … | consistent with the Phase 8 decision; nesting would mean more shapes to validate for no gain |
| "dirty indicator in the sidebar/tab" (Phase 9) | unchanged — status bar only | still the entanglement Phase 9 rejected |

**The app icon is generated, not drawn.** `build/icon.png` is produced by a
short script that rasterises a rounded plate and a `>_` prompt arithmetically
and encodes the PNG by hand, so the repo carries a real 256×256 icon without an
image toolchain. Phase 11 will want an `.ico` for the installer.

**Known limitations.**

- The New Terminal menu's "(default)" marker still comes from
  `useShellProfiles`, which keeps its own copy of the default shell. Changing it
  in Settings takes effect for newly opened terminals immediately, but the
  marker lags until that menu remounts.
- The context menu is mouse-only to *open* (right-click); once open it is fully
  keyboard-operable. A keyboard route to open it is not implemented.
- Toasts are dismissed on a fixed six-second timer with no pause-on-hover.

---

## Acceptance criteria

- Primary flows require no developer console.
- No major UI action is mouse-only where a reasonable keyboard shortcut exists.
- Every async action has a visible loading or error state.
- Empty states (no workspaces, no terminals) are designed, not blank.

---

## Definition of Done

- No new IPC channels were added in this phase.
- No feature behavior changed — only presentation.
- **Every box in the Test plan is ticked and `npm test` is green.**
- No pre-existing test was weakened or deleted to make styling changes pass.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-10-ui-polish.md.

Implement Phase 10 only: UI polish, including its full Test plan.

Dark theme and spacing tokens, loading and empty states, an error toast
system, the terminal context menu (copy, paste, clear, rename tab,
duplicate terminal, close terminal), focus management, accessible buttons,
scroll behavior, titlebar, app icon, terminal status bar and the settings
screen for the AppSettings fields.

Presentation only. Do not add new IPC channels, new domain logic, or new
capabilities. Do not implement the command palette.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
