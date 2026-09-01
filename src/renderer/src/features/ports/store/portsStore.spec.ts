import { beforeEach, describe, expect, it } from 'vitest'
import type { PortProcess, PortSnapshot } from '@shared/contracts/ports'
import { usePortsStore } from './portsStore'

const proc = (targetId: string, overrides: Partial<PortProcess> = {}): PortProcess => ({
  targetId,
  pid: 100,
  processName: 'node',
  startedAt: 1_000,
  bindings: [{ protocol: 'tcp', localAddress: '127.0.0.1', localPort: 3000 }],
  canTerminate: true,
  ...overrides
})

const snap = (id: string, ...processes: PortProcess[]): PortSnapshot => ({
  id,
  capturedAt: 0,
  processes
})

const store = () => usePortsStore.getState()

beforeEach(() => {
  usePortsStore.getState().close()
})

describe('open and close', () => {
  it('starts closed with nothing loaded', () => {
    expect(store().isOpen).toBe(false)
    expect(store().snapshot).toBeNull()
  })

  it('open only opens; a second open is harmless', () => {
    store().open()
    store().open()

    expect(store().isOpen).toBe(true)
  })

  it('close forgets everything — a snapshot is capabilities, not decoration', () => {
    store().open()
    store().resolveLoad(snap('s-1', proc('t-1')))
    store().toggleTarget('t-1')
    store().setFilter('node')
    store().finishTerminate([{ kind: 'terminated', label: 'node (PID 100)' }])

    store().close()

    expect(store()).toMatchObject({
      isOpen: false,
      snapshot: null,
      selectedTargetIds: [],
      filter: '',
      feedback: null
    })
  })
})

describe('loading transitions', () => {
  it('beginLoad keeps the previous snapshot visible while refreshing', () => {
    store().resolveLoad(snap('s-1', proc('t-1')))

    store().beginLoad()

    expect(store().phase).toBe('loading')
    expect(store().snapshot?.id).toBe('s-1')
  })

  it('a failure clears the table and shows the message', () => {
    store().resolveLoad(snap('s-1', proc('t-1')))
    store().toggleTarget('t-1')

    store().rejectLoad('powershell unavailable')

    expect(store()).toMatchObject({
      phase: 'error',
      errorMessage: 'powershell unavailable',
      snapshot: null,
      selectedTargetIds: []
    })
  })

  it('a fresh snapshot clears selections that no longer name a killable target', () => {
    store().resolveLoad(snap('s-1', proc('t-1'), proc('t-2')))
    store().setSelection(['t-1', 't-2'])

    // t-1 survives, t-2 is gone, t-3 is new but blocked.
    store().resolveLoad(
      snap(
        's-2',
        proc('t-1'),
        proc('t-3', { canTerminate: false, blockedReason: 'system-process' })
      )
    )

    expect(store().selectedTargetIds).toEqual(['t-1'])
  })
})

describe('filter and selection stay independent', () => {
  it('setting the filter never touches the selection', () => {
    store().resolveLoad(snap('s-1', proc('t-1')))
    store().toggleTarget('t-1')

    store().setFilter('3000')
    store().setFilter('')

    expect(store().selectedTargetIds).toEqual(['t-1'])
  })

  it('toggle adds and removes one target', () => {
    store().toggleTarget('t-1')
    store().toggleTarget('t-2')
    store().toggleTarget('t-1')

    expect(store().selectedTargetIds).toEqual(['t-2'])
  })
})

describe('termination transitions', () => {
  it('beginTerminate leaves confirmation mode and clears old feedback', () => {
    store().setConfirming(true)
    store().finishTerminate([{ kind: 'failed', label: 'old' }])

    store().beginTerminate()

    expect(store()).toMatchObject({ terminating: true, confirming: false, feedback: null })
  })

  it('finishTerminate stores the per-target feedback rows', () => {
    store().beginTerminate()

    store().finishTerminate([
      { kind: 'terminated', label: 'node (PID 100)' },
      { kind: 'failed', label: 'svc (PID 7)', detail: 'access denied' }
    ])

    expect(store().terminating).toBe(false)
    expect(store().feedback).toHaveLength(2)
  })
})

it('the whole state survives a JSON round trip — serializable data only', () => {
  store().open()
  store().resolveLoad(snap('s-1', proc('t-1')))
  store().toggleTarget('t-1')
  store().finishTerminate([{ kind: 'terminated', label: 'node (PID 100)' }])

  const state = {
    isOpen: store().isOpen,
    phase: store().phase,
    snapshot: store().snapshot,
    selectedTargetIds: store().selectedTargetIds,
    feedback: store().feedback
  }

  expect(JSON.parse(JSON.stringify(state))).toEqual(state)
})
