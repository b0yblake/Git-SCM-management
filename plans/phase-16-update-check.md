# Phase 16 — Update Check

| | |
|---|---|
| **Purpose** | On startup, notice that a newer GitDeck exists on GitHub Releases and tell the user with a dismissible prompt — check → notify → open the release page. No silent download, no self-installation. |
| **Depends on** | Phase 15 (safe-upgrade guarantee), a published GitHub Release to check against |
| **Unlocks** | Users on v0.1.0 discover v0.2.0 without watching the repository |
| **Status** | ☑ Complete — implemented and verified 2026-09-01 (see Verification) |

---

## Why this phase is separate

This is the first feature that makes a network request to something other
than the user's own machine. The README promises "no analytics, no
telemetry"; an update check is an outbound HTTPS call and must be designed so
that promise survives it: one anonymous GET, disclosed in the README,
disable-able in Settings, and never blocking startup.

Phase 11 excluded auto-update from packaging on purpose. This phase promotes
only the **notification** half of that exclusion. The silent
download-and-install half stays in `BACKLOG.md`, blocked on code signing: an
unsigned binary that replaces itself is indistinguishable from malware to
both SmartScreen and a reasonable user, and every silent update would
re-trigger the SmartScreen warning anyway. Notify-and-link is the honest
ceiling for an unsigned app.

---

## Scope boundary — read first

**In:** startup check in Main against the GitHub Releases API (throttled to
once per 24h), strict semver comparison, a dismissible renderer banner with
**View release / Skip this version / Later**, a `Check for updates` action in
Settings that reports its result inline, two new settings fields, README
privacy disclosure.

**Out:** downloading anything, running any installer, `electron-updater`,
delta updates, prerelease/beta channels, release-notes rendering (the release
page shows them), checking any host other than `api.github.com`, retrying in
the background, a menu-bar badge.

---

## User flow

```text
App starts
   ↓
checkForUpdatesOnStartup off? → do nothing            (status: disabled)
last automatic check < 24h ago? → do nothing          (throttled)
   ↓
Main GETs the latest release (5s timeout, ≤256KB)
   ↓ offline / rate-limited / malformed → log debug, stay silent
latest version ≤ current, or = skippedUpdateVersion → stay silent
   ↓
Main pushes `updates:available` to the renderer
   ↓
Banner: “GitDeck 0.2.0 is available”
   [View release]        → Main opens the release page in the browser
   [Skip this version]   → never mention 0.2.0 again (persisted)
   [Later]               → dismiss; next eligible startup may re-notify
```

The banner is a notification, not a modal: it must not steal focus from a
terminal, and startup must render the full app whether the check is pending,
failed or disabled. Manual `Check for updates` in Settings bypasses the
throttle and **does** surface failure and up-to-date results — silence is
only for the automatic path.

---

## Data contract

```ts
export interface UpdateInfo {
  /** Validated semver, no leading v — e.g. "0.2.0". */
  readonly version: string
  /** Minted by Main from the validated tag; the renderer never supplies URLs. */
  readonly releaseUrl: string
  readonly publishedAt: number
}

export type UpdateCheckStatus = 'up-to-date' | 'update-available' | 'check-failed' | 'disabled'

export interface UpdateCheckResult {
  readonly status: UpdateCheckStatus
  readonly currentVersion: string
  readonly latest: UpdateInfo | null
}
```

Settings additions — deliberately shaped as **additions, not a migration**
(policy rule 2 from Phase 15; the store stays at v1):

```ts
/** Phase 16. One anonymous GET to GitHub Releases per day, at most. */
readonly checkForUpdatesOnStartup: boolean        // default true
/** Phase 16. Version the user chose to skip; cleared by a newer release. */
readonly skippedUpdateVersion: string | null      // default null
```

`lastUpdateCheckAt` is bookkeeping, not a preference: it lives in
`storage.json` (Phase 14), not in settings.

---

## Main-process design

An independent feature, mirroring the ports layout:

