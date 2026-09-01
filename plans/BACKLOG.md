# Post-v0.1.0 Backlog

> **Purpose:** hold future feature scopes so they stay *out* of the MVP phases.
> Nothing here may be implemented until it is explicitly promoted to its own plan file.
>
> Extracted from `../PLAN.md` §24.

---

## Split Panes

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
