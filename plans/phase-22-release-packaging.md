# Phase 22 — Release Packaging

| | |
|---|---|
| **Purpose** | One pushed tag produces the complete GitHub Release: a checksums file, the Windows x64 **EXE** installer, a Windows x64 **MSI** installer, GitHub's own source archives, a SHA-256 digest beside every asset, and a **release attestation** — the asset set a GitHub Desktop release shows, minus the macOS and Squirrel-delta rows GitDeck does not have. |
| **Depends on** | Phase 11 (NSIS installer), Phase 16 (its tag contract), Phase 18 (its uninstaller contract decides the MSI flavour) |
| **Unlocks** | Releases as a build output instead of a hand-upload; `gh release verify` for users |
| **Status** | ◐ Built and verified here 2026-09-03; the repository setting and the first tagged run are outstanding (see Verification) |

---

## Why this phase is separate

The two releases that exist today (`v0.2`, `v0.3`) were cut by hand, and it
shows in three ways that no feature phase would ever catch:

1. **The tags break the app's own update check.** Phase 16 accepts only
   `v<major>.<minor>.<patch>`; `v0.3` is "malformed" to the shipped
   GitDeck, so the startup check has reported `check-failed` (silently, as
   designed) against the project's own releases since the first one.
2. **The file name is not ours.** `GitDeck Setup 0.3.0.exe` was uploaded and
   GitHub stored it as `GitDeck.Setup.0.3.0.exe` — spaces are rewritten.
3. **Nothing verifies the upload.** No checksums, no attestation, and no
   check that the binary carries the version the tag claims (the E2E suite
   checks that locally, but it is not in `npm run ci` — see Phase 21).

Packaging is a release concern, so this is a packaging phase: build
configuration, one script, one workflow, one repository setting. No
application code changes.

---

## Who produces what — read first

Only the first three rows are work. The rest is GitHub, provided we give it
what it needs (a real tag, and one repository setting).

| Row on the release page | Produced by | This phase |
|---|---|---|
| `GitDeck <v> checksums` | `scripts/checksums.mjs` (new) | write it; run it at the end of `npm run package` |
| `GitDeck <v> Windows x64 EXE Installer` | electron-builder `nsis` (Phase 11) | rename the artifact: `GitDeck-Setup-<v>-x64.exe` |
| `GitDeck <v> Windows x64 MSI Installer` | electron-builder `msiWrapped` (new) | add the target |
| `sha256:…` beside each asset | GitHub, automatically | nothing — the API already returns `digest` for `v0.3`'s asset |
| `Source code (zip)` / `(tar.gz)` | GitHub, from the tag | nothing — the release must be created from an existing tag (`--verify-tag`) |
| `Release attestation (json)` | GitHub, when **Immutable releases** is on | one-time repository setting, not code |

The display names in the first column are GitHub asset **labels**
(`file#Label` in `gh release upload`), not file names — exactly how GitHub
Desktop gets "Windows x64 EXE Installer" over `GitHubDesktopSetup-x64.exe`.

---

## Scope boundary

**In:** `artifactName` without spaces; `msiWrapped` target; checksums
script; `.github/workflows/release.yml` triggered by `v*.*.*` tags that
gates on `npm run ci` → `npm run package` → `npm run test:e2e`, then creates
a **draft** release, uploads the three labelled assets, and publishes;
tag-equals-`package.json`-version guard; one packaged E2E spec for the
artifacts; README install/verify/cutting-a-release text; the immutable
releases setting.

