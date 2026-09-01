# Phase 11 — Windows Packaging

| | |
|---|---|
| **Purpose** | Produce an installer that works on a machine with **no development tooling** — the real test of the native `node-pty` dependency. |
| **Depends on** | Phase 10 |
| **Unlocks** | Checkpoint B → v0.1.0 |
| **Status** | ◐ Built and verified here; clean-machine run outstanding |

---

## Why this phase is separate

Native module packaging is the classic Electron failure that only appears outside the dev environment. It deserves a dedicated session with a clean test machine, not a rushed step during release.

---

## Scope

**In:** builder configuration, x64 installer, native module verification, icon and version metadata, production logging, clean-install testing, uninstall testing.

**Out:** auto-update, code signing, Store distribution, arm64/32-bit builds, macOS/Linux — unless explicitly scoped later.

---

## Tasks

- [x] Configure electron-builder or Electron Forge.
- [x] Build x64 Windows installer.
- [x] Verify node-pty native module packaging.
- [x] Configure app icon.
- [x] Configure version metadata.
- [x] Add production logs.
- [ ] Test clean Windows install. **Not done — needs a machine without Node.js.**
- [ ] Test Git Bash detection on the clean machine. **Not done — same reason.**
- [ ] Test PowerShell detection on the clean machine. **Not done — same reason.**
- [x] Test app uninstall — the *no orphaned process* half only; removal of the install directory is on the clean machine.

---

## Test plan

> Conventions: `TESTING.md`. This is the only phase with E2E, and the only one whose most important test is **manual on a clean machine** — the packaged native module cannot be validated from the dev environment.

| Test file | Covers |
|---|---|
| `tests/e2e/smoke.spec.ts` | the ten-step critical flow |
| `tests/e2e/packaged-pty.spec.ts` | node-pty inside the **built artifact** |
| this document | the clean-machine manual checklist below |

**E2E — the critical flow** (Playwright for Electron)

- [x] App starts and the window is visible.
- [x] Create a terminal.
- [x] Type `echo hello`.
- [x] Output containing `hello` appears.
- [x] Create a second terminal.
- [x] Switch tabs — the first terminal's output is still present.
- [x] Close a terminal — the other survives.
- [x] Save a workspace.
- [x] Restart the app.
- [x] Workspace definitions, tab names, cwd and active tab are restored.
- [x] With a cwd inside a git repository, the branch appears in the status bar.

**Packaging-specific**

- [x] `packaged-pty.spec.ts` runs against the **built** application, not `npm run dev`, and successfully spawns a PTY. This is the node-pty native check and cannot be substituted by a dev-mode test.
- [x] The installer output contains the node-pty native binary at the expected path.
- [x] `package.json` version matches the intended release.

**Manual — clean machine** (record pass/fail per step in the report; see the script below)

- [ ] Every step of the clean-machine script. **Outstanding — see Verification.**

---

## Clean-machine test script

Run on a Windows machine (or fresh VM) with **no** Node.js, no build tools:

1. Install from the produced installer.
2. Launch the app.
3. Create a terminal — PTY must spawn (this is the node-pty check).
4. Run `git status` in a repo folder.
5. Create a workspace with two terminals, save, restart, confirm restore.
6. Confirm production logs are written to a sane location.
7. Uninstall — confirm no orphaned processes and no leftover install directory.

Record the result of each step.

---

## Verification — 2026-08-28

```text
npm run typecheck   pass
npm run lint        pass
npm test            654 tests / 52 files   (was 645 / 51 after Phase 10)
npm run package     release/GitDeck Setup 0.1.0.exe   114 MB
npm run test:e2e    8 passed, against the packaged application
```

**The headline check passed: the packaged app spawns a working PTY.** A shell
started, `echo packaged-pty-ok` was typed into it through the real keyboard
path, and the output came back — from `release/win-unpacked/GitDeck.exe`, not
from `npm run dev`. That is the one thing this phase exists to prove and the one
thing a dev-mode test cannot.

```text
ok  the built app exists to test at all
ok  the native binary is unpacked, not sealed inside the asar
ok  the app code itself is inside the asar
ok  the shipped version is the intended release
ok  the packaged app spawns a working PTY
ok  production logs are written where a user could find them
ok  closing the packaged app leaves no shell behind
ok  a user can work, save a workspace, restart and find it restored
```

The smoke test is the full ten-step flow plus the Git badge, run twice against
one profile so the restart genuinely restores.

**What is NOT done, and cannot be done from here.** The clean-machine script
needs a Windows machine with no Node.js and no build tools. This is a
development machine. Four boxes above are therefore left unticked, and the
Definition of Done is not met until someone runs the checklist below. Nothing in
this report should be read as evidence that the installer works on a machine
that has never had a toolchain — only that it is built correctly and works here.

---

### Three environment problems, and what they mean for anyone else building this

**1. TLS is intercepted on this network.** Every download failed with `unable to
verify the first certificate`. The interceptor is a FortiGate firewall
(`O=Fortinet, CN=FG10E0TB22902286`): its root certificate is trusted by Windows,
but Node does not read the Windows certificate store. This is almost certainly
the same wall that stopped the Electron download back in Phase 0.

