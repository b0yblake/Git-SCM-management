# Phase 12 — Port Management

| | |
|---|---|
| **Purpose** | Let the user inspect local ports and deliberately terminate the process that owns a selected port from **File → Port…**, without exposing generic process execution to the renderer. |
| **Depends on** | Checkpoint B / v0.1.0 release boundary |
| **Unlocks** | v0.2.0 release candidate |
| **Status** | ☑ Complete — verified 2026-08-28, incl. packaged E2E |

---

## Why this phase is separate

This is the first feature allowed to terminate an operating-system process. It
therefore needs a stricter boundary than a normal read-only inspection feature:
the renderer may select a target Main has already enumerated, but it may never
supply an arbitrary PID, executable name or command line.

The UI says “kill a port” because that is the user's intent. The operation is
actually **process termination**: Windows does not terminate a port, and one
process may own several ports. The modal must make that blast radius visible
before the user confirms.

---

## Scope boundary — read first

For this phase, a “running port” means:

- a local TCP endpoint whose state is `Listen`; or
- a bound local UDP endpoint.

Established/outbound TCP connections are excluded. They do not prevent a local
development server from binding its listening port and would turn the modal
into a noisy connection monitor.

**In:** native `File → Port…` menu entry, TCP listener and UDP endpoint
inspection, process grouping, filter/sort, multi-select, explicit confirmation,
termination of selected owning processes, refresh, partial-failure reporting,
accessibility and packaged-app verification.

**Out:** remote-machine inspection, outbound connection monitoring, firewall
rules, port forwarding, reserving a port, restarting a command automatically,
automatic kill before terminal commands, killing by image name, process-tree
termination, privilege elevation, Windows service control, macOS/Linux support.

---

## User flow

```text
File → Port…
      ↓
Main tells the renderer to open the modal
      ↓
Renderer requests a fresh port snapshot
      ↓
Main enumerates TCP listeners + UDP endpoints
      ↓
Modal groups bindings by owning process
      ↓
User selects one or more killable processes
      ↓
Confirmation names the processes and every port they own
      ↓
Main revalidates the snapshot and process identity
      ↓
Terminate each selected process independently
      ↓
Refresh and prove which ports were released
```

Opening `File → Port…` while the modal is already open focuses the existing
modal and refreshes it. It must never create stacked copies.

---

## Process-level semantics

The modal renders one selectable row per process, not one destructive checkbox
per binding. A row may contain several bindings:

```text
☑ node.exe    PID 18420    TCP 127.0.0.1:3000 · TCP [::]:3000 · UDP 0.0.0.0:5353
```

Selecting that row means “terminate `node.exe` PID 18420”, so every binding in
the row is affected. Duplicate IPv4/IPv6 listeners and duplicate selections
must never cause the same PID to be terminated twice.

Termination is forceful and local:

```text
taskkill.exe /PID <validated-pid> /F
```

Use `execFile`, never a shell-built command. Do not use `/IM` and do not use
`/T`; this phase targets the exact process that owns the port, not every process
with the same name and not its whole child tree.

---

## Data contract

```ts
export type PortProtocol = 'tcp' | 'udp'

export interface PortBinding {
  readonly protocol: PortProtocol
  readonly localAddress: string
  readonly localPort: number
}

export type PortTerminationBlockReason =
  | 'system-process'
  | 'gitdeck-process'
  | 'different-session'
  | 'identity-unavailable'

export interface PortProcess {
  // Opaque capability minted by Main for this snapshot. It is not a PID.
  readonly targetId: string
  readonly pid: number
  readonly processName: string
  readonly startedAt: number | null
  readonly bindings: readonly PortBinding[]
  readonly canTerminate: boolean
  readonly blockedReason?: PortTerminationBlockReason
}

export interface PortSnapshot {
  readonly id: string
  readonly capturedAt: number
  readonly processes: readonly PortProcess[]
}

export interface TerminatePortProcessesRequest {
  readonly snapshotId: string
  readonly targetIds: readonly string[]
}

export interface PortTerminationFailure {
  readonly targetId: string
  readonly code: string
  readonly message: string
}

export interface TerminatePortProcessesResult {
  readonly terminatedTargetIds: readonly string[]
  readonly alreadyExitedTargetIds: readonly string[]
  readonly failures: readonly PortTerminationFailure[]
}
```

