import { useState } from 'react'
import type { UpdateCheckResult } from '@shared/contracts/updates'

/**
 * The Settings-screen manual check. Unlike the automatic path, every outcome
 * is shown inline — the user explicitly asked, so silence would read as
 * broken.
 */
export const UpdateCheckControl = (): React.JSX.Element => {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<UpdateCheckResult | null>(null)

  const check = async (): Promise<void> => {
    setChecking(true)
    setResult(null)
    const answer = await window.gitdeck.updates.check()
    setChecking(false)
    if (answer.ok) setResult(answer.value)
    else setResult({ status: 'check-failed', currentVersion: '', latest: null })
  }

  return (
    <div className="update-check">
      <button type="button" disabled={checking} onClick={() => void check()}>
        {checking ? 'Checking…' : 'Check for updates'}
      </button>

      {result?.status === 'up-to-date' && (
        <p className="update-check__result" role="status">
          You're up to date.
        </p>
      )}
      {result?.status === 'check-failed' && (
        <p className="update-check__result" role="status">
          Couldn't reach GitHub to check. Try again later.
        </p>
      )}
      {result?.status === 'update-available' && result.latest && (
        <p className="update-check__result" role="status">
          GitDeck {result.latest.version} is available.{' '}
          <button
            type="button"
            className="update-check__link"
            onClick={() => void window.gitdeck.updates.openRelease()}
          >
            View release
          </button>
        </p>
      )}
    </div>
  )
}
