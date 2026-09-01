import { useEffect, useRef } from 'react'
import type { PortBinding, PortProcess, PortTerminationBlockReason } from '@shared/contracts/ports'
import type { PortsFeedbackRow, PortsPhase } from '../store/portsStore'

/** Why a row cannot be selected, in words a user can act on. */
export const BLOCKED_REASON_LABELS: Record<PortTerminationBlockReason, string> = {
  'system-process': 'Windows system process',
  'gitdeck-process': 'This is GitDeck itself',
  'different-session': 'Owned by another Windows session',
  'identity-unavailable': 'Process identity could not be read'
}

/** Matches port, PID or process name; an empty filter matches everything. */
export const matchesPortFilter = (process: PortProcess, filter: string): boolean => {
  const needle = filter.trim().toLowerCase()
  if (needle === '') return true
  return (
    String(process.pid).includes(needle) ||
    process.processName.toLowerCase().includes(needle) ||
    process.bindings.some((binding) => String(binding.localPort).includes(needle))
  )
}

const formatBinding = (binding: PortBinding): string =>
  `${binding.protocol.toUpperCase()} ${binding.localAddress}:${binding.localPort}`

const FEEDBACK_PREFIX: Record<PortsFeedbackRow['kind'], string> = {
  terminated: 'Terminated',
  'already-exited': 'Already exited',
  failed: 'Failed'
}

export interface PortsModalProps {
  readonly phase: PortsPhase
  /** Already grouped and deterministically sorted by Main. */
  readonly processes: readonly PortProcess[]
  readonly errorMessage: string | null
  readonly filter: string
  readonly selectedTargetIds: readonly string[]
  readonly confirming: boolean
  readonly terminating: boolean
  readonly feedback: readonly PortsFeedbackRow[] | null
  readonly onClose: () => void
  readonly onRefresh: () => void
  readonly onFilterChange: (filter: string) => void
  readonly onToggleTarget: (targetId: string) => void
  readonly onSetSelection: (targetIds: readonly string[]) => void
  readonly onRequestConfirm: () => void
  readonly onCancelConfirm: () => void
  readonly onConfirm: () => void
}

/**
 * The ports modal. Purely presentational: every fact arrives as a prop and
 * every intent leaves as a callback — it never touches `window.gitdeck`.
 *
 * The wording is deliberate: the UI says "terminate", names the owning
 * process, and lists every port that goes with it, because the operation is
 * process termination and one process may hold several ports.
 */
