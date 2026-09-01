# Phase 0 — Project Foundation

| | |
|---|---|
| **Purpose** | Stand up a runnable, strictly-typed Electron shell whose layer boundaries are enforced by tooling — **before** any product feature exists. |
| **Depends on** | nothing |
| **Unlocks** | every later phase |
| **Status** | ☑ Done 2026-08-27 — all checks green |

---

## Why this phase is separate

Everything after this assumes strict TypeScript, path aliases, a secure preload, and a test runner already work. Mixing scaffolding with feature work makes both harder to review. This phase ships **zero product behavior on purpose**.

---

## Scope

**In:** toolchain, folder skeleton, security defaults, preload bridge placeholder, logger, DI container, CI script.

**Out:** node-pty behavior, terminals, Git, workspaces, persistence, UI beyond an empty window.

---

## Tasks

- [x] Scaffold Electron + React + TypeScript project.
- [x] Configure ESLint.
- [x] Configure Prettier.
- [x] Configure TypeScript strict mode.
- [x] Configure path aliases.
- [x] Create the folder architecture from `ARCHITECTURE.md` §3.
- [x] Add Zustand.
- [x] Add xterm.js.
- [x] Add node-pty.
- [x] Configure Electron native dependency rebuild.
- [x] Configure Vitest.
- [x] Add basic logger (`ARCHITECTURE.md` §10).
- [x] Configure preload/contextBridge (`ARCHITECTURE.md` §11).
- [x] Add typed `window.gitdeck` declaration (empty namespaces are fine).
- [x] Create application bootstrap/container.
- [x] Add CI typecheck/test script.

---

## Files expected to exist at the end

```text
package.json · tsconfig.json · .eslintrc · .prettierrc · vitest.config.ts
src/shared/domain/{errors,ids,result}.ts
src/shared/contracts/{ipc,events}.ts
src/main/bootstrap/{createWindow,registerIpc,container}.ts
src/main/index.ts
src/preload/{index.ts,types.d.ts}
src/renderer/src/{main.tsx,app/App.tsx}
```

Feature folders may be created empty with a placeholder `public.ts`.

---

## Test plan

> Conventions: `TESTING.md`. This phase has almost no logic — its real job is to prove the **harness itself works** and to establish the layout every later phase follows.

| Test file | Covers |
|---|---|
| `src/shared/domain/result.spec.ts` | `Ok`/`Err` helpers |
| `src/shared/domain/ids.spec.ts` | id generation |
| `src/main/bootstrap/logger.spec.ts` | logger contract |
| `src/main/testing/FakeLogger.ts` | double (no `it()`) |

**Cases**

- [x] `result`: `Ok(v)` is recognised as ok and carries `v`; `Err(e)` is not ok and carries `e`.
- [x] `ids`: 1000 generated ids are all unique.
- [x] `ids`: generated id matches the documented format.
- [x] `logger`: each of `debug`/`info`/`warn`/`error` reaches the sink with its level.
- [x] `logger`: `meta` is serialized without throwing on a circular object.
- [x] `logger`: **an object containing `process.env`-shaped keys is not logged verbatim** (`ARCHITECTURE.md` §10).
- [x] `FakeLogger` captures entries and can be asserted on — used by every later phase.

**Harness verification**

- [x] A test placed under `src/main/**` runs in the **node** environment.
- [x] A test placed under `src/renderer/**` runs in the **jsdom** environment.
- [x] `npm test` discovers both projects in one run.

**Manual (record the result — cannot be unit-tested)**

- [x] DevTools: `window.require`, `process`, `Buffer` are all `undefined` in the renderer.
- [x] `window.gitdeck` exists and is typed.

---

## Verification — 2026-08-25

**Green**

```text
npm run typecheck   both projects, TS strict + noUncheckedIndexedAccess
npm run lint        32 files, 0 problems
npm test            31 tests, 5 files — |main| 29, |renderer| 2
npm run build       out/main/index.js · out/preload/index.cjs · out/renderer/
```

Boundary lint rules were verified by planting three deliberate violations
(`shared/ → electron`, `renderer/ → electron`, `domain/ → node-pty`); all three
were reported, and the probe files were removed. A rule that matches nothing is
worse than no rule, so this check should be repeated whenever the globs change.

**Runtime verified — 2026-08-27**

`github.com` is unreachable from this machine, so the Electron binary was
downloaded manually and dropped into the `@electron/get` cache. Recorded here
because it will recur on every clean machine:

```text
url    https://github.com/electron/electron/releases/download/v44.0.0/electron-v44.0.0-win32-x64.zip
dest   %LOCALAPPDATA%\electron\Cache\<sha256 of the release dir url>\electron-v44.0.0-win32-x64.zip
then   node node_modules/electron/install.js
```

