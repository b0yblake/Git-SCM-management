import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/contracts/settings'
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