```text
src/main/features/updates/
├── domain/          UpdateInfo.ts · ReleaseClient.ts · errors.ts
├── application/     UpdateService.ts        (compare, throttle, skip logic)
├── infrastructure/  GitHubReleaseClient.ts  (the only fetch in the app)
├── ipc/             updatesIpc.ts
├── testing/         FakeReleaseClient.ts
└── public.ts
```

### Network rules — Main enforces every one

1. Exactly one request per check:
   `GET https://api.github.com/repos/b0yblake/Git-SCM-management/releases/latest`
   with `Accept: application/vnd.github+json`. The URL is a constant; nothing
   from the renderer, settings or the response is interpolated into it.
2. HTTPS only, 5-second timeout, response bounded at 256KB, redirects
   followed only within `api.github.com` and `github.com`.
3. No authentication token, no cookies, no user identifier in any header.
4. Drafts and prereleases are ignored (`/releases/latest` excludes them by
   contract; the parser re-checks the flags anyway).
5. The tag must match `v<major>.<minor>.<patch>` exactly; anything else is a
   malformed response, logged at debug, reported `check-failed`.
6. Comparison is numeric on the three components — no string compare, no
   ranges, no prerelease semantics.
7. `releaseUrl` is minted by Main as
   `https://github.com/b0yblake/Git-SCM-management/releases/tag/v<version>`
   from the validated version. `shell.openExternal` receives only this minted
   value; there is deliberately no IPC that opens a renderer-supplied URL.
8. A failed automatic check schedules nothing: no retry loop, no backoff
   timer. The next eligible startup tries again.

---

## IPC and preload contract

```ts
updates: {
  check: 'updates:check',            // renderer → Main, manual check
  openRelease: 'updates:open-release', // renderer → Main, no payload beyond intent
  available: 'updates:available'     // Main → renderer, UpdateCheckResult
}
```

```ts
interface UpdatesApi {
  check(): Promise<Result<UpdateCheckResult, IpcError>>
  openRelease(): Promise<Result<void, IpcError>>
  onAvailable(callback: (result: UpdateCheckResult) => void): Unsubscribe
}
```

`openRelease` takes **no URL** — Main opens the one it minted for the result
it last produced. `window.gitdeck.updates` exposes exactly these three
members. Skipping a version goes through the existing settings patch API, not
a new channel.

---

## Renderer contract

`src/renderer/src/features/updates/` with a store/hook and an
`UpdateBanner` mounted from `App.tsx` via `public.ts`:

- renders only for `update-available`, naming both versions;
- **View release** → `updates.openRelease()`; **Skip this version** →
  settings patch `{ skippedUpdateVersion }`; **Later** → local dismiss;
- keyboard reachable, `role="status"` (not a dialog — it must not trap
  focus), dismissible with Escape while focused;
- Settings screen gains the `checkForUpdatesOnStartup` toggle and a
  `Check for updates` button with inline `up-to-date` / `check-failed` /
  `update-available` feedback.

Presentational components never call `window.gitdeck` directly (existing
rule); the hook owns IPC and subscription cleanup.

---

## Tasks

- [x] Shared `updates` contracts + settings field additions with defaults.
- [x] `GitHubReleaseClient` with the eight network rules and stable errors.
- [x] `UpdateService`: throttle via manifest `lastUpdateCheckAt`, skip-version
      logic, strict semver compare, result minting.
- [x] Startup wiring in `container.ts`/`index.ts`: fire after the window is
      ready, never await before first paint.
- [x] Typed IPC + preload namespace, `fakeGitDeckApi` extension, intentional
      IPC snapshot update.
- [x] `UpdateBanner`, hook/store, Settings toggle + manual check.
- [x] README privacy bullet: what is sent, to whom, how often, how to turn it
      off. `BACKLOG.md`: add “Silent auto-update” with the code-signing
      blocker.
- [x] Test plan below, green.

---

## Files expected to change