The renderer may display a PID, but `terminate()` accepts only `snapshotId` and
opaque `targetId` values. There is deliberately no public API that accepts a
PID, process name, command, signal or executable path.

---

## Main-process design

Create an independent `ports` feature:

```text
src/main/features/ports/
├── domain/          PortProcess.ts · PortAdapter.ts · errors.ts
├── application/     PortService.ts
├── infrastructure/ WindowsPortAdapter.ts
├── ipc/             portsIpc.ts
├── testing/         FakePortAdapter.ts
└── public.ts
```

`PortService` owns the current in-memory snapshot. `WindowsPortAdapter` owns all
PowerShell and `taskkill.exe` knowledge. No terminal, workspace or Git feature
may import this feature, and the ports feature must not import their internals.

Only one snapshot is retained and it expires after five minutes
(`PORT_SNAPSHOT_TTL_MS = 300_000`). A stale modal receives a stable error and
refreshes; Main never keeps an unbounded history of process capabilities.

### Enumeration

Run Windows PowerShell hidden, non-interactive and with a fixed script supplied
by the application:

```text
Get-NetTCPConnection -State Listen
Get-NetUDPEndpoint
Get-Process
```

Return machine-readable JSON containing only local address, local port,
protocol, PID, process name, start time and Windows session id. The command has
a documented timeout and a bounded output size. No renderer value may be
interpolated into the PowerShell script.

If process metadata cannot be read, keep the binding visible as `Unknown`, but
mark it non-terminable. Empty PowerShell output is a valid empty snapshot;
malformed output or a missing NetTCPIP cmdlet is a handled inspection error.

### Safety rules

Main must enforce every rule below even if the renderer is compromised:

1. Only the most recently issued, unexpired snapshot is accepted. A refresh
   invalidates the previous snapshot.
2. `targetIds` must be a non-empty array of unique strings with a documented
   maximum of 50 targets per request.
3. A target must have been minted by Main in the named snapshot; unknown ids are
   rejected before `taskkill.exe` is started.
4. PID `0`, PID `4`, GitDeck's own Main PID, another Windows session, or a
   process whose identity cannot be read is never terminable.
5. Immediately before termination, re-read the PID's process start time and
   owned bindings. A changed start time or a process that no longer owns any
   snapshotted binding is stale and must not be killed.
6. Kill by numeric PID only. Never construct `/IM`, wildcard, remote-host,
   username, password or filter arguments.
7. Do not request elevation. `Access denied` is a per-target failure, not a
   reason to relaunch GitDeck as Administrator.
8. One failure does not abort the remaining selected targets.
9. Re-enumerate after termination. Report a target as successful only when its
   snapshotted bindings are gone; if another process immediately takes a port,
   the refreshed list must show that fact.

Log inspection failure and termination outcomes, but never log the full
PowerShell command, environment variables or executable paths.

---

## IPC and preload contract

Add one namespace to the channel registry:

```ts
ports: {
  list: 'ports:list',
  terminate: 'ports:terminate',
  open: 'ports:open'
}
```

`list` and `terminate` are request/response channels. `open` is a one-way
Main → renderer event emitted by the native application menu.

```ts
interface PortsApi {
  list(): Promise<Result<PortSnapshot, IpcError>>
  terminate(
    request: TerminatePortProcessesRequest
  ): Promise<Result<TerminatePortProcessesResult, IpcError>>
  onOpen(callback: () => void): Unsubscribe
}
```

Add `ports: PortsApi` to `window.gitdeck`. Never expose `ipcRenderer`,
`child_process`, PowerShell, `taskkill`, a generic `kill(pid)` or a generic
`exec(command)` endpoint.

---

## Native menu contract

Install a real Electron application menu after `app.whenReady()`:

```text
File
└── Port…
```

