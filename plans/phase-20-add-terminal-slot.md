# Phase 20 — Add-Terminal Slot

| | |
|---|---|
| **Purpose** | In Columns, Main + Side and Grid, an unfilled canvas shows exactly **one** "Add new Terminal" button (with a plus icon) in the next empty pane — never one per empty slot. Clicking it opens a fresh default terminal. |
| **Depends on** | Phase 13 (Mosaic canvas, `order`-driven panes) |
| **Status** | ☑ Complete — implemented and verified 2026-09-03 (see Verification) |

> **Superseded for Grid (2026-09-03):** Phase 21 makes Grid unbounded, so
> there the slot no longer disappears at capacity — it is the permanent
> last cell. Columns and Main + Side keep the rules below unchanged.

---

## Why this phase is separate

Pure renderer presentation on the Mosaic canvas — no IPC, no store shape
change, no new capability: the button calls the same `openTerminal()` the
Navigator's New Terminal already calls (an empty create request → default
shell, default home directory; nothing is inherited from existing panes).
The one design rule worth writing down is the **single** placeholder: one
inviting slot reads as an affordance, four dashed boxes read as clutter.

## Scope boundary

**In:** one placeholder slot rendered at CSS `order = visibleCount` (the
next cell every layout fills), only when the mode is not Focus, at least one
pane is visible, and the canvas is below its capacity; a dashed ghost-slot
button with a plus icon; disabled while a create is in flight.

**Out:** Focus mode (capacity 1 — covered by the existing empty states),
the zero-terminals and all-parked states (each already carries its own
action), drag-to-rearrange, per-slot shell pickers, remembering which pane
the user last added into.

## Design

```text
canvas (CSS grid, panes placed by `order`)
├── slot order 0..n-1   visible sessions
└── slot--add order n   ONLY when: mode ≠ focus ∧ 0 < n < capacity
        [ + Add new Terminal ]  → controller.openTerminal()  (create {})
```

- `order = visibleSessionIds.length` lands the placeholder in each mode's
  literal next cell: Columns → second column, Main + Side → the next stacked
  side pane, Grid → the next 2×2 cell.
- Appended last in the DOM, so `main-side`'s `:first-of-type` tall-pane rule
  can never latch onto it.
- Creating flows through the existing controller: same toasts on failure,
  same store insertion, and the new session lands focused in the pane the
  placeholder occupied — the button visually becomes the terminal it made.

## Test plan

- [x] ~~Grid with 1–3 visible → exactly one "Add new Terminal" button; with 4
      → none.~~ **Superseded 2026-09-03 by Phase 21** and reworked in
      `TerminalDeck.spec`: Grid capacity is `Infinity`, so the slot is the
      permanent last cell at any count. Ticked as it was true when written;
      annotated by Checkpoint C rather than re-ticked, because the box below
      it — Columns and Main + Side — is still the live contract.
- [x] Columns with 1 → one; with 2 → none. Main + Side with 2 → one.
- [x] Focus mode → none, regardless of count.
- [x] Zero terminals → none (the empty state's own button stands alone);
      all-parked → none.
- [x] Click → `terminal.create` receives an empty request — no cwd, shell
      or command inherited — and the new session appears in that pane.
- [x] The button disables while a create is in flight.
- [x] Full suite, typecheck, lint green.

## Verification — 2026-09-03

```text
npm run ci          998 tests / 85 files (+5 in TerminalDeck.spec),
                    typecheck, lint — all pass
```

The five new cases assert the exact single-button contract per mode
(Grid 1→3 one, 4 none; Columns/Main+Side below capacity one, at capacity
none; Focus never; zero-terminal and all-parked states untouched) and that
the click sends an **empty** create request — nothing inherited. Visual
smoke was skipped this round: the user's installed GitDeck held the
single-instance lock, and the DOM assertions cover the one-slot rule
precisely; the ghost-slot styling ships in the next installer build.

---

## Acceptance criteria

```text
1. Open one terminal in Grid → the next cell shows a single dashed
   "+ Add new Terminal" slot; the other two empty cells stay plain.
2. Click it → a fresh default-profile terminal opens in that cell and the
   slot moves to the next empty cell — until the canvas is full, then it
   disappears.
3. Focus mode never shows it.
```
