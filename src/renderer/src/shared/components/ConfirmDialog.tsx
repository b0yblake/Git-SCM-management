import { useEffect, useId, useRef } from 'react'

export interface ConfirmDialogProps {
  readonly title: string
  /** Muted consequence line under the title. */
  readonly description?: string
  readonly confirmLabel: string
  /** Styles the confirm button as destructive. */
  readonly danger?: boolean
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
 * Keyboard contract: the confirm button is focused on mount so Enter accepts
 * immediately, Escape cancels, and Tab cycles between the two buttons. Enter
 * is also handled at the window level because xterm can reclaim focus after
 * mount — without that, Enter would silently go to the shell instead of the
 * dialog. When a button holds focus, native activation wins to keep Enter on
 * Cancel meaning cancel.
 */
export const ConfirmDialog = ({
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element => {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const next =
          document.activeElement === confirmRef.current ? cancelRef.current : confirmRef.current
        next?.focus()
        return
      }
      if (event.key === 'Enter') {
        const active = document.activeElement
        if (active === confirmRef.current || active === cancelRef.current) {
          return
        }
        event.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onCancel, onConfirm])

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog dialog--confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="dialog__title" id={titleId}>
          {title}
        </p>
        {description && (
          <p className="dialog__description" id={descriptionId}>
            {description}
          </p>
        )}
        <div className="dialog__actions">
          <button
            type="button"
            ref={confirmRef}
            className={danger ? 'dialog__button--danger' : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