Electron's default menu currently supplies standard File/Edit/View/Window
items. Setting a custom application menu replaces it, so the new menu builder
must preserve the standard edit/window roles and existing copy/paste keyboard
behavior. The `Port…` click handler sends `IPC.ports.open` only to the focused,
live window; no window or destroyed `webContents` is a no-op.

The menu label is exactly `Port…` to match the requested navigation. No global
shortcut is introduced in this phase.

---

## Renderer contract

Create a renderer `ports` feature with a `PortsModalHost`, store/hook and modal.
`App.tsx` imports only `features/ports/public.ts`.

The modal must provide:

- loading, empty and handled-error states;
- a scrollable table grouped by process;
- process name, PID, protocol, local address and local port;
- deterministic sort by lowest local port, then process name and PID;
- filtering by port, PID or process name without changing the underlying
  selection;
- one checkbox per process and “select all visible, killable” behavior;
- a disabled row with a clear reason for non-terminable processes;
- manual Refresh;
- `Terminate selected` disabled when nothing killable is selected;
- a confirmation that names every selected process and all affected bindings;
- per-target success/failure feedback and an automatic refresh after kill;
- Escape/backdrop close, focus trap, and focus restoration to the previously
  active terminal/control.

Presentational modal components must not call `window.gitdeck` directly. IPC
calls and `onOpen` subscription live in the feature hook; snapshot and selection
state contain serializable data only.

---

## Tasks

- [x] Define the shared port contracts and stable domain errors.
- [x] Define `PortAdapter` and reusable `FakePortAdapter`.
- [x] Implement TCP `Listen` and UDP endpoint enumeration on Windows.
- [x] Parse and validate the PowerShell JSON output.
- [x] Group and deterministically sort bindings by process identity.
- [x] Mint and retain one bounded, expiring snapshot in Main.
- [x] Mark system, GitDeck, cross-session and unknown identities non-terminable.
- [x] Implement stale-target revalidation.
- [x] Implement exact-PID force termination without `/IM`, `/T` or elevation.
- [x] Implement partial success and post-termination verification.
- [x] Add typed ports IPC and preload API.
- [x] Add the native `File → Port…` menu while preserving standard roles.
- [x] Implement the renderer store/hook and `PortsModalHost`.
- [x] Implement filter, selection, confirmation, refresh and feedback states.
- [x] Extend `fakeGitDeckApi` with the ports namespace and call recording.
- [x] Intentionally update the IPC snapshot for the three new channels.
- [x] Update `ARCHITECTURE.md` with the ports model/API and `TESTING.md` with
      the post-v0.1 E2E rule.
- [x] Add unit, integration and packaged-app E2E coverage.

---

## Files expected to change

```text
plans/ARCHITECTURE.md
plans/TESTING.md
src/shared/contracts/{ports,ipc,events}.ts
src/shared/contracts/{ipc,ipc.snapshot}.spec.ts
src/main/features/ports/domain/{PortProcess,PortAdapter,errors}.ts
src/main/features/ports/application/PortService.ts
src/main/features/ports/infrastructure/WindowsPortAdapter.ts
src/main/features/ports/ipc/portsIpc.ts
src/main/features/ports/testing/FakePortAdapter.ts
src/main/features/ports/public.ts
src/main/bootstrap/{applicationMenu,container,registerIpc}.ts
src/main/index.ts
src/preload/{api,portsApi,index,types.d}.ts
src/renderer/src/features/ports/components/{PortsModalHost,PortsModal}.tsx
src/renderer/src/features/ports/hooks/usePorts.ts
src/renderer/src/features/ports/store/portsStore.ts
src/renderer/src/features/ports/public.ts
src/renderer/src/testing/fakeGitDeckApi.ts
src/renderer/src/shared/styles/{global,ports}.css
src/renderer/src/app/App.tsx
tests/e2e/ports.spec.ts
```

**Expected to NOT change:** terminal engine, workspace persistence, Git
adapter/parser, settings schema.

---

## Test plan

> Conventions: `TESTING.md`. The service and UI suites use fakes. Only the
> adapter integration suite and packaged E2E may inspect or terminate a real
> process, and each owns the disposable process it targets.