The cache folder name is `sha256(url with pathname=dirname, no query/hash)` —
computed by `Cache.getCacheDirectory` in `@electron/get`. A manually placed zip
is still checksum-verified against the bundled `electron/checksums.json`
(`@electron/get/dist/index.js:131`), so the file's origin does not have to be
trusted. Expected: `e61aa3bc…42f9`.

`npm run dev` then starts, the window opens, and the main process logs:

```text
[debug] registerIpc: no feature handlers registered yet
[info] app ready
```

Smoke check against the **built** output (see below) reports:

```json
{ "gitdeck": "object",
  "keys": ["git", "settings", "terminal", "workspace"],
  "require": "undefined", "process": "undefined", "Buffer": "undefined" }
```

**Two environment traps worth remembering**

1. `ELECTRON_RUN_AS_NODE=1` is set inside the VS Code / Claude Code terminal
   (that process is itself an Electron app). Any Electron launched from there
   runs as plain Node and never opens a window — `electron --version` prints the
   bundled Node version instead. Clear it before launching: `env -u
   ELECTRON_RUN_AS_NODE …`. A normal terminal is unaffected.
2. An Electron main process on Windows has **no console attached** when launched
   from a non-interactive shell, so `console.log` output vanishes. Any
   verification script must write its result to a file.

**Resolved: node-pty needs no rebuild**

`node-pty@1.1.0` ships prebuilt binaries and links against **N-API**
(`node-addon-api`), confirmed by inspecting `prebuilds/win32-x64/pty.node`:
`napi_*` symbols present, no `v8::`/`node::ObjectWrap` symbols. N-API is ABI
stable across both Node and Electron, so no `electron-rebuild` step is required
for it. `@electron/rebuild` and `npm run rebuild` are kept as an escape hatch
for a future non-N-API native dependency, deliberately **not** wired into
`postinstall` so a missing toolchain cannot break `npm install`.

Phase 11 must still confirm the prebuild is present inside the packaged app.

---

## Runtime smoke check

Verifies the security baseline against the **built** output rather than the dev
server. Save as `smoke.mjs` outside `src/`, run `npm run build`, then
`npx electron smoke.mjs`.

Note the `.then()` — a **static** `import ... from 'electron'` combined with a
top-level `await app.whenReady()` hung indefinitely here. `src/main/index.ts`
already uses `.then()`, so this constraint only affects standalone scripts.

```js
import { appendFileSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'

const ROOT = import.meta.dirname
const log = (m) => appendFileSync(`${ROOT}/smoke.log`, m + '\n')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: `${ROOT}/out/preload/index.cjs`,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  await win.loadFile(`${ROOT}/out/renderer/index.html`)

  const r = await win.webContents.executeJavaScript(`JSON.stringify({
    require: typeof window.require,
    process: typeof window.process,
    Buffer: typeof window.Buffer,
    ipcRenderer: typeof window.ipcRenderer,
    gitdeck: typeof window.gitdeck,
    namespaces: Object.keys(window.gitdeck ?? {}).sort()
  })`)

  const report = JSON.parse(r)
  const ok =
    report.require === 'undefined' &&
    report.process === 'undefined' &&
    report.Buffer === 'undefined' &&
    report.ipcRenderer === 'undefined' &&
    report.gitdeck === 'object' &&
    report.namespaces.join() === 'git,settings,terminal,workspace'

  log(r)
  log(ok ? 'PASS' : 'FAIL')
  app.exit(ok ? 0 : 1)
})
```

---

## Acceptance criteria

```bash
npm run dev        # opens the Electron window
npm run typecheck  # passes
npm run lint       # passes
npm test           # passes
```

Renderer has **no Node.js globals** available — verify `window.require`, `process`, and `Buffer` are all `undefined` in DevTools.

---

## Definition of Done

- No terminal feature exists yet.
- No Git or workspace logic added.
- `window.gitdeck` exists and is typed, even if every namespace is empty.
- **Every box in the Test plan is ticked and `npm test` is green.**

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and plans/phase-00-foundation.md.

Implement Phase 0 only, including its Test plan.

Scaffold and normalize the Electron + React + TypeScript architecture.
Create the directory boundaries described in ARCHITECTURE.md §3.
Configure TypeScript strict mode, ESLint, Prettier and Vitest.
Create the secure preload skeleton and typed window.gitdeck placeholder.

Do not implement node-pty terminal behavior yet.
Do not implement Git.
Do not implement workspace persistence.

At completion report: implemented, files changed, tests added/run,
known limitations, explicitly deferred items.
```
