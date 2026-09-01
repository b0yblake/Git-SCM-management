import { useId, useState } from 'react'
import {
  isValidFontSize,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type AppSettings,
  type AppSettingsPatch
} from '@shared/contracts/settings'
import type { AvailableShellProfile, ShellProfileId } from '@shared/contracts/terminal'
import { StartupSettings } from './StartupSettings'

export interface SettingsScreenProps {
  readonly settings: AppSettings
  /** Detected by Main; the renderer never decides which shells exist. */
  readonly profiles: readonly AvailableShellProfile[]
  readonly onChange: (patch: AppSettingsPatch) => void
}

/**
 * Every persisted preference, in one place.
 *
 * Purely presentational: it reports patches and never touches the bridge. Each
 * control sends **only** the field it changed, so two settings can never be
 * overwritten by one edit.
 */
export const SettingsScreen = ({
  settings,
  profiles,
  onChange
}: SettingsScreenProps): React.JSX.Element => {
  const id = useId()
  // The input holds text while it is being typed: "1" on the way to "16" is not
  // a font size, and clamping mid-keystroke would fight the user.
  const [fontDraft, setFontDraft] = useState(String(settings.terminalFontSize))
  const fontIsValid = isValidFontSize(Number(fontDraft))

  const commitFontSize = (raw: string): void => {
    setFontDraft(raw)
    const value = Number(raw)
    // Rejected here as well as in Main: an unusable size must never be saved.
    if (raw !== '' && isValidFontSize(value)) onChange({ terminalFontSize: value })
  }

  return (
    <section className="settings-screen" aria-label="Settings">
      <h2>Terminal</h2>

      <label htmlFor={`${id}-shell`}>Default shell</label>
      <select
        id={`${id}-shell`}
        value={settings.defaultShellProfileId ?? ''}
        onChange={(event) =>
          onChange({
            defaultShellProfileId: event.target.value
              ? (event.target.value as ShellProfileId)
              : null
          })
        }
      >
        <option value="">First available</option>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>

      <label htmlFor={`${id}-font`}>Font size</label>
      <input
        id={`${id}-font`}
        type="number"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        value={fontDraft}
        aria-invalid={!fontIsValid}
        onChange={(event) => commitFontSize(event.target.value)}
      />
      {!fontIsValid && (
        <p className="settings-screen__error" role="alert">
          Font size must be a whole number between {MIN_FONT_SIZE} and {MAX_FONT_SIZE}.
        </p>
      )}

      <label htmlFor={`${id}-blink`}>
        <input
          id={`${id}-blink`}
          type="checkbox"
          checked={settings.terminalCursorBlink}
          onChange={(event) => onChange({ terminalCursorBlink: event.target.checked })}
        />
        Blinking cursor
      </label>

      <label htmlFor={`${id}-confirm`}>
        <input
          id={`${id}-confirm`}
          type="checkbox"
          checked={settings.confirmBeforeClosingRunningTerminal}
          onChange={(event) =>
            onChange({ confirmBeforeClosingRunningTerminal: event.target.checked })
          }
        />
        Ask before closing a running terminal
      </label>

      <StartupSettings
        restoreLastWorkspace={settings.restoreLastWorkspace}
        runStartupCommandsOnRestore={settings.runStartupCommandsOnRestore}
        onChange={onChange}
      />

      <h2>Updates</h2>

      <label htmlFor={`${id}-update-check`}>
        <input
          id={`${id}-update-check`}
          type="checkbox"
          checked={settings.checkForUpdatesOnStartup}
          onChange={(event) => onChange({ checkForUpdatesOnStartup: event.target.checked })}
        />
        Check for new versions at startup
      </label>
    </section>
  )
}
