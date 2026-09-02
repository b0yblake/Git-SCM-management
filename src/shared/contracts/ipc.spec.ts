import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IPC, IPC_ERROR_CODES, MAX_TERMINAL_DIMENSION } from './ipc'

const SRC = resolve(import.meta.dirname, '../..')

/** This file is the one place allowed to hold channel literals. */
const REGISTRY = join(SRC, 'shared', 'contracts', 'ipc.ts')
const THIS_FILE = join(SRC, 'shared', 'contracts', 'ipc.spec.ts')
/** The Phase 10 snapshot pins the whole surface, so it holds every literal. */
const SNAPSHOT = join(SRC, 'shared', 'contracts', 'ipc.snapshot.spec.ts')

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : []
  })

describe('channel registry', () => {
  it('every channel name is namespaced and unique', () => {
    const channels = Object.values(IPC).flatMap((namespace) => Object.values(namespace))

    expect(new Set(channels).size).toBe(channels.length)
    for (const channel of channels) {
      expect(channel).toMatch(/^[a-z]+:[a-z]+$/)
    }
  })

  it('the terminal namespace holds exactly the documented channels', () => {
    // 'profiles' joined in Phase 5 so the picker can list installed shells.
    expect(Object.keys(IPC.terminal).sort()).toEqual([
      'create',
      'data',
      'exit',
      'kill',
      'profiles',
      'resize',
      'write'
    ])
  })

  it('the settings namespace holds exactly get and update', () => {
    expect(Object.keys(IPC.settings).sort()).toEqual(['get', 'update'])
  })

  it('the workspace namespace holds exactly the documented channels', () => {
    expect(Object.keys(IPC.workspace).sort()).toEqual(['delete', 'get', 'list', 'save'])
  })

  it('the git namespace holds exactly inspect — it is read-only', () => {
    // The registry is where a write operation would have to appear first, so
    // pinning it here is the cheapest guard against one being added.
    expect(Object.keys(IPC.git)).toEqual(['inspect'])
  })

  it('the ports namespace holds exactly list, terminate and open', () => {
    // `terminate` is the only destructive channel in the application. Anything
    // joining it here — a generic kill, an exec — has to change this line.
    expect(Object.keys(IPC.ports).sort()).toEqual(['list', 'open', 'terminate'])
  })

  it('the updates namespace holds exactly check, release and available', () => {
    // `release` carries no payload: Main opens only the URL it minted itself.
    expect(Object.keys(IPC.updates).sort()).toEqual(['available', 'check', 'release'])
  })

  it('the storage namespace holds exactly info and choose', () => {
    // `choose` opens the native picker; a path can never arrive over IPC.
    expect(Object.keys(IPC.storage).sort()).toEqual(['choose', 'info'])
  })

  it('every terminal channel is prefixed with its namespace', () => {
    for (const channel of Object.values(IPC.terminal)) {
      expect(channel.startsWith('terminal:')).toBe(true)
    }
  })

  /**
   * The guard that keeps the registry meaningful: a channel string typed
   * directly into a handler or a preload call would silently bypass it.
   */
  it('no raw channel literal exists outside the registry', () => {
    const literal = /['"`](terminal|settings|workspace|git|ports|updates|storage):[a-z]+['"`]/

    const offenders = sourceFiles(SRC)
      .filter((path) => path !== REGISTRY && path !== THIS_FILE && path !== SNAPSHOT)
      .filter((path) => literal.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).split(sep).join('/'))

    expect(offenders).toEqual([])
  })

  it('scans a meaningful number of files', () => {
    // Guards the guard: a broken walk would make the test above vacuous.
    expect(sourceFiles(SRC).length).toBeGreaterThan(20)
  })
})

describe('shared constants', () => {
  it('exposes stable error codes', () => {
    expect(IPC_ERROR_CODES.invalidRequest).toBe('INVALID_REQUEST')
    expect(IPC_ERROR_CODES.internal).toBe('INTERNAL_ERROR')
  })

  it('bounds terminal dimensions', () => {
    expect(MAX_TERMINAL_DIMENSION).toBeGreaterThan(0)
    expect(Number.isInteger(MAX_TERMINAL_DIMENSION)).toBe(true)
  })
})
