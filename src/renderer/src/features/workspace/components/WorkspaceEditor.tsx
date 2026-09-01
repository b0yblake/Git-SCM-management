import { useId, useState } from 'react'
import type { AvailableShellProfile, TerminalDefinition } from '@shared/contracts/terminal'
import type { WorkspaceInput } from '@shared/contracts/workspace'
import { createId } from '@shared/domain/ids'
import { TerminalDefinitionEditor } from './TerminalDefinitionEditor'

export interface WorkspaceEditorProps {
  readonly initial: WorkspaceInput
  readonly profiles: readonly AvailableShellProfile[]
  readonly onSave: (input: WorkspaceInput) => void
  readonly onCancel: () => void
}

const newDefinition = (profiles: readonly AvailableShellProfile[]): TerminalDefinition => ({
  id: createId('term'),
  title: 'Terminal',
  cwd: '',
  shellProfileId: profiles[0]?.id ?? 'powershell'
})

/**
 * Drops a blank startup command rather than persisting an empty string, so
 * "no startup command" has exactly one representation on disk.
 */
const clean = (definition: TerminalDefinition): TerminalDefinition => {
  const startupCommand = definition.startupCommand?.trim()
  return {
    id: definition.id,
    title: definition.title.trim(),
    cwd: definition.cwd.trim(),
    shellProfileId: definition.shellProfileId,
    ...(startupCommand ? { startupCommand } : {})
  }
}

const problemsWith = (draft: WorkspaceInput): string[] => {
  const problems: string[] = []
  if (!draft.name.trim()) problems.push('Workspace name is required.')

  draft.terminals.forEach((terminal, index) => {
    if (!terminal.title.trim()) problems.push(`Terminal ${index + 1}: title is required.`)
    if (!terminal.cwd.trim()) problems.push(`Terminal ${index + 1}: working directory is required.`)
  })

  return problems
}

/**
 * Edits a workspace draft.
 *
 * The draft is local state, which is what makes Cancel trivially correct:
 * nothing outside this component ever sees an unsaved edit. Saving is explicit
 * — the caller decides what to do with the result.
 */
export const WorkspaceEditor = ({
  initial,
  profiles,
  onSave,
  onCancel
}: WorkspaceEditorProps): React.JSX.Element => {
  const id = useId()
  const [draft, setDraft] = useState<WorkspaceInput>(initial)
  const [problems, setProblems] = useState<readonly string[]>([])

  const updateTerminal = (index: number, patch: Partial<TerminalDefinition>): void =>
    setDraft((current) => ({
      ...current,
      terminals: current.terminals.map((terminal, position) =>
        position === index ? { ...terminal, ...patch } : terminal
      )
    }))

  const submit = (): void => {
    const found = problemsWith(draft)
    setProblems(found)
    if (found.length > 0) return

    onSave({
      ...draft,
      name: draft.name.trim(),
      terminals: draft.terminals.map(clean)
    })
  }

  return (
    <section className="workspace-editor" aria-label="Workspace editor">
      <label htmlFor={`${id}-name`}>Workspace name</label>
      <input
        id={`${id}-name`}
        value={draft.name}
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
      />

      {draft.terminals.map((terminal, index) => (
        <TerminalDefinitionEditor
          key={terminal.id}
          definition={terminal}
          position={index + 1}
          profiles={profiles}
          onChange={(patch) => updateTerminal(index, patch)}
          onRemove={() =>
            setDraft((current) => ({
              ...current,
              terminals: current.terminals.filter((_, position) => position !== index)
            }))
          }
        />
      ))}

      <button
        type="button"
        onClick={() =>
          setDraft((current) => ({
            ...current,
            terminals: [...current.terminals, newDefinition(profiles)]
          }))
        }
      >
        Add terminal
      </button>

      {problems.length > 0 && (
        <ul className="workspace-editor__problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="workspace-editor__actions">
        <button type="button" onClick={submit}>
          Save workspace
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}
