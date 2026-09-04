# Phase 23 — Primer Dark Restyle

| | |
|---|---|
| **Purpose** | Re-skin every surface to the dark GitHub (Primer) language of the reference screenshot: one re-valued token block, borders you can see, 6 px corners, 32 px controls, one green primary action per view, sentence-case headings. **No** layout, IPC, store, PTY or behaviour change. |
| **Depends on** | Phase 10 (the token block and app shell), Phase 13 (Navigator + Mosaic), Phases 20–21 (add slot, elastic grid) — every surface those phases drew is restyled here |
| **Ships as** | **0.5.2**, cut 2026-09-04. Originally planned as 0.6.0, on the reasoning that a visible restyle is more than a patch — superseded on instruction. The number is defensible either way: the phase changed no behaviour, no IPC channel and no stored shape, and nothing in the 0.5.x line was ever published, so the version only has to exceed every local build. |
| **Status** | ☑ Steps A and B implemented and cut as 0.5.2 on 2026-09-04 — see Verification. |

> Reference: the github.com dashboard in its dark theme (screenshot
> supplied 2026-09-04). Every colour below is a Primer dark-theme primitive
> and carries the Primer name it came from, so its source is checkable.

---

## Why this phase is separate

Pure renderer CSS, plus one constant in Main. It touches all five
stylesheets (1,963 lines) and the xterm theme, so it gets its own session:
folded into feature work it would make every diff unreadable and every
regression ambiguous.

It is also not only taste. Two measured defects in the current skin:

- **Borders are invisible.** `--border #25303c` on the canvas is 1.41:1 and
  `--border-strong` 1.84:1, so panes, cards and inputs read as floating
  smudges. Primer's `#3d444d` is 1.92:1 on the canvas and its emphasis
  border 3.57:1 — most of the difference between the screenshot and today.
- **The primary button fails AA.** White on `--accent #2f81f7` — the "New
  Terminal", "Save" and "Open" buttons — is 3.75:1; 14 px text needs 4.5.
  Primer's primary green `#238636` and its accent `#1f6feb` are both 4.63.

And two stragglers the token block never reached: the status bar is
VS Code grey (`#202020`, `#333`, `#d4d4d4`, `#8a8a8a`) on a blue-black app,
and Main paints the window `#1e1e1e` before first paint — a flash of a
colour that appears nowhere in the renderer.

## The reference, read as rules

| In the screenshot | GitDeck today | After |
|---|---|---|
| Canvas `#0d1117`; header bar and sidebar darker (`#010409`); cards `#151b23` | canvas `#0d1117`; rail `#0b1016`; toolbar `#0f151d`; cards `#111821` | canvas unchanged; rail, toolbar and status bar → inset; drawer, cards and pane headers → muted |
| Every card, input and button has a visible 1 px `#3d444d` border | `#25303c` / `#344252`, mostly invisible | `#3d444d` default, `#656c76` emphasis, translucent muted for inner dividers |
| 6 px corners on cards, buttons and inputs; 12 px on dialogs; pills fully round | 7 px / 4 px | 6 / 12 / 3 / full |
| One green primary button ("New"); everything else is a grey default button with a border | filled-blue "New Terminal", "Save", "Open" | green primary, one per view; default buttons `#212830` with a border |
| Blue only for links, selection and focus | blue for buttons, selection, focus, badges | blue keeps selection, focus, links and the focused pane |
| Controls 32 px tall with 14 px / 500 text; pill chips for the action row | 38–42 px, mixed sizes | 32 px medium, 28 px small; the layout switcher becomes chips |
| Sentence-case headings: "Top repositories" 14/600, "Home" 20/600; meta text 12 px muted | uppercase tracked 13 px headings; 11–13 px meta | 14/600 section headings, 16/600 dialog titles, 20/600 empty states, 12 px meta; no uppercase, no tracking |
| Neutral pill counters; outlined labels | blue square index badge; uppercase outlined workspace badge | Primer Counter (neutral, full radius) and Label (outlined, sentence-case) |
| Segoe UI on Windows, 14 px, line-height 1.5 | same face, 14 px, no line-height set | unchanged face; `line-height: 1.5` |

## Scope boundary

