import { describe, expect, it } from 'vitest'
import { IPC } from '@shared/contracts/ipc'
import { MAX_PORT_TERMINATION_TARGETS, type PortSnapshot } from '@shared/contracts/ports'
import type { Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from '@main/bootstrap/ipcPorts'
import { createFakeLogger } from '@main/testing/FakeLogger'
import { PortService } from '../application/PortService'
import { binding, createFakePortAdapter, identity } from '../testing/FakePortAdapter'
import { parseTerminateRequest, registerPortsIpc } from './portsIpc'

const OWN_PID = 999

const setup = () => {
  const handlers = new Map<string, (payload: unknown) => unknown>()
  const registry: IpcHandlerRegistry = {
    handle: (channel, handler) => handlers.set(channel, handler),
    on: (channel, handler) => handlers.set(channel, handler)
  }
  const adapter = createFakePortAdapter()
  const logger = createFakeLogger()
  let n = 0
  const ports = new PortService(adapter, logger, {
    ownPid: OWN_PID,
    now: () => 0,
    newTargetId: () => `t-${++n}`,
    newSnapshotId: () => 's-1'
  })
  registerPortsIpc({ registry, ports, logger })

  const invoke = <T>(channel: string, payload?: unknown): Promise<T> =>
    Promise.resolve(handlers.get(channel)!(payload) as T)

  return { adapter, logger, invoke }
}

const world = {
  bindings: [binding('tcp', '127.0.0.1', 3000, 18420)],
  processes: [identity(OWN_PID, 'GitDeck', 500, 1), identity(18420, 'node', 1_000, 1)]
}

describe('the list channel', () => {
  it('answers Ok with the minted snapshot', async () => {
    const { adapter, invoke } = setup()
    adapter.scriptInspections(world)

    const result = await invoke<Result<PortSnapshot, { code: string }>>(IPC.ports.list)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('s-1')
    expect(result.value.processes[0]?.targetId).toBe('t-1')
    expect(() => structuredClone(result)).not.toThrow()
  })

  it('translates an inspection failure into a coded Err, and logs it', async () => {
    const { adapter, logger, invoke } = setup()
    adapter.failNextInspection(new Error('powershell exploded'))

    const result = await invoke<Result<PortSnapshot, { code: string; message: string }>>(
      IPC.ports.list
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    // An unexpected Error collapses to the generic code and message — a stack
    // trace or an absolute path must not reach the renderer.
    expect(result.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.'
    })
    expect(logger.entriesAt('warn')).toHaveLength(1)
  })
})

describe('terminate input validation — nothing malformed reaches the service', () => {
  const malformed: ReadonlyArray<[name: string, payload: unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'kill 18420'],
    ['an array', ['s-1', ['t-1']]],
    ['missing targetIds', { snapshotId: 's-1' }],
    ['missing snapshotId', { targetIds: ['t-1'] }],
    ['a smuggled pid field', { snapshotId: 's-1', targetIds: ['t-1'], pid: 18420 }],
    ['a smuggled processName', { snapshotId: 's-1', targetIds: ['t-1'], processName: 'node' }],
    ['a smuggled command', { snapshotId: 's-1', targetIds: ['t-1'], command: 'taskkill /IM *' }],
    ['a smuggled signal', { snapshotId: 's-1', targetIds: ['t-1'], signal: 'SIGKILL' }],
    ['an empty snapshotId', { snapshotId: '', targetIds: ['t-1'] }],
    ['a non-string snapshotId', { snapshotId: 7, targetIds: ['t-1'] }],
    ['empty targetIds', { snapshotId: 's-1', targetIds: [] }],
    ['non-array targetIds', { snapshotId: 's-1', targetIds: 't-1' }],
    ['a numeric target id', { snapshotId: 's-1', targetIds: [18420] }],
    ['an empty-string target id', { snapshotId: 's-1', targetIds: [''] }],
    ['duplicate target ids', { snapshotId: 's-1', targetIds: ['t-1', 't-1'] }],
    [
      'more than the maximum targets',
      {
        snapshotId: 's-1',
        targetIds: Array.from({ length: MAX_PORT_TERMINATION_TARGETS + 1 }, (_, i) => `t-${i}`)
      }
    ]
  ]

  it.each(malformed)('rejects %s with the stable invalid-request code', async (_name, payload) => {
    const { adapter, invoke } = setup()
    adapter.scriptInspections(world)
    await invoke(IPC.ports.list)

    const result = await invoke<Result<unknown, { code: string }>>(IPC.ports.terminate, payload)

    expect(result).toMatchObject({ ok: false, error: { code: 'PORT_REQUEST_INVALID' } })
    // Rejected before the service: no revalidation inspection, no taskkill.
    expect(adapter.inspectCount()).toBe(1)
    expect(adapter.terminateCalls).toEqual([])
  })

  it('accepts exactly { snapshotId, targetIds } and nothing else', () => {
    expect(parseTerminateRequest({ snapshotId: 's-1', targetIds: ['t-1', 't-2'] })).toEqual({
      snapshotId: 's-1',
      targetIds: ['t-1', 't-2']
    })
  })
})

describe('terminate behavior', () => {
  it('passes a valid request through and answers Ok with the per-target result', async () => {
    const { adapter, invoke } = setup()
    const gone = { bindings: [], processes: [identity(OWN_PID, 'GitDeck', 500, 1)] }
    adapter.scriptInspections(world, world, gone)
    await invoke(IPC.ports.list)

    const result = await invoke<Result<{ terminatedTargetIds: string[] }, never>>(
      IPC.ports.terminate,
      { snapshotId: 's-1', targetIds: ['t-1'] }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.terminatedTargetIds).toEqual(['t-1'])
    expect(adapter.terminateCalls).toEqual([18420])
    expect(() => structuredClone(result)).not.toThrow()
  })

  it('answers a stale snapshot with its stable code, so the modal knows to refresh', async () => {
    const { adapter, invoke } = setup()
    adapter.scriptInspections(world)
    await invoke(IPC.ports.list)

    const result = await invoke<Result<unknown, { code: string }>>(IPC.ports.terminate, {
      snapshotId: 'not-current',
      targetIds: ['t-1']
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'PORT_SNAPSHOT_STALE' } })
    expect(adapter.terminateCalls).toEqual([])
  })

  it('registers exactly the two request/response ports channels', () => {
    const handlers = new Map<string, unknown>()
    const registry: IpcHandlerRegistry = {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: (channel, handler) => handlers.set(channel, handler)
    }
    const adapter = createFakePortAdapter()
    const logger = createFakeLogger()
    registerPortsIpc({
      registry,
      ports: new PortService(adapter, logger, { ownPid: OWN_PID }),
      logger
    })

    expect([...handlers.keys()].sort()).toEqual([IPC.ports.list, IPC.ports.terminate].sort())
  })
})
