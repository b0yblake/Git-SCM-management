import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { recordRun } from './storageManifest'

/** Writes to a real temp directory — the filesystem is the thing under test. */
let directory: string
let manifestFile: string
let logger: FakeLogger

const STORE_VERSIONS = { settings: 1, workspace: 1 }

const run = (appVersion = '0.1.0', now = () => 1000): ReturnType<typeof recordRun> =>
  recordRun({ manifestFile, appVersion, storeVersions: STORE_VERSIONS, logger, now })

const onDisk = (): Record<string, unknown> =>
  JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<string, unknown>

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gitdeck-manifest-'))
  manifestFile = join(directory, 'storage.json')
  logger = createFakeLogger()
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('first run', () => {
  it('writes a manifest whose first and last run are this run', () => {
    const manifest = run('0.1.0', () => 1234)

    expect(manifest).toEqual({
      manifestVersion: 1,
      firstRunAt: 1234,
      lastRunAt: 1234,
      lastRunAppVersion: '0.1.0',
      storeVersions: STORE_VERSIONS
    })
    expect(onDisk()).toEqual(manifest)
  })
})

describe('a later run', () => {
  it('preserves firstRunAt and updates the rest', () => {
    run('0.1.0', () => 1000)

    const second = run('0.2.0', () => 2000)

    expect(second?.firstRunAt).toBe(1000)
    expect(second?.lastRunAt).toBe(2000)
    expect(second?.lastRunAppVersion).toBe('0.2.0')
  })

  it('carries unknown fields through untouched — a newer manifest loses nothing here', () => {
    writeFileSync(
      manifestFile,
      JSON.stringify({ firstRunAt: 500, futureField: { kept: true } }),
      'utf8'
    )

    run('0.1.0', () => 1000)

    expect(onDisk()['futureField']).toEqual({ kept: true })
    expect(onDisk()['firstRunAt']).toBe(500)
  })
})

describe('a manifest that cannot be trusted', () => {
  it('quarantines a corrupt manifest and rebuilds it as a first run', () => {
    writeFileSync(manifestFile, '{ not json', 'utf8')

    const manifest = run('0.1.0', () => 3000)

    expect(manifest?.firstRunAt).toBe(3000)
    expect(readdirSync(directory).some((name) => name.startsWith('storage.json.corrupt-'))).toBe(
      true
    )
  })

  it('never throws, even when the write itself cannot land', () => {
    const doomed = join(directory, '\0invalid', 'storage.json')

    expect(() =>
      recordRun({ manifestFile: doomed, appVersion: '0.1.0', storeVersions: STORE_VERSIONS, logger })
    ).not.toThrow()
    expect(logger.entriesAt('warn').length).toBeGreaterThan(0)
  })
})

describe('durability', () => {
  it('leaves no temp file behind', () => {
    run()

    expect(readdirSync(directory)).toEqual(['storage.json'])
  })
})
