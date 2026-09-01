import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/contracts/settings'
import type { StoreMigration } from '@main/bootstrap/migrations'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { createJsonSettingsStore } from './JsonSettingsStore'

/** Writes to a real temp directory — the filesystem is the thing under test. */
let directory: string
let filePath: string
let logger: FakeLogger

const store = () => createJsonSettingsStore({ filePath, logger })

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gitdeck-settings-'))
  filePath = join(directory, 'settings.json')
  logger = createFakeLogger()
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('round trip', () => {
  it('reads back exactly what it wrote', () => {
    const written = {
      ...DEFAULT_SETTINGS,
      defaultShellProfileId: 'git-bash' as const,
      activeWorkspaceId: 'ws_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      activeTerminalDefinitionId: 'term_1',
      restoreLastWorkspace: false,
      runStartupCommandsOnRestore: true
    }
    store().write(written)

    expect(store().read()).toEqual(written)
  })

  it('writes readable JSON rather than an opaque blob', () => {
    store().write({ ...DEFAULT_SETTINGS, defaultShellProfileId: 'cmd' })

    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      ...DEFAULT_SETTINGS,
      defaultShellProfileId: 'cmd'
    })
  })

  it('creates the directory when it does not exist yet', () => {
    const nested = join(directory, 'deep', 'settings.json')
    createJsonSettingsStore({ filePath: nested, logger }).write(DEFAULT_SETTINGS)

    expect(createJsonSettingsStore({ filePath: nested, logger }).read()).toEqual(DEFAULT_SETTINGS)
  })

  it('leaves no temp file behind', () => {
    store().write(DEFAULT_SETTINGS)

    expect(readFileSync(filePath, 'utf8').length).toBeGreaterThan(0)
  })
})

describe('a file that cannot be trusted', () => {
  it('returns defaults when the file is missing, without logging a warning', () => {
    expect(store().read()).toEqual(DEFAULT_SETTINGS)
    expect(logger.entriesAt('warn')).toEqual([])
  })

  it('returns defaults and warns when the file is not JSON', () => {
    writeFileSync(filePath, 'not json at all', 'utf8')

    expect(store().read()).toEqual(DEFAULT_SETTINGS)
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('returns defaults when the JSON is the wrong shape', () => {
    writeFileSync(filePath, '["an","array"]', 'utf8')

    expect(store().read()).toEqual(DEFAULT_SETTINGS)
  })

  it('drops an unknown shell profile rather than passing it through', () => {
    writeFileSync(filePath, JSON.stringify({ defaultShellProfileId: 'fish' }), 'utf8')

    expect(store().read().defaultShellProfileId).toBeNull()
  })

  it('a corrupt file can be overwritten by the next write', () => {
    writeFileSync(filePath, '{{{', 'utf8')

    store().write({ ...DEFAULT_SETTINGS, defaultShellProfileId: 'cmd' })

    expect(store().read().defaultShellProfileId).toBe('cmd')
  })
})

describe('quarantine (Phase 14)', () => {
  it('moves a corrupt file aside with its bytes preserved', () => {
    writeFileSync(filePath, '{ not json', 'utf8')

    store().read()

    const quarantined = readdirSync(directory).find((name) =>
      name.startsWith('settings.json.corrupt-')
    )
    expect(quarantined).toBeDefined()
    expect(readFileSync(join(directory, quarantined ?? ''), 'utf8')).toBe('{ not json')
  })

  it('makes the launch after a quarantine a quiet first run', () => {
    writeFileSync(filePath, '{ not json', 'utf8')
    store().read()
    logger = createFakeLogger()

    expect(store().read()).toEqual(DEFAULT_SETTINGS)
    expect(logger.entriesAt('warn')).toEqual([])
  })

  it('reads a file written by a newer version per-field and never touches it', () => {
    const future = JSON.stringify({ version: 2, terminalCursorBlink: false, futureField: 'kept' })
    writeFileSync(filePath, future, 'utf8')

    expect(store().read().terminalCursorBlink).toBe(false)
    expect(readFileSync(filePath, 'utf8')).toBe(future)
    expect(logger.entriesAt('warn')).toEqual([])
  })
})

describe('migrations (Phase 15)', () => {
  /** Test-only v2: renames a field. Production ships zero migrations today. */
  const RENAME_BLINK: readonly StoreMigration[] = [
    {
      from: 1,
      migrate: ({ terminalCursorBlink, ...rest }) => ({ ...rest, cursorBlinks: terminalCursorBlink })
    }
  ]
  const V1_TEXT = JSON.stringify({ ...DEFAULT_SETTINGS, terminalCursorBlink: false }, null, 2)

  const migrating = (migrations: readonly StoreMigration[] = RENAME_BLINK) =>
    createJsonSettingsStore({
      filePath,
      logger,
      migrations,
      currentVersion: 2,
      backupDir: join(directory, 'backups')
    })

  it('migrates a v1 file on read and writes the v2 shape back', () => {
    writeFileSync(filePath, V1_TEXT, 'utf8')

    migrating().read()

    const disk = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    expect(disk['version']).toBe(2)
    expect(disk['cursorBlinks']).toBe(false)
    expect(disk).not.toHaveProperty('terminalCursorBlink')
  })

  it('preserves the original bytes in backups/, exactly once', () => {
    writeFileSync(filePath, V1_TEXT, 'utf8')

    migrating().read()
    migrating().read()

    const backup = join(directory, 'backups', 'settings.v1.json')
    expect(readFileSync(backup, 'utf8')).toBe(V1_TEXT)
    expect(readdirSync(join(directory, 'backups'))).toEqual(['settings.v1.json'])
  })

  it('does not migrate again on the next read', () => {
    writeFileSync(filePath, V1_TEXT, 'utf8')
    migrating().read()
    const afterFirst = readFileSync(filePath, 'utf8')

    migrating().read()

    expect(readFileSync(filePath, 'utf8')).toBe(afterFirst)
  })

  it('a gap in the chain quarantines the file and serves defaults', () => {
    writeFileSync(filePath, V1_TEXT, 'utf8')

    expect(migrating([]).read()).toEqual(DEFAULT_SETTINGS)

    expect(readdirSync(directory).some((name) => name.startsWith('settings.json.corrupt-'))).toBe(
      true
    )
    expect(existsSync(join(directory, 'backups'))).toBe(false)
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })
})

describe('when the write itself fails', () => {
  it('logs instead of throwing, so a failed save cannot crash the app', () => {
    const unwritable = createJsonSettingsStore({
      filePath: join(directory, '\0invalid', 'settings.json'),
      logger
    })

    expect(() => unwritable.write(DEFAULT_SETTINGS)).not.toThrow()
    expect(logger.entriesAt('error')).toHaveLength(1)
  })
})
