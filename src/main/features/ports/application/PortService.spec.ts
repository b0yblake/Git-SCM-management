import { describe, expect, it } from 'vitest'
import { PORT_SNAPSHOT_TTL_MS } from '@shared/contracts/ports'
import { createFakeLogger } from '@main/testing/FakeLogger'
import {
  InvalidPortRequestError,
  PortAccessDeniedError,
  PortSnapshotStaleError,
  PortTerminationError
} from '../domain/errors'
import type { PortInspection } from '../domain/PortAdapter'
import { binding, createFakePortAdapter, identity } from '../testing/FakePortAdapter'
import { PortService } from './PortService'

/**
 * The safety suite. GitDeck runs as PID 999 in Windows session 1 throughout,
 * and target/snapshot ids are injected counters so assertions are exact.
 */
const OWN_PID = 999

const setup = (nowValue?: { value: number }) => {
  const adapter = createFakePortAdapter()
  const logger = createFakeLogger()
  const now = nowValue ?? { value: 0 }
  let targets = 0
  let snapshots = 0
  const service = new PortService(adapter, logger, {
    ownPid: OWN_PID,
    now: () => now.value,
    newTargetId: () => `t-${++targets}`,
    newSnapshotId: () => `s-${++snapshots}`
  })
  return { adapter, logger, service, now }
}

/** GitDeck's own identity row — how the service learns its own session. */
const self = identity(OWN_PID, 'GitDeck', 500, 1)

const devServer: PortInspection = {
  bindings: [
    binding('tcp', '127.0.0.1', 3000, 18420),
    binding('tcp', '::', 3000, 18420),
    binding('udp', '0.0.0.0', 5353, 18420)
  ],
  processes: [self, identity(18420, 'node', 1_000, 1)]
}

describe('list — enumeration and grouping', () => {
  it('reports a TCP listener with protocol, address, port and owning process', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections({
      bindings: [binding('tcp', '127.0.0.1', 3000, 18420)],
      processes: [self, identity(18420, 'node', 1_000, 1)]
    })

    const snapshot = await service.list()

    expect(snapshot.processes).toHaveLength(1)
    expect(snapshot.processes[0]).toMatchObject({
      pid: 18420,
      processName: 'node',
      canTerminate: true,
      bindings: [{ protocol: 'tcp', localAddress: '127.0.0.1', localPort: 3000 }]
    })
  })

  it('reports a bound UDP endpoint the same way', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections({
      bindings: [binding('udp', '0.0.0.0', 5353, 77)],
      processes: [self, identity(77, 'chrome', 1_000, 1)]
    })

    const snapshot = await service.list()

    expect(snapshot.processes[0]?.bindings).toEqual([
      { protocol: 'udp', localAddress: '0.0.0.0', localPort: 5353 }
    ])
  })

  it('groups every binding a process owns into one row, IPv4 and IPv6 kept distinct', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer)

    const snapshot = await service.list()

    expect(snapshot.processes).toHaveLength(1)
    expect(snapshot.processes[0]?.bindings).toEqual([
      { protocol: 'tcp', localAddress: '127.0.0.1', localPort: 3000 },
      { protocol: 'tcp', localAddress: '::', localPort: 3000 },
      { protocol: 'udp', localAddress: '0.0.0.0', localPort: 5353 }
    ])
  })

  it('collapses an identically duplicated binding rather than showing it twice', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections({
      bindings: [binding('tcp', '::', 8080, 5), binding('tcp', '::', 8080, 5)],
      processes: [self, identity(5, 'java', 1_000, 1)]
    })

    expect((await service.list()).processes[0]?.bindings).toHaveLength(1)
  })

  it('orders rows by lowest port, then name, then pid — and never reshuffles', async () => {
    const { adapter, service } = setup()
    const inspection: PortInspection = {
      bindings: [
        binding('tcp', '::', 9000, 30),
        binding('tcp', '::', 3000, 10),
        binding('tcp', '::', 3000, 20),
        binding('tcp', '::', 3000, 21)
      ],
      processes: [
        self,
        identity(30, 'apache', 1_000, 1),
        identity(10, 'node', 1_000, 1),
        identity(20, 'zsh', 1_000, 1),
        identity(21, 'node', 1_000, 1)
      ]
    }
    adapter.scriptInspections(inspection, inspection)

    const first = await service.list()
    const again = await service.list()

    expect(first.processes.map((process) => process.pid)).toEqual([10, 21, 20, 30])
    expect(again.processes.map((process) => process.pid)).toEqual([10, 21, 20, 30])
  })

  it('answers an empty machine with an empty snapshot, not an error', async () => {
    const { service } = setup()

    const snapshot = await service.list()

    expect(snapshot.processes).toEqual([])
  })

  it('keeps an unreadable process visible as Unknown, but never terminable', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections({
      bindings: [binding('tcp', '::', 8000, 4242)],
      processes: [self] // no identity row for 4242 at all
    })

    const snapshot = await service.list()

    expect(snapshot.processes[0]).toMatchObject({
      processName: 'Unknown',
      canTerminate: false,
      blockedReason: 'identity-unavailable'
    })
  })

  it('the snapshot survives structuredClone, so it can cross the bridge', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer)

    const snapshot = await service.list()

    expect(structuredClone(snapshot)).toEqual(snapshot)
  })
})