**In:** the token block; every rule in `global.css`, `terminal.css`,
`workspace.css`, `ports.css`, `git.css`; the xterm theme (background,
foreground, cursor, selection, the 16 ANSI colours); `createWindow.ts`'s
`backgroundColor`; the README screenshot; the plans index row.

**Out:** any layout or DOM change (rail, drawer, Navigator and Mosaic keep
their structure and every class name); a light theme (the block is laid
out so a `[data-theme='light']` block can re-value it later, but none is
written); a custom title bar or window controls (Phase 10 rejected them:
they need IPC); replacing the "GD" brand square with the mascot PNG (it
would bundle a 1 MB asset for a 32 px mark — a follow-up with a small
asset); new motion (no transitions are added); Octicons or any icon
library; font downloads (the CSP forbids them, and Primer's stack resolves
to Segoe UI on Windows anyway); scrollbar styling.

## Decisions

**1. Keep the token names, change the values.** The block already names
roles — `--surface-raised`, `--text-muted`, `--accent-surface` — and they
map one-to-one onto Primer's `bgColor-muted`, `fgColor-muted`,
`bgColor-accent-muted`. Renaming to Primer's names would touch every rule
for no visual gain. Missing roles are added; none is renamed.
*Rejected:* adopting `--bgColor-*` / `--fgColor-*` names — churn across
~2,000 lines, and the diff would hide the real changes.

**2. Primer dark primitives, verbatim.** No colour in the block is
invented. Where Primer's value is translucent (accent-muted, neutral
hover, danger-muted) the translucent value is kept, so it composes
correctly on whichever surface it lands on.
*Rejected:* hand-tuned "close enough" colours — that is what today's
palette is.

**3. Green is the primary action; blue is state.** Exactly one primary
button per view: Navigator → **New Terminal**; workspace editor →
**Save**; workspace sidebar → **Open**; Ports → none (Terminate is
danger); dialogs → the confirming action unless it is destructive.
Selection, focus rings, links, the focused pane and the active rail item
stay blue.
*Rejected:* a blue primary — GitHub does not, and the screenshot's single
green button is the clearest signal of the language.

**4. Borders on, shadows off.** The drawer and the editor panel separate by
a 1 px border, not a 32 px shadow. Only overlays — dialogs, menus, toasts
— cast a shadow, and it becomes Primer's `shadow-floating-large` as one
token.

**5. Two text sizes, three heading sizes.** Body 14, meta 12; headings
20/600 (empty-state titles), 16/600 (dialog and Settings section titles),
14/600 (sidebar section headings). `--font-tiny` stays as an alias of
`--font-small` so no rule breaks; the component pass promotes the rules
that were carrying body copy at 13 px to inherit 14 px.

**6. The layout switcher becomes the screenshot's chip row.** Focus /
Columns / Main + Side / Grid as 32 px pills with a 1 px border; the
selected chip is accent-muted with an accent border. Same DOM, same class
names, same glyphs.

**7. The terminal is the canvas.** Pane body, xterm background and window
background are one value, `--surface`, so no seam shows between the xterm
canvas and its pane and nothing flashes before first paint. The xterm
theme moves to `features/terminal/model/terminalTheme.ts` and gains
Primer's 16 ANSI colours; a test pins it to the CSS token.

**8. Not one raw colour outside the token block.** Every `#hex`, `rgb()`
and `white` in the five stylesheets becomes a token reference (allowed
literals: `transparent`, `currentColor`, `inherit`). A test scans for the
rest, and the guard is proven by a planted violation, as
`architecture.spec.ts` proves its own.

**9. Step A is a valid stopping point.** Re-valuing the block alone
(Tasks, step A) delivers the palette and the borders in a ~40-line diff
and can be looked at before the component pass. If it is enough, stop
there and record it.

## Design

### Token block (`global.css`, replaces the current `:root`)

