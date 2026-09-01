import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AvailableShellProfile } from '@shared/contracts/terminal'
import type { WorkspaceInput } from '@shared/contracts/workspace'
import {
  createFakeGitDeckApi,
  emptyCalls,
  FAKE_PROFILES,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { WorkspaceEditor } from './WorkspaceEditor'

let api: FakeGitDeckApi

const onSave = vi.fn()
const onCancel = vi.fn()

const DRAFT: WorkspaceInput = {
  name: 'My SaaS',
  terminals: [
    {
      id: 'term_backend',
      title: 'Backend',
      cwd: 'D:\\Projects\\my-saas\\backend',
      shellProfileId: 'git-bash',
      startupCommand: 'npm run dev'
    }
  ]
}

const show = (
  initial: WorkspaceInput = DRAFT,
  profiles: readonly AvailableShellProfile[] = FAKE_PROFILES
) =>
  render(
    <WorkspaceEditor initial={initial} profiles={profiles} onSave={onSave} onCancel={onCancel} />
  )

const saved = (): WorkspaceInput => onSave.mock.calls.at(-1)?.[0] as WorkspaceInput

const save = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Save workspace' }))
}

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
  onSave.mockClear()
  onCancel.mockClear()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('validation', () => {
  it('rejects an empty workspace name with a visible message', () => {
    show({ ...DRAFT, name: '' })

    save()

    expect(screen.getByRole('alert').textContent).toContain('Workspace name is required')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('rejects an empty title', () => {
    show()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } })

    save()

    expect(screen.getByRole('alert').textContent).toContain('title is required')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('rejects an empty working directory', () => {
    show()
    fireEvent.change(screen.getByLabelText('Working directory'), { target: { value: '' } })

    save()

    expect(screen.getByRole('alert').textContent).toContain('working directory is required')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('names the offending terminal, so the message is actionable', () => {
    show({
      ...DRAFT,
      terminals: [DRAFT.terminals[0]!, { ...DRAFT.terminals[0]!, id: 'term_2', cwd: '' }]
    })

    save()

    expect(screen.getByRole('alert').textContent).toContain('Terminal 2')
  })

  it('a startup command is optional', () => {
    show()
    fireEvent.change(screen.getByLabelText('Startup command (optional)'), { target: { value: '' } })

    save()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saved().terminals[0]).not.toHaveProperty('startupCommand')
  })

  it('trims what it saves, so a trailing space is not persisted', () => {
    show()
    fireEvent.change(screen.getByLabelText('Working directory'), { target: { value: '  C:\\a  ' } })

    save()

    expect(saved().terminals[0]?.cwd).toBe('C:\\a')
  })
})

describe('the shell list comes from detection', () => {
  it('offers exactly the profiles it was given', () => {
    show()

    const options = [...screen.getByLabelText<HTMLSelectElement>('Shell').options]
    expect(options.map((option) => option.textContent)).toEqual([
      'Git Bash',
      'Windows PowerShell',
      'Command Prompt'
    ])
  })

  /** The assertion that proves the list is not a constant inside the component. */
  it('offers a different set when detection reports a different set', () => {
    show(DRAFT, [{ id: 'wsl', label: 'WSL' }])

    const options = [...screen.getByLabelText<HTMLSelectElement>('Shell').options]
    expect(options.map((option) => option.value)).toEqual(['wsl'])
  })

  it('a new terminal defaults to the first detected shell', () => {
    show({ name: 'Empty', terminals: [] }, [{ id: 'cmd', label: 'Command Prompt' }])

    fireEvent.click(screen.getByRole('button', { name: 'Add terminal' }))
    fireEvent.change(screen.getByLabelText('Working directory'), { target: { value: 'C:\\a' } })
    save()

    expect(saved().terminals[0]?.shellProfileId).toBe('cmd')
  })
})

describe('editing the draft', () => {
  it('adds a terminal', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Add terminal' }))

    expect(screen.getAllByLabelText('Title')).toHaveLength(2)
  })

  it('edits a terminal', () => {
    show()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'API' } })
    save()

    expect(saved().terminals[0]?.title).toBe('API')
  })

  it('removes a terminal without disturbing the others', () => {
    show({
      ...DRAFT,
      terminals: [
        { ...DRAFT.terminals[0]!, id: 'term_1', title: 'Backend' },
        { ...DRAFT.terminals[0]!, id: 'term_2', title: 'Frontend' }
      ]
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove terminal 1' }))
    save()

    expect(saved().terminals.map((terminal) => terminal.title)).toEqual(['Frontend'])
  })

  it('edits the right terminal when there is more than one', () => {
    show({
      ...DRAFT,
      terminals: [
        { ...DRAFT.terminals[0]!, id: 'term_1', title: 'Backend' },
        { ...DRAFT.terminals[0]!, id: 'term_2', title: 'Frontend' }
      ]
    })

    fireEvent.change(screen.getAllByLabelText('Title')[1]!, { target: { value: 'Web' } })
    save()

    expect(saved().terminals.map((terminal) => terminal.title)).toEqual(['Backend', 'Web'])
  })

  it('keeps the workspace id, so editing is an overwrite rather than a copy', () => {
    show({ ...DRAFT, id: 'ws_saas' })

    save()

    expect(saved().id).toBe('ws_saas')
  })
})

describe('cancelling', () => {
  it('discards the draft and saves nothing', () => {
    show()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Discarded' } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})

/** The editor reports intents; the panel above it owns every IPC call. */
describe('boundary', () => {
  it('drives the whole component without touching the bridge', () => {
    show()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'API' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add terminal' }))
    save()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(api.calls).toEqual(emptyCalls())
  })
})
