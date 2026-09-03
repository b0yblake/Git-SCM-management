# Phase 21 — Elastic Grid

| | |
|---|---|
| **Purpose** | Grid stops being a fixed 2×2. Past four terminals the canvas recomputes its lattice (columns × rows) from the live canvas size, steering every cell toward a 16:9 shape, so **all** terminals stay on one page — nothing is auto-parked, nothing scrolls. The "Add new Terminal" slot is always present as the last cell in Grid. |
| **Depends on** | Phase 13 (Mosaic canvas), Phase 20 (add-terminal slot) |
| **Status** | ☑ Complete — implemented and verified 2026-09-03 (see Verification) |

> Supersedes, for Grid only: Phase 13's "capacity 4" row and Phase 20's
> "at capacity → no add slot" rule. Focus, Columns and Main + Side keep
> their fixed capacities and their Phase 20 behaviour unchanged.

---

## Why this phase is separate

Pure renderer layout work — no IPC, no persistence, no PTY change. The
one real decision is semantic: in Grid, **capacity becomes unbounded**
(`Infinity` in `TERMINAL_LAYOUT_CAPACITY`), which flips every
"canvas is full → evict/park" branch in the store into "always show the
new session". Everything else is geometry: pick the lattice that gives
each cell the largest inscribed 16:9 rectangle, then let cells stretch
to fill — terminals want area, so the ratio guides the *arrangement*
rather than letterboxing each pane to exactly 16:9.

## Scope boundary

**In:** unbounded Grid capacity (add/activate never evicts; opening a
6-terminal workspace shows all 6); a pure `computeGridTemplate(tiles,
width, height)` that returns `{columns, rows}` — classic 2×2 for ≤ 4
tiles, 16:9-scored search above that, square-ish fallback when the
canvas is unmeasured; canvas measurement via ResizeObserver so window
resizes re-balance the lattice; the add slot always rendered as the
last Grid cell; Navigator footer says "Unlimited panes" instead of
"Infinity pane capacity".

**Out:** Focus/Columns/Main + Side (fixed capacities stay); manual
parking (still allowed, still the way to shrink a busy Grid — but
closing a terminal no longer resurrects parked ones); drag-to-rearrange;
per-cell size overrides; virtualizing very large grids (every visible
xterm renders — parking remains the pressure valve).

## Design

```text
tiles = visibleSessions + 1 (the add slot — always shown in Grid)

computeGridTemplate(tiles, canvasW, canvasH):
  tiles ≤ 4            → 2 × 2   (the classic Grid, unchanged)
  canvas unmeasured    → columns = ceil(√tiles)         (jsdom, first paint)
  else for columns 1..tiles:
    rows = ceil(tiles / columns); skip layouts with an empty column
    score = width of the largest 16:9 box inside a (W/cols × H/rows) cell
    keep the best score; ties go to more columns (wider grids suit
    landscape windows and shallow rows suit terminal output)

TerminalDeck (grid mode only) sets the template inline:
  grid-template-columns: repeat(columns, minmax(0, 1fr))
  grid-template-rows:    repeat(rows,    minmax(0, 1fr))
The stylesheet's 2×2 rule remains as the no-measurement fallback, and
main-side's `:first-of-type` tall pane is untouched (inline style is
grid-only).
```

- **Store:** `TERMINAL_LAYOUT_CAPACITY.grid = Infinity`. Every
  `length < capacity` branch now always appends in Grid, so the
  "replace the focused pane" eviction paths become bounded-mode-only.
  `removeSession` backfills parked sessions **only when capacity is
  finite** — an unbounded Grid has no freed pane to fill, so a closed
  terminal can no longer resurrect one the user parked. Switching *to*
  Grid still fills everything: Grid now literally means "one page,
  every terminal".
- **Measurement:** the deck observes the canvas with a ResizeObserver
  and re-measures via `getBoundingClientRect` (the test double fires
  with empty entries, and re-measuring is also what handles zoom).
  Each cell resize is picked up by TerminalView's own observer, which
  refits xterm — no new plumbing.