```css
:root {
  color-scheme: dark;

  /* Surfaces — Primer bgColor.* */
  --surface: #0d1117;                          /* default: canvas, terminal bodies, inputs */
  --surface-raised: #151b23;                   /* muted: drawer, sidebar, cards, pane headers */
  --surface-sunken: #010409;                   /* inset: rail, toolbar, status bar */
  --surface-overlay: #151b23;                  /* overlay: dialogs, menus, toasts */
  --surface-control: #212830;                  /* button-default rest */
  --surface-control-hover: #262c36;            /* button-default hover */
  --surface-hover: rgb(101 108 118 / 10%);     /* control-transparent hover: rows, rail, menu items */
  --surface-selected: rgb(56 139 253 / 10%);   /* accent-muted: selected rows, chips, rail item */
  --surface-counter: rgb(101 108 118 / 20%);   /* neutral-muted: counters */
  --backdrop: rgb(1 4 9 / 60%);                /* overlay-backdrop */

  /* Text — Primer fgColor.* */
  --text: #f0f6fc;
  --text-muted: #9198a1;
  --text-faint: #9198a1;                       /* alias — Primer has one secondary grey */
  --text-disabled: #656c76;
  --text-on-emphasis: #ffffff;

  /* Accent — state, never a button fill */
  --accent: #1f6feb;                           /* accent-emphasis: focused pane, active bar, focus */
  --accent-strong: #4493f8;                    /* fgColor-accent: links, selected-chip text */
  --accent-surface: rgb(56 139 253 / 10%);     /* accent-muted */

  /* Primary action — Decision 3 */
  --primary: #238636;                          /* button-primary rest */
  --primary-hover: #29903b;
  --primary-border: rgb(240 246 252 / 10%);

  /* Status */
  --success: #3fb950;
  --warning: #d29922;
  --warning-surface: rgb(187 128 9 / 15%);     /* attention-muted */
  --danger: #f85149;
  --danger-emphasis: #da3633;                  /* destructive button hover fill */
  --danger-surface: rgb(248 81 73 / 10%);      /* danger-muted */

  /* Borders — Primer borderColor.* */
  --border: #3d444d;                           /* default: every card, pane, input, button */
  --border-muted: rgb(61 68 77 / 70%);         /* inner dividers, table rows */
  --border-strong: #656c76;                    /* emphasis: kbd, drag handles */

  /* Focus */
  --focus: #1f6feb;

  /* Elevation — only overlays cast one (shadow-floating-large) */
  --shadow-overlay: 0 0 0 1px var(--border), 0 16px 32px rgb(1 4 9 / 85%);

  /* Spacing (4 px base) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Shape */
  --radius-sm: 3px;                            /* kbd */
  --radius: 6px;                               /* buttons, inputs, cards, panes, menus */
  --radius-lg: 12px;                           /* dialogs */
  --radius-full: 9999px;                       /* chips, labels, counters */

  /* Controls */
  --control-sm: 28px;
  --control-md: 32px;

  /* Type */
  --font-ui: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'Cascadia Mono', Consolas, Menlo, monospace;   /* = xterm's stack */
  --font-small: 0.75rem;                       /* 12 px: meta, captions, status bar */
  --font-tiny: 0.75rem;                        /* alias, Decision 5 */

  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.5;
}
```

Contrast the block yields, as the test asserts it (WCAG 2.x ratios):

| Pair | Today | After |
|---|---|---|
| `--text` on canvas | 16.0 | 17.4 |
| `--text-muted` on canvas / on control | 7.8 / 6.7 | 6.5 / 5.1 |
| `--accent-strong` on canvas | 7.5 | 6.1 |
| white on the primary button | 3.75 (blue) | 4.63 (green) |
| white on the accent (focused-pane ring, active bar) | 3.75 | 4.63 |
| `--border` on canvas / on raised | 1.41 / 1.33 | 1.92 / 1.76 |
| `--border-strong` on canvas | 1.84 | 3.57 |

### Surfaces, one by one

Same DOM, same class names. "Today" cites the literal or token the rule
uses now; "After" is the rule to write.