export const PortsModal = ({
  phase,
  processes,
  errorMessage,
  filter,
  selectedTargetIds,
  confirming,
  terminating,
  feedback,
  onClose,
  onRefresh,
  onFilterChange,
  onToggleTarget,
  onSetSelection,
  onRequestConfirm,
  onCancelConfirm,
  onConfirm
}: PortsModalProps): React.JSX.Element => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  // Focus moves in on open and back out on close, so the modal is reachable
  // and leavable without a mouse.
  useEffect(() => {
    const previous = document.activeElement
    filterRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  // Escape listens on the window, not the dialog: after a button that had
  // focus disappears, focus falls back to body — and Escape must still work.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (confirming) onCancelConfirm()
      else onClose()
    }
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('keydown', onEscape)
    }
  }, [confirming, onCancelConfirm, onClose])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Tab') return

    // Minimal focus trap: Tab wraps inside the dialog instead of escaping to
    // the terminals behind the backdrop.
    const focusables = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)'
      ) ?? [])
    ]
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (!first || !last) return

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const visible = processes.filter((process) => matchesPortFilter(process, filter))
  const visibleKillable = visible.filter((process) => process.canTerminate)
  const allVisibleSelected =
    visibleKillable.length > 0 &&
    visibleKillable.every((process) => selectedTargetIds.includes(process.targetId))

  // Select-all acts on what the user can currently see and kill — and only on
  // that, so selections hidden by the filter survive untouched.
  const toggleAllVisible = (): void => {
    const visibleIds = new Set(visibleKillable.map((process) => process.targetId))
    onSetSelection(
      allVisibleSelected
        ? selectedTargetIds.filter((id) => !visibleIds.has(id))
        : [...new Set([...selectedTargetIds, ...visibleIds])]
    )
  }

  const selected = processes.filter((process) => selectedTargetIds.includes(process.targetId))
  const confirmLabel = `Terminate ${selected.length} ${selected.length === 1 ? 'process' : 'processes'}`

  return (
    <div className="dialog-backdrop" onMouseDown={confirming ? onCancelConfirm : onClose}>
      <div
        ref={dialogRef}
        className="dialog ports-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Ports"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="ports-modal__header">
          <h2 className="ports-modal__title">Ports</h2>
          <button type="button" onClick={onRefresh} disabled={terminating}>
            Refresh
          </button>
          <button type="button" aria-label="Close ports" onClick={onClose}>
            ×
          </button>
        </header>

        {confirming ? (
          <section className="ports-modal__confirm" aria-label="Confirm termination">
            <p className="ports-modal__confirm-warning">
              Each process below ends immediately, and <strong>every port it owns</strong> is
              released:
            </p>
            <ul className="ports-modal__confirm-list">
              {selected.map((process) => (
                <li key={process.targetId}>
                  <strong>{process.processName}</strong> (PID {process.pid}) —{' '}
                  {process.bindings.map(formatBinding).join(' · ')}
                </li>
              ))}
            </ul>
            <div className="dialog__actions">
              <button type="button" onClick={onConfirm} disabled={terminating}>
                {terminating ? 'Terminating…' : confirmLabel}
              </button>
              <button type="button" onClick={onCancelConfirm} disabled={terminating}>
                Cancel
              </button>
            </div>
          </section>
        ) : (
          <>
            <p className="ports-modal__hint">
              Terminating a selected process releases every port it owns.
            </p>

            <input
              ref={filterRef}
              type="text"
              className="ports-modal__filter"
              aria-label="Filter by port, PID or process name"
              placeholder="Filter by port, PID or process name"
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
            />

            {phase === 'error' ? (
              <p className="ports-modal__error" role="alert">
                {errorMessage ?? 'Ports could not be inspected.'}
              </p>
            ) : processes.length === 0 ? (
              <p className="ports-modal__empty">
                {phase === 'loading'
                  ? 'Inspecting local ports…'
                  : 'No local TCP listeners or bound UDP endpoints.'}
              </p>
            ) : visible.length === 0 ? (
              <p className="ports-modal__empty">No processes match the filter.</p>
            ) : (
              <div className="ports-modal__table-wrap">
                <table className="ports-modal__table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select all visible killable processes"
                          checked={allVisibleSelected}
                          disabled={visibleKillable.length === 0 || terminating}
                          onChange={toggleAllVisible}
                        />
                      </th>
                      <th>Process</th>
                      <th>PID</th>
                      <th>Ports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((process) => (
                      <tr
                        key={process.targetId}
                        className={process.canTerminate ? undefined : 'ports-modal__row--blocked'}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${process.processName} (PID ${process.pid})`}
                            checked={selectedTargetIds.includes(process.targetId)}
                            disabled={!process.canTerminate || terminating}
                            onChange={() => onToggleTarget(process.targetId)}
                          />
                        </td>
                        <td>
                          <span className="ports-modal__name">{process.processName}</span>
                          {process.blockedReason && (
                            <span className="ports-modal__blocked-reason">
                              {BLOCKED_REASON_LABELS[process.blockedReason]}
                            </span>
                          )}
                        </td>
                        <td>{process.pid}</td>
                        <td className="ports-modal__bindings">
                          {process.bindings.map(formatBinding).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {feedback && feedback.length > 0 && (
              <ul className="ports-modal__feedback" role="status" aria-label="Termination results">
                {feedback.map((row, index) => (
                  <li key={index} className={`ports-modal__feedback-row--${row.kind}`}>
                    {FEEDBACK_PREFIX[row.kind]}: {row.label}
                    {row.detail ? ` — ${row.detail}` : ''}
                  </li>
                ))}
              </ul>
            )}

            <div className="dialog__actions">
              <button
                type="button"
                onClick={onRequestConfirm}
                disabled={selected.length === 0 || terminating}
              >
                Terminate selected
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
