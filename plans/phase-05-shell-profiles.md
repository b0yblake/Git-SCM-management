# Phase 5 — Shell Profiles

| | |
|---|---|
| **Purpose** | Turn shell discovery into an **infrastructure service** so the UI only ever picks from a list it did not compute. |
| **Depends on** | Phase 4 |
| **Unlocks** | Checkpoint A, Phase 7 (workspace editor needs a profile picker) |
| **Status** | ☑ Done 2026-08-28 |

---

## Why this phase is separate

Phase 1 hardcoded a shell path. Replacing that hardcode with detection touches only infrastructure plus a small picker — a clean demonstration that shell knowledge never leaked into the UI or the domain.

---

## Scope

**In:** `ShellProfile` model, profile registry, Windows detection for the five supported shells, New Terminal picker, default-shell setting, graceful handling of missing shells.

**Out:** WSL distro enumeration beyond a single default entry, custom user-defined profiles, per-profile env/theme, workspace persistence.

---

## Profiles to detect

```text
git-bash     Git Bash
powershell   Windows PowerShell
pwsh         PowerShell 7
cmd          Command Prompt
wsl          WSL
```

Detection lives in `WindowsShellDetector` (infrastructure). The domain only knows `ShellProfileId`.

---

## Tasks

- [x] Create `ShellProfile` domain model.
- [x] Implement shell profile registry.
- [x] Detect Git Bash.
- [x] Detect PowerShell.
- [x] Detect PowerShell 7.
- [x] Detect CMD.
- [x] Detect WSL.
- [x] Add shell picker to the New Terminal flow.
- [x] Persist default shell setting.
- [x] Handle unavailable shell gracefully (`ShellNotFoundError`).

---

## Files expected to change

```text
src/main/features/terminal/domain/ShellProfile.ts
src/main/features/terminal/infrastructure/WindowsShellDetector.ts
src/main/features/terminal/infrastructure/shellProfiles.ts
src/main/features/terminal/public.ts
src/main/features/settings/**          (defaultShellProfileId)
src/preload/settingsApi.ts
src/renderer/src/features/terminal/components/NewTerminalMenu.tsx
```

---

## Test plan

> Conventions: `TESTING.md`. Detection is unit-tested through an **injected filesystem probe** — the unit suite must pass on a machine with none of these shells installed.

| Test file | Covers |
|---|---|
| `src/main/features/terminal/testing/FakeShellDetector.ts` | double returning a scripted profile list |
| `src/main/features/terminal/infrastructure/WindowsShellDetector.spec.ts` | detection logic, fake probe |
| `src/main/features/terminal/infrastructure/shellProfiles.spec.ts` | registry / argv resolution |
| `src/main/features/terminal/infrastructure/WindowsShellDetector.integration.spec.ts` | the real machine |

**Detection (fake probe)**

- [x] Only profiles whose executable the probe reports as present appear in the result.
- [x] Git Bash is detected from each documented standard install path.
- [x] `pwsh` absent → simply missing from the list, no throw.
- [x] All five shells absent → returns an empty list, no throw.
- [x] A probe that throws for one candidate is logged and skipped — the other profiles still resolve.
- [x] Detection result order is stable (so the picker does not shuffle between launches).

**Registry**

- [x] Each `ShellProfileId` resolves to the correct executable, argv, and login-shell flags.
- [x] An unknown profile id raises `ShellNotFoundError`.
- [x] Requesting an id that is known but uninstalled raises `ShellNotFoundError`.

**Default profile**

- [x] `defaultShellProfileId` persists across a settings reload.
- [x] A configured default that is no longer installed falls back to an available profile rather than failing to open a terminal.
- [x] With no shells at all, the failure is a handled error surfaced to the user.

**Boundary**

- [x] The New Terminal picker renders exactly the profiles the (faked) detector returned — it does not filter or invent entries.
- [x] Repository scan: no shell executable path string (`bash.exe`, `powershell.exe`, `pwsh.exe`, `cmd.exe`, `wsl.exe`) appears anywhere under `src/renderer/`.
- [x] Phase 1's hardcoded shell path no longer exists in the codebase.

**Integration — real machine** (results are machine-specific; record them)

- [x] Detection on this dev machine returns the shells actually installed.
- [x] Each detected profile launches successfully through `TerminalService`.

---

## Verification — 2026-08-28

```text
npm run typecheck   pass
npm run lint        pass
npm test            318 tests / 27 files   (was 235 / 19 after Phase 4)
npm run test:unit   298 tests — passes with no shell beyond cmd installed
```

**Detection on this machine** found four of the five profiles:

```text
git-bash · powershell · cmd · wsl
```

`pwsh` is absent because PowerShell 7 is not installed here — which is exactly
the required behaviour: missing from the list, no error. The integration spec
then launched every detected profile except WSL through `NodePtyAdapter` and
saw real output from each. WSL is skipped there because it boots a distro VM.

**End-to-end against the built app, run twice to prove persistence:**

```text
pass 1 (settings deleted first)   pass 2 (restart)
  offered: 4 = detected: 4          menu: "… | WSL (default)"
  chose WSL → tab opened            storedDefault: wsl
  storedDefault: wsl                settings version: 1
  no filesystem path in the UI
```

The settings file written was exactly `{"version": 1, "defaultShellProfileId":
"wsl"}`.

**Contract change: the terminal bridge now has seven members.** The picker needs
the installed list, and Main is the only place that knows it. Adding
`terminal.profiles()` was the honest way to supply it — routing shell discovery
through `settings.get()` would have muddled a preference with an enumeration.
`ARCHITECTURE.md` §7 and the Phase 2 "exactly six members" assertions were
updated; the assertions stay exact, only the number moved.

**This phase introduced the settings feature**, which Phase 5 needed for
`defaultShellProfileId`. It holds only `version` and that one field. Adding
`terminal.fontSize` and the `behavior.*` flags now — as `ARCHITECTURE.md` §5
sketches them — would have been writing fields nothing reads until Phase 8 and
Phase 10. `normalizeSettings` defaults every unknown or missing field, so a
later phase adds one with two lines and no migration.

**Terminal still does not import settings.** `TerminalService` asks *"what is
the default shell?"* through an injected function; the composition root answers
it from settings plus the registry. So the coupling lives in `container.ts`
where it belongs, and the user can change their default while the app runs
because the function is called fresh on every create.

**Phase 1's static shell table is gone.** `shellProfiles.ts` now builds a
registry from what detection found, which is what makes `ShellNotFoundError`
mean something: previously it could never fire, because the table answered for
every id whether or not the shell existed.

---

## Acceptance criteria

- The New Terminal dialog lists **only** profiles actually installed on the machine.
- Selecting each available profile launches the correct shell.
- Requesting an uninstalled profile produces a handled error, not a crash.
- The chosen default shell survives an app restart.

---

## Definition of Done

- No shell path string exists in renderer code.
- Phase 1's hardcoded shell path is gone.
- **Every box in the Test plan is ticked and `npm test` is green.**
- The unit suite passes on a machine with **none** of the five shells installed.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-05-shell-profiles.md.

Implement Phase 5 only: Shell Profiles, including its full Test plan.

Create the ShellProfile domain model, a profile registry and
WindowsShellDetector for git-bash, powershell, pwsh, cmd and wsl.
Add a shell picker to the New Terminal flow and persist the default
shell profile in settings.
Remove the hardcoded shell path introduced in Phase 1.

Shell detection must stay in infrastructure — no shell paths in renderer code.

Do not implement workspace persistence.
Do not implement Git.
Do not add custom user-defined profiles.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