| Surface (classes) | Today | After |
|---|---|---|
| Shell — `body`, `.app` | `--surface`, no line-height | `--surface`; `line-height: 1.5` |
| Activity rail — `.activity-rail`, `__brand`, `__button` | `#0b1016`; gradient brand; 4.1 rem items; 24 px icons; 0.68 rem labels; white-3 % hover | `--surface-sunken`, right border `--border`; brand flat `--accent`, 32 px, `--radius`; items 56 px, 20 px icons, 12 px labels; hover `--surface-hover`; active `--surface-selected` + the existing 2 px accent bar |
| Layout toolbar — `.terminal-layout-toolbar`, `__modes`, `__mode`, `__count` | `#0f151d`; 3.6 rem tall; 2.35 rem ghost buttons; `#315c8d` selected border | `--surface-sunken`, 48 px, bottom border `--border`; each mode a chip (Decision 6): `--control-md` tall, `0 var(--space-3)` padding, `--radius-full`, 1 px `--border`, 14/500, hover `--surface-control`; selected `--accent-surface` + `--accent` border + `--accent-strong` text; count 12 px `--text-muted` |
| Navigator — `.terminal-navigator`, `__header`, `__group-title`, `__footer`, `.terminal-search`, `.new-terminal`, `__create`, `__toggle` | `--surface-raised`; 14 px/32 px shadow; uppercase tracked header; 2.6 rem filled-blue split button (`#1f6feb` / `#286ed1` / `#388bfd`); 2.4 rem search | `--surface-raised` + right border `--border`, no shadow; header "Terminals" 14/600 sentence-case; **New Terminal** = primary split button, `--control-md`: `--primary` fill, `--text-on-emphasis`, `--primary-border`, toggle divider `--primary-border`, hover `--primary-hover`; search `--control-md`, `--surface` bg, `--border`, `--radius`, placeholder `--text-muted`; group title 12 px muted; footer 12 px muted above a `--border-muted` rule |
| Session rows — `.terminal-session-item`, `--active`, `--visible`, `__pane`, `__copy`, `.terminal-status--*` | 13/550 title; 0.69 rem path; blue square badge (`#315c8d`); white-3 % hover | title 14/600, path 12 px muted; hover `--surface-hover`; active `--surface-selected` + 2 px accent bar; `__pane` = Counter: `--surface-counter`, `--text`, 12/500, 20 px, min-width 20 px, `--radius-full`, `0 6px`; on the active row `--accent-surface` + `--accent-strong`; status dot 8 px, colours unchanged |
| Menus — `.new-terminal__menu`, `__item`, `__default`, `.context-menu` | `--surface-control`; `rgb(0 0 0 / 45%)` shadow; accent-surface hover | `--surface-overlay`, `--border`, `--radius`, `--shadow-overlay`; items `--control-md`, hover `--surface-hover`; "(default)" 12 px muted; disabled `--text-disabled` |
| Mosaic + panes — `.terminal-mosaic*`, `.terminal-pane`, `--active`, `__header`, `__identity`, `__cwd`, `__actions`, `.terminal-view*` | body `#0c1117`; header `#111821` 3.2 rem; 1.9 rem icon buttons; active = `--accent` border + 1 px ring; dashed add slot | body `--surface`; header `--surface-raised` 40 px, bottom border `--border-muted`, title 14/600, cwd 12 px muted; icon buttons `--control-sm`, `--radius`, hover `--surface-control`, close-hover `--danger`; pane border `--border`, `--radius`; `--active` keeps `--accent` border + `0 0 0 1px var(--accent)`; add slot dashed `--border`, hover `--accent` + `--surface-selected`; exited overlay = `--surface-overlay` card with a default button |
| Workspace sidebar — `.workspace-sidebar`, `__header`, `__item`, `--active`, `__active`, `__count`, `__open`, `__notice--*` | uppercase header; `#285581` borders; 999 px uppercase badge; blue Open | header 14/600; items as session rows; **Open** primary; `__active` = Label: 1 px `--success` border, `--success` text, 12/500, 20 px, `--radius-full`, sentence-case; `__count` = Counter; notices 14 px on `--danger-surface` / `--warning-surface` with a 1 px `--danger` / `--warning` border |
| Workspace editor — `.workspace-editor`, `__header`, `__actions`, `__problems`, `.definition-editor`, `.startup-settings*` | `#0f151d` + 28 px shadow; 0.48 rem inputs; blue Save; `#e6c07b` warning | `--surface-raised`, left border `--border`, no shadow; labels 14 `--text`, hints 12 muted; inputs as the search box; **Save** primary, Cancel default; remove = danger button (rest `--surface-control` + `--danger` text; hover `--danger-emphasis` + `--text-on-emphasis`); problems `--danger-surface` + `--danger` border; warning text `--warning` |
| Settings — `.settings-screen`, `h2`, `input`, `select`, `__error`, `.data-folder*`, `.update-check*` | uppercase h2 13 px; 4 px sunken inputs; mixed paddings | h2 16/600 sentence-case; labels 14; inputs and select `--control-md`, `--surface`, `--border`, `--radius`; `input[type='checkbox'] { accent-color: var(--accent) }`; `__error` 12 px `--danger`; data-folder path `--font-mono` 12 px on `--surface` with `--border`; "Choose folder…" and "Check now" = default buttons at `--control-sm` |
| Status bar — `.status-bar`, `.git-badge`, `__branch`, `__clean`, `__dirty`, `__ab` | `#202020`, `#333`, `#d4d4d4`, `#8a8a8a`, `#4a9eff`, `#e6c07b`; tracked | `--surface-sunken`, top border `--border`, 24 px, 12 px `--text-muted`; branch `--accent-strong`; clean `--success`; dirty `--warning`; ahead/behind muted; no letter-spacing |
| Version — `.app-version` | 0.75 rem faint | 12 px `--text-muted`; hover `--text` |
| Dialogs — `.dialog-backdrop`, `.dialog`, `--confirm`, `__title`, `__description`, `__actions`, `__button--danger`; `.ports-modal*`; `.about-modal*` | `--surface-raised`; 7 px; `rgb(0 0 0 / 55%)` backdrop and shadow | `--surface-overlay`, `--border`, `--radius-lg`, `--shadow-overlay`; backdrop `--backdrop`; title 16/600; description 14 muted; actions = default / primary / danger buttons at `--control-md`; Ports table header `--surface-raised`, row rules `--border-muted`, pid/port `--font-mono` 12; filter input `--control-md`; About links `--accent-strong`, urls 12 muted, `dt` muted |
| Toasts — `.toast`, `--error`, `__dismiss` | `--surface-control`; `rgb(0 0 0 / 45%)` shadow; 13 px | `--surface-overlay`, `--border`, `--radius`, `--shadow-overlay`, 14 px; `--error` = `--danger-surface` bg, `--danger` border and text |
| Update banner — `.update-banner`, `__actions`, `__primary` | raised card; accent-surface "primary" | the toast card; both actions default buttons at `--control-sm` (Decision 3: a banner has no primary) |
| Empty states — `.empty-state`, `__title`, `__hint`, `kbd`, `.terminal-mosaic__empty`, `.terminal-navigator__empty` | muted title; faint hint; 3 px kbd | title 20/600 `--text`; hint 14 muted; `kbd` = `--surface-raised`, `--border`, bottom border `--border-strong`, `--radius-sm`, `--font-mono` 12 |
| Focus — `:focus-visible` | 2 px `--accent-strong`, offset 2 | 2 px `--focus`, offset -2 on buttons, chips and rows; inputs `border-color: var(--focus)` with `outline-offset: -1px` |

