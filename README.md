<div align="center">

<img src="build/icon.png" width="88" alt="GitDeck logo" />

# GitDeck

**See every shell. Lose none.**

A local-first terminal workspace manager for Windows developers who run
several shells at once — dev server, build watcher, git, logs — and are tired
of hunting for them in a crowded tab bar.

[![Platform](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6)](https://github.com/b0yblake/Git-SCM-management/releases)
![Version](https://img.shields.io/badge/version-0.5.0-blue)
![Local first](https://img.shields.io/badge/local--first-no%20telemetry-2EA44F)

![GitDeck Terminal Mosaic](docs/assets/gitdeck-mosaic.png)

</div>

## Why GitDeck?

Tab bars hide your terminals. GitDeck deals them onto a table instead:

1. **Mosaic** — a live canvas that keeps every terminal visible at once.
2. **Navigator** — a searchable list of every session, visible or parked.
3. **Workspaces** — saved terminal setups you can reopen with one click.

Every terminal is a real operating-system shell — Git Bash, PowerShell,
Command Prompt, or WSL — not an emulation.

---

## 🖥️ Terminal Mosaic

Choose how many shells share the canvas. Switch layouts any time; sessions
keep running no matter where they sit.

| Layout               | Visible panes | Shape                                                                     |
| -------------------- | :-----------: | ------------------------------------------------------------------------- |
| **Focus**            |       1       | One terminal fills the canvas                                             |
| **Columns**          |       2       | Two equal vertical panes                                                  |
| **Main + Side**      |       3       | Large pane left, two stacked panes right                                  |
| **Grid** _(default)_ |   unlimited   | Elastic mosaic — the lattice re-balances so every terminal stays on one page |

**Park, don't kill.** Remove a terminal from the canvas without stopping it.
A parked shell keeps running in the background with its output and scrollback
preserved — bring it back exactly where it left off. Closing a terminal is the
only action that ends its shell.

## 🧭 Session Navigator

The Navigator lists every session — on the canvas or parked — with its shell,
working directory, and a live status dot. Type to search when the list grows;
click to focus. `Ctrl+Tab` cycles through sessions without touching the mouse.

## 🐚 Real shells, auto-detected

GitDeck detects what's installed and offers it in the **New Terminal** menu:

- **Git Bash** (requires [Git for Windows](https://git-scm.com/download/win))
- **PowerShell**
- **Command Prompt**
- **WSL**

Each session is a real shell process owned by GitDeck. Close GitDeck and it
cleanly stops the processes it owns — nothing lingers.

## 💾 Workspaces

A workspace is a **blueprint, not a snapshot**. It saves what each terminal
_is_, then recreates it fresh on demand:

```text
📄 Workspace "web-app"
├─ 1. API server   Git Bash    C:\work\api    npm run dev
├─ 2. Frontend     Git Bash    C:\work\web    npm run dev
└─ 3. Scratch      PowerShell  C:\work
```

For each terminal a workspace stores four things: **name**, **shell**,
**directory**, and an optional **startup command**.

- **Open a workspace** → fresh shells spawn in the right folders and startup
  commands run.
- **Relaunch GitDeck** → with restore enabled, your last workspace comes back,
  including which tab was active. Startup commands do **not** rerun on restore
  unless you explicitly opt in — a restart never surprises you with a rebuild.
- Live processes are never persisted; restore recreates definitions only.

## 🔎 Also on deck

|                           |                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Git status, read-only** | The focused terminal shows its repo's branch and working-tree status. GitDeck can _see_ your repo but can never commit, push, pull, merge, or reset it.                                                                                       |
| **Port inspector**        | See which local ports are listening and which process owns them. Terminating a process is explicit: GitDeck shows every affected binding, asks for confirmation, revalidates the target, and protects system processes and itself.            |
| **About GitDeck**         | **Help → About GitDeck**, or click the version in the bottom-right corner: the version you are running, what the app collects (nothing), the license, and links to the project. Links open in your browser.                                    |

## ⌨️ Shortcuts

| Shortcut          | Action                     |
| ----------------- | -------------------------- |
| `Ctrl+T`          | New terminal               |
| `Ctrl+W`          | Close the focused terminal |
| `Ctrl+Tab`        | Next session               |
| `Ctrl+Shift+Tab`  | Previous session           |

---

## 🚀 Install

GitDeck targets **Windows 10/11 x64**. Every release carries two installers.
They install the same application, so take whichever suits you:

| File                              | Use it for                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `GitDeck-Setup-<version>-x64.exe` | A normal install. Run it, pick a folder, done.                                           |
| `GitDeck-Setup-<version>-x64.msi` | Scripted or managed rollout: `msiexec /i GitDeck-Setup-<version>-x64.msi /qn`             |

Download from
[GitHub Releases](https://github.com/b0yblake/Git-SCM-management/releases),
run it, then launch GitDeck from the Start menu or desktop shortcut.

Both install for the current user into `%LOCALAPPDATA%\Programs\GitDeck` and
leave a single entry in **Installed apps**. The MSI wraps the same installer,
so uninstall always goes through that entry — never `msiexec /x`.

> **Unsigned build:** Windows SmartScreen may warn. Verify the installer came
> from this repository, then choose **More info → Run anyway**. If Releases
> contains no installer yet, use the source workflow below.

### Verify a download

Every release carries `GitDeck-<version>-checksums.txt`. Compare it with what
you downloaded:

```powershell
Get-FileHash .\GitDeck-Setup-<version>-x64.exe -Algorithm SHA256
```

With the [GitHub CLI](https://cli.github.com) you can check the release's
signed attestation instead, which also proves the file came from this
repository's release workflow rather than from someone reusing the name:

```powershell
gh release verify v<version> -R b0yblake/Git-SCM-management
gh release verify-asset v<version> .\GitDeck-Setup-<version>-x64.exe -R b0yblake/Git-SCM-management
```

### Run from source

Requires Git and **Node.js 22.22.2 or newer**.

```powershell
git clone https://github.com/b0yblake/Git-SCM-management.git
cd Git-SCM-management
npm ci
npm run dev
```

Build the installers with `npm run package` — `release/` then holds the EXE,
the MSI and the checksums file, exactly the three assets a release carries.
Before opening a pull request, run `npm run ci` and `npm run build`.

Changing the artwork means changing two files. `build/icon.png` is the window
icon while running from source; `build/icon.ico` is what the executable, the
installer, the taskbar and the shortcuts use, and nothing derives it from the
PNG. Redraw the PNG, then regenerate the ICO:

```powershell
powershell -File scripts/make-icon.ps1
```

### Cutting a release

Releases are built and published by GitHub Actions. Nothing is uploaded by
hand.

1. Bump `version` in `package.json` and the version badge above.
2. Append `tests/fixtures/storage/vX.Y.Z/` — the settings, manifest and
   workspace files this version writes — and add the version to
   `PUBLISHED_RELEASES` in `storageCompat.integration.spec.ts`. That suite is
   the proof that a future GitDeck still reads today's data, and it can only
   prove it for releases it has a fixture for. Commit.
3. `git tag vX.Y.Z && git push origin main vX.Y.Z`
4. Watch the **Release** workflow.

The workflow refuses to publish if the tag and `package.json` disagree, and it
runs `npm run ci`, `npm run package` and the packaged end-to-end suite before
the release exists. A published tag is immutable: if a run fails, fix it and
cut the next patch version rather than reusing the tag.

## 🔒 Privacy & safety

- **Local-first.** No account, cloud sync, analytics, or telemetry. Settings,
  workspaces, and rotating operational logs stay under the local Electron
  application-data directories. Terminal input and output are not logged.
- **Uninstall keeps your data.** Removing GitDeck leaves settings and
  workspaces in `%APPDATA%\GitDeck` so a reinstall finds them; delete that
  folder yourself to remove every trace. The data folder itself is
  relocatable from Settings — switching copies your data to the chosen
  folder on the next start and never deletes the old one.
- **Update check, disclosed.** At startup — at most once a day — GitDeck makes
  one anonymous HTTPS request to the GitHub Releases API to learn whether a
  newer version exists. Nothing is downloaded or installed; no account, token,
  or identifier is sent. A dismissible notice links to the release page, and
  the check can be turned off in Settings.
- **Read-only Git.** The Git integration cannot modify a repository.
- **Explicit process control.** Port termination is local, confirmed, and
  process-scoped.
- **Security reports:** use
  [GitHub private security advisories](https://github.com/b0yblake/Git-SCM-management/security/advisories/new) —
  never post credentials, private paths, or logs in public issues.
- **License:** currently `UNLICENSED`. Public source visibility does not grant
  permission to redistribute or sublicense the project.
- **Support:** issues and pull requests are reviewed on a best-effort basis; no
  support SLA or production warranty is provided.

---

<div align="center">

Architecture, test contracts, and implementation phases are documented in
[`plans/`](plans/).

</div>
