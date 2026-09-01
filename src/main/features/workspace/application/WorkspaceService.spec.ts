import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createId } from '@shared/domain/ids'
import { isWorkspaceId, type WorkspaceInput } from '../domain/Workspace'
import { InvalidWorkspaceError, WorkspaceNotFoundError } from '../domain/errors'
import {
  createInMemoryWorkspaceRepository,
  type InMemoryWorkspaceRepository
} from '../testing/InMemoryWorkspaceRepository'
import { WorkspaceService } from './WorkspaceService'

const CREATED = 1_756_000_000_000
const LATER = CREATED + 60_000

let repository: InMemoryWorkspaceRepository
let service: WorkspaceService

const input = (overrides: Partial<WorkspaceInput> = {}): WorkspaceInput => ({
  name: 'GitDeck',
  terminals: [
    {
      id: 'term_11111111-1111-4111-8111-111111111111',
      title: 'dev server',
      cwd: 'C:\\Users\\dev\\gitdeck',
      shellProfileId: 'powershell'
    }
  ],
  ...overrides
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(CREATED)
  repository = createInMemoryWorkspaceRepository()
  service = new WorkspaceService(repository)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('save', () => {
  it('mints an id when the caller does not supply one', () => {
    const saved = service.save(input())

    expect(isWorkspaceId(saved.id)).toBe(true)
  })

  it('keeps the id when the caller supplies one, so saving twice is an overwrite', () => {
    const first = service.save(input())

    const second = service.save(input({ id: first.id, name: 'Renamed' }))

    expect(second.id).toBe(first.id)
    expect(service.list()).toHaveLength(1)
    expect(service.get(first.id).name).toBe('Renamed')
  })

  it('preserves createdAt and advances updatedAt on an overwrite', () => {
    const first = service.save(input())
    vi.setSystemTime(LATER)

    const second = service.save(input({ id: first.id, name: 'Renamed' }))

    expect(second.createdAt).toBe(CREATED)
    expect(second.updatedAt).toBe(LATER)
  })

  it('stamps both timestamps on a create', () => {
    const saved = service.save(input())

    expect(saved.createdAt).toBe(CREATED)
    expect(saved.updatedAt).toBe(CREATED)
  })

  it('ignores version and timestamps supplied by the caller', () => {
    vi.setSystemTime(LATER)

    const saved = service.save({
      ...input(),
      version: 99,
      createdAt: 1,
      updatedAt: 9_999_999_999_999
    } as WorkspaceInput)

    expect(saved.version).toBe(1)
    expect(saved.createdAt).toBe(LATER)
    expect(saved.updatedAt).toBe(LATER)
  })

  it('returns exactly what was stored', () => {
    const saved = service.save(input())

    expect(service.get(saved.id)).toEqual(saved)
  })

  it('rejects an invalid input before anything reaches the repository', () => {
    expect(() => service.save({ name: '', terminals: [] })).toThrow(InvalidWorkspaceError)
    expect(repository.saves).toEqual([])
  })

  it('saves a workspace with zero terminals', () => {
    const saved = service.save(input({ terminals: [] }))

    expect(service.get(saved.id).terminals).toEqual([])
  })

  it('can overwrite a workspace whose stored copy is unreadable', () => {
    const first = service.save(input())
    repository.corrupt(first.id)
    vi.setSystemTime(LATER)

    const second = service.save(input({ id: first.id, name: 'Rescued' }))

    // No history to preserve, so createdAt restarts rather than the save failing.
    expect(second.createdAt).toBe(LATER)
    expect(service.get(first.id).name).toBe('Rescued')
  })

  it('two rapid saves end with the later content', () => {
    const first = service.save(input({ name: 'First' }))
    service.save(input({ id: first.id, name: 'Second' }))

    expect(service.get(first.id).name).toBe('Second')
    expect(service.list()).toHaveLength(1)
  })
})

/** The rule this phase exists to enforce. */
describe('runtime state never reaches the repository', () => {
  it('drops session fields attached to a terminal definition', () => {
    service.save({
      name: 'Polluted',
      terminals: [
        {
          id: 'term_11111111-1111-4111-8111-111111111111',
          title: 'dev server',
          cwd: 'C:\\Users\\dev',
          shellProfileId: 'powershell',
          sessionId: 'sess_1',
          status: 'running',
          exitCode: 0
        }
      ]
    } as unknown as WorkspaceInput)

    expect(JSON.stringify(repository.saves)).not.toMatch(/sessionId|status|exitCode/)
  })
})

describe('list', () => {
  it('is empty before anything is saved', () => {
    expect(service.list()).toEqual([])
  })

  it('reports a terminal count instead of the definitions themselves', () => {
    const saved = service.save(input())

    expect(service.list()).toEqual([
      {
        id: saved.id,
        name: 'GitDeck',
        terminalCount: 1,
        createdAt: CREATED,
        updatedAt: CREATED
      }
    ])
  })

  it('skips a workspace the repository cannot read', () => {
    const readable = service.save(input({ name: 'Readable' }))
    const broken = service.save(input({ name: 'Broken' }))
    repository.corrupt(broken.id)

    expect(service.list().map((entry) => entry.id)).toEqual([readable.id])
  })
})

describe('get and delete', () => {
  it('raises WorkspaceNotFoundError for an unknown id', () => {
    expect(() => service.get(createId('ws'))).toThrow(WorkspaceNotFoundError)
  })

  it('removes a stored workspace', () => {
    const saved = service.save(input())

    service.delete(saved.id)

    expect(service.list()).toEqual([])
    expect(() => service.get(saved.id)).toThrow(WorkspaceNotFoundError)
  })

  it('deleting an unknown id is a no-op, not an error', () => {
    expect(() => service.delete(createId('ws'))).not.toThrow()
  })
})
