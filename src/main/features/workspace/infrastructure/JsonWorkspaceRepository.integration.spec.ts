import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createId } from '@shared/domain/ids'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { InvalidWorkspaceError, WorkspaceNotFoundError } from '../domain/errors'
import type { Workspace } from '../domain/Workspace'
import { createJsonWorkspaceRepository } from './JsonWorkspaceRepository'

/** Writes to a real temp directory — the filesystem is the thing under test. */
const FIXTURES = resolve(import.meta.dirname, '../../../../../tests/fixtures/workspace')

/** The id declared inside every fixture; a planted file must use it as its name. */
const FIXTURE_ID = 'ws_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

let directory: string
let logger: FakeLogger

const repository = () => createJsonWorkspaceRepository({ directory, logger })

const plant = (fixture: string, id: string = FIXTURE_ID): string => {
  copyFileSync(join(FIXTURES, `${fixture}.json`), join(directory, `${id}.json`))
  return id
}

const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: createId('ws'),
  name: 'GitDeck',
  version: 1,
  terminals: [
    {
      id: createId('term'),
      title: 'dev server',
      cwd: 'C:\\Users\\dev\\gitdeck',
      shellProfileId: 'powershell',
      startupCommand: 'npm run dev'
    }
  ],
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides
})

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gitdeck-workspaces-'))
  logger = createFakeLogger()
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('round trip', () => {
  it('reads back every field, including nested terminal definitions', () => {
    const saved = workspace()
    repository().save(saved)

    expect(repository().get(saved.id)).toEqual(saved)
  })

  it('reads back a workspace with zero terminals', () => {
    const empty = workspace({ terminals: [] })
    repository().save(empty)

    expect(repository().get(empty.id).terminals).toEqual([])
  })

  it('survives unicode and Windows paths with spaces and backslashes', () => {
    const awkward = workspace({
      name: 'Dự án — GitDeck 🚀',
      terminals: [
        {
          id: createId('term'),
          title: 'máy chủ',
          cwd: 'C:\\Users\\lích\\My Projects\\dự án',
          shellProfileId: 'git-bash'
        }
      ]
    })
    repository().save(awkward)

    expect(repository().get(awkward.id)).toEqual(awkward)
  })

  it('writes readable JSON rather than an opaque blob', () => {
    const saved = workspace()
    repository().save(saved)

    expect(JSON.parse(readFileSync(join(directory, `${saved.id}.json`), 'utf8'))).toEqual(saved)
  })

  it('loads a captured real-world file', () => {
    plant('valid')

    const loaded = repository().get(FIXTURE_ID)

    expect(loaded.name).toBe('GitDeck')
    expect(loaded.terminals).toHaveLength(2)
    expect(loaded.activeTerminalId).toBe('term_11111111-1111-4111-8111-111111111111')
  })
})

