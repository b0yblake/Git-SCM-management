import { useEffect } from 'react'
import { TOAST_DISMISS_MS, useToastStore, type Toast as ToastModel } from '../store/toastStore'

export interface ToastProps {
  readonly toast: ToastModel
  readonly onDismiss: (id: number) => void
  /** Overridable so a test does not have to wait six real seconds. */
  readonly dismissAfterMs?: number
}

/**
 * One message. It dismisses itself on a timer and can be dismissed by hand,
 * because an error the user has already read should not keep occupying space.
 */
export const Toast = ({
  toast,
  onDismiss,
  dismissAfterMs = TOAST_DISMISS_MS
}: ToastProps): React.JSX.Element => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), dismissAfterMs)
    return () => {
      clearTimeout(timer)
    }
  }, [toast.id, onDismiss, dismissAfterMs])

  return (
    <li className={`toast toast--${toast.tone}`}>
      <span className="toast__message">{toast.message}</span>
      <button
        type="button"
        className="toast__dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss: ${toast.message}`}
      >
        ×
      </button>
    </li>
  )
}

/**
 * Renders every live toast.
 *
 * `role="log"` rather than `alert`: several may arrive at once, and a screen
 * reader interrupting itself per message is worse than reading them in order.
 */
export const ToastHost = (): React.JSX.Element | null => {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  if (toasts.length === 0) return null

  return (
    <ul className="toast-host" role="log" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </ul>
  )
}
