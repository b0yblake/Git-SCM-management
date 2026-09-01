import { useId } from 'react'

export interface StartupSettingsProps {
  readonly restoreLastWorkspace: boolean
  readonly runStartupCommandsOnRestore: boolean
  readonly onChange: (patch: {
    restoreLastWorkspace?: boolean
    runStartupCommandsOnRestore?: boolean
  }) => void
}

/**
 * The two startup toggles. Purely presentational — it reports intents and never
 * touches the bridge.
 *
 * The second one carries a warning rather than a neutral label on purpose: it
 * is the switch that lets a saved `npm run deploy` run because the app started.
 */
export const StartupSettings = ({
  restoreLastWorkspace,
  runStartupCommandsOnRestore,
  onChange
}: StartupSettingsProps): React.JSX.Element => {
  const id = useId()

  return (
    <section className="startup-settings" aria-label="Startup">
      <h3>Startup</h3>

      <label htmlFor={`${id}-restore`}>
        <input
          id={`${id}-restore`}
          type="checkbox"
          checked={restoreLastWorkspace}
          onChange={(event) => onChange({ restoreLastWorkspace: event.target.checked })}
        />
        Reopen the last workspace
      </label>

      <label htmlFor={`${id}-commands`}>
        <input
          id={`${id}-commands`}
          type="checkbox"
          checked={runStartupCommandsOnRestore}
          disabled={!restoreLastWorkspace}
          onChange={(event) => onChange({ runStartupCommandsOnRestore: event.target.checked })}
        />
        Also run its startup commands
      </label>

      <p className="startup-settings__hint">
        Off by default: a command saved yesterday would otherwise run just because GitDeck started.
      </p>
    </section>
  )
}
