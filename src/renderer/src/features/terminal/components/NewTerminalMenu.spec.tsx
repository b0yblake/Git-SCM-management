import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AvailableShellProfile } from '@shared/contracts/terminal'
import {
  createFakeGitDeckApi,
  FAKE_PROFILES,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { NewTerminalMenu } from './NewTerminalMenu'

let api: FakeGitDeckApi

const handlers = () => ({ onCreate: vi.fn(), onCreateWithProfile: vi.fn() })

const show = (profiles: readonly AvailableShellProfile[] = FAKE_PROFILES, h = handlers()) => {
  render(<NewTerminalMenu profiles={profiles} defaultShellProfileId="powershell" {...h} />)
  return h
}

const openMenu = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Choose shell' }))
}

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('the list it offers', () => {
  /** The whole point of Phase 5: the UI renders detection's answer, nothing more. */
  it('renders exactly the profiles it was given, in order', () => {
    show()

    openMenu()

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Git Bash',
      'Windows PowerShell (default)',
      'Command Prompt'
    ])
  })

  it('offers nothing that was not detected', () => {
    show([{ id: 'cmd', label: 'Command Prompt' }])

    openMenu()

    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: /Git Bash/ })).toBeNull()
  })

  it('marks which profile is the default', () => {
    show()

    openMenu()

    expect(screen.getByRole('menuitem', { name: /Windows PowerShell/ }).textContent).toContain(
      '(default)'
    )
  })

  it('disables the picker when no shell was detected', () => {
    show([])

    expect(screen.getByRole('button', { name: 'Choose shell' })).toHaveProperty('disabled', true)
  })
})

describe('intents', () => {
  it('the + button opens the default shell', () => {
    const h = show()

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))

    expect(h.onCreate).toHaveBeenCalledOnce()
    expect(h.onCreateWithProfile).not.toHaveBeenCalled()
  })

  it('choosing a profile reports that profile', () => {
    const h = show()

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Git Bash' }))

    expect(h.onCreateWithProfile).toHaveBeenCalledWith('git-bash')
  })

  it('closes after a choice', () => {
    show()

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Git Bash' }))

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape without opening anything', () => {
    const h = show()

    openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(h.onCreateWithProfile).not.toHaveBeenCalled()
  })

  it('closes when clicking outside', () => {
    show()

    openMenu()
    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menu')).toBeNull()
  })
})

/** PLAN.md §16: presentational components do not call IPC. */
describe('boundary', () => {
  it('never touches the bridge', () => {
    show()

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Git Bash' }))
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))

    expect(api.calls.create).toEqual([])
    expect(api.calls.profiles).toBe(0)
    expect(api.calls.settingsUpdate).toEqual([])
  })

  it('renders no filesystem path anywhere', () => {
    show()

    openMenu()

    expect(document.body.textContent).not.toMatch(/\.exe|Program Files|C:\\/)
  })
})