| Test file | Covers |
|---|---|
| `src/main/features/ports/testing/FakePortAdapter.ts` | scripted bindings, identity changes and termination outcomes |
| `src/main/features/ports/infrastructure/WindowsPortAdapter.spec.ts` | command construction and JSON parsing without touching the OS |
| `src/main/features/ports/infrastructure/WindowsPortAdapter.integration.spec.ts` | real TCP/UDP enumeration and a disposable child process |
| `src/main/features/ports/application/PortService.spec.ts` | grouping, snapshots, safety and partial results |
| `src/main/features/ports/ipc/portsIpc.spec.ts` | input validation and error translation |
| `src/main/bootstrap/applicationMenu.spec.ts` | menu shape, target window and standard roles |
| `src/preload/portsApi.spec.ts` | bridge shape and `onOpen` cleanup |
| `src/renderer/src/features/ports/store/portsStore.spec.ts` | selection and refresh transitions |
| `src/renderer/src/features/ports/components/PortsModal.spec.tsx` | modal behavior and accessibility |
| `tests/e2e/ports.spec.ts` | native menu → real modal → disposable listener terminated → port reusable |

### Enumeration and grouping

- [x] A TCP listener appears with protocol, address, port and owning PID.
- [x] A bound UDP endpoint appears with the same minimum metadata.
- [x] Established/outbound TCP connections never appear.
- [x] IPv4 and IPv6 listeners are preserved as distinct bindings.
- [x] Multiple bindings owned by one process produce one process row.
- [x] Rows and bindings have deterministic ordering.
- [x] No listeners/endpoints produces an empty snapshot, not an error.
- [x] An unreadable process remains visible as non-terminable `Unknown`.
- [x] Malformed/truncated/oversized PowerShell output is rejected and logged.
- [x] Enumeration timeout kills the inspector process and returns a handled
      error.

### Snapshot and input safety — critical

- [x] `list` mints opaque target ids that do not equal or contain the PID.
- [x] A second `list` invalidates the first snapshot.
- [x] An expired or unknown `snapshotId` starts no termination command.
- [x] An unknown `targetId` starts no termination command.
- [x] A payload containing `pid`, `processName`, `command`, `signal` or extra
      fields is rejected before reaching the service.
- [x] Empty, duplicate, non-string or more than 50 target ids are rejected.
- [x] The request and response survive `structuredClone`.
- [x] PID `0`, PID `4`, GitDeck's PID, a different-session PID and a process
      with unreadable identity can never reach the adapter's terminate method.
- [x] PID reuse (same PID, different start time) is classified stale and never
      terminated.
- [x] A target that no longer owns a snapshotted binding is classified stale
      and never terminated.

### Termination

- [x] One selected process is terminated exactly once even when it owns several
      ports.
- [x] Selecting several rows terminates each distinct process once.
- [x] `taskkill.exe` receives exactly `/PID`, the validated decimal PID and
      `/F`; no `/IM`, `/T`, wildcard, host or user argument is constructed.
- [x] `execFile` runs with `shell: false`, `windowsHide: true`, a timeout and a
      bounded output buffer.
- [x] An already-exited process is reported separately and treated as harmless.
- [x] Access denied for target A does not prevent target B from terminating.
- [x] A successful command whose port remains bound is not falsely reported as
      released.
- [x] After success, the refreshed snapshot no longer contains the released
      binding.
- [x] No code path attempts UAC elevation or relaunch-as-administrator.

### Native menu and preload

- [x] The application menu contains `File → Port…` exactly once.
- [x] Standard edit/window roles remain available after installing the custom
      menu.
- [x] Clicking `Port…` sends only `IPC.ports.open` to the focused live window.
- [x] No focused window or destroyed `webContents` does not throw.
- [x] `onOpen` returns a working unsubscribe.
- [x] 100 subscribe/unsubscribe cycles leave zero listeners.
- [x] `window.gitdeck.ports` exposes exactly `list`, `terminate` and `onOpen`.
- [x] No `ipcRenderer`, `child_process`, generic kill or generic exec API is
      exposed.

### Modal behavior