describe('list — who may never be terminated', () => {
  const inspection: PortInspection = {
    bindings: [
      binding('tcp', '::', 135, 4),
      binding('udp', '::', 123, 0),
      binding('tcp', '::', 4100, OWN_PID),
      binding('tcp', '::', 4200, 501),
      binding('tcp', '::', 4300, 502),
      binding('tcp', '::', 4400, 503)
    ],
    processes: [
      self,
      identity(4, 'System', null, 0),
      identity(0, 'Idle', null, 0),
      identity(501, 'winlogon', 1_000, 0), // another Windows session
      identity(502, 'ghost', null, 1), // start time unreadable
      identity(503, 'svc', 1_000, null) // session unreadable
    ]
  }

  it.each([
    [4, 'system-process'],
    [0, 'system-process'],
    [OWN_PID, 'gitdeck-process'],
    [501, 'different-session'],
    [502, 'identity-unavailable'],
    [503, 'identity-unavailable']
  ] as const)('pid %d is blocked as %s', async (pid, reason) => {
    const { adapter, service } = setup()
    adapter.scriptInspections(inspection)

    const snapshot = await service.list()
    const row = snapshot.processes.find((process) => process.pid === pid)

    expect(row?.canTerminate).toBe(false)
    expect(row?.blockedReason).toBe(reason)
  })

  it('fails closed when its own session is unknown: nothing else is provably local', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections({
      bindings: [binding('tcp', '::', 3000, 10)],
      processes: [identity(10, 'node', 1_000, 1)] // no row for GitDeck itself
    })

    const snapshot = await service.list()

    expect(snapshot.processes[0]?.blockedReason).toBe('different-session')
  })
})

describe('terminate — snapshot and capability discipline', () => {
  it('mints opaque target ids that do not contain the PID', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer)

    const snapshot = await service.list()

    expect(snapshot.processes[0]?.targetId).toBe('t-1')
    expect(snapshot.id).toBe('s-1')
    expect(snapshot.processes[0]?.targetId.includes('18420')).toBe(false)
  })

  it('a second list invalidates the first snapshot', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer, devServer)
    const first = await service.list()
    await service.list()

    await expect(
      service.terminate({ snapshotId: first.id, targetIds: ['t-1'] })
    ).rejects.toBeInstanceOf(PortSnapshotStaleError)
    expect(adapter.terminateCalls).toEqual([])
  })

  it('an expired snapshot starts no termination command', async () => {
    const now = { value: 0 }
    const { adapter, service } = setup(now)
    adapter.scriptInspections(devServer)
    const snapshot = await service.list()

    now.value = PORT_SNAPSHOT_TTL_MS + 1

    await expect(
      service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })
    ).rejects.toBeInstanceOf(PortSnapshotStaleError)
    expect(adapter.terminateCalls).toEqual([])
  })

  it('an unknown snapshot id starts no termination command', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer)
    await service.list()

    await expect(
      service.terminate({ snapshotId: 'never-issued', targetIds: ['t-1'] })
    ).rejects.toBeInstanceOf(PortSnapshotStaleError)
    expect(adapter.terminateCalls).toEqual([])
  })

  it('an unknown target id starts no termination command', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer)
    const snapshot = await service.list()

    await expect(
      service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1', 'forged'] })
    ).rejects.toBeInstanceOf(InvalidPortRequestError)
    expect(adapter.terminateCalls).toEqual([])
  })

  it('a capability for a blocked process exists but authorizes nothing', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections({
      bindings: [binding('tcp', '::', 135, 4)],
      processes: [self, identity(4, 'System', null, 0)]
    })
    const snapshot = await service.list()
    const blocked = snapshot.processes[0]!.targetId

    await expect(
      service.terminate({ snapshotId: snapshot.id, targetIds: [blocked] })
    ).rejects.toBeInstanceOf(InvalidPortRequestError)
    expect(adapter.terminateCalls).toEqual([])
  })

  it('a snapshot is consumed by the terminate that uses it — no replay', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer)
    const snapshot = await service.list()
    await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })

    await expect(
      service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })
    ).rejects.toBeInstanceOf(PortSnapshotStaleError)
    expect(adapter.terminateCalls).toEqual([18420])
  })
})

