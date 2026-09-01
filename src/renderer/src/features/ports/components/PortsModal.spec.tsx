import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortProcess } from '@shared/contracts/ports'
import {
  createFakeGitDeckApi,
  emptyCalls,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { usePortsStore } from '../store/portsStore'
import { PortsModal, matchesPortFilter } from './PortsModal'
import { PortsModalHost } from './PortsModalHost'

let api: FakeGitDeckApi

const NODE: PortProcess = {
  targetId: 't-node',
  pid: 18420,
  processName: 'node',
  startedAt: 1_000,
  bindings: [
    { protocol: 'tcp', localAddress: '127.0.0.1', localPort: 3000 },
    { protocol: 'udp', localAddress: '0.0.0.0', localPort: 5353 }
  ],
  canTerminate: true
}

const PYTHON: PortProcess = {
  targetId: 't-python',
  pid: 8100,
  processName: 'python',
  startedAt: 1_000,
  bindings: [{ protocol: 'tcp', localAddress: '::', localPort: 8000 }],
  canTerminate: true
}

const SYSTEM: PortProcess = {
  targetId: 't-system',
  pid: 4,
  processName: 'System',
  startedAt: null,
  bindings: [{ protocol: 'tcp', localAddress: '::', localPort: 445 }],
  canTerminate: false,
  blockedReason: 'system-process'
}

beforeEach(() => {
  usePortsStore.getState().close()
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

/** Fires the native menu signal and lets the resulting list request settle. */
const openModal = async (): Promise<void> => {
  await act(async () => {
    api.emitPortsOpen()
  })
}

const checkbox = (process: PortProcess): HTMLInputElement =>
  screen.getByLabelText<HTMLInputElement>(`Select ${process.processName} (PID ${process.pid})`)

describe('opening from the native menu', () => {
  it('one open event opens one modal and starts exactly one fresh list request', async () => {
    render(<PortsModalHost />)

    await openModal()

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(api.calls.portsList).toBe(1)
  })

  it('a second open event refreshes the existing modal — it never stacks another', async () => {
    render(<PortsModalHost />)

    await openModal()
    await openModal()

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(api.calls.portsList).toBe(2)
  })

  it('unmounting the host unsubscribes from the menu signal', () => {
    const { unmount } = render(<PortsModalHost />)
    expect(api.listenerCount()).toBe(1)

    unmount()

    expect(api.listenerCount()).toBe(0)
  })
})

describe('the three quiet states', () => {
  it('shows the loading state while the first inspection runs', () => {
    render(
      <PortsModal
        phase="loading"
        processes={[]}
        errorMessage={null}
        filter=""
        selectedTargetIds={[]}
        confirming={false}
        terminating={false}
        feedback={null}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onFilterChange={vi.fn()}
        onToggleTarget={vi.fn()}
        onSetSelection={vi.fn()}
        onRequestConfirm={vi.fn()}
        onCancelConfirm={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('Inspecting local ports…')).toBeTruthy()
  })

  it('shows an empty machine as an empty list, not an error', async () => {
    render(<PortsModalHost />)

    await openModal()

    expect(screen.getByText('No local TCP listeners or bound UDP endpoints.')).toBeTruthy()
  })

  it('shows a handled inspection error, with the message', async () => {
    api.failPortsList()
    render(<PortsModalHost />)

    await openModal()

    expect(screen.getByRole('alert').textContent).toContain('inspection blew up')
  })
})

describe('the process table', () => {
  it('renders one row per process with name, PID and every binding', async () => {
    api.setPortsProcesses(NODE, SYSTEM)
    render(<PortsModalHost />)

    await openModal()

    expect(screen.getByText('node')).toBeTruthy()
    expect(screen.getByText('18420')).toBeTruthy()
    expect(screen.getByText('TCP 127.0.0.1:3000 · UDP 0.0.0.0:5353')).toBeTruthy()
  })

  it('disables a protected row and says why', async () => {
    api.setPortsProcesses(NODE, SYSTEM)
    render(<PortsModalHost />)

    await openModal()

    expect(checkbox(SYSTEM).disabled).toBe(true)
    expect(screen.getByText('Windows system process')).toBeTruthy()
  })

  it('filters by port, PID and name', () => {
    expect(matchesPortFilter(NODE, '3000')).toBe(true)
    expect(matchesPortFilter(NODE, '18420')).toBe(true)
    expect(matchesPortFilter(NODE, 'NoDe')).toBe(true)
    expect(matchesPortFilter(NODE, '8000')).toBe(false)
    expect(matchesPortFilter(NODE, '')).toBe(true)
  })

  it('filtering hides rows without discarding the existing selection', async () => {
    api.setPortsProcesses(NODE, PYTHON)
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(checkbox(NODE))
    fireEvent.change(screen.getByLabelText('Filter by port, PID or process name'), {
      target: { value: '8000' }
    })

    expect(screen.queryByText('node')).toBeNull()

    fireEvent.change(screen.getByLabelText('Filter by port, PID or process name'), {
      target: { value: '' }
    })

    expect(checkbox(NODE).checked).toBe(true)
  })

  it('select-all selects only visible, killable processes', async () => {
    api.setPortsProcesses(NODE, PYTHON, SYSTEM)
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(screen.getByLabelText('Select all visible killable processes'))

    expect(checkbox(NODE).checked).toBe(true)
    expect(checkbox(PYTHON).checked).toBe(true)
    expect(checkbox(SYSTEM).checked).toBe(false)
  })
})

describe('confirmation and termination', () => {
  it('Terminate selected stays disabled while nothing killable is selected', async () => {
    api.setPortsProcesses(NODE)
    render(<PortsModalHost />)
    await openModal()

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Terminate selected' }).disabled
    ).toBe(true)
  })

  it('the confirmation names every selected process and all affected bindings', async () => {
    api.setPortsProcesses(NODE, PYTHON)
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(checkbox(NODE))
    fireEvent.click(screen.getByRole('button', { name: 'Terminate selected' }))

    const confirmation = screen.getByLabelText('Confirm termination')
    expect(confirmation.textContent).toContain('node')
    expect(confirmation.textContent).toContain('PID 18420')
    expect(confirmation.textContent).toContain('TCP 127.0.0.1:3000')
    expect(confirmation.textContent).toContain('UDP 0.0.0.0:5353')
    expect(confirmation.textContent).toContain('every port it owns')
  })

  it('cancelling makes zero terminate calls', async () => {
    api.setPortsProcesses(NODE)
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(checkbox(NODE))
    fireEvent.click(screen.getByRole('button', { name: 'Terminate selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(api.calls.portsTerminate).toEqual([])
    expect(screen.getByRole('button', { name: 'Terminate selected' })).toBeTruthy()
  })

  it('confirming sends only the snapshot id and target ids — never a PID', async () => {
    api.setPortsProcesses(NODE)
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(checkbox(NODE))
    fireEvent.click(screen.getByRole('button', { name: 'Terminate selected' }))
    api.setPortsProcesses() // the refresh after the kill finds the port gone
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Terminate 1 process' }))
    })

    expect(api.calls.portsTerminate).toEqual([{ snapshotId: 'snap_fake-1', targetIds: ['t-node'] }])
    expect(Object.keys(api.calls.portsTerminate[0]!).sort()).toEqual(['snapshotId', 'targetIds'])
  })

  it('after the kill it reports the result, refreshes, and clears the stale selection', async () => {
    api.setPortsProcesses(NODE)
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(checkbox(NODE))
    fireEvent.click(screen.getByRole('button', { name: 'Terminate selected' }))
    api.setPortsProcesses()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Terminate 1 process' }))
    })

    expect(screen.getByRole('status').textContent).toContain('Terminated: node (PID 18420)')
    expect(api.calls.portsList).toBe(2)
    expect(screen.queryByText('node')).toBeNull()
    expect(usePortsStore.getState().selectedTargetIds).toEqual([])
  })

  it('surfaces partial failure per target while the successful row still clears', async () => {
    api.setPortsProcesses(NODE, PYTHON)
    api.setPortsTerminateResult({
      terminatedTargetIds: ['t-node'],
      alreadyExitedTargetIds: [],
      failures: [{ targetId: 't-python', code: 'access-denied', message: 'Windows said no' }]
    })
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(checkbox(NODE))
    fireEvent.click(checkbox(PYTHON))
    fireEvent.click(screen.getByRole('button', { name: 'Terminate selected' }))
    api.setPortsProcesses(PYTHON) // python survived, node's port is gone
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Terminate 2 processes' }))
    })

    const status = screen.getByRole('status').textContent
    expect(status).toContain('Terminated: node (PID 18420)')
    expect(status).toContain('Failed: python (PID 8100) — Windows said no')
    expect(screen.queryByText('node')).toBeNull()
    expect(screen.getByText('python')).toBeTruthy()
  })

  it('a whole-request rejection — a stale snapshot — is reported and recovered from', async () => {
    api.setPortsProcesses(NODE)
    api.failPortsTerminate('PORT_SNAPSHOT_STALE', 'This port list is out of date.')
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(checkbox(NODE))
    fireEvent.click(screen.getByRole('button', { name: 'Terminate selected' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Terminate 1 process' }))
    })

    expect(screen.getByRole('status').textContent).toContain('This port list is out of date.')
    expect(api.calls.portsList).toBe(2) // it refreshed to recover
  })
})

describe('keyboard and focus', () => {
  it('moves focus in on open and back to the previous control on close', async () => {
    render(
      <>
        <button type="button" data-testid="outside">
          outside
        </button>
        <PortsModalHost />
      </>
    )
    const outside = screen.getByTestId('outside')
    outside.focus()

    await openModal()
    expect(document.activeElement).toBe(
      screen.getByLabelText('Filter by port, PID or process name')
    )

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(outside)
  })

  it('Escape in the confirmation steps back instead of closing the modal', async () => {
    api.setPortsProcesses(NODE)
    render(<PortsModalHost />)
    await openModal()

    fireEvent.click(checkbox(NODE))
    fireEvent.click(screen.getByRole('button', { name: 'Terminate selected' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Terminate selected' })).toBeTruthy()
  })

  it('closes from the backdrop without a terminate call', async () => {
    api.setPortsProcesses(NODE)
    render(<PortsModalHost />)
    await openModal()

    fireEvent.mouseDown(document.querySelector('.dialog-backdrop')!)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.calls.portsTerminate).toEqual([])
  })

  it('Tab wraps inside the dialog instead of escaping it', async () => {
    api.setPortsProcesses(NODE)
    render(<PortsModalHost />)
    await openModal()
    fireEvent.click(checkbox(NODE))

    const terminate = screen.getByRole('button', { name: 'Terminate selected' })
    terminate.focus()
    fireEvent.keyDown(terminate, { key: 'Tab' })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Refresh' }))

    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(terminate)
  })
})

describe('boundaries', () => {
  it('the presentational modal makes zero calls of its own', () => {
    render(
      <PortsModal
        phase="ready"
        processes={[NODE, SYSTEM]}
        errorMessage={null}
        filter=""
        selectedTargetIds={['t-node']}
        confirming={false}
        terminating={false}
        feedback={[{ kind: 'terminated', label: 'old (PID 1)' }]}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onFilterChange={vi.fn()}
        onToggleTarget={vi.fn()}
        onSetSelection={vi.fn()}
        onRequestConfirm={vi.fn()}
        onCancelConfirm={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(api.calls).toEqual(emptyCalls())
  })
})