### Terminal theme — `features/terminal/model/terminalTheme.ts`

```ts
import type { ITheme } from '@xterm/xterm'

/** Primer dark. `background` must equal the CSS `--surface` (tokens.spec.ts). */
export const TERMINAL_THEME = {
  background: '#0d1117',
  foreground: '#f0f6fc',
  cursor: '#f0f6fc',
  cursorAccent: '#0d1117',
  selectionBackground: '#388bfd66',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc'
} as const satisfies ITheme
```

`TerminalView.tsx` imports it in place of its private `THEME`; nothing else
in the component changes.

### Main — `createWindow.ts`

```ts
/** Painted before the renderer's first frame; must equal the CSS --surface. */
export const WINDOW_BACKGROUND = '#0d1117'
```

used as `backgroundColor: WINDOW_BACKGROUND`, replacing `'#1e1e1e'`.

---

## Tasks

**Step A — tokens** (a stopping point, Decision 9)

- [x] Replace the `:root` block in `global.css` with the one above.
- [x] `git.css`: its six literals → tokens (the one surface that never used
      them).
- [x] The remaining literals → tokens: `global.css` `#0b1016`, the brand
      gradient, `white` ×2, the five `rgb()` shadows and the backdrop;
      `terminal.css` `#286ed1` / `#1f6feb` / `#388bfd`, `#315c8d` ×2,
      `#0f151d`, `#0c1117` ×2, `#111821`, `rgb(255 255 255 / …)` ×2, one
      shadow; `workspace.css` `#285581` ×2, `#e6c07b`, `#0f151d`,
      `#286ed1` / `#1f6feb` / `#388bfd`, two shadows and one focus ring.