```text
plans/ARCHITECTURE.md
plans/BACKLOG.md
README.md
src/shared/contracts/{updates,settings,ipc,events}.ts
src/shared/contracts/{ipc,ipc.snapshot}.spec.ts
src/main/features/updates/**                        (new feature)
src/main/features/settings/domain/AppSettings.ts    (two defaulted fields)
src/main/bootstrap/{container,registerIpc,storageManifest}.ts
src/main/index.ts
src/preload/{api,updatesApi,index,types.d}.ts
src/renderer/src/features/updates/**                (new feature)
src/renderer/src/features/settings/**               (toggle + manual check)
src/renderer/src/testing/fakeGitDeckApi.ts
src/renderer/src/app/App.tsx
src/renderer/src/shared/styles/global.css
```

**Expected to NOT change:** terminal engine, workspace persistence, Git,
ports, both store schema versions.

---

## Test plan

> Conventions: `TESTING.md`. The service and renderer suites use
> `FakeReleaseClient`; only the client integration suite may talk to the real
> API and it must tolerate offline CI (skip, not fail).

| Test file | Covers |
|---|---|
| `src/main/features/updates/infrastructure/GitHubReleaseClient.spec.ts` | request shape, parsing, bounds, malformed responses — no network |
| `src/main/features/updates/application/UpdateService.spec.ts` | compare, throttle, skip, disabled, failure silence |
| `src/main/features/updates/ipc/updatesIpc.spec.ts` | validation, no-URL openRelease, error translation |
| `src/preload/updatesApi.spec.ts` | bridge shape, `onAvailable` cleanup |
| `src/renderer/src/features/updates/components/UpdateBanner.spec.tsx` | render states, actions, accessibility |
| `src/main/features/settings/**` (existing suites) | new fields default correctly from a v0.1.0-shaped file |

### Version comparison and gating

- [x] `0.2.0 > 0.1.0`, `0.1.1 > 0.1.0`, `1.0.0 > 0.9.9`; equal is
      `up-to-date`; older is `up-to-date` (never “downgrade available”).
- [x] `0.10.0 > 0.9.0` — numeric, not lexicographic.
- [x] Tag without `v` prefix, with suffix, or non-numeric → `check-failed`.
- [x] `skippedUpdateVersion` suppresses exactly that version; a newer release
      notifies again and clears the skip on next settings write.
- [x] `checkForUpdatesOnStartup: false` → zero client calls, `disabled`.
- [x] Automatic check inside 24h of `lastUpdateCheckAt` → zero client calls.
- [x] Manual check ignores the throttle and updates `lastUpdateCheckAt`.

### Network safety — critical

- [x] The client requests exactly the constant URL with the pinned Accept
      header; no test can make it request anything else.
- [x] No Authorization, cookie or user-identifying header is ever set.
- [x] Timeout aborts the request and yields `check-failed`.
- [x] A body over 256KB is abandoned and yields `check-failed`.
- [x] Draft/prerelease flagged responses yield `up-to-date`, not a notify.
- [x] `releaseUrl` is minted from the validated version; a crafted
      `html_url` in the response is ignored.
- [x] `openRelease` opens only the minted URL; the IPC payload carries no
      URL and extra fields are rejected.
- [x] A failed automatic check schedules no retry and shows no UI.

### Startup behavior

- [x] The check runs after window-ready and never delays first paint
      (asserted by wiring order, not timing).
- [x] Offline startup renders the full app with no banner and one debug log.
- [x] `update-available` pushes exactly one `updates:available` event.

### Banner and settings UI

- [x] Banner appears only for `update-available` and names both versions.
- [x] View release calls `openRelease` exactly once.
- [x] Skip persists the version through the settings patch API and hides the
      banner.
- [x] Later hides the banner without persisting anything.
- [x] The banner never steals focus from the active terminal; Escape
      dismisses it while focused.
- [x] Settings toggle round-trips; manual check renders all three outcomes.
- [x] A v0.1.0-shaped settings file (fixture) loads with the two new fields
      at their defaults — proving the Phase 15 addition rule.

### Regression and boundary

- [x] Terminal, workspace, Git, ports suites pass unchanged.
- [x] Store schemas remain v1.
- [x] Repository scan: no `fetch`/`net.request` outside
      `GitHubReleaseClient.ts`; no `shell.openExternal` outside the updates
      IPC layer; no raw `'updates:'` channel outside `shared/contracts/ipc.ts`.

