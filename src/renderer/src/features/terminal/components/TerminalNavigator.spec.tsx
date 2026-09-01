import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalSessionInfo } from '@shared/contracts/terminal'
import {
  createFakeGitDeckApi,
  emptyCalls,
  FAKE_PROFILES,
  type FakeGitDeckApi
} from '../../../testing/fakeGitDeckApi'
import { TerminalNavigator, type TerminalNavigatorProps } from './TerminalNavigator'

const session = (
  id: string,
  title: string,
  cwd: string,
  status: 'running' | 'exited' = 'running'
): TerminalSessionInfo => ({
  id,
  definition: { id: `term_${id}`, title, cwd, shellProfileId: 'powershell' },
  status,
  createdAt: 0
})

const TERMINALS = [
  session('a', 'Frontend', 'C:/work/web'),
  session('b', 'Tests', 'C:/work/tests'),
  session('c', 'Build', 'C:/work/build', 'exited')
]

const handlers = () => ({
  onActivate: vi.fn(),
  onClose: vi.fn(),
  onRename: vi.fn(),
  onCreate: vi.fn(),
  onCreateWithProfile: vi.fn()
})

const show = (
  overrides: Partial<TerminalNavigatorProps> = {},
  h = handlers()
): ReturnType<typeof handlers> => {
  render(
    <TerminalNavigator
      terminals={TERMINALS}
      activeId="a"
      visibleIds={['a', 'b']}
      layoutMode="columns"
      profiles={FAKE_PROFILES}
      defaultShellProfileId="powershell"
      {...h}
      {...overrides}
    />
  )
  return h
}

let api: FakeGitDeckApi

beforeEach(() => {
  api = createFakeGitDeckApi()
  api.install()
})

afterEach(() => {
  cleanup()
  api.uninstall()
})

describe('Terminal Navigator presentation', () => {
  it('shows compact sessions and pane numbers without tab semantics', () => {
    show()

    expect(screen.getByRole('complementary', { name: 'Terminal Navigator' })).toBeDefined()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByLabelText('Pane 1').textContent).toBe('1')
    expect(screen.getByLabelText('Pane 2').textContent).toBe('2')
    expect(screen.queryByLabelText('Pane 3')).toBeNull()
    expect(screen.getByText('2 visible')).toBeDefined()
  })

  it('keeps exited sessions visible and announced', () => {
    show()

    expect(screen.getByRole('button', { name: 'Build (exited)' })).toBeDefined()
  })

  it('filters by title, cwd, and shell label', () => {
    show()
    const search = screen.getByRole('searchbox', { name: 'Search terminals' })

    fireEvent.change(search, { target: { value: 'tests' } })
    expect(screen.getByRole('button', { name: 'Tests' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Frontend' })).toBeNull()

    fireEvent.change(search, { target: { value: 'PowerShell' } })
    expect(screen.getByRole('button', { name: 'Frontend' })).toBeDefined()
  })
})

describe('Terminal Navigator intents', () => {
  it('activates, closes, and creates through callbacks', () => {
    const h = show()

    fireEvent.click(screen.getByRole('button', { name: 'Tests' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close Build' }))
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))

    expect(h.onActivate).toHaveBeenCalledWith('b')
    expect(h.onClose).toHaveBeenCalledWith('c')
    expect(h.onCreate).toHaveBeenCalledOnce()
  })

  it('renames inline on double click', () => {
    const h = show()

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Frontend' }))
    const input = screen.getByLabelText('Rename Frontend')
    fireEvent.change(input, { target: { value: 'Web dev' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(h.onRename).toHaveBeenCalledExactlyOnceWith('a', 'Web dev')
  })

  it('accepts a rename request from a pane context menu', () => {
    const handled = vi.fn()
    show({ renameRequestId: 'b', onRenameRequestHandled: handled })

    const input = screen.getByLabelText('Rename Tests')
    expect(input).toBeDefined()
    expect(handled).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(handled).toHaveBeenCalledOnce()
  })

  it('never calls the bridge directly', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Tests' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close Build' }))
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))

    expect(api.calls).toEqual(emptyCalls())
  })
})