- [x] `terminalTheme.ts`; `TerminalView.tsx` imports it.
- [x] `createWindow.ts` `WINDOW_BACKGROUND`.
- [x] `tokens.spec.ts` (Test plan, first five boxes) and the
      `createWindow.spec.ts` pin; `npm run ci` green.
- [x] Looked at — as screenshots of the packaged build rather than a dev
      run, after Step B. Step B followed immediately: Step A alone leaves
      body copy at the meta size (Decision 5), so it is a worse resting
      place than either end.

**Step B — component pass** (one stylesheet at a time, `npm test` after
each)

- [x] `global.css`: shell, rail, button and input base rules, dialogs,
      toasts, banner, context menu, settings, about, kbd, focus ring.
- [x] `terminal.css`: toolbar chips, navigator, session rows and counters,
      panes, add slot, exited overlay, new-terminal menu.
- [x] `workspace.css`: sidebar, label and counter, editor, buttons.
- [x] `ports.css`, then `git.css`.
- [x] Hands-on pass with the packaged build: first run, four terminals in
      Grid, Focus, the context menu, the confirm dialog, Workspaces,
      Settings and About — driven by Playwright on a throwaway profile, the
      way the E2E suite launches it, so no live shell and no user data was
      ever touched.
- [x] `docs/assets/gitdeck-mosaic.png` re-captured.
- [x] `plans/README.md` status; `TESTING.md` §3 adds 23 to the
      "renderer-only, adds no packaged spec" sentence.

---

## Files expected to change

```text
src/renderer/src/shared/styles/global.css                    (token block + component pass)
src/renderer/src/shared/styles/terminal.css
src/renderer/src/shared/styles/workspace.css
src/renderer/src/shared/styles/ports.css
src/renderer/src/shared/styles/git.css
src/renderer/src/shared/styles/tokens.spec.ts                (new)
src/renderer/src/features/terminal/model/terminalTheme.ts    (new)
src/renderer/src/features/terminal/components/TerminalView.tsx  (import only)
src/main/bootstrap/createWindow.ts                           (one constant)
src/main/bootstrap/createWindow.spec.ts                      (one pin)
docs/assets/gitdeck-mosaic.png                               (re-captured)
plans/README.md, plans/TESTING.md                            (status row; §3 sentence)
```

**Expected to NOT change:** any other `.tsx` (no class renames, no DOM
changes — specs select `.dialog-backdrop` and `.context-menu-backdrop`);
both stores; every `public.ts`; the IPC registry; `electron-builder.yml`;
`build/`.

---

## Test plan

> Conventions: `TESTING.md`. No snapshots of rendered UI — §7 forbids
> them, and jsdom lays out no CSS anyway. The stylesheets are tested the
> way `architecture.spec.ts` tests source: as text, for the invariants a
> reviewer would otherwise check by eye. A renderer-only phase adds no
> packaged spec; the 16 existing E2E tests are the regression gate.

| Test file | Covers |
|---|---|
| `shared/styles/tokens.spec.ts` (renderer project) | the five invariants below |
| `main/bootstrap/createWindow.spec.ts` | the window background equals `--surface` |
| every existing renderer spec | unchanged and green — the DOM contract held |
| `tests/e2e/*` (16) | the packaged app still launches, spawns, restores |

- [ ] **No colour outside the block.** `findColourLiterals(css)` returns
      every `#hex`, `rgb(` / `rgba(` / `hsl(` and colour keyword (`white`,
      `black`, `red`, `blue`, `green`, `gray`, `grey`) outside the `:root`
      block; for each of the five files the list is empty. Guard proven:
      the helper applied to a planted `color: #fff` returns it, and to
      `transparent` / `currentColor` / `inherit` returns nothing.
- [ ] **Every token referenced exists.** Each `var(--x)` in the five files
      names a property declared in the block — a typo would otherwise fall
      back to nothing, silently.
