# Phase 13 — Terminal Mosaic

| Field | Value |
|---|---|
| **Status** | ☑ Complete — implemented and verified 2026-09-01 |
| **Reference** | Concept B — Mosaic (`exec-1f54f3ab-f686-4e48-b053-4bea7fd52dc8.png`) |
| **Scope** | Renderer-only terminal layout and app-shell upgrade |

## Goal

Replace the horizontal terminal tab strip with a compact Terminal Navigator and a
multi-pane terminal canvas. The default Grid layout shows up to four live terminals
at once, while every other session remains reachable and keeps running.

The UI should feel like a calm developer workstation rather than a dashboard:
terminal content has the highest contrast, chrome is compact, and status/layout
information is visible without competing with the shell.

## Scope boundary

This phase may change renderer terminal layout state, terminal components and styles,
the renderer app shell, interactions, tests, and planning documentation.

This phase must not change the Main-process PTY lifecycle, preload or IPC contracts,
workspace persistence schema, Git behavior, port-management behavior, or the guarantee
that hidden sessions continue receiving output.

Layout persistence is deliberately deferred. A restart restores terminal definitions
through the existing workspace flow and starts with the default Grid layout.

## Approved interaction model

Three concepts are distinct:

1. **Running sessions** — every live or exited session in the terminal store.
2. **Visible sessions** — zero to four sessions assigned to the current canvas.
3. **Focused session** — the one visible terminal receiving keyboard focus and pane actions.

Selecting a hidden session in the Navigator places it in the focused pane. If the
layout has spare capacity it occupies the next pane. This never kills or recreates a
session.

Closing a terminal retains the existing confirmation and PTY kill semantics. Removing
a terminal from the canvas only parks it in the Navigator; its process and xterm
instance remain alive.

## Layout presets

| Mode | Capacity | Composition |
|---|---:|---|
| Focus | 1 | One terminal fills the canvas |
| Columns | 2 | Two equal vertical panes |
| Main + Side | 3 | Large pane left, two stacked panes right |
| Grid | 4 | Responsive 2×2 mosaic; default |

Changing mode keeps the focused terminal visible, preserves existing pane order where
possible, and fills newly available slots from running-session order.

## App shell

- Add a slim activity rail for Terminals, Workspaces, and Settings.
- Keep the terminal canvas mounted while another tool drawer is open.
- Keep WorkspacePanel mounted permanently so startup restore remains single-owner.
- Present Workspaces and Settings as drawers over the Navigator.
- Preserve the Git status bar and Ports modal host.

## Terminal Navigator

- Fixed `New Terminal` split button at the top.
- Search by title, working directory, or shell profile.
- Compact session rows with status, title, metadata, and visible pane number.
- Clear focused and visible states without tab semantics or `role="tablist"`.
- Rename, close, and choose shell without bridge calls in presentational components.
- Footer reports visible count and active layout capacity.

## Terminal canvas

- Compact toolbar with four layout presets and visible count.
- Pane header with status, title, shell, CWD, duplicate, park, focus, and close actions.
- Focus shown by a thin accent border.
- Every TerminalView remains mounted; non-visible panes are CSS-hidden.
- Newly visible TerminalViews re-fit even when they are not focused.
- Empty states distinguish no sessions from parked sessions.

## State invariants

- Layout state is serializable.
- `visibleSessionIds` contains only unique, existing session ids.
- Its length never exceeds the selected layout capacity.
- A non-null focused session is visible.
- Closing a visible session removes it from layout and selects a safe neighbour.
- Selecting a hidden session never creates or kills a PTY.
- Switching layout never creates, kills, mounts, or disposes a TerminalView.

## Test plan

### Store

- Grid accumulates at most four visible sessions.
- Layout changes retain focus and obey capacity.
- Selecting a hidden session shows it without changing running-session order.
- Parking does not remove a session.
- Closing visible, hidden, and focused sessions preserves invariants.
- Layout state survives JSON and structured-clone round trips.

### Components and integration

- Navigator filters and reports intents without bridge calls.
- Visible badges match canvas order.
- Toolbar exposes pressed state and reports mode changes.
- No horizontal tablist is rendered.
- All xterm views remain mounted when layout or focus changes.
- Output arriving in a parked terminal remains available when shown.
- Switching presets does not create or kill sessions.
- Existing create, close, and cycle shortcuts retain process semantics.
- Startup still creates or restores terminals exactly once.

## Acceptance criteria

- [x] No horizontal terminal tabs remain in the active UI.
- [x] Grid is the default and displays up to four terminals.
- [x] Navigator manages more sessions than the canvas displays.
- [x] All four layouts are keyboard-accessible.
- [x] Hidden output and scrollback survive.
- [x] Workspace restore, settings, Git status, and Ports remain functional.
- [x] No IPC or Main-process contract changes.
- [x] Typecheck, lint, tests, and build pass.

## Definition of Done

Phase 13 is complete only when the full regression suite passes, the development build
has been visually checked against Concept B, and verification is recorded below.

## Verification

Verified on Windows on 2026-09-01 with Node 22.22.2:

- `tsc --noEmit -p tsconfig.node.json` — passed.
- `tsc --noEmit -p tsconfig.web.json` — passed.
- `eslint .` — passed.
- `vitest run` — 61 files and 803 tests passed.
- `electron-vite build` — Main, preload, and renderer production bundles built.
- Automated Electron visual check at 1440×900 — four Grid panes remained inside a
  1440 px document/canvas with no horizontal overflow.
- Concept B visual review — activity rail, searchable Navigator, compact layout
  toolbar, pane headers, focused border, and 2×2 terminal hierarchy verified.

The existing Git timeout integration fixture now retries transient Windows `EBUSY`
during cleanup. Runtime Git behavior is unchanged.