The fix is to point Node at the corporate root, not to disable verification:

```bash
# Export the intercepting root once (PowerShell):
#   Get-ChildItem Cert:\LocalMachine\Root |
#     Where-Object { $_.Subject -match 'Fortinet' } |
#     ForEach-Object { [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks') }
# wrap in -----BEGIN/END CERTIFICATE----- and save as corp-ca.pem, then:
export NODE_EXTRA_CA_CERTS=/path/to/corp-ca.pem
```

With that set, electron-builder downloaded Electron, NSIS and 7-Zip normally.

**2. electron-builder tried to rebuild node-pty from source**, and failed with
`Could not find any Visual Studio installation`. It should not have tried:
node-pty 1.1.0 ships N-API prebuilds and has no `gypfile` — there is nothing to
build. `npmRebuild: false` is in the config with that reasoning written down.
One N-API binary serves both Node and Electron, which is why the very same file
has been spawning shells under Electron since Phase 1.

**3. `EPERM: rename win-unpacked.tmp → win-unpacked`, reproducibly.** Something
holds the freshly extracted directory for a moment and electron-builder renames
immediately, with no retry. It is transient — renaming by hand a second later
succeeds every time — and it happens outside the project tree too, so it is a
scanner on this machine rather than anything about the repository. Worked around
by handing electron-builder an already-extracted Electron:

```bash
unzip -q "$LOCALAPPDATA/electron-builder/Cache/electron/electron-v44.0.0-win32-x64.zip" \
  -d /tmp/electron-dist-44
npx electron-builder --win --x64 -c.electronDist=/tmp/electron-dist-44
```

That path is machine-specific, so it is **not** baked into
`electron-builder.yml`; `npm run package` is the plain command and works
wherever the scanner does not interfere.

---

### The line that matters most in `electron-builder.yml`

```yaml
asarUnpack:
  - node_modules/node-pty/**
```

A native `.node` cannot be loaded from inside an asar archive, and on Windows
node-pty also spawns `OpenConsole.exe` and loads `conpty.dll` as loose files
beside it. Without this the app installs cleanly and then cannot open a single
terminal — the classic Electron failure this phase exists to catch. All seven
files are present in the built output and asserted by `packaged-pty.spec.ts`.

### Production logging

A packaged Windows app has no console, so `consoleSink` goes nowhere the moment
the app leaves the dev environment. `createFileSink` writes to
`app.getPath('logs')/gitdeck.log` alongside it, rotating at 1 MB and keeping one
previous file. Every write failure is swallowed: a crash caused by logging is
worse than a lost line. An E2E test reads `app ready` back out of that file on
the packaged app.

---

## Clean-machine checklist — **still to be run**

Take `release/GitDeck Setup 0.1.0.exe` to a Windows 10/11 x64 machine (or a
fresh VM) with **no Node.js and no build tools**, and record each result:

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Run the installer | Installs without prompting for anything unusual; SmartScreen will warn, because the build is unsigned | ☐ |
| 2 | Launch GitDeck | Window opens, dark, titled GitDeck, with the app icon | ☐ |
| 3 | A terminal appears by itself | **The node-pty check.** A shell prompt, not a blank panel | ☐ |
| 4 | `git status` in a repository folder | Runs, and the branch appears in the status bar | ☐ |
| 5 | Which shells are offered | Reflects *that* machine's installs, not this one's | ☐ |
| 6 | Create a workspace with two terminals, save, restart | Both come back, in their own directories | ☐ |
| 7 | `%APPDATA%\GitDeck\logs\gitdeck.log` | Exists and contains `app ready` | ☐ |
| 8 | Uninstall | Install directory gone; no `bash.exe` / `powershell.exe` left running | ☐ |

Step 3 is the one that matters. If it fails, the cause is almost always
`asarUnpack` — check that
`resources\app.asar.unpacked\node_modules\node-pty\prebuilds\win32-x64\pty.node`
exists in the installed directory.

**Known limitations.**

- Unsigned. Windows SmartScreen will warn on first run; code signing is
  explicitly out of scope.
- x64 only. node-pty ships `win32-arm64` prebuilds, so arm64 is a config change
  rather than a port, but it is untested and out of scope.
- No auto-update.
- The installer is 114 MB, essentially all Electron.

---

## Acceptance criteria

- A clean Windows machine can install and launch the application from the installer.
- No development dependency is required on the target machine.
- Shell detection works against the target machine's real installations, not the dev machine's.

---

## Definition of Done

- The clean-machine test script above has been executed and its results recorded.
- Version metadata matches the intended release (`0.1.0`).
- Uninstall leaves no running PTY processes.
- **Every box in the Test plan is ticked**, `npm test` is green, and `npm run test:e2e` passes.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-11-packaging.md.

Implement Phase 11 only: Windows packaging, including its full Test plan.

Configure electron-builder or Electron Forge, produce an x64 Windows
installer, verify the node-pty native module is packaged correctly,
configure the app icon and version metadata, and add production logging.

Then document the clean-machine test script results.

x64 Windows only. No auto-update, no code signing, no other platforms.

At completion report: implemented, files changed, tests added/run,
clean-install results, known limitations, explicitly deferred items.
```