describe('list', () => {
  it('is empty before anything has been saved, without warning about it', () => {
    expect(repository().list()).toEqual([])
    expect(logger.entriesAt('warn')).toEqual([])
  })

  it('returns every workspace that parses', () => {
    const a = workspace({ name: 'A' })
    const b = workspace({ name: 'B' })
    repository().save(a)
    repository().save(b)

    expect(
      repository()
        .list()
        .map((entry) => entry.name)
        .sort()
    ).toEqual(['A', 'B'])
  })

  it('keeps the valid workspaces when one file among them is corrupt', () => {
    repository().save(workspace({ name: 'A' }))
    repository().save(workspace({ name: 'B' }))
    repository().save(workspace({ name: 'C' }))
    plant('corrupt')

    const listed = repository().list()

    expect(listed.map((entry) => entry.name).sort()).toEqual(['A', 'B', 'C'])
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('skips a file written by a newer version', () => {
    plant('wrong-version')

    expect(repository().list()).toEqual([])
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('skips a file that is missing required fields', () => {
    plant('missing-fields')

    expect(repository().list()).toEqual([])
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })

  it('ignores files whose name is not a workspace id, silently', () => {
    writeFileSync(join(directory, 'notes.txt'), 'hello', 'utf8')
    writeFileSync(join(directory, 'settings.json'), '{}', 'utf8')
    writeFileSync(join(directory, 'ws_not-a-uuid.json'), '{}', 'utf8')
    writeFileSync(join(directory, 'term_11111111-1111-4111-8111-111111111111.json'), '{}', 'utf8')

    expect(repository().list()).toEqual([])
    expect(logger.entriesAt('warn')).toEqual([])
  })

  it('ignores a temp file left behind by an interrupted write', () => {
    const saved = workspace()
    repository().save(saved)
    writeFileSync(join(directory, `.${createId('ws')}.tmp`), '{ truncated', 'utf8')

    expect(repository().list()).toHaveLength(1)
    expect(logger.entriesAt('warn')).toEqual([])
  })
})

describe('errors', () => {
  it('raises WorkspaceNotFoundError for a well-formed id that was never saved', () => {
    expect(() => repository().get(createId('ws'))).toThrow(WorkspaceNotFoundError)
  })

  it('raises InvalidWorkspaceError for a file that is not JSON', () => {
    plant('corrupt')

    expect(() => repository().get(FIXTURE_ID)).toThrow(InvalidWorkspaceError)
  })

  it('raises InvalidWorkspaceError rather than partially loading missing fields', () => {
    plant('missing-fields')

    expect(() => repository().get(FIXTURE_ID)).toThrow(InvalidWorkspaceError)
  })

  it('never silently accepts a file written by a newer version', () => {
    plant('wrong-version')

    expect(() => repository().get(FIXTURE_ID)).toThrow(/version 2/)
  })

  it('rejects a file whose contents declare a different id than its name', () => {
    const renamed = createId('ws')
    copyFileSync(join(FIXTURES, 'valid.json'), join(directory, `${renamed}.json`))

    expect(() => repository().get(renamed)).toThrow(/different id/)
  })

  /** The id becomes a filename, so a traversal attempt must never reach fs. */
  it('refuses to turn a path into an id', () => {
    // The guard fires before any read, so nothing needs to exist to prove it.
    expect(() => repository().get('../secret')).toThrow(InvalidWorkspaceError)
    expect(() => repository().get('..\\secret')).toThrow(InvalidWorkspaceError)
    expect(() => repository().get('settings')).toThrow(InvalidWorkspaceError)
  })
})

describe('delete', () => {
  it('removes the file from disk', () => {
    const saved = workspace()
    repository().save(saved)

    repository().delete(saved.id)

    expect(existsSync(join(directory, `${saved.id}.json`))).toBe(false)
    expect(repository().list()).toEqual([])
  })

  it('is a no-op for an id that was never saved', () => {
    expect(() => repository().delete(createId('ws'))).not.toThrow()
  })

  it('is a no-op for an id that is not well formed, rather than touching a path', () => {
    writeFileSync(join(directory, '..', 'secret.json'), '{"leaked":true}', 'utf8')

    expect(() => repository().delete('../secret')).not.toThrow()
    expect(existsSync(join(directory, '..', 'secret.json'))).toBe(true)

    rmSync(join(directory, '..', 'secret.json'), { force: true })
  })
})

describe('durability', () => {
  it('leaves no temp file behind after a successful save', () => {
    const saved = workspace()
    repository().save(saved)

    expect(readdirSync(directory)).toEqual([`${saved.id}.json`])
  })

  /**
   * The point of write-temp-then-rename: a write that dies partway must not be
   * able to reach the real file. Making the temp path a directory is a
   * deterministic stand-in for the interruption.
   */
  it('a failed write leaves the previous workspace intact rather than truncated', () => {
    const saved = workspace({ name: 'Original' })
    repository().save(saved)
    mkdirSync(join(directory, `.${saved.id}.tmp`))

    expect(() => repository().save({ ...saved, name: 'Never written' })).toThrow()
    expect(repository().get(saved.id).name).toBe('Original')
  })

  it('two rapid saves end with the later content, not a merged file', () => {
    const saved = workspace({ name: 'First' })
    repository().save(saved)
    repository().save({ ...saved, name: 'Second' })

    expect(repository().get(saved.id).name).toBe('Second')
    expect(readdirSync(directory)).toHaveLength(1)
  })

  it('creates the directory when it does not exist yet', () => {
    const nested = join(directory, 'deep', 'workspaces')
    const store = createJsonWorkspaceRepository({ directory: nested, logger })
    const saved = workspace()

    store.save(saved)

    expect(store.get(saved.id)).toEqual(saved)
  })
})