- [x] An open event opens one modal and starts exactly one fresh list request.
- [x] A second open event focuses/refreshes the existing modal; it does not
      stack another modal.
- [x] Loading, empty and handled-error states are visible.
- [x] Filter matches port, PID and process name.
- [x] Filtering does not silently discard existing selection.
- [x] Select-all selects only visible, killable processes.
- [x] Non-terminable rows are disabled and explain why.
- [x] `Terminate selected` is disabled when selection is empty.
- [x] Confirmation names the selected processes and every affected binding.
- [x] Cancelling makes zero `ports.terminate` calls.
- [x] Confirming sends only snapshot/target ids, never PIDs.
- [x] Partial failures are surfaced per target and successful rows still clear.
- [x] The modal refreshes after termination and clears stale selections.
- [x] Escape/backdrop close and focus restoration work without a mouse.
- [x] The presentational modal records zero direct `fakeGitDeckApi` calls.

### Integration and E2E

- [x] A disposable child process opens a real TCP listener; the adapter finds
      its PID and port.
- [x] A disposable child process opens a real UDP endpoint; the adapter finds
      it.
- [x] The adapter terminates only the disposable child; the test runner and app
      remain alive.
- [x] The terminated TCP port can be rebound by a new server.
- [x] The packaged app path passes: native `File → Port…` → modal → select the
      disposable listener → confirm → port disappears → command can bind again.
- [x] Closing the modal/app leaves no inspector PowerShell process behind.

### Regression and boundary

- [x] Terminal, workspace, Git and settings suites pass unchanged.
- [x] No file under `src/main/features/terminal/`, `workspace/` or `git/` changes.
- [x] Architecture guard proves other features cannot import `ports` internals.
- [x] Repository scan finds no raw `'ports:'` channel outside
      `shared/contracts/ipc.ts`.
- [x] Repository scan finds no `/IM`, `/T`, wildcard or generic command
      construction in production ports code.

---

## Acceptance criteria

The user can:

```text
1. Open File → Port…
2. See every local TCP listener and UDP endpoint grouped by process.
3. Select the process holding the development port.
4. See exactly which process and ports will be affected.
5. Confirm termination.
6. See the binding disappear after refresh.
7. Run the development command again and bind the same port successfully.
```

Access-denied, stale and protected targets are explained without crashing the
app or blocking other selected targets.

---

## Definition of Done

- The renderer cannot terminate an arbitrary PID; it can only act on an opaque,
  current Main-issued target.
- GitDeck and protected/system identities are non-terminable.
- The UI clearly states that terminating a selected port terminates its owning
  process and may release several ports.
- No privilege elevation, generic process API or process-tree kill exists.
- Re-listing proves the selected binding was released before success is shown.
- The terminal/workspace/Git/settings features remain unchanged and green.
- Every box in the Test plan is ticked.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and the ports
  packaged E2E test all pass.

---

## Known implementation risks to verify

- `Get-NetTCPConnection` / `Get-NetUDPEndpoint` latency varies by Windows
  machine; the modal needs a real loading state and a timeout.
- Protected processes may expose a binding while hiding name/start time. They
  must remain visible but non-terminable.
- A PID can be recycled between inspection and termination. Snapshot capability
  ids plus start-time/binding revalidation reduce this race; the implementation
  must never skip those checks for convenience.
- A process can reopen or another process can immediately claim the same port.
  Only the post-kill refresh determines whether the port is actually available.
- Installing a custom Electron menu replaces the default menu on Windows. The
  standard roles must be recreated and regression-tested.

---

## Verification — 2026-08-28

```text
npm run typecheck   pass
npm run lint        pass
npm test            812 tests / 60 files   (was 654 / 52 after Phase 11)
npm run build       pass
npm run test:e2e    9 passed — all against the packaged application
```

**Ordering note.** This phase was implemented on explicit instruction while
Checkpoint B remains unrun (`plans/README.md` row still ☐). The plan's
"Depends on: Checkpoint B / v0.1.0 release boundary" therefore did not hold at
implementation time. Nothing in the pre-existing features was modified — the
`src/main/features/{terminal,workspace,git,settings}` and renderer counterparts
were not touched — so the boundary Checkpoint B will audit is unchanged by this
phase, but the audit itself is still owed.

