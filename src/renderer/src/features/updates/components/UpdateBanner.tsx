import { useUpdates } from '../hooks/useUpdates'

/**
 * The startup update notification (Phase 16).
 *
 * A notification, not a modal: `role="status"`, no focus trap, never steals
 * keyboard from the active terminal. Escape dismisses it only while focus is
 * inside the banner.
 */
export const UpdateBanner = (): React.JSX.Element | null => {
  const { available, openRelease, skipVersion, dismiss } = useUpdates()

  const latest = available?.latest
  if (!latest) return null

  return (
    <div
      className="update-banner"
      role="status"
      aria-label={`GitDeck ${latest.version} is available`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') dismiss()
      }}
    >
      <span className="update-banner__message">
        <strong>GitDeck {latest.version}</strong> is available — you have{' '}
        {available.currentVersion}.
      </span>
      <div className="update-banner__actions">
        <button
          type="button"
          className="update-banner__primary"
          onClick={() => void openRelease()}
        >
          View release
        </button>
        <button type="button" onClick={() => void skipVersion(latest.version)}>
          Skip this version
        </button>
        <button type="button" onClick={dismiss}>
          Later
        </button>
      </div>
    </div>
  )
}