**Out:** code signing (still the SmartScreen blocker, `BACKLOG.md`);
`electron-updater` and its `latest.yml`/`.blockmap` (produced, never
uploaded — Phase 16 links to the release page on purpose); build-provenance
attestations via `actions/attest-build-provenance` (a different artefact —
SLSA provenance for the binaries — and four lines to add later if wanted);
arm64, macOS, Linux; a CI workflow on pull requests; Squirrel delta
packages (the `.nupkg` rows in GitHub Desktop's list do not apply to NSIS);
caching electron-builder's downloads in Actions.

---

## Decisions

### 1. MSI = `msiWrapped`, not the native `msi` target

electron-builder offers two. **`msiWrapped`** embeds the NSIS `.exe` in an
MSI and runs it (`/S`, silent) as the invoking user. **`msi`** builds a real
WiX product from `win-unpacked`.

Wrapped wins on the two contracts this repository already has:

- **One install lineage.** Whether a machine got the EXE or the MSI, the
  installed thing is the Phase 11 NSIS install: same directory
  (`%LOCALAPPDATA%\Programs\GitDeck`), same *Installed apps* entry, same
  upgrade path when the next version arrives either way. A native MSI is a
  second product beside an EXE install of the same app.
- **Phase 18's uninstaller contract holds.** `build/installer.nsh` deletes
  the HKCU Explorer context-menu keys on uninstall, and Phase 18 says the
  uninstaller *must*. The native `msi` target cannot include that script,
  and electron-builder's WiX template has no extension point for a
  `RemoveRegistryKey` — a native-MSI uninstall would leave a dead
  "Open in GitDeck" entry in every folder's context menu.

The cost, written down so nobody is surprised: the wrapped MSI is
deliberately **not registered as an installed product** (its only feature is
level 0), so `msiexec /x` is a no-op — uninstall goes through the NSIS entry
in *Installed apps* like the EXE. It is an MSI for *deployment* (`msiexec /i
GitDeck-Setup-<v>-x64.msi /qn`, Intune, GPO), not for inventory. If an
administrator ever needs a registered ProductCode, switch to the native
target — and re-solve the Phase 18 cleanup first.

`impersonate: true` is required: the custom action runs deferred, and
without impersonation an elevated `msiexec` would run the *per-user* NSIS
installer as SYSTEM, installing GitDeck into SYSTEM's profile.

### 2. Publish with `gh release`, not electron-builder's `publish: github`

electron-builder can upload to GitHub itself, but it cannot set asset
labels, it uploads `latest.yml` and `.blockmap` (auto-update files this app
does not consume), and it does not give us the draft → upload → publish
order that immutable releases require. `gh` is preinstalled on
`windows-latest` and needs only the workflow's own `GITHUB_TOKEN`.

### 3. Draft first, publish last

With immutable releases on, publishing locks the tag and the asset list.
The workflow creates the release as a draft, uploads everything in the same
command, and flips it to published only when all three files are attached.

### 4. The tag is the version, enforced

The workflow fails before touching the release if `GITHUB_REF_NAME` is not
exactly `v${package.json version}`. The E2E suite already proves the built
binary's `FileVersion` equals `package.json`; together they make
"tag ≠ binary" impossible rather than merely unlikely.

### 5. The packaged E2E suite is a release gate again

`npm run test:e2e` runs in the workflow after `npm run package`, on the
hosted Windows runner (it has an interactive desktop, which Electron under
Playwright needs). It rotted for three releases precisely because nothing
ran it; the workflow is where it belongs. **If it proves unrunnable on the
runner, remove the step and say so in this file — never
`continue-on-error`.**

### 6. Still unsigned

An attestation says *GitHub built and published these exact bytes from this
tag*; it is not Authenticode. SmartScreen behaves exactly as before. The
README keeps its warning.

---

## Design

### `electron-builder.yml`

```yaml
win:
  # No spaces: GitHub rewrites them to dots on upload, and every script
  # downstream (checksums, gh upload, README) wants one stable name.
  # x64 is literal because Phase 11 is x64-only; ${arch} would be ''
  # if a target ever ran without an explicit arch.
  artifactName: ${productName}-Setup-${version}-x64.${ext}
  target:
    - target: nsis          # must stay first — msiWrapped consumes its .exe
      arch: [x64]
    - target: msiWrapped
      arch: [x64]
  icon: build/icon.ico

msiWrapped:
  # The MSI is a deployment wrapper around the NSIS installer (Decision 1).
  wrappedInstallerArgs: /S
  impersonate: true
```

`msiWrapped` looks up the NSIS output through the same merged options, so
the single `win.artifactName` keeps both names aligned:
`GitDeck-Setup-0.5.0-x64.exe` and `GitDeck-Setup-0.5.0-x64.msi`.

### `scripts/checksums.mjs`

Node only, no dependencies, `sha256sum -c`-compatible output:

```text
<64 hex>  GitDeck-Setup-<v>-x64.exe
<64 hex>  GitDeck-Setup-<v>-x64.msi
```

Reads `version` from `package.json`, requires **both** installers to exist
under `release/` (a missing one is an error, not a shorter file), writes
`release/GitDeck-<v>-checksums.txt`. Wired as the last step of
`npm run package` so a maintainer's local build has the same three files
the workflow uploads.

### `.github/workflows/release.yml`

```yaml
name: Release
on:
  push:
    tags: ['v[0-9]+.[0-9]+.[0-9]+']
permissions:
  contents: write
jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - name: Tag must equal package.json version
        shell: bash
        run: |
          want="v$(node -p "require('./package.json').version")"
          [ "$GITHUB_REF_NAME" = "$want" ] || { echo "tag $GITHUB_REF_NAME != $want"; exit 1; }
      - run: npm ci
      - run: npm run ci
      - run: npm run package        # build → nsis → msiWrapped → checksums
      - run: npm run test:e2e
      - name: Draft, upload, publish
        shell: bash
        env: { GH_TOKEN: ${{ github.token }} }
        run: |
          v="${GITHUB_REF_NAME#v}"
          gh release create "$GITHUB_REF_NAME" --draft --verify-tag --generate-notes \
            --title "GitDeck $v" \
            "release/GitDeck-$v-checksums.txt#GitDeck $v checksums" \
            "release/GitDeck-Setup-$v-x64.exe#GitDeck $v Windows x64 EXE Installer" \
            "release/GitDeck-Setup-$v-x64.msi#GitDeck $v Windows x64 MSI Installer"
          gh release edit "$GITHUB_REF_NAME" --draft=false
```

Nothing else is uploaded: not `latest.yml`, not `.blockmap`, not
`builder-debug.yml`, not `win-unpacked`.

### Repository setting (manual, once)

*Settings → General → Releases → Immutable releases* (confirm the exact
label in the UI; the docs page moved while this plan was written). From then
on every published release gets the `Release attestation (json)` row and
`gh release verify vX.Y.Z -R b0yblake/Git-SCM-management` succeeds.
Releases published before the switch stay as they are.

### Cutting a release (the whole procedure)

```text
1. Bump "version" in package.json; update the README badge.
2. Append tests/fixtures/storage/vX.Y.Z/ and add the version to
   PUBLISHED_RELEASES in storageCompat.integration.spec.ts. Commit.
   (Added by Checkpoint C: 0.2.0 and 0.3.0 shipped without one, which
   quietly narrowed the "old data always loads" proof to a single release.)
3. git tag vX.Y.Z && git push origin main vX.Y.Z
4. Watch the Release workflow. Green = published. Red = nothing published,
   fix, and use the NEXT patch number — an immutable tag cannot be reused.
```

---

## Tasks

- [x] `electron-builder.yml`: `win.artifactName`, `msiWrapped` target after
      `nsis`, `msiWrapped` options (Decision 1).
- [x] `scripts/checksums.mjs`; `package.json` `package` script runs it last.
- [x] `.github/workflows/release.yml` as designed.
- [x] `tests/e2e/release-assets.spec.ts` (Test plan).
- [x] README: file names in **Install**, an MSI line for scripted installs,
      a **Verify a download** block (`Get-FileHash` against the checksums
      asset; `gh release verify-asset`), and the three-step release
      procedure for maintainers.
- [ ] Enable immutable releases on the repository; record the date here.
      **Owed — a repository setting, not something the build can do.**
- [x] Local dry run: `npm run package` then `npm run test:e2e` on this
      machine (needs `NODE_EXTRA_CA_CERTS` for the WiX download, see
      Phase 11).
- [ ] Manual install/uninstall of the MSI. **Not run — see Verification.**
- [ ] First tagged release through the workflow; fill in Verification.

---

## Files expected to change

```text
electron-builder.yml
package.json                        ("package" script only)
scripts/checksums.mjs               (new)
.github/workflows/release.yml       (new)
tests/e2e/release-assets.spec.ts    (new)
README.md
plans/README.md                     (status row)
eslint.config.js                    (added during implementation — Deviation 1)
tests/e2e/no-orphans.spec.ts        (added during implementation — Deviation 3)
```

**Expected to NOT change:** anything under `src/`, `build/installer.nsh`,
both store schemas, the Phase 16 client (its tag contract is what this phase
finally honours).

---

## Test plan

> Conventions: `TESTING.md`. This phase touches no OS resource from inside
> the app, so its one packaged spec inspects the build output; the rest is
> the workflow itself and a manual checklist — the same shape as Phase 11.

| Test file | Covers |
|---|---|
| `tests/e2e/release-assets.spec.ts` | the three release files, their names, and the checksums' correctness |
| `.github/workflows/release.yml` | the tag guard and the gate order — exercised by the first real run |
| this document | the manual install and release-page checklist |

**Packaged — `release-assets.spec.ts`** (runs after `npm run package`, like
`packaged-pty.spec.ts`)

- [x] `release/GitDeck-Setup-<version>-x64.exe`,
      `…-x64.msi` and `release/GitDeck-<version>-checksums.txt` exist, with
      `<version>` read from `package.json` — never a literal.
- [x] The checksums file has exactly two lines in
      `/^[0-9a-f]{64}  GitDeck-Setup-.+\.(exe|msi)$/` form, and each hash
      recomputes from the named file.
- [x] The MSI starts with the OLE compound-file magic
      (`D0 CF 11 E0 A1 B1 1A E1`) and is larger than the EXE minus 1 MB —
      proof it embeds the installer rather than an empty product.
- [ ] ~~No file with a space in its name exists under `release/` for the
      current version.~~ **Replaced during implementation** — see Deviation 2.
      In its place: the asset paths written in `release.yml` are parsed and
      must resolve to exactly the three files the build produced, which
      catches name drift between `electron-builder.yml` and the workflow.

**Workflow**

- [x] The tag guard rejects a mismatch: run the same shell snippet locally
      with `GITHUB_REF_NAME=v9.9.9` and confirm exit 1 with the message.
- [ ] First real run: `ci` → `package` → `test:e2e` → release, in that
      order, each green; the run publishes exactly three assets with the
      labels above. **Owed — needs a tag pushed to the repository.**

**Manual — this machine**

- [ ] `msiexec /i release\GitDeck-Setup-<v>-x64.msi /qn` installs to
      `%LOCALAPPDATA%\Programs\GitDeck` for the invoking user and adds one
      *Installed apps* entry (the NSIS one — not two).
- [ ] Launch, open a terminal (the node-pty check still passes through the
      MSI path).
- [ ] Uninstall from *Installed apps*: install directory gone, both Phase 18
      HKCU keys gone (`reg query HKCU\Software\Classes\Directory\shell\GitDeck`
      → not found), no orphaned shells.
- [ ] Installing the EXE over an MSI install (and vice versa) upgrades in
      place — still one entry.

**Manual — release page**

- [ ] Six rows: checksums, EXE, MSI, Source code (zip), Source code
      (tar.gz), Release attestation (json); a `sha256:` digest beside each
      of the first three, matching the checksums file.
- [ ] `gh release verify vX.Y.Z -R b0yblake/Git-SCM-management` passes;
      `gh release verify-asset vX.Y.Z GitDeck-Setup-X.Y.Z-x64.exe` passes on
      a fresh download.
- [ ] A GitDeck of the *previous* version, launched with the check enabled,
      shows the Phase 16 banner for this release — the first time the tag
      format has let it.

---

## Acceptance criteria

```text
1. git push origin vX.Y.Z → within one workflow run the release exists,
   published, with checksums + EXE + MSI (labelled), source archives,
   digests and the attestation. No hand upload.
2. A mismatched tag publishes nothing.
3. Both installers produce the same installed app, and uninstalling either
   leaves no Phase 18 registry keys and no shells behind.
4. A user can verify a download with the checksums file alone, or with
   gh release verify-asset.
```

---

## Definition of Done

- The first tagged release has gone through the workflow end to end and its
  page shows the six rows.
- `npm run package` locally yields the same three files the workflow
  uploads, and `npm run test:e2e` (including the new spec) is green against
  them.
- Immutable releases is enabled; `gh release verify` succeeds on the
  release.
- README documents the file names, the verify steps and the release
  procedure.
- Every box in the Test plan is ticked; `npm run ci` green.

---

## Known implementation risks to verify

- **Playwright + Electron on `windows-latest`.** Expected to work (the
  runner has a desktop session), but the E2E step is the most likely first
  failure. Decision 5 says what to do if it does not.
- **`npm run ci` on the runner** runs the integration specs; they must
  tolerate that machine's shell set (TESTING.md says they do).
- **electron-builder downloads** (Electron, NSIS, WiX) come from GitHub
  releases — fine in Actions; locally this machine needs
  `NODE_EXTRA_CA_CERTS` (Phase 11) and the WiX archive is new to its cache.
- **`msiWrapped` naming.** It resolves the `.exe` through the merged
  `win` + `msiWrapped` options; if a future change sets `nsis.artifactName`
  separately the MSI build will fail with "NSIS executable not found" —
  keep the name on `win.artifactName` only.
- **Immutable releases lock the tag.** A failed run after publish cannot be
  patched; the draft-then-publish order and the pre-release gates exist so
  that the publish step is the last thing that can go wrong.

---

## Verification — 2026-09-03

```text
npm run typecheck   pass
npm run lint        pass
npm test            1013 tests / 86 files   (unchanged — this phase adds no unit tests)
npm run package     release\GitDeck-Setup-0.4.1-x64.exe   114 MB
                    release\GitDeck-Setup-0.4.1-x64.msi   114 MB
                    release\GitDeck-0.4.1-checksums.txt   2 lines
npm run test:e2e    13 passed (was 9), exit 0, against the packaged application
```

Both installers built under the new name on the first run, so nothing
downstream has to guess at a file name any more. The MSI is 114,593,792
bytes against the EXE's 114,434,854 — the wrapper plus the installer it
embeds, which is the shape this design predicts and an empty WiX product
could not fake.

**The MSI was read back out of its own database**, read-only, without
installing it, and it says exactly what Decision 1 claims:

```text
ProductName     GitDeck            ProductVersion  0.4.1.0
Binary          WrappedExe         — the embedded NSIS installer
CustomAction    RunInstaller  type 1026  source WrappedExe  target /S
Feature         EmptyFeature  level 0    — registers no product, by design
```

Type 1026 is a deferred EXE from binary data *without* the no-impersonate
bit, which is `impersonate: true` taking effect: the wrapped per-user
installer will run as the invoking user, not as SYSTEM.

The workflow was parsed as YAML (it is valid, and `GH_TOKEN` survives as an
expression rather than being eaten by a flow mapping), and its tag guard was
extracted from the file and run: `GITHUB_REF_NAME=v9.9.9` exits 1 with
`tag v9.9.9 does not match package.json (v0.4.1)`, the real tag exits 0. The
`gh release create` syntax it depends on — positional `file#Label` assets,
`--verify-tag`, `--draft`, `--generate-notes` — was checked against the CLI
manual rather than assumed.

**Deviations, recorded.**

1. **`eslint.config.js` gained a three-line block.** The flat config declares
   no globals, so `no-undef` fires on `console` in a plain Node script and
   `scripts/` is a file category this repository did not have before. Scoped
   to `scripts/**/*.mjs` on purpose: a stray `console` in shipped code still
   fails.

2. **One Test plan box was replaced, not ticked.** "No file with a space in
   its name exists under `release/`" is redundant with the existence
   assertions — if `artifactName` regressed, the hyphenated file simply would
   not exist — and it is a guaranteed false positive on any working tree that
   still holds hand-built installers, which `release/` does: five of them,
   including `GitDeck Setup 0.4.1.exe` for the current version. The
   replacement parses the asset paths out of `release.yml` and requires them
   to resolve to the three files the build produced, which catches a bug the
   original could not: `electron-builder.yml` and the workflow drifting apart,
   discovered at the one moment nothing can be retried.

3. **`tests/e2e/no-orphans.spec.ts` was fixed.** It failed on the first run —
   three shells "survived" the app's shutdown. They were the user's own
   `npm run dev` and `vite` processes, started 80 minutes before the test.
   Windows recycles process ids and never rewrites the `ParentProcessId` of a
   process whose parent has exited, so a long-lived shell pointed at an id the
   test app had since been given, and the tree walk adopted that shell and
   everything under it. The walk now ignores processes older than the app
   itself; the test went from failing in 43s to passing in 9s. This is
   in scope because Decision 5 installs this suite as a release gate, and a
   gate that fails for reasons of its own is the problem this phase exists to
   remove.

**What is NOT done, and why.**

- **Immutable releases is not enabled.** It is a repository setting, and this
  working copy is not even a git repository — there is no remote to change.
  Until someone enables it there is no `Release attestation (json)` row and
  `gh release verify` has nothing to verify.
- **No tag has been pushed**, so the workflow has never run. Every gate it
  chains has been run by hand here, in the same order, and passes.
- **The MSI was not installed.** Installing it would silently upgrade the
  GitDeck the user is running right now, from a build of the same version.
  That is a change to their machine to prove something the MSI database
  already showed, so it is left for whoever wants it: the manual checklist
  above is unchanged and still owed.

**Environment note.** `npm run package` needs `NODE_EXTRA_CA_CERTS` on this
machine, but not for the reason Phase 11 recorded. There is no TLS
interception today — `objects.githubusercontent.com` serves a genuine Let's
Encrypt chain. The downloads fail because the server omits intermediates,
which Windows fetches via AIA and Node cannot, so Node reports `unable to
verify the first certificate`. A bundle of the Windows root stores plus the
served chains fixes it, and with it the WiX toolchain downloaded and ran
first time.

---

## Claude Code prompt

```text
Read plans/ARCHITECTURE.md, plans/TESTING.md and
plans/phase-22-release-packaging.md.

Implement Phase 22 only: release packaging, including its full Test plan.

In electron-builder.yml set win.artifactName to
${productName}-Setup-${version}-x64.${ext} and add an msiWrapped target
after nsis with wrappedInstallerArgs "/S" and impersonate true. Add
scripts/checksums.mjs (no dependencies) writing sha256sum-format lines for
the EXE and MSI to release/GitDeck-<version>-checksums.txt, and run it as
the last step of the "package" script. Add
.github/workflows/release.yml exactly as designed in the plan: on
v*.*.* tags, windows-latest, tag-equals-package.json guard, npm run ci,
npm run package, npm run test:e2e, then gh release create --draft
--verify-tag with the three labelled assets and gh release edit
--draft=false. Add tests/e2e/release-assets.spec.ts. Update README's
Install section, add a Verify a download block and the three-step release
procedure.

Do not upload latest.yml or .blockmap. Do not add code signing,
electron-updater, provenance attestations, other architectures or a PR
CI workflow. Touch nothing under src/.

At completion report: implemented · files changed · tests · the local
npm run package + test:e2e result · what still needs the repository
setting and the first real tag.
```
