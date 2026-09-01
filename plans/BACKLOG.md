# Post-v0.1.0 Backlog

> **Purpose:** hold future feature scopes so they stay *out* of the MVP phases.
> Nothing here may be implemented until it is explicitly promoted to its own plan file.
>
> Extracted from `../PLAN.md` §24.

---

## Split Panes

> **Promoted 2026-09-01:** this scope is now Phase 13 —
> [Terminal Mosaic](phase-13-terminal-mosaic.md). The backlog description below is
> retained as the architectural origin; implementation is governed by the phase plan.

**Depends on:** terminal sessions, renderer layout.
**Does not require:** terminal engine rewrite, workspace rewrite, Git rewrite.

Introduce:

```ts
type LayoutNode =
  | { type: 'terminal'; sessionId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: LayoutNode[] }
```

Expected blast radius: `renderer/features/layout` + the workspace layout model.

---

## Git Actions

Separate module: `features/git-actions`.

Potential commands:

```text
stage · unstage · commit · fetch · pull · push · checkout
```

**Do not add these into the read-only `GitService`.** The read-only guarantee from Phase 9 is what keeps the Git feature safe to run automatically on a timer.

---

## Persistent PTY Daemon

A separate architectural feature, not an enhancement.

```text
Electron Renderer
      ↓
Electron Main
      ↓
Local IPC
      ↓
GitDeck Daemon
      ↓
PTY sessions
```

This is what would allow the Electron UI to restart without killing shell processes — the thing Phase 8 explicitly does **not** promise.

**Must NOT be implemented until explicitly scoped.**

---

## SSH

Separate feature: `features/ssh`.

Prefer launching `ssh` through an existing PTY session first. Do not initially build a custom SSH protocol implementation.

Should reuse terminal sessions and shell profiles without changing workspace persistence.

---

## Command Palette

Separate renderer feature. `Ctrl+Shift+P` is reserved for it from Phase 4 onward.

Commands register through a common interface so the palette never imports feature internals:

```ts
interface AppCommand {
  id: string
  title: string
  shortcut?: string
  execute(): void | Promise<void>
}
```

---

## Silent Auto-Update

> **Half promoted 2026-09-01:** Phase 16 —
> [Update Check](phase-16-update-check.md) — ships the notify-and-link half:
> check GitHub Releases at startup, show a dismissible banner, open the
> release page in the browser.

The other half — downloading and installing without the browser — stays here,
**blocked on code signing**: an unsigned binary that replaces itself is
indistinguishable from malware to SmartScreen and to a reasonable user, and
every silent update would re-trigger the SmartScreen warning anyway.

Unblocks when a signing certificate exists. Then scope `electron-updater`
against the `latest.yml` + blockmap artifacts electron-builder already
produces.

---

## Not scoped at all

```text
plugin system
cloud sync
AI commands
terminal collaboration
Docker manager
remote filesystem
```

---

## Product north star

> **A project-aware Windows terminal workspace manager for developers.**

The key abstraction to keep intact as the project grows:

```text
Workspace
   ↓
Terminal Definitions
   ↓
Runtime Terminal Sessions
   ↓
Optional Feature Metadata
      ├── Git
      ├── layout
      ├── SSH
      └── future integrations
```
