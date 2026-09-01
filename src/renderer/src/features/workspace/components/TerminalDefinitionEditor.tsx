import { useId } from 'react'
import type { AvailableShellProfile, TerminalDefinition } from '@shared/contracts/terminal'

export interface TerminalDefinitionEditorProps {
  readonly definition: TerminalDefinition
  /** Only for labelling — the user counts from 1, the array from 0. */
  readonly position: number
  readonly profiles: readonly AvailableShellProfile[]
  readonly disabled?: boolean
  readonly onChange: (patch: Partial<TerminalDefinition>) => void
  readonly onRemove: () => void
}

/**
 * One terminal definition's fields. Purely presentational: it reports edits and
 * never touches IPC or a store.
 *
 * The shell list is a prop rather than a constant here, because the renderer
 * must not decide which shells exist (ARCHITECTURE.md §1) — Main detected them.
 */
export const TerminalDefinitionEditor = ({
  definition,
  position,
  profiles,
  disabled = false,
  onChange,
  onRemove
}: TerminalDefinitionEditorProps): React.JSX.Element => {
  const id = useId()

  return (
    <fieldset className="definition-editor">
      <legend>Terminal {position}</legend>

      <label htmlFor={`${id}-title`}>Title</label>
      <input
        id={`${id}-title`}
        value={definition.title}
        disabled={disabled}
        onChange={(event) => onChange({ title: event.target.value })}
      />

      <label htmlFor={`${id}-cwd`}>Working directory</label>
      <input
        id={`${id}-cwd`}
        value={definition.cwd}
        disabled={disabled}
        onChange={(event) => onChange({ cwd: event.target.value })}
      />

      <label htmlFor={`${id}-shell`}>Shell</label>
      <select
        id={`${id}-shell`}
        value={definition.shellProfileId}
        disabled={disabled}
        onChange={(event) =>
          onChange({ shellProfileId: event.target.value as TerminalDefinition['shellProfileId'] })
        }
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>

      <label htmlFor={`${id}-startup`}>Startup command (optional)</label>
      <input
        id={`${id}-startup`}
        value={definition.startupCommand ?? ''}
        disabled={disabled}
        onChange={(event) => onChange({ startupCommand: event.target.value })}
      />

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove terminal ${position}`}
      >
        Remove
      </button>
    </fieldset>
  )
}
