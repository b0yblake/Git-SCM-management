import { beforeEach, describe, expect, it } from 'vitest'
import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { createId } from '@shared/domain/ids'
import type { Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import { createFakeLogger, type FakeLogger } from '@main/testing/FakeLogger'
import { WorkspaceService } from '../application/WorkspaceService'
import type { Workspace, WorkspaceSummary } from '../domain/Workspace'
import {
  createInMemoryWorkspaceRepository,
  type InMemoryWorkspaceRepository
} from '../testing/InMemoryWorkspaceRepository'
import { registerWorkspaceIpc } from './workspaceIpc'

/** Records what was registered so a test can invoke a channel directly. */
class FakeRegistry implements IpcHandlerRegistry {
  readonly handlers = new Map<string, (payload: unknown) => unknown>()

  handle(channel: string, handler: (payload: unknown) => unknown): void {
    this.handlers.set(channel, handler)
  }

  on(): void {
    throw new Error('the workspace feature registers no fire-and-forget channels')
  }

  invoke<T>(channel: string, payload?: unknown): T {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`no handler for ${channel}`)
    return handler(payload) as T
  }
}

const INPUT = {
  name: 'GitDeck',
  terminals: [
    {
      id: 'term_11111111-1111-4111-8111-111111111111',
      title: 'dev server',
      cwd: 'C:\\Users\\dev\\gitdeck',
      shellProfileId: 'powershell'
    }
  ]
}

let registry: FakeRegistry
let repository: InMemoryWorkspaceRepository
let logger: FakeLogger

const list = (): Result<readonly WorkspaceSummary[], IpcError> =>
  registry.invoke(IPC.workspace.list)
const get = (payload: unknown): Result<Workspace, IpcError> =>
  registry.invoke(IPC.workspace.get, payload)
const save = (payload: unknown): Result<Workspace, IpcError> =>
  registry.invoke(IPC.workspace.save, payload)
const remove = (payload: unknown): Result<null, IpcError> =>
  registry.invoke(IPC.workspace.delete, payload)

const unwrap = <T>(result: Result<T, IpcError>): T => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`)
  return result.value
}

beforeEach(() => {
  registry = new FakeRegistry()
  repository = createInMemoryWorkspaceRepository()
  logger = createFakeLogger()
  registerWorkspaceIpc({
    registry,
    workspace: new WorkspaceService(repository),
    logger
  })
})

describe('registration', () => {
  it('registers exactly the four workspace channels', () => {
    expect([...registry.handlers.keys()].sort()).toEqual(
      [IPC.workspace.delete, IPC.workspace.get, IPC.workspace.list, IPC.workspace.save].sort()
    )
  })
})

describe('happy path', () => {
  it('saves, lists and gets a workspace', () => {
    const saved = unwrap(save(INPUT))

    expect(unwrap(list())).toEqual([
      {
        id: saved.id,
        name: 'GitDeck',
        terminalCount: 1,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      }
    ])
    expect(unwrap(get({ id: saved.id }))).toEqual(saved)
  })

  it('deletes a workspace and answers with null', () => {
    const saved = unwrap(save(INPUT))

    expect(remove({ id: saved.id })).toEqual({ ok: true, value: null })
    expect(unwrap(list())).toEqual([])
  })
})

describe('failures cross as data, never as a rejection', () => {
  it('reports an unknown workspace with a stable code', () => {
    const result = get({ id: createId('ws') })

    expect(result).toEqual({
      ok: false,
      error: { code: 'WORKSPACE_NOT_FOUND', message: expect.stringContaining('No workspace') }
    })
  })

  it('rejects a malformed save payload rather than storing it', () => {
    const result = save({ name: 'No terminals field' })

    expect(result.ok).toBe(false)
    expect(repository.saves).toEqual([])
  })

  it('rejects a payload that is not an object', () => {
    expect(save('a workspace').ok).toBe(false)
    expect(get(undefined).ok).toBe(false)
    expect(remove([]).ok).toBe(false)
  })

  it('uses the invalid-workspace code, not a generic one, for bad input', () => {
    const result = save({ name: 'GitDeck', terminals: [{ id: 'term_a' }] })

    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.error.code).toBe('INVALID_WORKSPACE')
  })

  it('collapses an unexpected failure to a generic message', () => {
    const exploding = new WorkspaceService({
      list: () => {
        throw new Error('C:\\Users\\dev\\secret\\path exploded')
      },
      get: () => {
        throw new Error('boom')
      },
      save: () => {},
      delete: () => {}
    })
    const isolated = new FakeRegistry()
    registerWorkspaceIpc({ registry: isolated, workspace: exploding, logger })

    const result = isolated.invoke<Result<readonly WorkspaceSummary[], IpcError>>(
      IPC.workspace.list
    )

    expect(result).toEqual({
      ok: false,
      error: { code: IPC_ERROR_CODES.internal, message: 'An unexpected error occurred.' }
    })
  })

  it('logs every rejection', () => {
    get({ id: createId('ws') })
    save({})

    expect(logger.entriesAt('warn')).toHaveLength(2)
  })
})

/** Everything crossing the bridge is cloned by Electron, so it must be cloneable. */
describe('every response survives structuredClone', () => {
  it('clones a saved workspace, a summary list and an error', () => {
    const saved = save(INPUT)
    const responses: unknown[] = [
      saved,
      list(),
      get({ id: unwrap(saved).id }),
      remove({ id: unwrap(saved).id }),
      get({ id: createId('ws') })
    ]

    for (const response of responses) {
      expect(structuredClone(response)).toEqual(response)
    }
  })
})
