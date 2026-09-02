import { useEffect, useId, useState } from 'react'
import type { DataFolderInfo } from '@shared/contracts/storage'

/**
 * Where GitDeck keeps its data, and the button to move it (Phase 17).
 *
 * Owns its own IPC like `UpdateCheckControl` does: the folder path is not an
 * `AppSettings` field (the app must know it before settings can be read), so
 * it cannot flow through the normal settings patch plumbing. Choosing opens
 * the native picker in Main — no path ever leaves the renderer — and the
 * switch applies on the next launch, stated right in the UI.
 */
export const DataFolderSetting = (): React.JSX.Element => {
  const id = useId()
  const [info, setInfo] = useState<DataFolderInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.gitdeck.storage.dataFolder().then((result) => {
      if (!cancelled && result.ok) setInfo(result.value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const choose = async (): Promise<void> => {
    setChoosing(true)
    setError(null)
    const result = await window.gitdeck.storage.chooseDataFolder()
    setChoosing(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    // null means the picker was cancelled — nothing changes.
    if (result.value) setInfo(result.value)
  }

  return (
    <div className="data-folder">
      <h2>Data</h2>

      <label htmlFor={`${id}-path`}>Data folder</label>
      <div className="data-folder__row">
        <input
          id={`${id}-path`}
          className="data-folder__path"
          type="text"
          readOnly
          value={info?.current ?? ''}
        />
        <button type="button" disabled={choosing || info === null} onClick={() => void choose()}>
          {choosing ? 'Choosing…' : 'Change…'}
        </button>
      </div>
      <p className="data-folder__hint">
        Settings, workspaces and backups are stored here. Terminal output never is.
      </p>

      {info?.pending && (
        <p className="data-folder__pending" role="status">
          Data moves to <code>{info.pending}</code> the next time GitDeck starts. The current folder
          is left untouched.
        </p>
      )}
      {error && (
        <p className="settings-screen__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
