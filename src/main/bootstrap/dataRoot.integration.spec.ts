import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { copyDataToNewRoot, resolveDataRoot, writeDataRootPointer } from './dataRoot'
import { createStoragePaths } from './storagePaths'

/** Writes to a real temp directory — the filesystem is the thing under test. */
let root: string
let defaultRoot: string
let logger: FakeLogger

const pointerFile = (): string => join(defaultRoot, 'data-root.json')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gitdeck-dataroot-'))
  defaultRoot = join(root, 'default')
  mkdirSync(defaultRoot, { recursive: true })
  logger = createFakeLogger()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolveDataRoot', () => {
  it('a missing pointer is the quiet default state', () => {
    const resolution = resolveDataRoot(defaultRoot, logger)

    expect(resolution).toEqual({
      dataRoot: defaultRoot,
      defaultRoot,
      pointerFile: pointerFile(),
      isCustom: false
    })
    expect(logger.entriesAt('warn')).toEqual([])
  })

  it('follows a valid pointer and creates the folder it names', () => {
    const custom = join(root, 'elsewhere', 'GitDeckData')
    writeFileSync(pointerFile(), JSON.stringify({ version: 1, dataRoot: custom }), 'utf8')

    const resolution = resolveDataRoot(defaultRoot, logger)

    expect(resolution.dataRoot).toBe(custom)
    expect(resolution.isCustom).toBe(true)
    expect(existsSync(custom)).toBe(true)
  })

  it('a pointer at the default folder itself is not "custom"', () => {
    writeFileSync(pointerFile(), JSON.stringify({ version: 1, dataRoot: defaultRoot }), 'utf8')

    expect(resolveDataRoot(defaultRoot, logger).isCustom).toBe(false)
  })

  it('quarantines a corrupt pointer and uses the default', () => {
    writeFileSync(pointerFile(), '{ not json', 'utf8')

    const resolution = resolveDataRoot(defaultRoot, logger)

    expect(resolution.dataRoot).toBe(defaultRoot)
    expect(
      readdirSync(defaultRoot).some((name) => name.startsWith('data-root.json.corrupt-'))
    ).toBe(true)
  })

  it('an unusable custom folder falls back without losing the pointer', () => {
    // A null byte makes mkdir fail deterministically, standing in for a
    // drive that is gone.
    writeFileSync(
      pointerFile(),
      JSON.stringify({ version: 1, dataRoot: join(root, '\0invalid') }),
      'utf8'
    )

    const resolution = resolveDataRoot(defaultRoot, logger)

    expect(resolution.dataRoot).toBe(defaultRoot)
    expect(logger.entriesAt('warn')).toHaveLength(1)
    expect(existsSync(pointerFile())).toBe(true)
  })
})

describe('writeDataRootPointer', () => {
  it('round-trips through resolveDataRoot', () => {
    const custom = join(root, 'moved')

    writeDataRootPointer(pointerFile(), defaultRoot, custom)

    expect(resolveDataRoot(defaultRoot, logger).dataRoot).toBe(custom)
  })

  it('choosing the default again removes the pointer instead of writing one', () => {
    writeDataRootPointer(pointerFile(), defaultRoot, join(root, 'moved'))

    writeDataRootPointer(pointerFile(), defaultRoot, defaultRoot)

    expect(existsSync(pointerFile())).toBe(false)
  })

  it('leaves no temp file behind', () => {
    writeDataRootPointer(pointerFile(), defaultRoot, join(root, 'moved'))

    expect(readdirSync(defaultRoot)).toEqual(['data-root.json'])
  })
})

describe('copyDataToNewRoot', () => {
  const seed = (): ReturnType<typeof createStoragePaths> => {
    const paths = createStoragePaths(defaultRoot, join(root, 'logs'))
    writeFileSync(paths.settingsFile, '{"version":1}', 'utf8')
    writeFileSync(paths.manifestFile, '{"manifestVersion":1}', 'utf8')
    mkdirSync(paths.workspacesDir, { recursive: true })
    writeFileSync(join(paths.workspacesDir, 'ws_x.json'), '{"id":"ws_x"}', 'utf8')
    mkdirSync(paths.backupsDir, { recursive: true })
    writeFileSync(join(paths.backupsDir, 'settings.v1.json'), '{}', 'utf8')
    return paths
  }

  it('copies every store to the target and leaves the source untouched', () => {
    const paths = seed()
    const target = join(root, 'moved')

    expect(copyDataToNewRoot(paths, target, logger)).toBe('copied')

    expect(readFileSync(join(target, 'settings.json'), 'utf8')).toBe('{"version":1}')
    expect(readFileSync(join(target, 'storage.json'), 'utf8')).toBe('{"manifestVersion":1}')
    expect(existsSync(join(target, 'workspaces', 'ws_x.json'))).toBe(true)
    expect(existsSync(join(target, 'backups', 'settings.v1.json'))).toBe(true)
    // The source stays: switching back is always possible.
    expect(existsSync(paths.settingsFile)).toBe(true)
  })

  it('names the copies exactly what storagePaths mints, not its own literals', () => {
    // The one place in the app that writes store filenames without asking
    // `storagePaths.ts` for them (Phase 14's single-path-authority rule):
    // the copy has to name the files in a folder that has no paths yet, so it
    // spells them out. Nothing is wrong today — the two agree — but if a store
    // is ever renamed, the copy would write the old name and the switched
    // folder would come up empty. Asserted here, by Checkpoint C, so that
    // rename fails a test instead of a user's data folder.
    const paths = seed()
    const target = join(root, 'named')

    expect(copyDataToNewRoot(paths, target, logger)).toBe('copied')

    for (const source of [paths.settingsFile, paths.manifestFile]) {
      expect(existsSync(join(target, basename(source))), basename(source)).toBe(true)
    }
    for (const source of [paths.workspacesDir, paths.backupsDir]) {
      expect(existsSync(join(target, basename(source))), basename(source)).toBe(true)
    }
    // Guards the guard: the target holds these four entries and nothing else,
    // so a copy that quietly dropped one cannot pass.
    expect(readdirSync(target).sort()).toEqual(
      [
        basename(paths.settingsFile),
        basename(paths.manifestFile),
        basename(paths.workspacesDir),
        basename(paths.backupsDir)
      ].sort()
    )
  })

  it('adopts a target that already holds GitDeck data — its files win', () => {
    const paths = seed()
    const target = join(root, 'occupied')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'settings.json'), '{"version":1,"theirs":true}', 'utf8')

    expect(copyDataToNewRoot(paths, target, logger)).toBe('adopted')

    expect(readFileSync(join(target, 'settings.json'), 'utf8')).toContain('theirs')
    expect(existsSync(join(target, 'workspaces'))).toBe(false)
  })

  it('a fresh install switching an empty default is simply fresh', () => {
    const paths = createStoragePaths(defaultRoot, join(root, 'logs'))

    expect(copyDataToNewRoot(paths, join(root, 'moved'), logger)).toBe('fresh')
  })

  it('a failed copy throws so the switch is aborted before the pointer', () => {
    const paths = seed()

    expect(() => copyDataToNewRoot(paths, join(root, '\0invalid'), logger)).toThrow()
  })
})