- [ ] **Contrast.** Opaque tokens parsed from the block; `contrast(a, b)`
      per WCAG 2.x. Asserted: `--text` and `--text-muted` on `--surface`,
      `--surface-raised`, `--surface-sunken`, `--surface-control`,
      `--surface-overlay` ≥ 4.5; `--accent-strong`, `--success`,
      `--warning`, `--danger` on `--surface`, `--surface-raised`,
      `--surface-sunken` ≥ 4.5; `--text-on-emphasis` on `--primary`,
      `--accent`, `--danger-emphasis` ≥ 4.5; `--border` on `--surface` and
      `--surface-raised` ≥ 1.7 — the visible-border floor today's 1.41
      fails. Helper proven on the reference pair (white on black = 21).
- [ ] **The terminal is the canvas.** `TERMINAL_THEME.background` equals
      the parsed `--surface`; every ANSI entry is a 6-digit hex;
      `selectionBackground` is 8-digit (xterm takes hex only here).
- [ ] **Motion is opt-out.** If any stylesheet declares `transition:` or
      `animation:`, `global.css` carries
      `@media (prefers-reduced-motion: reduce)` — the confirm dialog's
      animation already has one; this keeps it honest.
- [ ] `createWindow.spec.ts`: `WINDOW_BACKGROUND` equals the parsed
      `--surface` — the same "two copies must agree" pin as `dataRoot`
      versus `storagePaths`.
- [ ] `npm run ci` green; `npm run test:e2e` green against a fresh
      `npm run package`.

---

## Verification — 2026-09-04

```text
npm run ci        1097 tests / 93 files (+25 tests, +2 files), typecheck,
                  lint — green after Step A and again after Step B
npm run package   green; screenshots taken from release/win-unpacked
```

Both steps landed in one session. Step A was **not** used as a stopping
point, and the reason is worth recording: on its own it leaves every rule
that was carrying body copy at the meta size (Decision 5), which is a worse
resting place than either end of the phase.

**Looked at, on the packaged build.** A Playwright script launched
`release/win-unpacked` against a throwaway `--user-data-dir` — the way the
E2E suite launches it, so no live shell and no user data was involved — and
captured first run, four terminals in Grid, Focus, the terminal context
menu, the close-confirmation dialog, Workspaces, Settings and About. Every
surface speaks the new language and nothing moved: the same clicks landed
on the same controls throughout.

**Three defects, all found only by looking**, and all of a kind no
text-level test can reach. That is the case for the hands-on pass existing.

1. **The activity rail was 63px wide**, sized for 9.5px labels; at the new
   12px meta size "Workspaces" overflowed it in every screen. Now 76px.
2. **The pane header wrapped.** "Git Bash" dropped to a second line in a
   two-column Grid at 1280px, breaking the 40px row — the shell name had
   grown from 10.5px to 12px. It no longer wraps; the path beside it takes
   the shrink and ellipsises. Missed by the first screenshot pass, which
   ran at 1440px where the header still fitted.
3. **The panel's default-button rule outranked three overrides.**
   `.workspace-panel button` carries a type selector, so it beats a lone
   class and ties with any other `.class button` — and it is declared last.
   It centred the workspace row's two lines and stripped their vertical
   padding, squeezed the editor's close button to an 8px content box, and
   silently won the Remove button's `color` away from `--danger`. All three
   overrides now carry two classes, and the base rule carries a comment
   saying why anything overriding it must. Only the first was visible in
   the screenshots; the other two were found by reading the cascade after
   it explained the first.

### Deviations, recorded

1. **`tokens.spec.ts` lives at `src/shared/`,** not
   `src/renderer/src/shared/styles/` as the plan drew it. It reads files
   from disk, and the renderer has no node types **by design** —
   `tsconfig.web.json` already excludes `src/shared/**/*.spec.ts` with a
   comment saying shared specs are the ones typechecked with node APIs.
   That is also where `architecture.spec.ts` lives, and this is the same
   kind of repository-wide audit.
2. **The terminal-theme check is split.** Shape assertions (sixteen
   distinct ANSI slots, hex forms, cursor legibility) sit in
   `terminalTheme.spec.ts` beside the module; the cross-file pin to
   `--surface` sits in `tokens.spec.ts`, which reads `terminalTheme.ts` as
   **text**. A shared spec importing a renderer feature's internals is
   exactly what `architecture.spec.ts` forbids.
3. **`--font-small` is `12px`, not `0.75rem`.** `:root` sets
   `font-size: 14px`, so `rem` here means "× 14" and the planned
   `0.75rem` would have been 10.5px — smaller than the 11.4px it replaced,
   not the 12px it was named for. The heading sizes (20 / 16 / 14) are
   written in px in their rules for the same reason.
