import { useEffect, useRef } from 'react'

export interface ConfirmDialogProps {
  readonly title: string
  readonly confirmLabel: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/**
 * Replaces `window.confirm`, which Phase 4 deferred to here.
 *
 * `window.confirm` blocks the whole renderer thread: correct for a person, but
 * it freezes every terminal in the window while it is up, and it made the app
 * undriveable from automation. This does neither.
 *
 * Focus moves in on mount and Escape cancels, so the dialog is reachable and
 * escapable without a mouse.
 */
export const ConfirmDialog = ({
  title,
  confirmLabel,
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element => {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onCancel])

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="dialog__title">{title}</p>
        <div className="dialog__actions">
          <button type="button" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
