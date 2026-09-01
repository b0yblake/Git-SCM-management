import { refreshPorts, terminateSelectedPorts, usePorts } from '../hooks/usePorts'
import { usePortsStore } from '../store/portsStore'
import { PortsModal } from './PortsModal'

/**
 * Wires the ports feature: subscribes to the native menu's open signal and
 * hands the presentational modal its state and callbacks. Mounted permanently
 * by the app shell — the subscription must exist before the modal does — and
 * because one host renders at most one modal, a second open signal can only
 * refresh, never stack.
 */
export const PortsModalHost = (): React.JSX.Element | null => {
  usePorts()

  const isOpen = usePortsStore((state) => state.isOpen)
  const phase = usePortsStore((state) => state.phase)
  const snapshot = usePortsStore((state) => state.snapshot)
  const errorMessage = usePortsStore((state) => state.errorMessage)
  const filter = usePortsStore((state) => state.filter)
  const selectedTargetIds = usePortsStore((state) => state.selectedTargetIds)
  const confirming = usePortsStore((state) => state.confirming)
  const terminating = usePortsStore((state) => state.terminating)
  const feedback = usePortsStore((state) => state.feedback)

  if (!isOpen) return null

  return (
    <PortsModal
      phase={phase}
      processes={snapshot?.processes ?? []}
      errorMessage={errorMessage}
      filter={filter}
      selectedTargetIds={selectedTargetIds}
      confirming={confirming}
      terminating={terminating}
      feedback={feedback}
      onClose={() => usePortsStore.getState().close()}
      onRefresh={() => void refreshPorts()}
      onFilterChange={(value) => usePortsStore.getState().setFilter(value)}
      onToggleTarget={(targetId) => usePortsStore.getState().toggleTarget(targetId)}
      onSetSelection={(targetIds) => usePortsStore.getState().setSelection(targetIds)}
      onRequestConfirm={() => usePortsStore.getState().setConfirming(true)}
      onCancelConfirm={() => usePortsStore.getState().setConfirming(false)}
      onConfirm={() => void terminateSelectedPorts()}
    />
  )
}