**The packaged E2E is the acceptance criteria, executed literally:** a
disposable Node listener was spawned, `File → Port…` was clicked in the real
native menu of `release/win-unpacked/GitDeck.exe`, the modal listed the
listener among the machine's real processes, the row was filtered by port,
selected, confirmed ("Terminate 1 process"), the per-target feedback read
`Terminated: node (PID …)`, the refreshed list no longer contained the binding,
and a new server then bound the same port. After closing, no inspector
PowerShell process survived under the app's PID.

**How termination is proven, not assumed.** One terminate call performs three
inspections: the one that minted the snapshot, a revalidation immediately
before `taskkill` (same start time, still owns a snapshotted binding — PID
reuse and port handoff both classify as stale and are never killed), and a
verification afterwards. A target is reported terminated only when the final
inspection shows its snapshotted bindings gone; `taskkill` exiting 0 is not
success. The real-OS integration suite killed a disposable child this way and
rebound its port, and confirmed exit code 128 maps to "already exited" by
killing the same PID twice.

**Safety floor, each proved by test:** capabilities are opaque ids minted per
snapshot; one snapshot retained, five-minute TTL, invalidated by refresh,
consumed by use; unknown ids, blocked ids, duplicates, extra payload fields
(`pid`, `processName`, `command`, `signal`), non-strings and >50 targets are
rejected before any command starts; PID 0/4, GitDeck itself, other sessions
and unreadable identities are never terminable (and the session rule fails
closed when GitDeck's own session is unknown); the adapter refuses pid ≤ 4
even if handed one; a source scan bans `/IM`, `/T`, wildcards, `/S`, `runas`
and any second kill path from production ports code, with self-checks proving
each pattern classifies.

**Three bugs found while verifying, none by the unit suite first:**

1. **An invisible ANSI escape ate the E2E.** The disposable child printed its
   port with `console.log(number)`; under Playwright the inherited
   `FORCE_COLOR` made Node colourize it (`[33m62197[39m`), the
   digits regex never matched, and the error message *displayed* the port
   perfectly because the terminal rendered the invisible codes. Fixed by
   printing a string (strings are never colourized) and stripping
   `NODE_OPTIONS`/`FORCE_COLOR` from the child's environment.
2. **Escape only worked while focus sat inside the dialog.** After the
   confirm button vanished, focus fell to `body` and the dialog's own keydown
   never fired — caught by the packaged E2E's final step. Escape now listens
   on the window for the modal's lifetime, like `ConfirmDialog` already does.
3. **`localeCompare` is not deterministic across machines.** Binding and row
   ordering now compare code units, so the same snapshot renders in the same
   order on every locale.

**Deferred, deliberately:** no keyboard shortcut for the menu entry; no
periodic auto-refresh (manual Refresh plus the automatic post-kill refresh);
`arm64` untested; the confirmation lists processes but does not diff "what
else this process might be doing" beyond its ports — out of scope by the plan.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and
plans/phase-12-port-management.md.

Implement Phase 12 only: Port Management, including its full Test plan.

Add File → Port… to the native Electron application menu. It opens one modal
showing local TCP listeners and bound UDP endpoints grouped by owning process.
Support filter, refresh, process-level multi-select, explicit confirmation,
termination and partial-failure feedback.

Main owns inspection and termination. The renderer may submit only an opaque
snapshotId plus targetIds minted by Main — never a PID, process name or command.
Revalidate process start time and owned bindings immediately before forcefully
terminating the exact PID, then refresh to prove the port was released.

Use execFile with fixed Windows PowerShell/taskkill arguments. Do not expose
ipcRenderer, child_process, generic exec, generic kill, /IM, /T, wildcards,
remote targeting or privilege elevation.

Do not modify terminal engine, workspace persistence, Git behavior or settings.

At completion report: implemented, files changed, tests added/run,
real TCP/UDP and packaged-app results, safety cases, known limitations,
explicitly deferred items.
```