---

## Acceptance criteria

```text
1. Fresh v0.1.0 install, v0.2.0 published → next launch shows the banner
   within seconds, terminals usable throughout.
2. View release lands on the GitHub v0.2.0 release page in the browser.
3. Skip this version → relaunch → no banner. Publish v0.3.0 → banner.
4. Toggle the check off → relaunch offline or online → no request, no banner.
5. Manual Check for updates while offline → inline "couldn't check" message,
   nothing else changes.
```

---

## Definition of Done

- Startup is never blocked or delayed by the check; failures are silent.
- One anonymous, bounded, pinned-host request per check; at most one
  automatic check per day; off switch works.
- Nothing is downloaded or executed; the only outward action is opening the
  minted release URL in the default browser.
- README discloses the check; BACKLOG records the silent-auto-update blocker.
- Settings additions load from v0.1.0 files without a migration.
- Every box in the Test plan is ticked.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.

---

## Known implementation risks to verify

- GitHub rate-limits unauthenticated calls per source IP (60/h): corporate
  NAT can exhaust it → `check-failed` must be genuinely silent or the app
  becomes noisy on office networks.
- `releases/latest` returns 404 when a repository has no full release —
  handle as `check-failed`, not a crash, or v0.1.0 users error before v0.2.0
  exists.
- TLS-intercepting proxies (already seen on this project's build machine)
  make `check-failed` a *common* outcome, reinforcing the silence rule.
- Electron's `net` module vs Node `fetch` differ on proxy handling; prefer
  Electron `net` so system proxy settings are honored.
- The banner must not fight the update-skip logic across multiple windows if
  a second window ever ships — scope the event to the focused window now.

---

## Verification — 2026-09-01

```text
npm run typecheck   pass
npm run lint        pass
npm test            905 tests / 72 files (was 812 / 60 before Phases 14–16)
npm run build       pass
Smoke run           registerIpc lists the updates namespace; the startup check
                    hit the real API, got 404 (no release published yet) and
                    logged one debug line — the app was otherwise untouched,
                    exactly the silence this plan demands. storage.json gained
                    lastUpdateCheckAt.
```

The 404-before-first-release risk from the risk list happened on the very
first real run and was handled as specced.

**Deviations, recorded.**

1. **The client uses the global `fetch` (undici), not Electron's `net`** — an
   injected `fetchFn` keeps it unit-testable in the node project. The risk
   list's proxy caveat therefore stands: system proxy settings are not
   honored, which on proxied networks makes `check-failed` more common — and
   silent, by design. Revisit if that proves too lossy.
2. **The manual check reports a skipped version** (`checkNow` ignores
   `skippedUpdateVersion`): the user explicitly asked, so hiding it would
   read as broken. The startup path still suppresses it.
3. **No packaged E2E**: the TESTING.md rule requires one for phases that
   spawn, kill or bind OS resources; a bounded outbound GET against a service
   that answers 404 until a release exists is not usefully E2E-testable yet.
   Owed alongside the first real release if wanted.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and
plans/phase-16-update-check.md.

Implement Phase 16 only: the startup update check, including its full Test
plan.

Create the Main-side updates feature (domain/application/infrastructure/ipc/
testing/public.ts). GitHubReleaseClient makes exactly one bounded,
anonymous, pinned-URL GET to the GitHub releases/latest API with a 5s
timeout; UpdateService applies the 24h throttle via storage.json, strict
numeric semver comparison and skippedUpdateVersion. Push updates:available
to the renderer after window-ready. Renderer shows a dismissible, focus-safe
banner with View release / Skip this version / Later; Settings gains the
toggle and a manual check. openRelease accepts no URL — Main opens only the
URL it minted from the validated tag. Add checkForUpdatesOnStartup and
skippedUpdateVersion as defaulted settings additions (no schema bump).
Document the privacy disclosure in README.md and the silent-auto-update
blocker in BACKLOG.md.

Download or execute nothing. Never block startup on the network.

At completion report: implemented · files changed · tests · known
limitations · explicitly deferred.
```