4. **The focus ring keeps `outline-offset: 2px`.** The plan proposed inset
   offsets; nothing was observed clipping, and moving every ring inward is
   a change with no defect behind it. `--focus` is still checked against
   the 3:1 non-text floor.
5. **Non-overlay shadows were deleted rather than tokenised** — the tool
   drawer's and the workspace editor's. Decision 4 says only overlays cast
   one; both already had the border that replaces it.
6. **The mosaic canvas is `--surface`, not `--surface-sunken`.** The
   reference reserves its darkest surface for chrome (rail, toolbar,
   status bar) and puts content on the default one.
7. **`.update-banner__primary` was deleted.** Decision 3 gives a
   notification strip no primary; the class stays in the DOM and now reads
   as a default button.
8. **Cut as 0.5.2, not the 0.6.0 this plan first named.** Changed on
   instruction the same day. Nothing in 0.5.x was ever tagged, so no
   published artifact is affected, and the restyle moved no behaviour and
   no stored shape — `tests/fixtures/storage/v0.5.2/` is byte-identical in
   shape to `v0.5.1/`, which is the assertion, not a coincidence.

---

## Acceptance criteria

```text
1. Side by side with the reference: same canvas, same border weight and
   colour, same corner radius, same control height, one green primary
   button, grey default buttons, sentence-case headings.
2. Borders on panes, inputs and cards are visible without squinting
   (≥ 1.7:1 on their surface; test-pinned).
3. Every button and label passes AA (≥ 4.5:1; test-pinned).
4. Open 6 terminals in Grid, park one, open a workspace, open Ports,
   Settings and About: every surface speaks the new language and nothing
   moved — the same clicks land on the same controls.
5. No seam around any terminal; no flash of another colour at launch.
6. The README screenshot shows the new look.
```

## Definition of Done

- Every Task box ticked — or Step B consciously deferred under Decision 9,
  recorded here with the date.
- Every Test-plan box ticked; `npm run ci` and `npm run test:e2e` green.
- Not one raw colour outside the token block (the test says so).
- README screenshot re-captured; `plans/README.md` row ☑.

---

## Known implementation risks to verify

- **`color-mix()` and `:has()`** are already in the stylesheets and fine in
  Electron 44's Chromium; the translucent tokens (`rgb(… / 10%)`) need
  nothing newer.
- **Translucent selected and hover rows over the raised surface** must
  still show the 2 px accent bar — check at 100 % and 150 % zoom.
- **xterm selection:** 8-digit hex works in xterm 6; if a version rejects
  it, xterm also accepts an `rgba()` string.
- **Chips at 32 px in a 48 px toolbar** with the "N visible" count at the
  right — check at the 720 px minimum window width `createWindow.ts` sets.
- **`--text-faint` aliased to muted** brightens rail labels, paths and the
  status bar; if hierarchy suffers, Primer has no third grey — recover it
  with `opacity: 0.8`, not a new colour.
- **jsdom sees no CSS:** the component suites cannot detect a broken
  selector. The token tests plus the hands-on pass through every dialog
  are the check; do the pass on the packaged build.
- **The native menu bar** is drawn by Windows and follows the OS theme; on
  a light-mode Windows it will not match. Out of scope — title-bar work
  needs IPC.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and
plans/phase-23-primer-dark-restyle.md.

Implement Phase 23 only: the Primer dark restyle, including its full Test
plan. Do Step A first — the token block, the literal-to-token sweep in all
five stylesheets, terminalTheme.ts, WINDOW_BACKGROUND, tokens.spec.ts and
the createWindow pin — run npm run ci, and stop to show the result. Then,
on go-ahead, do Step B one stylesheet at a time in the order the Tasks
list gives, running npm test after each.

Rules: change no .tsx except the one import in TerminalView.tsx; rename no
class; add no DOM; add no dependency, icon set or font; add no light
theme, no transitions, no title bar. Every colour lives in the :root block
— tokens.spec.ts enforces it. Green is the only button fill and there is
one per view; blue stays selection, focus, links and the focused pane.

At completion report: implemented · files changed · tests · the contrast
table the test asserts · what Step B changed per stylesheet · the
screenshot re-capture · known limitations.
```