describe('terminate — revalidation immediately before the kill', () => {
  it('classifies PID reuse (same PID, different start time) stale and never kills it', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer, {
      bindings: devServer.bindings,
      processes: [self, identity(18420, 'node', 2_000, 1)] // reborn later
    })
    const snapshot = await service.list()

    const result = await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })

    expect(adapter.terminateCalls).toEqual([])
    expect(result.failures).toEqual([
      expect.objectContaining({ targetId: 't-1', code: 'stale-identity' })
    ])
  })

  it('classifies a target that dropped its snapshotted bindings stale and never kills it', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer, {
      bindings: [binding('tcp', '::', 9999, 18420)], // same process, other port now
      processes: devServer.processes
    })
    const snapshot = await service.list()

    const result = await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })

    expect(adapter.terminateCalls).toEqual([])
    expect(result.failures[0]?.code).toBe('stale-bindings')
  })

  it('reports a process that exited between snapshot and confirm as already exited', async () => {
    const { adapter, service } = setup()
    adapter.scriptInspections(devServer, {
      bindings: [],
      processes: [self]
    })
    const snapshot = await service.list()

    const result = await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })

    expect(adapter.terminateCalls).toEqual([])
    expect(result.alreadyExitedTargetIds).toEqual(['t-1'])
    expect(result.failures).toEqual([])
  })
})

describe('terminate — the kills themselves', () => {
  const two: PortInspection = {
    bindings: [
      binding('tcp', '127.0.0.1', 3000, 18420),
      binding('tcp', '::', 3000, 18420),
      binding('udp', '0.0.0.0', 5353, 18420),
      binding('tcp', '::', 4000, 501)
    ],
    processes: [self, identity(18420, 'node', 1_000, 1), identity(501, 'python', 1_000, 1)]
  }

  /** Revalidation sees the same world; verification sees the targets gone. */
  const script = (adapter: ReturnType<typeof createFakePortAdapter>, ...gone: number[]) => {
    adapter.scriptInspections(two, two, {
      bindings: two.bindings.filter((b) => !gone.includes(b.pid)),
      processes: two.processes.filter((p) => !gone.includes(p.pid))
    })
  }

  it('terminates a process exactly once no matter how many ports it owns', async () => {
    const { adapter, service } = setup()
    script(adapter, 18420)
    const snapshot = await service.list()

    const result = await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })

    expect(adapter.terminateCalls).toEqual([18420])
    expect(result.terminatedTargetIds).toEqual(['t-1'])
  })

  it('terminates each distinct selected process once', async () => {
    const { adapter, service } = setup()
    script(adapter, 18420, 501)
    const snapshot = await service.list()

    const result = await service.terminate({
      snapshotId: snapshot.id,
      targetIds: ['t-1', 't-2']
    })

    expect(adapter.terminateCalls).toEqual([18420, 501])
    expect(result.terminatedTargetIds).toEqual(['t-1', 't-2'])
  })

  it('collapses a duplicated target id instead of killing twice', async () => {
    const { adapter, service } = setup()
    script(adapter, 18420)
    const snapshot = await service.list()

    await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1', 't-1'] })

    expect(adapter.terminateCalls).toEqual([18420])
  })

  it('treats an already-exited answer from the adapter as harmless, and separately', async () => {
    const { adapter, service } = setup()
    script(adapter, 18420)
    adapter.scriptTermination(18420, 'already-exited')
    const snapshot = await service.list()

    const result = await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })

    expect(result.alreadyExitedTargetIds).toEqual(['t-1'])
    expect(result.terminatedTargetIds).toEqual([])
    expect(result.failures).toEqual([])
  })

  it('access denied on one target does not stop the next', async () => {
    const { adapter, service } = setup()
    script(adapter, 501) // only python actually goes away
    adapter.scriptTermination(18420, new PortAccessDeniedError())
    const snapshot = await service.list()

    const result = await service.terminate({
      snapshotId: snapshot.id,
      targetIds: ['t-1', 't-2']
    })

    expect(adapter.terminateCalls).toEqual([18420, 501])
    expect(result.failures).toEqual([
      expect.objectContaining({ targetId: 't-1', code: 'access-denied' })
    ])
    expect(result.terminatedTargetIds).toEqual(['t-2'])
  })

  it('an unexpected adapter failure is a per-target failure, not an exception', async () => {
    const { adapter, service } = setup()
    script(adapter, 501)
    adapter.scriptTermination(18420, new PortTerminationError('taskkill exited 1'))
    const snapshot = await service.list()

    const result = await service.terminate({
      snapshotId: snapshot.id,
      targetIds: ['t-1', 't-2']
    })

    expect(result.failures[0]?.code).toBe('termination-failed')
    expect(result.terminatedTargetIds).toEqual(['t-2'])
  })

  it('never reports success while the snapshotted binding is still owned', async () => {
    const { adapter, service } = setup()
    // Verification still shows node holding port 3000: taskkill said yes, the
    // OS says otherwise, and the OS wins.
    adapter.scriptInspections(two, two, two)
    const snapshot = await service.list()

    const result = await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })

    expect(result.terminatedTargetIds).toEqual([])
    expect(result.failures[0]?.code).toBe('not-released')
  })

  it('the result survives structuredClone', async () => {
    const { adapter, service } = setup()
    script(adapter, 18420)
    const snapshot = await service.list()

    const result = await service.terminate({ snapshotId: snapshot.id, targetIds: ['t-1'] })

    expect(structuredClone(result)).toEqual(result)
  })
})
