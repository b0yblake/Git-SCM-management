<div align="center">

<img src="build/icon.png" width="96" alt="GitDeck logo" />

# GitDeck

**All your Windows terminals, visible and ready.**

Run Git Bash, PowerShell, Command Prompt, and WSL side by side. Park a session
without stopping it, then save the whole setup as a workspace you can reopen
in one click.

<!-- Keep the release tag, app version, asset name, and hashes in sync. -->
<a href="https://github.com/b0yblake/Git-SCM-management/releases/download/v0.5/GitDeck-Setup-0.5.0-x64.exe">
  <img src="https://img.shields.io/badge/Download-GitDeck%200.5.0%20for%20Windows-1677FF?style=for-the-badge&logo=windows11&logoColor=white" alt="Download GitDeck 0.5.0 for Windows x64" />
</a>

<br />

[Release page](https://github.com/b0yblake/Git-SCM-management/releases/tag/v0.5)
· [Quick start](#quick-start)
· [Features](#core-features)
· [Privacy](#privacy-and-safety)
· [Build from source](#build-from-source)

![Windows 10/11 x64](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6)
![Local first](https://img.shields.io/badge/local--first-no%20account-2EA44F)
![No telemetry](https://img.shields.io/badge/telemetry-none-2EA44F)
![Version](https://img.shields.io/badge/version-0.5.0-555555)

<img src="docs/assets/gitdeck-mosaic.png" alt="GitDeck showing three live terminal sessions in the Grid layout" />

<sub>The Terminal Mosaic keeps live shells on one canvas, with every session one click away in the Navigator.</sub>

</div>

## Why GitDeck?

Terminal tabs work until a project needs an API server, frontend watcher,
test runner, logs, and a scratch shell at the same time. GitDeck turns that
pile of tabs into a reusable visual workspace.

| What you need | What GitDeck gives you |
| --- | --- |
| See what is running | Focus, Columns, Main + Side, and an elastic Grid that keeps every unparked session on one page. |
| Clear space without losing work | Park a terminal to hide it from the canvas while its process and scrollback keep running. |
| Recreate a project setup | Save terminal names, shells, folders, and optional startup commands as a workspace. |
| Start work from Windows | Open a folder from Explorer or create a desktop shortcut for a saved workspace. |
| Keep local work local | No account, cloud sync, analytics, or telemetry. The Git status UI exposes no write actions. |

GitDeck is a **terminal workspace manager**, not a Git client. Its built-in Git
integration only invokes status commands and exposes no commit, push, pull,
merge, reset, or checkout action. Commands you type inside a shell still behave
normally and can, of course, change a repository.

## Install GitDeck

> [!NOTE]
> GitDeck requires **Windows 10 or 11 on x64**. A normal installation does not
> require Node.js or Git. Windows PowerShell and Command Prompt are built in;
> Git Bash, PowerShell 7, and WSL appear when they are installed on your PC.

### Recommended: EXE installer

1. [Download `GitDeck-Setup-0.5.0-x64.exe`](https://github.com/b0yblake/Git-SCM-management/releases/download/v0.5/GitDeck-Setup-0.5.0-x64.exe).
2. Open the downloaded file. Keep the default
   `%LOCALAPPDATA%\Programs\GitDeck` folder or choose another location.
3. Launch **GitDeck** from the Start menu or desktop shortcut.

> [!WARNING]
> GitDeck is not currently code-signed, so Microsoft Defender SmartScreen may
> show a warning. Confirm that the download came from this repository, select
> **More info**, then **Run anyway**. See [Verify the download](#verify-the-download)
> if you want to check the file before opening it.

<details>
<summary><strong>Managed or silent installation with MSI</strong></summary>

Download
[`GitDeck-Setup-0.5.0-x64.msi`](https://github.com/b0yblake/Git-SCM-management/releases/download/v0.5/GitDeck-Setup-0.5.0-x64.msi),
then run:

```powershell
msiexec /i .\GitDeck-Setup-0.5.0-x64.msi /qn
```

The MSI wraps the same per-user installer as the EXE. Uninstall GitDeck from
**Settings → Apps → Installed apps**; the wrapper is intended for deployment,
not `msiexec /x` inventory.

</details>

### Verify the download

<details>
<summary><strong>Show SHA-256 verification steps</strong></summary>

PowerShell can calculate the SHA-256 digest without installing another tool:

```powershell
(Get-FileHash .\GitDeck-Setup-0.5.0-x64.exe -Algorithm SHA256).Hash.ToLower()
```

Compare the result with the digest published by GitHub for the v0.5 assets:

| File | Expected SHA-256 |
| --- | --- |
| `GitDeck-Setup-0.5.0-x64.exe` | `691b7fdc672bea5bf77ff2bfb8aea886a6fdcb9b91867949416277d1741f35fd` |
| `GitDeck-Setup-0.5.0-x64.msi` | `86d674c0a9b31477a52d654f35e41d53b3ed52fe44a80d0b68517ea87c9283ef` |

If the values differ, do not run the installer. Delete it and download a new
copy from the [official release page](https://github.com/b0yblake/Git-SCM-management/releases/tag/v0.5).

</details>

## Quick start

You can build a useful workspace in about a minute:

1. Select **New Terminal** or press `Ctrl+T` to open the default shell.
2. Use the arrow beside **New Terminal** to choose another detected shell. Your
   choice becomes the new default.
3. Pick **Focus**, **Columns**, **Main + Side**, or **Grid** above the canvas.
4. Use the pane controls to rename, duplicate, focus, park, or close a terminal.
5. Open **Workspaces → New workspace**. Give each terminal a name, working
   directory, shell, and optional startup command, then select **Save workspace**.

A typical full-stack workspace might look like this:

```text
Workspace: web-app
├─ API       Git Bash           C:\dev\web-app\api       npm run dev
├─ Web       PowerShell 7       C:\dev\web-app\web       npm run dev
├─ Tests     Command Prompt     C:\dev\web-app           npm test -- --watch
└─ Scratch   Windows PowerShell C:\dev\web-app
```

Opening that workspace reuses matching sessions that are already running and
creates any that are missing in the right folders. Saved startup commands run
for newly created sessions. Live processes and terminal output are never
serialized.

## Core features

### Terminal Mosaic

Switch layouts at any time without restarting a shell:

| Layout | Visible sessions | Best for |
| --- | :---: | --- |
| **Focus** | 1 | Concentrating on one terminal. Select the focus control again to restore the previous layout. |
| **Columns** | 2 | Comparing two processes side by side. |
| **Main + Side** | 3 | One primary shell with two supporting panes. |
| **Grid** *(default)* | All unparked sessions | Keeping the whole project in view; the grid rebalances as terminals are added or the window is resized. |

Once a session is visible, the **Add new Terminal** tile stays at the end of
Grid and appears in any unfilled fixed layout. It opens a fresh default
terminal rather than copying the selected pane.

> **Park is not close.** Parking removes a pane from the canvas but keeps the
> shell alive. Closing a pane ends its shell process and asks for confirmation
> by default.

### Session Navigator

The Navigator lists every running session, including parked ones. Search by
terminal name, shell, or directory; select a result to bring it back to the
canvas. `Ctrl+Tab` and `Ctrl+Shift+Tab` move through sessions without the mouse.

### Reusable workspaces

A workspace is a blueprint, not a snapshot. It stores:

- the workspace and terminal names;
- each working directory and shell profile;
- an optional startup command for each terminal;
- the terminal that should be active.

Opening a workspace is an explicit request to start its commands. Restoring the
last workspace after relaunch recreates its terminals, but startup commands do
not rerun unless you enable that option in Settings.

### Windows shortcuts

- **Open a folder:** after GitDeck has been launched once from an installed
  build, hold `Shift` and right-click a folder or the background inside it,
  then choose **Open in GitDeck**.
- **Create a workspace shortcut:** right-click a saved workspace in GitDeck,
  choose **Create shortcut…**, and save the `.lnk` wherever it is useful.
- Both actions reuse a running GitDeck window. Opening the same folder again
  focuses its existing terminal instead of creating a duplicate.

### Git status and local ports

- The focused terminal shows its repository branch and working-tree status.
  The built-in UI exposes no Git write action.
- **File → Port…** lists TCP listeners, bound UDP endpoints, and their owning
  processes. Termination is selected explicitly, confirmed, and revalidated.
  GitDeck refuses its own process, Windows PIDs 0 and 4, cross-session targets,
  and any target whose identity it cannot verify.

## Supported shells

GitDeck detects known shells from their standard Windows locations and only
shows profiles that are available.

| Shell | Availability |
| --- | --- |
| **Windows PowerShell** | Included with Windows. |
| **Command Prompt** | Included with Windows. |
| **Git Bash** | Install [Git for Windows](https://git-scm.com/download/win). |
| **PowerShell 7** | Install PowerShell 7 for a modern `pwsh` profile. |
| **WSL** | Enable Windows Subsystem for Linux and install a distribution. |

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+T` | Open a new terminal with the default shell. |
| `Ctrl+W` | Close the focused terminal. |
| `Ctrl+Tab` | Move to the next session. |
| `Ctrl+Shift+Tab` | Move to the previous session. |

## Privacy and safety

- **No account or telemetry.** Settings, workspaces, and operational logs stay
  on your PC. Terminal input and output are not logged.
- **Your data survives uninstall.** By default it remains under
  `%APPDATA%\GitDeck`, so reinstalling can find it. To remove saved data, delete
  that folder and any custom data folder you selected; workspace `.lnk` files
  you created are separate and can be deleted like normal shortcuts.
- **The data folder is movable.** Choose another folder in Settings. GitDeck
  copies or adopts the selected data immediately, uses it from the next launch,
  and does not delete the old copy. Operational logs remain in the default app
  data folder.
- **Update checks are transparent.** When enabled, GitDeck makes at most one
  unauthenticated HTTPS metadata request per day to the GitHub Releases API.
  It sends a `GitDeck` user-agent but no account, token, or app-generated device
  identifier, and never downloads or installs an update automatically. You can
  turn the check off in Settings.
- **App exit is explicit.** Closing GitDeck cleanly stops shell processes it
  owns. Workspaces restore terminal definitions, not running processes.

## Frequently asked questions

<details>
<summary><strong>Does parking a terminal stop my process?</strong></summary>

No. Parking only hides the terminal from the canvas. Its process, output, and
scrollback remain available from the Navigator. Closing the terminal is what
stops the process.

</details>

<details>
<summary><strong>Will my processes continue after GitDeck exits?</strong></summary>

No. GitDeck shuts down the processes it owns. A saved workspace can recreate
the terminals later, but it does not preserve process memory or terminal output.

</details>

<details>
<summary><strong>Can GitDeck change my Git repository?</strong></summary>

The built-in integration only invokes status commands and offers no Git write
actions. Commands entered in a terminal remain unrestricted, just as they are
in any other shell.

</details>

<details>
<summary><strong>Why is a shell missing from the New Terminal menu?</strong></summary>

GitDeck only lists shells it detects in standard install locations. Install the
shell, restart GitDeck, and check the menu again. Windows PowerShell and Command
Prompt should already be present on supported Windows versions.

</details>

## Build from source

Source development requires **Git** and **Node.js 22.22.2 or newer**:

```powershell
git clone https://github.com/b0yblake/Git-SCM-management.git
cd Git-SCM-management
npm ci
npm run dev
```

Useful project commands:

| Command | Purpose |
| --- | --- |
| `npm run ci` | Run type checking, lint, and the complete Vitest suite. |
| `npm run build` | Create the production Electron bundles. |
| `npm run package` | Build the Windows EXE, MSI, and local checksums file. |
| `npm run test:e2e` | Exercise the packaged application with Playwright. |
| `npm run verify:release` | Run the full release verification sequence. |

Architecture decisions, test contracts, and implementation history live in
[`plans/`](plans/). The release automation is documented in
[`plans/phase-22-release-packaging.md`](plans/phase-22-release-packaging.md).

## Support, security, and license

- For bugs and feature requests, use
  [GitHub Issues](https://github.com/b0yblake/Git-SCM-management/issues).
- Report vulnerabilities privately through
  [GitHub Security Advisories](https://github.com/b0yblake/Git-SCM-management/security/advisories/new).
- Support is best-effort; there is no support SLA or production warranty.
- The repository is currently **UNLICENSED**. Public source visibility does not
  grant permission to redistribute or sublicense the project.

<div align="center">

**Spend less time finding terminals. Spend more time using them.**

[Download GitDeck 0.5.0](https://github.com/b0yblake/Git-SCM-management/releases/download/v0.5/GitDeck-Setup-0.5.0-x64.exe)
· [View all releases](https://github.com/b0yblake/Git-SCM-management/releases)

</div>
