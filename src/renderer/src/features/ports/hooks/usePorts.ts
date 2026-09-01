import { useEffect } from 'react'
import type { PortProcess } from '@shared/contracts/ports'
import { usePortsStore, type PortsFeedbackRow } from '../store/portsStore'

/**
 * The only place in the renderer's ports feature that talks to
 * `window.gitdeck`. Components below the host stay presentational.
 */

const labelFor = (process: PortProcess | undefined): string =>
  process ? `${process.processName} (PID ${process.pid})` : 'Unknown process'

export const refreshPorts = async (): Promise<void> => {
  usePortsStore.getState().beginLoad()
  const result = await window.gitdeck.ports.list()
  if (result.ok) usePortsStore.getState().resolveLoad(result.value)
  else usePortsStore.getState().rejectLoad(result.error.message)
}

/**
 * Sends the confirmed selection — snapshot id and opaque target ids, nothing
 * else — then turns the per-target result into readable feedback and refreshes
 * so the list shows what is actually still bound.
 */
export const terminateSelectedPorts = async (): Promise<void> => {
  const { snapshot, selectedTargetIds } = usePortsStore.getState()
  if (snapshot === null || selectedTargetIds.length === 0) return

  const byId = new Map(snapshot.processes.map((process) => [process.targetId, process]))
  usePortsStore.getState().beginTerminate()

  const result = await window.gitdeck.ports.terminate({
    snapshotId: snapshot.id,
    targetIds: selectedTargetIds
  })

  const rows: PortsFeedbackRow[] = []
  if (!result.ok) {
    // Whole-request rejection — most likely a stale snapshot. The refresh
    // below re-arms the modal against reality.
    rows.push({ kind: 'failed', label: 'Nothing was terminated', detail: result.error.message })
  } else {
    for (const id of result.value.terminatedTargetIds) {
      rows.push({ kind: 'terminated', label: labelFor(byId.get(id)) })
    }
    for (const id of result.value.alreadyExitedTargetIds) {
      rows.push({ kind: 'already-exited', label: labelFor(byId.get(id)) })
    }
    for (const failure of result.value.failures) {
      rows.push({
        kind: 'failed',
        label: labelFor(byId.get(failure.targetId)),
        detail: failure.message
      })
    }
  }

  usePortsStore.getState().finishTerminate(rows)
  await refreshPorts()
}

/**
 * Subscribes to the native menu's open signal for as long as the host is
 * mounted. A second signal while the modal is already open refreshes it —
 * `isOpen` just stays true, so a stacked copy cannot exist.
 */
export const usePorts = (): void => {
  useEffect(
    () =>
      window.gitdeck.ports.onOpen(() => {
        usePortsStore.getState().open()
        void refreshPorts()
      }),
    []
  )
}
