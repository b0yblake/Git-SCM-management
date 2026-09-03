import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppSettings } from '@shared/contracts/settings'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { createSettingsService } from './features/settings/public'
import { createWorkspaceService } from './features/workspace/public'

/**
 * The backward-compatibility proof (Phase 15): every fixture directory under
 * `tests/fixtures/storage/<released version>/` holds real files as that
 * release wrote them, and the current code must load all of them.
 *
 * Releasing a new version appends a directory here; editing or deleting an old
 * one is forbidden — they are the recorded past that upgrade code runs
 * against. The suite copies each set to a temp directory first, so the
 * committed fixtures are never modified (migration write-back included).
 */
const FIXTURES = resolve(import.meta.dirname, '../../tests/fixtures/storage')

const versions = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

/**
 * Every GitDeck version that has been released, or is being cut. Bumping the
 * version appends its number here and its folder above, in the same change and
 * before the tag (README, "Cutting a release"). Listed rather than discovered
 * so a forgotten fixture fails this suite instead of quietly narrowing what
 * "old data always loads" is proven against — which is exactly what happened
 * to 0.2.0 and 0.3.0, and what Checkpoint C found.
 */
const PUBLISHED_RELEASES = ['v0.1.0', 'v0.2.0', 'v0.3.0', 'v0.5.0']

/** Spot checks per known release, beyond "loads without complaint". */
const EXPECTED_SETTINGS: Record<string, Partial<AppSettings>> = {
  'v0.1.0': {
    version: 1,
    defaultShellProfileId: 'git-bash',
    terminalFontSize: 16,
    terminalCursorBlink: false,
    runStartupCommandsOnRestore: false,
    // Phase 16 fields did not exist in v0.1.0 files: they must default in,
    // proving the "additions are not migrations" rule on a real old file.
    checkForUpdatesOnStartup: true,
    skippedUpdateVersion: null
  },
  // 0.2.0 was the first release carrying Phases 14–16, so its files hold all
  // eleven fields. Every value below differs from the shipped default, which
  // is what makes this set prove the loader preserves a real user's choices
  // rather than quietly handing back defaults.
  'v0.2.0': {
    version: 1,
    defaultShellProfileId: 'powershell',
    restoreLastWorkspace: true,
    runStartupCommandsOnRestore: true,
    terminalFontSize: 18,
    terminalCursorBlink: false,
    confirmBeforeClosingRunningTerminal: false,
    checkForUpdatesOnStartup: false,
    skippedUpdateVersion: '0.3.0'
  },
  // 0.3.0 added the data-folder pointer (Phase 17), which lives outside the
  // data root and so leaves this shape unchanged — asserted, not assumed.
  'v0.3.0': {
    version: 1,
    defaultShellProfileId: 'wsl',
    restoreLastWorkspace: false,
    runStartupCommandsOnRestore: false,
    terminalFontSize: 12,
    terminalCursorBlink: true,
    confirmBeforeClosingRunningTerminal: true,
    checkForUpdatesOnStartup: true,
    skippedUpdateVersion: null
  },
  // The only set written by a running GitDeck rather than authored to shape:
  // the packaged 0.5.0 build saved a workspace and a full settings patch
  // through its own IPC, and those files were copied here unedited.
  'v0.5.0': {
    version: 1,
    defaultShellProfileId: 'cmd',
    restoreLastWorkspace: true,
    runStartupCommandsOnRestore: true,
    terminalFontSize: 20,
    terminalCursorBlink: false,
    confirmBeforeClosingRunningTerminal: false,
    checkForUpdatesOnStartup: false,
    skippedUpdateVersion: '0.6.0'
  }
}

let directory: string
let logger: FakeLogger

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gitdeck-compat-'))
  logger = createFakeLogger()
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('storage backward compatibility', () => {
  it('discovers the released fixture sets dynamically', () => {
    expect(versions).toContain('v0.1.0')
  })

  it('holds a fixture set for every published release', () => {
    expect(versions).toEqual(expect.arrayContaining(PUBLISHED_RELEASES))
  })

  for (const version of versions) {
    describe(`data written by ${version}`, () => {
      beforeEach(() => {
        cpSync(join(FIXTURES, version), directory, { recursive: true })
      })

      it('loads settings without a warning', () => {
        const service = createSettingsService(
          join(directory, 'settings.json'),
          join(directory, 'backups'),
          logger
        )

        const settings = service.get()

        expect(logger.entriesAt('warn')).toEqual([])
        expect(settings).toMatchObject(EXPECTED_SETTINGS[version] ?? {})
      })

      it('loads every workspace, and each one round-trips through get', () => {
        const service = createWorkspaceService(
          join(directory, 'workspaces'),
          join(directory, 'backups', 'workspaces'),
          logger
        )

        const summaries = service.list()

        expect(summaries.length).toBeGreaterThan(0)
        for (const summary of summaries) {
          expect(service.get(summary.id).id).toBe(summary.id)
        }
        expect(logger.entriesAt('warn')).toEqual([])
      })
    })
  }
})