- **Add slot:** the Phase 20 condition `visible < capacity` is kept
  verbatim; with `Infinity` it is always true in Grid, which is exactly
  the requested "always show the button in the last slot".

## Test plan

- [x] `gridLayout.spec.ts` — ≤ 4 tiles → 2×2; landscape 1600×900:
      5–6 → 3×2, 7–9 → 3×3, 10 → 4×3; portrait 900×1600: 5 → 1×5 and
      6 → 1×6 (full-width strips — the 16:9 score genuinely prefers
      them there); ultrawide 3440×900: 6 → 3×2; unmeasured (0×0 / NaN)
      → √-fallback (6 → 3×2, 9 → 3×3); columns × rows always ≥ tiles.
- [x] Store — a fifth session in Grid joins the canvas (no eviction);
      `setActive` on a parked session appends instead of replacing;
      closing a terminal in Grid does not unpark a parked one; the
      bounded-mode replacement path still works (Columns); switching
      Focus → Grid still fills every session.
- [x] Deck — 5 sessions in Grid: all five panels visible, none
      `hidden`; the canvas carries the inline template for 6 tiles
      (5 + add slot); resizing to portrait re-balances the template.
- [x] Deck — the add slot stays present in Grid at 4, 5, … sessions and
      still disappears in the zero-terminal and all-parked states;
      Columns/Main + Side keep their Phase 20 at-capacity behaviour.
- [x] Full suite, typecheck, lint green.

## Verification — 2026-09-03

```text
npm run ci          1009 tests / 86 files (+10 net: 6 gridLayout,
                    3 store, 1 deck; 6 more reworked for the new
                    semantics), typecheck, lint — all pass
```

`gridLayout.spec.ts` pins the lattice table above. The store suite now
asserts the unbounded-Grid semantics directly (fifth session joins, no
resurrection on close, Columns keeps the eviction path). The deck suite
renders five sessions plus the add slot and asserts the inline
`repeat(3, minmax(0, 1fr)) / repeat(2, …)` template, then drives the
ResizeObserver double with a portrait canvas and sees the template
re-balance to 1×6.

**Shipped:** `release\GitDeck Setup 0.4.1.exe`, 2026-09-03 14:38
(109.13 MB), carrying Phases 20–21 and the pane focus/restore toggle,
with all 9 packaged E2E tests green and the binary's own `FileVersion`
reading 0.4.1. It supersedes the same-day 0.4.0 rebuild, which was never
published. The 0.4.0 run also repaired two E2E tests that
had rotted while the suite went unrun (it is not part of `npm run ci`):
the version gate pinned the literal `0.1.0` — three releases stale, now
comparing the shipped binary's `FileVersion` to `package.json` — and the
smoke test still clicked "Add terminal", which since the editor began
seeding a first terminal produced an empty second row that validation
correctly rejected.

**Real-machine smoke (dev instance, keystroke-free):** with the user's
GitDeck closed, `npm run dev` took the single-instance lock and session
restore brought back the IPOS FE terminal; Phase 18's `--open-path`
forwarding then injected terminals at distinct folders — no keystrokes
or clicks ever entered the live window. At 6 terminals the canvas
showed a 3×3 lattice (6 panes + the add slot as the 7th cell), at 9 it
re-balanced to 3×4 with the add slot 10th — both screenshotted via
`PrintWindow`/`PW_RENDERFULLCONTENT` (background-window capture; no
focus stolen from the user) and visually confirmed: nothing parked,
"9 visible / Unlimited panes" in the Navigator footer, every pane
rendering its prompt. Afterwards the app closed cleanly and
settings.json + workspaces were byte-identical to the pre-smoke backup.

---

## Acceptance criteria

```text
1. Open 5+ terminals in Grid → every terminal stays on screen; the
   lattice re-balances (e.g. 3×2 for six tiles on a landscape window)
   and no pane is auto-parked or scrolled away.
2. The "+ Add new Terminal" slot is always the last Grid cell — at 4,
   5, 10 terminals — and each click adds one more cell.
3. Resize the window → the lattice recomputes toward 16:9 cells.
4. Columns, Main + Side and Focus behave exactly as before.
```
